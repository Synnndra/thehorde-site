// Admin endpoint to view essence claims
import { timingSafeEqual } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function redisLrange(key, start, stop) {
    const response = await fetch(`${KV_URL}/lrange/${key}/${start}/${stop}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result || [];
}

async function redisGet(key) {
    const response = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

async function redisKeys(pattern) {
    const response = await fetch(`${KV_URL}/keys/${encodeURIComponent(pattern)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result || [];
}

async function redisSet(key, value) {
    const response = await fetch(`${KV_URL}/set/${key}/${value}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisDel(key) {
    const response = await fetch(`${KV_URL}/del/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

export default async function handler(req, res) {
    const ALLOWED_ORIGINS = ['https://midhorde.com', 'https://www.midhorde.com'];
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Verify admin secret via timing-safe comparison
    const providedSecret = req.method === 'GET'
        ? req.query.secret
        : req.body?.secret;
    if (!ADMIN_SECRET || !providedSecret) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const a = Buffer.from(String(providedSecret));
    const b = Buffer.from(String(ADMIN_SECRET));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        // POST - Reset essence counter
        if (req.method === 'POST') {
            const { action, value } = req.body;

            if (action === 'reset') {
                const newValue = parseInt(value) || 100;
                await redisSet('primordial_essence_remaining', newValue);

                // Optionally clear claims log and claimed wallets
                if (req.body.clearClaims) {
                    await redisDel('essence_claims');
                    const claimedKeys = await redisKeys('essence_claimed:*');
                    for (const key of claimedKeys) {
                        await redisDel(key);
                    }
                }

                return res.status(200).json({
                    success: true,
                    message: `Essence reset to ${newValue}`,
                    clearedClaims: req.body.clearClaims || false
                });
            }

            if (action === 'reset-leaderboard') {
                // Clear all leaderboard data
                await redisDel('leaderboard:catches');
                await redisDel('leaderboard:legendary');
                await redisDel('leaderboard:essence');
                await redisDel('leaderboard:weight');
                await redisDel('leaderboard:wallets');

                return res.status(200).json({
                    success: true,
                    message: 'Leaderboard reset'
                });
            }

            return res.status(400).json({ error: 'Invalid action' });
        }
        // Get all essence claims
        const claims = await redisLrange('essence_claims', 0, -1);
        const remaining = await redisGet('primordial_essence_remaining');

        // Also check for wallets with essence_claimed: prefix
        const claimedWallets = await redisKeys('essence_claimed:*');

        // Parse claims
        const parsedClaims = claims.map(claim => {
            try {
                return JSON.parse(claim);
            } catch {
                return { raw: claim };
            }
        });

        return res.status(200).json({
            total: 100,
            remaining: parseInt(remaining) || 0,
            claimedByCounter: 100 - (parseInt(remaining) || 0),
            loggedClaims: parsedClaims.length,
            claimedWalletKeys: claimedWallets,
            claims: parsedClaims,
            note: parsedClaims.length !== (100 - (parseInt(remaining) || 0))
                ? 'MISMATCH: Some claims may not have been logged properly'
                : 'OK'
        });

    } catch (error) {
        console.error('Admin essence error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
