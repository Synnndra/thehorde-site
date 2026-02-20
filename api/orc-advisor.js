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
import { kvHgetall, kvHset } from '../lib/swap-utils.js';

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

    // Verify orc holdings server-side (cached 5 min to avoid redundant Helius calls)
    const holdingsCacheKey = `holdings:cache:${wallet}`;
    let holdingsData = await kvGet(holdingsCacheKey, kvUrl, kvToken).catch(() => null);
    if (!holdingsData || Date.now() - (holdingsData.cachedAt || 0) > 5 * 60 * 1000) {
        holdingsData = await getOrcHoldings(wallet, heliusApiKey);
        holdingsData.cachedAt = Date.now();
        await kvSet(holdingsCacheKey, holdingsData, kvUrl, kvToken).catch(() => {});
    }
    if (holdingsData.orcCount < 1) {
        return res.status(403).json({ error: 'You need at least 1 Orc to consult the advisor' });
    }

    let liveContext = '';

    // Always fetch all context in parallel — all lightweight KV reads
    const contextFetches = {
        proposals: kvGet('dao:proposal_index', kvUrl, kvToken).catch(() => null),
        market: kvGet('holders:leaderboard', kvUrl, kvToken).catch(() => null),
        discord: kvGet('discord:daily_summary', kvUrl, kvToken).catch(() => null),
        knowledge: kvGet('discord:knowledge_base', kvUrl, kvToken).catch(() => null),
        adminFacts: kvHgetall('drak:knowledge', kvUrl, kvToken).catch(() => null),
        fishing: fetch('https://midhorde.com/api/fishing/leaderboard?type=score')
            .then(r => r.json()).catch(() => null),
        memory: kvGet(`drak:memory:${wallet}`, kvUrl, kvToken).catch(() => null)
    };

    const [proposalIndex, holdersData, discordSummary, knowledgeBase, adminFacts, fishingData, walletMemory] = await Promise.all([
        contextFetches.proposals,
        contextFetches.market,
        contextFetches.discord,
        contextFetches.knowledge,
        contextFetches.adminFacts,
        contextFetches.fishing,
        contextFetches.memory
    ]);

    // DAO proposals — fetch individual proposals in parallel
    if (proposalIndex && Array.isArray(proposalIndex)) {
        try {
            const recent = proposalIndex.slice(-10);
            const proposals = await Promise.all(
                recent.map(id => kvGet(`dao:proposal:${id}`, kvUrl, kvToken).catch(() => null))
            );
            const activeProposals = [];
            for (const prop of proposals) {
                if (prop && prop.status === 'active') {
                    activeProposals.push(`"${prop.title}" (${prop.forVotes} for, ${prop.againstVotes} against, ends ${new Date(prop.endsAt).toLocaleDateString()})`);
                }
            }
            if (activeProposals.length > 0) {
                liveContext += '\n\n=== LIVE: ACTIVE DAO PROPOSALS ===\n' + activeProposals.join('\n');
            }
        } catch (err) {
            console.error('Error fetching proposals:', err);
        }
    }

    // Market data
    if (holdersData) {
        const parts = [];
        if (holdersData.floorPrice != null) parts.push(`Floor Price: ${holdersData.floorPrice} SOL`);
        if (holdersData.totalOrcs) parts.push(`Total Orcs: ${holdersData.totalOrcs}`);
        if (holdersData.totalHolders) parts.push(`Unique Holders: ${holdersData.totalHolders}`);
        if (holdersData.enlistedCount) parts.push(`Enlisted (Staked): ${holdersData.enlistedCount}`);
        if (holdersData.listedForSale) parts.push(`Listed for Sale: ${holdersData.listedForSale.length}`);
        if (holdersData.avgHold) parts.push(`Avg Orcs per Holder: ${holdersData.avgHold}`);
        if (parts.length > 0) {
            liveContext += '\n\n=== LIVE: ORC MARKET DATA (The Horde only — NOT the full MidEvils collection) ===\n' + parts.join('\n') + '\nNote: This data is for Orc NFTs only. Drak does NOT have live MidEvils collection-wide floor/market data.';
        }
    }

    // Discord summary
    if (discordSummary && discordSummary.summary) {
        const age = Date.now() - (discordSummary.updatedAt || 0);
        if (age < 48 * 60 * 60 * 1000) {
            liveContext += `\n\n=== LIVE: DISCORD RECAP (${discordSummary.date}) ===\n${discordSummary.summary}`;
        }
    }

    // Discord knowledge base
    if (knowledgeBase && knowledgeBase.content) {
        liveContext += `\n\n=== DISCORD COMMUNITY KNOWLEDGE ===\n${knowledgeBase.content}`;
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

    // Fishing leaderboard
    if (fishingData && fishingData.leaderboard && fishingData.leaderboard.length > 0) {
        const lb = fishingData.leaderboard;
        const top = lb.slice(0, 10).map(e =>
            `${e.rank}. ${e.discordName || e.wallet} — ${e.score} pts`
        ).join('\n');
        liveContext += `\n\n=== LIVE: BOBBERS FISHING LEADERBOARD ===\nTotal participants: ${lb.length}\n${top}`;
    }

    // Wallet memory — things Drak remembers about this holder
    if (walletMemory && walletMemory.summary) {
        liveContext += `\n\n=== YOU REMEMBER THIS HOLDER ===\nYou've spoken to this warrior before. Here's what you remember: ${walletMemory.summary}\nUse this naturally — don't announce "I remember you" unless it fits. Just let your knowledge of them color your responses.`;
    }

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

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 350,
            system: systemBlocks,
            messages: messages
        });

        const reply = response.content[0]?.text || 'Hrrm... the words escape Drak.';
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

        return res.status(200).json({ reply, tokens });
    } catch (err) {
        console.error('Claude API error:', err);
        return res.status(500).json({ error: 'The spirit realm is disturbed. Try again.' });
    }
}
