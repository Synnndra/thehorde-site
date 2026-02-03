// Vercel Serverless Function for Holder Leaderboard

const ORC_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const CACHE_KEY = 'holders:leaderboard';
const DISCORD_MAP_KEY = 'holders:discord_map';
const CACHE_TTL = 1800; // 30 minutes in seconds

// Marketplace escrow wallets — NFTs listed for sale are held here
const EXCLUDED_WALLETS = new Set([
    '1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix',  // Magic Eden
]);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'Helius API key not configured' });
    }

    // Debug endpoint removed for security

    async function kvGet(key) {
        const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const data = await response.json();
        return data.result;
    }

    async function kvSetEx(key, ttl, value) {
        const response = await fetch(`${KV_REST_API_URL}/setex/${key}/${ttl}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(value)
        });
        return response.json();
    }

    try {
        // Check cache first
        const cached = await kvGet(CACHE_KEY);
        if (cached) {
            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
            return res.status(200).json(data);
        }

        // Fetch all items from Helius (paginated, same as orc-viewer)
        let items = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const heliusResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'holders-leaderboard',
                    method: 'getAssetsByGroup',
                    params: {
                        groupKey: 'collection',
                        groupValue: ORC_COLLECTION,
                        page,
                        limit: 1000,
                        displayOptions: {
                            showCollectionMetadata: false
                        }
                    }
                })
            });

            const heliusData = await heliusResponse.json();

            if (heliusData.error) {
                console.error('Helius error:', heliusData.error);
                return res.status(500).json({ error: 'Failed to fetch NFT data' });
            }

            const pageItems = heliusData.result?.items || [];
            items = items.concat(pageItems);
            hasMore = pageItems.length === 1000;
            page++;
        }

        // Filter to Orcs only — same logic as orc-viewer:
        // name includes "orc" (case-insensitive), exclude burnt and graveyard NFTs
        const orcItems = items.filter(item => {
            const name = item.content?.metadata?.name || '';
            if (item.burnt === true) return false;
            if (name.toLowerCase().includes('graveyard')) return false;
            return name.toLowerCase().includes('orc');
        });

        // Extract traits and calculate rarity (same logic as orc-viewer)
        const RANK_OVERRIDES = [328, 265, 212, 233];

        const orcsWithTraits = orcItems.map(item => {
            const attrs = item.content?.metadata?.attributes || [];
            const traits = {};
            attrs.forEach(a => { if (a.trait_type && a.value) traits[a.trait_type] = a.value; });
            const num = parseInt((item.content?.metadata?.name || '').match(/#(\d+)/)?.[1]) || 0;
            return { item, traits, num };
        });

        // Build trait counts across all orcs
        const traitCounts = {};
        orcsWithTraits.forEach(({ traits }) => {
            Object.entries(traits).forEach(([type, value]) => {
                if (!traitCounts[type]) traitCounts[type] = {};
                traitCounts[type][value] = (traitCounts[type][value] || 0) + 1;
            });
        });

        // Individual trait value multipliers
        const traitMultipliers = {
            'Necromancers Helmet': 5,
            'Necromancers Armor': 2.5,
            'Morgoths hat': 2.5,
            'Morgoths cloak': 2.5,
        };

        // Calculate rarity scores
        const total = orcsWithTraits.length;
        orcsWithTraits.forEach(orc => {
            let score = 0;
            Object.entries(orc.traits).forEach(([type, value]) => {
                const count = traitCounts[type]?.[value] || 0;
                if (count > 0) {
                    const multiplier = traitMultipliers[value] || 1;
                    score += multiplier * (1 / (count / total));
                }
            });
            orc.rarityScore = score;
        });

        // Assign rarity ranks — force top 4 overrides, then sort rest by score
        const overrides = RANK_OVERRIDES.map(num => orcsWithTraits.find(o => o.num === num)).filter(Boolean);
        const rest = orcsWithTraits.filter(o => !RANK_OVERRIDES.includes(o.num)).sort((a, b) => b.rarityScore - a.rarityScore);
        const sorted = [...overrides, ...rest];
        sorted.forEach((orc, i) => { orc.rarityRank = i + 1; });

        // Build rank and traits lookups
        const rarityByMint = {};
        const traitsByMint = {};
        orcsWithTraits.forEach(orc => {
            rarityByMint[orc.item.id] = orc.rarityRank;
            traitsByMint[orc.item.id] = orc.traits;
        });

        // Aggregate by wallet
        const walletMap = {};
        const listedOrcs = [];
        for (const item of orcItems) {
            const ownership = item.ownership;
            const owner = ownership?.owner;
            if (!owner) continue;

            const name = item.content?.metadata?.name || 'Unknown Orc';
            const imageUrl = item.content?.links?.image || item.content?.files?.[0]?.uri || '';
            const mint = item.id;
            const rarityRank = rarityByMint[mint] || 9999;
            const isDelegated = ownership?.delegated === true;
            const isFrozen = ownership?.frozen === true;
            const delegate = ownership?.delegate || null;

            if (EXCLUDED_WALLETS.has(owner)) {
                listedOrcs.push({ name, imageUrl, mint, rarityRank });
                continue;
            }

            if (!walletMap[owner]) {
                walletMap[owner] = { wallet: owner, orcs: [] };
            }
            const traits = traitsByMint[mint] || {};
            walletMap[owner].orcs.push({ name, imageUrl, mint, rarityRank, isDelegated, isFrozen, delegate, traits });
        }

        // Read Discord and X mappings
        let discordMap = {};
        let xMap = {};
        try {
            const rawMap = await kvGet(DISCORD_MAP_KEY);
            if (rawMap) {
                discordMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read Discord map:', e);
        }
        try {
            const rawXMap = await kvGet('holders:x_map');
            if (rawXMap) {
                xMap = typeof rawXMap === 'string' ? JSON.parse(rawXMap) : rawXMap;
            }
        } catch (e) {
            console.error('Failed to read X map:', e);
        }

        // Build sorted leaderboard
        const holders = Object.values(walletMap)
            .sort((a, b) => b.orcs.length - a.orcs.length)
            .map((holder, index) => ({
                rank: index + 1,
                wallet: holder.wallet,
                count: holder.orcs.length,
                discord: discordMap[holder.wallet] || null,
                x: xMap[holder.wallet] || null,
                orcs: holder.orcs.sort((a, b) => a.rarityRank - b.rarityRank)
            }));

        // Count enlisted (frozen) orcs
        let enlistedCount = 0;
        for (const holder of Object.values(walletMap)) {
            for (const orc of holder.orcs) {
                if (orc.isFrozen) enlistedCount++;
            }
        }

        // Fetch orc floor price from Magic Eden listings (parallel)
        let floorPrice = null;
        try {
            const listedMints = listedOrcs.map(o => o.mint);
            if (listedMints.length > 0) {
                const listingResults = await Promise.all(
                    listedMints.map(mint =>
                        fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}/listings`)
                            .then(r => r.ok ? r.json() : [])
                            .catch(() => [])
                    )
                );
                let lowestPrice = Infinity;
                for (const listings of listingResults) {
                    if (Array.isArray(listings)) {
                        for (const listing of listings) {
                            if (listing.price && listing.price < lowestPrice) {
                                lowestPrice = listing.price;
                            }
                        }
                    }
                }
                if (lowestPrice < Infinity) {
                    floorPrice = lowestPrice;
                }
            }
        } catch (e) {
            console.error('Floor price fetch failed:', e);
        }

        const totalHeldOrcs = orcItems.length - listedOrcs.length;
        const result = {
            holders,
            totalOrcs: orcItems.length,
            totalHolders: holders.length,
            listedForSale: listedOrcs.sort((a, b) => a.rarityRank - b.rarityRank),
            floorPrice,
            enlistedCount,
            avgHold: Math.round((totalHeldOrcs / holders.length) * 10) / 10,
            updatedAt: new Date().toISOString()
        };

        // Cache result
        await kvSetEx(CACHE_KEY, CACHE_TTL, result);

        return res.status(200).json(result);

    } catch (error) {
        console.error('Holders API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
