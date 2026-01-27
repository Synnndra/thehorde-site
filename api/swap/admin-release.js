// Admin endpoint to manually release stuck NFTs from escrow
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import {
    isRateLimited,
    getClientIp,
    createMplCoreTransferInstruction,
    MPL_CORE_PROGRAM_ID
} from './utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp, 'admin', 3)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!ESCROW_PRIVATE_KEY || !HELIUS_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const { secret, destinationWallet } = req.body;

        if (secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (!destinationWallet) {
            return res.status(400).json({ error: 'destinationWallet required' });
        }

        const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
        const connection = new Connection(RPC_URL, 'confirmed');

        const escrowKeypair = Keypair.fromSecretKey(bs58.decode(ESCROW_PRIVATE_KEY));
        const escrowPubkey = escrowKeypair.publicKey;
        const destPubkey = new PublicKey(destinationWallet);

        console.log('Escrow wallet:', escrowPubkey.toBase58());
        console.log('Destination:', destPubkey.toBase58());

        // Get all NFTs in escrow wallet
        const assetsRes = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAssetsByOwner',
                params: { ownerAddress: escrowPubkey.toBase58(), page: 1, limit: 100 }
            })
        });
        const assetsData = await assetsRes.json();
        const assets = assetsData.result?.items || [];

        console.log('Found assets in escrow:', assets.length);

        if (assets.length === 0) {
            return res.status(200).json({ message: 'No assets in escrow wallet', released: [] });
        }

        const released = [];
        const errors = [];

        for (const asset of assets) {
            try {
                console.log('Releasing:', asset.id, asset.content?.metadata?.name);

                const collection = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
                const ix = createMplCoreTransferInstruction(asset.id, escrowPubkey, destPubkey, collection);

                const transaction = new Transaction().add(ix);
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = escrowPubkey;
                transaction.sign(escrowKeypair);

                const signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                });

                await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

                released.push({ id: asset.id, name: asset.content?.metadata?.name, signature });
                console.log('Released:', asset.id, 'tx:', signature);

            } catch (err) {
                console.error('Failed to release', asset.id, err.message);
                errors.push({ id: asset.id, name: asset.content?.metadata?.name, error: err.message });
            }
        }

        return res.status(200).json({
            success: true,
            released,
            errors,
            message: `Released ${released.length} assets, ${errors.length} errors`
        });

    } catch (error) {
        console.error('Admin release error:', error);
        return res.status(500).json({ error: error.message });
    }
}
