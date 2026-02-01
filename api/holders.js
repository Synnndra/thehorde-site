// Vercel Serverless Function for Holder Leaderboard

const ORC_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const CACHE_KEY = 'holders:leaderboard';
const DISCORD_MAP_KEY = 'holders:discord_map';
const CACHE_TTL = 300; // 5 minutes in seconds

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

        // Fetch all Orcs from Helius
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
                    page: 1,
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

        const items = heliusData.result?.items || [];

        // Aggregate by wallet
        const walletMap = {};
        for (const item of items) {
            const owner = item.ownership?.owner;
            if (!owner) continue;

            const name = item.content?.metadata?.name || 'Unknown Orc';
            const imageUrl = item.content?.links?.image || item.content?.files?.[0]?.uri || '';
            const mint = item.id;

            if (!walletMap[owner]) {
                walletMap[owner] = { wallet: owner, orcs: [] };
            }
            walletMap[owner].orcs.push({ name, imageUrl, mint });
        }

        // Read Discord mappings (single KV read)
        let discordMap = {};
        try {
            const rawMap = await kvGet(DISCORD_MAP_KEY);
            if (rawMap) {
                discordMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read Discord map:', e);
        }

        // Build sorted leaderboard
        const holders = Object.values(walletMap)
            .sort((a, b) => b.orcs.length - a.orcs.length)
            .map((holder, index) => ({
                rank: index + 1,
                wallet: holder.wallet,
                count: holder.orcs.length,
                discord: discordMap[holder.wallet] || null,
                orcs: holder.orcs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            }));

        const result = {
            holders,
            totalOrcs: items.length,
            totalHolders: holders.length,
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
