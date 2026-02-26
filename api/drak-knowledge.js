// Vercel Serverless Function - Admin Drak Knowledge Base Management
import { timingSafeEqual } from 'crypto';
import { getClientIp, isRateLimitedKV, kvGet, kvSet, kvHset, kvHget, kvHdel, kvHgetall } from '../lib/swap-utils.js';
import { randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const KNOWLEDGE_KEY = 'drak:knowledge';
const CATEGORIES = ['project', 'community', 'market', 'lore', 'general', 'correction'];
const CORRECTIONS_KEY = 'drak:corrections';
const PROMPT_RULES_KEY = 'drak:prompt_rules';

function parseSuggestResponse(raw, existingRules) {
    const conflictMatch = raw.match(/^CONFLICT:\s*(\d+)\s*\n\s*SUGGESTED:\s*(.+)/s);
    if (conflictMatch) {
        const conflictIdx = parseInt(conflictMatch[1], 10) - 1;
        const suggestedRule = conflictMatch[2].trim();
        const conflicting = existingRules[conflictIdx];
        return {
            suggestedRule,
            conflict: conflicting ? { ruleId: conflicting.id, existingRule: conflicting.rule } : null
        };
    }
    return { suggestedRule: raw, conflict: null };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rate limit: 5 per minute per IP
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'drak-knowledge', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        const { secret, mode, factId, text, category } = req.body;

        // Auth
        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(ADMIN_SECRET);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Mode: list all facts
        if (mode === 'list') {
            const allFacts = await kvHgetall(KNOWLEDGE_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
            const facts = Object.values(allFacts || {});
            facts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return res.status(200).json({ facts });
        }

        // Mode: add a new fact
        if (mode === 'add') {
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'Fact text is required' });
            }
            if (text.length > 500) {
                return res.status(400).json({ error: 'Fact text must be 500 characters or less' });
            }
            const cat = CATEGORIES.includes(category) ? category : 'general';
            const id = 'fact_' + randomBytes(16).toString('hex');

            const { imageBase64 } = req.body;
            const fact = {
                id,
                text: text.trim(),
                category: cat,
                createdAt: Date.now()
            };

            // Optional image (max ~500KB base64 ≈ ~375KB file)
            if (imageBase64 && typeof imageBase64 === 'string') {
                if (imageBase64.length > 2800000) {
                    return res.status(400).json({ error: 'Image too large (max ~2MB)' });
                }
                fact.imageBase64 = imageBase64;
            }

            await kvHset(KNOWLEDGE_KEY, id, fact, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, fact });
        }

        // Mode: edit an existing fact
        if (mode === 'edit') {
            if (!factId) {
                return res.status(400).json({ error: 'factId required' });
            }
            const existing = await kvHget(KNOWLEDGE_KEY, factId, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!existing) {
                return res.status(404).json({ error: 'Fact not found' });
            }

            if (text !== undefined) {
                if (typeof text !== 'string' || !text.trim()) {
                    return res.status(400).json({ error: 'Fact text cannot be empty' });
                }
                if (text.length > 500) {
                    return res.status(400).json({ error: 'Fact text must be 500 characters or less' });
                }
                existing.text = text.trim();
            }
            if (category !== undefined) {
                if (CATEGORIES.includes(category)) {
                    existing.category = category;
                }
            }
            const { imageBase64, removeImage } = req.body;
            if (removeImage) {
                delete existing.imageBase64;
            } else if (imageBase64 && typeof imageBase64 === 'string') {
                if (imageBase64.length > 2800000) {
                    return res.status(400).json({ error: 'Image too large (max ~2MB)' });
                }
                existing.imageBase64 = imageBase64;
            }
            existing.updatedAt = Date.now();

            await kvHset(KNOWLEDGE_KEY, factId, existing, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, fact: existing });
        }

        // Mode: delete a fact
        if (mode === 'delete') {
            if (!factId) {
                return res.status(400).json({ error: 'factId required' });
            }
            await kvHdel(KNOWLEDGE_KEY, factId, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true });
        }

        // Mode: list research accounts
        if (mode === 'list-accounts') {
            const accounts = await kvGet('drak:research_accounts', KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => null);
            return res.status(200).json({ accounts: Array.isArray(accounts) ? accounts : [] });
        }

        // Mode: set research accounts
        if (mode === 'set-accounts') {
            const { accounts } = req.body;
            if (!Array.isArray(accounts)) {
                return res.status(400).json({ error: 'accounts must be an array of handles' });
            }
            const cleaned = accounts
                .map(h => String(h).trim().replace(/^@/, ''))
                .filter(h => h.length > 0 && h.length <= 50);
            if (cleaned.length > 50) {
                return res.status(400).json({ error: 'Max 50 accounts' });
            }
            await kvSet('drak:research_accounts', cleaned, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, accounts: cleaned });
        }

        // Mode: list pending corrections
        if (mode === 'list-corrections') {
            const all = await kvHgetall(CORRECTIONS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
            const corrections = Object.values(all || {});
            corrections.sort((a, b) => (b.flaggedAt || 0) - (a.flaggedAt || 0));
            return res.status(200).json({ corrections });
        }

        // Mode: dismiss a correction (false positive)
        if (mode === 'dismiss-correction') {
            const { correctionId } = req.body;
            if (!correctionId) {
                return res.status(400).json({ error: 'correctionId required' });
            }
            await kvHdel(CORRECTIONS_KEY, correctionId, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true });
        }

        // Mode: add correction as a knowledge fact, then remove the correction
        if (mode === 'add-correction-as-fact') {
            const { correctionId } = req.body;
            if (!correctionId) {
                return res.status(400).json({ error: 'correctionId required' });
            }
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'Fact text is required' });
            }
            if (text.length > 500) {
                return res.status(400).json({ error: 'Fact text must be 500 characters or less' });
            }
            const cat = CATEGORIES.includes(category) ? category : 'correction';
            const id = 'fact_' + randomBytes(16).toString('hex');
            const fact = {
                id,
                text: text.trim(),
                category: cat,
                createdAt: Date.now(),
                fromCorrection: correctionId
            };
            await kvHset(KNOWLEDGE_KEY, id, fact, KV_REST_API_URL, KV_REST_API_TOKEN);
            await kvHdel(CORRECTIONS_KEY, correctionId, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, fact });
        }

        // Shared: fetch existing rules for conflict detection
        async function getExistingRulesContext() {
            const all = await kvHgetall(PROMPT_RULES_KEY, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => null);
            if (!all || Object.keys(all).length === 0) return { text: '', rules: [] };
            const rules = Object.values(all);
            const numbered = rules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n');
            return { text: numbered, rules };
        }

        const SUGGEST_SYSTEM = `You generate concise behavioral rules for an AI chatbot named Drak (an orc war chief for an NFT community).

EXISTING RULES may be provided. You MUST:
- Not create a rule that contradicts an existing rule
- If your new rule would overlap or conflict with an existing rule, respond in this exact format:
  CONFLICT: [number of conflicting rule]
  SUGGESTED: [your new rule that replaces/merges both]
- If no conflict, respond with just the rule text

The rule should be a clear, actionable instruction (max 1-2 sentences). Output ONLY in the format above, nothing else.`;

        // Mode: suggest a prompt rule from a correction (Haiku)
        if (mode === 'suggest-rule') {
            const { correctionId } = req.body;
            if (!correctionId) {
                return res.status(400).json({ error: 'correctionId required' });
            }
            const correction = await kvHget(CORRECTIONS_KEY, correctionId, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!correction) {
                return res.status(404).json({ error: 'Correction not found' });
            }
            const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
            if (!anthropicApiKey) {
                return res.status(503).json({ error: 'AI service unavailable' });
            }
            const existing = await getExistingRulesContext();
            const client = new Anthropic({ apiKey: anthropicApiKey });
            const existingBlock = existing.text ? `\n\nEXISTING RULES:\n${existing.text}` : '';
            const result = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                system: SUGGEST_SYSTEM,
                messages: [{
                    role: 'user',
                    content: `User asked: ${correction.userMsg}\nDrak replied: ${correction.drakReply}\nWhy it was wrong: ${correction.reason}${existingBlock}\n\nBehavioral rule:`
                }]
            });
            const raw = result.content[0]?.text?.trim() || '';
            const resp = parseSuggestResponse(raw, existing.rules);
            return res.status(200).json(resp);
        }

        // Mode: suggest a prompt rule from rough text (Haiku)
        if (mode === 'suggest-rule-from-text') {
            const { roughText } = req.body;
            if (!roughText || typeof roughText !== 'string' || !roughText.trim()) {
                return res.status(400).json({ error: 'Rough text is required' });
            }
            const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
            if (!anthropicApiKey) {
                return res.status(503).json({ error: 'AI service unavailable' });
            }
            const existing = await getExistingRulesContext();
            const client = new Anthropic({ apiKey: anthropicApiKey });
            const existingBlock = existing.text ? `\n\nEXISTING RULES:\n${existing.text}` : '';
            const result = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                system: SUGGEST_SYSTEM,
                messages: [{
                    role: 'user',
                    content: `Rough input: ${roughText.trim()}${existingBlock}\n\nRefined behavioral rule:`
                }]
            });
            const raw = result.content[0]?.text?.trim() || '';
            const resp = parseSuggestResponse(raw, existing.rules);
            return res.status(200).json(resp);
        }

        // Mode: list prompt rules
        if (mode === 'list-rules') {
            const all = await kvHgetall(PROMPT_RULES_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
            const rules = Object.values(all || {});
            rules.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return res.status(200).json({ rules });
        }

        // Mode: add a prompt rule
        if (mode === 'add-rule') {
            const { rule } = req.body;
            if (!rule || typeof rule !== 'string' || !rule.trim()) {
                return res.status(400).json({ error: 'Rule text is required' });
            }
            if (rule.length > 500) {
                return res.status(400).json({ error: 'Rule must be 500 characters or less' });
            }
            const id = 'rule_' + randomBytes(16).toString('hex');
            const entry = { id, rule: rule.trim(), createdAt: Date.now() };
            await kvHset(PROMPT_RULES_KEY, id, entry, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, entry });
        }

        // Mode: delete a prompt rule
        if (mode === 'delete-rule') {
            const { ruleId } = req.body;
            if (!ruleId) {
                return res.status(400).json({ error: 'ruleId required' });
            }
            await kvHdel(PROMPT_RULES_KEY, ruleId, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid mode' });

    } catch (error) {
        console.error('Drak knowledge error:', error);
        return res.status(500).json({ error: 'Knowledge operation failed' });
    }
}
