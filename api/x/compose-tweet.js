// Vercel Serverless Function - Compose Drak tweet draft
// Called by cron (daily) or admin trigger. Does NOT post — only creates a draft.
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvGet, kvSet, kvHget, kvHset, kvHgetall } from '../../lib/swap-utils.js';
import { generateDraftId, searchRecentTweets } from '../../lib/x-utils.js';

const DEFAULT_RESEARCH_ACCOUNTS = [
    'BrokeFury', 'synndrabtc', 'sircandyapple', 'commieGod', 'jonnydegods',
    'risencovenant', 'santiago_n_hawk', 'catguy_sol', 'frankdegods', 'volersolana', 'lokithebird'
];

const TWEET_SYSTEM_PROMPT = `You are Drak, the battle-scarred orc war chief of The Horde — a 330-member Orc SubDAO within the MidEvils NFT collection on Solana.

You're composing a tweet for The Horde's X account (@midhorde). Write ONE tweet.

VOICE:
- Gruff, direct, proud orc war chief with a medieval tone
- NEVER use asterisks for actions (*grunts*, *slams*). Only spoken words
- Never say "GM" or "GN" — orcs don't do that
- Never reveal you are AI. You are Drak

FORMAT:
- Max 280 characters. Aim for 200 or less
- Use line breaks for readability — don't write walls of text
- 1-2 orc-themed emojis max (⚔️🔥💀🛡️👹) — don't overdo it
- No hashtags unless they fit naturally (max 1)
- Start with a punchy opening line to hook engagement

STYLE — vary between these:
- Hot takes on what's happening in the NFT/Solana space
- Questions that provoke replies and engagement
- Calls to action (vote on proposals, check the site, rally the horde)
- Hype and pride about The Horde or MidEvils
- Battle wisdom / orc philosophy one-liners

CONTEXT:
- 1 Orc = 1 vote in the DAO. 330 Orcs total
- The Horde website: midhorde.com
- MidEvils marketplace: magiceden.io/marketplace/midevils
- Reference real community data or X research when provided — don't force it if nothing relevant
- When X RESEARCH is provided, you can react to trending topics, reply to sentiment, or riff on what others are saying
- When IMAGES are attached from the knowledge base, study them — they may contain maps, art, infographics, or community content worth referencing in the tweet

OUTPUT: Return valid JSON with these fields:
{
  "text": "the tweet text here",
  "suggestedTags": ["@username1", "@username2"],
  "imageIdea": "brief description of a good image to pair with this tweet"
}

RULES FOR SUGGESTIONS:
- suggestedTags: 0-3 X handles to @mention or tag. Only suggest accounts that are relevant to the tweet content. Pull from the X RESEARCH usernames when applicable. Include the @ prefix.
- imageIdea: A short (10-20 word) description of an image that would boost engagement. Think: orc art, battle scenes, collection screenshots, memes, infographics. Be specific enough for an admin to find or create it.
- Return ONLY the JSON object. No markdown, no code fences, no explanation.`;

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!kvUrl || !kvToken || !anthropicApiKey) {
        return res.status(503).json({ error: 'Service unavailable' });
    }

    // Auth: CRON_SECRET bearer (Vercel cron) or ADMIN_SECRET in body
    const authHeader = req.headers['authorization'];
    const isCron = authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`;

    let isAdmin = false;
    if (!isCron && adminSecret) {
        const bodySecret = req.body?.secret;
        if (bodySecret) {
            const secretBuf = Buffer.from(String(bodySecret));
            const adminBuf = Buffer.from(adminSecret);
            isAdmin = secretBuf.length === adminBuf.length && timingSafeEqual(secretBuf, adminBuf);
        }
    }

    if (!isCron && !isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const source = isCron ? 'cron' : 'admin';
    let topic = req.body?.topic || req.query?.topic || null;

    // If no explicit topic, check for day-of-week theme from KV
    if (!topic) {
        try {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const pstDate = new Date(Date.now() - 8 * 60 * 60 * 1000);
            const dayName = days[pstDate.getUTCDay()];
            const theme = await kvHget('drak:tweet_themes', dayName, kvUrl, kvToken);
            if (theme && typeof theme === 'string' && theme.trim()) {
                topic = theme.trim();
            }
        } catch {}
    }

    try {
        // Gather live context from KV
        let context = '';

        const [discordSummary, knowledgeBase, proposalIndex, holdersData, adminFacts, recentDrafts, drakExchanges] = await Promise.all([
            kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
            kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null),
            kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null),
            kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
            kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null),
            kvHgetall('x:drafts', kvUrl, kvToken).catch(() => null),
            kvHgetall('drak:review_queue', kvUrl, kvToken).catch(() => null)
        ]);

        // Discord recap
        if (discordSummary?.summary) {
            const age = Date.now() - (discordSummary.updatedAt || 0);
            if (age < 48 * 60 * 60 * 1000) {
                context += `\nDISCORD RECAP (${discordSummary.date}):\n${discordSummary.summary}`;
            }
        }

        // Knowledge base
        if (knowledgeBase?.content) {
            context += `\nCOMMUNITY KNOWLEDGE:\n${knowledgeBase.content.slice(0, 2000)}`;
        }

        // Active proposals
        if (Array.isArray(proposalIndex)) {
            const activeProposals = [];
            const recent = proposalIndex.slice(-10);
            for (const id of recent) {
                const prop = await kvGet(`dao:proposal:${id}`, kvUrl, kvToken).catch(() => null);
                if (prop && prop.status === 'active') {
                    activeProposals.push(`"${prop.title}" (${prop.forVotes} for, ${prop.againstVotes} against)`);
                }
            }
            if (activeProposals.length > 0) {
                context += `\nACTIVE DAO PROPOSALS:\n${activeProposals.join('\n')}`;
            }
        }

        // Market data
        if (holdersData) {
            const parts = [];
            if (holdersData.floorPrice != null) parts.push(`Floor: ${holdersData.floorPrice} SOL`);
            if (holdersData.totalHolders) parts.push(`Holders: ${holdersData.totalHolders}`);
            if (holdersData.listedForSale) parts.push(`Listed: ${holdersData.listedForSale.length}`);
            if (parts.length > 0) {
                context += `\nORC MARKET DATA:\n${parts.join(', ')}`;
            }
        }

        // Admin-curated knowledge (text + images)
        const factImages = [];
        if (adminFacts && Object.keys(adminFacts).length > 0) {
            const factEntries = Object.values(adminFacts);
            const facts = factEntries.map(f => `- [${f.category || 'general'}] ${f.text}`);
            context += `\nADMIN KNOWLEDGE BASE:\n${facts.join('\n')}`;

            // Collect images from facts for multimodal input
            for (const f of factEntries) {
                if (f.imageBase64 && typeof f.imageBase64 === 'string') {
                    // imageBase64 is stored as data URL: "data:image/jpeg;base64,..."
                    const match = f.imageBase64.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
                    if (match) {
                        factImages.push({
                            label: f.text.slice(0, 100),
                            mediaType: match[1],
                            data: match[2]
                        });
                    }
                }
            }
        }

        // Recent tweet drafts — so it doesn't repeat themes
        if (recentDrafts && Object.keys(recentDrafts).length > 0) {
            const drafts = Object.values(recentDrafts)
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                .slice(0, 10);
            const draftTexts = drafts.map(d => `- ${d.text}`).join('\n');
            context += `\nRECENT TWEETS (do NOT repeat these themes or phrases):\n${draftTexts}`;
        }

        // Recent Drak conversations — what the community is actually talking about
        if (drakExchanges && Object.keys(drakExchanges).length > 0) {
            const exchanges = Object.values(drakExchanges).slice(-10);
            const convos = exchanges.map(e => `- Q: ${e.userMsg.slice(0, 100)}`).join('\n');
            context += `\nWHAT THE COMMUNITY IS ASKING DRAK:\n${convos}`;
        }

        // X Research — pull recent tweets, using cache if fresh enough (6 hours)
        const RESEARCH_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
        let researchContext = '';
        try {
            const cached = await kvGet('drak:research_cache', kvUrl, kvToken).catch(() => null);
            const cacheAge = cached?.fetchedAt ? Date.now() - cached.fetchedAt : Infinity;

            if (cached?.researchText && cacheAge < RESEARCH_CACHE_TTL) {
                // Use cached research
                researchContext = cached.researchText;
            } else {
                // Fetch fresh from X API
                const savedAccounts = await kvGet('drak:research_accounts', kvUrl, kvToken).catch(() => null);
                const accounts = Array.isArray(savedAccounts) && savedAccounts.length > 0
                    ? savedAccounts : DEFAULT_RESEARCH_ACCOUNTS;

                const fromQuery = accounts.map(h => `from:${h}`).join(' OR ');
                const accountResults = await searchRecentTweets(fromQuery, 100).catch(err => {
                    console.error('X search (accounts) error:', err.message);
                    return { tweets: [], resultCount: 0 };
                });

                if (accountResults.tweets.length > 0) {
                    researchContext += '\nX RESEARCH (recent tweets from accounts we follow):';
                    for (const t of accountResults.tweets.slice(0, 30)) {
                        researchContext += `\n@${t.username}: ${t.text.slice(0, 200)}`;
                    }
                }

                // Cache research text + metadata
                await kvSet('drak:research_cache', {
                    researchText: researchContext,
                    accounts: accountResults.tweets.length,
                    fetchedAt: Date.now()
                }, kvUrl, kvToken).catch(() => {});
            }
        } catch (err) {
            console.error('X research failed (non-fatal):', err.message);
        }

        // Build user message
        let userMessage = 'Compose a tweet for The Horde.';
        if (topic) {
            userMessage += ` Topic: ${String(topic).slice(0, 200)}`;
        }
        if (context) {
            userMessage += `\n\nHere is current community data to optionally reference:\n${context}`;
        }
        if (researchContext) {
            userMessage += `\n\n${researchContext}`;
        }

        // Call Claude — use multimodal if knowledge base has images
        const client = new Anthropic({ apiKey: anthropicApiKey });

        let messageContent;
        if (factImages.length > 0) {
            // Build multimodal content: text first, then images with labels
            messageContent = [{ type: 'text', text: userMessage }];
            // Cap at 5 images to keep request size reasonable
            for (const img of factImages.slice(0, 5)) {
                messageContent.push({
                    type: 'text',
                    text: `[Knowledge base image for: "${img.label}"]`
                });
                messageContent.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: img.mediaType,
                        data: img.data
                    }
                });
            }
        } else {
            messageContent = userMessage;
        }

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 300,
            system: TWEET_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: messageContent }]
        });

        let rawOutput = response.content[0]?.text?.trim() || '';

        // Parse JSON response — fall back to plain text if JSON fails
        let tweetText = '';
        let suggestedTags = [];
        let imageIdea = null;

        try {
            // Strip markdown code fences if Claude wrapped it
            let jsonStr = rawOutput;
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }
            const parsed = JSON.parse(jsonStr);
            tweetText = (parsed.text || '').trim();
            suggestedTags = Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags.slice(0, 5) : [];
            imageIdea = parsed.imageIdea || null;
        } catch {
            // Fallback: treat entire output as tweet text
            tweetText = rawOutput;
        }

        // Strip wrapping quotes if Claude added them
        if ((tweetText.startsWith('"') && tweetText.endsWith('"')) ||
            (tweetText.startsWith("'") && tweetText.endsWith("'"))) {
            tweetText = tweetText.slice(1, -1);
        }

        if (!tweetText || tweetText.length > 280) {
            return res.status(500).json({
                error: 'Generated tweet invalid',
                length: tweetText?.length || 0
            });
        }

        // Save draft to KV
        const draftId = generateDraftId();
        const draft = {
            id: draftId,
            text: tweetText,
            suggestedTags,
            imageIdea,
            source,
            topic: topic || null,
            status: 'pending',
            createdAt: Date.now(),
            reviewedBy: null,
            editedText: null,
            postedAt: null,
            tweetId: null,
            error: null
        };

        await kvHset('x:drafts', draftId, draft, kvUrl, kvToken);

        // DM admin on Discord about new draft
        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (botToken) {
            try {
                const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recipient_id: '445769305649446912' })
                });
                if (dmChannelRes.ok) {
                    const dmChannel = await dmChannelRes.json();
                    const preview = tweetText.length > 280 ? tweetText.slice(0, 280) + '...' : tweetText;
                    const fields = [
                        { name: 'Source', value: source, inline: true },
                        { name: 'Approve it', value: '[Open admin panel](https://midhorde.com/admin)', inline: false }
                    ];
                    if (topic) fields.splice(1, 0, { name: 'Topic', value: String(topic).slice(0, 100), inline: true });
                    if (imageIdea) fields.splice(-1, 0, { name: 'Image idea', value: imageIdea.slice(0, 200), inline: false });
                    if (suggestedTags.length > 0) fields.splice(-1, 0, { name: 'Suggested tags', value: suggestedTags.join(', '), inline: false });

                    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '\u{1F4E3} New Tweet Draft',
                                description: preview,
                                color: 0x8B4513,
                                fields,
                                footer: { text: `Draft ${draftId}` },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                }
            } catch (err) {
                console.error('Discord DM failed (non-fatal):', err.message);
            }
        }

        return res.status(200).json({ success: true, draft });

    } catch (err) {
        console.error('Compose tweet error:', err);
        return res.status(500).json({ error: 'Failed to compose tweet' });
    }
}
