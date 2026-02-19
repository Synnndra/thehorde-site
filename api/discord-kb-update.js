// Vercel Serverless Function — Daily Discord Knowledge Base Update
// Fetches new messages from tracked channels, summarizes, and updates Drak's KB
// Triggered by Vercel cron (daily) or manually with CRON_SECRET auth
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvGet, kvSet } from '../lib/swap-utils.js';

export const config = { maxDuration: 300 };

const DISCORD_API = 'https://discord.com/api/v10';
const BATCH_SIZE = 100;
const MESSAGES_PER_CHUNK = 200;
const FETCH_LIMIT = 1000; // Per channel per run

// Channels to keep updated
const TRACKED_CHANNELS = [
    { id: '1408632599441834248', name: 'midevils-bst' },
    { id: '1408631977061650594', name: 'mid-chat' },
    { id: '1405392744272232459', name: 'announcements' },
    { id: '1438567217787830333', name: 'the-horde' },
];

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Auth (same as other cron endpoints) ---
    const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
    const authHeader = req.headers['authorization'] || '';
    if (!CRON_SECRET || !authHeader) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const provided = Buffer.from(String(authHeader).trim());
    const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!DISCORD_BOT_TOKEN || !ANTHROPIC_API_KEY || !kvUrl || !kvToken) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const results = [];

    // --- Process each channel ---
    for (const channel of TRACKED_CHANNELS) {
        const channelResult = { channel: channel.name, id: channel.id };

        try {
            // Get last known position
            const backfillData = await kvGet(`discord:backfill:${channel.id}`, kvUrl, kvToken);
            let after = backfillData?.lastMessageId || '0';
            channelResult.resumeFrom = after;

            // Fetch new messages since last position
            const allMessages = [];
            while (allMessages.length < FETCH_LIMIT) {
                const url = `${DISCORD_API}/channels/${channel.id}/messages?limit=${BATCH_SIZE}&after=${after}`;
                const msgRes = await fetch(url, {
                    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
                });

                if (msgRes.status === 429) {
                    const retryData = await msgRes.json();
                    const retryAfter = (retryData.retry_after || 1) * 1000;
                    await new Promise(r => setTimeout(r, retryAfter + 500));
                    continue;
                }

                if (!msgRes.ok) {
                    channelResult.error = `Discord API ${msgRes.status}`;
                    break;
                }

                const batch = await msgRes.json();
                if (batch.length === 0) break;

                batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
                allMessages.push(...batch);
                after = batch[batch.length - 1].id;

                if (batch.length < BATCH_SIZE) break;
                await new Promise(r => setTimeout(r, 1100));
            }

            if (channelResult.error) {
                results.push(channelResult);
                continue;
            }

            const humanMessages = allMessages.filter(m => !m.author.bot);
            channelResult.newMessages = humanMessages.length;

            if (humanMessages.length === 0) {
                channelResult.status = 'no new messages';
                results.push(channelResult);
                continue;
            }

            // Format messages
            const formatted = humanMessages.map(m => {
                const date = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const name = m.author.global_name || m.author.username;
                let text = m.content || '';
                if (m.attachments?.length) text += (text ? ' ' : '') + m.attachments.map(a => a.content_type?.startsWith('image') ? '[image]' : `[file: ${a.filename}]`).join(' ');
                if (m.embeds?.length) text += (text ? ' ' : '') + m.embeds.map(e => e.title || e.description || '[embed]').join(' ');
                if (m.sticker_items?.length) text += (text ? ' ' : '') + m.sticker_items.map(s => `[sticker: ${s.name}]`).join(' ');
                if (!text.trim()) return null;
                return `[${date}] ${name}: ${text}`;
            }).filter(Boolean);

            if (formatted.length === 0) {
                channelResult.status = 'no extractable content';
                results.push(channelResult);
                continue;
            }

            // Chunk and summarize new messages with Haiku
            const chunks = [];
            for (let i = 0; i < formatted.length; i += MESSAGES_PER_CHUNK) {
                chunks.push(formatted.slice(i, i + MESSAGES_PER_CHUNK));
            }

            const chunkSummaries = [];
            for (const chunk of chunks) {
                const aiRes = await anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
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
                    messages: [{ role: 'user', content: `Extract knowledge from this chat log (${chunk.length} messages):\n\n${chunk.join('\n')}` }]
                });
                const summary = aiRes.content[0]?.text;
                if (summary) chunkSummaries.push(summary);
            }

            let newSummary = chunkSummaries.length <= 1
                ? (chunkSummaries[0] || '')
                : (await anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 4096,
                    system: 'Merge these Discord knowledge extracts into one deduplicated summary. Group by topic. Remove redundancy. Keep all unique facts and details.',
                    messages: [{ role: 'user', content: `Merge these ${chunkSummaries.length} extracts:\n\n${chunkSummaries.join('\n\n---\n\n')}` }]
                })).content[0]?.text || chunkSummaries.join('\n\n');

            // Update per-channel KB — merge new knowledge into existing KB
            const existingKb = await kvGet(`discord:kb:${channel.id}`, kvUrl, kvToken);
            let updatedKb;

            if (existingKb?.content) {
                const mergeRes = await anthropic.messages.create({
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 4096,
                    system: `Update this knowledge base with new information from recent Discord messages. Rules:
- Add new facts, events, announcements, and details
- Update any outdated information with newer data
- Remove duplicates
- Keep the same organizational structure
- Maximum 3000 words`,
                    messages: [{ role: 'user', content: `Existing knowledge base:\n\n${existingKb.content}\n\n---\n\nNew information to merge in:\n\n${newSummary}` }]
                });
                updatedKb = mergeRes.content[0]?.text || existingKb.content;
            } else {
                updatedKb = newSummary;
            }

            // Save updated per-channel KB
            const totalMessages = (backfillData?.messageCount || 0) + humanMessages.length;
            await kvSet(`discord:kb:${channel.id}`, {
                content: updatedKb,
                channelName: channel.name,
                messageCount: totalMessages,
                updatedAt: Date.now()
            }, kvUrl, kvToken);

            // Update backfill cursor
            await kvSet(`discord:backfill:${channel.id}`, {
                summary: '', // Don't need the raw summary anymore — it's compiled into KB
                messageCount: totalMessages,
                lastMessageId: allMessages[allMessages.length - 1].id,
                updatedAt: Date.now()
            }, kvUrl, kvToken);

            channelResult.status = 'updated';
            channelResult.totalMessages = totalMessages;
            channelResult.kbLength = updatedKb.length;
            channelResult.hasMore = allMessages.length >= FETCH_LIMIT;
        } catch (err) {
            channelResult.error = err.message;
        }

        results.push(channelResult);
    }

    // --- Merge all per-channel KBs into final knowledge base ---
    try {
        const kbParts = [];
        for (const channel of TRACKED_CHANNELS) {
            const kb = await kvGet(`discord:kb:${channel.id}`, kvUrl, kvToken);
            if (kb?.content) {
                kbParts.push({ name: channel.name, content: kb.content });
            }
        }

        if (kbParts.length > 1) {
            const channelList = kbParts.map(p => `=== #${p.name} ===\n${p.content}`).join('\n\n');
            const mergeRes = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 8192,
                system: `Merge these Discord channel knowledge bases into ONE knowledge base for an AI character named Drak (an orc war chief) who answers questions about the MidEvils NFT community and The Horde SubDAO.

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

Deduplicate across channels. Keep specific names, dates, numbers, and quotes. Maximum 5000 words.`,
                messages: [{ role: 'user', content: `Merge these ${kbParts.length} channel knowledge bases:\n\n${channelList}` }]
            });

            const merged = mergeRes.content[0]?.text;
            if (merged) {
                await kvSet('discord:knowledge_base', {
                    content: merged,
                    channelCount: kbParts.length,
                    channels: kbParts.map(p => p.name),
                    updatedAt: Date.now()
                }, kvUrl, kvToken);
            }
        } else if (kbParts.length === 1) {
            await kvSet('discord:knowledge_base', {
                content: kbParts[0].content,
                channelCount: 1,
                channels: [kbParts[0].name],
                updatedAt: Date.now()
            }, kvUrl, kvToken);
        }
    } catch (err) {
        results.push({ merge: 'failed', error: err.message });
    }

    return res.status(200).json({
        success: true,
        updatedAt: new Date().toISOString(),
        channels: results
    });
}
