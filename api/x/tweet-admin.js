// Vercel Serverless Function - Admin Tweet Queue Management
import { timingSafeEqual } from 'crypto';
import {
    kvHset, kvHget, kvHdel, kvHgetall, getClientIp, isRateLimitedKV
} from '../../lib/swap-utils.js';
import { postTweet, uploadMedia, generateDraftId } from '../../lib/x-utils.js';

const DRAFTS_KEY = 'x:drafts';
const POSTED_LOG_KEY = 'x:posted_log';

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
        const { secret, mode, draftId, text, topic, imageBase64, imageMimeType } = req.body;

        // Auth
        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(adminSecret);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // ---- LIST: return all drafts sorted by date ----
        if (mode === 'list') {
            const allDrafts = await kvHgetall(DRAFTS_KEY, kvUrl, kvToken);
            const drafts = Object.values(allDrafts)
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return res.status(200).json({ drafts });
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

            // Ensure @MidEvilsNFT is always included
            let finalText = tweetText;
            if (!finalText.toLowerCase().includes('@midevilsnft')) {
                finalText = finalText.trimEnd() + '\n\n@MidEvilsNFT';
            }

            // Post to X (upload media first if provided)
            try {
                let mediaIds = null;
                if (imageBase64) {
                    const mediaId = await uploadMedia(imageBase64, imageMimeType || 'image/png');
                    mediaIds = [mediaId];
                }
                const result = await postTweet(finalText, mediaIds);

                draft.status = 'posted';
                draft.editedText = text ? tweetText : null;
                draft.reviewedBy = 'admin';
                draft.postedAt = Date.now();
                draft.tweetId = result.tweetId;
                draft.error = null;

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

        // ---- REJECT: mark draft as rejected ----
        if (mode === 'reject') {
            if (!draftId) {
                return res.status(400).json({ error: 'draftId required' });
            }

            const draft = await kvHget(DRAFTS_KEY, draftId, kvUrl, kvToken);
            if (!draft) {
                return res.status(404).json({ error: 'Draft not found' });
            }

            draft.status = 'rejected';
            draft.reviewedBy = 'admin';
            await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);

            return res.status(200).json({ success: true, draft });
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
            const metricsUrl = `${proto}://${req.headers.host}/api/x/tweet-metrics`;
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

        return res.status(400).json({ error: 'Invalid mode' });

    } catch (error) {
        console.error('Tweet admin error:', error);
        return res.status(500).json({ error: 'Tweet operation failed' });
    }
}
