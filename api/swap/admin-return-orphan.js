// Admin endpoint to return an arbitrary NFT from escrow to a wallet
// Used for orphaned NFTs that have no associated offer record
import { timingSafeEqual } from 'crypto';
import {
    validateSolanaAddress,
    getAsset,
    createMplCoreTransferInstruction,
    executeEscrowTransaction,
    cleanApiKey,
    getClientIp,
    isRateLimitedKV,
    ESCROW_WALLET
} from '../../lib/swap-utils.js';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!ESCROW_PRIVATE_KEY || !HELIUS_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rate limit before auth check to block brute force
    if (KV_REST_API_URL && KV_REST_API_TOKEN) {
        const ip = getClientIp(req);
        if (await isRateLimitedKV(ip, 'admin-return-orphan', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(429).json({ error: 'Too many requests' });
        }
    }

    try {
        const { secret, wallet, nftMint } = req.body;

        // Auth check
        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(ADMIN_SECRET);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Validate inputs
        if (!wallet || !validateSolanaAddress(wallet)) {
            return res.status(400).json({ error: 'Valid wallet address required' });
        }
        if (!nftMint || !validateSolanaAddress(nftMint)) {
            return res.status(400).json({ error: 'Valid nftMint address required' });
        }

        // Verify the NFT is currently in escrow
        const asset = await getAsset(nftMint, HELIUS_API_KEY);
        if (!asset) {
            return res.status(404).json({ error: 'NFT not found on-chain' });
        }

        const currentOwner = asset.ownership?.owner;
        if (currentOwner !== ESCROW_WALLET) {
            return res.status(400).json({
                error: 'NFT is not in escrow wallet',
                currentOwner,
                escrowWallet: ESCROW_WALLET
            });
        }

        // Determine asset type and collection
        const assetType = asset.interface || null;
        const collection = (asset.grouping || []).find(g => g.group_key === 'collection')?.group_value || null;
        const nftName = asset.content?.metadata?.name || 'Unknown';

        // Build transfer instruction
        const escrowKeypair = Keypair.fromSecretKey(bs58.decode(ESCROW_PRIVATE_KEY));
        const destinationPubkey = new PublicKey(wallet);
        const transaction = new Transaction();

        if (assetType === 'MplCoreAsset') {
            transaction.add(createMplCoreTransferInstruction(
                nftMint, escrowKeypair.publicKey, destinationPubkey, collection
            ));
        } else {
            return res.status(400).json({
                error: `Unsupported asset type: ${assetType}. Only MplCoreAsset is supported by this endpoint.`
            });
        }

        // Execute the transfer
        const txSignature = await executeEscrowTransaction(transaction, escrowKeypair, HELIUS_API_KEY);

        return res.status(200).json({
            success: true,
            message: `Returned ${nftName} to ${wallet}`,
            nftMint,
            nftName,
            wallet,
            txSignature
        });

    } catch (error) {
        console.error('Admin return orphan error:', error);
        return res.status(500).json({ error: 'Transfer failed: ' + error.message });
    }
}
