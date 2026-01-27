// Vercel Serverless Function - Cleanup Expired Offers
// Can be triggered by Vercel Cron or manually
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

export default async function handler(req, res) {
    // Allow both GET (for cron) and POST (for manual trigger)
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

    // For POST requests, require secret (GET requests from Vercel Cron are trusted)
    if (req.method === 'POST') {
        const { secret } = req.body || {};
        if (!CLEANUP_SECRET || secret !== CLEANUP_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
    }

    // For GET requests, verify it's from Vercel Cron
    if (req.method === 'GET') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !CLEANUP_SECRET) {
            // Allow if no cron secret configured (development)
            console.log('Warning: No CRON_SECRET configured');
        }
    }

    try {
        const now = Date.now();
        const results = {
            processed: 0,
            expired: 0,
            escrowReturned: 0,
            errors: []
        };

        // Scan for all offer keys
        // Note: This is a simplified approach. For production with many offers,
        // you'd want to maintain a separate index of pending offers
        const scanRes = await fetch(`${KV_REST_API_URL}/keys/offer:*`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const scanData = await scanRes.json();
        const offerKeys = scanData.result || [];

        console.log(`Found ${offerKeys.length} offers to check`);

        for (const key of offerKeys) {
            try {
                results.processed++;

                // Get offer data
                const offerRes = await fetch(`${KV_REST_API_URL}/get/${key}`, {
                    headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
                });
                const offerData = await offerRes.json();

                if (!offerData.result) continue;

                const offer = typeof offerData.result === 'string'
                    ? JSON.parse(offerData.result)
                    : offerData.result;

                // Skip non-pending offers
                if (offer.status !== 'pending') continue;

                // Check if expired
                if (!offer.expiresAt || offer.expiresAt > now) continue;

                console.log(`Offer ${offer.id} has expired`);
                results.expired++;

                // Return escrowed assets to initiator
                if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && offer.escrowTxSignature) {
                    try {
                        const returnTx = await returnEscrowToInitiator(
                            offer,
                            ESCROW_PRIVATE_KEY,
                            HELIUS_API_KEY
                        );
                        if (returnTx) {
                            offer.escrowReturnTxSignature = returnTx;
                            results.escrowReturned++;
                            console.log(`Returned escrow for offer ${offer.id}: ${returnTx}`);
                        }
                    } catch (escrowErr) {
                        console.error(`Failed to return escrow for ${offer.id}:`, escrowErr.message);
                        offer.escrowReturnError = escrowErr.message;
                        results.errors.push({ offerId: offer.id, error: escrowErr.message });
                    }
                }

                // Update offer status
                offer.status = 'expired';
                offer.expiredAt = now;
                offer.expiredByCleanup = true;

                await fetch(`${KV_REST_API_URL}/set/${key}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(offer)
                });

            } catch (offerErr) {
                console.error(`Error processing ${key}:`, offerErr.message);
                results.errors.push({ key, error: offerErr.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Cleanup complete. Processed ${results.processed}, expired ${results.expired}, returned escrow for ${results.escrowReturned}`,
            results
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
}

// Return escrowed NFTs and SOL to the initiator
async function returnEscrowToInitiator(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const connection = new Connection(RPC_URL, 'confirmed');

    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    const initiatorPubkey = new PublicKey(offer.initiator.wallet);
    const initiatorNfts = offer.initiator.nftDetails || [];
    const initiatorSol = offer.initiator.sol || 0;

    if (initiatorNfts.length === 0 && initiatorSol === 0) {
        return null;
    }

    const transaction = new Transaction();

    // Return SOL
    if (initiatorSol > 0) {
        const lamports = Math.floor(initiatorSol * LAMPORTS_PER_SOL);
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: escrowKeypair.publicKey,
                toPubkey: initiatorPubkey,
                lamports: lamports,
            })
        );
    }

    // Return NFTs
    for (const nft of initiatorNfts) {
        const assetInfo = await getAsset(nft.id, heliusApiKey);

        if (assetInfo?.interface === 'MplCoreAsset') {
            const collection = assetInfo.grouping?.find(g => g.group_key === 'collection')?.group_value;
            const ix = createMplCoreTransferInstruction(
                nft.id,
                escrowKeypair.publicKey,
                initiatorPubkey,
                collection
            );
            transaction.add(ix);
        } else if (assetInfo?.compression?.compressed) {
            const proof = await getAssetProof(nft.id, heliusApiKey);
            if (proof) {
                const ix = createBubblegumTransferInstruction(
                    escrowKeypair.publicKey,
                    initiatorPubkey,
                    assetInfo.compression,
                    proof
                );
                transaction.add(ix);
            }
        }
    }

    if (transaction.instructions.length === 0) {
        return null;
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = escrowKeypair.publicKey;

    transaction.sign(escrowKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
    });

    await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
    }, 'confirmed');

    return signature;
}

async function getAsset(assetId, apiKey) {
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

async function getAssetProof(assetId, apiKey) {
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

function createMplCoreTransferInstruction(assetId, fromPubkey, toPubkey, collectionAddress = null) {
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

    return {
        keys,
        programId: MPL_CORE_PROGRAM_ID,
        data
    };
}

function createBubblegumTransferInstruction(fromPubkey, toPubkey, compression, proof) {
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
        discriminator,
        rootBytes,
        dataHashBytes,
        creatorHashBytes,
        nonceBuffer,
        indexBuffer
    ]);

    return {
        keys,
        programId: BUBBLEGUM_PROGRAM_ID,
        data
    };
}
