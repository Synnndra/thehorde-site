// Vercel Serverless Function for Wallet-Discord Linking
import nacl from 'tweetnacl';
import { isRateLimitedKV, getClientIp, validateTimestamp, isSignatureUsed, markSignatureUsed, kvGet, kvSet } from '../lib/swap-utils.js';

const DISCORD_MAP_KEY = 'holders:discord_map';

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
    if (await isRateLimitedKV(clientIp, 'holders-link', 5, 60000, KV_REST_API_URL, KV_REST_API_TOKEN)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    async function kvDel(key) {
        const response = await fetch(`${KV_REST_API_URL}/del/${key}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${KV_REST_API_TOKEN}` }
        });
        return response.json();
    }

    try {
        const { wallet, signature, message, discord } = req.body;

        // Validate wallet address format
        if (!wallet || typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        // Validate signature
        if (!signature || typeof signature !== 'string') {
            return res.status(400).json({ error: 'Signature required' });
        }

        // Validate message format and timestamp
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message required' });
        }

        const expectedPrefix = req.method === 'DELETE'
            ? `Unlink Discord from wallet ${wallet} on midhorde.com at `
            : `Link Discord to wallet ${wallet} on midhorde.com at `;

        if (!message.startsWith(expectedPrefix)) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        const tsResult = validateTimestamp(message);
        if (!tsResult.valid) {
            return res.status(400).json({ error: tsResult.error });
        }

        // Check signature replay
        if (await isSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN)) {
            return res.status(400).json({ error: 'Signature already used' });
        }

        // Verify signature proves wallet ownership
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = base58Decode(signature);
        const publicKeyBytes = base58Decode(wallet);

        const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        if (!verified) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Mark signature as used
        await markSignatureUsed(signature, KV_REST_API_URL, KV_REST_API_TOKEN);

        // Get current Discord map
        let discordMap = {};
        try {
            const rawMap = await kvGet(DISCORD_MAP_KEY, KV_REST_API_URL, KV_REST_API_TOKEN);
            if (rawMap) {
                discordMap = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
            }
        } catch (e) {
            console.error('Failed to read Discord map:', e);
        }

        if (req.method === 'DELETE') {
            // Unlink
            delete discordMap[wallet];
            await kvSet(DISCORD_MAP_KEY, discordMap, KV_REST_API_URL, KV_REST_API_TOKEN);
            await kvDel(`holder_discord:${wallet}`);

            return res.status(200).json({ success: true, action: 'unlinked' });
        }

        // POST - Link
        if (!discord || typeof discord !== 'object') {
            return res.status(400).json({ error: 'Discord info required' });
        }

        const { username, id: discordId, avatar } = discord;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Discord username required' });
        }

        // Sanitize
        const sanitizedUsername = username.slice(0, 32).replace(/[^\w. -]/g, '');
        const sanitizedId = discordId ? String(discordId).slice(0, 20).replace(/[^0-9]/g, '') : null;
        const sanitizedAvatar = avatar ? String(avatar).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '') : null;

        const discordInfo = {
            username: sanitizedUsername,
            id: sanitizedId,
            avatar: sanitizedAvatar,
            linkedAt: new Date().toISOString()
        };

        // Update map + individual key
        discordMap[wallet] = discordInfo;
        await kvSet(DISCORD_MAP_KEY, discordMap, KV_REST_API_URL, KV_REST_API_TOKEN);
        await kvSet(`holder_discord:${wallet}`, discordInfo, KV_REST_API_URL, KV_REST_API_TOKEN);

        return res.status(200).json({ success: true, action: 'linked', discord: discordInfo });

    } catch (error) {
        console.error('Holders-link error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
