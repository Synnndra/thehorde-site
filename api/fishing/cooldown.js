// Server-side Cooldown Tracking with Redis
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const COOLDOWN_PREFIX = 'fishing_cooldown:';
const COOLDOWN_SECONDS = 86400; // 24 hours
const MAX_CASTS_PER_DAY = 5;

// Admin wallets that bypass cooldown (comma-separated in env var)
const UNLIMITED_WALLETS = process.env.ADMIN_WALLETS
    ? process.env.ADMIN_WALLETS.split(',').map(w => w.trim())
    : [];


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

async function redisDel(key) {
    const response = await fetch(`${KV_URL}/del/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

// Old format stored Date.now() timestamp — detect and reset
function parseCastsUsed(raw) {
    const val = parseInt(raw) || 0;
    return val > MAX_CASTS_PER_DAY ? 0 : val;
}

async function redisTtl(key) {
    const response = await fetch(`${KV_URL}/ttl/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

function getTodayKey() {
    const today = new Date();
    return `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
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

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Rate limiting
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'fishing-cooldown', 30, 60000, KV_URL, KV_TOKEN)) {
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
            const raw = await redisGet(cooldownKey);
            let castsUsed = parseCastsUsed(raw);
            // Reset old-format timestamp keys
            if (raw && parseInt(raw) > MAX_CASTS_PER_DAY) {
                await redisDel(cooldownKey);
                castsUsed = 0;
            }
            const ttl = castsUsed > 0 ? await redisTtl(cooldownKey) : 0;
            const castsRemaining = Math.max(0, MAX_CASTS_PER_DAY - castsUsed);

            return res.status(200).json({
                canPlay: castsRemaining > 0,
                castsUsed,
                castsRemaining,
                maxCasts: MAX_CASTS_PER_DAY,
                playedToday: castsUsed > 0,
                resetInSeconds: ttl > 0 ? ttl : 0
            });
        }

        // POST - Use one cast
        if (req.method === 'POST') {
            // Validate game session token
            const gameToken = req.body?.gameToken;
            if (!gameToken || typeof gameToken !== 'string') {
                return res.status(400).json({ error: 'Game token required' });
            }
            const sessionData = await redisGet(`game_session:${gameToken}`);
            if (!sessionData) {
                return res.status(400).json({ error: 'Invalid or expired game token' });
            }
            const session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
            if (session.game !== 'fishing') {
                return res.status(400).json({ error: 'Invalid game token' });
            }

            const raw = await redisGet(cooldownKey);
            let castsUsed = parseCastsUsed(raw);
            // Reset old-format timestamp keys
            if (raw && parseInt(raw) > MAX_CASTS_PER_DAY) {
                await redisDel(cooldownKey);
                castsUsed = 0;
            }

            if (castsUsed >= MAX_CASTS_PER_DAY) {
                const ttl = await redisTtl(cooldownKey);
                return res.status(200).json({
                    success: false,
                    message: 'No casts remaining today',
                    castsRemaining: 0,
                    resetInSeconds: ttl > 0 ? ttl : 0
                });
            }

            // Increment cast count
            const newCount = await redisIncr(cooldownKey);
            // Set expiry on first cast
            if (newCount === 1) {
                await redisExpire(cooldownKey, COOLDOWN_SECONDS);
            }

            return res.status(200).json({
                success: true,
                castsUsed: newCount,
                castsRemaining: Math.max(0, MAX_CASTS_PER_DAY - newCount),
                message: `Cast ${newCount}/${MAX_CASTS_PER_DAY}`
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Cooldown API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
