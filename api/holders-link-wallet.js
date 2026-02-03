// Vercel Serverless Function for Wallet-Wallet Linking
import nacl from 'tweetnacl';

const WALLET_MAP_KEY = 'holders:wallet_map';
const CACHE_KEY = 'holders:leaderboard';

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return false;
    }
    if (record.count >= RATE_LIMIT_MAX) return true;
    record.count++;
    return false;
}

function base58Decode(str) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const c = alphabet.indexOf(str[i]);
        if (c < 0) throw new Error('Invalid base58 character');
        let carry = c;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    // Leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
        bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
}

function isValidWallet(wallet) {
    return wallet && typeof wallet === 'string' && wallet.length >= 32 && wallet.length <= 44;
}

function verifySignature(message, signature, wallet) {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = base58Decode(signature);
        const publicKeyBytes = base58Decode(wallet);
        console.log('verifySignature:', {
            messageLen: messageBytes.length,
            sigLen: signatureBytes.length,
            pubKeyLen: publicKeyBytes.length,
            message,
            sigPrefix: signature.slice(0, 10),
            wallet: wallet.slice(0, 8)
        });
        if (signatureBytes.length !== 64) {
            console.error('Bad signature length:', signatureBytes.length);
            return false;
        }
        if (publicKeyBytes.length !== 32) {
            console.error('Bad public key length:', publicKeyBytes.length);
            return false;
        }
        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (e) {
        console.error('verifySignature error:', e);
        return false;
    }
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

    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    async function kvGet(key) {
        const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const data = await response.json();
        return data.result;
    }

    async function kvSet(key, value) {
        const response = await fetch(`${KV_REST_API_URL}/set/${key}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(value)
        });
        return response.json();
    }

    async function kvDel(key) {
        const response = await fetch(`${KV_REST_API_URL}/del/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        return response.json();
    }

    try {
        // Read current wallet map
        let walletMap = {};
        try {
            const rawMap = await kvGet(WALLET_MAP_KEY);
            if (rawMap) {
                walletMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read wallet map:', e);
        }

        if (req.method === 'DELETE') {
            // Unlink wallet
            const { wallet, signature } = req.body;

            if (!isValidWallet(wallet)) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }
            if (!signature || typeof signature !== 'string') {
                return res.status(400).json({ error: 'Signature required' });
            }

            const message = `Unlink wallet ${wallet} on midhorde.com`;
            if (!verifySignature(message, signature, wallet)) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // Find and remove both directions
            const linked = walletMap[wallet];
            if (linked) {
                const otherWallet = linked.linkedWallet;
                delete walletMap[wallet];
                if (walletMap[otherWallet]) {
                    delete walletMap[otherWallet];
                }
                await kvSet(WALLET_MAP_KEY, walletMap);
                await kvDel(CACHE_KEY);
            }

            return res.status(200).json({ success: true, action: 'unlinked' });
        }

        // POST - Link two wallets
        const { walletA, signatureA, walletB, signatureB } = req.body;

        if (!isValidWallet(walletA) || !isValidWallet(walletB)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!signatureA || typeof signatureA !== 'string' || !signatureB || typeof signatureB !== 'string') {
            return res.status(400).json({ error: 'Both signatures required' });
        }

        if (walletA === walletB) {
            return res.status(400).json({ error: 'Cannot link a wallet to itself' });
        }

        // Verify signature A
        const messageA = `Link wallet ${walletA} to another wallet on midhorde.com`;
        if (!verifySignature(messageA, signatureA, walletA)) {
            return res.status(401).json({ error: 'Invalid signature for wallet A' });
        }

        // Verify signature B
        const messageB = `Confirm link wallet ${walletB} to wallet ${walletA} on midhorde.com`;
        if (!verifySignature(messageB, signatureB, walletB)) {
            return res.status(401).json({ error: 'Invalid signature for wallet B' });
        }

        // Check if either wallet is already linked to a different wallet
        if (walletMap[walletA] && walletMap[walletA].linkedWallet !== walletB) {
            return res.status(400).json({ error: 'Wallet A is already linked to a different wallet' });
        }
        if (walletMap[walletB] && walletMap[walletB].linkedWallet !== walletA) {
            return res.status(400).json({ error: 'Wallet B is already linked to a different wallet' });
        }

        // Store bidirectional link
        const linkedAt = new Date().toISOString();
        walletMap[walletA] = { linkedWallet: walletB, linkedAt };
        walletMap[walletB] = { linkedWallet: walletA, linkedAt };

        await kvSet(WALLET_MAP_KEY, walletMap);
        await kvDel(CACHE_KEY);

        return res.status(200).json({ success: true, action: 'linked', linkedWallet: walletB });

    } catch (error) {
        console.error('Holders-link-wallet error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
