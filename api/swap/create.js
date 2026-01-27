// Vercel Serverless Function - Create Swap Offer

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // Max 10 offer creations per minute per IP

// Valid MidEvils collection
const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

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

function generateOfferId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'offer_';
    for (let i = 0; i < 12; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function validateSolanaAddress(address) {
    // Basic validation: 32-44 characters, base58 characters only
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
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

    try {
        const {
            initiatorWallet,
            receiverWallet,
            initiatorNfts,
            receiverNfts,
            initiatorSol,
            receiverSol,
            initiatorNftDetails,
            receiverNftDetails
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

        // Validate NFT arrays
        const initNfts = Array.isArray(initiatorNfts) ? initiatorNfts : [];
        const recvNfts = Array.isArray(receiverNfts) ? receiverNfts : [];

        if (initNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
        }
        if (recvNfts.length > MAX_NFTS_PER_SIDE) {
            return res.status(400).json({ error: `Maximum ${MAX_NFTS_PER_SIDE} NFTs per side` });
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
            isOrcHolder: isOrcHolder
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
