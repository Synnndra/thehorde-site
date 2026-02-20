// Check Discord Link Status for a Wallet
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
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

    const wallet = req.method === 'GET' ? req.query.wallet : req.body?.wallet;

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
            const { discordId, username, avatar, signature, message } = req.body;
            if (!discordId || !username) {
                return res.status(400).json({ error: 'Discord ID and username required' });
            }

            // Require wallet signature to prevent unauthenticated identity overwrites
            if (!signature || !message) {
                return res.status(401).json({ error: 'Wallet signature required' });
            }
            try {
                const messageBytes = new TextEncoder().encode(message);
                const signatureBytes = bs58.decode(signature);
                const publicKeyBytes = bs58.decode(wallet);
                const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
                if (!verified) {
                    return res.status(401).json({ error: 'Invalid signature' });
                }
                // Verify wallet in signed message matches request wallet
                const walletMatch = message.match(/Wallet: ([A-Za-z0-9]+)/);
                if (!walletMatch || walletMatch[1] !== wallet) {
                    return res.status(401).json({ error: 'Wallet mismatch in signed message' });
                }
                // No timestamp check — signature proves wallet ownership,
                // and sessions may persist for hours/days via sessionStorage.
                // Setting your own Discord name via replayed sig is low-risk.
            } catch (err) {
                return res.status(401).json({ error: 'Signature verification failed' });
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
