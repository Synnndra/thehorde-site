// Server-side Cooldown Tracking with Redis
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const COOLDOWN_PREFIX = 'fishing_cooldown:';
const RESET_HOUR_UTC = 1; // 1:00 AM UTC = 5:00 PM PST
const MAX_CASTS_PER_DAY = 5;
const MAX_ORC_BONUS = 5;
const MIDEVILS_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';
const ORC_COUNT_TTL = 3600; // 1 hour cache

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
    return val > 100 ? 0 : val;
}

async function redisTtl(key) {
    const response = await fetch(`${KV_URL}/ttl/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

// Fishing day resets at 5pm PST (1:00 AM UTC next day)
function getTodayKey() {
    const adjusted = new Date(Date.now() - (RESET_HOUR_UTC * 60 * 60 * 1000));
    return `${adjusted.getUTCFullYear()}-${adjusted.getUTCMonth() + 1}-${adjusted.getUTCDate()}`;
}

// Seconds until next 5pm PST reset
function getSecondsUntilReset() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(RESET_HOUR_UTC, 0, 0, 0);
    if (now >= next) {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    return Math.ceil((next - now) / 1000);
}

// Count MidEvil Orcs owned by wallet (cached 1 hour)
async function getOrcCount(wallet) {
    const cacheKey = `orc_count:${wallet}`;
    try {
        const cached = await redisGet(cacheKey);
        if (cached !== null && cached !== undefined) {
            return Math.min(parseInt(cached) || 0, MAX_ORC_BONUS);
        }
    } catch (e) {
        // Cache miss, proceed to fetch
    }

    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
        return 0;
    }

    try {
        let orcCount = 0;
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'orc-count',
                    method: 'getAssetsByOwner',
                    params: { ownerAddress: wallet, page, limit: 1000 }
                })
            });

            const data = await response.json();
            const items = data.result?.items || [];

            for (const item of items) {
                const collections = (item.grouping || [])
                    .filter(g => g.group_key === 'collection')
                    .map(g => g.group_value);

                const isMidEvil = collections.includes(MIDEVILS_COLLECTION);
                const isGraveyard = collections.includes(GRAVEYARD_COLLECTION);
                const name = (item.content?.metadata?.name || '').toLowerCase();
                const isBurnt = item.burnt === true;

                if (isMidEvil && !isGraveyard && !isBurnt && name.includes('orc')) {
                    orcCount++;
                }
            }

            hasMore = items.length === 1000;
            page++;
        }

        const bonus = Math.min(orcCount, MAX_ORC_BONUS);
        await redisSetEx(cacheKey, ORC_COUNT_TTL, bonus.toString());
        return bonus;
    } catch (err) {
        console.error('Error counting Orcs:', err);
        return 0;
    }
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
            if (raw && parseInt(raw) > 100) {
                await redisDel(cooldownKey);
                castsUsed = 0;
            }

            const bonusCasts = await getOrcCount(wallet);
            const maxCasts = MAX_CASTS_PER_DAY + bonusCasts;

            const ttl = castsUsed > 0 ? await redisTtl(cooldownKey) : 0;
            const castsRemaining = Math.max(0, maxCasts - castsUsed);

            return res.status(200).json({
                canPlay: castsRemaining > 0,
                castsUsed,
                castsRemaining,
                maxCasts,
                baseCasts: MAX_CASTS_PER_DAY,
                bonusCasts,
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
            if (raw && parseInt(raw) > 100) {
                await redisDel(cooldownKey);
                castsUsed = 0;
            }

            const bonusCasts = await getOrcCount(wallet);
            const maxCasts = MAX_CASTS_PER_DAY + bonusCasts;

            if (castsUsed >= maxCasts) {
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
            // Set expiry to next 5pm PST reset
            if (newCount === 1) {
                await redisExpire(cooldownKey, getSecondsUntilReset());
            }

            return res.status(200).json({
                success: true,
                castsUsed: newCount,
                castsRemaining: Math.max(0, maxCasts - newCount),
                message: `Cast ${newCount}/${maxCasts}`
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Cooldown API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
