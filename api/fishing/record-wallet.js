// Record wallet addresses with signature verification
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';

export default async function handler(req, res) {
    // CORS headers
    const ALLOWED_ORIGINS = ['https://midhorde.com', 'https://www.midhorde.com'];
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'record-wallet', 10, 60000, KV_URL, KV_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { wallet, signature, message } = req.body;

    if (!wallet) {
        return res.status(400).json({ error: 'Wallet address required' });
    }

    // If signature and message provided, verify wallet ownership
    if (signature && message) {
        try {
            const messageBytes = new TextEncoder().encode(message);
            const signatureBytes = bs58.decode(signature);
            const publicKeyBytes = bs58.decode(wallet);

            const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
            if (!verified) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // Verify the wallet in the message matches the provided wallet
            const walletMatch = message.match(/Wallet: ([A-Za-z0-9]+)/);
            if (!walletMatch || walletMatch[1] !== wallet) {
                return res.status(401).json({ error: 'Wallet mismatch in signed message' });
            }

            // Verify timestamp isn't too old (5 minutes)
            const timestampMatch = message.match(/Timestamp: (\d+)/);
            if (timestampMatch) {
                const signedAt = parseInt(timestampMatch[1]);
                const age = Date.now() - signedAt;
                if (age > 5 * 60 * 1000) {
                    return res.status(401).json({ error: 'Signature expired' });
                }
            }

            console.log(`[WALLET VERIFIED] ${new Date().toISOString()} - ${wallet}`);
        } catch (err) {
            console.error('Signature verification failed:', err);
            return res.status(401).json({ error: 'Signature verification failed' });
        }
    } else {
        // No signature — reject (wallet connect required for giveaway security)
        return res.status(401).json({ error: 'Signature required' });
    }

    return res.status(200).json({ success: true, verified: true, recorded: wallet });
}
