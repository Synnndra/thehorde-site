// Lightweight collection stats for the About page
// Pulls from Magic Eden APIs, caches in KV for 1 hour
import { isRateLimitedKV, getClientIp, kvGet } from '../lib/swap-utils.js';

const CACHE_KEY = 'about:collection-stats';
const CACHE_TTL = 3600; // 1 hour

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Not configured' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'col-stats', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        // Check cache
        const cached = await kvGet(CACHE_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (cached) {
            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
            res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60');
            return res.status(200).json(data);
        }

        // Fetch from Magic Eden APIs in parallel
        const [statsRes, holderRes] = await Promise.all([
            fetch('https://api-mainnet.magiceden.dev/v2/collections/midevils/stats'),
            fetch('https://api-mainnet.magiceden.dev/v2/collections/midevils/holder_stats')
        ]);

        const meStats = statsRes.ok ? await statsRes.json() : {};
        const meHolders = holderRes.ok ? await holderRes.json() : {};

        // ME returns floor in lamports, convert to SOL rounded to 2 decimals
        const floorLamports = meStats.floorPrice || 0;
        const floorPrice = Math.round((floorLamports / 1e9) * 100) / 100;

        const stats = {
            totalSupply: meHolders.totalSupply || null,
            holders: meHolders.uniqueHolders || null,
            floorPrice: floorPrice || null,
            updatedAt: new Date().toISOString()
        };

        // Cache for 1 hour
        await fetch(`${KV_REST_API_URL}/setex/${CACHE_KEY}/${CACHE_TTL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(stats)
        });

        res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60');
        return res.status(200).json(stats);
    } catch (error) {
        console.error('Collection stats error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
