// Shared utilities for swap API endpoints
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// ========== Constants ==========

export const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
export const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
export const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

export const ALLOWED_COLLECTIONS = [
    'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW',  // MidEvils
    'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF'  // Graveyard
];

export const MAX_NFTS_PER_SIDE = 5;
export const OFFER_EXPIRY_HOURS = 24;
export const PLATFORM_FEE = 0.02;
export const HOLDER_FEE = 0;
export const MAX_MESSAGE_AGE = 2 * 60 * 1000; // 2 minutes (reduced from 5)
export const MAX_ACTIVE_OFFERS_PER_WALLET = 10;
export const LOCK_TTL_SECONDS = 60; // Increased from 30

// ========== Rate Limiting (KV-based for cross-instance support) ==========

// In-memory fallback for when KV is not available
const rateLimitMaps = new Map();

export function isRateLimitedMemory(ip, endpoint = 'default', maxRequests = 10, windowMs = 60000) {
    const key = `${endpoint}:${ip}`;
    const now = Date.now();

    if (!rateLimitMaps.has(endpoint)) {
        rateLimitMaps.set(endpoint, new Map());
    }
    const map = rateLimitMaps.get(endpoint);
    const record = map.get(ip);

    if (!record || now - record.timestamp > windowMs) {
        map.set(ip, { timestamp: now, count: 1 });
        return false;
    }

    if (record.count >= maxRequests) {
        return true;
    }

    record.count++;
    return false;
}

// KV-based rate limiting (works across serverless instances)
export async function isRateLimitedKV(ip, endpoint, maxRequests, windowMs, kvUrl, kvToken) {
    if (!kvUrl || !kvToken) {
        return isRateLimitedMemory(ip, endpoint, maxRequests, windowMs);
    }

    const key = `ratelimit:${endpoint}:${ip}`;
    const now = Date.now();
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
        const res = await fetch(`${kvUrl}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
        const data = await res.json();
        let record = data.result ? (typeof data.result === 'string' ? JSON.parse(data.result) : data.result) : null;

        if (!record || now - record.timestamp > windowMs) {
            record = { timestamp: now, count: 1 };
        } else if (record.count >= maxRequests) {
            return true;
        } else {
            record.count++;
        }

        // Save with TTL
        await fetch(`${kvUrl}/set/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        });
        await fetch(`${kvUrl}/expire/${key}/${windowSeconds}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });

        return false;
    } catch (err) {
        console.error('KV rate limit error, falling back to memory:', err);
        return isRateLimitedMemory(ip, endpoint, maxRequests, windowMs);
    }
}

// Legacy wrapper for backward compatibility
export function isRateLimited(ip, endpoint = 'default', maxRequests = 10, windowMs = 60000) {
    return isRateLimitedMemory(ip, endpoint, maxRequests, windowMs);
}

export function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || 'unknown';
}

// ========== Validation ==========

export function validateSolanaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

export function verifySignature(message, signature, publicKey) {
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

export function validateTimestamp(message) {
    const timestampMatch = message.match(/at (\d+)$/);
    if (!timestampMatch) {
        return { valid: false, error: 'Invalid message format - missing timestamp' };
    }

    const messageTimestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();

    if (now - messageTimestamp > MAX_MESSAGE_AGE) {
        return { valid: false, error: 'Message expired - please try again' };
    }
    if (messageTimestamp > now + 60000) {
        return { valid: false, error: 'Invalid message timestamp' };
    }

    return { valid: true, timestamp: messageTimestamp };
}

// ========== Nonce/Signature Replay Prevention ==========

export async function isSignatureUsed(signature, kvUrl, kvToken) {
    if (!kvUrl || !kvToken) return false;

    const key = `used_sig:${signature.slice(0, 32)}`; // Use prefix of signature as key
    try {
        const res = await fetch(`${kvUrl}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
        const data = await res.json();
        return data.result !== null;
    } catch (err) {
        console.error('Signature check error:', err);
        return false; // Fail open to not break functionality, but log it
    }
}

