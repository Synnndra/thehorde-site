// Discord OAuth2 Callback Handler
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
function getDiscordRedirectUri(req) {
    return process.env.DISCORD_FISHING_REDIRECT_URI || `https://${req.headers.host}/api/fishing/discord-callback`;
}
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const DISCORD_LINK_PREFIX = 'discord_link:';

async function redisSet(key, value) {
    const response = await fetch(`${KV_URL}/set/${key}/${encodeURIComponent(JSON.stringify(value))}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    return response.json();
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Discord not configured' });
    }

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    const { code, state: wallet, error: discordError } = req.query;

    // User denied authorization
    if (discordError) {
        return res.redirect(302, '/fishing/?discord=denied');
    }

    if (!code || !wallet) {
        return res.redirect(302, '/fishing/?discord=error&reason=missing_params');
    }

    // Validate wallet format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(wallet)) {
        return res.redirect(302, '/fishing/?discord=error&reason=invalid_wallet');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: getDiscordRedirectUri(req)
            })
        });

        if (!tokenResponse.ok) {
            console.error('Token exchange failed:', await tokenResponse.text());
            return res.redirect(302, '/fishing/?discord=error&reason=token_exchange');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Get user info from Discord
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!userResponse.ok) {
            console.error('User fetch failed:', await userResponse.text());
            return res.redirect(302, '/fishing/?discord=error&reason=user_fetch');
        }

        const discordUser = await userResponse.json();

        // Store the wallet <-> Discord link in Redis
        const linkData = {
            discordId: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name || discordUser.username,
            avatar: discordUser.avatar,
            linkedAt: Date.now()
        };

        await redisSet(`${DISCORD_LINK_PREFIX}${wallet}`, linkData);

        // Redirect back to game with success
        const displayName = encodeURIComponent(discordUser.global_name || discordUser.username);
        return res.redirect(302, `/fishing?discord=success&name=${displayName}`);

    } catch (error) {
        console.error('Discord callback error:', error);
        return res.redirect(302, '/fishing/?discord=error&reason=server_error');
    }
}
