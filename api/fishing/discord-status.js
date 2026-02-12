// Check Discord Link Status for a Wallet
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const DISCORD_LINK_PREFIX = 'discord_link:';

// Rate limiting
const RATE_LIMIT_PREFIX = 'rate_limit:';
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

async function redisGet(key) {
    const response = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
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

async function checkRateLimit(ip) {
    const key = `${RATE_LIMIT_PREFIX}discord_status:${ip}`;
    const count = await redisIncr(key);
    if (count === 1) {
        await redisExpire(key, RATE_LIMIT_WINDOW);
    }
    return count <= RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
    const ALLOWED_ORIGINS = ['https://midhorde.com', 'https://www.midhorde.com'];
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';
    const withinLimit = await checkRateLimit(ip);
    if (!withinLimit) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { wallet } = req.query;

    if (!wallet) {
        return res.status(400).json({ error: 'Wallet address required' });
    }

    // Validate wallet format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        const linkData = await redisGet(`${DISCORD_LINK_PREFIX}${wallet}`);

        if (!linkData) {
            return res.status(200).json({
                linked: false
            });
        }

        const data = JSON.parse(linkData);
        return res.status(200).json({
            linked: true,
            discordId: data.discordId,
            username: data.username,
            globalName: data.globalName,
            avatar: data.avatar,
            linkedAt: data.linkedAt
        });

    } catch (error) {
        console.error('Discord status error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
