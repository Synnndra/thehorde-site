// Vercel Serverless Function — Discord Backfill (One-time knowledge extraction)
// Usage:
//   GET ?action=channels           — List all channels the bot can see
//   GET ?action=backfill&channel=ID — Backfill one channel (resumable with &after=SNOWFLAKE)
//   GET ?action=compile             — Merge all channel summaries into Drak's knowledge base
// Auth: Bearer CRON_SECRET header (same as discord-summary)
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvGet, kvSet } from '../lib/swap-utils.js';

export const config = { maxDuration: 300 };

const DISCORD_API = 'https://discord.com/api/v10';
const BATCH_SIZE = 100;          // Discord API max per request
const MESSAGES_PER_CHUNK = 200;  // Messages per Claude summarization call
const FETCH_LIMIT = 500;         // Max messages per backfill call (Sonnet extraction needs more time)

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Auth ---
    const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
    if (!CRON_SECRET || !req.headers['authorization']) {
        console.error('Backfill auth: CRON_SECRET present:', !!CRON_SECRET, 'auth header present:', !!req.headers['authorization']);
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const provided = Buffer.from(String(req.headers['authorization']).trim());
    const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
    console.error('Backfill auth: provided length:', provided.length, 'expected length:', expected.length);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // --- Env ---
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!DISCORD_BOT_TOKEN || !ANTHROPIC_API_KEY || !kvUrl || !kvToken) {
        return res.status(500).json({ error: 'Missing env: DISCORD_BOT_TOKEN, ANTHROPIC_API_KEY, KV_REST_API_URL, or KV_REST_API_TOKEN' });
    }

    const action = req.query.action;

    // ==========================================
    // ACTION: LIST CHANNELS
    // ==========================================
    if (action === 'channels') {
        const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
        });
        if (!guildsRes.ok) {
            return res.status(502).json({ error: `Failed to fetch guilds: ${guildsRes.status}` });
        }
        const guilds = await guildsRes.json();

        const allChannels = [];
        for (const guild of guilds) {
            const channelsRes = await fetch(`${DISCORD_API}/guilds/${guild.id}/channels`, {
                headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
            });
            if (!channelsRes.ok) continue;
            const channels = await channelsRes.json();
            // Text channels (0), announcement channels (5), forum channels (15)
            const textChannels = channels
                .filter(c => c.type === 0 || c.type === 5)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.type === 5 ? 'announcement' : 'text',
                    guild: guild.name,
                    guildId: guild.id
                }));
            allChannels.push(...textChannels);
        }

        // Check which ones are already backfilled
        for (const ch of allChannels) {
            const data = await kvGet(`discord:backfill:${ch.id}`, kvUrl, kvToken);
            ch.backfilled = !!(data && data.summary);
            ch.messageCount = data?.messageCount || 0;
            ch.lastMessageId = data?.lastMessageId || null;
        }

        return res.status(200).json({ channels: allChannels });
    }

    // ==========================================
    // ACTION: BACKFILL ONE CHANNEL
    // ==========================================
    if (action === 'backfill') {
        const channelId = req.query.channel;
        if (!channelId) {
            return res.status(400).json({ error: 'Missing ?channel=ID' });
        }

        // Resume support — fetch messages after this snowflake
        let after = req.query.after || '0';

        // Load cursor data (messageCount, batchCount — no summary blob loaded)
        const cursorData = await kvGet(`discord:backfill:${channelId}`, kvUrl, kvToken) || {};

        // --- Fetch all messages ---
        const allMessages = [];
        while (allMessages.length < FETCH_LIMIT) {
            const url = `${DISCORD_API}/channels/${channelId}/messages?limit=${BATCH_SIZE}&after=${after}`;
            const msgRes = await fetch(url, {
                headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
            });

            // Handle rate limiting with retry
            if (msgRes.status === 429) {
                const retryData = await msgRes.json();
                const retryAfter = (retryData.retry_after || 1) * 1000;
                console.log(`Rate limited, waiting ${retryAfter}ms...`);
                await new Promise(r => setTimeout(r, retryAfter + 500));
                continue; // Retry same request
            }

            if (!msgRes.ok) {
                const errText = await msgRes.text();
                return res.status(502).json({
                    error: `Discord API ${msgRes.status}: ${errText}`,
                    fetchedSoFar: allMessages.length
                });
            }

            const batch = await msgRes.json();
            if (batch.length === 0) break;

            // Sort oldest-first for pagination
            batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
            allMessages.push(...batch);
            after = batch[batch.length - 1].id;

            if (batch.length < BATCH_SIZE) break;

            // Delay to respect Discord rate limits (5 req/5s per route)
            await new Promise(r => setTimeout(r, 1100));
        }

        // Filter out bot messages
        const humanMessages = allMessages.filter(m => !m.author.bot);

        if (humanMessages.length === 0) {
            return res.status(200).json({ channelId, messages: 0, note: 'No human messages found' });
        }

        // --- Format messages ---
        const formattedMessages = humanMessages.map(m => {
            const date = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const name = m.author.global_name || m.author.username;
            let text = m.content || '';
            if (m.attachments?.length) {
                text += (text ? ' ' : '') + m.attachments.map(a =>
                    a.content_type?.startsWith('image') ? '[image]' : `[file: ${a.filename}]`
                ).join(' ');
            }
            if (m.embeds?.length) {
                text += (text ? ' ' : '') + m.embeds.map(e => e.title || e.description || '[embed]').join(' ');
            }
            if (m.sticker_items?.length) {
                text += (text ? ' ' : '') + m.sticker_items.map(s => `[sticker: ${s.name}]`).join(' ');
            }
            if (!text.trim()) return null;
            return `[${date}] ${name}: ${text}`;
        }).filter(Boolean);

        // --- Chunk and summarize ---
        const chunks = [];
        for (let i = 0; i < formattedMessages.length; i += MESSAGES_PER_CHUNK) {
            chunks.push(formattedMessages.slice(i, i + MESSAGES_PER_CHUNK));
        }

        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const chunkSummaries = [];

        for (const chunk of chunks) {
            const chatLog = chunk.join('\n');
            const aiRes = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4096,
                system: `Extract ALL knowledge from this Discord chat log for the MidEvils NFT community. Include:

PROJECT & TECHNICAL:
- Announcements, updates, decisions, roadmap changes
- Technical details about tools, games, blockchain, smart contracts
- Lore, story elements, character details

COMMUNITY & CULTURE:
- Inside jokes, memes, recurring bits, catchphrases
- Community events, competitions, milestones
- Partnerships, collaborations, collabs with other projects

PEOPLE & RELATIONSHIPS:
- Who is active and what they are known for
- Interpersonal dynamics: friendships, rivalries, alliances, conflicts
- Arguments, drama, and beef between members — capture both sides
- Who holds influence, who is respected, who is controversial
- Specific incidents that shaped community opinion of someone

MARKET & TRADING:
- Floor price discussions, notable sales, trading sentiment
- Who is buying, selling, accumulating, or dumping

Keep specific names, dates, numbers, and quotes when notable.
Skip only generic greetings (gm, gn) and one-word reactions.`,
                messages: [{ role: 'user', content: `Extract knowledge from this chat log (${chunk.length} messages):\n\n${chatLog}` }]
            });
            const summary = aiRes.content[0]?.text;
            if (summary) chunkSummaries.push(summary);
        }

        // --- Merge chunk summaries ---
        let finalSummary;
        if (chunkSummaries.length <= 1) {
            finalSummary = chunkSummaries[0] || 'No extractable knowledge.';
        } else {
            const mergeRes = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                system: 'Merge these Discord knowledge extracts into one deduplicated summary. Group by topic. Remove redundancy. Keep all unique facts and details.',
                messages: [{
                    role: 'user',
                    content: `Merge these ${chunkSummaries.length} extracts:\n\n${chunkSummaries.join('\n\n---\n\n')}`
                }]
            });
            finalSummary = mergeRes.content[0]?.text || chunkSummaries.join('\n\n');
        }

        // --- Save batch summary separately (no unbounded append) ---
        const batchCount = (cursorData.batchCount || 0) + 1;
        await kvSet(`discord:backfill:${channelId}:batch:${batchCount}`,
            finalSummary, kvUrl, kvToken);

        // Update cursor (no summary blob — compile-recent handles compilation)
        const totalMessages = (cursorData.messageCount || 0) + humanMessages.length;
        await kvSet(`discord:backfill:${channelId}`, {
            messageCount: totalMessages,
            lastMessageId: allMessages[allMessages.length - 1].id,
            batchCount,
            lastCompiledBatch: cursorData.lastCompiledBatch || 0,
            updatedAt: Date.now()
        }, kvUrl, kvToken);

        const needsMore = allMessages.length >= FETCH_LIMIT;
        return res.status(200).json({
            channelId,
            messagesFetched: humanMessages.length,
            totalMessages,
            batchCount,
            chunks: chunks.length,
            summaryLength: finalSummary.length,
            ...(needsMore ? {
                resumeAfter: after,
                note: `Hit ${FETCH_LIMIT} message limit. Call again with &after=${after} to continue.`
            } : { complete: true }),
            preview: finalSummary.substring(0, 500) + '...'
        });
    }

    // ==========================================
    // ACTION: COMPILE RECENT BATCHES WITH OPUS
    // ==========================================
    if (action === 'compile-recent') {
        const channelId = req.query.channel;
        if (!channelId) {
            return res.status(400).json({ error: 'Missing ?channel=ID' });
        }

        const cursorData = await kvGet(`discord:backfill:${channelId}`, kvUrl, kvToken);
        if (!cursorData || !cursorData.batchCount) {
            return res.status(200).json({ error: 'No batch data found' });
        }

        const lastCompiled = cursorData.lastCompiledBatch || 0;
        const currentBatch = cursorData.batchCount;

        if (lastCompiled >= currentBatch) {
            return res.status(200).json({ message: 'All batches already compiled', batchCount: currentBatch });
        }

        // Read uncompiled batch summaries
        const batchSummaries = [];
        for (let i = lastCompiled + 1; i <= currentBatch; i++) {
            const summary = await kvGet(`discord:backfill:${channelId}:batch:${i}`, kvUrl, kvToken);
            if (summary) {
                batchSummaries.push({ batch: i, summary: typeof summary === 'string' ? summary : JSON.stringify(summary) });
            }
        }

        if (batchSummaries.length === 0) {
            return res.status(200).json({ error: 'No uncompiled batch summaries found' });
        }

        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const batchText = batchSummaries
            .map(b => `=== Batch ${b.batch} ===\n${b.summary}`)
            .join('\n\n');

        // Read existing compiled KB (if any)
        const existingKb = await kvGet(`discord:kb:${channelId}`, kvUrl, kvToken);
        let compiledKb;

        if (existingKb?.content) {
            // Merge existing KB with new batch summaries
            const mergeRes = await anthropic.messages.create({
                model: 'claude-opus-4-6',
                max_tokens: 8192,
                system: `You are updating a knowledge base about the MidEvils NFT community Discord server. You have an existing compiled knowledge base and new batch summaries to incorporate.

Rules:
- Merge new information into the existing KB structure
- Deduplicate — don't repeat facts already in the existing KB
- ADD new facts, people, events, drama, culture that appear in the new summaries
- UPDATE existing facts if new summaries have more recent or more detailed info
- KEEP the existing KB's organizational structure
- Prioritize: People & relationships > Community culture > Project info
- Keep specific names, dates, numbers, quotes
- Maximum 5000 words`,
                messages: [{
                    role: 'user',
                    content: `EXISTING KNOWLEDGE BASE:\n${existingKb.content}\n\n---\n\nNEW BATCH SUMMARIES (${batchSummaries.length} batches):\n\n${batchText}`
                }]
            });
            compiledKb = mergeRes.content[0]?.text;
        } else {
            // First compilation — no existing KB
            const compileRes = await anthropic.messages.create({
                model: 'claude-opus-4-6',
                max_tokens: 8192,
                system: `Compile a comprehensive knowledge base from these Discord channel batch summaries. This is for an AI character named Drak (an orc war chief) who answers questions about the MidEvils NFT community and The Horde SubDAO.

PRIORITY 1 — PEOPLE (give this the most space):
- Member profiles: who they are, what they hold, how active they are
- Relationships: friendships, rivalries, alliances, conflicts between members
- Drama and beef — what happened, who was involved, how it resolved
- Who is respected, controversial, influential, or a known troll
- Notable quotes and moments that define someone's reputation

PRIORITY 2 — COMMUNITY:
- Inside jokes, memes, catchphrases, cultural references
- Events, competitions, milestones
- Trading sentiment, notable sales, accumulation patterns

PRIORITY 3 — PROJECT:
- Key announcements and decisions (brief — Drak already knows project basics)
- Tools, games, governance updates
- Lore and story elements
- Partnerships and collaborations

Deduplicate across batches. Keep specific names, dates, numbers, quotes. Maximum 5000 words.`,
                messages: [{
                    role: 'user',
                    content: `Compile from ${batchSummaries.length} batch summaries:\n\n${batchText}`
                }]
            });
            compiledKb = compileRes.content[0]?.text;
        }

        if (!compiledKb) {
            return res.status(500).json({ error: 'Compilation returned empty' });
        }

        // Save compiled KB
        await kvSet(`discord:kb:${channelId}`, {
            content: compiledKb,
            channelName: req.query.name || channelId,
            messageCount: cursorData.messageCount,
            updatedAt: Date.now()
        }, kvUrl, kvToken);

        // Update cursor — set lastCompiledBatch (explicitly exclude old summary field)
        await kvSet(`discord:backfill:${channelId}`, {
            messageCount: cursorData.messageCount,
            lastMessageId: cursorData.lastMessageId,
            batchCount: cursorData.batchCount,
            lastCompiledBatch: currentBatch,
            updatedAt: Date.now()
        }, kvUrl, kvToken);

        return res.status(200).json({
            success: true,
            batchesCompiled: batchSummaries.length,
            fromBatch: lastCompiled + 1,
            toBatch: currentBatch,
            kbLength: compiledKb.length,
            hadExistingKb: !!existingKb?.content
        });
    }

    // ==========================================
    // ACTION: COMPILE ALL INTO KNOWLEDGE BASE
    // ==========================================
    if (action === 'compile') {
        // Get all guilds and channels to find backfill data
        const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
        });
        if (!guildsRes.ok) {
            return res.status(502).json({ error: 'Failed to fetch guilds' });
        }
        const guilds = await guildsRes.json();

        const channelSummaries = [];
        for (const guild of guilds) {
            const channelsRes = await fetch(`${DISCORD_API}/guilds/${guild.id}/channels`, {
                headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
            });
            if (!channelsRes.ok) continue;
            const channels = await channelsRes.json();
            const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

            for (const channel of textChannels) {
                const data = await kvGet(`discord:backfill:${channel.id}`, kvUrl, kvToken);
                if (data && data.summary) {
                    channelSummaries.push({
                        name: channel.name,
                        summary: data.summary,
                        messageCount: data.messageCount
                    });
                }
            }
        }

        if (channelSummaries.length === 0) {
            return res.status(200).json({ error: 'No backfill data found. Run ?action=backfill&channel=ID first.' });
        }

        // Merge all channel summaries into one knowledge base
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const channelText = channelSummaries
            .map(c => `=== #${c.name} (${c.messageCount} messages) ===\n${c.summary}`)
            .join('\n\n');

        const compileRes = await anthropic.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system: `Compile a knowledge base from these Discord channel summaries. This is for an AI character named Drak (an orc war chief) who answers questions about the MidEvils NFT community and The Horde SubDAO.

PRIORITY 1 — PEOPLE (give this the most space):
- Member profiles: who they are, what they hold, how active they are
- Relationships: friendships, rivalries, alliances, conflicts between members
- Specific drama and beef — what happened, who was involved, how it resolved
- Who is respected, controversial, influential, or a known troll
- Notable quotes and moments that define someone's reputation

PRIORITY 2 — COMMUNITY:
- Inside jokes, memes, catchphrases, cultural references
- Events, competitions, milestones
- Trading sentiment, notable sales, accumulation patterns

PRIORITY 3 — PROJECT:
- Key announcements and decisions (brief — Drak already knows project basics)
- Tools, games, governance updates
- Lore and story elements
- Partnerships and collaborations

Deduplicate across channels. Keep specific names, dates, numbers, and quotes. Be concise but thorough. Maximum 5000 words.`,
            messages: [{
                role: 'user',
                content: `Compile from ${channelSummaries.length} channels (${channelSummaries.reduce((s, c) => s + c.messageCount, 0)} total messages):\n\n${channelText}`
            }]
        });

        const knowledgeBase = compileRes.content[0]?.text;
        if (!knowledgeBase) {
            return res.status(500).json({ error: 'Failed to compile knowledge base' });
        }

        await kvSet('discord:knowledge_base', {
            content: knowledgeBase,
            channelCount: channelSummaries.length,
            totalMessages: channelSummaries.reduce((s, c) => s + c.messageCount, 0),
            updatedAt: Date.now()
        }, kvUrl, kvToken);

        return res.status(200).json({
            success: true,
            channels: channelSummaries.length,
            totalMessages: channelSummaries.reduce((s, c) => s + c.messageCount, 0),
            knowledgeBaseLength: knowledgeBase.length,
            preview: knowledgeBase.substring(0, 500) + '...'
        });
    }

    return res.status(400).json({
        error: 'Missing ?action param',
        usage: {
            channels: 'GET ?action=channels — List all channels',
            backfill: 'GET ?action=backfill&channel=ID — Backfill one channel',
            compileRecent: 'GET ?action=compile-recent&channel=ID — Compile recent batches with Opus',
            compile: 'GET ?action=compile — Merge all into knowledge base'
        }
    });
}
