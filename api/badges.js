// Vercel Serverless Function - Public Badge Data Endpoint
import { kvGet, getClientIp, isRateLimitedKV, validateSolanaAddress } from '../lib/swap-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const wallet = req.query?.wallet;
    if (!wallet || !validateSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
    }

    // Rate limit: 30 per minute per IP
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'badges', 30, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        // Fetch event badges, definitions, and swap count in parallel
        const [walletBadges, definitions, swapCount] = await Promise.all([
            kvGet(`badges:wallet:${wallet}`, KV_REST_API_URL, KV_REST_API_TOKEN),
            kvGet('badges:definitions', KV_REST_API_URL, KV_REST_API_TOKEN),
            kvGet(`badges:swaps:${wallet}`, KV_REST_API_URL, KV_REST_API_TOKEN)
        ]);

        const badgeIds = Array.isArray(walletBadges) ? walletBadges : [];
        const defs = definitions || {};

        // Resolve badge IDs to full definitions
        const eventBadges = badgeIds
            .map(id => defs[id])
            .filter(Boolean);

        return res.status(200).json({
            eventBadges,
            swapCount: typeof swapCount === 'number' ? swapCount : parseInt(swapCount) || 0
        });
    } catch (error) {
        console.error('Badges endpoint error:', error);
        return res.status(500).json({ error: 'Failed to fetch badges' });
    }
}
