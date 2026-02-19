// Vercel Serverless Function — Drak Correction Detection (Cron: every 12h)
// Scans queued Drak exchanges for user corrections/disagreements, DMs owner on Discord.
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvHgetall, kvDelete } from '../lib/swap-utils.js';

const DISCORD_API = 'https://discord.com/api/v10';
const OWNER_DISCORD_ID = '445769305649446912';
const EMBED_COLOR = 0xc9a227;
const MIN_EXCHANGES = 1; // minimum queued exchanges to bother scanning

export const config = { maxDuration: 30 };

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

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const discordBotToken = process.env.DISCORD_BOT_TOKEN;

    if (!kvUrl || !kvToken || !anthropicApiKey || !discordBotToken) {
        return res.status(503).json({ error: 'Missing env vars' });
    }

    // 1. Read all queued exchanges
    const queue = await kvHgetall('drak:review_queue', kvUrl, kvToken);
    const entries = Object.values(queue);

    if (entries.length < MIN_EXCHANGES) {
        return res.status(200).json({ status: 'empty', count: 0 });
    }

    // 2. Format exchanges for Haiku
    const exchangeList = entries.map((e, i) => (
        `[${i + 1}] User (${e.wallet?.slice(0, 8) || 'unknown'}): ${e.userMsg}\nDrak: ${e.drakReply}`
    )).join('\n\n');

    // 3. Send to Haiku for classification
    const client = new Anthropic({ apiKey: anthropicApiKey });
    const classification = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content: `You are reviewing conversations between users and an AI assistant called "Drak" (an orc advisor for an NFT community). Your job is to identify exchanges where the user is correcting, disagreeing with, or questioning the accuracy of Drak's response.

Look for patterns like:
- "That's wrong" / "Actually..." / "No, it's..."
- Providing a different number, date, or fact than what Drak said
- Questioning whether Drak's information is up to date
- Pointing out something Drak missed or got backwards

Do NOT flag:
- Simple follow-up questions
- Users expressing opinions (like/dislike)
- Casual conversation or jokes
- Users asking for clarification (not correcting)

Here are the exchanges:

${exchangeList}

Return a JSON array of flagged exchanges. For each, include:
- "index": the exchange number (1-based)
- "reason": a brief explanation of what the user is correcting

If no exchanges contain corrections, return an empty array: []

Return ONLY the JSON array, no other text.`
        }]
    });

    let flagged = [];
    try {
        const text = classification.content[0]?.text?.trim() || '[]';
        flagged = JSON.parse(text);
    } catch {
        console.error('Failed to parse Haiku response:', classification.content[0]?.text);
        // Clear queue anyway to avoid re-processing bad data
        await kvDelete('drak:review_queue', kvUrl, kvToken).catch(() => {});
        return res.status(200).json({ status: 'parse_error', raw: classification.content[0]?.text });
    }

    // 4. Clear the queue
    await kvDelete('drak:review_queue', kvUrl, kvToken).catch(() => {});

    if (!Array.isArray(flagged) || flagged.length === 0) {
        return res.status(200).json({ status: 'clean', scanned: entries.length, flagged: 0 });
    }

    // 5. DM owner on Discord with flagged exchanges
    const fields = flagged.slice(0, 10).map(f => {
        const entry = entries[f.index - 1];
        if (!entry) return null;
        return {
            name: `User (${entry.wallet?.slice(0, 8) || '?'}...)`,
            value: `**User:** ${entry.userMsg.slice(0, 200)}\n**Drak:** ${entry.drakReply.slice(0, 200)}\n**Flag:** ${f.reason}`,
            inline: false
        };
    }).filter(Boolean);

    if (fields.length === 0) {
        return res.status(200).json({ status: 'no_valid_flags', scanned: entries.length });
    }

    try {
        // Create DM channel
        const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${discordBotToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient_id: OWNER_DISCORD_ID })
        });
        const dmChannel = await dmRes.json();

        if (!dmChannel.id) {
            console.error('Failed to create DM channel:', dmChannel);
            return res.status(500).json({ error: 'Failed to create DM channel' });
        }

        // Send embed
        await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${discordBotToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [{
                    title: `Drak Corrections Detected (${flagged.length})`,
                    description: `Scanned ${entries.length} exchanges, ${flagged.length} flagged.`,
                    color: EMBED_COLOR,
                    fields,
                    timestamp: new Date().toISOString()
                }]
            })
        });

        return res.status(200).json({ status: 'notified', scanned: entries.length, flagged: flagged.length });
    } catch (err) {
        console.error('Discord DM error:', err);
        return res.status(500).json({ error: 'Failed to send Discord DM' });
    }
}
