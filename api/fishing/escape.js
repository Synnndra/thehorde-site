// Consumes a cast token when a fish escapes (prevents escape-bypass cheating)
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'fish-escape', 30, 60000, KV_URL, KV_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { castToken } = req.body || {};
    if (!castToken || typeof castToken !== 'string' || castToken.length > 100) {
        return res.status(400).json({ error: 'Invalid cast token' });
    }

    const castKey = `cast_ready:${castToken}`;
    try {
        await fetch(KV_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['DEL', castKey])
        });
        return res.status(200).json({ success: true });
    } catch {
        return res.status(500).json({ error: 'Server error' });
    }
}
