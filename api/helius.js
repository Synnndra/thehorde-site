// Vercel Serverless Function to proxy Helius API calls
import { isRateLimitedKV, getClientIp } from '../lib/swap-utils.js';

// Response cache for read-only RPC methods (short-lived)
const responseCache = new Map();
const CACHE_TTL = 30000; // 30 seconds
const CACHEABLE_METHODS = ['getAsset', 'getAssetsByOwner', 'getAssetsByGroup', 'getAssetProof'];
let lastCacheCleanup = Date.now();

// Allowed collection addresses (whitelist)
const ALLOWED_COLLECTIONS = [
    'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW' // MidEvil Orcs
];

// Allowed JSON-RPC methods
const ALLOWED_METHODS = [
    'getAssetsByGroup',
    'getAssetsByOwner',
    'getAsset',
    'getAssetProof',
    'getBalance',
    'getLatestBlockhash',
    'sendTransaction',
    'getSignatureStatuses',
    'confirmTransaction',
    'getAccountInfo',
    'getTokenAccountsByOwner'
];

function cleanupStaleEntries() {
    const now = Date.now();

    // Clean response cache
    if (now - lastCacheCleanup > CACHE_TTL) {
        for (const [key, entry] of responseCache) {
            if (now - entry.timestamp > CACHE_TTL) {
                responseCache.delete(key);
            }
        }
        lastCacheCleanup = now;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    // Rate limiting (KV-based)
    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'helius', 30, 60000, process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Periodically clean up stale entries
    cleanupStaleEntries();

    try {
        // Check if this is a JSON-RPC request (from collage-maker)
        if (req.body.jsonrpc && req.body.method) {
            // Validate method is allowed
            if (!ALLOWED_METHODS.includes(req.body.method)) {
                return res.status(400).json({ error: 'Method not allowed' });
            }

            // Check response cache for cacheable methods
            const isCacheable = CACHEABLE_METHODS.includes(req.body.method);
            if (isCacheable) {
                const cacheKey = JSON.stringify({ method: req.body.method, params: req.body.params });
                const cached = responseCache.get(cacheKey);
                if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                    return res.status(200).json(cached.data);
                }
            }

            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            const data = await response.json();

            // Cache the response for cacheable methods
            if (isCacheable && data.result) {
                const cacheKey = JSON.stringify({ method: req.body.method, params: req.body.params });
                responseCache.set(cacheKey, { data, timestamp: Date.now() });
            }

            return res.status(200).json(data);
        }

        // Legacy format (from orc-viewer) - collection-based request
        const { collection, page = 1 } = req.body;

        if (!collection) {
            return res.status(400).json({ error: 'Collection address required' });
        }

        // Validate collection is in whitelist
        if (!ALLOWED_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ error: 'Collection not allowed' });
        }

        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'midevil-viewer',
                method: 'getAssetsByGroup',
                params: {
                    groupKey: 'collection',
                    groupValue: collection,
                    page: page,
                    limit: 1000,
                    displayOptions: {
                        showCollectionMetadata: true
                    }
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(400).json({ error: data.error.message });
        }

        return res.status(200).json(data.result || { items: [] });
    } catch (error) {
        console.error('Helius API error:', error);
        return res.status(500).json({ error: 'Failed to fetch from Helius' });
    }
}
