// Discord OAuth2 - Redirect to Discord Authorization
import { randomUUID } from 'crypto';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ALLOWED_ORIGINS = ['https://midhorde.com', 'https://www.midhorde.com'];

// Redirect URI computed per-request to handle preview URLs correctly
function getDiscordRedirectUri(req) {
    return process.env.DISCORD_FISHING_REDIRECT_URI || `https://${req.headers.host}/api/fishing/discord-callback`;
}

export default async function handler(req, res) {
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

    if (!DISCORD_CLIENT_ID || !KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Discord not configured' });
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

    // Generate random state token and store wallet mapping in KV (10 min TTL)
    const stateToken = randomUUID();
    await fetch(`${KV_URL}/set/discord_oauth_state:${stateToken}/${encodeURIComponent(JSON.stringify({ wallet, createdAt: Date.now() }))}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    await fetch(`${KV_URL}/expire/discord_oauth_state:${stateToken}/600`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });

    // Build Discord OAuth URL
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: getDiscordRedirectUri(req),
        response_type: 'code',
        scope: 'identify',
        state: stateToken
    });

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    // Redirect to Discord
    res.redirect(302, discordAuthUrl);
}
