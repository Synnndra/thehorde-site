// Vercel Serverless Function - Accept Swap Offer with Two-Phase Escrow Release
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    validateTimestamp,
    isSignatureUsed,
    markSignatureUsed,
    kvGet,
    kvSet,
    acquireLock,
    releaseLock,
    verifyTransactionConfirmed,
    releaseEscrowToReceiver,
    releaseEscrowToInitiator
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

        // Verify receiver's transaction (receiver sent their NFTs to escrow)
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

        // === CRASH-SAFE CHECKPOINT: Set status to 'escrowed' ===
        // Both sides' assets are now in escrow. If the server crashes after this point,
        // retry-release or cleanup can complete the swap.
        offer.status = 'escrowed';
        offer.escrowedAt = now;
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Mark signature as used
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        // === TWO-PHASE RELEASE ===
        let releaseToReceiverTx = null;
        let releaseToInitiatorTx = null;
        let releaseErrors = [];

        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
            // Phase 1: Release initiator's escrowed assets to receiver
            try {
                releaseToReceiverTx = await releaseEscrowToReceiver(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (releaseToReceiverTx) {
                    offer.escrowReleaseTxSignature = releaseToReceiverTx;
                    offer.releaseToReceiverComplete = true;
                } else {
                    // No assets to release (initiator had nothing escrowed)
                    offer.releaseToReceiverComplete = true;
                }
            } catch (err) {
                console.error('Release to receiver failed:', err);
                releaseErrors.push({ phase: 'releaseToReceiver', error: err.message });
                offer.releaseToReceiverComplete = false;
                offer.releaseToReceiverError = err.message;
            }

            // Phase 2: Release receiver's escrowed assets to initiator
            try {
                releaseToInitiatorTx = await releaseEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (releaseToInitiatorTx) {
                    offer.escrowReleaseToInitiatorTxSignature = releaseToInitiatorTx;
                    offer.releaseToInitiatorComplete = true;
                } else {
                    // No assets to release (receiver had nothing escrowed)
                    offer.releaseToInitiatorComplete = true;
                }
            } catch (err) {
                console.error('Release to initiator failed:', err);
                releaseErrors.push({ phase: 'releaseToInitiator', error: err.message });
                offer.releaseToInitiatorComplete = false;
                offer.releaseToInitiatorError = err.message;
            }

            // Set final status based on release results
            if (offer.releaseToReceiverComplete && offer.releaseToInitiatorComplete) {
                offer.status = 'completed';
                offer.completedAt = Date.now();
            }
            // If either failed, status stays 'escrowed' for retry
        }

        // Save final state
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Release lock
        await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({
            success: true,
            status: offer.status,
            message: offer.status === 'completed'
                ? 'Swap completed! Both sides have been released.'
                : 'Assets escrowed. Release is pending — check back shortly.',
            offer,
            releaseToReceiverTx,
            releaseToInitiatorTx,
            releaseErrors: releaseErrors.length > 0 ? releaseErrors : undefined
        });

    } catch (error) {
        console.error('Accept offer error:', error);
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to accept offer: ' + error.message });
    }
}
