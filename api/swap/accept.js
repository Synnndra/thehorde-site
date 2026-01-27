// Vercel Serverless Function - Accept Swap Offer

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
        const { offerId, wallet } = req.body;

        if (!offerId || typeof offerId !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
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

        // Check if offer has expired
        const now = Date.now();
        if (offer.expiresAt && offer.expiresAt < now) {
            offer.status = 'expired';
            await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(offer)
            });
            return res.status(400).json({ error: 'Offer has expired' });
        }

        // Only receiver can accept
        if (wallet !== offer.receiver.wallet) {
            return res.status(403).json({ error: 'Only the receiver can accept this offer' });
        }

        // Get transaction signature from request (if blockchain mode)
        const { txSignature } = req.body;

        // Update offer status
        offer.status = 'accepted';
        offer.acceptedAt = now;

        // Track blockchain transaction
        if (txSignature) {
            offer.receiverTxSignature = txSignature;
            offer.receiverTransferComplete = true;
        }

        // Mark if initiator still needs to transfer
        // Initiator needs to complete their transfer after receiver accepts
        const initiatorHasNfts = offer.initiator.nftDetails && offer.initiator.nftDetails.length > 0;
        const initiatorHasSol = offer.initiator.sol && offer.initiator.sol > 0;
        offer.initiatorTransferComplete = !(initiatorHasNfts || initiatorHasSol);

        // Save updated offer
        await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(offer)
        });

        return res.status(200).json({
            success: true,
            message: 'Offer accepted successfully. The swap will be executed shortly.',
            offer,
            // In production, this would include:
            // transaction: signedTransaction,
            // signature: txSignature
        });

    } catch (error) {
        console.error('Accept offer error:', error);
        return res.status(500).json({ error: 'Failed to accept offer' });
    }
}
