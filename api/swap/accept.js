// Vercel Serverless Function - Accept Swap Offer with Escrow Release
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    validateTimestamp,
    isSignatureUsed,
    markSignatureUsed,
    verifyNftOwnership,
    kvGet,
    kvSet,
    acquireLock,
    releaseLock,
    verifyTransactionConfirmed,
    releaseEscrowToReceiver
} from './utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'accept', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    let lockKey = null;

    try {
        const { offerId, wallet, txSignature, signature, message } = req.body;

        // Validate inputs
        if (!offerId || typeof offerId !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }
        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!signature || !message) {
            return res.status(400).json({ error: 'Signature required to verify wallet ownership' });
        }
        if (!message.includes(offerId)) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        // Validate timestamp
        const timestampResult = validateTimestamp(message);
        if (!timestampResult.valid) {
            return res.status(400).json({ error: timestampResult.error });
        }

        // Verify signature
        if (!verifySignature(message, signature, wallet)) {
            return res.status(403).json({ error: 'Invalid signature - wallet ownership not verified' });
        }

        // Check signature replay
        if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'This signature has already been used. Please sign a new message.' });
        }

        // Acquire lock
        const lock = await acquireLock(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (!lock.acquired) {
            return res.status(409).json({ error: 'Offer is being processed. Please try again.' });
        }
        lockKey = lock.lockKey;

        // Fetch offer
        const offer = await kvGet(`offer:${offerId}`, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (!offer) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(404).json({ error: 'Offer not found' });
        }

        // Validate offer state
        if (offer.status !== 'pending') {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: 'Offer is no longer pending' });
        }

        // Check expiry
        const now = Date.now();
        if (offer.expiresAt && offer.expiresAt < now) {
            offer.status = 'expired';
            await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: 'Offer has expired' });
        }

        // Only receiver can accept
        if (wallet !== offer.receiver.wallet) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(403).json({ error: 'Only the receiver can accept this offer' });
        }

        // Verify receiver still owns the NFTs they're supposed to give
        if (HELIUS_API_KEY && offer.receiver.nfts?.length > 0) {
            const ownershipCheck = await verifyNftOwnership(offer.receiver.nfts, wallet, HELIUS_API_KEY);
            if (!ownershipCheck.valid) {
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({
                    error: 'You no longer own some of the NFTs in this trade',
                    issues: ownershipCheck.issues
                });
            }
        }

        // Verify receiver's transaction if they have assets to send
        if (txSignature && HELIUS_API_KEY) {
            const txVerified = await verifyTransactionConfirmed(txSignature, HELIUS_API_KEY);
            if (!txVerified) {
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: 'Transaction not confirmed. Please wait and try again.' });
            }
            offer.receiverTxSignature = txSignature;
            offer.receiverTransferComplete = true;
        } else if (!txSignature && (offer.receiver.nfts?.length > 0 || offer.receiver.sol > 0)) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: 'Transaction signature required' });
        }

        // Release escrow to receiver
        let escrowReleaseTx = null;
        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
            try {
                escrowReleaseTx = await releaseEscrowToReceiver(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (escrowReleaseTx) {
                    offer.escrowReleaseTxSignature = escrowReleaseTx;
                    offer.initiatorTransferComplete = true;
                }
            } catch (escrowErr) {
                console.error('Escrow release failed:', escrowErr);
                offer.escrowReleaseError = escrowErr.message;
                offer.initiatorTransferComplete = false;
            }
        }

        // Update offer
        offer.status = 'accepted';
        offer.acceptedAt = now;
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Mark signature as used
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Release lock
        await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({
            success: true,
            message: escrowReleaseTx ? 'Swap completed!' : 'Offer accepted.',
            offer,
            escrowReleaseTx
        });

    } catch (error) {
        console.error('Accept offer error:', error);
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to accept offer: ' + error.message });
    }
}
