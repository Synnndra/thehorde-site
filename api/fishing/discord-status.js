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
