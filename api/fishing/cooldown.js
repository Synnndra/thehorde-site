// Server-side Cooldown Tracking with Redis
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const COOLDOWN_PREFIX = 'fishing_cooldown:';
const COOLDOWN_SECONDS = 86400; // 24 hours

// Admin wallets that bypass cooldown (comma-separated in env var)
const UNLIMITED_WALLETS = process.env.ADMIN_WALLETS
    ? process.env.ADMIN_WALLETS.split(',').map(w => w.trim())
    : [];

// Rate limiting
const RATE_LIMIT_PREFIX = 'rate_limit:';
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

async function redisGet(key) {
    const response = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

async function redisSetEx(key, seconds, value) {
    const response = await fetch(`${KV_URL}/setex/${key}/${seconds}/${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisIncr(key) {
    const response = await fetch(`${KV_URL}/incr/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

async function redisExpire(key, seconds) {
    const response = await fetch(`${KV_URL}/expire/${key}/${seconds}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisTtl(key) {
    const response = await fetch(`${KV_URL}/ttl/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

// Check rate limit
async function checkRateLimit(ip) {
    const key = `${RATE_LIMIT_PREFIX}${ip}`;
    const count = await redisIncr(key);

    if (count === 1) {
        await redisExpire(key, RATE_LIMIT_WINDOW);
    }

    return count <= RATE_LIMIT_MAX;
}

function getTodayKey() {
    const today = new Date();
    return `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Get client IP for rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';

    // Check rate limit
    const withinLimit = await checkRateLimit(ip);
    if (!withinLimit) {
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    try {
        const { wallet } = req.method === 'GET' ? req.query : req.body;

        if (!wallet) {
            return res.status(400).json({ error: 'Wallet address required' });
        }

        // Validate wallet format
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (!base58Regex.test(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        // Check if unlimited wallet
        if (UNLIMITED_WALLETS.includes(wallet)) {
            return res.status(200).json({
                canPlay: true,
                unlimited: true,
                message: 'Unlimited access granted'
            });
        }

        const todayKey = getTodayKey();
        const cooldownKey = `${COOLDOWN_PREFIX}${wallet}:${todayKey}`;

        // GET - Check if wallet can play
        if (req.method === 'GET') {
            const played = await redisGet(cooldownKey);
            const ttl = played ? await redisTtl(cooldownKey) : 0;

            return res.status(200).json({
                canPlay: !played,
                playedToday: !!played,
                resetInSeconds: ttl > 0 ? ttl : 0
            });
        }

        // POST - Mark wallet as played
        if (req.method === 'POST') {
            const played = await redisGet(cooldownKey);

            if (played) {
                const ttl = await redisTtl(cooldownKey);
                return res.status(200).json({
                    success: false,
                    message: 'Already played today',
                    resetInSeconds: ttl > 0 ? ttl : 0
                });
            }

            // Mark as played with 24h expiry
            await redisSetEx(cooldownKey, COOLDOWN_SECONDS, Date.now().toString());

            return res.status(200).json({
                success: true,
                message: 'Session started'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Cooldown API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
