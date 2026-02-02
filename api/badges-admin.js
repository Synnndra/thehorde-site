// Vercel Serverless Function - Admin Badge Management
import { timingSafeEqual } from 'crypto';
import { kvGet, kvSet, getClientIp, isRateLimitedKV, validateSolanaAddress } from '../lib/swap-utils.js';

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

    // Rate limit: 5 per minute per IP
    const ip = getClientIp(req);
    if (await isRateLimitedKV(ip, 'badges-admin', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        const { secret, mode, badgeId, name, description, icon, imageUrl, wallets } = req.body;

        // Auth
        const secretBuf = Buffer.from(String(secret || ''));
        const adminBuf = Buffer.from(ADMIN_SECRET);
        if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const DEFS_KEY = 'badges:definitions';

        // Mode: list all badge definitions
        if (mode === 'list') {
            const defs = await kvGet(DEFS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN) || {};
            const badges = Object.values(defs);

            // Get award counts for each badge
            const counts = {};
            for (const badge of badges) {
                const awarded = await kvGet(`badges:awarded:${badge.id}`, KV_REST_API_URL, KV_REST_API_TOKEN);
                counts[badge.id] = Array.isArray(awarded) ? awarded.length : 0;
            }

            return res.status(200).json({ badges, counts });
        }

        // Mode: create a new badge definition
        if (mode === 'create') {
            if (!badgeId || !name) {
                return res.status(400).json({ error: 'badgeId and name required' });
            }
            if (!/^[a-z0-9_]+$/.test(badgeId)) {
                return res.status(400).json({ error: 'badgeId must be lowercase alphanumeric with underscores' });
            }

            const defs = await kvGet(DEFS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN) || {};
            if (defs[badgeId]) {
                return res.status(400).json({ error: 'Badge ID already exists' });
            }

            defs[badgeId] = {
                id: badgeId,
                name: String(name).slice(0, 64),
                description: String(description || '').slice(0, 256),
                icon: String(icon || '⭐').slice(0, 8),
                createdAt: Date.now()
            };
            if (imageUrl && typeof imageUrl === 'string') {
                defs[badgeId].imageUrl = String(imageUrl).slice(0, 512);
            }

            await kvSet(DEFS_KEY, defs, KV_REST_API_URL, KV_REST_API_TOKEN);
            return res.status(200).json({ success: true, badge: defs[badgeId] });
        }

        // Mode: award a badge to wallets
        if (mode === 'award') {
            if (!badgeId || !Array.isArray(wallets) || wallets.length === 0) {
                return res.status(400).json({ error: 'badgeId and wallets array required' });
            }

            const defs = await kvGet(DEFS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN) || {};
            if (!defs[badgeId]) {
                return res.status(400).json({ error: 'Badge not found' });
            }

            // Validate wallets
            const validWallets = wallets.filter(w => validateSolanaAddress(String(w).trim()));
            if (validWallets.length === 0) {
                return res.status(400).json({ error: 'No valid wallet addresses' });
            }

            // Get current awarded list
            const awardedKey = `badges:awarded:${badgeId}`;
            const currentAwarded = await kvGet(awardedKey, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
            const awardedSet = new Set(currentAwarded);

            let newCount = 0;
            for (const wallet of validWallets) {
                const trimmed = wallet.trim();
                if (awardedSet.has(trimmed)) continue;

                // Add badge to wallet's badge list
                const walletKey = `badges:wallet:${trimmed}`;
                const walletBadges = await kvGet(walletKey, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
                if (!walletBadges.includes(badgeId)) {
                    walletBadges.push(badgeId);
                    await kvSet(walletKey, walletBadges, KV_REST_API_URL, KV_REST_API_TOKEN);
                }

                awardedSet.add(trimmed);
                newCount++;
            }

            // Save updated awarded list
            await kvSet(awardedKey, Array.from(awardedSet), KV_REST_API_URL, KV_REST_API_TOKEN);

            return res.status(200).json({ success: true, awarded: newCount, total: awardedSet.size });
        }

        // Mode: revoke a badge from wallets
        if (mode === 'revoke') {
            if (!badgeId || !Array.isArray(wallets) || wallets.length === 0) {
                return res.status(400).json({ error: 'badgeId and wallets array required' });
            }

            const awardedKey = `badges:awarded:${badgeId}`;
            const currentAwarded = await kvGet(awardedKey, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
            const revokeSet = new Set(wallets.map(w => String(w).trim()));

            // Remove from awarded list
            const newAwarded = currentAwarded.filter(w => !revokeSet.has(w));
            await kvSet(awardedKey, newAwarded, KV_REST_API_URL, KV_REST_API_TOKEN);

            // Remove from each wallet's badge list
            for (const wallet of wallets) {
                const trimmed = String(wallet).trim();
                const walletKey = `badges:wallet:${trimmed}`;
                const walletBadges = await kvGet(walletKey, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
                const filtered = walletBadges.filter(id => id !== badgeId);
                await kvSet(walletKey, filtered, KV_REST_API_URL, KV_REST_API_TOKEN);
            }

            return res.status(200).json({ success: true, revoked: revokeSet.size, total: newAwarded.length });
        }

        // Mode: view wallets awarded a badge
        if (mode === 'view') {
            if (!badgeId) {
                return res.status(400).json({ error: 'badgeId required' });
            }

            const awarded = await kvGet(`badges:awarded:${badgeId}`, KV_REST_API_URL, KV_REST_API_TOKEN) || [];
            return res.status(200).json({ badgeId, wallets: awarded });
        }

        // Mode: backfill swap counts from existing completed offers
        if (mode === 'backfill-swaps') {
            const scanRes = await fetch(`${KV_REST_API_URL}/keys/offer:*`, {
                headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
            });
            const scanData = await scanRes.json();
            const offerKeys = scanData.result || [];

            const swapCounts = {};
            for (const key of offerKeys) {
                const offer = await kvGet(key, KV_REST_API_URL, KV_REST_API_TOKEN);
                if (!offer || offer.status !== 'completed') continue;

                const initiator = offer.initiator?.wallet;
                const receiver = offer.receiver?.wallet;
                if (initiator) swapCounts[initiator] = (swapCounts[initiator] || 0) + 1;
                if (receiver) swapCounts[receiver] = (swapCounts[receiver] || 0) + 1;
            }

            // Write counts to KV
            for (const [wallet, count] of Object.entries(swapCounts)) {
                await kvSet(`badges:swaps:${wallet}`, count, KV_REST_API_URL, KV_REST_API_TOKEN);
            }

            return res.status(200).json({ success: true, walletsUpdated: Object.keys(swapCounts).length, swapCounts });
        }

        return res.status(400).json({ error: 'Invalid mode' });

    } catch (error) {
        console.error('Badges admin error:', error);
        return res.status(500).json({ error: 'Badge operation failed' });
    }
}
