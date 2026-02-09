// Vercel Serverless Function - Solana RPC Proxy
import { isRateLimitedKV, getClientIp } from '../lib/swap-utils.js';

const ALLOWED_METHODS = new Set([
    'getLatestBlockhash',
    'sendTransaction',
    'getSignatureStatuses',
    'getAccountInfo',
    'getTokenAccountsByOwner'
]);

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting (KV-based)
    const clientIp = getClientIp(req);
    if (await isRateLimitedKV(clientIp, 'rpc', 30, 60000, process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    // Method whitelist
    const { method } = req.body || {};
    if (!method || !ALLOWED_METHODS.has(method)) {
        return res.status(403).json({ error: `RPC method not allowed: ${method}` });
    }

    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    if (!HELIUS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('RPC proxy error:', error);
        return res.status(500).json({ error: 'RPC request failed' });
    }
}
