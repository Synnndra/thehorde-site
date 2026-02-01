// Vercel Serverless Function - Retry Escrow Release for Stuck Offers
import {
    getClientIp,
    isRateLimitedKV,
    validateSolanaAddress,
    verifySignature,
    validateTimestamp,
    isSignatureUsed,
    markSignatureUsed,
    kvGet,
    kvSet,
    acquireLock,
    releaseLock,
    releaseEscrowToReceiver,
    releaseEscrowToInitiator,
    appendTxLog
} from '../../lib/swap-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;
    const ADMIN_SECRET = (process.env.ADMIN_SECRET || process.env.CLEANUP_SECRET)?.trim()?.replace(/\\n/g, '');

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!ESCROW_PRIVATE_KEY || !HELIUS_API_KEY) {
        return res.status(500).json({ error: 'Escrow configuration missing' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'retry-release', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    let lockKey = null;

    try {
        const { offerId, wallet, signature, message, secret } = req.body;

        if (!offerId || typeof offerId !== 'string' || !/^offer_[a-f0-9]{32}$/.test(offerId)) {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        // Auth: either wallet signature from a party, or admin secret
        const isAdminAuth = ADMIN_SECRET && secret === ADMIN_SECRET;

        if (!isAdminAuth) {
            if (!wallet || !signature || !message) {
                return res.status(400).json({ error: 'Wallet signature or admin secret required' });
            }
            if (!validateSolanaAddress(wallet)) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }
            const expectedMessagePrefix = `Midswap retry-release offer ${offerId} at `;
            if (!message.startsWith(expectedMessagePrefix)) {
                return res.status(400).json({ error: 'Invalid message format' });
            }
            const timestampResult = validateTimestamp(message);
            if (!timestampResult.valid) {
                return res.status(400).json({ error: timestampResult.error });
            }
            if (!verifySignature(message, signature, wallet)) {
                return res.status(403).json({ error: 'Invalid signature' });
            }
            if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
                return res.status(400).json({ error: 'This signature has already been used. Please sign a new message.' });
            }
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

        // Must be in 'escrowed' state
        if (offer.status !== 'escrowed') {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: `Offer status is '${offer.status}', not 'escrowed'` });
        }

        // If wallet auth, verify caller is a party to the offer
        if (!isAdminAuth) {
            if (wallet !== offer.initiator.wallet && wallet !== offer.receiver.wallet) {
                await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(403).json({ error: 'Only parties to this offer can retry release' });
            }
        }

        // Retry whichever releases haven't completed
        let releaseErrors = [];

        if (!offer.releaseToReceiverComplete) {
            try {
                const tx = await releaseEscrowToReceiver(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (tx) {
                    offer.escrowReleaseTxSignature = tx;
                }
                offer.releaseToReceiverComplete = true;
                delete offer.releaseToReceiverError;
                await appendTxLog(offerId, { action: 'release_phase1', wallet: wallet || null, txSignature: tx || null, error: null, details: 'manual retry' }, KV_REST_API_URL, KV_REST_API_TOKEN);
            } catch (err) {
                console.error('Retry release to receiver failed:', err);
                releaseErrors.push({ phase: 'releaseToReceiver', error: err.message });
                offer.releaseToReceiverError = err.message;
                await appendTxLog(offerId, { action: 'release_phase1_error', wallet: wallet || null, txSignature: null, error: err.message, details: 'manual retry' }, KV_REST_API_URL, KV_REST_API_TOKEN);
            }
        }

        if (!offer.releaseToInitiatorComplete) {
            try {
                const tx = await releaseEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (tx) {
                    offer.escrowReleaseToInitiatorTxSignature = tx;
                }
                offer.releaseToInitiatorComplete = true;
                delete offer.releaseToInitiatorError;
                await appendTxLog(offerId, { action: 'release_phase2', wallet: wallet || null, txSignature: tx || null, error: null, details: 'manual retry' }, KV_REST_API_URL, KV_REST_API_TOKEN);
            } catch (err) {
                console.error('Retry release to initiator failed:', err);
                releaseErrors.push({ phase: 'releaseToInitiator', error: err.message });
                offer.releaseToInitiatorError = err.message;
                await appendTxLog(offerId, { action: 'release_phase2_error', wallet: wallet || null, txSignature: null, error: err.message, details: 'manual retry' }, KV_REST_API_URL, KV_REST_API_TOKEN);
            }
        }

        // Update status
        if (offer.releaseToReceiverComplete && offer.releaseToInitiatorComplete) {
            offer.status = 'completed';
            offer.completedAt = Date.now();
            await appendTxLog(offerId, { action: 'completed', wallet: null, txSignature: null, error: null, details: 'completed via manual retry' }, KV_REST_API_URL, KV_REST_API_TOKEN);
        }

        offer.lastRetryAt = Date.now();
        offer.retryCount = (offer.retryCount || 0) + 1;

        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (!isAdminAuth && signature) {
            await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);
        }
        await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({
            success: true,
            status: offer.status,
            message: offer.status === 'completed'
                ? 'All releases completed successfully.'
                : 'Some releases still pending. Try again later.',
            releaseErrors: releaseErrors.length > 0 ? releaseErrors : undefined
        });

    } catch (error) {
        console.error('Retry release error:', error);
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to retry release. Please try again.' });
    }
}
