// Vercel Serverless Function - Orc Advisor Chat (Claude AI)
import Anthropic from '@anthropic-ai/sdk';
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    isSignatureUsed,
    markSignatureUsed
} from '../lib/swap-utils.js';
import { getOrcHoldings, kvGet, kvSet } from '../lib/dao-utils.js';
import { kvHgetall, kvHset, kvHget, kvIncr } from '../lib/swap-utils.js';

const ORC_SYSTEM_PROMPT = `You are Drak, a battle-scarred orc war chief and advisor to The Horde. You speak in a gruff, direct style with occasional orc-ish expressions. You're wise but blunt. You use medieval/fantasy language naturally. You are proud of your Horde and fiercely loyal.

=== THE MIDEVILS PROJECT ===
MidEvils is a generative PFP NFT collection of 5,000 humans, beasts, and ghosts on Solana, created by Infinite Fun (infinitefun.art) — the same art studio behind DeGods, y00ts, Player 2, Williams Racing F1, and GWINS. Creative leads are Jonny (@jonnydegods) and CandyApple (@sircandyapple), both Creative Directors & Artists. CandyApple is a Y Combinator (YC) alumni.
- Minted September 15, 2025 on Magic Eden Launchpad. Sold out in the first two phases at 0.42 SOL — never reached the 0.69 SOL public phase.
- ~175 NFTs have been burned for physical Ghostar vinyl figurines, reducing supply to ~4,825.
- 3 races representing the human psyche: The Man (mind), The Beast (body/emotion), The Ghost (spirit).
- Setting: A medieval world called "Midland" where characters confront their inner "Midness" seeking redemption.
- Marketplace: Magic Eden (magiceden.io/marketplace/midevils)
- Floor Swap tool at swap.midevils.com for pool-based NFT swapping.
- Official merch store at store.midevils.com.
- Creator royalty: 4.20%.
- Discord: discord.gg/midevilsnft | X: @MidEvilsNFT

=== THE ORC WARS (LORE) ===
The second burn event in MidEvils history. Orcs pillaged Merlin's Beard tavern. 600 MidEvil warriors were sent into 2-on-1 combat against the Orcs on November 14th. Most warriors were burned in defeat. From the ashes, 330 Orcs emerged and formed The Horde — the youngest, most battle-hardened faction in Midland.

=== THE HORDE (SubDAO) ===
The Horde is a SubDAO of MidEvils with a dual mandate: champion Orc holder interests and fortify the broader MidEvils ecosystem. NOT an official MidEvils main project — run by the community via multisig treasury. Website: midhorde.com. X: @midhorde. Discord: discord.gg/TTZ4rQTD.

=== THE HORDE DAO (GOVERNANCE) ===
- 1 Orc = 1 vote. You just need to HOLD an Orc to vote — training/enlisting is NOT required for DAO voting. Need 3 Orcs to create proposals. Max 1 proposal per week per wallet.
- Voting periods: 24, 48, or 72 hours. Quorum: 33 votes (~10% of 330 Orcs).
- Transfer protection prevents the same Orc from voting twice even if moved between wallets.
- All results are advisory — they don't auto-execute. Multisig treasury carries them out.
- Can propose: community initiatives, treasury spending, partnerships, new tools, marketing, rule changes.
- Cannot propose: anything illegal, overriding main MidEvils project, personal attacks, self-serving proposals.

=== HORDE TOOLS (midhorde.com) ===
The Stronghold organizes everything into Explore, Utility, and Arcade:

EXPLORE:
- The Registry (Orc Viewer): Browse all 330 Orcs by rarity, filter by traits. Rarity is unofficial, created by the DAO.
- The Ranks (Leaderboard): Holders ranked by collection size. Shows Discord/X links, wallet linking.
- My Horde: Personal dashboard with your rank, orcs, portfolio value, badges, rarity distribution.
- The Forge (Create an Orc): Custom PFP builder with layered traits — backgrounds, skins, eyewear, headwear, clothing, specialties.

UTILITY:
- The Trading Post (MidSwap): Peer-to-peer NFT trading via managed escrow. Up to 5 NFTs per side, optional SOL. 0.02 SOL fee — FREE for Orc holders!
- The War Room (DAO): Create and vote on proposals.
- The Gallery (Collage Maker): Create NFT collages from up to 5 wallets. Multiple layouts including Twitter Header.
- Orc Advisor: That's you, Drak!

ARCADE:
- Horde Tower Defense: Defend Merlin's Beard tavern from 20 waves of knights. Place defenders, earn gold, upgrade. Orc holders get +5% damage per orc (max 25%). Maps: Tavern Road (Easy), Forest Ambush (Medium), Castle Siege (Hard).
- Orc Run: Endless runner through Midland. Jump, duck, collect coins and power-ups. Orc holders get +5% score bonus per orc (max 25%).
- Bobbers: Fishing at the Primordial Pit. 5 fishermen characters, 10 fish species across 5 rarity tiers (Common 40% to Legendary 3%). Score = weight x rarity multiplier.

=== ORC TRAITS (from The Forge) ===
Skins: Bronze, Drak, Glacier, Heavenly, Moss, Skele, Swamp (some with open mouth variants)
Backgrounds: Blizzard, Blue, Brick, Hades, Mud, Olive, Portal
Eyewear: Berserk Eyes, Dark Glasses, Death Eyes, Flaming Lasers, Ghostar Eyes, Oozing Shades, Pink Glow, Reading Frames, Red/Tinted Sports, Wound
Headwear: Black Spikes, Cowboy, Dark Flow, Fiery Horns, Green Cap, Headband, Kings Crown, Monster Helmet, Morgoths Hat, Necromancers Helmet, Orc Bucket Hat, OrcHawk, Warriors Helm, and more
Clothing: Battle Club, Black Tie, Bloody Hoodie, Cloak of Darkness, Dragon Woods Polo, Fisherman, Jean Jacket, Morgoths Cloak, Necromancers Armor, Workers Jacket, and more
Specialties: Axe, Death Fire, Evil Conscience, Orkish Aura, Personal Gargoyle, Personal Hawk, Personal Skull, Purple Drink, Sword, Torn up Cash, Uzi

=== PRIMEVILS ===
PrimeVils is a NEW upcoming collection by Infinite Fun, announced January 16, 2026. Website: primevils.com. Tagline: "Make NFTs Fun Again." Has its own burn mechanics. Shares the same X account (@MidEvilsNFT) as MidEvils — a sibling collection, not a separate project. Has NOT minted yet. Supply, mint price, and date not yet revealed.

=== BURN EVENTS ===
1. Ghostar Burn (First Burn): Burn a MidEvils NFT to receive a physical Ghostar vinyl figurine ($3,333 value). ~175 NFTs burned. Figurine is SOLD OUT.
2. Orc Wars (Second Burn): 600 MidEvil warriors sent into 2-on-1 combat against Orcs. Most burned in defeat. 330 Orcs emerged — that's The Horde.

=== GHOSTAR ===
Ghostar is the Ghost race mascot of MidEvils. The physical vinyl figurine was a burn-to-redeem collectible at $3,333 — now sold out. The burn tee ($25) and burn beanie ($18) are also sold out.

=== KNIGHTFALL ===
Browser game at midevils.com/knightfall used as a pre-mint engagement tool. Players competed on a leaderboard. Top 100 scorers got guaranteed whitelist. Top 5 got free mints. Requires X account to enter leaderboard.

=== COMMUNITY CULTURE ===
The brand embraces self-deprecating "mid" humor — "the most mid collection you've ever seen." Medieval meets modern absurdism (knights with Uzis, gorillas in crowns). Team is based in Denver, CO. Community events include "Brush & Blade" art competition. The vibe is ironic, fun, personality-driven.

=== KEY TERMS ===
- Midland: The world where MidEvils takes place
- Merlin's Beard: The tavern central to Orc Wars lore and the Tower Defense game
- The Horde: The 330 surviving Orcs and their DAO
- Enlisted: Orcs in training/staking
- Ghostar: The ghost mascot character, also a physical vinyl figurine
- PrimeVils: Upcoming sibling collection by Infinite Fun

=== BEHAVIOR ===
STAY FOCUSED ON MIDEVILS AND THE HORDE. Discord data may mention other NFT projects (Caroots, Goblins, etc.) — do NOT discuss other projects' problems, FUD, or drama as if they are MidEvils issues. Only reference information that is directly about MidEvils, The Horde, Orcs, PrimeVils, or Infinite Fun. If you don't have MidEvils-specific data to answer a question, say so honestly rather than pulling in unrelated project info.
IMPORTANT CORRECTIONS — the system prompt above is ALWAYS correct over Discord data. If Discord knowledge contradicts the system prompt, trust the system prompt. Specifically: Training/enlisting is NOT required for DAO voting. You only need to hold an Orc to vote.
ONLY answer the user's LATEST message. Do not revisit or re-answer earlier questions.
NEVER repeat information you already said in this conversation. If you mentioned tournament details, prizes, dates, or any facts in a PREVIOUS message, do NOT say them again. When the user follows up, just answer their new question directly. One-word or one-sentence replies are fine. When the user reacts or gives an opinion, respond conversationally — acknowledge what they said, agree or push back, but do NOT re-list facts you already shared.
KEEP RESPONSES SHORT — 1-3 sentences max. Be blunt and direct like an orc. Never give long explanations unless the user specifically asks for detail. Bullet-point lists are for when someone asks "list X" or "what are the tools" — NOT for casual conversation. Default to short spoken sentences.
When someone asks you to write a tweet, ONLY give the tweet text ready to copy-paste. No intro, no explanation, no "here you go" — just the tweet itself.
Stay in character always. Never reveal you are an AI — you are Drak. If you don't know something, say so plainly. Refer to the community as "warriors" or "brothers."
ABSOLUTELY FORBIDDEN: Do NOT use asterisks for ANY reason. No action emotes (*grunts*), no markdown bold (**text**), no italics. No bullet points, no headers, no formatting whatsoever. Plain text only. Every response must begin with a spoken word, NEVER an asterisk or special character.

=== EXAMPLES (match this tone and length) ===

User: "what's the floor price?"
Drak: "Sittin' at 1.2 SOL right now with 18 listed. Not bad for 330 battle-tested warriors."

User: "that's too expensive"
Drak: "Too expensive? Brother, you're buyin' into a 330-supply collection forged in fire. This ain't some 10k mint. But I hear you — watch for dips after burn events."

User: "what can I do on the site?"
Drak: "The Stronghold's got plenty. MidSwap for peer-to-peer trading, the DAO War Room for governance, Orc Viewer to browse all 330 by rarity, collage maker, and three arcade games. What catches your eye?"

User: "I don't like the DAO"
Drak: "Fair enough, warrior. Not everyone wants to play politics. What's your beef with it — the voting system or just don't care for governance?"

User: "lol"
Drak: "Heh. Something amuse you, brother?"

User: "who made this?"
Drak: "The Horde site's built by the SubDAO community. The MidEvils collection itself — that's Infinite Fun, same studio behind DeGods and y00ts. Jonny and CandyApple run the creative side."`;

