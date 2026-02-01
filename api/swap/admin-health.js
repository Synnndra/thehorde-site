// Admin health-check endpoint
import { kvGet, cleanApiKey, ESCROW_WALLET } from './utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const HELIUS_API_KEY = cleanApiKey(process.env.HELIUS_API_KEY);

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }

    try {
        const { secret } = req.body;
        if (secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const result = { kv: 'red', helius: 'red', escrow: { status: 'red', balance: null } };

        // Check KV
        try {
            // Try reading a key — any response (including null) means KV is up
            await kvGet('health_check_ping', KV_REST_API_URL, KV_REST_API_TOKEN);
            result.kv = 'green';
        } catch {
            result.kv = 'red';
        }

        // Check Helius RPC + escrow balance in one call
        try {
            const rpcRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBalance',
                    params: [ESCROW_WALLET]
                })
            });
            const rpcData = await rpcRes.json();

            if (rpcData.result != null) {
                result.helius = 'green';
                const lamports = rpcData.result.value;
                const sol = lamports / 1e9;
                result.escrow.balance = sol;

                if (sol >= 0.05) {
                    result.escrow.status = 'green';
                } else if (sol > 0) {
                    result.escrow.status = 'yellow';
                } else {
                    result.escrow.status = 'red';
                }
            }
        } catch {
            // helius and escrow stay red
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('Admin health error:', error);
        return res.status(500).json({ error: 'Health check failed' });
    }
}
