// Admin endpoint to manually release stuck NFTs from escrow
// Returns each side's assets to their original owner based on offer data
import { timingSafeEqual } from 'crypto';
import {
    validateSolanaAddress,
    kvGet,
    kvSet,
    acquireLock,
    releaseLock,
    returnEscrowToInitiator,
    returnReceiverEscrowAssets,
    cleanApiKey,
    appendTxLog,
    getClientIp,
    isRateLimitedKV
} from '../../lib/swap-utils.js';

const ALLOWED_STATUSES = ['pending', 'escrowed', 'failed'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!ESCROW_PRIVATE_KEY || !HELIUS_API_KEY || !KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rate limit before auth check to block brute force
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'admin-release', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    let lockKey = null;

    try {
        const { secret, offerId } = req.body;

        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(ADMIN_SECRET);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (!offerId || typeof offerId !== 'string' || !/^offer_[a-f0-9]{32}$/.test(offerId)) {
            return res.status(400).json({ error: 'Valid offerId required' });
        }

        // Acquire lock to prevent race with accept/cancel/retry-release
        const lock = await acquireLock(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (!lock.acquired) {
            return res.status(409).json({ error: 'Offer is being processed by another operation. Try again.' });
        }
        lockKey = lock.lockKey;

        // Fetch the offer to determine who gets what
        const offer = await kvGet(`offer:${offerId}`, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (!offer) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(404).json({ error: 'Offer not found' });
        }

        // Block admin release on completed/cancelled/expired offers
        if (!ALLOWED_STATUSES.includes(offer.status)) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(400).json({ error: `Cannot admin-release offer with status '${offer.status}'. Only pending, escrowed, or failed offers can be released.` });
        }

        const results = { initiatorReturn: null, receiverReturn: null, errors: [] };

        // Return initiator's escrowed assets back to initiator
        // Skip if: already returned, OR already released to receiver (escrowed offer where phase 1 completed)
        const hasInitiatorAssets = (offer.initiator?.nfts?.length > 0 || offer.initiator?.sol > 0);
        const initiatorAlreadyHandled = offer.escrowReturnTxSignature || offer.releaseToReceiverComplete;
        if (hasInitiatorAssets && !initiatorAlreadyHandled) {
            try {
                const tx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (tx) {
                    offer.escrowReturnTxSignature = tx;
                    results.initiatorReturn = tx;
                }
            } catch (err) {
                results.errors.push({ side: 'initiator', error: err.message });
            }
        }

        // Return receiver's escrowed assets back to receiver
        // Skip if: already returned, OR already released to initiator (escrowed offer where phase 2 completed)
        const hasReceiverAssets = (offer.receiver?.nfts?.length > 0 || offer.receiver?.sol > 0);
        const receiverAlreadyHandled = offer.receiverEscrowReturnTxSignature || offer.releaseToInitiatorComplete;
        if (hasReceiverAssets && !receiverAlreadyHandled) {
            try {
                const tx = await returnReceiverEscrowAssets(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                if (tx) {
                    offer.receiverEscrowReturnTxSignature = tx;
                    results.receiverReturn = tx;
                }
            } catch (err) {
                results.errors.push({ side: 'receiver', error: err.message });
            }
        }

        // Mark offer as failed with admin action
        if (results.errors.length === 0) {
            offer.status = 'failed';
            offer.failedAt = Date.now();
            offer.failedReason = 'Admin manual release - assets returned to owners';
        }
        offer.adminReleasedAt = Date.now();
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        await appendTxLog(offerId, { action: 'admin_release', wallet: null, txSignature: results.initiatorReturn || results.receiverReturn || null, error: results.errors.length > 0 ? JSON.stringify(results.errors) : null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);

        await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({
            success: true,
            offerId,
            results,
            message: results.errors.length === 0
                ? 'Assets returned to original owners'
                : `Partial release: ${results.errors.length} error(s)`
        });

    } catch (error) {
        console.error('Admin release error:', error);
        if (lockKey) {
            await releaseLock(lockKey, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Admin release failed' });
    }
}
