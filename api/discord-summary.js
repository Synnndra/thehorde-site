// Vercel Serverless Function — Discord Daily Summary (Cron: 9 PM PST)
// Reads the last 24h of messages from configured channels, summarizes with Claude, posts embeds.
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvSet } from '../lib/swap-utils.js';

const DISCORD_API = 'https://discord.com/api/v10';
const EMBED_COLOR = 0xc9a227; // gold, matches site theme
const MIN_MESSAGES = 5;       // skip channels with fewer messages
const MAX_MESSAGES = 500;     // cap per channel to stay within limits
const BATCH_SIZE = 100;       // Discord API max per request

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const dryRun = req.query.preview === 'true';

    // --- Auth: Vercel Cron bearer token ---
    const CRON_SECRET = process.env.CRON_SECRET;
    if (!CRON_SECRET || !req.headers['authorization']) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const provided = Buffer.from(String(req.headers['authorization']));
    const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // --- Env vars ---
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const channelsCsv = process.env.DISCORD_SUMMARY_CHANNELS;
    const postChannelId = process.env.DISCORD_SUMMARY_POST_CHANNEL || '1471023225923440662';

    if (!DISCORD_BOT_TOKEN || !ANTHROPIC_API_KEY || !channelsCsv) {
        return res.status(500).json({ error: 'Missing env: DISCORD_BOT_TOKEN, ANTHROPIC_API_KEY, or DISCORD_SUMMARY_CHANNELS' });
    }

    const channelIds = channelsCsv.split(',').map(id => id.trim()).filter(Boolean);
    if (channelIds.length === 0) {
        return res.status(400).json({ error: 'No channel IDs configured' });
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' });
    const weeklyOnly = req.query.weeklyPreview === 'true' || req.query.weeklyPost === 'true';

    // Discord snowflake for 24 hours ago
    const twentyFourHoursAgo = Date.now() - 86400000;
    const afterSnowflake = String((BigInt(twentyFourHoursAgo) - 1420070400000n) << 22n);

    const results = { channelsSummarized: 0, channelsSkipped: 0, errors: [] };

    for (const channelId of (weeklyOnly ? [] : channelIds)) {
        try {
            // --- Fetch messages (paginate up to MAX_MESSAGES) ---
            let allMessages = [];
            let after = afterSnowflake;

            while (allMessages.length < MAX_MESSAGES) {
                const url = `${DISCORD_API}/channels/${channelId}/messages?limit=${BATCH_SIZE}&after=${after}`;
                const msgRes = await fetch(url, {
                    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
                });

                if (!msgRes.ok) {
                    const errText = await msgRes.text();
                    throw new Error(`Discord API ${msgRes.status}: ${errText}`);
                }

                const batch = await msgRes.json();
                if (batch.length === 0) break;

                // Discord returns newest-first, sort by ID ascending for pagination
                batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
                allMessages = allMessages.concat(batch);
                after = batch[batch.length - 1].id;

                if (batch.length < BATCH_SIZE) break;
            }

            // Filter out bot messages
            const humanMessages = allMessages.filter(m => !m.author.bot);

            if (humanMessages.length < MIN_MESSAGES) {
                console.log(`Channel ${channelId}: only ${humanMessages.length} messages, skipping`);
                results.channelsSkipped++;
                continue;
            }

            // --- Format chat log ---
            const chatLog = humanMessages.map(m => {
                const ts = new Date(m.timestamp).toLocaleTimeString('en-US', {
                    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit'
                });
                const name = m.author.global_name || m.author.username;
                let text = m.content || '';
                // Include attachment info
                if (m.attachments?.length) {
                    const types = m.attachments.map(a => a.content_type?.startsWith('image') ? '[image]' : `[file: ${a.filename}]`);
                    text += (text ? ' ' : '') + types.join(' ');
                }
                // Include embed titles/descriptions
                if (m.embeds?.length) {
                    const embedText = m.embeds.map(e => e.title || e.description || '[embed]').join(' ');
                    text += (text ? ' ' : '') + embedText;
                }
                // Include sticker names
                if (m.sticker_items?.length) {
                    text += (text ? ' ' : '') + m.sticker_items.map(s => `[sticker: ${s.name}]`).join(' ');
                }
                if (!text.trim()) return null; // skip completely empty messages
                return `[${ts}] ${name}: ${text}`;
            }).filter(Boolean).join('\n');

            // --- Summarize with Claude Sonnet ---
            const aiRes = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1024,
                system: 'Summarize today\'s Discord chat. Focus on WHAT was discussed — the actual topics, opinions, jokes, debates, news, and ideas. Mention who said notable things but prioritize the content over listing names. Highlight key topics, decisions, questions, and memorable moments. Keep it under 500 words. Be casual and match the community vibe. Do not use markdown headers — just plain text with line breaks between sections.',
                messages: [{
                    role: 'user',
                    content: `Here is today's chat log (${humanMessages.length} messages):\n\n${chatLog}`
                }]
            });

            const summary = aiRes.content[0]?.text;
            if (!summary) {
                throw new Error('Empty response from Claude');
            }

            // --- Post embed to channel (or return preview) ---
            const embedPayload = {
                content: '⚔️ **The Daily Grind:** Here\'s what went down in BST since yesterday.',
                embeds: [{
                    title: `Daily Recap — ${dateStr}`,
                    description: summary,
                    color: EMBED_COLOR
                }]
            };

            if (dryRun) {
                return res.status(200).json({ preview: true, channelId, messageCount: humanMessages.length, embed: embedPayload });
            }

            const postRes = await fetch(`${DISCORD_API}/channels/${postChannelId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(embedPayload)
            });

            if (!postRes.ok) {
                const errText = await postRes.text();
                throw new Error(`Discord post failed ${postRes.status}: ${errText}`);
            }

            // Save summary to KV for Orc Advisor context
            const kvUrl = process.env.KV_REST_API_URL;
            const kvToken = process.env.KV_REST_API_TOKEN;
            if (kvUrl && kvToken) {
                await kvSet('discord:daily_summary', {
                    date: dateStr,
                    summary: summary,
                    messageCount: humanMessages.length,
                    updatedAt: Date.now()
                }, kvUrl, kvToken);
            }

            console.log(`Channel ${channelId}: summarized ${humanMessages.length} messages`);
            results.channelsSummarized++;

        } catch (err) {
            console.error(`Channel ${channelId} error:`, err.message);
            results.errors.push({ channelId, error: err.message });
        }
    }

    // --- Sunday: Weekly Top 5 Contributors ---
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const isSunday = pstNow.getDay() === 0;

    if (isSunday || weeklyOnly) {
        try {
            const CONTRIBUTOR_CHANNELS = [
                '1408631977061650594', // mid-chat
                '1408632599441834248', // midevils-bst
                '1405392744272232459', // announcements
                '1438567217787830333', // the-horde
            ];

            const sevenDaysAgo = Date.now() - 7 * 86400000;
            const weekSnowflake = String((BigInt(sevenDaysAgo) - 1420070400000n) << 22n);
            const counts = {};

            for (const chId of CONTRIBUTOR_CHANNELS) {
                let after = weekSnowflake;
                while (true) {
                    const url = `${DISCORD_API}/channels/${chId}/messages?limit=${BATCH_SIZE}&after=${after}`;
                    const msgRes = await fetch(url, {
                        headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
                    });
                    if (!msgRes.ok) {
                        console.error(`Weekly fetch ${chId}: ${msgRes.status}`);
                        break;
                    }

                    const batch = await msgRes.json();
                    if (batch.length === 0) break;

                    batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
                    for (const m of batch) {
                        if (m.author.bot) continue;
                        const name = m.author.global_name || m.author.username;
                        counts[name] = (counts[name] || 0) + 1;
                    }

                    after = batch[batch.length - 1].id;
                    if (batch.length < BATCH_SIZE) break;
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            const totalMessages = Object.values(counts).reduce((a, b) => a + b, 0);
            const top5 = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (top5.length > 0) {
                const leaderboard = top5.map(([name, count], i) => {
                    const pct = ((count / totalMessages) * 100).toFixed(1);
                    return `${i + 1}. **${name}** — ${count.toLocaleString()} (${pct}%)`;
                }).join('\n');

                const weekStart = new Date(sevenDaysAgo).toLocaleDateString('en-US', {
                    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric'
                });
                const weekEnd = pstNow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                const weeklyEmbed = {
                    content: '\uD83C\uDFC6 **Weekly Top 5 Contributors**',
                    embeds: [{
                        title: `Top Contributors — ${weekStart} to ${weekEnd}`,
                        description: leaderboard + `\n\n*${totalMessages.toLocaleString()} total messages across ${CONTRIBUTOR_CHANNELS.length} channels*`,
                        color: EMBED_COLOR
                    }]
                };

                if (dryRun || req.query.weeklyPreview === 'true') {
                    return res.status(200).json({
                        preview: true,
                        weekly: true,
                        top5: top5.map(([name, count]) => ({ name, count })),
                        totalMessages,
                        embed: weeklyEmbed
                    });
                }

                const postRes = await fetch(`${DISCORD_API}/channels/${postChannelId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(weeklyEmbed)
                });

                if (!postRes.ok) {
                    const errText = await postRes.text();
                    console.error(`Weekly embed post failed ${postRes.status}: ${errText}`);
                    results.errors.push({ weekly: true, error: `Post failed ${postRes.status}: ${errText}` });
                } else {
                    results.weeklyPosted = true;
                    results.weeklyTop5 = top5.map(([name, count]) => ({ name, count }));
                }
            }
        } catch (err) {
            console.error('Weekly contributors error:', err.message);
            results.errors.push({ weekly: true, error: err.message });
        }
    }

    return res.status(200).json({ success: true, ...results });
}
