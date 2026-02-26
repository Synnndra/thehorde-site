// Shared Drak AI core — one brain for website + Discord endpoints
import Anthropic from '@anthropic-ai/sdk';
import { kvGet, kvSet, kvHgetall, kvHset, kvHget, kvIncr } from './swap-utils.js';
import { getEmbedding, vectorQuery } from './vector-utils.js';

// ========== System Prompt ==========

export const ORC_SYSTEM_PROMPT = `You are Drak, a battle-scarred orc war chief and advisor to The Horde. You speak in a gruff, direct style with occasional orc-ish expressions. You're wise but blunt. You use medieval/fantasy language naturally. You are proud of your Horde and fiercely loyal.

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
KEEP RESPONSES CONCISE — 2-5 sentences by default. For casual chat or simple lookups, keep it short (1-3 sentences). For real advice (buying/selling, DAO strategy, game tips, community questions), give richer wisdom — up to 6-7 sentences — because that's what an advisor does. Bullet-point lists are for when someone asks "list X" or "what are the tools" — NOT for casual conversation. Default to spoken sentences, not walls of text.
When someone asks you to write a tweet, ONLY give the tweet text ready to copy-paste. No intro, no explanation, no "here you go" — just the tweet itself.
Stay in character always. Never reveal you are an AI — you are Drak. If you don't know something, say so plainly. Refer to the community as "warriors" or "brothers."
ABSOLUTELY FORBIDDEN: Do NOT use asterisks for ANY reason. No action emotes (*grunts*), no markdown bold (**text**), no italics. No bullet points, no headers, no formatting whatsoever. Plain text only. Every response must begin with a spoken word, NEVER an asterisk or special character.
You have tools to look up community discussions, town hall recordings, and social media activity. Use them when relevant — don't say "I don't know" without checking first.

=== TOOL STRATEGY ===
When asked about price, market, or "should I buy/sell" → pull get_market_data AND get_price_history AND get_recent_sales before answering. Cross-reference the data.
When asked about community happenings or "what's going on" → search BOTH search_community AND search_town_halls.
When asked about a specific person or wallet → use check_wallet or get_user_stats.
When asked about a proposal → use get_proposal_details, not just get_proposals.
For simple lookups ("what's the floor?") one tool is enough — don't over-fetch.
Don't just report tool results — SYNTHESIZE them into wisdom. Raw numbers are not advice.

=== MARKET ANALYSIS (how to think about the data) ===
You are not a price ticker. You are a war chief who understands supply, demand, and momentum.

Reading market signals:
- Low listed count + steady/rising floor = holders are diamond-handing. Strong conviction.
- High listed count + dropping floor = selling pressure. Look for what triggered it.
- Floor rising + holder count growing = organic demand, strongest signal.
- Floor flat + holder count growing = accumulation phase. Often precedes a move up.
- Big wallets buying while floor dips = smart money loading. Worth noting.
- 330 supply is TINY. Small moves in listings (even 5 orcs) shift the market meaningfully.

Advising on buying/selling:
- Never say "buy" or "sell" directly. Frame as what the data suggests and what you'd consider.
- Factor in their situation — a warrior with 1 orc has different calculus than one with 10.
- Always mention upcoming catalysts: burns, PrimeVils mint, proposals, partnerships.
- Acknowledge risk honestly. "This ain't financial advice, but here's what I see..."

Reading DAO proposals:
- Think about second-order effects. Treasury spend isn't just money out — what does it enable?
- If a vote is close to quorum (33), that's worth flagging — "only 4 more votes needed, warriors."
- Low turnout on important proposals = the horde isn't paying attention. Sound the alarm.
- Look at WHO voted, not just how many. Top holders voting signals conviction.

When data is thin or conflicting, say so. "I'd want another week of price action before calling this a trend." Admitting uncertainty IS wisdom — guessing is not.

=== EXAMPLES (match this tone — short for casual, richer for real advice) ===

User: "what's the floor price?"
Drak: "Sittin' at 1.2 SOL right now with 18 listed. Not bad for 330 battle-tested warriors. Want me to check recent sales or the price trend?"

User: "should I buy an orc?"
Drak: "If you believe in the Horde and Infinite Fun's track record, it's worth a hard look. Floor is low, supply is tiny at 330, and we've got real utility — DAO governance, games, trading tools. But only put in what you can afford to hold through the wars. I can pull the latest holder stats and price history if that helps."

User: "that's too expensive"
Drak: "Too expensive? Brother, you're buyin' into a 330-supply collection forged in fire. This ain't some 10k mint. But I hear you — keep an eye on dips after burn events. What's your budget looking like?"

User: "how does the DAO work?"
Drak: "Simple and fair. One Orc, one vote — you just need to hold, no enlisting required. Three Orcs to create a proposal. Voting runs 24 to 72 hours with a quorum of 33 votes. Everything is advisory, the multisig carries out the results. I can show you the active proposals right now if you want."

User: "what can I do on the site?"
Drak: "The Stronghold's got plenty. MidSwap for peer-to-peer trading, the DAO War Room for governance, Orc Viewer to browse all 330 by rarity, collage maker, and three arcade games. What catches your eye?"

User: "I don't like the DAO"
Drak: "Fair enough, warrior. Not everyone wants to play politics. What's your beef with it — the voting system or just don't care for governance?"

User: "lol"
Drak: "Heh. Something amuse you, brother?"

User: "who made this?"
Drak: "The Horde site's built by the SubDAO community. The MidEvils collection itself — that's Infinite Fun, same studio behind DeGods and y00ts. Jonny and CandyApple run the creative side."`;