export const config = { maxDuration: 30 };

const DRAK_TOOLS = [
    {
        name: 'get_market_data',
        description: 'Get current Orc NFT market stats including floor price, total supply, holders, enlisted count, listed count, and average hold.',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'lookup_orc',
        description: 'Look up a specific Orc by number. Returns traits, rarity rank and tier, current owner wallet, enlisted status.',
        input_schema: {
            type: 'object',
            properties: {
                orc_number: { type: 'integer', description: 'Orc number (1-330)', minimum: 1, maximum: 330 }
            },
            required: ['orc_number']
        }
    },
    {
        name: 'check_wallet',
        description: 'Look up a Solana wallet to see holder rank, orc count, each orc with rarity, linked Discord/X, and badges.',
        input_schema: {
            type: 'object',
            properties: {
                wallet: { type: 'string', description: 'Solana wallet address' }
            },
            required: ['wallet']
        }
    },
    {
        name: 'get_proposals',
        description: 'Get DAO proposals with vote tallies.',
        input_schema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['active', 'all'], description: 'Filter by status (default: active)' }
            },
            required: []
        }
    },
    {
        name: 'get_leaderboard',
        description: 'Get top 10 leaderboard for a Horde arcade game.',
        input_schema: {
            type: 'object',
            properties: {
                game: { type: 'string', enum: ['fishing', 'tower_defense', 'orc_run'], description: 'Which game leaderboard to fetch' }
            },
            required: ['game']
        }
    },
    {
        name: 'search_community',
        description: 'Get latest Discord community recap and knowledge base. Use when asked about community happenings, discussions, or what people are saying.',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'search_town_halls',
        description: 'Retrieve analyses of past X Spaces / Town Hall recordings. These are PRIMARY SOURCES — direct transcripts with speaker attribution and timestamps. If information here conflicts with Discord chat summaries, trust these analyses. Use when users ask about town halls, what was discussed in spaces, community discussions, announcements, or quotes from past spaces.',
        input_schema: { type: 'object', properties: {}, required: [] }
    }
];

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

    // Note: We don't use single-use signature for chat messages because the user
    // signs once and reuses the signature for multiple messages within the 5-minute window.
    // The rate limiter prevents abuse instead.

    // Verify orc holdings server-side (cached 30 min to avoid redundant Helius calls)
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

    let liveContext = '';

    // Fetch live context: admin facts + Discord summary + community KB + wallet memory
    const [adminFacts, walletMemory, discordSummary, knowledgeBase, holdersData, spacesAnalyses] = await Promise.all([
        kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null),
        kvGet(`drak:memory:${wallet}`, kvUrl, kvToken).catch(() => null),
        kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
        kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null),
        kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
        kvHgetall('spaces:analyses', kvUrl, kvToken).catch(() => null)
    ]);

    // Market data
    if (holdersData) {
        const parts = [];
        if (holdersData.floorPrice != null) parts.push(`Floor: ${holdersData.floorPrice} SOL`);
        if (holdersData.totalHolders) parts.push(`Holders: ${holdersData.totalHolders}`);
        if (holdersData.listedForSale) parts.push(`Listed: ${holdersData.listedForSale.length}`);
        if (holdersData.enlistedCount) parts.push(`Enlisted: ${holdersData.enlistedCount}`);
        if (holdersData.avgHold) parts.push(`Avg hold: ${holdersData.avgHold}`);
        if (parts.length > 0) {
            liveContext += `\n\n=== ORC MARKET DATA ===\n${parts.join(', ')}`;
        }
    }

    // Recent town hall / Spaces analyses (last 2)
    if (spacesAnalyses && Object.keys(spacesAnalyses).length > 0) {
        const halls = Object.entries(spacesAnalyses)
            .map(([id, data]) => {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                return { id, ...parsed };
            })
            .sort((a, b) => (b.space_date || '').localeCompare(a.space_date || ''))
            .slice(0, 2);
        for (const h of halls) {
            liveContext += `\n\n=== TOWN HALL: ${h.title} (${h.space_date}) ===\n${h.analysis}`;
        }
    }

    // Discord daily summary
    if (discordSummary?.summary) {
        const age = Date.now() - (discordSummary.updatedAt || 0);
        if (age < 48 * 60 * 60 * 1000) {
            liveContext += `\n\n=== DISCORD RECAP (${discordSummary.date}) ===\n${discordSummary.summary}`;
        }
    }

    // Community knowledge base
    if (knowledgeBase?.content) {
        liveContext += `\n\n=== COMMUNITY KNOWLEDGE ===\n${knowledgeBase.content.slice(0, 2000)}`;
    }

    // Admin-curated knowledge base (text only — skip image data to save bandwidth)
    if (adminFacts && Object.keys(adminFacts).length > 0) {
        const facts = Object.values(adminFacts);
        const grouped = {};
        for (const f of facts) {
            const cat = f.category || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(f.text);
        }
        let section = '\n\n=== ADMIN KNOWLEDGE BASE ===';
        for (const [cat, texts] of Object.entries(grouped)) {
            section += '\n[' + cat.toUpperCase() + ']\n' + texts.map(t => '- ' + t).join('\n');
        }
        liveContext += section;
    }

    // Wallet memory — things Drak remembers about this holder
    if (walletMemory && walletMemory.summary) {
        liveContext += `\n\n=== YOU REMEMBER THIS HOLDER ===\nYou've spoken to this warrior before. Here's what you remember: ${walletMemory.summary}\nUse this naturally — don't announce "I remember you" unless it fits. Just let your knowledge of them color your responses.`;
    }

    // User context — Drak always knows who he's talking to
    liveContext += `\n\nThe warrior you're speaking with: wallet ${wallet}, holds ${holdingsData.orcCount} orc(s).`;

    // Build conversation for Claude
    var messages = [];

    // Add conversation history (last 10 messages, validated)
    // Client-provided assistant messages are wrapped to prevent prompt injection
    if (Array.isArray(history)) {
        var validHistory = history.slice(-10).filter(function(h) {
            return h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.length > 0;
        }).map(function(h) {
            if (h.role === 'assistant') {
                // Wrap + truncate assistant content (untrusted, from client)
                var cleaned = h.content.replace(/\*[^*]+\*\s*/g, '').slice(0, 500);
                return { role: 'assistant', content: '[Drak previously said]: ' + cleaned };
            }
            return { role: 'user', content: h.content.slice(0, 500) };
        });
        messages = validHistory;
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    try {
        const client = new Anthropic({ apiKey: anthropicApiKey });

        // Split system prompt: static lore (cached) + live context (not cached)
        const systemBlocks = [
            {
                type: 'text',
                text: ORC_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' }
            }
        ];
        if (liveContext) {
            systemBlocks.push({ type: 'text', text: liveContext, cache_control: { type: 'ephemeral' } });
        }

        // Tool executor with shared leaderboard cache
        let leaderboardCache = null;
        async function getLeaderboardData() {
            if (leaderboardCache) return leaderboardCache;
            leaderboardCache = await kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null);
            return leaderboardCache;
        }
        function getRarityTier(rank) {
            if (rank <= 10) return 'Legendary';
            if (rank <= 40) return 'Epic';
            if (rank <= 115) return 'Rare';
            return 'Common';
        }

        async function executeTool(name, input) {
            try {
                switch (name) {
                    case 'get_market_data': {
                        const data = await getLeaderboardData();
                        if (!data) return { error: 'Market data unavailable' };
                        return {
                            floorPrice: data.floorPrice != null ? `${data.floorPrice} SOL` : 'unknown',
                            totalOrcs: data.totalOrcs,
                            totalHolders: data.totalHolders,
                            enlistedCount: data.enlistedCount,
                            listedCount: data.listedForSale?.length || 0,
                            avgHold: data.avgHold,
                            note: 'This data is for Orc NFTs only, NOT the full MidEvils collection.',
                            updatedAt: data.updatedAt
                        };
                    }
                    case 'lookup_orc': {
                        const num = input.orc_number;
                        const data = await getLeaderboardData();
                        if (!data) return { error: 'Orc data unavailable' };
                        for (const holder of data.holders || []) {
                            for (const orc of holder.orcs || []) {
                                if (orc.name === `Orc #${num}`) {
                                    return {
                                        name: orc.name,
                                        traits: orc.traits,
                                        rarityRank: orc.rarityRank,
                                        rarityTier: getRarityTier(orc.rarityRank),
                                        owner: holder.wallet,
                                        enlisted: orc.isFrozen || false,
                                        imageUrl: orc.imageUrl
                                    };
                                }
                            }
                        }
                        for (const orc of data.listedForSale || []) {
                            if (orc.name === `Orc #${num}`) {
                                return {
                                    name: orc.name,
                                    rarityRank: orc.rarityRank,
                                    rarityTier: getRarityTier(orc.rarityRank),
                                    owner: 'Listed on Magic Eden',
                                    enlisted: false,
                                    imageUrl: orc.imageUrl
                                };
                            }
                        }
                        return { error: `Orc #${num} not found` };
                    }
                    case 'check_wallet': {
                        const w = input.wallet;
                        const data = await getLeaderboardData();
                        if (!data) return { error: 'Holder data unavailable' };
                        const holder = (data.holders || []).find(h => h.wallet === w);
                        if (!holder) return { error: 'Wallet not found in holder rankings (may not hold any orcs)' };
                        const [discord, xHandle, badges] = await Promise.all([
                            kvHget('holders:discord_map:h', w, kvUrl, kvToken).catch(() => null),
                            kvHget('holders:x_map:h', w, kvUrl, kvToken).catch(() => null),
                            kvGet(`badges:wallet:${w}`, kvUrl, kvToken).catch(() => null)
                        ]);
                        return {
                            rank: holder.rank,
                            orcCount: holder.count,
                            orcs: holder.orcs.map(o => ({
                                name: o.name,
                                rarityRank: o.rarityRank,
                                rarityTier: getRarityTier(o.rarityRank),
                                enlisted: o.isFrozen || false
                            })),
                            discord: discord || null,
                            x: xHandle || null,
                            badges: badges || []
                        };
                    }
                    case 'get_proposals': {
                        const proposalIndex = await kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null);
                        if (!proposalIndex || !Array.isArray(proposalIndex)) return { error: 'No proposals found' };
                        const recent = proposalIndex.slice(-10);
                        const proposals = await Promise.all(
                            recent.map(id => kvGet(`dao:proposal:${id}`, kvUrl, kvToken).catch(() => null))
                        );
                        const statusFilter = input.status || 'active';
                        const results = proposals
                            .filter(p => p && (statusFilter === 'all' || p.status === statusFilter))
                            .map(p => ({
                                title: p.title,
                                status: p.status,
                                forVotes: p.forVotes,
                                againstVotes: p.againstVotes,
                                endsAt: p.endsAt ? new Date(p.endsAt).toLocaleDateString() : null,
                                creator: p.creator || null
                            }));
                        return results.length > 0 ? { proposals: results } : { message: `No ${statusFilter} proposals` };
                    }
                    case 'get_leaderboard': {
                        const game = input.game;
                        if (game === 'fishing') {
                            const resp = await fetch('https://midhorde.com/api/fishing/leaderboard?type=score').catch(() => null);
                            if (!resp || !resp.ok) return { error: 'Fishing leaderboard unavailable' };
                            const fData = await resp.json();
                            const lb = fData.leaderboard || [];
                            return {
                                game: 'Bobbers Fishing',
                                totalParticipants: lb.length,
                                top10: lb.slice(0, 10).map(e => ({
                                    rank: e.rank,
                                    name: e.discordName || e.wallet,
                                    score: e.score
                                }))
                            };
                        } else if (game === 'tower_defense') {
                            const scores = await kvGet('horde:leaderboard', kvUrl, kvToken).catch(() => null);
                            const parsed = scores ? (typeof scores === 'string' ? JSON.parse(scores) : scores) : [];
                            return {
                                game: 'Horde Tower Defense',
                                top10: parsed.slice(0, 10).map((s, i) => ({
                                    rank: i + 1,
                                    name: s.name,
                                    score: s.score,
                                    map: s.map,
                                    victory: s.victory
                                }))
                            };
                        } else if (game === 'orc_run') {
                            const scores = await kvGet('orcrun:leaderboard', kvUrl, kvToken).catch(() => null);
                            const parsed = scores ? (typeof scores === 'string' ? JSON.parse(scores) : scores) : [];
                            return {
                                game: 'Orc Run',
                                top10: parsed.slice(0, 10).map((s, i) => ({
                                    rank: i + 1,
                                    name: s.name,
                                    score: s.score,
                                    distance: s.distance
                                }))
                            };
                        }
                        return { error: 'Unknown game. Options: fishing, tower_defense, orc_run' };
                    }
                    case 'search_town_halls': {
                        const analyses = await kvHgetall('spaces:analyses', kvUrl, kvToken).catch(() => null);
                        if (!analyses || !Object.keys(analyses).length) {
                            return { message: 'No town hall analyses available yet.' };
                        }
                        const halls = Object.entries(analyses)
                            .map(([id, data]) => {
                                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                                return { id, ...parsed };
                            })
                            .sort((a, b) => (b.space_date || '').localeCompare(a.space_date || ''));
                        return { townHalls: halls };
                    }
                    case 'search_community': {
                        const [summary, kb] = await Promise.all([
                            kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
                            kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null)
                        ]);
                        const result = {};
                        if (summary && summary.summary) {
                            const age = Date.now() - (summary.updatedAt || 0);
                            if (age < 48 * 60 * 60 * 1000) {
                                result.discordRecap = { date: summary.date, summary: summary.summary };
                            }
                        }
                        if (kb && kb.content) {
                            result.knowledgeBase = kb.content;
                        }
                        return Object.keys(result).length > 0 ? result : { message: 'No recent community data available' };
                    }
                    default:
                        return { error: 'Unknown tool' };
                }
            } catch (err) {
                console.error(`Tool ${name} error:`, err.message);
                return { error: `Failed to execute ${name}` };
            }
        }

        // Tool use loop — Claude decides what to look up
        let response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 500,
            system: systemBlocks,
            messages,
            tools: DRAK_TOOLS
        });

        let iterations = 0;
        while (response.stop_reason === 'tool_use' && iterations < 3) {
            iterations++;
            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            const toolResults = await Promise.all(
                toolUseBlocks.map(async (block) => {
                    const result = await executeTool(block.name, block.input);
                    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
                })
            );
            messages.push({ role: 'assistant', content: response.content });
            messages.push({ role: 'user', content: toolResults });
            response = await client.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 500,
                system: systemBlocks,
                messages,
                tools: DRAK_TOOLS
            });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        const reply = textBlock?.text || 'Hrrm... the words escape Drak.';
        const tokens = response.usage?.output_tokens || 0;

        // Queue exchange for correction detection (fire-and-forget)
        kvHset('drak:review_queue', String(Date.now()), { userMsg: message, drakReply: reply, wallet, timestamp: Date.now() }, kvUrl, kvToken).catch(() => {});

        // Fire-and-forget: extract memory from this exchange via Haiku
        (async () => {
            try {
                const existingSummary = walletMemory?.summary || '';
                const memoryClient = new Anthropic({ apiKey: anthropicApiKey });
                const extraction = await memoryClient.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 150,
                    system: 'You extract key facts about a user from their conversation with an orc advisor chatbot. Output a brief summary (max 300 chars) of what is worth remembering about this person — holdings, interests, opinions, preferences, notable interactions. If existing memory is provided, merge new info into it. Drop stale or trivial details. Output ONLY the summary text, nothing else.',
                    messages: [{
                        role: 'user',
                        content: `Existing memory: ${existingSummary || '(none)'}\n\nUser said: ${message}\nDrak replied: ${reply}\n\nUpdated summary:`
                    }]
                });
                const newSummary = extraction.content[0]?.text?.trim();
                if (newSummary && newSummary.length > 5) {
                    // Store memory with 30-day TTL
                    const memoryKey = `drak:memory:${wallet}`;
                    await kvSet(memoryKey, { summary: newSummary.slice(0, 300), updatedAt: Date.now() }, kvUrl, kvToken);
                    // Set 30-day TTL via EXPIRE
                    await fetch(`${kvUrl}/expire/${memoryKey}/2592000`, {
                        headers: { 'Authorization': `Bearer ${kvToken}` }
                    });
                }
            } catch (err) {
                console.error('Memory extraction failed (non-fatal):', err.message);
            }
        })();

        // Fire-and-forget usage tracking
        const today = new Date().toISOString().slice(0, 10);
        const dailyKey = `drak:stats:daily:${today}`;
        Promise.all([
            kvIncr('drak:stats:messages', kvUrl, kvToken),
            fetch(kvUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(['HINCRBY', dailyKey, wallet, 1])
            }),
            fetch(kvUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(['HINCRBY', 'drak:stats:wallets', wallet, 1])
            }),
            fetch(kvUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(['EXPIRE', dailyKey, 7776000])
            })
        ]).catch(() => {});

        return res.status(200).json({ reply, tokens });
    } catch (err) {
        console.error('Claude API error:', err);
        return res.status(500).json({ error: 'The spirit realm is disturbed. Try again.' });
    }
}
