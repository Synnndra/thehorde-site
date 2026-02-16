// Vercel Serverless Function - Admin Drak Knowledge Base Management
import { timingSafeEqual } from 'crypto';
import { getClientIp, isRateLimitedKV, kvHset, kvHget, kvHdel, kvHgetall } from '../lib/swap-utils.js';
import { randomBytes } from 'crypto';

const KNOWLEDGE_KEY = 'drak:knowledge';
const CATEGORIES = ['project', 'community', 'market', 'lore', 'general'];

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

            const fact = {
                id,
                text: text.trim(),
                category: cat,
                createdAt: Date.now()
            };

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

        return res.status(400).json({ error: 'Invalid mode' });

    } catch (error) {
        console.error('Drak knowledge error:', error);
        return res.status(500).json({ error: 'Knowledge operation failed' });
    }
}