export const DISCORD_ADDENDUM = `This is a Discord slash command interaction — the user is asking from Discord, not the website. You may have recent conversation history from this user (last few exchanges within the past hour). Keep answers concise since Discord has a 2000 character limit.`;

// ========== Tools ==========

export const DRAK_TOOLS = [
    {
        name: 'get_market_data',
        description: 'Get current Orc NFT market stats including floor price (SOL and USD), current SOL/USD price, total supply, holders, enlisted count, listed count, and average hold.',
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
        name: 'get_top_holders',
        description: 'Get the top Orc holders ranked by number of orcs held. Shows rank, orc count, linked Discord/X names.',
        input_schema: { type: 'object', properties: {}, required: [] }
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
        description: 'Search Discord community knowledge base semantically. Use when asked about community happenings, discussions, or what people are saying.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for in community knowledge' }
            },
            required: ['query']
        }
    },
    {
        name: 'search_town_halls',
        description: 'Search past X Spaces / Town Hall recordings semantically. These are PRIMARY SOURCES — direct transcripts with speaker attribution and timestamps. If information here conflicts with Discord chat summaries, trust these analyses. Use when users ask about town halls, what was discussed in spaces, community discussions, announcements, or quotes from past spaces.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for in town hall recordings' }
            },
            required: ['query']
        }
    },
    {
        name: 'get_price_history',
        description: 'Get Orc NFT floor price history over the last 14 days. Shows daily floor price in SOL, listed count, holder count.',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_proposal_details',
        description: 'Get full details of a DAO proposal by searching its title. Returns description, status, vote counts, individual votes, result, and dates.',
        input_schema: {
            type: 'object',
            properties: {
                proposal_title: { type: 'string', description: 'Search term to match against proposal titles (fuzzy match)' }
            },
            required: ['proposal_title']
        }
    },
    {
        name: 'get_user_stats',
        description: 'Get aggregated stats for a wallet: orc count & rank, fishing scores, badges, linked Discord/X, and DAO proposals created.',
        input_schema: {
            type: 'object',
            properties: {
                wallet: { type: 'string', description: 'Solana wallet address' }
            },
            required: ['wallet']
        }
    },
    {
        name: 'get_recent_sales',
        description: 'Get recent Orc NFT sales from Magic Eden. Shows last 5 sales with price in SOL and USD, time ago, and buyer/seller. Filtered to Orcs when possible.',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_social_feed',
        description: 'Get recent @midhorde tweets and X/Twitter research from monitored accounts. Use when asked about recent tweets, social media activity, what the team has been posting, or community sentiment on X.',
        input_schema: { type: 'object', properties: {}, required: [] }
    }
];

