// One-time cron — DMs admin the final tournament standings after the tournament ends.
// Schedule: 59 20 21 2 * (Feb 21, 8:59 PM UTC = 12:59 PM PST, ~1hr after close)
// Delete this file after tournament cleanup.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_USER_ID = '445769305649446912';

const SCORE_KEY = 'leaderboard:score';
const DISCORD_LINK_PREFIX = 'discord_link:';

async function redisCommand(command) {
    const response = await fetch(KV_URL, {
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

async function sendDiscordDM(userId, messagePayload) {
    const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
            'Authorization': `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient_id: userId })
    });
    if (!channelRes.ok) {
        throw new Error(`DM channel failed: ${channelRes.status} ${await channelRes.text()}`);
    }
    const channel = await channelRes.json();

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
    });
    if (!msgRes.ok) {
        throw new Error(`DM send failed: ${msgRes.status} ${await msgRes.text()}`);
    }
    return msgRes.json();
}

export default async function handler(req, res) {
    if (!KV_URL || !KV_TOKEN || !BOT_TOKEN) {
        return res.status(500).json({ error: 'Missing config' });
    }

    // Auth: cron only
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // Get top 50 by score
        const results = await redisCommand(['ZREVRANGE', SCORE_KEY, 0, 49, 'WITHSCORES']);

        if (!results || results.length === 0) {
            await sendDiscordDM(DISCORD_USER_ID, {
                content: '🎣 **Tournament Results**: No scores recorded.'
            });
            return res.status(200).json({ sent: true, players: 0 });
        }

        // Parse wallets and scores
        const entries = [];
        for (let i = 0; i < results.length; i += 2) {
            entries.push({ wallet: results[i], score: parseFloat(results[i + 1]) });
        }

        // Fetch Discord names for all wallets
        const discordNames = {};
        await Promise.all(entries.map(async (e) => {
            try {
                const raw = await redisCommand(['GET', `${DISCORD_LINK_PREFIX}${e.wallet}`]);
                if (raw) {
                    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    discordNames[e.wallet] = data.globalName || data.username || null;
                }
            } catch {}
        }));

        // Build formatted list
        const lines = entries.map((e, i) => {
            const rank = i + 1;
            const name = discordNames[e.wallet];
            const display = name ? `${name} (${e.wallet.slice(0, 4)}...${e.wallet.slice(-4)})` : e.wallet;
            return `**${rank}.** ${display} — ${e.score.toFixed(1)} pts`;
        });

        // Discord embed max is 4096 chars — split if needed
        const chunks = [];
        let current = '';
        for (const line of lines) {
            if ((current + '\n' + line).length > 3900) {
                chunks.push(current);
                current = line;
            } else {
                current = current ? current + '\n' + line : line;
            }
        }
        if (current) chunks.push(current);

        // Send first chunk as embed, rest as follow-up messages
        await sendDiscordDM(DISCORD_USER_ID, {
            embeds: [{
                title: '🎣 Bobbers Tournament — Final Standings',
                description: chunks[0],
                color: 0xFFD700,
                footer: { text: `${entries.length} players • Tournament ended Feb 21 2026` }
            }]
        });

        for (let i = 1; i < chunks.length; i++) {
            await sendDiscordDM(DISCORD_USER_ID, {
                content: chunks[i]
            });
        }

        return res.status(200).json({ sent: true, players: entries.length });

    } catch (err) {
        console.error('Tournament results error:', err);
        return res.status(500).json({ error: err.message });
    }
}
