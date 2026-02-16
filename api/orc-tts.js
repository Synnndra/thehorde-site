// Vercel Serverless Function - Orc Advisor TTS (ElevenLabs Proxy)
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    kvGet,
    kvSet
} from '../lib/swap-utils.js';
import { getOrcHoldings } from '../lib/dao-utils.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const heliusApiKey = process.env.HELIUS_API_KEY;
    const elevenLabsApiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    const voiceId = (process.env.ELEVENLABS_VOICE_ID || '').trim();

    if (!kvUrl || !kvToken) {
        return res.status(503).json({ error: 'Service unavailable' });
    }
    if (!elevenLabsApiKey || !voiceId) {
        console.error('TTS env check - API key:', !!elevenLabsApiKey, 'Voice ID:', !!voiceId);
        return res.status(503).json({ error: 'Voice service unavailable' });
    }

    // Rate limit: 20 TTS requests per 5 minutes per IP (matches chat rate)
    const ip = getClientIp(req);
    const limited = await isRateLimitedKV(ip, 'orc-tts', 20, 300000, kvUrl, kvToken);
    if (limited) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { text, wallet, signature, message } = req.body || {};

    // Validate inputs
    if (!text || !wallet || !signature || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!validateSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    if (typeof text !== 'string' || text.length > 1000) {
        return res.status(400).json({ error: 'Text too long' });
    }

    // Verify message timestamp (30-minute window)
    const timestampMatch = message.match(/at (\d+)$/);
    if (!timestampMatch) {
        return res.status(400).json({ error: 'Invalid message format' });
    }
    const messageTimestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();
    if (now - messageTimestamp > 30 * 60 * 1000) {
        return res.status(400).json({ error: 'Session expired' });
    }
    if (messageTimestamp > now + 60000) {
        return res.status(400).json({ error: 'Invalid timestamp' });
    }

    // Verify signature
    if (!verifySignature(message, signature, wallet)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Verify orc holdings (use cached if fresh — orc-advisor caches on each message)
    const holdingsCacheKey = `holdings:cache:${wallet}`;
    let holdingsData = await kvGet(holdingsCacheKey, kvUrl, kvToken).catch(() => null);
    if (!holdingsData || Date.now() - (holdingsData.cachedAt || 0) > 5 * 60 * 1000) {
        holdingsData = await getOrcHoldings(wallet, heliusApiKey);
        holdingsData.cachedAt = Date.now();
        await kvSet(holdingsCacheKey, holdingsData, kvUrl, kvToken).catch(() => {});
    }
    if (holdingsData.orcCount < 1) {
        return res.status(403).json({ error: 'Orc holder only' });
    }

    // Normalize acronyms/abbreviations for natural TTS pronunciation
    let ttsText = text
        .replace(/\bSOL\b/g, 'Sol')
        .replace(/\bNFT\b/g, 'N F T')
        .replace(/\bNFTs\b/g, 'N F Ts')
        .replace(/\bDAO\b/g, 'dow')
        .replace(/\bPFP\b/g, 'P F P')
        .replace(/\bDeFi\b/g, 'dee-fi')
        .replace(/\bGM\b/g, 'G M')
        .replace(/\bWGMI\b/g, 'we gonna make it')
        .replace(/\bNGMI\b/g, 'not gonna make it');

    // Call ElevenLabs TTS API
    try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': elevenLabsApiKey
            },
            body: JSON.stringify({
                text: ttsText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.6,
                    similarity_boost: 0.75,
                    style: 0.3,
                    use_speaker_boost: true
                }
            })
        });

        if (!ttsResponse.ok) {
            const errorText = await ttsResponse.text().catch(() => 'Unknown error');
            console.error('ElevenLabs error:', ttsResponse.status, errorText);
            return res.status(502).json({ error: 'Voice generation failed' });
        }

        // Stream audio back to client
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');

        const arrayBuffer = await ttsResponse.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('TTS error:', err);
        return res.status(500).json({ error: 'Voice generation failed' });
    }
}
