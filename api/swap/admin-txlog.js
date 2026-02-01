// Admin endpoint to view offer transaction logs and health checks
import { kvGet, getTxLog, cleanApiKey, ESCROW_WALLET, isRateLimitedKV, getClientIp } from '../../lib/swap-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!ADMIN_SECRET) {
        return res.status(500).json({ error: 'Admin not configured' });
    }
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rate limit: 5 attempts per minute per IP (before auth check to block brute force)
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'admin-txlog', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        const { secret, offerId, mode } = req.body;

        if (secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Mode: Health check
        if (mode === 'health') {
            const HELIUS_API_KEY = cleanApiKey(process.env.HELIUS_API_KEY);
            const result = { kv: 'red', helius: 'red', escrow: { status: 'red', balance: null } };

            // Check KV
            try {
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
        }

        // Mode 1: Specific offer
        if (offerId) {
            if (typeof offerId !== 'string' || !offerId.startsWith('offer_') || offerId.length < 8 || offerId.length > 40) {
                return res.status(400).json({ error: 'Valid offerId required' });
            }

            const offer = await kvGet(`offer:${offerId}`, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!offer) {
                return res.status(404).json({ error: 'Offer not found' });
            }

            const txLog = await getTxLog(offerId, KV_REST_API_URL, KV_REST_API_TOKEN);

            return res.status(200).json({
                offers: [{
                    offerId,
                    status: offer.status,
                    createdAt: offer.createdAt,
                    initiator: offer.initiator?.wallet || null,
                    receiver: offer.receiver?.wallet || null,
                    txLog,
                }]
            });
        }

        // Mode 2: Recent offers (scan all)
        const scanRes = await fetch(`${KV_REST_API_URL}/keys/offer:*`, {
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        const scanData = await scanRes.json();
        const offerKeys = scanData.result || [];

        const offerSummaries = [];
        for (const key of offerKeys) {
            const id = key.replace('offer:', '');
            const offer = await kvGet(key, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (!offer) continue;

            const txLog = await getTxLog(id, KV_REST_API_URL, KV_REST_API_TOKEN);
            offerSummaries.push({
                offerId: id,
                status: offer.status,
                createdAt: offer.createdAt,
                initiator: offer.initiator?.wallet || null,
                receiver: offer.receiver?.wallet || null,
                txLog,
            });
        }

        offerSummaries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const top10 = offerSummaries.slice(0, 10);

        return res.status(200).json({ offers: top10 });

    } catch (error) {
        console.error('Admin txlog error:', error);
        return res.status(500).json({ error: 'Admin txlog failed' });
    }
}
