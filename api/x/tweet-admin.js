// Vercel Serverless Function - Admin Tweet Queue Management
import { timingSafeEqual } from 'crypto';
import {
    kvHset, kvHget, kvHdel, kvHgetall, kvGet, getClientIp, isRateLimitedKV
} from '../../lib/swap-utils.js';
import { postTweet, uploadMedia, generateDraftId, searchRecentTweets, retweetPost, likePost } from '../../lib/x-utils.js';

const DRAFTS_KEY = 'x:drafts';
const POSTED_LOG_KEY = 'x:posted_log';
const ENGAGEMENT_KEY = 'x:engagement_suggestions';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const adminSecret = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!adminSecret) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!kvUrl || !kvToken) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rate limit: 5 per minute per IP
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'tweet-admin', 20, 60000, kvUrl, kvToken)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        const { secret, mode, draftId, text, topic, imageBase64, imageMimeType, tweetId, suggestionId } = req.body;

        // Auth
        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(adminSecret);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // ---- LIST: return all drafts sorted by date ----
        if (mode === 'list') {
            // Fetch keys first, then each draft individually to avoid hgetall size limit
            const keysRes = await fetch(kvUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(['HKEYS', DRAFTS_KEY])
            });
            const keysData = await keysRes.json();
            const keys = keysData.result || [];

            const drafts = [];
            for (const key of keys) {
                const d = await kvHget(DRAFTS_KEY, key, kvUrl, kvToken);
                if (!d) continue;
                const { generatedImageBase64, ...rest } = d;
                drafts.push({ ...rest, hasImage: !!generatedImageBase64 });
            }
            drafts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return res.status(200).json({ drafts });
        }

        // ---- GET: return single draft with full image data ----
        if (mode === 'get') {
            if (!draftId) return res.status(400).json({ error: 'draftId required' });
            const draft = await kvHget(DRAFTS_KEY, draftId, kvUrl, kvToken);
            if (!draft) return res.status(404).json({ error: 'Draft not found' });
            return res.status(200).json({ draft });
        }

        // ---- APPROVE: approve draft, optionally edit, post to X ----
        if (mode === 'approve') {
            if (!draftId) {
                return res.status(400).json({ error: 'draftId required' });
            }

            const draft = await kvHget(DRAFTS_KEY, draftId, kvUrl, kvToken);
            if (!draft) {
                return res.status(404).json({ error: 'Draft not found' });
            }
            if (draft.status !== 'pending' && draft.status !== 'failed') {
                return res.status(400).json({ error: `Cannot approve draft with status "${draft.status}"` });
            }

            // Use edited text if provided, otherwise original
            const tweetText = (text && typeof text === 'string' && text.trim())
                ? text.trim()
                : draft.text;

            if (tweetText.length > 4000) {
                return res.status(400).json({ error: `Tweet too long (${tweetText.length}/4000)` });
            }
            if (tweetText.length === 0) {
                return res.status(400).json({ error: 'Tweet text is empty' });
            }

            let finalText = tweetText;

            // Post to X (upload media first if provided)
            try {
                let mediaIds = null;
                if (imageBase64) {
                    const mediaId = await uploadMedia(imageBase64, imageMimeType || 'image/png');
                    mediaIds = [mediaId];
                }
                const result = await postTweet(finalText, mediaIds, draft.quoteTweetId || null);

                draft.status = 'posted';
                draft.editedText = text ? tweetText : null;
                draft.reviewedBy = 'admin';
                draft.postedAt = Date.now();
                draft.tweetId = result.tweetId;
                draft.error = null;
                draft.generatedImageBase64 = null; // Strip image after posting to keep KV hash under 10MB

                await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);

                // Append to posted log (RPUSH)
                const logEntry = JSON.stringify({
                    draftId: draft.id,
                    text: tweetText,
                    tweetId: result.tweetId,
                    postedAt: draft.postedAt,
                    source: draft.source
                });
                await fetch(kvUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(['RPUSH', POSTED_LOG_KEY, logEntry])
                });

                return res.status(200).json({ success: true, draft, tweetId: result.tweetId });

            } catch (postErr) {
                draft.status = 'failed';
                draft.error = postErr.message;
                await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);
                return res.status(500).json({ error: 'Failed to post tweet', detail: postErr.message, draft });
            }
        }

        // ---- REJECT: delete draft from KV ----
        if (mode === 'reject') {
            if (!draftId) {
                return res.status(400).json({ error: 'draftId required' });
            }

            await kvHdel(DRAFTS_KEY, draftId, kvUrl, kvToken);
            return res.status(200).json({ success: true });
        }

        // ---- DELETE: remove draft from hash ----
        if (mode === 'delete') {
            if (!draftId) {
                return res.status(400).json({ error: 'draftId required' });
            }

            await kvHdel(DRAFTS_KEY, draftId, kvUrl, kvToken);
            return res.status(200).json({ success: true });
        }

        // ---- RETRY: re-attempt posting a failed draft ----
        if (mode === 'retry') {
            if (!draftId) {
                return res.status(400).json({ error: 'draftId required' });
            }

            const draft = await kvHget(DRAFTS_KEY, draftId, kvUrl, kvToken);
            if (!draft) {
                return res.status(404).json({ error: 'Draft not found' });
            }
            if (draft.status !== 'failed') {
                return res.status(400).json({ error: 'Can only retry failed drafts' });
            }

            // Reset to pending so approve flow can be used
            draft.status = 'pending';
            draft.error = null;
            await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);

            return res.status(200).json({ success: true, draft });
        }

        // ---- QUEUE: add pre-written draft directly (no AI rewrite) ----
        if (mode === 'queue') {
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'text required' });
            }
            const tweetText = text.trim();
            if (tweetText.length > 4000) {
                return res.status(400).json({ error: `Tweet too long (${tweetText.length}/4000)` });
            }

            const draftId = generateDraftId();
            const draft = {
                id: draftId,
                text: tweetText,
                suggestedTags: [],
                imageIdea: null,
                source: 'campaign',
                topic: topic || null,
                status: 'pending',
                createdAt: Date.now(),
                reviewedBy: null,
                editedText: null,
                postedAt: null,
                tweetId: null,
                error: null
            };

            await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);
            return res.status(200).json({ success: true, draft });
        }

        // ---- COMPOSE: trigger Drak to compose on a specific topic ----
        if (mode === 'compose') {
            // Forward to compose-tweet endpoint internally
            const proto = req.headers['x-forwarded-proto'] || 'http';
            const composeUrl = `${proto}://${req.headers.host}/api/x/compose-tweet`;
            const composeRes = await fetch(composeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, topic: topic || null })
            });
            const composeData = await composeRes.json();
            if (!composeRes.ok) {
                return res.status(composeRes.status).json(composeData);
            }
            return res.status(200).json(composeData);
        }

        // ---- HISTORY: return last 50 posted tweets ----
        if (mode === 'history') {
            try {
                const histRes = await fetch(`${kvUrl}/lrange/${POSTED_LOG_KEY}/-50/-1`, {
                    headers: { 'Authorization': `Bearer ${kvToken}` }
                });
                const histData = await histRes.json();
                const entries = (histData.result || []).map(item => {
                    try { return typeof item === 'string' ? JSON.parse(item) : item; }
                    catch { return item; }
                }).reverse(); // newest first
                return res.status(200).json({ history: entries });
            } catch {
                return res.status(200).json({ history: [] });
            }
        }

        // ---- METRICS: return tweet performance metrics ----
        if (mode === 'metrics') {
            const metrics = await kvHgetall('x:tweet_metrics', kvUrl, kvToken) || {};
            const entries = Object.values(metrics)
                .sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
            return res.status(200).json({ metrics: entries });
        }

        // ---- FETCH-METRICS: manually trigger metrics cron ----
        if (mode === 'fetch-metrics') {
            const cronSecret = process.env.CRON_SECRET;
            if (!cronSecret) {
                return res.status(500).json({ error: 'CRON_SECRET not configured' });
            }
            const proto = req.headers['x-forwarded-proto'] || 'http';
            const metricsUrl = `${proto}://${req.headers.host}/api/x/tweet-metrics?force=true`;
            const metricsRes = await fetch(metricsUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${cronSecret}` }
            });
            const metricsData = await metricsRes.json();
            if (!metricsRes.ok) {
                return res.status(metricsRes.status).json(metricsData);
            }
            return res.status(200).json(metricsData);
        }

        // ---- GET-THEMES: return day-of-week tweet themes ----
        if (mode === 'get-themes') {
            const themes = await kvHgetall('drak:tweet_themes', kvUrl, kvToken) || {};
            return res.status(200).json({ themes });
        }

        // ---- SET-THEMES: update day-of-week tweet themes ----
        if (mode === 'set-themes') {
            const { themes } = req.body;
            if (!themes || typeof themes !== 'object') {
                return res.status(400).json({ error: 'themes object required, e.g. { monday: "motivation", tuesday: "community spotlight" }' });
            }
            const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            for (const [day, theme] of Object.entries(themes)) {
                if (!validDays.includes(day.toLowerCase())) {
                    return res.status(400).json({ error: `Invalid day: ${day}` });
                }
                if (typeof theme !== 'string') {
                    return res.status(400).json({ error: `Theme for ${day} must be a string` });
                }
                await kvHset('drak:tweet_themes', day.toLowerCase(), theme.trim(), kvUrl, kvToken);
            }
            const updated = await kvHgetall('drak:tweet_themes', kvUrl, kvToken) || {};
            return res.status(200).json({ success: true, themes: updated });
        }

        // ---- SUGGEST-RETWEETS: search for community posts to engage with ----
        if (mode === 'suggest-retweets') {
            // Load monitored accounts for scoring
            const monitoredAccounts = await kvGet('drak:research_accounts', kvUrl, kvToken).catch(() => null);
            const monitoredList = Array.isArray(monitoredAccounts) ? monitoredAccounts.map(h => h.toLowerCase()) : [];

            // Priority scoring function
            function scoreSuggestion(s) {
                let score = 0;
                // Follower reach (0-30) — log scale
                const followers = s.followers || 0;
                score += Math.min(30, Math.round(Math.log10(followers + 1) * 10));
                // Recency (0-25) — full points for last hour, decays over 7 days
                const ageHours = (Date.now() - new Date(s.createdAt || s.foundAt).getTime()) / 3600000;
                score += Math.max(0, Math.round(25 * (1 - ageHours / 168)));
                // Visibility potential (0-20) — higher engagement = trending, worth joining
                const totalEng = (s.metrics?.like_count || 0) + (s.metrics?.retweet_count || 0) + (s.metrics?.reply_count || 0);
                score += Math.min(20, Math.round(Math.log10(totalEng + 1) * 8));
                // Community member bonus (25)
                if (monitoredList.includes((s.username || '').toLowerCase())) {
                    score += 25;
                }
                return Math.min(100, score);
            }

            // Check cache first (6-hour TTL) — skip if forceRefresh
            const forceRefresh = req.body.forceRefresh === true;
            const cached = await kvHgetall(ENGAGEMENT_KEY, kvUrl, kvToken);
            const cachedEntries = cached ? Object.values(cached) : [];
            const pendingCached = cachedEntries.filter(s => s.status !== 'dismissed');

            // If we have cached pending suggestions less than 6h old, return them
            if (!forceRefresh && pendingCached.length > 0) {
                const newest = Math.max(...cachedEntries.map(s => s.foundAt || 0));
                if (Date.now() - newest < 6 * 60 * 60 * 1000) {
                    // Score any entries missing priority
                    cachedEntries.forEach(s => { if (s.priority == null) s.priority = scoreSuggestion(s); });
                    cachedEntries.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                    return res.status(200).json({ suggestions: cachedEntries, cached: true });
                }
            }

            // Build search queries from monitored accounts (each must stay under 512 chars for X API)
            // Split across multiple queries if needed, then merge & dedupe results
            const baseClauses = '@midhorde OR @MidEvilsNFT OR #MidEvils OR #TheHorde OR "midevils" OR "mid horde"';
            const suffix = ' -from:midhorde -is:retweet';
            const maxLen = 512;

            // Partition accounts into batches that fit the query limit
            const batches = [];
            if (monitoredList.length > 0) {
                let current = [];
                for (const h of monitoredList) {
                    const candidate = current.length > 0 ? current.join(' OR ') + ' OR from:' + h : 'from:' + h;
                    const fullLen = 1 + candidate.length + 4 + baseClauses.length + 1 + suffix.length;
                    if (fullLen > maxLen && current.length > 0) {
                        batches.push(current);
                        current = [];
                    }
                    current.push('from:' + h);
                }
                if (current.length > 0) batches.push(current);
            }

            // Always run at least the base clauses query; add from-clauses per batch
            const queries = batches.length > 0
                ? batches.map(parts => `(${parts.join(' OR ')} OR ${baseClauses})${suffix}`)
                : [`(${baseClauses})${suffix}`];

            // Run all queries (sequentially to stay within rate limits)
            const seenIds = new Set();
            const mergedTweets = [];
            for (const query of queries) {
                const results = await searchRecentTweets(query, 20);
                for (const t of results.tweets) {
                    if (!seenIds.has(t.id)) {
                        seenIds.add(t.id);
                        mergedTweets.push(t);
                    }
                }
            }
            const results = { tweets: mergedTweets };

            // Build suggestions, preserving status of already-actioned ones
            const existingMap = {};
            for (const e of cachedEntries) {
                if (e.tweetId) existingMap[e.tweetId] = e;
            }

            const suggestions = [];
            for (const t of results.tweets) {
                const existing = existingMap[t.id];
                if (existing) {
                    // Preserve existing entry with action flags, refresh metrics
                    existing.metrics = t.metrics;
                    existing.followers = t.followers || existing.followers || 0;
                    existing.createdAt = existing.createdAt || t.createdAt;
                    // Migrate legacy single-status to boolean flags
                    if (existing.status === 'retweeted') { existing.retweeted = true; existing.status = 'pending'; }
                    if (existing.status === 'liked') { existing.liked = true; existing.status = 'pending'; }
                    if (existing.status === 'quoted') { existing.quoted = true; existing.status = 'pending'; }
                    existing.priority = scoreSuggestion(existing);
                    suggestions.push(existing);
                    await kvHset(ENGAGEMENT_KEY, existing.id, existing, kvUrl, kvToken);
                    continue;
                }
                const sid = 'eng_' + t.id;
                const suggestion = {
                    id: sid,
                    tweetId: t.id,
                    text: t.text,
                    username: t.username,
                    followers: t.followers || 0,
                    metrics: t.metrics,
                    createdAt: t.createdAt,
                    status: 'pending',
                    foundAt: Date.now()
                };
                suggestion.priority = scoreSuggestion(suggestion);
                suggestions.push(suggestion);
                await kvHset(ENGAGEMENT_KEY, sid, suggestion, kvUrl, kvToken);
            }

            // Sort by priority score (highest first)
            suggestions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

            // Set TTL on the hash (6 hours) via raw Redis EXPIRE
            await fetch(kvUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(['EXPIRE', ENGAGEMENT_KEY, 21600])
            });

            return res.status(200).json({ suggestions, cached: false });
        }

        // ---- RETWEET: retweet a specific tweet ----
        if (mode === 'retweet') {
            if (!tweetId) return res.status(400).json({ error: 'tweetId required' });
            await retweetPost(tweetId);
            // Update suggestion action flag
            const sid = 'eng_' + tweetId;
            const suggestion = await kvHget(ENGAGEMENT_KEY, sid, kvUrl, kvToken);
            if (suggestion) {
                suggestion.retweeted = true;
                await kvHset(ENGAGEMENT_KEY, sid, suggestion, kvUrl, kvToken);
            }
            return res.status(200).json({ success: true });
        }

        // ---- LIKE: like a specific tweet ----
        if (mode === 'like') {
            if (!tweetId) return res.status(400).json({ error: 'tweetId required' });
            await likePost(tweetId);
            const sid = 'eng_' + tweetId;
            const suggestion = await kvHget(ENGAGEMENT_KEY, sid, kvUrl, kvToken);
            if (suggestion) {
                suggestion.liked = true;
                await kvHset(ENGAGEMENT_KEY, sid, suggestion, kvUrl, kvToken);
            }
            return res.status(200).json({ success: true });
        }

        // ---- DISMISS-SUGGESTION: dismiss a suggestion ----
        if (mode === 'dismiss-suggestion') {
            const sid = suggestionId || (tweetId ? 'eng_' + tweetId : null);
            if (!sid) return res.status(400).json({ error: 'suggestionId or tweetId required' });
            const suggestion = await kvHget(ENGAGEMENT_KEY, sid, kvUrl, kvToken);
            if (suggestion) {
                suggestion.status = 'dismissed';
                await kvHset(ENGAGEMENT_KEY, sid, suggestion, kvUrl, kvToken);
            }
            return res.status(200).json({ success: true });
        }

        // ---- QUOTE-TWEET: create a draft that quote-tweets another tweet ----
        if (mode === 'quote-tweet') {
            if (!tweetId) return res.status(400).json({ error: 'tweetId required' });

            // Get the original tweet text for context
            const sid = 'eng_' + tweetId;
            const suggestion = await kvHget(ENGAGEMENT_KEY, sid, kvUrl, kvToken);
            const originalText = suggestion?.text || '';

            let quoteText = text || '';
            if (!quoteText.trim()) {
                // Auto-generate via Haiku
                const anthropicKey = process.env.ANTHROPIC_API_KEY;
                if (!anthropicKey) {
                    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
                }
                const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 200,
                        messages: [{ role: 'user', content: `Write a short quote-tweet reaction (1-2 sentences, under 200 chars) from Drak, an orc war chief who leads The Horde community. Be enthusiastic but stay in character. Do NOT use hashtags. Just the tweet text, nothing else.\n\nOriginal tweet: "${originalText}"` }]
                    })
                });
                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    quoteText = aiData.content?.[0]?.text || '';
                }
                if (!quoteText.trim()) {
                    quoteText = 'The Horde approves.';
                }
            }

            const newDraftId = generateDraftId();
            const draft = {
                id: newDraftId,
                text: quoteText.trim(),
                suggestedTags: [],
                imageIdea: null,
                source: 'quote',
                topic: null,
                quoteTweetId: tweetId,
                quotedUsername: suggestion?.username || null,
                status: 'pending',
                createdAt: Date.now(),
                reviewedBy: null,
                editedText: null,
                postedAt: null,
                tweetId: null,
                error: null
            };

            await kvHset(DRAFTS_KEY, newDraftId, draft, kvUrl, kvToken);

            // Update suggestion action flag
            if (suggestion) {
                suggestion.quoted = true;
                await kvHset(ENGAGEMENT_KEY, sid, suggestion, kvUrl, kvToken);
            }

            return res.status(200).json({ success: true, draft });
        }

        return res.status(400).json({ error: 'Invalid mode' });

    } catch (error) {
        console.error('Tweet admin error:', error);
        return res.status(500).json({ error: 'Tweet operation failed', detail: error.message });
    }
}
