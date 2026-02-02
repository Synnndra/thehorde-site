// Vercel Serverless Function for Wallet-X Linking
import nacl from 'tweetnacl';

const X_MAP_KEY = 'holders:x_map';
const CACHE_KEY = 'holders:leaderboard';

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return false;
    }
    if (record.count >= RATE_LIMIT_MAX) return true;
    record.count++;
    return false;
}

function base58Decode(str) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const c = alphabet.indexOf(str[i]);
        if (c < 0) throw new Error('Invalid base58 character');
        let carry = c;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
        bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
}

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    async function kvGet(key) {
        const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const data = await response.json();
        return data.result;
    }

    async function kvSet(key, value) {
        const response = await fetch(`${KV_REST_API_URL}/set/${key}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(value)
        });
        return response.json();
    }

    async function kvDel(key) {
        const response = await fetch(`${KV_REST_API_URL}/del/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        return response.json();
    }

    try {
        const { wallet, signature, x } = req.body;

        if (!wallet || typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        if (!signature || typeof signature !== 'string') {
            return res.status(400).json({ error: 'Signature required' });
        }

        const message = req.method === 'DELETE'
            ? `Unlink X from wallet ${wallet} on midhorde.com`
            : `Link X to wallet ${wallet} on midhorde.com`;

        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = base58Decode(signature);
        const publicKeyBytes = base58Decode(wallet);

        const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        if (!verified) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        let xMap = {};
        try {
            const rawMap = await kvGet(X_MAP_KEY);
            if (rawMap) {
                xMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read X map:', e);
        }

        if (req.method === 'DELETE') {
            delete xMap[wallet];
            await kvSet(X_MAP_KEY, xMap);
            await kvDel(CACHE_KEY);
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
        const sanitizedAvatar = avatar ? String(avatar).slice(0, 256) : null;

        const xInfo = {
            username: sanitizedUsername,
            id: sanitizedId,
            avatar: sanitizedAvatar,
            linkedAt: new Date().toISOString()
        };

        xMap[wallet] = xInfo;
        await kvSet(X_MAP_KEY, xMap);
        await kvDel(CACHE_KEY);

        return res.status(200).json({ success: true, action: 'linked', x: xInfo });

    } catch (error) {
        console.error('Holders-link-x error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
