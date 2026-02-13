// Vercel Serverless Function for Wallet-X Linking
import { isRateLimitedKV, getClientIp, validateTimestamp, isSignatureUsed, markSignatureUsed, kvGet, kvSet, verifySignature } from '../lib/swap-utils.js';

const X_MAP_KEY = 'holders:x_map';

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'holders-link-x', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    try {
        const { wallet, signature, message, x } = req.body;

        if (!wallet || typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        if (!signature || typeof signature !== 'string') {
            return res.status(400).json({ error: 'Signature required' });
        }

        // Validate message format and timestamp
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message required' });
        }

        const expectedPrefix = req.method === 'DELETE'
            ? `Unlink X from wallet ${wallet} on midhorde.com at `
            : `Link X to wallet ${wallet} on midhorde.com at `;

        if (!message.startsWith(expectedPrefix)) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        const tsResult = validateTimestamp(message);
        if (!tsResult.valid) {
            return res.status(400).json({ error: tsResult.error });
        }

        // Check signature replay
        if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'Signature already used' });
        }

        if (!verifySignature(message, signature, wallet)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Mark signature as used
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        let xMap = {};
        try {
            const rawMap = await kvGet(X_MAP_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (rawMap) {
                xMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read X map:', e);
        }

        if (req.method === 'DELETE') {
            delete xMap[wallet];
            await kvSet(X_MAP_KEY, xMap, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, action: 'unlinked' });
        }

        // POST - Link
        if (!x || typeof x !== 'object') {
            return res.status(400).json({ error: 'X info required' });
        }

        const { username, id: xId, avatar } = x;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'X username required' });
        }

        const sanitizedUsername = username.slice(0, 32).replace(/[^\w._-]/g, '');
        const sanitizedId = xId ? String(xId).slice(0, 20).replace(/[^0-9]/g, '') : null;
        const sanitizedAvatar = avatar ? String(avatar).slice(0, 256).replace(/[^a-zA-Z0-9_\-:/.]/g, '') : null;

        const xInfo = {
            username: sanitizedUsername,
            id: sanitizedId,
            avatar: sanitizedAvatar,
            linkedAt: new Date().toISOString()
        };

        xMap[wallet] = xInfo;
        await kvSet(X_MAP_KEY, xMap, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ success: true, action: 'linked', x: xInfo });

    } catch (error) {
        console.error('Holders-link-x error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
