import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { offerId, wallet, txSignature } = req.body;

        if (!offerId || !wallet) {
            return res.status(400).json({ error: 'Missing offerId or wallet' });
        }

        // Get the offer
        const offer = await kv.get(`offer:${offerId}`);

        if (!offer) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        // Verify the wallet is the initiator
        if (offer.initiator.wallet !== wallet) {
            return res.status(403).json({ error: 'Only the initiator can complete this transfer' });
        }

        // Verify offer is in accepted status
        if (offer.status !== 'accepted') {
            return res.status(400).json({ error: 'Offer must be accepted before completing transfer' });
        }

        // Update offer with initiator transfer completion
        const updatedOffer = {
            ...offer,
            initiatorTransferComplete: true,
            initiatorTxSignature: txSignature,
            completedAt: Date.now()
        };

        await kv.set(`offer:${offerId}`, updatedOffer);

        return res.status(200).json({
            success: true,
            offer: updatedOffer
        });

    } catch (error) {
        console.error('Complete transfer error:', error);
        return res.status(500).json({ error: 'Failed to complete transfer' });
    }
}
