// Vercel Serverless Function - Cleanup Expired and Stuck Escrowed Offers
import {
    kvGet,
    kvSet,
    returnEscrowToInitiator,
    releaseEscrowToReceiver,
    releaseEscrowToInitiator,
    returnReceiverEscrowAssets
} from './utils.js';

const ESCROW_RETRY_THRESHOLD_MS = 5 * 60 * 1000;       // 5 minutes
const ESCROW_RETURN_THRESHOLD_MS = 2 * 60 * 60 * 1000;  // 2 hours

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

    // Auth required for all requests
    const secret = req.method === 'POST'
        ? (req.body?.secret)
        : (req.query?.secret || req.headers['x-cleanup-secret']);

    if (!CLEANUP_SECRET || secret !== CLEANUP_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const now = Date.now();
        const results = {
            processed: 0,
            expired: 0,
            escrowReturned: 0,
            escrowRetried: 0,
            escrowCompleted: 0,
            escrowFailed: 0,
            errors: []
        };

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

                if (!offer) continue;

                // === Handle expired pending offers ===
                if (offer.status === 'pending' && offer.expiresAt && offer.expiresAt < now) {
                    console.log(`Offer ${offer.id} has expired`);
                    results.expired++;

                    // Return initiator's escrow
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

                    offer.status = 'expired';
                    offer.expiredAt = now;
                    offer.expiredByCleanup = true;
                    await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                    continue;
                }

                // === Handle stuck escrowed offers ===
                if (offer.status === 'escrowed' && offer.escrowedAt) {
                    const escrowAge = now - offer.escrowedAt;

                    // Escrowed > 2 hours: return all assets to original owners
                    if (escrowAge > ESCROW_RETURN_THRESHOLD_MS) {
                        console.log(`Offer ${offer.id} escrowed for >2h, returning assets to owners`);

                        let returnErrors = [];

                        // Return initiator's assets back to initiator
                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                            if (!offer.releaseToReceiverComplete) {
                                // Initiator's assets are still in escrow, return them
                                try {
                                    const tx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                    if (tx) {
                                        offer.initiatorReturnTxSignature = tx;
                                        console.log(`Returned initiator assets for ${offer.id}: ${tx}`);
                                    }
                                } catch (err) {
                                    console.error(`Return initiator assets failed for ${offer.id}:`, err.message);
                                    returnErrors.push({ side: 'initiator', error: err.message });
                                }
                            }

                            // Return receiver's assets back to receiver
                            if (!offer.releaseToInitiatorComplete) {
                                try {
                                    const tx = await returnReceiverEscrowAssets(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                    if (tx) {
                                        offer.receiverReturnTxSignature = tx;
                                        console.log(`Returned receiver assets for ${offer.id}: ${tx}`);
                                    }
                                } catch (err) {
                                    console.error(`Return receiver assets failed for ${offer.id}:`, err.message);
                                    returnErrors.push({ side: 'receiver', error: err.message });
                                }
                            }
                        }

                        if (returnErrors.length === 0) {
                            offer.status = 'failed';
                            offer.failedAt = now;
                            offer.failedReason = 'Escrow release timed out, assets returned to owners';
                            results.escrowFailed++;
                        } else {
                            offer.returnErrors = returnErrors;
                            results.errors.push({ offerId: offer.id, errors: returnErrors });
                        }

                        await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                        continue;
                    }

                    // Escrowed > 5 minutes: retry releases
                    if (escrowAge > ESCROW_RETRY_THRESHOLD_MS) {
                        console.log(`Offer ${offer.id} escrowed for >5m, retrying releases`);
                        results.escrowRetried++;

                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                            if (!offer.releaseToReceiverComplete) {
                                try {
                                    const tx = await releaseEscrowToReceiver(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                    if (tx) {
                                        offer.escrowReleaseTxSignature = tx;
                                    }
                                    offer.releaseToReceiverComplete = true;
                                    delete offer.releaseToReceiverError;
                                } catch (err) {
                                    console.error(`Retry release to receiver failed for ${offer.id}:`, err.message);
                                    offer.releaseToReceiverError = err.message;
                                    results.errors.push({ offerId: offer.id, phase: 'releaseToReceiver', error: err.message });
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
                                } catch (err) {
                                    console.error(`Retry release to initiator failed for ${offer.id}:`, err.message);
                                    offer.releaseToInitiatorError = err.message;
                                    results.errors.push({ offerId: offer.id, phase: 'releaseToInitiator', error: err.message });
                                }
                            }

                            if (offer.releaseToReceiverComplete && offer.releaseToInitiatorComplete) {
                                offer.status = 'completed';
                                offer.completedAt = now;
                                results.escrowCompleted++;
                            }
                        }

                        offer.lastCleanupRetryAt = now;
                        await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                    }
                }

            } catch (offerErr) {
                console.error(`Error processing ${key}:`, offerErr.message);
                results.errors.push({ key, error: offerErr.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${results.processed}, expired ${results.expired}, escrow returned ${results.escrowReturned}, escrow retried ${results.escrowRetried}, escrow completed ${results.escrowCompleted}, escrow failed ${results.escrowFailed}`,
            results
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
}
