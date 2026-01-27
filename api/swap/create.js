// Vercel Serverless Function - Create Swap Offer
import { randomBytes } from 'crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // Max 10 offer creations per minute per IP

// Valid MidEvils collections
const ALLOWED_COLLECTIONS = [
    'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW',  // MidEvils
    'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF'  // Graveyard
];

// Constraints
const MAX_NFTS_PER_SIDE = 5;
const OFFER_EXPIRY_HOURS = 24;
const PLATFORM_FEE = 0.01; // SOL - only for non-holders
const HOLDER_FEE = 0; // Free for MidEvils holders

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return false;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return true;
    }

    record.count++;
    return false;
}

// Generate cryptographically secure offer ID
function generateOfferId() {
    const bytes = randomBytes(16);
    const hex = bytes.toString('hex');
    return `offer_${hex}`;
}

function validateSolanaAddress(address) {
    // Basic validation: 32-44 characters, base58 characters only
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

// Verify a signed message
function verifySignature(message, signature, publicKey) {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(publicKey);
        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (err) {
        console.error('Signature verification error:', err);
        return false;
    }
}

// Verify NFTs belong to allowed collections
async function verifyNftCollections(nftIds, heliusApiKey) {
    if (!nftIds || nftIds.length === 0) return { valid: true, invalidNfts: [] };

    const invalidNfts = [];

    for (const nftId of nftIds) {
        try {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getAsset',
                    params: { id: nftId }
                })
            });
            const data = await response.json();
            const asset = data.result;

            if (!asset) {
                invalidNfts.push({ id: nftId, reason: 'NFT not found' });
                continue;
            }

            // Check collection
            const grouping = asset.grouping || [];
            const collections = grouping
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            const isAllowedCollection = collections.some(c => ALLOWED_COLLECTIONS.includes(c));

            if (!isAllowedCollection) {
                invalidNfts.push({ id: nftId, reason: 'Not from allowed collection' });
            }
        } catch (err) {
            console.error('Error verifying NFT:', nftId, err);
            invalidNfts.push({ id: nftId, reason: 'Verification failed' });
        }
    }

    return {
        valid: invalidNfts.length === 0,
        invalidNfts
    };
}

