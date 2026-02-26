// Vercel Serverless Function - Drak Discord Slash Command (/ask-drak)
import Anthropic from '@anthropic-ai/sdk';
import nacl from 'tweetnacl';
import { waitUntil } from '@vercel/functions';
import { isRateLimitedKV, kvHgetall, kvHget, kvHset, kvIncr } from '../lib/swap-utils.js';
import { kvGet, kvSet } from '../lib/dao-utils.js';

export const config = {
    maxDuration: 30,
    api: { bodyParser: false } // Need raw body for Discord signature verification
};

// --- Discord constants ---
const THE_HORDE_CHANNEL = '1438567217787830333';

// --- Drak system prompt (copied from orc-advisor.js — kept in sync manually) ---
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
This is a Discord slash command interaction — the user is asking from Discord, not the website. You may have recent conversation history from this user (last few exchanges within the past hour). Keep answers concise since Discord has a 2000 character limit.

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

// --- Drak tools (copied from orc-advisor.js) ---
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
    },
    {
        name: 'get_recent_sales',
        description: 'Get recent MidEvils NFT sales from Magic Eden. Shows last 5 sales with price in SOL and USD, time ago, and buyer/seller.',
        input_schema: { type: 'object', properties: {}, required: [] }
    }
];

// --- Ed25519 signature verification for Discord interactions ---
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

// --- Tool executor (copied from orc-advisor.js) ---
function getRarityTier(rank) {
    if (rank <= 10) return 'Legendary';
    if (rank <= 40) return 'Epic';
    if (rank <= 115) return 'Rare';
    return 'Common';
}