// ========== Pure Helpers ==========

export function getRarityTier(rank) {
    if (rank <= 10) return 'Legendary';
    if (rank <= 40) return 'Epic';
    if (rank <= 115) return 'Rare';
    return 'Common';
}

export async function getSolPrice(kvUrl, kvToken) {
    const cached = await kvGet('cache:sol_price_usd', kvUrl, kvToken).catch(() => null);
    if (cached && Date.now() - (cached.fetchedAt || 0) < 5 * 60 * 1000) return cached.price;
    try {
        const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        if (resp.ok) {
            const json = await resp.json();
            const price = json?.solana?.usd;
            if (price) {
                await kvSet('cache:sol_price_usd', { price, fetchedAt: Date.now() }, kvUrl, kvToken).catch(() => {});
                return price;
            }
        }
    } catch {}
    return null;
}

// ========== Tool Executor ==========

export async function executeTool(name, input, kvUrl, kvToken, leaderboardCache, vectorConfig) {
    try {
        async function getLeaderboardData() {
            if (leaderboardCache.data) return leaderboardCache.data;
            leaderboardCache.data = await kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null);
            return leaderboardCache.data;
        }

        switch (name) {
            case 'get_market_data': {
                const [data, solPrice] = await Promise.all([getLeaderboardData(), getSolPrice(kvUrl, kvToken)]);
                if (!data) return { error: 'Market data unavailable' };
                const result = {
                    floorPrice: data.floorPrice != null ? `${data.floorPrice} SOL` : 'unknown',
                    totalOrcs: data.totalOrcs,
                    totalHolders: data.totalHolders,
                    enlistedCount: data.enlistedCount,
                    listedCount: data.listedForSale?.length || 0,
                    avgHold: data.avgHold,
                    note: 'This data is for Orc NFTs only, NOT the full MidEvils collection.',
                    updatedAt: data.updatedAt
                };
                if (solPrice) {
                    result.solPriceUsd = solPrice;
                    if (data.floorPrice != null) {
                        result.floorPriceUsd = `~$${(data.floorPrice * solPrice).toFixed(2)}`;
                    }
                }
                return result;
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
            case 'get_top_holders': {
                const data = await getLeaderboardData();
                if (!data) return { error: 'Holder data unavailable' };
                const top10 = (data.holders || []).slice(0, 10);
                const enriched = await Promise.all(top10.map(async (h) => {
                    const [discord, xHandle] = await Promise.all([
                        kvHget('holders:discord_map:h', h.wallet, kvUrl, kvToken).catch(() => null),
                        kvHget('holders:x_map:h', h.wallet, kvUrl, kvToken).catch(() => null)
                    ]);
                    return {
                        rank: h.rank,
                        orcCount: h.count,
                        discord: discord || null,
                        x: xHandle || null,
                        wallet: h.wallet.slice(0, 6) + '...'
                    };
                }));
                return { topHolders: enriched };
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
                // Try semantic search first
                if (input.query && vectorConfig?.openaiApiKey && vectorConfig?.vectorUrl && vectorConfig?.vectorToken) {
                    try {
                        const queryVec = await getEmbedding(input.query, vectorConfig.openaiApiKey);
                        const results = await vectorQuery(queryVec, 5, vectorConfig.vectorUrl, vectorConfig.vectorToken, {
                            namespace: 'townhalls',
                            includeMetadata: true,
                            includeData: true
                        });
                        if (results.length > 0) {
                            return {
                                matches: results.map(r => ({
                                    title: r.metadata?.title,
                                    date: r.metadata?.space_date,
                                    section: r.metadata?.section,
                                    relevance: Math.round(r.score * 100) + '%',
                                    content: r.data
                                }))
                            };
                        }
                    } catch (err) {
                        console.error('Town hall vector search failed, falling back:', err.message);
                    }
                }
                // Fallback: full dump
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
                const result = {};

                // Always fetch daily recap for recency
                const summary = await kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null);
                if (summary && summary.summary) {
                    const age = Date.now() - (summary.updatedAt || 0);
                    if (age < 48 * 60 * 60 * 1000) {
                        result.discordRecap = {
                            note: 'MOST RECENT source — trust this over the knowledge base for anything about current/recent events, active discussions, or what is happening RIGHT NOW in the community.',
                            date: summary.date,
                            summary: summary.summary
                        };
                    }
                }

                // Try semantic search
                if (input.query && vectorConfig?.openaiApiKey && vectorConfig?.vectorUrl && vectorConfig?.vectorToken) {
                    try {
                        const queryVec = await getEmbedding(input.query, vectorConfig.openaiApiKey);
                        const results = await vectorQuery(queryVec, 8, vectorConfig.vectorUrl, vectorConfig.vectorToken, {
                            namespace: 'discord',
                            includeMetadata: true,
                            includeData: true
                        });
                        if (results.length > 0) {
                            result.semanticMatches = results.map(r => ({
                                type: r.metadata?.type,
                                channel: r.metadata?.channel,
                                relevance: Math.round(r.score * 100) + '%',
                                content: r.data
                            }));
                            return result;
                        }
                    } catch (err) {
                        console.error('Community vector search failed, falling back:', err.message);
                    }
                }

                // Fallback: full KB blob
                const kb = await kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null);
                if (kb && kb.content) {
                    const kbAge = kb.updatedAt ? Math.round((Date.now() - kb.updatedAt) / (60 * 60 * 1000)) : null;
                    result.knowledgeBase = {
                        note: `Knowledge base last updated ${kbAge != null ? kbAge + ' hours ago' : 'unknown time ago'}. For time-sensitive info (ongoing events, current status), prefer the discordRecap above.`,
                        content: kb.content
                    };
                }
                return Object.keys(result).length > 0 ? result : { message: 'No recent community data available' };
            }
            case 'get_price_history': {
                const history = await kvHgetall('holders:price_history', kvUrl, kvToken).catch(() => null);
                if (!history || Object.keys(history).length === 0) {
                    return { message: 'No price history yet. Data is recorded daily when the leaderboard refreshes.' };
                }
                const solPrice = await getSolPrice(kvUrl, kvToken);
                const entries = Object.entries(history)
                    .map(([date, data]) => {
                        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                        const entry = {
                            date,
                            floorPriceSol: parsed.floorPrice != null ? `${parsed.floorPrice} SOL` : 'unknown',
                            listedCount: parsed.listedCount,
                            holderCount: parsed.holderCount
                        };
                        if (solPrice && parsed.floorPrice != null) {
                            entry.floorPriceUsd = `~$${(parsed.floorPrice * solPrice).toFixed(2)}`;
                        }
                        return entry;
                    })
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 14);
                return { priceHistory: entries, note: 'Daily snapshots of Orc NFT floor price.' };
            }
            case 'get_proposal_details': {
                const searchTerm = (input.proposal_title || '').toLowerCase();
                const proposalIndex = await kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null);
                if (!proposalIndex || !Array.isArray(proposalIndex)) return { error: 'No proposals found' };
                const proposals = await Promise.all(
                    proposalIndex.map(id => kvGet(`dao:proposal:${id}`, kvUrl, kvToken).catch(() => null))
                );
                const valid = proposals.filter(Boolean);
                // Fuzzy match: find best title match
                let match = valid.find(p => (p.title || '').toLowerCase() === searchTerm);
                if (!match) match = valid.find(p => (p.title || '').toLowerCase().includes(searchTerm));
                if (!match) {
                    // Try word-by-word match
                    const words = searchTerm.split(/\s+/).filter(w => w.length > 2);
                    match = valid.find(p => {
                        const title = (p.title || '').toLowerCase();
                        return words.some(w => title.includes(w));
                    });
                }
                if (!match) {
                    return { error: `No proposal matching "${input.proposal_title}" found`, available: valid.slice(-5).map(p => p.title) };
                }
                const forVotes = (match.votes || []).filter(v => v.choice === 'for').reduce((s, v) => s + v.weight, 0);
                const againstVotes = (match.votes || []).filter(v => v.choice === 'against').reduce((s, v) => s + v.weight, 0);
                return {
                    title: match.title,
                    description: match.description,
                    status: match.status,
                    creator: match.creator ? `${match.creator.slice(0, 6)}...` : 'unknown',
                    createdAt: match.createdAt,
                    endsAt: match.endsAt,
                    result: match.result || null,
                    forVotes,
                    againstVotes,
                    totalVoters: (match.votes || []).length,
                    quorum: match.quorum,
                    votes: (match.votes || []).slice(0, 20).map(v => ({
                        wallet: `${v.wallet.slice(0, 6)}...`,
                        choice: v.choice,
                        weight: v.weight
                    }))
                };
            }
            case 'get_user_stats': {
                const w = input.wallet;
                const data = await getLeaderboardData();
                const holder = data ? (data.holders || []).find(h => h.wallet === w) : null;

                const [discord, xHandle, badges, fishingResp] = await Promise.all([
                    kvHget('holders:discord_map:h', w, kvUrl, kvToken).catch(() => null),
                    kvHget('holders:x_map:h', w, kvUrl, kvToken).catch(() => null),
                    kvGet(`badges:wallet:${w}`, kvUrl, kvToken).catch(() => null),
                    fetch('https://midhorde.com/api/fishing/leaderboard?type=score').then(r => r.ok ? r.json() : null).catch(() => null)
                ]);

                const stats = {
                    wallet: `${w.slice(0, 6)}...${w.slice(-4)}`,
                    orcCount: holder ? holder.count : 0,
                    orcRank: holder ? holder.rank : null,
                    discord: discord || null,
                    x: xHandle || null,
                    badges: badges || []
                };

                // Fishing stats
                if (fishingResp?.leaderboard) {
                    const fishEntry = fishingResp.leaderboard.find(e => e.wallet === w);
                    if (fishEntry) {
                        stats.fishing = {
                            rank: fishEntry.rank,
                            score: fishEntry.score,
                            name: fishEntry.discordName || null
                        };
                    }
                }

                // DAO proposals created by this wallet
                const proposalIndex = await kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null);
                if (proposalIndex && Array.isArray(proposalIndex)) {
                    const proposals = await Promise.all(
                        proposalIndex.map(id => kvGet(`dao:proposal:${id}`, kvUrl, kvToken).catch(() => null))
                    );
                    const created = proposals.filter(p => p && p.creator === w);
                    if (created.length > 0) {
                        stats.proposalsCreated = created.map(p => ({ title: p.title, status: p.status }));
                    }
                }

                return stats;
            }
            case 'get_recent_sales': {
                const cached = await kvGet('cache:me_recent_sales', kvUrl, kvToken).catch(() => null);
                let activities;
                if (cached && Date.now() - (cached.fetchedAt || 0) < 5 * 60 * 1000) {
                    activities = cached.activities;
                } else {
                    const resp = await fetch('https://api-mainnet.magiceden.dev/v2/collections/midevils/activities?offset=0&limit=20&type=buyNow').catch(() => null);
                    if (!resp || !resp.ok) return { error: 'MagicEden data unavailable' };
                    activities = await resp.json();
                    await kvSet('cache:me_recent_sales', { activities, fetchedAt: Date.now() }, kvUrl, kvToken).catch(() => {});
                }
                if (!Array.isArray(activities) || activities.length === 0) return { message: 'No recent sales found.' };

                // Filter to Orc sales using known mint addresses from leaderboard
                const data = await getLeaderboardData();
                let orcMints = null;
                if (data) {
                    orcMints = new Set();
                    for (const h of data.holders || []) {
                        for (const orc of h.orcs || []) {
                            if (orc.mint) orcMints.add(orc.mint);
                        }
                    }
                    for (const orc of data.listedForSale || []) {
                        if (orc.mint) orcMints.add(orc.mint);
                    }
                }

                let filtered = activities;
                let isOrcOnly = false;
                if (orcMints && orcMints.size > 0) {
                    const orcSales = activities.filter(a => a.tokenMint && orcMints.has(a.tokenMint));
                    if (orcSales.length >= 3) {
                        filtered = orcSales;
                        isOrcOnly = true;
                    }
                }

                const solPrice = await getSolPrice(kvUrl, kvToken);
                const now = Date.now();
                const sales = filtered.slice(0, 5).map(a => {
                    const priceSol = a.price || 0;
                    const ago = Math.round((now - (a.blockTime * 1000)) / 60000);
                    const timeAgo = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                    const sale = {
                        name: a.tokenMint ? `${a.tokenMint.slice(0, 6)}...` : 'unknown',
                        priceSol: `${priceSol.toFixed(2)} SOL`,
                        timeAgo,
                        buyer: a.buyer ? `${a.buyer.slice(0, 6)}...` : 'unknown',
                        seller: a.seller ? `${a.seller.slice(0, 6)}...` : 'unknown'
                    };
                    if (solPrice) sale.priceUsd = `~$${(priceSol * solPrice).toFixed(2)}`;
                    return sale;
                });
                return {
                    recentSales: sales,
                    note: isOrcOnly ? 'Filtered to Orc sales only.' : 'Showing all MidEvils collection sales (could not filter to Orcs only).'
                };
            }
            case 'get_social_feed': {
                const [drafts, researchCache] = await Promise.all([
                    kvHgetall('x:drafts', kvUrl, kvToken).catch(() => null),
                    kvGet('drak:research_cache', kvUrl, kvToken).catch(() => null)
                ]);
                const result = {};
                if (drafts && Object.keys(drafts).length > 0) {
                    const posted = Object.values(drafts)
                        .filter(d => d.status === 'posted')
                        .sort((a, b) => (b.postedAt || b.createdAt || 0) - (a.postedAt || a.createdAt || 0))
                        .slice(0, 5);
                    if (posted.length > 0) {
                        result.recentTweets = posted.map(d => d.text);
                    }
                }
                if (researchCache?.researchText && Date.now() - (researchCache.fetchedAt || 0) < 12 * 60 * 60 * 1000) {
                    result.xResearch = researchCache.researchText.slice(0, 2000);
                }
                return Object.keys(result).length > 0 ? result : { message: 'No recent social media activity available.' };
            }
            default:
                return { error: 'Unknown tool' };
        }
    } catch (err) {
        console.error(`Tool ${name} error:`, err.message);
        return { error: `Failed to execute ${name}` };
    }
}

