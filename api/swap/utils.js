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

export const ESCROW_WALLET = 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh';

export const MAX_NFTS_PER_SIDE = 5;
export const MAX_SOL_PER_SIDE = 10;
export const OFFER_EXPIRY_HOURS = 24;
export const PLATFORM_FEE = 0.02;
export const HOLDER_FEE = 0;
export const FEE_WALLET = '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq';
export const MAX_MESSAGE_AGE = 5 * 60 * 1000; // 5 minutes (auth message signed after on-chain tx)
export const MAX_ACTIVE_OFFERS_PER_WALLET = 10;
export const LOCK_TTL_SECONDS = 900; // 15 minutes - must cover two on-chain releases

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
    if (!kvUrl || !kvToken) return true; // Fail closed: block if KV unavailable

    const key = `used_sig:${signature}`; // Use full signature as key
    try {
        const res = await fetch(`${kvUrl}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
        const data = await res.json();
        return data.result !== null;
    } catch (err) {
        console.error('Signature check error:', err);
        return true; // Fail closed: block on error
    }
}

export async function markSignatureUsed(signature, kvUrl, kvToken) {
    if (!kvUrl || !kvToken) return;

    const key = `used_sig:${signature}`;
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

// ========== Escrow Transaction Uniqueness ==========

/**
 * Atomically claim an escrow transaction signature for a specific offer.
 * Uses SET NX (set-if-not-exists) so only one caller can claim a given tx.
 * Returns { claimed: true } if this caller won, { claimed: false } if already taken.
 * Fails closed on error (returns claimed: false).
 */
export async function claimEscrowTx(txSignature, offerId, kvUrl, kvToken) {
    if (!txSignature) return { claimed: true }; // No tx to claim
    if (!kvUrl || !kvToken) return { claimed: false }; // Fail closed

    const key = `used_escrow_tx:${txSignature}`;
    const TTL_SECONDS = 48 * 60 * 60; // 48 hours (2x offer expiry)
    try {
        // Atomic SET NX EX — only succeeds if key does not exist, auto-expires
        const res = await fetch(kvUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kvToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(['SET', key, JSON.stringify({ offerId, at: Date.now() }), 'EX', TTL_SECONDS, 'NX'])
        });
        const data = await res.json();
        // SET NX returns "OK" if set, null if key already exists
        return { claimed: !!data.result };
    } catch (err) {
        console.error('Claim escrow tx error:', err);
        return { claimed: false }; // Fail closed
    }
}

/**
 * Release a previously claimed escrow tx (used when offer creation fails after claim).
 */
export async function releaseEscrowTxClaim(txSignature, kvUrl, kvToken) {
    if (!txSignature || !kvUrl || !kvToken) return;
    const key = `used_escrow_tx:${txSignature}`;
    try {
        await fetch(`${kvUrl}/del/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${kvToken}` }
        });
    } catch (err) {
        console.error('Release escrow tx claim error:', err);
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

        const offers = await Promise.all(
            offerIds.map(offerId => kvGet(`offer:${offerId}`, kvUrl, kvToken))
        );
        return offers.filter(offer => offer && offer.status === 'pending').length;
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
    if (!res.ok) {
        console.error(`KV GET failed for ${key}: ${res.status} ${res.statusText}`);
        return null;
    }
    let data;
    try {
        data = await res.json();
    } catch (err) {
        console.error(`KV GET JSON parse error for ${key}:`, err);
        return null;
    }
    if (!data.result) return null;
    try {
        return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (err) {
        console.error(`KV GET result parse error for ${key}:`, err);
        return null;
    }
}

export async function kvSet(key, value, kvUrl, kvToken) {
    const res = await fetch(`${kvUrl}/set/${key}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
    });
    if (!res.ok) {
        console.error(`KV SET failed for ${key}: ${res.status} ${res.statusText}`);
    }
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

    // Atomic SET with EX (expiry) and NX (only if not exists) to prevent deadlocks
    const lockRes = await fetch(kvUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', lockKey, JSON.stringify({ locked: true, at: now }), 'EX', ttlSeconds, 'NX'])
    });
    const lockData = await lockRes.json();

    // SET NX returns null if key already exists, "OK" if set
    if (!lockData.result) {
        return { acquired: false, lockKey };
    }

    return { acquired: true, lockKey };
}

export async function releaseLock(lockKey, kvUrl, kvToken) {
    await kvDelete(lockKey, kvUrl, kvToken);
}

// ========== Helius API ==========

export function cleanApiKey(key) {
    return key?.trim()?.replace(/\\n/g, '') || '';
}

