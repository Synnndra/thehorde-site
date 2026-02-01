// Vercel Serverless Function - Cancel/Decline Swap Offer with Escrow Return
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
    returnEscrowToInitiator,
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
    if (await isRateLimitedKV(clientIp, 'cancel', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    let lockKey = null;

    try {
        const { offerId, wallet, action, signature, message } = req.body;

        // Validate inputs
        if (!offerId || typeof offerId !== 'string' || !/^offer_[a-f0-9]{32}$/.test(offerId)) {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }
        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!['cancel', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }
        if (!signature || !message) {
            return res.status(400).json({ error: 'Signature required to verify wallet ownership' });
        }
        const expectedMessagePrefix = `Midswap ${action} offer ${offerId} at `;
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

        // Check if still pending
        if (offer.status !== 'pending') {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: 'Offer is no longer pending' });
        }

        // Verify authorization
        if (action === 'cancel' && wallet !== offer.initiator.wallet) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(403).json({ error: 'Only the initiator can cancel this offer' });
        }
        if (action === 'decline' && wallet !== offer.receiver.wallet) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(403).json({ error: 'Only the receiver can decline this offer' });
        }

        // Return escrowed assets to initiator
        let escrowReturnTx = null;
        let escrowReturnFailed = false;
        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && offer.escrowTxSignature) {
            try {
                escrowReturnTx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (escrowReturnTx) {
                    offer.escrowReturnTxSignature = escrowReturnTx;
                }
            } catch (escrowErr) {
                console.error('Escrow return failed:', escrowErr);
                offer.escrowReturnError = escrowErr.message;
                escrowReturnFailed = true;
            }
        }

        // Only mark cancelled if escrow return succeeded (or no escrow to return)
        if (escrowReturnFailed) {
            // Escrow return failed — keep status as pending so cleanup can handle it
            offer.cancelRequested = true;
            offer.cancelRequestedAt = Date.now();
            offer.cancelRequestedBy = wallet;
            offer.cancelRequestedAction = action;
            await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

            await appendTxLog(offerId, { action: 'cancel_requested', wallet, txSignature: null, error: offer.escrowReturnError || null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
            await appendTxLog(offerId, { action: 'escrow_return_error', wallet: null, txSignature: null, error: offer.escrowReturnError || null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);

            await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

            return res.status(200).json({
                success: true,
                message: 'Escrow return is processing. Your assets will be returned shortly.',
                escrowReturnPending: true,
                offer
            });
        }

        offer.status = 'cancelled';
        offer.cancelledAt = Date.now();
        offer.cancelledBy = wallet;
        offer.cancelAction = action;
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        await appendTxLog(offerId, { action: 'cancelled', wallet, txSignature: escrowReturnTx || null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Mark signature as used
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Release lock
        await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({
            success: true,
            message: action === 'cancel'
                ? 'Offer cancelled. Your escrowed assets have been returned.'
                : 'Offer declined. Initiator\'s assets have been returned.',
            offer,
            escrowReturnTx
        });

    } catch (error) {
        console.error('Cancel offer error:', error);
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to cancel offer. Please try again.' });
    }
}
