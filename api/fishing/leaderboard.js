// Leaderboard API using Upstash Redis
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
import { generateFish } from '../../lib/fish-generator.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Redis keys
const CATCHES_KEY = 'leaderboard:catches';        // Sorted set: wallet -> total catches
const LEGENDARY_KEY = 'leaderboard:legendary';    // Sorted set: wallet -> legendary count
const ESSENCE_KEY = 'leaderboard:essence';        // Sorted set: wallet -> essence count
const WEIGHT_KEY = 'leaderboard:weight';          // Sorted set: wallet -> total weight
const SCORE_KEY = 'leaderboard:score';            // Sorted set: wallet -> cumulative score
const WALLETS_KEY = 'leaderboard:wallets';        // Hash: wallet -> display name (truncated)
const DISCORD_LINK_PREFIX = 'discord_link:';      // Discord link data

// Rarity multipliers for score calculation (score = weight × multiplier)
const RARITY_MULTIPLIERS = {
    common: 1,
    uncommon: 2,
    rare: 5,
    epic: 10,
    legendary: 25
};

async function redisCommand(command) {
    const response = await fetch(`${KV_URL}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${KV_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
    });
    const data = await response.json();
    return data.result;
}

async function redisZincrby(key, increment, member) {
    return await redisCommand(['ZINCRBY', key, increment, member]);
}

async function redisZrevrangeWithScores(key, start, stop) {
    return await redisCommand(['ZREVRANGE', key, start, stop, 'WITHSCORES']);
}

async function redisHset(key, field, value) {
    return await redisCommand(['HSET', key, field, value]);
}

async function redisHget(key, field) {
    return await redisCommand(['HGET', key, field]);
}

async function redisHmget(key, ...fields) {
    return await redisCommand(['HMGET', key, ...fields]);
}

async function redisZscore(key, member) {
    return await redisCommand(['ZSCORE', key, member]);
}

async function redisGet(key) {
    return await redisCommand(['GET', key]);
}

async function redisExists(key) {
    const result = await redisCommand(['EXISTS', key]);
    return result === 1;
}

function getTodayKey() {
    const today = new Date();
    return `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
}

// Truncate wallet for display
function truncateWallet(wallet) {
    if (!wallet || wallet.length < 10) return wallet;
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
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

    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'fishing-leaderboard', 60, 60000, KV_URL, KV_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        // GET - Retrieve leaderboard
        if (req.method === 'GET') {
            const type = req.query.type || 'catches';
            const limit = Math.min(parseInt(req.query.limit) || 10, 50);

            let key;
            switch (type) {
                case 'catches':
                    key = CATCHES_KEY;
                    break;
                case 'legendary':
                    key = LEGENDARY_KEY;
                    break;
                case 'essence':
                    key = ESSENCE_KEY;
                    break;
                case 'weight':
                    key = WEIGHT_KEY;
                    break;
                case 'score':
                    key = SCORE_KEY;
                    break;
                default:
                    key = SCORE_KEY;
            }

            // Get top players
            const results = await redisZrevrangeWithScores(key, 0, limit - 1);

            if (!results || results.length === 0) {
                return res.status(200).json({ leaderboard: [], type });
            }

            // Parse results (comes as [member, score, member, score, ...])
            const wallets = [];
            for (let i = 0; i < results.length; i += 2) {
                wallets.push(results[i]);
            }

            // Fetch Discord links for all wallets
            const discordData = {};
            await Promise.all(wallets.map(async (wallet) => {
                try {
                    const linkData = await redisGet(`${DISCORD_LINK_PREFIX}${wallet}`);
                    if (linkData) {
                        const data = JSON.parse(linkData);
                        discordData[wallet] = {
                            name: data.globalName || data.username,
                            visibleName: data.globalName || data.username,
                            avatar: data.avatar && data.discordId
                                ? `https://cdn.discordapp.com/avatars/${data.discordId}/${data.avatar}.png?size=64`
                                : null,
                            discordId: data.discordId
                        };
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }));

            // Build leaderboard with Discord names
            const leaderboard = [];
            for (let i = 0; i < results.length; i += 2) {
                const wallet = results[i];
                const score = parseFloat(results[i + 1]);
                const discord = discordData[wallet];
                leaderboard.push({
                    rank: Math.floor(i / 2) + 1,
                    wallet: truncateWallet(wallet),
                    fullWallet: wallet,
                    discordName: discord?.name || null,
                    discordAvatar: discord?.avatar || null,
                    score: (type === 'weight' || type === 'score') ? score.toFixed(1) : Math.floor(score)
                });
            }

            return res.status(200).json({ leaderboard, type });
        }

        // POST - Record a catch
        if (req.method === 'POST') {
            const { wallet, gameToken } = req.body;

            if (!wallet) {
                return res.status(400).json({ error: 'Wallet required' });
            }

            // Validate game session token
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

            // Check minimum game duration (15 seconds for fishing)
            const elapsed = Date.now() - session.startedAt;
            if (elapsed < 15000) {
                return res.status(400).json({ error: 'Game session too short' });
            }

            // Delete token so it can't be reused
            await fetch(`${KV_URL}/del/game_session:${gameToken}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
            });

            // Validate wallet
            const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!base58Regex.test(wallet)) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }

            // Generate fish server-side from session seed (anti-cheat)
            const fish = generateFish(session.seed || 0);

            // Update total catches
            await redisZincrby(CATCHES_KEY, 1, wallet);

            // Update legendary count if applicable
            if (fish.rarity === 'legendary') {
                await redisZincrby(LEGENDARY_KEY, 1, wallet);
            }

            // Update total weight
            const weight = parseFloat(fish.weight) || 0;
            if (weight > 0) {
                await redisZincrby(WEIGHT_KEY, weight, wallet);
            }

            // Calculate and update score (weight × rarity multiplier)
            const multiplier = RARITY_MULTIPLIERS[fish.rarity] || 1;
            const catchScore = weight * multiplier;
            if (catchScore > 0) {
                await redisZincrby(SCORE_KEY, catchScore, wallet);
            }

            // Store wallet display name
            await redisHset(WALLETS_KEY, wallet, truncateWallet(wallet));

            // Return server-generated fish so client can display it
            return res.status(200).json({ success: true, fish });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Leaderboard API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
