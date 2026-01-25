// Vercel Serverless Function for Horde Defense Leaderboard

export default async function handler(req, res) {
    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const LEADERBOARD_KEY = 'horde:leaderboard';
    const MAX_SCORES = 50;

    // Helper for KV GET
    async function kvGet(key) {
        const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`
            }
        });
        const data = await response.json();
        return data.result;
    }

    // Helper for KV SET
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
        // GET - Fetch leaderboard
        if (req.method === 'GET') {
            const result = await kvGet(LEADERBOARD_KEY);
            const scores = result ? (typeof result === 'string' ? JSON.parse(result) : result) : [];
            return res.status(200).json({ scores });
        }

        // POST - Submit score
        if (req.method === 'POST') {
            const { name, score, map, wavesCompleted, enemiesKilled, victory } = req.body;

            // Validate input
            if (!name || typeof score !== 'number' || !map) {
                return res.status(400).json({ error: 'Invalid score data' });
            }

            // Sanitize name (max 12 chars, alphanumeric + spaces)
            const sanitizedName = name.slice(0, 12).replace(/[^a-zA-Z0-9 ]/g, '');

            // Get current scores
            const result = await kvGet(LEADERBOARD_KEY);
            const scores = result ? (typeof result === 'string' ? JSON.parse(result) : result) : [];

            // Add new score
            const newScore = {
                name: sanitizedName || 'Anonymous',
                score: Math.floor(score),
                map,
                wavesCompleted: wavesCompleted || 0,
                enemiesKilled: enemiesKilled || 0,
                victory: victory || false,
                date: new Date().toISOString()
            };

            scores.push(newScore);

            // Sort by score descending and keep top N
            scores.sort((a, b) => b.score - a.score);
            const topScores = scores.slice(0, MAX_SCORES);

            // Save back to KV
            await kvSet(LEADERBOARD_KEY, topScores);

            // Check if this score made it to top 10
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
