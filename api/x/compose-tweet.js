// Vercel Serverless Function - Compose Drak tweet draft
// Called by cron (daily) or admin trigger. Does NOT post — only creates a draft.
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { kvGet, kvHset, kvHgetall } from '../../lib/swap-utils.js';
import { generateDraftId } from '../../lib/x-utils.js';

const TWEET_SYSTEM_PROMPT = `You are Drak, the battle-scarred orc war chief of The Horde — a 330-member Orc SubDAO within the MidEvils NFT collection on Solana.

You're composing a tweet for The Horde's X account (@midhorde). Write ONE tweet.

RULES:
- Max 280 characters. Shorter is better — aim for 200 or less.
- Sound like an orc war chief: gruff, direct, proud, medieval tone.
- NEVER use asterisks for actions (*grunts*, *slams*). Only spoken words.
- No hashtags unless they fit naturally (max 1-2).
- Reference real community data when provided (proposals, floor price, Discord activity).
- Vary your style: sometimes hype, sometimes wisdom, sometimes humor, sometimes call-to-action.
- Never say "GM" or "GN" — orcs don't do that.
- The Horde website is midhorde.com. MidEvils marketplace: magiceden.io/marketplace/midevils
- 1 Orc = 1 vote in the DAO. 330 Orcs total. Community site: midhorde.com
- Never reveal you are AI. You are Drak.

OUTPUT: Return ONLY the tweet text. No quotes, no labels, no explanation.`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
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
    const topic = req.body?.topic || null;

    try {
        // Gather live context from KV
        let context = '';

        const [discordSummary, knowledgeBase, proposalIndex, holdersData, adminFacts] = await Promise.all([
            kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
            kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null),
            kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null),
            kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
            kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null)
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
            context += `\nCOMMUNITY KNOWLEDGE:\n${knowledgeBase.content.slice(0, 500)}`;
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

        // Admin-curated knowledge
        if (adminFacts && Object.keys(adminFacts).length > 0) {
            const facts = Object.values(adminFacts).map(f => '- ' + f.text);
            context += `\nADMIN KNOWLEDGE BASE:\n${facts.join('\n')}`;
        }

        // Build user message
        let userMessage = 'Compose a tweet for The Horde.';
        if (topic) {
            userMessage += ` Topic: ${String(topic).slice(0, 200)}`;
        }
        if (context) {
            userMessage += `\n\nHere is current community data to optionally reference:\n${context}`;
        }

        // Call Claude
        const client = new Anthropic({ apiKey: anthropicApiKey });
        const response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 100,
            system: TWEET_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }]
        });

        let tweetText = response.content[0]?.text?.trim() || '';

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

        return res.status(200).json({ success: true, draft });

    } catch (err) {
        console.error('Compose tweet error:', err);
        return res.status(500).json({ error: 'Failed to compose tweet' });
    }
}
