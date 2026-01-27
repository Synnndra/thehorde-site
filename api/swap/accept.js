// Vercel Serverless Function - Accept Swap Offer with Escrow Release
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
        const { offerId, wallet, txSignature } = req.body;

        if (!offerId || typeof offerId !== 'string') {
            return res.status(400).json({ error: 'Invalid offer ID' });
        }

        if (!validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
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

        // Check if offer has expired
        const now = Date.now();
        if (offer.expiresAt && offer.expiresAt < now) {
            offer.status = 'expired';
            await fetch(`${KV_REST_API_URL}/set/offer:${offerId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(offer)
            });
            return res.status(400).json({ error: 'Offer has expired' });
        }

        // Only receiver can accept
        if (wallet !== offer.receiver.wallet) {
            return res.status(403).json({ error: 'Only the receiver can accept this offer' });
        }

        // Record receiver's transaction
        if (txSignature) {
            offer.receiverTxSignature = txSignature;
            offer.receiverTransferComplete = true;
        }

        // Release escrowed assets to receiver
        let escrowReleaseTx = null;
        if (ESCROW_PRIVATE_KEY && HELIUS_API_KEY) {
            try {
                escrowReleaseTx = await releaseEscrowToReceiver(
                    offer,
                    ESCROW_PRIVATE_KEY,
                    HELIUS_API_KEY
                );
                if (escrowReleaseTx) {
                    offer.escrowReleaseTxSignature = escrowReleaseTx;
                    offer.initiatorTransferComplete = true;
                }
            } catch (escrowErr) {
                console.error('Escrow release failed:', escrowErr);
                offer.escrowReleaseError = escrowErr.message;
                offer.initiatorTransferComplete = false;
            }
        } else {
            console.log('Escrow key not configured');
            offer.initiatorTransferComplete = false;
        }

        // Update offer status
        offer.status = 'accepted';
        offer.acceptedAt = now;

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
            message: escrowReleaseTx
                ? 'Swap completed! Assets have been exchanged.'
                : 'Offer accepted. Initiator assets will be released shortly.',
            offer,
            escrowReleaseTx
        });

    } catch (error) {
        console.error('Accept offer error:', error);
        return res.status(500).json({ error: 'Failed to accept offer: ' + error.message });
    }
}

// Release escrowed NFTs and SOL to the receiver
async function releaseEscrowToReceiver(offer, escrowPrivateKeyBase58, heliusApiKey) {
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const connection = new Connection(RPC_URL, 'confirmed');

    // Decode escrow keypair
    const escrowKeypair = Keypair.fromSecretKey(bs58.decode(escrowPrivateKeyBase58));
    console.log('Escrow wallet:', escrowKeypair.publicKey.toBase58());

    const receiverPubkey = new PublicKey(offer.receiver.wallet);
    const initiatorNfts = offer.initiator.nftDetails || [];
    const initiatorSol = offer.initiator.sol || 0;

    // If nothing to release, return early
    if (initiatorNfts.length === 0 && initiatorSol === 0) {
        console.log('Nothing to release from escrow');
        return null;
    }

    const transaction = new Transaction();

    // 1. Transfer escrowed SOL to receiver
    if (initiatorSol > 0) {
        const lamports = Math.floor(initiatorSol * LAMPORTS_PER_SOL);
        console.log('Releasing SOL:', initiatorSol, '=', lamports, 'lamports');
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: escrowKeypair.publicKey,
                toPubkey: receiverPubkey,
                lamports: lamports,
            })
        );
    }

    // 2. Transfer escrowed NFTs to receiver
    for (const nft of initiatorNfts) {
        console.log('Processing escrowed NFT:', nft.id, nft.name);

        // Get asset info to check if compressed
        const assetInfo = await getAsset(nft.id, heliusApiKey);

        if (assetInfo?.compression?.compressed) {
            // Compressed NFT - use Bubblegum transfer
            console.log('NFT is compressed, building Bubblegum transfer');
            const proof = await getAssetProof(nft.id, heliusApiKey);

            if (!proof) {
                console.error('Failed to get proof for', nft.id);
                continue;
            }

            const ix = createBubblegumTransferInstruction(
                escrowKeypair.publicKey,
                receiverPubkey,
                assetInfo.compression,
                proof
            );
            transaction.add(ix);
        } else {
            // Standard SPL token - would need token transfer logic
            console.log('Standard SPL token transfer not yet implemented for escrow release');
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

    console.log('Escrow release transaction sent:', signature);

    // Wait for confirmation
    await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
    }, 'confirmed');

    console.log('Escrow release confirmed:', signature);
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

    // Get tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBytes()],
        BUBBLEGUM_PROGRAM_ID
    );

    const keys = [
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
        { pubkey: fromPubkey, isSigner: false, isWritable: false }, // delegate (same as owner)
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    // Add proof nodes
    for (const proofNode of proof.proof) {
        keys.push({ pubkey: new PublicKey(proofNode), isSigner: false, isWritable: false });
    }

    // Build instruction data
    // Discriminator: [163, 52, 200, 231, 140, 3, 69, 186]
    const discriminator = Buffer.from([163, 52, 200, 231, 140, 3, 69, 186]);

    // root (32 bytes)
    const rootBytes = Buffer.from(proof.root.replace('0x', ''), 'hex');

    // dataHash (32 bytes)
    const dataHashBytes = Buffer.from(compression.data_hash.replace('0x', ''), 'hex');

    // creatorHash (32 bytes)
    const creatorHashBytes = Buffer.from(compression.creator_hash.replace('0x', ''), 'hex');

    // nonce (u64, 8 bytes, little-endian)
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(compression.leaf_id), 0);

    // index (u32, 4 bytes, little-endian)
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
