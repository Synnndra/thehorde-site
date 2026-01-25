// Vercel Serverless Function to proxy Helius API calls

// Rate limiting (resets per function instance)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // Max 30 requests per minute per IP

// Allowed collection addresses (whitelist)
const ALLOWED_COLLECTIONS = [
    'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW' // MidEvil Orcs
];

// Allowed JSON-RPC methods
const ALLOWED_METHODS = [
    'getAssetsByGroup',
    'getAssetsByOwner',
    'getAsset'
];

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return false;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return true;
    }

    record.count++;
    return false;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    try {
        // Check if this is a JSON-RPC request (from collage-maker)
        if (req.body.jsonrpc && req.body.method) {
            // Validate method is allowed
            if (!ALLOWED_METHODS.includes(req.body.method)) {
                return res.status(400).json({ error: 'Method not allowed' });
            }

            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            const data = await response.json();
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
