// Discord OAuth2 - Redirect to Discord Authorization
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
// Redirect URI computed per-request to handle preview URLs correctly
function getDiscordRedirectUri(req) {
    return process.env.DISCORD_FISHING_REDIRECT_URI || `https://${req.headers.host}/api/fishing/discord-callback`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!DISCORD_CLIENT_ID) {
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

    // Build Discord OAuth URL
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: getDiscordRedirectUri(req),
        response_type: 'code',
        scope: 'identify',
        state: wallet // Pass wallet in state to link after callback
    });

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    // Redirect to Discord
    res.redirect(302, discordAuthUrl);
}
