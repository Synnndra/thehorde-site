// Vercel Serverless Function - Accept Swap Offer with Two-Phase Escrow Release
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    validateTimestamp,
    isSignatureUsed,
    markSignatureUsed,
    claimEscrowTx,
    releaseEscrowTxClaim,
    kvGet,
    kvSet,
    acquireLock,
    releaseLock,
    verifyEscrowTransactionContent,
    verifyTransactionConfirmed,
    verifyNftOwnership,
    releaseEscrowToReceiver,
    releaseEscrowToInitiator,
    appendTxLog
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
    let claimedTxSignature = null;

    try {
        const { offerId, wallet, txSignature, signature, message } = req.body;

        // Validate inputs
        if (!offerId || typeof offerId !== 'string' || !/^offer_[a-f0-9]{32}$/.test(offerId)) {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }
        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!signature || !message) {
            return res.status(400).json({ error: 'Signature required to verify wallet ownership' });
        }
        const expectedMessagePrefix = `Midswap accept offer ${offerId} at `;
        if (!message.startsWith(expectedMessagePrefix)) {
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

        const receiverNftIds = offer.receiver.nfts || [];

        // Verify receiver's transaction content (receiver sent their NFTs to escrow)
        // This replaces the ownership check — if tx is verified, assets are confirmed in escrow.
        if (txSignature && HELIUS_API_KEY) {
            // Atomic claim — prevents same escrow tx across different offers
            const claim = await claimEscrowTx(txSignature, offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!claim.claimed) {
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: 'This escrow transaction has already been used for another offer.' });
            }
            claimedTxSignature = txSignature;
            const txCheck = await verifyEscrowTransactionContent(
                txSignature, wallet, receiverNftIds, offer.receiver.sol || 0, HELIUS_API_KEY
            );
            if (!txCheck.valid) {
                await releaseEscrowTxClaim(txSignature, KV_REST_API_URL, KV_REST_API_TOKEN);
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: txCheck.error || 'Transaction verification failed' });
            }

            // Verify the transaction is finalized on-chain
            const isFinalized = await verifyTransactionConfirmed(txSignature, HELIUS_API_KEY);
            if (!isFinalized) {
                await releaseEscrowTxClaim(txSignature, KV_REST_API_URL, KV_REST_API_TOKEN);
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: 'Transaction not yet finalized on-chain. Please wait a moment and try again.' });
            }

            offer.receiverTxSignature = txSignature;
            offer.receiverTransferComplete = true;
        } else if (!txSignature && (receiverNftIds.length > 0 || offer.receiver.sol > 0)) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: 'Transaction signature required' });
        }

        // === CRASH-SAFE CHECKPOINT: Set status to 'escrowed' ===
        // Both sides' assets are now in escrow. If the server crashes after this point,
        // retry-release or cleanup can complete the swap.
        offer.status = 'escrowed';
        offer.escrowedAt = now;
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        await appendTxLog(offerId, { action: 'escrowed', wallet, txSignature: txSignature || null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);

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
                    offer.releaseToReceiverComplete = true;
                }
                await appendTxLog(offerId, { action: 'release_phase1', wallet: null, txSignature: releaseToReceiverTx || null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            } catch (err) {
                console.error('Release to receiver failed:', err);
                releaseErrors.push({ phase: 'releaseToReceiver', error: err.message });
                offer.releaseToReceiverComplete = false;
                offer.releaseToReceiverError = err.message;
                await appendTxLog(offerId, { action: 'release_phase1_error', wallet: null, txSignature: null, error: err.message, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            }
            // Persist immediately so crash can't lose phase 1 result
            await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

            // Phase 2: Release receiver's escrowed assets to initiator
            try {
                releaseToInitiatorTx = await releaseEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (releaseToInitiatorTx) {
                    offer.escrowReleaseToInitiatorTxSignature = releaseToInitiatorTx;
                    offer.releaseToInitiatorComplete = true;
                } else {
                    offer.releaseToInitiatorComplete = true;
                }
                await appendTxLog(offerId, { action: 'release_phase2', wallet: null, txSignature: releaseToInitiatorTx || null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            } catch (err) {
                console.error('Release to initiator failed:', err);
                releaseErrors.push({ phase: 'releaseToInitiator', error: err.message });
                offer.releaseToInitiatorComplete = false;
                offer.releaseToInitiatorError = err.message;
                await appendTxLog(offerId, { action: 'release_phase2_error', wallet: null, txSignature: null, error: err.message, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            }

            // Set final status based on release results
            if (offer.releaseToReceiverComplete && offer.releaseToInitiatorComplete) {
                offer.status = 'completed';
                offer.completedAt = Date.now();
                await appendTxLog(offerId, { action: 'completed', wallet: null, txSignature: null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            }
        }

        // Save final state (includes phase 2 result and final status)
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
        if (claimedTxSignature) {
            await releaseEscrowTxClaim(claimedTxSignature, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to accept offer. Please try again.' });
    }
}