async function getSolPrice(kvUrl, kvToken) {
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

async function executeTool(name, input, kvUrl, kvToken, leaderboardCache) {
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
            case 'get_recent_sales': {
                const cached = await kvGet('cache:me_recent_sales', kvUrl, kvToken).catch(() => null);
                let activities;
                if (cached && Date.now() - (cached.fetchedAt || 0) < 5 * 60 * 1000) {
                    activities = cached.activities;
                } else {
                    const resp = await fetch('https://api-mainnet.magiceden.dev/v2/collections/midevils/activities?offset=0&limit=10&type=buyNow').catch(() => null);
                    if (!resp || !resp.ok) return { error: 'MagicEden data unavailable' };
                    activities = await resp.json();
                    await kvSet('cache:me_recent_sales', { activities, fetchedAt: Date.now() }, kvUrl, kvToken).catch(() => {});
                }
                if (!Array.isArray(activities) || activities.length === 0) return { message: 'No recent sales found.' };
                const solPrice = await getSolPrice(kvUrl, kvToken);
                const now = Date.now();
                const sales = activities.slice(0, 5).map(a => {
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
                return { recentSales: sales, note: 'These are MidEvils collection sales (not just Orcs).' };
            }
            default:
                return { error: 'Unknown tool' };
        }
    } catch (err) {
        console.error(`Tool ${name} error:`, err.message);
        return { error: `Failed to execute ${name}` };
    }
}

// --- Truncate to Discord's 2000 char limit at a sentence boundary ---
function truncateForDiscord(text, limit = 2000) {
    if (text.length <= limit) return text;
    const cutoff = limit - 3; // room for "..."
    // Try to cut at a sentence boundary
    const lastPeriod = text.lastIndexOf('. ', cutoff);
    const lastExclaim = text.lastIndexOf('! ', cutoff);
    const lastQuestion = text.lastIndexOf('? ', cutoff);
    const bestBreak = Math.max(lastPeriod, lastExclaim, lastQuestion);
    if (bestBreak > cutoff * 0.5) {
        return text.slice(0, bestBreak + 1) + '...';
    }
    return text.slice(0, cutoff) + '...';
}

// --- PATCH followup message to Discord ---
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

    // Read raw body (body parsing disabled for signature verification)
    const rawBody = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
    });

    // --- Signature verification ---
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

    // --- PING (type 1) — Discord verification handshake ---
    if (type === 1) {
        return res.status(200).json({ type: 1 });
    }

    // --- Slash command (type 2) ---
    if (type === 2) {
        const appId = application_id; // From interaction payload (string, no precision loss)
        const kvUrl = process.env.KV_REST_API_URL;
        const kvToken = process.env.KV_REST_API_TOKEN;
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

        // Channel lock — only #the-horde
        if (channel_id !== THE_HORDE_CHANNEL) {
            return res.status(200).json({
                type: 4,
                data: {
                    content: "Drak only answers in #the-horde, warrior. Take your questions there.",
                    flags: 64 // ephemeral — only visible to the user
                }
            });
        }

        // Rate limit by Discord user ID
        const userId = member?.user?.id;
        if (userId && kvUrl && kvToken) {
            const limited = await isRateLimitedKV(userId, 'discord-drak', 20, 300000, kvUrl, kvToken);
            if (limited) {
                return res.status(200).json({
                    type: 4,
                    data: {
                        content: "Easy there, warrior. Drak needs a breather. Try again in a few minutes.",
                        flags: 64
                    }
                });
            }
        }

        // Extract question from slash command options
        const question = data?.options?.find(o => o.name === 'question')?.value;
        if (!question) {
            return res.status(200).json({
                type: 4,
                data: { content: "You didn't ask anything, brother.", flags: 64 }
            });
        }

        // Send deferred response (type 5) — shows "Drak is thinking..."
        // Use waitUntil() to keep function alive for background Claude call
        const discordUser = member?.user?.username || 'unknown';

        waitUntil((async () => {
            try {
                // Fetch live context: admin knowledge + Discord summary + community KB
                let liveContext = '';
                let discordHistory = null;
                if (kvUrl && kvToken) {
                    const [adminFacts, discordSummary, knowledgeBase, holdersData, spacesAnalyses, userMemory, recentDrafts, _discordHistory, promptRules] = await Promise.all([
                        kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null),
                        kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
                        kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null),
                        kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
                        kvHgetall('spaces:analyses', kvUrl, kvToken).catch(() => null),
                        userId ? kvGet(`drak:memory:discord:${userId}`, kvUrl, kvToken).catch(() => null) : null,
                        kvHgetall('x:drafts', kvUrl, kvToken).catch(() => null),
                        userId ? kvGet(`drak:discord_history:${userId}`, kvUrl, kvToken).catch(() => null) : null,
                        kvHgetall('drak:prompt_rules', kvUrl, kvToken).catch(() => null)
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

                    // Admin-curated facts
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
                    // Learned prompt rules
                    if (promptRules && Object.keys(promptRules).length > 0) {
                        const ruleTexts = Object.values(promptRules).map(r => '- ' + r.rule).join('\n');
                        liveContext += `\n\n=== LEARNED RULES ===\n${ruleTexts}`;
                    }

                    // Recent posted tweets from @midhorde
                    if (recentDrafts && Object.keys(recentDrafts).length > 0) {
                        const posted = Object.values(recentDrafts)
                            .filter(d => d.status === 'posted')
                            .sort((a, b) => (b.postedAt || b.createdAt || 0) - (a.postedAt || a.createdAt || 0))
                            .slice(0, 5);
                        if (posted.length > 0) {
                            const tweetTexts = posted.map(d => `- ${d.text}`).join('\n');
                            liveContext += `\n\n=== RECENT @MIDHORDE TWEETS ===\n${tweetTexts}`;
                        }
                    }

                    // Discord user memory
                    if (userMemory && userMemory.summary) {
                        liveContext += `\n\n=== YOU REMEMBER THIS WARRIOR ===\nYou've spoken to Discord user "${discordUser}" before. Here's what you remember: ${userMemory.summary}\nUse this naturally — don't announce "I remember you" unless it fits. Just let your knowledge of them color your responses.`;
                    }

                    discordHistory = _discordHistory;
                }

                liveContext += `\n\nThis question comes from Discord user "${discordUser}" via the /ask-drak slash command.`;

                const client = new Anthropic({ apiKey: anthropicApiKey });
                const systemBlocks = [
                    { type: 'text', text: ORC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
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

                // Tool use loop — same pattern as orc-advisor.js
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
                            const result = await executeTool(block.name, block.input, kvUrl, kvToken, leaderboardCache);
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
                const fullReply = `> ${question}\n\n${reply}`;
                const truncated = truncateForDiscord(fullReply);

                await sendFollowup(appId, interactionToken, truncated);

                // Save conversation history for follow-up context (fire-and-forget)
                if (userId && kvUrl && kvToken) {
                    const historyKey = `drak:discord_history:${userId}`;
                    const prevHistory = Array.isArray(discordHistory) ? discordHistory.slice(-4) : [];
                    prevHistory.push({ q: question, a: reply });
                    kvSet(historyKey, prevHistory, kvUrl, kvToken).then(() =>
                        fetch(`${kvUrl}/expire/${historyKey}/3600`, { headers: { 'Authorization': `Bearer ${kvToken}` } })
                    ).catch(() => {});
                }

                // Fire-and-forget: queue for correction review + usage stats
                if (kvUrl && kvToken) {
                    await Promise.all([
                        kvHset('drak:review_queue', String(Date.now()), { userMsg: question, drakReply: reply, source: 'discord', discordUser, timestamp: Date.now() }, kvUrl, kvToken),
                        kvIncr('drak:stats:messages', kvUrl, kvToken),
                        fetch(kvUrl, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(['HINCRBY', `drak:stats:daily:${new Date().toISOString().slice(0, 10)}`, `discord:${userId || 'unknown'}`, 1])
                        })
                    ]).catch(() => {});

                    // Fire-and-forget: extract memory from this exchange via Haiku
                    if (userId) {
                        (async () => {
                            try {
                                const existingSummary = userMemory?.summary || '';
                                const memoryClient = new Anthropic({ apiKey: anthropicApiKey });
                                const extraction = await memoryClient.messages.create({
                                    model: 'claude-haiku-4-5-20251001',
                                    max_tokens: 150,
                                    system: 'You extract key facts about a Discord user from their conversation with an orc advisor chatbot. Output a brief summary (max 300 chars) of what is worth remembering about this person — interests, opinions, preferences, notable interactions, their Discord username. If existing memory is provided, merge new info into it. Drop stale or trivial details. Output ONLY the summary text, nothing else.',
                                    messages: [{
                                        role: 'user',
                                        content: `Existing memory: ${existingSummary || '(none)'}\n\nDiscord user "${discordUser}" asked: ${question}\nDrak replied: ${reply}\n\nUpdated summary:`
                                    }]
                                });
                                const newSummary = extraction.content[0]?.text?.trim();
                                if (newSummary && newSummary.length > 5) {
                                    const memoryKey = `drak:memory:discord:${userId}`;
                                    await kvSet(memoryKey, { summary: newSummary.slice(0, 300), discordUser, updatedAt: Date.now() }, kvUrl, kvToken);
                                    await fetch(`${kvUrl}/expire/${memoryKey}/2592000`, {
                                        headers: { 'Authorization': `Bearer ${kvToken}` }
                                    });
                                }
                            } catch (err) {
                                console.error('Discord memory extraction failed (non-fatal):', err.message);
                            }
                        })();
                    }
                }
            } catch (err) {
                console.error('Discord Drak error:', err);
                await sendFollowup(appId, interactionToken, "The spirit realm is disturbed... Drak couldn't find an answer. Try again, warrior.").catch(() => {});
            }
        })());

        return res.status(200).json({ type: 5 });
    }

    // Unknown interaction type
    return res.status(400).json({ error: 'Unknown interaction type' });
}
