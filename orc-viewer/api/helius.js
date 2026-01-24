// Vercel Serverless Function to proxy Helius API calls

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const { collection, page = 1 } = req.body;

    if (!collection) {
        return res.status(400).json({ error: 'Collection address required' });
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
