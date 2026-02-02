// Vercel Serverless Function - Cleanup Expired and Stuck Escrowed Offers
import { timingSafeEqual } from 'crypto';
import {
    kvGet,
    kvSet,
    returnEscrowToInitiator,
    releaseEscrowToReceiver,
    releaseEscrowToInitiator,
    returnReceiverEscrowAssets,
    verifyNftOwnership,
    acquireLock,
    releaseLock,
    cleanApiKey,
    appendTxLog,
    ESCROW_WALLET
} from '../../lib/swap-utils.js';

const ESCROW_RETRY_THRESHOLD_MS = 5 * 60 * 1000;       // 5 minutes
const ESCROW_RETURN_THRESHOLD_MS = 2 * 60 * 60 * 1000;  // 2 hours
const LOW_BALANCE_LAMPORTS = 10_000_000;                  // 0.01 SOL

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

    // Auth: POST body secret, header secret, or Vercel Cron bearer token
    const CRON_SECRET = process.env.CRON_SECRET;
    const secret = req.method === 'POST'
        ? (req.body?.secret)
        : req.headers['x-cleanup-secret'];
    let cronAuth = false;
    if (CRON_SECRET && req.headers['authorization']) {
        const provided = Buffer.from(String(req.headers['authorization']));
        const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
        cronAuth = provided.length === expected.length && timingSafeEqual(provided, expected);
    }

    let secretValid = false;
    if (CLEANUP_SECRET && secret) {
        const secretBuf = Buffer.from(String(secret));
        const cleanupBuf = Buffer.from(CLEANUP_SECRET);
        secretValid = secretBuf.length === cleanupBuf.length && timingSafeEqual(secretBuf, cleanupBuf);
    }
    if (!cronAuth && !secretValid) {
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
                    const expLock = await acquireLock(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
                    if (!expLock.acquired) {
                        console.log(`Skipping expired offer ${offerId} — locked by another process`);
                        continue;
                    }
                    try {
                        console.log(`Offer ${offer.id} has expired`);
                        results.expired++;
                        await appendTxLog(offer.id, { action: 'expired', wallet: null, txSignature: null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);

                        // Return initiator's escrow
                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && offer.escrowTxSignature) {
                            try {
                                const returnTx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                if (returnTx) {
                                    offer.escrowReturnTxSignature = returnTx;
                                    results.escrowReturned++;
                                    console.log(`Returned escrow for ${offer.id}: ${returnTx}`);
                                    await appendTxLog(offer.id, { action: 'escrow_return', wallet: null, txSignature: returnTx, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
                                }
                            } catch (escrowErr) {
                                console.error(`Escrow return failed for ${offer.id}:`, escrowErr.message);
                                offer.escrowReturnError = escrowErr.message;
                                results.errors.push({ offerId: offer.id, error: escrowErr.message });
                                await appendTxLog(offer.id, { action: 'escrow_return_error', wallet: null, txSignature: null, error: escrowErr.message, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
                            }
                        }

                        // Check if receiver's NFTs are stuck in escrow (browser closed mid-accept)
                        const receiverNfts = offer.receiver?.nftDetails || [];
                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && receiverNfts.length > 0) {
                            const receiverNftIds = receiverNfts.map(n => n.id);
                            const ownershipCheck = await verifyNftOwnership(receiverNftIds, ESCROW_WALLET, HELIUS_API_KEY);
                            if (ownershipCheck.valid) {
                                // Escrow owns receiver's NFTs — return them
                                console.log(`Returning ${receiverNfts.length} receiver NFTs stuck in escrow for ${offer.id}`);
                                try {
                                    const returnTx = await returnReceiverEscrowAssets(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                    if (returnTx) {
                                        offer.receiverEscrowReturnTxSignature = returnTx;
                                        results.escrowReturned++;
                                        console.log(`Returned receiver escrow for ${offer.id}: ${returnTx}`);
                                    }
                                } catch (escrowErr) {
                                    console.error(`Receiver escrow return failed for ${offer.id}:`, escrowErr.message);
                                    offer.receiverEscrowReturnError = escrowErr.message;
                                    results.errors.push({ offerId: offer.id, side: 'receiver', error: escrowErr.message });
                                }
                            }
                        }

                        // Only mark fully expired if all escrow returns succeeded (or weren't needed)
                        const initiatorReturnNeeded = !!offer.escrowTxSignature && !offer.escrowReturnTxSignature;
                        const receiverReturnNeeded = !!offer.receiverEscrowReturnError && !offer.receiverEscrowReturnTxSignature;
                        if (!initiatorReturnNeeded && !receiverReturnNeeded) {
                            offer.status = 'expired';
                            offer.expiredAt = now;
                            offer.expiredByCleanup = true;
                        } else {
                            // Escrow return failed — keep as pending so next cleanup retries
                            const retryCount = (offer.expiryRetryCount || 0) + 1;
                            offer.expiryRetryCount = retryCount;
                            if (retryCount > 10) {
                                offer.status = 'failed';
                                offer.failedAt = now;
                                offer.failedReason = 'Escrow return failed after 10 cleanup retries';
                                console.error(`Offer ${offer.id} failed after ${retryCount} escrow return retries`);
                                await appendTxLog(offer.id, { action: 'failed', wallet: null, txSignature: null, error: null, details: 'Escrow return failed after 10 cleanup retries' }, KV_REST_API_URL, KV_REST_API_TOKEN);
                            } else {
                                offer.escrowReturnPending = true;
                            }
                        }
                        await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                    } finally {
                        await releaseLock(expLock.lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                    }
                    continue;
                }

                // === Handle offers with failed cancel escrow return ===
                if (offer.status === 'pending' && offer.cancelRequested && offer.escrowTxSignature) {
                    const canLock = await acquireLock(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
                    if (!canLock.acquired) {
                        console.log(`Skipping cancel-requested offer ${offerId} — locked by another process`);
                        continue;
                    }
                    try {
                        console.log(`Offer ${offer.id} has pending cancel with failed escrow return`);

                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                            try {
                                const returnTx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                if (returnTx) {
                                    offer.escrowReturnTxSignature = returnTx;
                                    results.escrowReturned++;
                                    console.log(`Returned escrow for cancelled ${offer.id}: ${returnTx}`);
                                }
                            } catch (escrowErr) {
                                console.error(`Cancel escrow return retry failed for ${offer.id}:`, escrowErr.message);
                                offer.escrowReturnError = escrowErr.message;
                                results.errors.push({ offerId: offer.id, error: escrowErr.message });
                                await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                                continue;
                            }
                        }

                        offer.status = 'cancelled';
                        offer.cancelledAt = now;
                        offer.cancelledBy = offer.cancelRequestedBy;
                        offer.cancelAction = offer.cancelRequestedAction;
                        offer.cancelledByCleanup = true;
                        await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                    } finally {
                        await releaseLock(canLock.lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                    }
                    continue;
                }

                // === Handle offers previously marked expired by old read endpoints (may have escrow stuck) ===
                if (offer.status === 'expired' && offer.escrowTxSignature && !offer.escrowReturnTxSignature && !offer.expiredByCleanup) {
                    const stuckLock = await acquireLock(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);
                    if (!stuckLock.acquired) {
                        console.log(`Skipping stuck expired offer ${offerId} — locked by another process`);
                        continue;
                    }
                    try {
                        console.log(`Offer ${offer.id} was marked expired without escrow return, fixing`);

                        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                            try {
                                const returnTx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                if (returnTx) {
                                    offer.escrowReturnTxSignature = returnTx;
                                    results.escrowReturned++;
                                    console.log(`Returned stuck escrow for ${offer.id}: ${returnTx}`);
                                }
                            } catch (escrowErr) {
                                console.error(`Stuck escrow return failed for ${offer.id}:`, escrowErr.message);
                                offer.escrowReturnError = escrowErr.message;
                                results.errors.push({ offerId: offer.id, error: escrowErr.message });
                            }
                        }

                        offer.expiredByCleanup = true;
                        await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                    } finally {
                        await releaseLock(stuckLock.lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                    }
                    continue;
                }

                // === Handle stuck escrowed offers ===
                if (offer.status === 'escrowed' && offer.escrowedAt) {
                    const lock = await acquireLock(offer.id, KV_REST_API_URL, KV_REST_API_TOKEN);
                    if (!lock.acquired) {
                        console.log(`Skipping escrowed offer ${offer.id} — locked by another process`);
                        continue;
                    }

                    try {
                        const escrowAge = now - offer.escrowedAt;

                        // Escrowed > 2 hours: return all assets to original owners
                        if (escrowAge > ESCROW_RETURN_THRESHOLD_MS) {
                            console.log(`Offer ${offer.id} escrowed for >2h, returning assets to owners`);

                            let returnErrors = [];

                            if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                                if (!offer.releaseToReceiverComplete) {
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

                        // Escrowed > 5 minutes: retry releases (max 10 attempts)
                        if (escrowAge > ESCROW_RETRY_THRESHOLD_MS) {
                            const retryCount = (offer.cleanupRetryCount || 0) + 1;
                            const MAX_RETRIES = 10;

                            if (retryCount > MAX_RETRIES) {
                                console.log(`Offer ${offer.id} exceeded ${MAX_RETRIES} retries, returning assets to owners`);
                                let returnErrors = [];
                                if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
                                    if (!offer.releaseToReceiverComplete) {
                                        try {
                                            const tx = await returnEscrowToInitiator(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                            if (tx) offer.initiatorReturnTxSignature = tx;
                                        } catch (err) {
                                            returnErrors.push({ side: 'initiator', error: err.message });
                                        }
                                    }
                                    if (!offer.releaseToInitiatorComplete) {
                                        try {
                                            const tx = await returnReceiverEscrowAssets(offer, ESCROW_PRIVATE_KEY, HELIUS_API_KEY);
                                            if (tx) offer.receiverReturnTxSignature = tx;
                                        } catch (err) {
                                            returnErrors.push({ side: 'receiver', error: err.message });
                                        }
                                    }
                                }
                                if (returnErrors.length === 0) {
                                    offer.status = 'failed';
                                    offer.failedAt = now;
                                    offer.failedReason = `Escrow release failed after ${MAX_RETRIES} retries, assets returned to owners`;
                                    results.escrowFailed++;
                                    await appendTxLog(offer.id, { action: 'failed', wallet: null, txSignature: null, error: null, details: `Escrow release failed after ${MAX_RETRIES} retries, assets returned to owners` }, KV_REST_API_URL, KV_REST_API_TOKEN);
                                } else {
                                    offer.returnErrors = returnErrors;
                                    results.errors.push({ offerId: offer.id, errors: returnErrors });
                                }
                                offer.cleanupRetryCount = retryCount;
                                await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                                continue;
                            }

                            console.log(`Offer ${offer.id} escrowed for >5m, retry ${retryCount}/${MAX_RETRIES}`);
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
                                        await appendTxLog(offer.id, { action: 'retry_release', wallet: null, txSignature: tx || null, error: null, details: `phase1 retry #${retryCount}` }, KV_REST_API_URL, KV_REST_API_TOKEN);
                                    } catch (err) {
                                        console.error(`Retry release to receiver failed for ${offer.id}:`, err.message);
                                        offer.releaseToReceiverError = err.message;
                                        results.errors.push({ offerId: offer.id, phase: 'releaseToReceiver', error: err.message });
                                        await appendTxLog(offer.id, { action: 'retry_release', wallet: null, txSignature: null, error: err.message, details: `phase1 retry #${retryCount} failed` }, KV_REST_API_URL, KV_REST_API_TOKEN);
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
                                        await appendTxLog(offer.id, { action: 'retry_release', wallet: null, txSignature: tx || null, error: null, details: `phase2 retry #${retryCount}` }, KV_REST_API_URL, KV_REST_API_TOKEN);
                                    } catch (err) {
                                        console.error(`Retry release to initiator failed for ${offer.id}:`, err.message);
                                        offer.releaseToInitiatorError = err.message;
                                        results.errors.push({ offerId: offer.id, phase: 'releaseToInitiator', error: err.message });
                                        await appendTxLog(offer.id, { action: 'retry_release', wallet: null, txSignature: null, error: err.message, details: `phase2 retry #${retryCount} failed` }, KV_REST_API_URL, KV_REST_API_TOKEN);
                                    }
                                }

                                if (offer.releaseToReceiverComplete && offer.releaseToInitiatorComplete) {
                                    offer.status = 'completed';
                                    offer.completedAt = now;
                                    results.escrowCompleted++;
                                }
                            }

                            offer.cleanupRetryCount = retryCount;
                            offer.lastCleanupRetryAt = now;
                            await kvSet(key, offer, KV_REST_API_URL, KV_REST_API_TOKEN);
                        }
                    } finally {
                        await releaseLock(lock.lockKey, KV_REST_API_URL, KV_REST_API_TOKEN);
                    }
                }

            } catch (offerErr) {
                console.error(`Error processing ${key}:`, offerErr.message);
                results.errors.push({ key, error: offerErr.message });
            }
        }

        // Check escrow wallet balance
        let escrowBalance = null;
        if (HELIUS_API_KEY) {
            try {
                const balRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${cleanApiKey(HELIUS_API_KEY)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'getBalance',
                        params: [ESCROW_WALLET]
                    })
                });
                const balData = await balRes.json();
                escrowBalance = balData.result?.value ?? null;
                if (escrowBalance !== null && escrowBalance < LOW_BALANCE_LAMPORTS) {
                    console.error(`WARNING: Escrow wallet balance low: ${escrowBalance} lamports (${(escrowBalance / 1e9).toFixed(4)} SOL)`);
                }
            } catch (err) {
                console.error('Escrow balance check failed:', err.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${results.processed}, expired ${results.expired}, escrow returned ${results.escrowReturned}, escrow retried ${results.escrowRetried}, escrow completed ${results.escrowCompleted}, escrow failed ${results.escrowFailed}`,
            results,
            escrowBalance: escrowBalance !== null ? { lamports: escrowBalance, sol: escrowBalance / 1e9, low: escrowBalance < LOW_BALANCE_LAMPORTS } : undefined
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ error: 'Cleanup failed' });
    }
}
