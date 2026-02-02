// Vercel Serverless Function to proxy Helius API calls

// Rate limiting (resets per function instance)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // Max 30 requests per minute per IP

// Allowed collection addresses (whitelist)
const ALLOWED_COLLECTIONS = [
    'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW' // MidEvil Orcs
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > RATE_LIMIT_WINDOW) {
        entry.count = 0;
        entry.start = now;
    }
    entry.count++;
    rateLimitMap.set(ip, entry);
    if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const { collection, page = 1 } = req.body;

    if (!collection) {
        return res.status(400).json({ error: 'Collection address required' });
    }

    // Validate collection against whitelist
    if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return res.status(403).json({ error: 'Collection not allowed' });
    }

    try {
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
