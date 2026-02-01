// Vercel Serverless Function - Create Swap Offer
import { randomBytes } from 'crypto';
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
    countActiveOffers,
    kvGet,
    kvSet,
    getAsset,
    verifyEscrowTransactionContent,
    verifyTransactionConfirmed,
    ALLOWED_COLLECTIONS,
    MAX_NFTS_PER_SIDE,
    MAX_SOL_PER_SIDE,
    MAX_ACTIVE_OFFERS_PER_WALLET,
    OFFER_EXPIRY_HOURS,
    PLATFORM_FEE,
    HOLDER_FEE,
    appendTxLog
} from '../../lib/swap-utils.js';

// Generate cryptographically secure offer ID
function generateOfferId() {
    return `offer_${randomBytes(16).toString('hex')}`;
}

// Check if wallet owns a MidEvils Orc
async function ownsOrc(walletAddress, heliusApiKey) {
    if (!heliusApiKey) return false;

    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'orc-check',
                method: 'getAssetsByOwner',
                params: { ownerAddress: walletAddress, page: 1, limit: 1000 }
            })
        });

        const data = await response.json();
        const items = data.result?.items || [];

        for (const item of items) {
            const collections = (item.grouping || [])
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            const isMidEvil = collections.includes(ALLOWED_COLLECTIONS[0]);
            const isGraveyard = collections.includes(ALLOWED_COLLECTIONS[1]);
            const name = (item.content?.metadata?.name || '').toLowerCase();
            const isBurnt = item.burnt === true;

            if (isMidEvil && !isGraveyard && !isBurnt && name.includes('orc')) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error('Error checking Orc ownership:', err);
        return false;
    }
}

