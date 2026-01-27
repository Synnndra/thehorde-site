// Vercel Serverless Function - Get Offers for a Wallet

function validateSolanaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

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
        const { wallet } = req.query;

        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        // Get list of offer IDs for this wallet
        const walletKey = `wallet:${wallet}:offers`;
        const listRes = await fetch(`${KV_REST_API_URL}/get/${walletKey}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const listData = await listRes.json();
        const offerIds = listData.result ?
            (typeof listData.result === 'string' ? JSON.parse(listData.result) : listData.result) : [];

        if (offerIds.length === 0) {
            return res.status(200).json({ offers: [] });
        }

        // Fetch all offers
        const offers = [];
        const now = Date.now();

        for (const offerId of offerIds) {
            const offerRes = await fetch(`${KV_REST_API_URL}/get/offer:${offerId}`, {
                headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
            });
            const offerData = await offerRes.json();

            if (offerData.result) {
                const offer = typeof offerData.result === 'string' ?
                    JSON.parse(offerData.result) : offerData.result;

                // Check if offer has expired
                if (offer.status === 'pending' && offer.expiresAt && offer.expiresAt < now) {
                    offer.status = 'expired';
                    // Update the expired status in KV
                    await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(offer)
                    });
                }

                offers.push(offer);
            }
        }

        // Sort by createdAt descending (newest first)
        offers.sort((a, b) => b.createdAt - a.createdAt);

        return res.status(200).json({ offers });

    } catch (error) {
        console.error('Get offers error:', error);
        return res.status(500).json({ error: 'Failed to fetch offers' });
    }
}