export async function markSignatureUsed(signature, kvUrl, kvToken) {
    if (!kvUrl || !kvToken) return;

    const key = `used_sig:${signature.slice(0, 32)}`;
    const ttlSeconds = Math.ceil(MAX_MESSAGE_AGE / 1000) + 60; // Message age + buffer

    try {
        await fetch(`${kvUrl}/set/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ used: true, at: Date.now() })
        });
        await fetch(`${kvUrl}/expire/${key}/${ttlSeconds}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
    } catch (err) {
        console.error('Mark signature error:', err);
    }
}

// ========== NFT Ownership Verification ==========

export async function verifyNftOwnership(nftIds, expectedOwner, heliusApiKey) {
    if (!nftIds?.length || !heliusApiKey) return { valid: true, issues: [] };

    const issues = [];
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

            if (!data.result) {
                issues.push({ nftId, reason: 'NFT not found' });
                continue;
            }

            const owner = data.result.ownership?.owner;
            if (owner !== expectedOwner) {
                issues.push({ nftId, reason: `NFT not owned by ${expectedOwner.slice(0, 8)}...`, actualOwner: owner });
            }
        } catch (err) {
            issues.push({ nftId, reason: 'Verification failed: ' + err.message });
        }
    }

    return { valid: issues.length === 0, issues };
}

// ========== Wallet Offer Limits ==========

export async function countActiveOffers(wallet, kvUrl, kvToken) {
    if (!kvUrl || !kvToken) return 0;

    try {
        const key = `wallet:${wallet}:offers`;
        const offerIds = await kvGet(key, kvUrl, kvToken) || [];

        let activeCount = 0;
        for (const offerId of offerIds) {
            const offer = await kvGet(`offer:${offerId}`, kvUrl, kvToken);
            if (offer && offer.status === 'pending') {
                activeCount++;
            }
        }
        return activeCount;
    } catch (err) {
        console.error('Count active offers error:', err);
        return 0;
    }
}

// ========== KV Operations ==========

export async function kvGet(key, kvUrl, kvToken) {
    const res = await fetch(`${kvUrl}/get/${key}`, {
        headers: { 'Authorization': `Bearer ${kvToken}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
}

export async function kvSet(key, value, kvUrl, kvToken) {
    await fetch(`${kvUrl}/set/${key}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
    });
}

export async function kvDelete(key, kvUrl, kvToken) {
    await fetch(`${kvUrl}/del/${key}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${kvToken}` }
    });
}