// Check if wallet owns a MidEvils Orc
async function ownsOrc(walletAddress) {
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    if (!HELIUS_API_KEY) return false;

    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'orc-check',
                method: 'getAssetsByOwner',
                params: {
                    ownerAddress: walletAddress,
                    page: 1,
                    limit: 1000
                }
            })
        });

        const data = await response.json();
        const items = data.result?.items || [];

        // Check if any NFT is a MidEvils Orc
        for (const item of items) {
            const grouping = item.grouping || [];
            const collections = grouping
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            const isMidEvil = collections.includes(MIDEVIL_COLLECTION);
            const isGraveyard = collections.includes(GRAVEYARD_COLLECTION);
            const name = (item.content?.metadata?.name || '').toLowerCase();
            const isBurnt = item.burnt === true;

            // Must be MidEvil, not Graveyard, not burnt, and have "orc" in name
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

// Verify escrow transaction is confirmed on-chain
async function verifyEscrowTransaction(signature, initiatorWallet, nfts, solAmount, heliusApiKey) {
    try {
        const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        const response = await fetch(RPC_URL, {
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

        // Check transaction exists and was successful
        if (!data.result || !data.result.meta || data.result.meta.err !== null) {
            console.error('Escrow transaction failed or not found:', signature);
            return false;
        }

        // Verify the transaction was signed by the initiator
        const accountKeys = data.result.transaction?.message?.accountKeys || [];
        const staticAccountKeys = data.result.transaction?.message?.staticAccountKeys || [];
        const allKeys = [...accountKeys, ...staticAccountKeys];

        // Check if initiator wallet is in the signers (first accounts are signers)
        const signerFound = allKeys.some((key, index) => {
            const keyStr = typeof key === 'string' ? key : key.pubkey;
            return keyStr === initiatorWallet && index < (data.result.transaction?.signatures?.length || 1);
        });

        if (!signerFound) {
            console.error('Initiator wallet not found as signer in escrow transaction');
            return false;
        }

        console.log('Escrow transaction verified:', signature);
        return true;
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

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    try {
        const {
            initiatorWallet,
            receiverWallet,
            initiatorNfts,
            receiverNfts,
            initiatorSol,
            receiverSol,
            initiatorNftDetails,
            receiverNftDetails,
            escrowTxSignature,
            isOrcHolder: clientIsOrcHolder,
            signature,
            message
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

        // Verify wallet ownership via signed message
        if (!signature || !message) {
            return res.status(400).json({ error: 'Signature required to verify wallet ownership' });
        }

        // Message should contain initiator and receiver wallets
        if (!message.includes(initiatorWallet) || !message.includes(receiverWallet)) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        // Validate timestamp to prevent replay attacks
        const timestampMatch = message.match(/at (\d+)$/);
        if (!timestampMatch) {
            return res.status(400).json({ error: 'Invalid message format - missing timestamp' });
        }
        const messageTimestamp = parseInt(timestampMatch[1], 10);
        const now = Date.now();
        const MAX_MESSAGE_AGE = 5 * 60 * 1000; // 5 minutes
        if (now - messageTimestamp > MAX_MESSAGE_AGE) {
            return res.status(400).json({ error: 'Message expired - please try again' });
        }
        if (messageTimestamp > now + 60000) {
            return res.status(400).json({ error: 'Invalid message timestamp' });
        }

        if (!verifySignature(message, signature, initiatorWallet)) {
            return res.status(403).json({ error: 'Invalid signature - wallet ownership not verified' });
        }

        // Validate NFT arrays
        const initNfts = Array.isArray(initiatorNfts) ? initiatorNfts : [];
        const recvNfts = Array.isArray(receiverNfts) ? receiverNfts : [];

        if (initNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
        }
        if (recvNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
        }

        // Verify all NFTs are from allowed collections
        if (HELIUS_API_KEY && (initNfts.length > 0 || recvNfts.length > 0)) {
            const allNfts = [...initNfts, ...recvNfts];
            const collectionCheck = await verifyNftCollections(allNfts, HELIUS_API_KEY);
            if (!collectionCheck.valid) {
                const invalidIds = collectionCheck.invalidNfts.map(n => n.id).join(', ');
                return res.status(400).json({
                    error: 'Some NFTs are not from allowed collections',
                    invalidNfts: collectionCheck.invalidNfts
                });
            }
        }

        // Validate SOL amounts
        const initSol = typeof initiatorSol === 'number' && initiatorSol >= 0 ? initiatorSol : 0;
        const recvSol = typeof receiverSol === 'number' && receiverSol >= 0 ? receiverSol : 0;

        // Must have something on both sides
        const hasInitiatorOffer = initNfts.length > 0 || initSol > 0;
        const hasReceiverRequest = recvNfts.length > 0 || recvSol > 0;

        if (!hasInitiatorOffer) {
            return res.status(400).json({ error: 'Must offer at least one NFT or SOL' });
        }
        if (!hasReceiverRequest) {
            return res.status(400).json({ error: 'Must request at least one NFT or SOL' });
        }

        // Check if initiator owns an Orc - free if they do
        const isOrcHolder = await ownsOrc(initiatorWallet);
        const fee = isOrcHolder ? HOLDER_FEE : PLATFORM_FEE;

        // Verify escrow transaction if provided
        if (escrowTxSignature && HELIUS_API_KEY) {
            const txVerified = await verifyEscrowTransaction(
                escrowTxSignature,
                initiatorWallet,
                initNfts,
                initSol,
                HELIUS_API_KEY
            );
            if (!txVerified) {
                return res.status(400).json({ error: 'Escrow transaction not confirmed or invalid. Please wait for confirmation and try again.' });
            }
        } else if (initNfts.length > 0 || initSol > 0) {
            // If initiator is offering NFTs or SOL, escrow tx is required
            if (!escrowTxSignature) {
                return res.status(400).json({ error: 'Escrow transaction signature required' });
            }
        }

        // Create offer object
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
            fee: fee,
            isOrcHolder: isOrcHolder,
            escrowTxSignature: escrowTxSignature || null
        };

        // Save to KV
        // We store in multiple keys for efficient lookups:
        // 1. offer:{id} - the full offer
        // 2. wallet:{address}:offers - list of offer IDs for that wallet

        // Save the offer
        await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(offer)
        });

        // Add to initiator's offer list
        const initiatorKey = `wallet:${initiatorWallet}:offers`;
        const initiatorListRes = await fetch(`${KV_REST_API_URL}/get/${initiatorKey}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const initiatorListData = await initiatorListRes.json();
        const initiatorList = initiatorListData.result ?
            (typeof initiatorListData.result === 'string' ? JSON.parse(initiatorListData.result) : initiatorListData.result) : [];
        initiatorList.push(offerId);
        await fetch(`${KV_REST_API_URL}/set/${initiatorKey}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(initiatorList)
        });

        // Add to receiver's offer list
        const receiverKey = `wallet:${receiverWallet}:offers`;
        const receiverListRes = await fetch(`${KV_REST_API_URL}/get/${receiverKey}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const receiverListData = await receiverListRes.json();
        const receiverList = receiverListData.result ?
            (typeof receiverListData.result === 'string' ? JSON.parse(receiverListData.result) : receiverListData.result) : [];
        receiverList.push(offerId);
        await fetch(`${KV_REST_API_URL}/set/${receiverKey}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(receiverList)
        });

        return res.status(200).json({
            success: true,
            offerId: offerId,
            offer: offer
        });

    } catch (error) {
        console.error('Create offer error:', error);
        return res.status(500).json({ error: 'Failed to create offer' });
    }
}
