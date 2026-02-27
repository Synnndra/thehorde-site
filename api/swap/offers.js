// Vercel Serverless Function - Get Offers for a Wallet
import { isRateLimitedKV, getClientIp, validateSolanaAddress } from '../../lib/swap-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'offers', 30, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
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

        // Fetch all offers in parallel
        const now = Date.now();
        const validOfferIds = offerIds.filter(id => /^offer_[a-f0-9]{32}$/.test(id));

        const offerResults = await Promise.all(validOfferIds.map(async (offerId) => {
            try {
                const offerRes = await fetch(`${KV_REST_API_URL}/get/offer:${offerId}`, {
                    headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
                });
                const offerData = await offerRes.json();

                if (offerData.result) {
                    const offer = typeof offerData.result === 'string' ?
                        JSON.parse(offerData.result) : offerData.result;

                    // Show expired status to frontend without mutating KV.
                    // Actual expiry handling (escrow return) is done by cleanup-expired.js.
                    if (offer.status === 'pending' && offer.expiresAt && offer.expiresAt < now) {
                        offer.status = 'expired';
                    }

                    return offer;
                }
                return null;
            } catch {
                return null;
            }
        }));

        const offers = offerResults.filter(Boolean);

        // Sort by createdAt descending (newest first)
        offers.sort((a, b) => b.createdAt - a.createdAt);

        return res.status(200).json({ offers });

    } catch (error) {
        console.error('Get offers error:', error);
        return res.status(500).json({ error: 'Failed to fetch offers' });
    }
}