export async function getAsset(assetId, apiKey) {
    apiKey = cleanApiKey(apiKey);
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
    apiKey = cleanApiKey(apiKey);
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

export async function verifyTransactionConfirmed(signature, apiKey, maxAttempts = 12, intervalMs = 5000) {
    apiKey = cleanApiKey(apiKey);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getTransaction',
                    params: [signature, { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]
                })
            });
            const data = await response.json();
            if (data.result?.meta?.err === null) {
                return true;
            }
            if (data.result?.meta?.err) {
                // Transaction failed on-chain — no point retrying
                return false;
            }
        } catch (err) {
            console.error(`Transaction verification attempt ${attempt} error:`, err);
        }
        // Transaction not found yet (not finalized) — wait and retry
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
    return false;
}

// ========== Transaction Content Verification ==========

/**
 * Verifies that a transaction actually transferred the expected NFTs and SOL
 * to the escrow wallet. Uses Helius Enhanced Transactions API for parsed data.
 *
 * @param {string} txSignature - The transaction signature
 * @param {string} senderWallet - Expected sender wallet address
 * @param {string[]} expectedNftIds - NFT IDs that should have been transferred
 * @param {number} expectedSol - SOL amount that should have been transferred
 * @param {string} apiKey - Helius API key
 * @param {number} [expectedFee=0] - Platform fee in SOL that should have been sent to fee wallet
 * @returns {{ valid: boolean, error?: string }}
 */
