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
export const PLATFORM_FEE = 0.01;
export const HOLDER_FEE = 0;
export const MAX_MESSAGE_AGE = 5 * 60 * 1000; // 5 minutes

// ========== Rate Limiting ==========

const rateLimitMaps = new Map(); // Separate maps per endpoint

export function isRateLimited(ip, endpoint = 'default', maxRequests = 10, windowMs = 60000) {
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

export async function acquireLock(offerId, kvUrl, kvToken, ttlSeconds = 30) {
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