// ========== Context Fetching ==========

export async function fetchDrakContext({ kvUrl, kvToken, userMemoryKey }) {
    const [holdersData, adminFacts, promptRules, userMemory] = await Promise.all([
        kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
        kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null),
        kvHgetall('drak:prompt_rules', kvUrl, kvToken).catch(() => null),
        userMemoryKey ? kvGet(userMemoryKey, kvUrl, kvToken).catch(() => null) : null
    ]);
    return { holdersData, adminFacts, promptRules, userMemory };
}

export function buildLiveContext({ holdersData, adminFacts, promptRules, userMemory, userLabel, userContextLine }) {
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        timeZone: 'America/Los_Angeles'
    });
    let ctx = `\n=== TODAY'S DATE ===\n${today}`;

    // Market data one-liner
    if (holdersData) {
        const parts = [];
        if (holdersData.floorPrice != null) parts.push(`Floor: ${holdersData.floorPrice} SOL`);
        if (holdersData.totalHolders) parts.push(`Holders: ${holdersData.totalHolders}`);
        if (holdersData.listedForSale) parts.push(`Listed: ${holdersData.listedForSale.length}`);
        if (holdersData.enlistedCount) parts.push(`Enlisted: ${holdersData.enlistedCount}`);
        if (holdersData.avgHold) parts.push(`Avg hold: ${holdersData.avgHold}`);
        if (parts.length > 0) {
            ctx += `\n\n=== ORC MARKET DATA ===\n${parts.join(', ')}`;
        }
    }

    // Admin-curated knowledge base
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
        ctx += section;
    }

    // Learned prompt rules
    if (promptRules && Object.keys(promptRules).length > 0) {
        const ruleTexts = Object.values(promptRules).map(r => '- ' + r.rule).join('\n');
        ctx += `\n\n=== LEARNED RULES ===\n${ruleTexts}`;
    }

    // User memory
    if (userMemory && userMemory.summary) {
        ctx += `\n\n=== YOU REMEMBER THIS WARRIOR ===\nYou've spoken to ${userLabel} before. Here's what you remember: ${userMemory.summary}\nUse this naturally — don't announce "I remember you" unless it fits. Just let your knowledge of them color your responses.`;
    }

    // User context line
    if (userContextLine) {
        ctx += `\n\n${userContextLine}`;
    }

    return ctx;
}

