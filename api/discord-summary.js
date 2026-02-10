// Vercel Serverless Function — Discord Daily Summary (Cron: 9 PM PST)
// Reads the last 24h of messages from configured channels, summarizes with Claude, posts embeds.
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const DISCORD_API = 'https://discord.com/api/v10';
const EMBED_COLOR = 0xc9a227; // gold, matches site theme
const MIN_MESSAGES = 5;       // skip channels with fewer messages
const MAX_MESSAGES = 500;     // cap per channel to stay within limits
const BATCH_SIZE = 100;       // Discord API max per request

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

    // Discord snowflake for 24 hours ago
    const twentyFourHoursAgo = Date.now() - 86400000;
    const afterSnowflake = String((BigInt(twentyFourHoursAgo) - 1420070400000n) << 22n);

    const results = { channelsSummarized: 0, channelsSkipped: 0, errors: [] };

    for (const channelId of channelIds) {
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
                return `[${ts}] ${name}: ${m.content}`;
            }).join('\n');

            // --- Summarize with Claude Haiku ---
            const aiRes = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: 'Summarize today\'s Discord chat concisely. Highlight key topics, decisions, questions, and notable moments. Keep it under 500 words. Be casual and match the community vibe. Do not use markdown headers — just plain text with line breaks between sections.',
                messages: [{
                    role: 'user',
                    content: `Here is today's chat log (${humanMessages.length} messages):\n\n${chatLog}`
                }]
            });

            const summary = aiRes.content[0]?.text;
            if (!summary) {
                throw new Error('Empty response from Claude');
            }

            // --- Post embed to channel ---
            const embedPayload = {
                content: '⚔️ **The Daily Grind:** Here\'s what went down in BST since yesterday.',
                embeds: [{
                    title: `Daily Recap — ${dateStr}`,
                    description: summary,
                    color: EMBED_COLOR
                }]
            };

            const postRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
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

            console.log(`Channel ${channelId}: summarized ${humanMessages.length} messages`);
            results.channelsSummarized++;

        } catch (err) {
            console.error(`Channel ${channelId} error:`, err.message);
            results.errors.push({ channelId, error: err.message });
        }
    }

    return res.status(200).json({ success: true, ...results });
}
