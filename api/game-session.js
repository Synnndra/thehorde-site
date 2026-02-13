// Vercel Serverless Function for Game Session Tokens
// Issues a one-time token when a game starts, validated on score submission
import { isRateLimitedKV, getClientIp } from '../lib/swap-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    // Rate limiting — 10 session requests per minute per IP
    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'game-session', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { game } = req.body || {};
    if (!game || !['horde', 'orcrun', 'fishing'].includes(game)) {
        return res.status(400).json({ error: 'Invalid game type' });
    }

    try {
        // Generate a random token
        const array = new Uint8Array(24);
        crypto.getRandomValues(array);
        const token = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

        const key = `game_session:${token}`;
        // Seed for server-side deterministic generation (fishing anti-cheat)
        const seedArray = new Uint32Array(1);
        crypto.getRandomValues(seedArray);
        const sessionData = { game, startedAt: Date.now(), ip: clientIp, seed: seedArray[0] };
        const TTL_SECONDS = 3 * 60 * 60; // 3 hours

        // Store with TTL
        await fetch(`${KV_REST_API_URL}/set/${key}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });
        await fetch(`${KV_REST_API_URL}/expire/${key}/${TTL_SECONDS}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });

        return res.status(200).json({ token });
    } catch (error) {
        console.error('Game session error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
