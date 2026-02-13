// Vercel Serverless Function for Wallet-Wallet Linking
import { isRateLimitedKV, getClientIp, validateTimestamp, isSignatureUsed, markSignatureUsed, kvHset, kvHget, kvHdel, verifySignature, migrateMapToHash } from '../lib/swap-utils.js';

const WALLET_MAP_KEY = 'holders:wallet_map';
const WALLET_HASH_KEY = 'holders:wallet_map:h';

function isValidWallet(wallet) {
    return wallet && typeof wallet === 'string' && wallet.length >= 32 && wallet.length <= 44;
}

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV not configured' });
    }

    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'holders-link-wallet', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    try {
        // Auto-migrate old blob format to hash if needed
        await migrateMapToHash(WALLET_MAP_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);

        if (req.method === 'DELETE') {
            // Unlink wallet
            const { wallet, signature, message } = req.body;

            if (!isValidWallet(wallet)) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }
            if (!signature || typeof signature !== 'string') {
                return res.status(400).json({ error: 'Signature required' });
            }
            if (!message || typeof message !== 'string') {
                return res.status(400).json({ error: 'Message required' });
            }

            const expectedPrefix = `Unlink wallet ${wallet} on midhorde.com at `;
            if (!message.startsWith(expectedPrefix)) {
                return res.status(400).json({ error: 'Invalid message format' });
            }

            const tsResult = validateTimestamp(message);
            if (!tsResult.valid) {
                return res.status(400).json({ error: tsResult.error });
            }

            if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
                return res.status(400).json({ error: 'Signature already used' });
            }

            if (!verifySignature(message, signature, wallet)) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

            // Atomic per-wallet delete — remove both directions
            const linked = await kvHget(WALLET_HASH_KEY, wallet, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (linked) {
                const otherWallet = linked.linkedWallet;
                await kvHdel(WALLET_HASH_KEY, wallet, KV_REST_API_URL, KV_REST_API_TOKEN);
                if (otherWallet) {
                    await kvHdel(WALLET_HASH_KEY, otherWallet, KV_REST_API_URL, KV_REST_API_TOKEN);
                }
            }

            return res.status(200).json({ success: true, action: 'unlinked' });
        }

        // POST - Link two wallets
        const { walletA, signatureA, messageA, walletB, signatureB, messageB } = req.body;

        if (!isValidWallet(walletA) || !isValidWallet(walletB)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!signatureA || typeof signatureA !== 'string' || !signatureB || typeof signatureB !== 'string') {
            return res.status(400).json({ error: 'Both signatures required' });
        }
        if (!messageA || typeof messageA !== 'string' || !messageB || typeof messageB !== 'string') {
            return res.status(400).json({ error: 'Both messages required' });
        }

        if (walletA === walletB) {
            return res.status(400).json({ error: 'Cannot link a wallet to itself' });
        }

        // Validate message A format and timestamp
        const expectedPrefixA = `Link wallet ${walletA} to another wallet on midhorde.com at `;
        if (!messageA.startsWith(expectedPrefixA)) {
            return res.status(400).json({ error: 'Invalid message format for wallet A' });
        }
        const tsResultA = validateTimestamp(messageA);
        if (!tsResultA.valid) {
            return res.status(400).json({ error: tsResultA.error });
        }

        // Validate message B format and timestamp
        const expectedPrefixB = `Confirm link wallet ${walletB} to wallet ${walletA} on midhorde.com at `;
        if (!messageB.startsWith(expectedPrefixB)) {
            return res.status(400).json({ error: 'Invalid message format for wallet B' });
        }
        const tsResultB = validateTimestamp(messageB);
        if (!tsResultB.valid) {
            return res.status(400).json({ error: tsResultB.error });
        }

        // Check signature replay for both
        if (await isSignatureUsed(signatureA, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'Signature A already used' });
        }
        if (await isSignatureUsed(signatureB, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'Signature B already used' });
        }

        // Verify signature A
        if (!verifySignature(messageA, signatureA, walletA)) {
            return res.status(401).json({ error: 'Invalid signature for wallet A' });
        }

        // Verify signature B
        if (!verifySignature(messageB, signatureB, walletB)) {
            return res.status(401).json({ error: 'Invalid signature for wallet B' });
        }

        // Mark both signatures as used
        await markSignatureUsed(signatureA, KV_REST_API_URL, KV_REST_API_TOKEN);
        await markSignatureUsed(signatureB, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Check if either wallet is already linked to a different wallet
        const existingA = await kvHget(WALLET_HASH_KEY, walletA, KV_REST_API_URL, KV_REST_API_TOKEN);
        const existingB = await kvHget(WALLET_HASH_KEY, walletB, KV_REST_API_URL, KV_REST_API_TOKEN);

        if (existingA && existingA.linkedWallet !== walletB) {
            return res.status(400).json({ error: 'Wallet A is already linked to a different wallet' });
        }
        if (existingB && existingB.linkedWallet !== walletA) {
            return res.status(400).json({ error: 'Wallet B is already linked to a different wallet' });
        }

        // Atomic per-wallet writes — no read-modify-write race
        const linkedAt = new Date().toISOString();
        await kvHset(WALLET_HASH_KEY, walletA, { linkedWallet: walletB, linkedAt }, KV_REST_API_URL, KV_REST_API_TOKEN);
        await kvHset(WALLET_HASH_KEY, walletB, { linkedWallet: walletA, linkedAt }, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ success: true, action: 'linked', linkedWallet: walletB });

    } catch (error) {
        console.error('Holders-link-wallet error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
