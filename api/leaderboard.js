// Vercel Serverless Function for Horde Defense Leaderboard

export default async function handler(req, res) {
    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    // Helper to make KV requests
    async function kvFetch(command) {
        const response = await fetch(`${KV_REST_API_URL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        });
        return response.json();
    }

    const LEADERBOARD_KEY = 'horde:leaderboard';
    const MAX_SCORES = 50; // Keep top 50 scores

    try {
        // GET - Fetch leaderboard
        if (req.method === 'GET') {
            const result = await kvFetch(['GET', LEADERBOARD_KEY]);
            const scores = result.result ? JSON.parse(result.result) : [];
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
            const result = await kvFetch(['GET', LEADERBOARD_KEY]);
            const scores = result.result ? JSON.parse(result.result) : [];

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
            await kvFetch(['SET', LEADERBOARD_KEY, JSON.stringify(topScores)]);

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