export async function verifyEscrowTransactionContent(txSignature, senderWallet, expectedNftIds, expectedSol, apiKey, expectedFee = 0) {
    apiKey = cleanApiKey(apiKey);
    try {
        // Use Helius Enhanced Transactions API for parsed data
        const response = await fetch(
            `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactions: [txSignature] })
            }
        );
        const transactions = await response.json();

        if (!transactions || transactions.length === 0 || transactions.error) {
            return { valid: false, error: 'Transaction not found or not parseable' };
        }

        const tx = transactions[0];

        // Verify transaction succeeded
        if (tx.transactionError) {
            return { valid: false, error: 'Transaction failed on-chain' };
        }

        // Track what was actually transferred to escrow
        const nftsTransferredToEscrow = new Set();
        let solTransferredToEscrow = 0;
        let feeTransferred = 0;

        // Check native SOL transfers
        if (tx.nativeTransfers) {
            for (const transfer of tx.nativeTransfers) {
                if (transfer.fromUserAccount === senderWallet &&
                    transfer.toUserAccount === ESCROW_WALLET) {
                    solTransferredToEscrow += transfer.amount; // in lamports
                }
                if (transfer.fromUserAccount === senderWallet &&
                    transfer.toUserAccount === FEE_WALLET) {
                    feeTransferred += transfer.amount; // in lamports
                }
            }
        }

        // Check SPL token transfers (standard NFTs)
        if (tx.tokenTransfers) {
            for (const transfer of tx.tokenTransfers) {
                if (transfer.fromUserAccount === senderWallet &&
                    transfer.toUserAccount === ESCROW_WALLET &&
                    transfer.tokenAmount >= 1) {
                    nftsTransferredToEscrow.add(transfer.mint);
                }
            }
        }

        // Parse raw instructions for MPL Core and Bubblegum transfers
        // (these don't appear in tokenTransfers/nativeTransfers)
        const MPL_CORE = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
        const BUBBLEGUM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';

        if (tx.instructions) {
            for (const ix of tx.instructions) {
                if (ix.programId === MPL_CORE && ix.accounts?.length >= 5) {
                    // MPL Core transfer: accounts = [asset, collection, from, from, to, ...]
                    const assetId = ix.accounts[0];
                    const from = ix.accounts[2];
                    const to = ix.accounts[4];
                    if (from === senderWallet && to === ESCROW_WALLET) {
                        nftsTransferredToEscrow.add(assetId);
                    }
                } else if (ix.programId === BUBBLEGUM && ix.accounts?.length >= 4) {
                    // Bubblegum transfer: accounts = [treeAuthority, from, fromDelegate, to, ...]
                    const from = ix.accounts[1];
                    const to = ix.accounts[3];
                    if (from === senderWallet && to === ESCROW_WALLET) {
                        // For compressed NFTs, the asset ID is derived from the tree + leaf,
                        // but we can verify via post-tx ownership check below
                    }
                }
            }
        }

        // Verify expected NFTs were transferred
        const missingNfts = [];
        for (const expectedId of expectedNftIds) {
            if (!nftsTransferredToEscrow.has(expectedId)) {
                missingNfts.push(expectedId);
            }
        }

        // For any missing NFTs (likely compressed NFTs where we can't parse the ID from instructions),
        // verify escrow now owns them
        if (missingNfts.length > 0) {
            const stillMissing = [];
            for (const nftId of missingNfts) {
                try {
                    const asset = await getAsset(nftId, apiKey);
                    const currentOwner = asset?.ownership?.owner;
                    if (currentOwner === ESCROW_WALLET) {
                        // Escrow owns it — transfer was successful
                        continue;
                    }
                    stillMissing.push(nftId);
                } catch {
                    stillMissing.push(nftId);
                }
            }

            if (stillMissing.length > 0) {
                console.error('NFTs not transferred to escrow:', stillMissing);
                return {
                    valid: false,
                    error: `${stillMissing.length} NFT(s) were not transferred to escrow`
                };
            }
        }

        // Verify expected SOL was transferred (with small tolerance for rounding)
        if (expectedSol > 0) {
            const expectedLamports = Math.floor(expectedSol * LAMPORTS_PER_SOL);
            const tolerance = 5000; // 0.000005 SOL tolerance for rounding
            if (solTransferredToEscrow < expectedLamports - tolerance) {
                console.error(`SOL mismatch: expected ${expectedLamports} lamports, got ${solTransferredToEscrow}`);
                return {
                    valid: false,
                    error: `Insufficient SOL transferred to escrow`
                };
            }
        }

        // Verify platform fee was paid (only on create, not accept)
        if (expectedFee > 0) {
            const expectedFeeLamports = Math.floor(expectedFee * LAMPORTS_PER_SOL);
            const tolerance = 5000;
            if (feeTransferred < expectedFeeLamports - tolerance) {
                console.error(`Fee mismatch: expected ${expectedFeeLamports} lamports to ${FEE_WALLET}, got ${feeTransferred}`);
                return {
                    valid: false,
                    error: 'Platform fee was not paid'
                };
            }
        }

        return { valid: true };

    } catch (err) {
        console.error('Transaction content verification error:', err);
        return { valid: false, error: 'Failed to verify transaction content' };
    }
}

/**
 * Fetches NFT details server-side from Helius, ignoring client-supplied metadata.
 * Returns sanitized nftDetails with only the server-verified id, name, and imageUrl.
 */
export async function fetchNftDetailsFromChain(nftIds, apiKey) {
    return Promise.all(nftIds.map(async (nftId) => {
        try {
            const asset = await getAsset(nftId, apiKey);
            if (asset) {
                return {
                    id: nftId,
                    name: asset.content?.metadata?.name || 'Unknown',
                    imageUrl: asset.content?.links?.image || asset.content?.files?.[0]?.uri || ''
                };
            }
            return { id: nftId, name: 'Unknown', imageUrl: '' };
        } catch (err) {
            console.error(`Failed to fetch NFT details for ${nftId}:`, err);
            return { id: nftId, name: 'Unknown', imageUrl: '' };
        }
    }));
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
    heliusApiKey = cleanApiKey(heliusApiKey);
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

export async function releaseEscrowToInitiator(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    const initiatorPubkey = new PublicKey(offer.initiator.wallet);
    const nfts = offer.receiver.nftDetails || [];
    const solAmount = offer.receiver.sol || 0;

    if (nfts.length === 0 && solAmount === 0) {
        return null;
    }

    const transaction = new Transaction();

    // Transfer receiver's escrowed SOL to initiator
    if (solAmount > 0) {
        transaction.add(SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: initiatorPubkey,
            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
        }));
    }

    // Transfer receiver's escrowed NFTs to initiator
    const nftTx = await transferNftsFromEscrow(nfts, escrowKeypair, initiatorPubkey, heliusApiKey);
    nftTx.instructions.forEach(ix => transaction.add(ix));

    return executeEscrowTransaction(transaction, escrowKeypair, heliusApiKey);
}

export async function returnReceiverEscrowAssets(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    const receiverPubkey = new PublicKey(offer.receiver.wallet);
    const nfts = offer.receiver.nftDetails || [];
    const solAmount = offer.receiver.sol || 0;

    if (nfts.length === 0 && solAmount === 0) {
        return null;
    }

    const transaction = new Transaction();

    // Return receiver's SOL back to receiver
    if (solAmount > 0) {
        transaction.add(SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: receiverPubkey,
            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
        }));
    }

    // Return receiver's NFTs back to receiver
    const nftTx = await transferNftsFromEscrow(nfts, escrowKeypair, receiverPubkey, heliusApiKey);
    nftTx.instructions.forEach(ix => transaction.add(ix));

    return executeEscrowTransaction(transaction, escrowKeypair, heliusApiKey);
}