export async function acquireLock(offerId, kvUrl, kvToken, ttlSeconds = LOCK_TTL_SECONDS) {
    const lockKey = `lock:offer:${offerId}`;
    const now = Date.now();

    const lockRes = await fetch(`${kvUrl}/setnx/${lockKey}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ locked: true, at: now })
    });
    const lockData = await lockRes.json();

    if (lockData.result === 0) {
        return { acquired: false, lockKey };
    }

    // Set expiry
    await fetch(`${kvUrl}/expire/${lockKey}/${ttlSeconds}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${kvToken}` }
    });

    return { acquired: true, lockKey };
}

export async function releaseLock(lockKey, kvUrl, kvToken) {
    await kvDelete(lockKey, kvUrl, kvToken);
}

// ========== Helius API ==========

export async function getAsset(assetId, apiKey) {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: { id: assetId }
        })
    });
    const data = await response.json();
    return data.result;
}

export async function getAssetProof(assetId, apiKey) {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetProof',
            params: { id: assetId }
        })
    });
    const data = await response.json();
    return data.result;
}

export async function verifyTransactionConfirmed(signature, apiKey) {
    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
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
        return data.result?.meta?.err === null;
    } catch (err) {
        console.error('Transaction verification error:', err);
        return false;
    }
}

// ========== NFT Transfer Instructions ==========

export function createMplCoreTransferInstruction(assetId, fromPubkey, toPubkey, collectionAddress = null) {
    const asset = new PublicKey(assetId);
    const data = Buffer.from([14, 0]);

    const keys = [
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: collectionAddress ? new PublicKey(collectionAddress) : MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: fromPubkey, isSigner: true, isWritable: true },
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return { keys, programId: MPL_CORE_PROGRAM_ID, data };
}

export function createBubblegumTransferInstruction(fromPubkey, toPubkey, compression, proof) {
    const merkleTree = new PublicKey(compression.tree);

    const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBytes()],
        BUBBLEGUM_PROGRAM_ID
    );

    const keys = [
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
        { pubkey: fromPubkey, isSigner: false, isWritable: false },
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    for (const proofNode of proof.proof) {
        keys.push({ pubkey: new PublicKey(proofNode), isSigner: false, isWritable: false });
    }

    const discriminator = Buffer.from([163, 52, 200, 231, 140, 3, 69, 186]);
    const rootBytes = Buffer.from(proof.root.replace('0x', ''), 'hex');
    const dataHashBytes = Buffer.from(compression.data_hash.replace('0x', ''), 'hex');
    const creatorHashBytes = Buffer.from(compression.creator_hash.replace('0x', ''), 'hex');

    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(compression.leaf_id), 0);

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(compression.leaf_id, 0);

    const data = Buffer.concat([
        discriminator, rootBytes, dataHashBytes, creatorHashBytes, nonceBuffer, indexBuffer
    ]);

    return { keys, programId: BUBBLEGUM_PROGRAM_ID, data };
}

// ========== Escrow Operations ==========

export async function transferNftsFromEscrow(nfts, escrowKeypair, destinationPubkey, heliusApiKey) {
    const transaction = new Transaction();

    for (const nft of nfts) {
        const assetInfo = await getAsset(nft.id, heliusApiKey);

        if (assetInfo?.interface === 'MplCoreAsset') {
            const collection = assetInfo.grouping?.find(g => g.group_key === 'collection')?.group_value;
            transaction.add(createMplCoreTransferInstruction(
                nft.id, escrowKeypair.publicKey, destinationPubkey, collection
            ));
        } else if (assetInfo?.compression?.compressed) {
            const proof = await getAssetProof(nft.id, heliusApiKey);
            if (proof) {
                transaction.add(createBubblegumTransferInstruction(
                    escrowKeypair.publicKey, destinationPubkey, assetInfo.compression, proof
                ));
            }
        }
    }

    return transaction;
}

export async function executeEscrowTransaction(transaction, escrowKeypair, heliusApiKey) {
    if (transaction.instructions.length === 0) {
        return null;
    }

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = escrowKeypair.publicKey;
    transaction.sign(escrowKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return signature;
}

export async function returnEscrowToInitiator(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    const initiatorPubkey = new PublicKey(offer.initiator.wallet);
    const nfts = offer.initiator.nftDetails || [];
    const solAmount = offer.initiator.sol || 0;

    if (nfts.length === 0 && solAmount === 0) {
        return null;
    }

    const transaction = new Transaction();

    // Return SOL
    if (solAmount > 0) {
        transaction.add(SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: initiatorPubkey,
            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
        }));
    }

    // Return NFTs
    const nftTx = await transferNftsFromEscrow(nfts, escrowKeypair, initiatorPubkey, heliusApiKey);
    nftTx.instructions.forEach(ix => transaction.add(ix));

    return executeEscrowTransaction(transaction, escrowKeypair, heliusApiKey);
}

export async function releaseEscrowToReceiver(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    const receiverPubkey = new PublicKey(offer.receiver.wallet);
    const nfts = offer.initiator.nftDetails || [];
    const solAmount = offer.initiator.sol || 0;

    if (nfts.length === 0 && solAmount === 0) {
        return null;
    }

    const transaction = new Transaction();

    // Transfer SOL to receiver
    if (solAmount > 0) {
        transaction.add(SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: receiverPubkey,
            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
        }));
    }

    // Transfer NFTs to receiver
    const nftTx = await transferNftsFromEscrow(nfts, escrowKeypair, receiverPubkey, heliusApiKey);
    nftTx.instructions.forEach(ix => transaction.add(ix));

    return executeEscrowTransaction(transaction, escrowKeypair, heliusApiKey);
}
