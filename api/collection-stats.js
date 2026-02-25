// Lightweight collection stats for the About page
// Caches unique holder count + total supply in KV for 24 hours
import { isRateLimitedKV, getClientIp, kvGet } from '../lib/swap-utils.js';

const COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const CACHE_KEY = 'about:collection-stats';
const CACHE_TTL = 3600; // 1 hour

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { KV_REST_API_URL, KV_REST_API_TOKEN, HELIUS_API_KEY } = process.env;
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !HELIUS_API_KEY) {
        return res.status(500).json({ error: 'Not configured' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'col-stats', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        // Check 24hr cache
        const cached = await kvGet(CACHE_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (cached) {
            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
            res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60');
            return res.status(200).json(data);
        }

        // Paginate through all collection assets, collect unique owners
        const owners = new Set();
        let totalSupply = 0;
        let page = 1;

        while (true) {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'collection-stats',
                    method: 'getAssetsByGroup',
                    params: {
                        groupKey: 'collection',
                        groupValue: COLLECTION,
                        page,
                        limit: 1000,
                        displayOptions: { showCollectionMetadata: false }
                    }
                })
            });

            const data = await response.json();
            if (data.error) break;

            const items = data.result?.items || [];
            for (const item of items) {
                if (item.burnt) continue;
                totalSupply++;
                const owner = item.ownership?.owner;
                if (owner) owners.add(owner);
            }

            if (items.length < 1000) break;
            page++;
        }

        // Fetch floor price from Magic Eden (cheapest listing)
        let floorPrice = null;
        try {
            const meRes = await fetch('https://api-mainnet.magiceden.dev/v2/collections/midevils/listings?offset=0&limit=1');
            if (meRes.ok) {
                const listings = await meRes.json();
                if (Array.isArray(listings) && listings.length > 0) {
                    floorPrice = listings[0].price;
                }
            }
        } catch (e) {
            console.error('Floor price fetch failed:', e);
        }

        const stats = {
            totalSupply,
            holders: owners.size,
            floorPrice,
            updatedAt: new Date().toISOString()
        };

        // Cache for 24 hours
        await fetch(`${KV_REST_API_URL}/setex/${CACHE_KEY}/${CACHE_TTL}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(stats)
        });

        res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60');
        return res.status(200).json(stats);
    } catch (error) {
        console.error('Collection stats error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
