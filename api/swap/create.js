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
    countActiveOffers,
    kvGet,
    kvSet,
    getAsset,
    verifyTransactionConfirmed,
    ALLOWED_COLLECTIONS,
    MAX_NFTS_PER_SIDE,
    MAX_ACTIVE_OFFERS_PER_WALLET,
    OFFER_EXPIRY_HOURS,
    PLATFORM_FEE,
    HOLDER_FEE
} from './utils.js';

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

// Verify NFTs belong to allowed collections
async function verifyNftCollections(nftIds, heliusApiKey) {
    if (!nftIds?.length) return { valid: true, invalidNfts: [] };

    const invalidNfts = [];
    for (const nftId of nftIds) {
        try {
            const asset = await getAsset(nftId, heliusApiKey);
            if (!asset) {
                invalidNfts.push({ id: nftId, reason: 'NFT not found' });
                continue;
            }

            const collections = (asset.grouping || [])
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            if (!collections.some(c => ALLOWED_COLLECTIONS.includes(c))) {
                invalidNfts.push({ id: nftId, reason: 'Not from allowed collection' });
            }
        } catch (err) {
            invalidNfts.push({ id: nftId, reason: 'Verification failed' });
        }
    }

    return { valid: invalidNfts.length === 0, invalidNfts };
}

// Verify escrow transaction
async function verifyEscrowTransaction(signature, initiatorWallet, heliusApiKey) {
    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]
            })
        });
        const data = await response.json();

        if (!data.result?.meta || data.result.meta.err !== null) {
            return false;
        }

        // Verify initiator signed the transaction
        const allKeys = [
            ...(data.result.transaction?.message?.accountKeys || []),
            ...(data.result.transaction?.message?.staticAccountKeys || [])
        ];

        return allKeys.some((key, i) => {
            const keyStr = typeof key === 'string' ? key : key.pubkey;
            return keyStr === initiatorWallet && i < (data.result.transaction?.signatures?.length || 1);
        });
    } catch (err) {
        console.error('Escrow verification error:', err);
        return false;
    }
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
        if (!message.includes(initiatorWallet) || !message.includes(receiverWallet)) {
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

        // Check active offer limit
        const activeOffers = await countActiveOffers(initiatorWallet, KV_REST_API_URL, KV_REST_API_TOKEN);
        if (activeOffers >= MAX_ACTIVE_OFFERS_PER_WALLET) {
            return res.status(400).json({ error: `Maximum ${MAX_ACTIVE_OFFERS_PER_WALLET} active offers per wallet. Cancel some offers first.` });
        }

        // Validate NFT arrays
        const initNfts = Array.isArray(initiatorNfts) ? initiatorNfts : [];
        const recvNfts = Array.isArray(receiverNfts) ? receiverNfts : [];

        if (initNfts.length > MAX_NFTS_PER_SIDE || recvNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
        }

        // Verify collections (FAIL CLOSED - if Helius unavailable, reject)
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
        }

        // Validate SOL amounts
        const initSol = typeof initiatorSol === 'number' && initiatorSol >= 0 ? initiatorSol : 0;
        const recvSol = typeof receiverSol === 'number' && receiverSol >= 0 ? receiverSol : 0;

        if (initNfts.length === 0 && initSol === 0) {
            return res.status(400).json({ error: 'Must offer at least one NFT or SOL' });
        }
        if (recvNfts.length === 0 && recvSol === 0) {
            return res.status(400).json({ error: 'Must request at least one NFT or SOL' });
        }

        // Check Orc ownership for fee
        const isOrcHolder = await ownsOrc(initiatorWallet, HELIUS_API_KEY);
        const fee = isOrcHolder ? HOLDER_FEE : PLATFORM_FEE;

        // Verify escrow transaction
        if (escrowTxSignature && HELIUS_API_KEY) {
            const txVerified = await verifyEscrowTransaction(escrowTxSignature, initiatorWallet, HELIUS_API_KEY);
            if (!txVerified) {
                return res.status(400).json({ error: 'Escrow transaction not confirmed' });
            }
        } else if (initNfts.length > 0 || initSol > 0) {
            if (!escrowTxSignature) {
                return res.status(400).json({ error: 'Escrow transaction signature required' });
            }
        }

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
                nftDetails: initiatorNftDetails || [],
                sol: initSol
            },
            receiver: {
                wallet: receiverWallet,
                nfts: recvNfts,
                nftDetails: receiverNftDetails || [],
                sol: recvSol
            },
            fee,
            isOrcHolder,
            escrowTxSignature: escrowTxSignature || null
        };

        // Save offer
        await kvSet(`offer:${offerId}`, offer, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Update wallet offer lists
        for (const wallet of [initiatorWallet, receiverWallet]) {
            const key = `wallet:${wallet}:offers`;
            const list = await kvGet(key, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
            list.push(offerId);
            await kvSet(key, list, KV_REST_API_URL, KV_REST_API_TOKEN);
        }

        // Mark signature as used to prevent replay
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ success: true, offerId, offer });

    } catch (error) {
        console.error('Create offer error:', error);
        return res.status(500).json({ error: 'Failed to create offer' });
    }
}
