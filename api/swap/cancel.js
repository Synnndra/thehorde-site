// Vercel Serverless Function - Cancel/Decline Swap Offer

function validateSolanaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    try {
        const { offerId, wallet, action } = req.body;

        if (!offerId || typeof offerId !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        if (!['cancel', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // Fetch the offer
        const offerRes = await fetch(`${KV_REST_API_URL}/get/offer:${offerId}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const offerData = await offerRes.json();

        if (!offerData.result) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        const offer = typeof offerData.result === 'string' ?
            JSON.parse(offerData.result) : offerData.result;

        // Check if offer is still pending
        if (offer.status !== 'pending') {
            return res.status(400).json({ error: 'Offer is no longer pending' });
        }

        // Verify authorization
        if (action === 'cancel') {
            // Only initiator can cancel
            if (wallet !== offer.initiator.wallet) {
                return res.status(403).json({ error: 'Only the initiator can cancel this offer' });
            }
        } else if (action === 'decline') {
            // Only receiver can decline
            if (wallet !== offer.receiver.wallet) {
                return res.status(403).json({ error: 'Only the receiver can decline this offer' });
            }
        }

        // Update offer status
        offer.status = 'cancelled';
        offer.cancelledAt = Date.now();
        offer.cancelledBy = wallet;
        offer.cancelAction = action;

        // Save updated offer
        await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(offer)
        });

        // In a real implementation, this would also:
        // 1. Return escrowed NFTs to the initiator
        // 2. Refund any escrowed SOL
        // For MVP without smart contract, this is handled manually or by trusted escrow

        return res.status(200).json({
            success: true,
            message: action === 'cancel' ? 'Offer cancelled successfully' : 'Offer declined successfully',
            offer
        });

    } catch (error) {
        console.error('Cancel offer error:', error);
        return res.status(500).json({ error: 'Failed to cancel offer' });
    }
}
