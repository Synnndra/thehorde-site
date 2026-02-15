// Check Discord Link Status for a Wallet
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const DISCORD_LINK_PREFIX = 'discord_link:';

async function redisGet(key) {
    const response = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

async function redisSetEx(key, seconds, value) {
    const response = await fetch(`${KV_URL}/setex/${key}/${seconds}/${encodeURIComponent(JSON.stringify(value))}`, {
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

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Rate limiting
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'discord-status', 60, 60000, KV_URL, KV_TOKEN)) {
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
        // POST - Sync nav Discord data to wallet-specific Redis key
        if (req.method === 'POST') {
            const { discordId, username, avatar } = req.body;
            if (!discordId || !username) {
                return res.status(400).json({ error: 'Discord ID and username required' });
            }

            // Only sync if wallet doesn't already have a link
            const existing = await redisGet(`${DISCORD_LINK_PREFIX}${wallet}`);
            if (existing) {
                return res.status(200).json({ synced: false, message: 'Already linked' });
            }

            const linkData = {
                discordId: String(discordId),
                username: String(username),
                globalName: String(username),
                avatar: avatar ? String(avatar) : null,
                linkedAt: Date.now()
            };

            // 90-day TTL matching discord-callback.js
            await redisSetEx(`${DISCORD_LINK_PREFIX}${wallet}`, 7776000, linkData);

            return res.status(200).json({ synced: true });
        }

        // GET - Check Discord link status
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

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
