// Vercel Serverless Function — Drak Correction Detection (Cron: every 12h)
// Scans queued Drak exchanges for user corrections/disagreements, saves to drak:corrections for admin review.
import { timingSafeEqual, randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvHgetall, kvDelete, kvHset } from '../lib/swap-utils.js';

const CORRECTIONS_KEY = 'drak:corrections';
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

    if (!kvUrl || !kvToken || !anthropicApiKey) {
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
        let text = classification.content[0]?.text?.trim() || '[]';
        // Strip markdown code fences if Haiku wraps the JSON
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
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

    // 5. Save flagged corrections to KV for admin review
    let saved = 0;
    for (const f of flagged.slice(0, 10)) {
        const entry = entries[f.index - 1];
        if (!entry) continue;

        const id = 'corr_' + randomBytes(8).toString('hex');
        await kvHset(CORRECTIONS_KEY, id, {
            id,
            userMsg: entry.userMsg,
            drakReply: entry.drakReply,
            wallet: entry.wallet || null,
            reason: f.reason,
            flaggedAt: Date.now()
        }, kvUrl, kvToken);
        saved++;
    }

    return res.status(200).json({ status: 'saved', scanned: entries.length, flagged: flagged.length, saved });
}
