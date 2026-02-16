// Cron endpoint — DMs admin on Discord when a campaign tweet is due for approval.
// Runs every 15 min during the tournament. Delete after Feb 21.
import { kvHgetall, kvHset } from '../../lib/swap-utils.js';

const DRAFTS_KEY = 'x:drafts';
const DISCORD_USER_ID = '445769305649446912';

async function sendDiscordDM(botToken, userId, messagePayload) {
    // Create / get DM channel
    const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient_id: userId })
    });
    if (!channelRes.ok) {
        const err = await channelRes.text();
        throw new Error(`DM channel failed: ${channelRes.status} ${err}`);
    }
    const channel = await channelRes.json();

    // Send message
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
    });
    if (!msgRes.ok) {
        const err = await msgRes.text();
        throw new Error(`DM send failed: ${msgRes.status} ${err}`);
    }
    return msgRes.json();
}

export default async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];
    if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!kvUrl || !kvToken || !botToken) {
        return res.status(500).json({ error: 'Missing config' });
    }

    try {
        const allDrafts = await kvHgetall(DRAFTS_KEY, kvUrl, kvToken);
        const now = Date.now();

        // Find campaign drafts that are due and not yet notified
        const due = Object.values(allDrafts || {}).filter(d =>
            d.source === 'campaign' &&
            d.status === 'pending' &&
            d.scheduledAt &&
            d.scheduledAt <= now &&
            !d.notified
        );

        if (due.length === 0) {
            return res.status(200).json({ message: 'No notifications due' });
        }

        const notified = [];
        for (const draft of due) {
            try {
                const preview = draft.text.length > 280
                    ? draft.text.slice(0, 280) + '...'
                    : draft.text;

                await sendDiscordDM(botToken, DISCORD_USER_ID, {
                    embeds: [{
                        title: '\u{1F3A3} Campaign Tweet Ready',
                        description: preview,
                        color: 0xFFD700,
                        fields: [
                            { name: 'Post', value: draft.topic || 'Campaign post', inline: false },
                            { name: 'Approve it', value: '[Open admin panel](https://midhorde.com/admin)', inline: false }
                        ],
                        footer: { text: 'Bobbers Tournament Campaign' }
                    }]
                });

                draft.notified = true;
                await kvHset(DRAFTS_KEY, draft.id, draft, kvUrl, kvToken);
                notified.push(draft.id);
            } catch (err) {
                console.error(`Notify failed for ${draft.id}:`, err.message);
            }
        }

        return res.status(200).json({
            message: `Sent ${notified.length} notification(s)`,
            notified
        });

    } catch (err) {
        console.error('Campaign notify error:', err);
        return res.status(500).json({ error: 'Notification check failed' });
    }
}