// Verify NFTs belong to allowed collections and return asset data for reuse
async function verifyNftCollections(nftIds, heliusApiKey) {
    if (!nftIds?.length) return { valid: true, invalidNfts: [], assets: new Map() };

    const results = await Promise.all(nftIds.map(async (nftId) => {
        try {
            const asset = await getAsset(nftId, heliusApiKey);
            if (!asset) {
                return { nftId, invalid: { id: nftId, reason: 'NFT not found' }, asset: null };
            }

            const collections = (asset.grouping || [])
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            if (!collections.some(c => ALLOWED_COLLECTIONS.includes(c))) {
                return { nftId, invalid: { id: nftId, reason: 'Not from allowed collection' }, asset };
            }
            return { nftId, invalid: null, asset };
        } catch (err) {
            return { nftId, invalid: { id: nftId, reason: 'Verification failed' }, asset: null };
        }
    }));

    const invalidNfts = results.filter(r => r.invalid).map(r => r.invalid);
    const assets = new Map(results.filter(r => r.asset).map(r => [r.nftId, r.asset]));
    return { valid: invalidNfts.length === 0, invalidNfts, assets };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'create', 10, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    let escrowTxClaimed = false;

    try {
        const {
            initiatorWallet, receiverWallet,
            initiatorNfts, receiverNfts,
            initiatorSol, receiverSol,
            initiatorNftDetails, receiverNftDetails,
            escrowTxSignature,
            signature, message
        } = req.body;

        // Validate wallets
        if (!validateSolanaAddress(initiatorWallet)) {
            return res.status(400).json({ error: 'Invalid initiator wallet address' });
        }
        if (!validateSolanaAddress(receiverWallet)) {
            return res.status(400).json({ error: 'Invalid receiver wallet address' });
        }
        if (initiatorWallet === receiverWallet) {
            return res.status(400).json({ error: 'Cannot trade with yourself' });
        }

        // Verify signature
        if (!signature || !message) {
            return res.status(400).json({ error: 'Signature required' });
        }
        const expectedMessagePrefix = `Midswap create offer from ${initiatorWallet} to ${receiverWallet} at `;
        if (!message.startsWith(expectedMessagePrefix)) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        const timestampResult = validateTimestamp(message);
        if (!timestampResult.valid) {
            return res.status(400).json({ error: timestampResult.error });
        }

        if (!verifySignature(message, signature, initiatorWallet)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Check signature replay
        if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'This signature has already been used. Please sign a new message.' });
        }

        // Check active offer limit (both as initiator and receiver)
        const [activeOffers, receiverActiveOffers] = await Promise.all([
            countActiveOffers(initiatorWallet, KV_REST_API_URL, KV_REST_API_TOKEN),
            countActiveOffers(receiverWallet, KV_REST_API_URL, KV_REST_API_TOKEN)
        ]);
        if (activeOffers >= MAX_ACTIVE_OFFERS_PER_WALLET) {
            return res.status(400).json({ error: `Maximum ${MAX_ACTIVE_OFFERS_PER_WALLET} active offers per wallet. Cancel some offers first.` });
        }
        if (receiverActiveOffers >= MAX_ACTIVE_OFFERS_PER_WALLET) {
            return res.status(400).json({ error: `Receiver already has ${MAX_ACTIVE_OFFERS_PER_WALLET} active offers. They need to clear some first.` });
        }

        // Validate NFT arrays
        const initNfts = Array.isArray(initiatorNfts) ? initiatorNfts : [];
        const recvNfts = Array.isArray(receiverNfts) ? receiverNfts : [];

        if (initNfts.length > MAX_NFTS_PER_SIDE || recvNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
        }

        // Validate all NFT IDs are valid Solana addresses
        for (const nftId of [...initNfts, ...recvNfts]) {
            if (!validateSolanaAddress(nftId)) {
                return res.status(400).json({ error: 'Invalid NFT ID format' });
            }
        }

        // Verify collections (FAIL CLOSED - if Helius unavailable, reject)
        // Also captures asset data to avoid re-fetching for NFT details
        let verifiedAssets = new Map();
        if (initNfts.length > 0 || recvNfts.length > 0) {
            if (!HELIUS_API_KEY) {
                return res.status(500).json({ error: 'NFT verification service unavailable' });
            }
            const collectionCheck = await verifyNftCollections([...initNfts, ...recvNfts], HELIUS_API_KEY);
            if (!collectionCheck.valid) {
                return res.status(400).json({
                    error: 'Some NFTs are not from allowed collections',
                    invalidNfts: collectionCheck.invalidNfts
                });
            }
            verifiedAssets = collectionCheck.assets;
        }

        // Validate SOL amounts
        const initSol = typeof initiatorSol === 'number' && initiatorSol >= 0 ? initiatorSol : 0;
        const recvSol = typeof receiverSol === 'number' && receiverSol >= 0 ? receiverSol : 0;

        if (initSol > MAX_SOL_PER_SIDE || recvSol > MAX_SOL_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_SOL_PER_SIDE} SOL per side` });
        }

        if (initNfts.length === 0 && initSol === 0) {
            return res.status(400).json({ error: 'Must offer at least one NFT or SOL' });
        }
        if (recvNfts.length === 0 && recvSol === 0) {
            return res.status(400).json({ error: 'Must request at least one NFT or SOL' });
        }

        // Check Orc ownership for fee
        const isOrcHolder = await ownsOrc(initiatorWallet, HELIUS_API_KEY);
        const fee = isOrcHolder ? HOLDER_FEE : PLATFORM_FEE;

        // Verify escrow transaction content
        if (initNfts.length > 0 || initSol > 0) {
            if (!escrowTxSignature) {
                return res.status(400).json({ error: 'Escrow transaction signature required' });
            }
            // Atomic claim — prevents concurrent creates from reusing the same escrow tx
            const claim = await claimEscrowTx(escrowTxSignature, 'pending', KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!claim.claimed) {
                return res.status(400).json({ error: 'This escrow transaction has already been used for another offer.' });
            }
            escrowTxClaimed = true;
            if (!HELIUS_API_KEY) {
                await releaseEscrowTxClaim(escrowTxSignature, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(500).json({ error: 'NFT verification service unavailable' });
            }
            const txCheck = await verifyEscrowTransactionContent(
                escrowTxSignature, initiatorWallet, initNfts, initSol, HELIUS_API_KEY, fee
            );
            if (!txCheck.valid) {
                await releaseEscrowTxClaim(escrowTxSignature, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: txCheck.error || 'Escrow transaction verification failed' });
            }

            // Verify the transaction is finalized on-chain
            const isFinalized = await verifyTransactionConfirmed(escrowTxSignature, HELIUS_API_KEY);
            if (!isFinalized) {
                await releaseEscrowTxClaim(escrowTxSignature, KV_REST_API_URL, KV_REST_API_TOKEN);
                return res.status(400).json({ error: 'Escrow transaction not yet finalized on-chain. Please wait a moment and try again.' });
            }
        }

        // Build NFT details from already-fetched assets (avoids second Helius call per NFT)
        function detailsFromAssets(nftIds) {
            return nftIds.map(nftId => {
                const asset = verifiedAssets.get(nftId);
                if (asset) {
                    return {
                        id: nftId,
                        name: asset.content?.metadata?.name || 'Unknown',
                        imageUrl: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
                        assetType: asset.interface || null,
                        collection: (asset.grouping || []).find(g => g.group_key === 'collection')?.group_value || null
                    };
                }
                return { id: nftId, name: 'Unknown', imageUrl: '', assetType: null, collection: null };
            });
        }

        let serverInitNftDetails = initNfts.length > 0 ? detailsFromAssets(initNfts) : (initiatorNftDetails || []);
        let serverRecvNftDetails = recvNfts.length > 0 ? detailsFromAssets(recvNfts) : (receiverNftDetails || []);

        // Create offer
        const now = Date.now();
        const offerId = generateOfferId();
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: now,
            expiresAt: now + (OFFER_EXPIRY_HOURS * 60 * 60 * 1000),
            initiator: {
                wallet: initiatorWallet,
                nfts: initNfts,
                nftDetails: serverInitNftDetails,
                sol: initSol
            },
            receiver: {
                wallet: receiverWallet,
                nfts: recvNfts,
                nftDetails: serverRecvNftDetails,
                sol: recvSol
            },
            fee,
            isOrcHolder,
            escrowTxSignature: escrowTxSignature || null
        };

        // Save offer
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Log creation
        await appendTxLog(offerId, { action: 'created', wallet: initiatorWallet, txSignature: null, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (escrowTxSignature) {
            await appendTxLog(offerId, { action: 'escrowed', wallet: initiatorWallet, txSignature: escrowTxSignature, error: null, details: null }, KV_REST_API_URL, KV_REST_API_TOKEN);
        }

        // Update wallet offer lists in parallel
        await Promise.all([initiatorWallet, receiverWallet].map(async (wallet) => {
            const key = `wallet:${wallet}:offers`;
            const list = await kvGet(key, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
            list.push(offerId);
            await kvSet(key, list, KV_REST_API_URL, KV_REST_API_TOKEN);
        }));

        // Mark signature as used to prevent replay
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ success: true, offerId, offer });

    } catch (error) {
        console.error('Create offer error:', error);
        // Release escrow tx claim if we claimed it but failed before saving the offer
        if (escrowTxClaimed && req.body?.escrowTxSignature) {
            await releaseEscrowTxClaim(req.body.escrowTxSignature, KV_REST_API_URL, KV_REST_API_TOKEN).catch(() => {});
        }
        return res.status(500).json({ error: 'Failed to create offer. Please try again.' });
    }
}
