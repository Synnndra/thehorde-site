// Vercel Serverless Function - Cleanup Expired Offers
import { kvGet, kvSet, returnEscrowToInitiator } from './utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;
    const CLEANUP_SECRET = process.env.CLEANUP_SECRET || process.env.ADMIN_SECRET;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Auth for POST requests
    if (req.method === 'POST') {
        const { secret } = req.body || {};
        if (!CLEANUP_SECRET || secret !== CLEANUP_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
    }

    try {
        const now = Date.now();
        const results = { processed: 0, expired: 0, escrowReturned: 0, errors: [] };

        // Scan for all offer keys
        const scanRes = await fetch(`${KV_REST_API_URL}/keys/offer:*`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const scanData = await scanRes.json();
        const offerKeys = scanData.result || [];

        console.log(`Found ${offerKeys.length} offers to check`);

        for (const key of offerKeys) {
            try {
                results.processed++;
                const offerId = key.replace('offer:', '');
                const offer = await kvGet(key, KV_REST_API_URL, KV_REST_API_TOKEN);

                if (!offer || offer.status !== 'pending') continue;
                if (!offer.expiresAt || offer.expiresAt > now) continue;

                console.log(`Offer ${offer.id} has expired`);
                results.expired++;

                // Return escrow
                if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && offer.escrowTxSignature) {
                    try {
                        const returnTx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                        if (returnTx) {
                            offer.escrowReturnTxSignature = returnTx;
                            results.escrowReturned++;
                            console.log(`Returned escrow for ${offer.id}: ${returnTx}`);
                        }
                    } catch (escrowErr) {
                        console.error(`Escrow return failed for ${offer.id}:`, escrowErr.message);
                        offer.escrowReturnError = escrowErr.message;
                        results.errors.push({ offerId: offer.id, error: escrowErr.message });
                    }
                }

                // Update status
                offer.status = 'expired';
                offer.expiredAt = now;
                offer.expiredByCleanup = true;
                await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

            } catch (offerErr) {
                console.error(`Error processing ${key}:`, offerErr.message);
                results.errors.push({ key, error: offerErr.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${results.processed}, expired ${results.expired}, returned ${results.escrowReturned}`,
            results
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
}
