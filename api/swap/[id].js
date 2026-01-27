// Vercel Serverless Function - Get Single Offer by ID

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    try {
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        // Fetch the offer
        const offerRes = await fetch(`${KV_REST_API_URL}/get/offer:${id}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const offerData = await offerRes.json();

        if (!offerData.result) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        const offer = typeof offerData.result === 'string' ?
            JSON.parse(offerData.result) : offerData.result;

        // Check if offer has expired
        const now = Date.now();
        if (offer.status === 'pending' && offer.expiresAt && offer.expiresAt < now) {
            offer.status = 'expired';
            // Update the expired status in KV
            await fetch(`${KV_REST_API_URL}/set/offer:${id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(offer)
            });
        }

        return res.status(200).json({ offer });

    } catch (error) {
        console.error('Get offer error:', error);
        return res.status(500).json({ error: 'Failed to fetch offer' });
    }
}
