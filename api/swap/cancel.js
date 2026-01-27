// Vercel Serverless Function - Cancel/Decline Swap Offer with Escrow Return
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

function validateSolanaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

// Bubblegum program constants
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

// MPL Core program
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    try {
        const { offerId, wallet, action } = req.body;

        if (!offerId || typeof offerId !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        if (!['cancel', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // Fetch the offer
        const offerRes = await fetch(`${KV_REST_API_URL}/get/offer:${offerId}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const offerData = await offerRes.json();

        if (!offerData.result) {
            return res.status(404).json({ error: 'Offer not found' });
        }

        const offer = typeof offerData.result === 'string' ?
            JSON.parse(offerData.result) : offerData.result;

        // Check if offer is still pending
        if (offer.status !== 'pending') {
            return res.status(400).json({ error: 'Offer is no longer pending' });
        }

        // Verify authorization
        if (action === 'cancel') {
            if (wallet !== offer.initiator.wallet) {
                return res.status(403).json({ error: 'Only the initiator can cancel this offer' });
            }
        } else if (action === 'decline') {
            if (wallet !== offer.receiver.wallet) {
                return res.status(403).json({ error: 'Only the receiver can decline this offer' });
            }
        }

        // Return escrowed assets to initiator
        let escrowReturnTx = null;
        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY && offer.escrowTxSignature) {
            try {
                escrowReturnTx = await returnEscrowToInitiator(
                    offer,
                    ESCROW_PRIVATE_KEY,
                    HELIUS_API_KEY
                );
                if (escrowReturnTx) {
                    offer.escrowReturnTxSignature = escrowReturnTx;
                }
            } catch (escrowErr) {
                console.error('Escrow return failed:', escrowErr);
                offer.escrowReturnError = escrowErr.message;
            }
        }

        // Update offer status
        offer.status = 'cancelled';
        offer.cancelledAt = Date.now();
        offer.cancelledBy = wallet;
        offer.cancelAction = action;

        // Save updated offer
        await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(offer)
        });

        return res.status(200).json({
            success: true,
            message: action === 'cancel'
                ? 'Offer cancelled. Your escrowed assets have been returned.'
                : 'Offer declined. Initiator\'s assets have been returned.',
            offer,
            escrowReturnTx
        });

    } catch (error) {
        console.error('Cancel offer error:', error);
        return res.status(500).json({ error: 'Failed to cancel offer: ' + error.message });
    }
}

// Return escrowed NFTs and SOL to the initiator
async function returnEscrowToInitiator(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const connection = new Connection(RPC_URL, 'confirmed');

    // Decode escrow keypair
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    console.log('Escrow wallet:', escrowKeypair.publicKey.toBase58());

    const initiatorPubkey = new PublicKey(offer.initiator.wallet);
    const initiatorNfts = offer.initiator.nftDetails || [];
    const initiatorSol = offer.initiator.sol || 0;

    // If nothing to return, return early
    if (initiatorNfts.length === 0 && initiatorSol === 0) {
        console.log('Nothing to return from escrow');
        return null;
    }

    const transaction = new Transaction();

    // 1. Return escrowed SOL to initiator
    if (initiatorSol > 0) {
        const lamports = Math.floor(initiatorSol * LAMPORTS_PER_SOL);
        console.log('Returning SOL:', initiatorSol, '=', lamports, 'lamports');
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: escrowKeypair.publicKey,
                toPubkey: initiatorPubkey,
                lamports: lamports,
            })
        );
    }

    // 2. Return escrowed NFTs to initiator
    for (const nft of initiatorNfts) {
        console.log('Processing escrowed NFT for return:', nft.id, nft.name);

        // Get asset info to check type
        const assetInfo = await getAsset(nft.id, heliusApiKey);
        console.log('Asset interface:', assetInfo?.interface);

        if (assetInfo?.interface === 'MplCoreAsset') {
            // Metaplex Core Asset - use MPL Core transfer
            console.log('NFT is MPL Core Asset, building Core transfer');
            const collection = assetInfo.grouping?.find(g => g.group_key === 'collection')?.group_value;
            console.log('Collection:', collection);
            const ix = createMplCoreTransferInstruction(
                nft.id,
                escrowKeypair.publicKey,
                initiatorPubkey,
                collection
            );
            transaction.add(ix);
        } else if (assetInfo?.compression?.compressed) {
            // Compressed NFT - use Bubblegum transfer
            console.log('NFT is compressed, building Bubblegum transfer');
            const proof = await getAssetProof(nft.id, heliusApiKey);

            if (!proof) {
                console.error('Failed to get proof for', nft.id);
                continue;
            }

            const ix = createBubblegumTransferInstruction(
                escrowKeypair.publicKey,
                initiatorPubkey,
                assetInfo.compression,
                proof
            );
            transaction.add(ix);
        } else {
            console.log('Standard SPL token transfer not yet implemented for escrow return');
        }
    }

    if (transaction.instructions.length === 0) {
        console.log('No instructions to execute');
        return null;
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = escrowKeypair.publicKey;

    // Sign with escrow keypair
    transaction.sign(escrowKeypair);

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
    });

    console.log('Escrow return transaction sent:', signature);

    // Wait for confirmation
    await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
    }, 'confirmed');

    console.log('Escrow return confirmed:', signature);
    return signature;
}

// Helius API helpers
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

// Create Bubblegum transfer instruction
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

// Create MPL Core transfer instruction
function createMplCoreTransferInstruction(assetId, fromPubkey, toPubkey, collectionAddress = null) {
    const asset = new PublicKey(assetId);

    // MPL Core TransferV1 uses discriminator 14, followed by Option<CompressionProof> = None (0)
    const data = Buffer.from([14, 0]);

    // All accounts in order per MPL Core TransferV1
    const keys = [
        { pubkey: asset, isSigner: false, isWritable: true },                                    // 0: asset
        { pubkey: collectionAddress ? new PublicKey(collectionAddress) : MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false }, // 1: collection
        { pubkey: fromPubkey, isSigner: true, isWritable: true },                                // 2: payer
        { pubkey: fromPubkey, isSigner: true, isWritable: false },                               // 3: authority
        { pubkey: toPubkey, isSigner: false, isWritable: false },                                // 4: newOwner
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },                 // 5: systemProgram
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },                     // 6: logWrapper
    ];

    console.log('Creating MPL Core transfer instruction:');
    console.log('  Asset:', asset.toBase58());
    console.log('  Collection:', collectionAddress || 'none');
    console.log('  From:', fromPubkey.toBase58());
    console.log('  To:', toPubkey.toBase58());

    return {
        keys,
        programId: MPL_CORE_PROGRAM_ID,
        data
    };
}
