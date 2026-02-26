// Vercel Serverless Function - Drak Discord Slash Command (/ask-drak)
import nacl from 'tweetnacl';
import { waitUntil } from '@vercel/functions';
import { isRateLimitedKV, kvHget } from '../lib/swap-utils.js';
import { kvGet, kvSet } from '../lib/dao-utils.js';
import {
    ORC_SYSTEM_PROMPT, DISCORD_ADDENDUM, DRAK_TOOLS, executeTool,
    fetchDrakContext, buildLiveContext, runDrakLoop,
    extractAndSaveMemory, saveToReviewQueue, trackUsage
} from '../lib/drak-core.js';

export const config = {
    maxDuration: 30,
    api: { bodyParser: false }
};

const THE_HORDE_CHANNEL = '1438567217787830333';

// --- Discord-specific helpers (stay here, not shared) ---

function verifyDiscordSignature(rawBody, signature, timestamp, publicKey) {
    try {
        const msg = Buffer.from(timestamp + rawBody);
        const sig = Buffer.from(signature, 'hex');
        const key = Buffer.from(publicKey, 'hex');
        return nacl.sign.detached.verify(msg, sig, key);
    } catch {
        return false;
    }
}

function truncateForDiscord(text, limit = 2000) {
    if (text.length <= limit) return text;
    const cutoff = limit - 3;
    const lastPeriod = text.lastIndexOf('. ', cutoff);
    const lastExclaim = text.lastIndexOf('! ', cutoff);
    const lastQuestion = text.lastIndexOf('? ', cutoff);
    const bestBreak = Math.max(lastPeriod, lastExclaim, lastQuestion);
    if (bestBreak > cutoff * 0.5) {
        return text.slice(0, bestBreak + 1) + '...';
    }
    return text.slice(0, cutoff) + '...';
}

async function sendFollowup(appId, interactionToken, content) {
    const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error(`Discord followup PATCH failed (${resp.status}):`, text);
    }
}

