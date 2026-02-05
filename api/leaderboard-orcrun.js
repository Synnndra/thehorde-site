// Vercel Serverless Function for Orc Run Leaderboard

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return false;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return true;
    }

    record.count++;
    return false;
}

export default async function handler(req, res) {
    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const LEADERBOARD_KEY = 'orcrun:leaderboard';
    const MAX_SCORES = 50;

    async function kvGet(key) {
        const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`
            }
        });
        const data = await response.json();
        return data.result;
    }

    async function kvSet(key, value) {
        const response = await fetch(`${KV_REST_API_URL}/set/${key}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(value)
        });
        return response.json();
    }

    try {
        if (req.method === 'GET') {
            const result = await kvGet(LEADERBOARD_KEY);
            const scores = result ? (typeof result === 'string' ? JSON.parse(result) : result) : [];
            return res.status(200).json({ scores });
        }

        if (req.method === 'POST') {
            const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
            if (isRateLimited(clientIp)) {
                return res.status(429).json({ error: 'Too many requests. Try again later.' });
            }

            const { name, score, distance, coins } = req.body;

            if (!name || typeof name !== 'string') {
                return res.status(400).json({ error: 'Invalid name' });
            }
            if (typeof score !== 'number' || score < 0 || score > 999999999) {
                return res.status(400).json({ error: 'Invalid score' });
            }

            const sanitizedName = name.slice(0, 12).replace(/[^a-zA-Z0-9 ]/g, '').trim();
            if (sanitizedName.length === 0) {
                return res.status(400).json({ error: 'Name cannot be empty' });
            }

            const safeDistance = typeof distance === 'number' ? Math.min(Math.max(0, Math.floor(distance)), 999999) : 0;
            const safeCoins = typeof coins === 'number' ? Math.min(Math.max(0, coins), 99999) : 0;

            const result = await kvGet(LEADERBOARD_KEY);
            const scores = result ? (typeof result === 'string' ? JSON.parse(result) : result) : [];

            const newScore = {
                name: sanitizedName,
                score: Math.floor(score),
                distance: safeDistance,
                coins: safeCoins,
                date: new Date().toISOString()
            };

            scores.push(newScore);
            scores.sort((a, b) => b.score - a.score);
            const topScores = scores.slice(0, MAX_SCORES);

            await kvSet(LEADERBOARD_KEY, topScores);

            const rank = topScores.findIndex(s =>
                s.name === newScore.name &&
                s.score === newScore.score &&
                s.date === newScore.date
            ) + 1;

            return res.status(200).json({
                success: true,
                rank: rank > 0 && rank <= 10 ? rank : null,
                isTopTen: rank > 0 && rank <= 10
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
