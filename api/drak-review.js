// Vercel Serverless Function — Drak Correction Detection (Cron: every 12h)
// Scans queued Drak exchanges for user corrections/disagreements AND contradictions against KB facts.
import { timingSafeEqual, randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvHgetall, kvDelete, kvHset } from '../lib/swap-utils.js';

const CORRECTIONS_KEY = 'drak:corrections';
const MIN_EXCHANGES = 1; // minimum queued exchanges to bother scanning

export const config = { maxDuration: 30 };

function parseHaikuJson(text) {
    let cleaned = (text || '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    return JSON.parse(cleaned);
}

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

    // 1. Read queued exchanges + KB facts in parallel
    const [queue, kbFacts] = await Promise.all([
        kvHgetall('drak:review_queue', kvUrl, kvToken),
        kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null)
    ]);
    const entries = Object.values(queue);

    if (entries.length < MIN_EXCHANGES) {
        return res.status(200).json({ status: 'empty', count: 0 });
    }

    // 2. Format exchanges for Haiku
    const exchangeList = entries.map((e, i) => (
        `[${i + 1}] User (${e.wallet?.slice(0, 8) || 'unknown'}): ${e.userMsg}\nDrak: ${e.drakReply}`
    )).join('\n\n');

    // 3. Build KB facts string for contradiction check (text only, cap at 3000 chars)
    let factsText = '';
    if (kbFacts && Object.keys(kbFacts).length > 0) {
        const facts = Object.values(kbFacts)
            .filter(f => f.text)
            .map(f => `- [${f.category || 'general'}] ${f.text}`);
        factsText = facts.join('\n').slice(0, 3000);
    }

    // 4. Run both checks in parallel
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const correctionPromise = client.messages.create({
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

    // Only run fact-check if we have KB facts
    const contradictionPromise = factsText ? client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content: `You are a fact-checker for an AI assistant called "Drak" (an orc advisor for the MidEvils NFT community). Below are KNOWN FACTS from the admin knowledge base, followed by recent Drak responses. Your job is to flag any Drak response that CONTRADICTS a known fact.

KNOWN FACTS:
${factsText}

DRAK RESPONSES TO CHECK:
${exchangeList}

Flag responses where Drak states something that directly contradicts a known fact above. Be strict — only flag clear factual contradictions, not differences in tone or phrasing.

Do NOT flag:
- Drak saying "I don't know" (that's fine)
- Opinions or advice (subjective, not factual)
- Information that isn't covered by the known facts
- Minor wording differences that don't change the meaning

Return a JSON array. For each contradiction, include:
- "index": the exchange number (1-based)
- "reason": what Drak said wrong and which fact it contradicts

If no contradictions found, return an empty array: []

Return ONLY the JSON array, no other text.`
        }]
    }) : Promise.resolve(null);

    const [correctionResult, contradictionResult] = await Promise.all([
        correctionPromise, contradictionPromise
    ]);

    // 5. Parse results
    let userFlagged = [];
    try {
        userFlagged = parseHaikuJson(correctionResult.content[0]?.text);
    } catch {
        console.error('Failed to parse correction response:', correctionResult.content[0]?.text);
    }

    let factFlagged = [];
    if (contradictionResult) {
        try {
            factFlagged = parseHaikuJson(contradictionResult.content[0]?.text);
        } catch {
            console.error('Failed to parse contradiction response:', contradictionResult.content[0]?.text);
        }
    }

    if (!Array.isArray(userFlagged)) userFlagged = [];
    if (!Array.isArray(factFlagged)) factFlagged = [];

    const totalFlagged = userFlagged.length + factFlagged.length;

    // If both parses failed completely, don't clear queue
    if (correctionResult.content[0]?.text && !userFlagged.length && !factFlagged.length) {
        // Parsed successfully but found nothing — that's fine, clear queue
    }

    // 6. Clear the queue
    await kvDelete('drak:review_queue', kvUrl, kvToken).catch(() => {});

    if (totalFlagged === 0) {
        return res.status(200).json({ status: 'clean', scanned: entries.length, flagged: 0 });
    }

    // 7. Save flagged items to KV for admin review
    let saved = 0;

    for (const f of userFlagged.slice(0, 10)) {
        const entry = entries[f.index - 1];
        if (!entry) continue;
        const id = 'corr_' + randomBytes(8).toString('hex');
        await kvHset(CORRECTIONS_KEY, id, {
            id,
            type: 'user_correction',
            userMsg: entry.userMsg,
            drakReply: entry.drakReply,
            wallet: entry.wallet || null,
            reason: f.reason,
            flaggedAt: Date.now()
        }, kvUrl, kvToken);
        saved++;
    }

    for (const f of factFlagged.slice(0, 10)) {
        const entry = entries[f.index - 1];
        if (!entry) continue;
        const id = 'corr_' + randomBytes(8).toString('hex');
        await kvHset(CORRECTIONS_KEY, id, {
            id,
            type: 'fact_contradiction',
            userMsg: entry.userMsg,
            drakReply: entry.drakReply,
            wallet: entry.wallet || null,
            reason: f.reason,
            flaggedAt: Date.now()
        }, kvUrl, kvToken);
        saved++;
    }

    return res.status(200).json({
        status: 'saved',
        scanned: entries.length,
        userCorrections: userFlagged.length,
        factContradictions: factFlagged.length,
        saved
    });
}