// --- Main handler ---

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const rawBody = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
    });

    // Signature verification
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const publicKey = process.env.DRAK_PUBLIC_KEY;

    if (!signature || !timestamp || !publicKey) {
        return res.status(401).json({ error: 'Missing signature' });
    }
    if (!verifyDiscordSignature(rawBody, signature, timestamp, publicKey)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody);
    const { type, data, channel_id, member, token: interactionToken, application_id } = body;

    // PING (type 1)
    if (type === 1) {
        return res.status(200).json({ type: 1 });
    }

    // Slash command (type 2)
    if (type === 2) {
        const appId = application_id;
        const kvUrl = process.env.KV_REST_API_URL;
        const kvToken = process.env.KV_REST_API_TOKEN;
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

        // Channel lock
        if (channel_id !== THE_HORDE_CHANNEL) {
            return res.status(200).json({
                type: 4,
                data: { content: "Drak only answers in #the-horde, warrior. Take your questions there.", flags: 64 }
            });
        }

        // Rate limit by Discord user ID
        const userId = member?.user?.id;
        if (userId && kvUrl && kvToken) {
            const limited = await isRateLimitedKV(userId, 'discord-drak', 20, 300000, kvUrl, kvToken);
            if (limited) {
                return res.status(200).json({
                    type: 4,
                    data: { content: "Easy there, warrior. Drak needs a breather. Try again in a few minutes.", flags: 64 }
                });
            }
        }

        const question = data?.options?.find(o => o.name === 'question')?.value;
        if (!question) {
            return res.status(200).json({
                type: 4,
                data: { content: "You didn't ask anything, brother.", flags: 64 }
            });
        }

        const discordUser = member?.user?.username || 'unknown';

        waitUntil((async () => {
            try {
                // Fetch context + Discord history + reverse wallet link in parallel
                const [ctx, discordHistory, linkedWallet] = await Promise.all([
                    fetchDrakContext({ kvUrl, kvToken, userMemoryKey: userId ? `drak:memory:discord:${userId}` : null }),
                    userId ? kvGet(`drak:discord_history:${userId}`, kvUrl, kvToken).catch(() => null) : null,
                    userId ? kvHget('drak:memory:links', userId, kvUrl, kvToken).catch(() => null) : null
                ]);

                // Cross-platform memory: merge website memory if Discord user has a linked wallet
                if (linkedWallet) {
                    try {
                        const walletMemory = await kvGet(`drak:memory:${linkedWallet}`, kvUrl, kvToken).catch(() => null);
                        if (walletMemory?.summary) {
                            if (ctx.userMemory?.summary) {
                                ctx.userMemory.summary = ctx.userMemory.summary + ' | From website: ' + walletMemory.summary;
                            } else {
                                ctx.userMemory = walletMemory;
                            }
                        }
                    } catch {}
                }

                const liveContext = buildLiveContext({
                    ...ctx,
                    userLabel: `Discord user "${discordUser}"`,
                    userContextLine: `This question comes from Discord user "${discordUser}" via the /ask-drak slash command.`
                });

                // System blocks: base prompt (cached) + Discord addendum + live context (cached)
                const systemBlocks = [
                    { type: 'text', text: ORC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: DISCORD_ADDENDUM }
                ];
                if (liveContext) {
                    systemBlocks.push({ type: 'text', text: liveContext, cache_control: { type: 'ephemeral' } });
                }

                // Build messages with conversation history
                const messages = [];
                if (Array.isArray(discordHistory) && discordHistory.length > 0) {
                    for (const ex of discordHistory.slice(-5)) {
                        messages.push({ role: 'user', content: String(ex.q).slice(0, 500) });
                        messages.push({ role: 'assistant', content: '[Drak previously said]: ' + String(ex.a).slice(0, 500) });
                    }
                }
                messages.push({ role: 'user', content: question });

                const leaderboardCache = { data: null };
                const vectorConfig = {
                    openaiApiKey: process.env.OPENAI_API_KEY,
                    vectorUrl: process.env.UPSTASH_VECTOR_URL,
                    vectorToken: process.env.UPSTASH_VECTOR_TOKEN
                };
                const toolExecutor = (name, input) => executeTool(name, input, kvUrl, kvToken, leaderboardCache, vectorConfig);

                const { reply } = await runDrakLoop({
                    anthropicApiKey, systemBlocks, messages, tools: DRAK_TOOLS, toolExecutor, maxIterations: 3
                });

                const fullReply = `> ${question}\n\n${reply}`;
                await sendFollowup(appId, interactionToken, truncateForDiscord(fullReply));

                // Save conversation history for follow-up context
                if (userId && kvUrl && kvToken) {
                    const historyKey = `drak:discord_history:${userId}`;
                    const prevHistory = Array.isArray(discordHistory) ? discordHistory.slice(-4) : [];
                    prevHistory.push({ q: question, a: reply });
                    kvSet(historyKey, prevHistory, kvUrl, kvToken).then(() =>
                        fetch(`${kvUrl}/expire/${historyKey}/3600`, { headers: { 'Authorization': `Bearer ${kvToken}` } })
                    ).catch(() => {});
                }

                // Fire-and-forget: review queue, memory extraction, usage stats
                if (kvUrl && kvToken) {
                    saveToReviewQueue({ kvUrl, kvToken, question, reply, extraFields: { source: 'discord', discordUser } });
                    extractAndSaveMemory({
                        anthropicApiKey, kvUrl, kvToken,
                        memoryKey: userId ? `drak:memory:discord:${userId}` : null,
                        existingSummary: ctx.userMemory?.summary || '',
                        source: 'discord',
                        userLabel: `Discord user "${discordUser}"`,
                        question, reply,
                        extraFields: { discordUser }
                    });
                    // Also save to wallet memory key if linked
                    if (linkedWallet) {
                        extractAndSaveMemory({
                            anthropicApiKey, kvUrl, kvToken,
                            memoryKey: `drak:memory:${linkedWallet}`,
                            existingSummary: ctx.userMemory?.summary || '',
                            source: 'discord',
                            userLabel: `Discord user "${discordUser}"`,
                            question, reply,
                            extraFields: { discordUser, wallet: linkedWallet }
                        });
                    }
                    trackUsage({ kvUrl, kvToken, userKey: `discord:${userId || 'unknown'}` });
                }
            } catch (err) {
                console.error('Discord Drak error:', err);
                await sendFollowup(appId, interactionToken, "The spirit realm is disturbed... Drak couldn't find an answer. Try again, warrior.").catch(() => {});
            }
        })());

        return res.status(200).json({ type: 5 });
    }

    return res.status(400).json({ error: 'Unknown interaction type' });
}
