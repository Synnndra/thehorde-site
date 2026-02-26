// Vercel Serverless Function - Orc Advisor Chat (Claude AI)
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    kvHget,
    kvHset
} from '../lib/swap-utils.js';
import { getOrcHoldings, kvGet, kvSet } from '../lib/dao-utils.js';
import {
    ORC_SYSTEM_PROMPT, DRAK_TOOLS, executeTool,
    fetchDrakContext, buildLiveContext, runDrakLoop,
    extractAndSaveMemory, saveToReviewQueue, trackUsage
} from '../lib/drak-core.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const heliusApiKey = process.env.HELIUS_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!kvUrl || !kvToken) {
        return res.status(503).json({ error: 'Service unavailable' });
    }
    if (!anthropicApiKey) {
        return res.status(503).json({ error: 'AI service unavailable' });
    }

    // Rate limit: 20 messages per 5 minutes per IP
    const ip = getClientIp(req);
    const limited = await isRateLimitedKV(ip, 'orc-advisor', 20, 300000, kvUrl, kvToken);
    if (limited) {
        return res.status(429).json({ error: 'Too many requests. Drak needs rest.' });
    }

    const { message, wallet, signature, msg, history } = req.body || {};

    // Validate inputs
    if (!message || !wallet || !signature || !msg) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!validateSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    if (typeof message !== 'string' || message.length > 500) {
        return res.status(400).json({ error: 'Message too long' });
    }

    // Verify message timestamp (30-minute window)
    const timestampMatch = msg.match(/at (\d+)$/);
    if (!timestampMatch) {
        return res.status(400).json({ error: 'Invalid message format' });
    }
    const messageTimestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();
    if (now - messageTimestamp > 30 * 60 * 1000) {
        return res.status(400).json({ error: 'Session expired - please reconnect your wallet' });
    }
    if (messageTimestamp > now + 60000) {
        return res.status(400).json({ error: 'Invalid message timestamp' });
    }

    // Verify signature
    if (!verifySignature(msg, signature, wallet)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Verify orc holdings server-side (cached 30 min)
    const holdingsCacheKey = `holdings:cache:${wallet}`;
    let holdingsData = await kvGet(holdingsCacheKey, kvUrl, kvToken).catch(() => null);
    if (!holdingsData || Date.now() - (holdingsData.cachedAt || 0) > 30 * 60 * 1000) {
        holdingsData = await getOrcHoldings(wallet, heliusApiKey);
        holdingsData.cachedAt = Date.now();
        await kvSet(holdingsCacheKey, holdingsData, kvUrl, kvToken).catch(() => {});
    }
    if (holdingsData.orcCount < 1) {
        return res.status(403).json({ error: 'You need at least 1 Orc to consult the advisor' });
    }

    // Fetch slim context (market data, admin KB, prompt rules, user memory)
    const ctx = await fetchDrakContext({ kvUrl, kvToken, userMemoryKey: `drak:memory:${wallet}` });

    // Cross-platform memory: merge Discord memory if wallet is linked
    let linkedDiscordId = null;
    try {
        const discordInfo = await kvHget('holders:discord_map:h', wallet, kvUrl, kvToken);
        if (discordInfo?.id) {
            linkedDiscordId = discordInfo.id;
            // Store reverse link so Discord endpoint can find the wallet
            kvHset('drak:memory:links', discordInfo.id, wallet, kvUrl, kvToken).catch(() => {});
            const discordMemory = await kvGet(`drak:memory:discord:${discordInfo.id}`, kvUrl, kvToken).catch(() => null);
            if (discordMemory?.summary) {
                if (ctx.userMemory?.summary) {
                    ctx.userMemory.summary = ctx.userMemory.summary + ' | From Discord: ' + discordMemory.summary;
                } else {
                    ctx.userMemory = discordMemory;
                }
            }
        }
    } catch {}

    const liveContext = buildLiveContext({
        ...ctx,
        userLabel: 'this warrior',
        userContextLine: `The warrior you're speaking with: wallet ${wallet}, holds ${holdingsData.orcCount} orc(s).`
    });

    // Build conversation with history
    const messages = [];
    if (Array.isArray(history)) {
        const validHistory = history.slice(-10).filter(function(h) {
            return h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.length > 0;
        }).map(function(h) {
            if (h.role === 'assistant') {
                const cleaned = h.content.replace(/\*[^*]+\*\s*/g, '').slice(0, 500);
                return { role: 'assistant', content: '[Drak previously said]: ' + cleaned };
            }
            return { role: 'user', content: h.content.slice(0, 500) };
        });
        messages.push(...validHistory);
    }
    messages.push({ role: 'user', content: message });

    try {
        // System blocks: static lore (cached) + live context (cached)
        const systemBlocks = [
            { type: 'text', text: ORC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
        ];
        if (liveContext) {
            systemBlocks.push({ type: 'text', text: liveContext, cache_control: { type: 'ephemeral' } });
        }

        const leaderboardCache = { data: null };
        const vectorConfig = {
            openaiApiKey: process.env.OPENAI_API_KEY,
            vectorUrl: process.env.UPSTASH_VECTOR_URL,
            vectorToken: process.env.UPSTASH_VECTOR_TOKEN
        };
        const toolExecutor = (name, input) => executeTool(name, input, kvUrl, kvToken, leaderboardCache, vectorConfig);

        const { reply, usage } = await runDrakLoop({
            anthropicApiKey, systemBlocks, messages, tools: DRAK_TOOLS, toolExecutor, maxIterations: 3
        });

        // Fire-and-forget: review queue, memory extraction, usage stats
        saveToReviewQueue({ kvUrl, kvToken, question: message, reply, extraFields: { wallet } });
        extractAndSaveMemory({
            anthropicApiKey, kvUrl, kvToken,
            memoryKey: `drak:memory:${wallet}`,
            existingSummary: ctx.userMemory?.summary || '',
            source: 'website',
            userLabel: 'User',
            question: message, reply
        });
        // Also save to Discord memory key if linked
        if (linkedDiscordId) {
            extractAndSaveMemory({
                anthropicApiKey, kvUrl, kvToken,
                memoryKey: `drak:memory:discord:${linkedDiscordId}`,
                existingSummary: ctx.userMemory?.summary || '',
                source: 'website',
                userLabel: 'User',
                question: message, reply,
                extraFields: { discordId: linkedDiscordId }
            });
        }
        trackUsage({ kvUrl, kvToken, userKey: wallet });

        return res.status(200).json({ reply, tokens: usage?.output_tokens || 0 });
    } catch (err) {
        console.error('Claude API error:', err);
        return res.status(500).json({ error: 'The spirit realm is disturbed. Try again.' });
    }
}