// ========== Claude Tool-Use Loop ==========

export async function runDrakLoop({ anthropicApiKey, systemBlocks, messages, tools, toolExecutor, maxIterations = 3 }) {
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const modelParams = {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 10000 },
        system: systemBlocks,
        messages,
        tools
    };

    let response = await client.messages.create(modelParams);

    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        const toolResults = await Promise.all(
            toolUseBlocks.map(async (block) => {
                const result = await toolExecutor(block.name, block.input);
                return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
            })
        );
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
        response = await client.messages.create({ ...modelParams, messages });
    }

    const textBlock = response.content.find(b => b.type === 'text');
    const reply = textBlock?.text || 'Hrrm... the words escape Drak.';
    return { reply, usage: response.usage };
}

// ========== Fire-and-Forget Helpers ==========

export function saveToReviewQueue({ kvUrl, kvToken, question, reply, extraFields = {} }) {
    kvHset('drak:review_queue', String(Date.now()), {
        userMsg: question, drakReply: reply, timestamp: Date.now(), ...extraFields
    }, kvUrl, kvToken).catch(() => {});
}

export async function extractAndSaveMemory({ anthropicApiKey, kvUrl, kvToken, memoryKey, existingSummary, source, userLabel, question, reply, extraFields = {} }) {
    if (!memoryKey) return;
    try {
        const systemPrompt = source === 'discord'
            ? 'You extract key facts about a Discord user from their conversation with an orc advisor chatbot. Output a brief summary (max 600 chars) of what is worth remembering about this person — interests, opinions, preferences, notable interactions, their Discord username. If existing memory is provided, merge new info into it. Drop stale or trivial details. Output ONLY the summary text, nothing else.'
            : 'You extract key facts about a user from their conversation with an orc advisor chatbot. Output a brief summary (max 600 chars) of what is worth remembering about this person — holdings, interests, opinions, preferences, notable interactions. If existing memory is provided, merge new info into it. Drop stale or trivial details. Output ONLY the summary text, nothing else.';

        const client = new Anthropic({ apiKey: anthropicApiKey });
        const extraction = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: `Existing memory: ${existingSummary || '(none)'}\n\n${userLabel} asked: ${question}\nDrak replied: ${reply}\n\nUpdated summary:`
            }]
        });
        const newSummary = extraction.content[0]?.text?.trim();
        if (newSummary && newSummary.length > 5) {
            await kvSet(memoryKey, { summary: newSummary.slice(0, 600), updatedAt: Date.now(), ...extraFields }, kvUrl, kvToken);
            await fetch(`${kvUrl}/expire/${memoryKey}/2592000`, {
                headers: { 'Authorization': `Bearer ${kvToken}` }
            });
        }
    } catch (err) {
        console.error('Memory extraction failed (non-fatal):', err.message);
    }
}

export function trackUsage({ kvUrl, kvToken, userKey }) {
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `drak:stats:daily:${today}`;
    Promise.all([
        kvIncr('drak:stats:messages', kvUrl, kvToken),
        fetch(kvUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['HINCRBY', dailyKey, userKey, 1])
        }),
        fetch(kvUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['HINCRBY', 'drak:stats:wallets', userKey, 1])
        }),
        fetch(kvUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['EXPIRE', dailyKey, 7776000])
        })
    ]).catch(() => {});
}
