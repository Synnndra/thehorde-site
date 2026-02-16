// One-time leaderboard reset for tournament prep
// Triggered by cron or admin. Wipes all fishing leaderboard sorted sets + wallet hash.
import { timingSafeEqual } from 'crypto';

const KEYS_TO_DELETE = [
    'leaderboard:catches',
    'leaderboard:legendary',
    'leaderboard:weight',
    'leaderboard:score',
    'leaderboard:wallets'
];

export default async function handler(req, res) {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!kvUrl || !kvToken) {
        return res.status(500).json({ error: 'Redis not configured' });
    }

    // Auth: cron bearer or admin secret in body/query
    const authHeader = req.headers['authorization'];
    const isCron = authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`;

    let isAdmin = false;
    if (!isCron && adminSecret) {
        const bodySecret = req.body?.secret || req.query?.secret;
        if (bodySecret) {
            const secretBuf = Buffer.from(String(bodySecret));
            const adminBuf = Buffer.from(adminSecret);
            isAdmin = secretBuf.length === adminBuf.length && timingSafeEqual(secretBuf, adminBuf);
        }
    }

    if (!isCron && !isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const results = [];
        for (const key of KEYS_TO_DELETE) {
            const response = await fetch(`${kvUrl}/del/${key}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}` }
            });
            const data = await response.json();
            results.push({ key, deleted: data.result });
        }

        console.log('Leaderboard reset:', JSON.stringify(results));
        return res.status(200).json({
            success: true,
            message: 'Fishing leaderboard wiped',
            results,
            triggeredBy: isCron ? 'cron' : 'admin',
            at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Leaderboard reset error:', err);
        return res.status(500).json({ error: 'Reset failed' });
    }
}
