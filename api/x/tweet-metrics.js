// Vercel Serverless Function - Daily tweet metrics fetcher
// Cron: reads posted tweets, fetches engagement from X API v2, stores in KV
import { kvHset, kvHgetall } from '../../lib/swap-utils.js';
import { oauthGet } from '../../lib/x-utils.js';

const POSTED_LOG_KEY = 'x:posted_log';
const METRICS_KEY = 'x:tweet_metrics';
const STALENESS_MS = 20 * 60 * 60 * 1000; // 20 hours
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default async function handler(req, res) {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const cronSecret = process.env.CRON_SECRET;

    if (!kvUrl || !kvToken) {
        return res.status(503).json({ error: 'Service unavailable' });
    }

    // Auth: CRON_SECRET bearer token
    const authHeader = req.headers['authorization'];
    if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // 1. Read last 50 posted tweets from the list
        const listRes = await fetch(`${kvUrl}/lrange/${POSTED_LOG_KEY}/-50/-1`, {
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
        const listData = await listRes.json();
        const entries = (listData.result || []).map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; }
            catch { return null; }
        }).filter(Boolean);

        if (entries.length === 0) {
            return res.status(200).json({ success: true, message: 'No posted tweets found', fetched: 0 });
        }

        // 2. Get existing metrics to check staleness
        const existingMetrics = await kvHgetall(METRICS_KEY, kvUrl, kvToken).catch(() => null) || {};

        // 3. Filter to tweets < 7 days old without fresh metrics
        const now = Date.now();
        const force = req.query?.force === 'true';
        const needsFetch = entries.filter(e => {
            if (!e.tweetId) return false;
            const age = now - (e.postedAt || 0);
            if (age > MAX_AGE_MS) return false;
            if (!force) {
                const existing = existingMetrics[e.tweetId];
                if (existing && (now - (existing.fetchedAt || 0)) < STALENESS_MS) return false;
            }
            return true;
        });

        if (needsFetch.length === 0) {
            return res.status(200).json({ success: true, message: 'All metrics fresh', fetched: 0 });
        }

        // 4. Fetch engagement via X API v2 (batch up to 100 IDs)
        const tweetIds = needsFetch.map(e => e.tweetId);
        const data = await oauthGet('https://api.x.com/2/tweets', {
            ids: tweetIds.join(','),
            'tweet.fields': 'public_metrics,created_at'
        });

        // 5. Store metrics in KV hash
        let stored = 0;
        const tweets = data.data || [];
        // Build a lookup from posted log for tweet text
        const textLookup = {};
        for (const e of entries) {
            if (e.tweetId) textLookup[e.tweetId] = { text: e.text, postedAt: e.postedAt };
        }

        for (const t of tweets) {
            const pm = t.public_metrics || {};
            const posted = textLookup[t.id] || {};
            const metrics = {
                tweetId: t.id,
                text: posted.text || '',
                likes: pm.like_count || 0,
                retweets: pm.retweet_count || 0,
                replies: pm.reply_count || 0,
                impressions: pm.impression_count || 0,
                engagement: (pm.like_count || 0) + (pm.retweet_count || 0) + (pm.reply_count || 0),
                postedAt: posted.postedAt || null,
                fetchedAt: now
            };
            await kvHset(METRICS_KEY, t.id, metrics, kvUrl, kvToken);
            stored++;
        }

        return res.status(200).json({ success: true, fetched: stored, total: tweetIds.length });

    } catch (err) {
        console.error('Tweet metrics error:', err);
        return res.status(500).json({ error: 'Failed to fetch tweet metrics' });
    }
}
