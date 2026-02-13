// Primordial Essence Tracker using Upstash Redis
// With rate limiting and server-side roll verification
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const TOTAL_ESSENCE = 100;
const ESSENCE_KEY = 'primordial_essence_remaining';
const START_DATE_KEY = 'primordial_essence_start';
const CLAIM_LOG_PREFIX = 'essence_claim:';
const WALLET_CLAIMED_PREFIX = 'essence_claimed:';  // Track wallets that already got essence
const COOLDOWN_PREFIX = 'fishing_cooldown:';       // Check if wallet has played
const EVENT_DAYS = 7;

// Calculate dynamic chance based on remaining essences and days left
function calculateChance(remaining, dayNumber) {
    if (remaining <= 0) return 0;

    const daysLeft = Math.max(1, EVENT_DAYS - dayNumber + 1);
    const essencesPerDay = remaining / daysLeft;

    // Base chance starts at 5%, scales up based on how many need to be found
    // Assume ~100 catches per day average
    const estimatedCatchesPerDay = 100;
    let chance = essencesPerDay / estimatedCatchesPerDay;

    // Minimum 5%, maximum 50%
    chance = Math.max(0.05, Math.min(0.50, chance));

    // On last day, if many remain, boost significantly
    if (dayNumber >= EVENT_DAYS && remaining > 10) {
        chance = Math.min(0.75, chance * 2);
    }

    return Math.round(chance * 100) / 100; // Round to 2 decimals
}

async function redisGet(key) {
    const response = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

async function redisSet(key, value) {
    const response = await fetch(`${KV_URL}/set/${key}/${value}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisSetEx(key, seconds, value) {
    const response = await fetch(`${KV_URL}/setex/${key}/${seconds}/${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisDecr(key) {
    const response = await fetch(`${KV_URL}/decr/${key}`, {
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

async function redisLpush(key, value) {
    const response = await fetch(`${KV_URL}/lpush/${key}/${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

async function redisExists(key) {
    const response = await fetch(`${KV_URL}/exists/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result === 1;
}

// SET NX - set only if key doesn't exist (returns true if set, false if already exists)
async function redisSetNx(key, value) {
    const response = await fetch(`${KV_URL}/set/${key}/${encodeURIComponent(value)}/NX`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result === 'OK';
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
    if (await isRateLimitedKV(ip, 'essence', 20, 60000, KV_URL, KV_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    try {
        // GET - Check how many remain and get current chance (no roll info sent to client)
        if (req.method === 'GET') {
            let remaining = await redisGet(ESSENCE_KEY);
            let startDate = await redisGet(START_DATE_KEY);

            // Initialize if not set
            if (remaining === null) {
                await redisSet(ESSENCE_KEY, TOTAL_ESSENCE);
                remaining = TOTAL_ESSENCE;
            }

            // Set start date if not set
            if (startDate === null) {
                startDate = new Date().toISOString().split('T')[0];
                await redisSet(START_DATE_KEY, startDate);
            }

            // Calculate day number (1-7)
            const start = new Date(startDate);
            const now = new Date();
            const dayNumber = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;

            // Don't send actual chance to client - just remaining count
            return res.status(200).json({
                remaining: parseInt(remaining),
                total: TOTAL_ESSENCE,
                dayNumber: Math.min(dayNumber, EVENT_DAYS),
                daysLeft: Math.max(0, EVENT_DAYS - dayNumber + 1)
            });
        }

        // POST - Roll for essence (server-side) and claim if won
        if (req.method === 'POST') {
            const { wallet } = req.body;

            // Validate wallet
            if (!wallet) {
                return res.status(400).json({ error: 'Wallet address required' });
            }

            const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!base58Regex.test(wallet)) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }

            // Check if wallet already claimed essence (limit 1 per wallet)
            const alreadyClaimed = await redisExists(`${WALLET_CLAIMED_PREFIX}${wallet}`);
            if (alreadyClaimed) {
                return res.status(200).json({
                    success: true,
                    found: false,
                    message: 'You already found essence!',
                    alreadyClaimed: true
                });
            }

            // Check if wallet has played today (must have active cooldown)
            const todayKey = getTodayKey();
            const cooldownKey = `${COOLDOWN_PREFIX}${wallet}:${todayKey}`;
            const hasPlayed = await redisExists(cooldownKey);
            if (!hasPlayed) {
                return res.status(200).json({
                    success: false,
                    found: false,
                    message: 'Must play the game first',
                    notPlayed: true
                });
            }

            // Get current state
            let remaining = await redisGet(ESSENCE_KEY);
            let startDate = await redisGet(START_DATE_KEY);

            // Initialize if not set
            if (remaining === null) {
                await redisSet(ESSENCE_KEY, TOTAL_ESSENCE);
                remaining = TOTAL_ESSENCE;
            }

            if (startDate === null) {
                startDate = new Date().toISOString().split('T')[0];
                await redisSet(START_DATE_KEY, startDate);
            }

            remaining = parseInt(remaining);

            if (remaining <= 0) {
                return res.status(200).json({
                    success: false,
                    found: false,
                    message: 'All Primordial Essence has been claimed!',
                    remaining: 0
                });
            }

            // Calculate chance and roll SERVER-SIDE
            const start = new Date(startDate);
            const now = new Date();
            const dayNumber = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
            const chance = calculateChance(remaining, dayNumber);

            // Server-side random roll
            const roll = Math.random();
            const won = roll < chance;

            if (!won) {
                return res.status(200).json({
                    success: true,
                    found: false,
                    message: 'No essence this time',
                    remaining: remaining
                });
            }

            // Won! Atomically decrement
            const newCount = await redisDecr(ESSENCE_KEY);

            // Check for race condition (count went negative)
            if (newCount < 0) {
                // Restore count
                await redisIncr(ESSENCE_KEY);
                return res.status(200).json({
                    success: true,
                    found: false,
                    message: 'Essence was claimed by someone else!',
                    remaining: 0
                });
            }

            // Atomically mark wallet as claimed (SET NX prevents double-claim race)
            const claimed = await redisSetNx(`${WALLET_CLAIMED_PREFIX}${wallet}`, Date.now().toString());
            if (!claimed) {
                // Another request from this wallet beat us — restore the counter
                await redisIncr(ESSENCE_KEY);
                return res.status(200).json({
                    success: true,
                    found: false,
                    message: 'You already found essence!',
                    alreadyClaimed: true
                });
            }

            // Log the claim
            const claimLog = JSON.stringify({
                wallet,
                timestamp: new Date().toISOString(),
                remaining: newCount,
                ip: ip
            });
            await redisLpush('essence_claims', claimLog);

            console.log(`[PRIMORDIAL ESSENCE CLAIMED] ${new Date().toISOString()} - Wallet: ${wallet} - Remaining: ${newCount}`);

            return res.status(200).json({
                success: true,
                found: true,
                message: 'You found Primordial Essence!',
                remaining: newCount
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Primordial Essence API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
