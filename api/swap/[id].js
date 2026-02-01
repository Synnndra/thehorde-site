// Vercel Serverless Function - Get Single Offer by ID
import { isRateLimitedKV, getClientIp, getTxLog } from './utils.js';

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
    if (await isRateLimitedKV(clientIp, 'offer-view', 30, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    try {
        const { id } = req.query;

        // Validate offer ID format
        if (!id || typeof id !== 'string' || !/^offer_[a-f0-9]{32}$/.test(id)) {
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

        // Show expired status to frontend without mutating KV.
        // Actual expiry handling (escrow return) is done by cleanup-expired.js.
        const now = Date.now();
        if (offer.status === 'pending' && offer.expiresAt && offer.expiresAt < now) {
            offer.status = 'expired';
        }

        // Fetch transaction log
        const txLog = await getTxLog(id, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ offer, txLog });

    } catch (error) {
        console.error('Get offer error:', error);
        return res.status(500).json({ error: 'Failed to fetch offer' });
    }
}
