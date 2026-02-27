// Vercel Serverless Function — Embed Town Hall analyses into vector DB
// POST with CRON_SECRET auth. Body: { spaceId } or { spaceId: "all" }
import { timingSafeEqual } from 'crypto';
import { kvHgetall, kvHget } from '../lib/swap-utils.js';
import { getEmbeddingBatch, vectorUpsert, vectorDelete, chunkTownHall } from '../lib/vector-utils.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Auth ---
    const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
    const authHeader = req.headers['authorization'] || '';
    if (!CRON_SECRET || !authHeader) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const provided = Buffer.from(String(authHeader).trim());
    const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const vectorUrl = process.env.UPSTASH_VECTOR_URL;
    const vectorToken = process.env.UPSTASH_VECTOR_TOKEN;

    if (!kvUrl || !kvToken || !openaiApiKey || !vectorUrl || !vectorToken) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    const { spaceId } = req.body || {};
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId required (specific ID or "all")' });
    }

    try {
        let analyses;
        if (spaceId === 'all') {
            analyses = await kvHgetall('spaces:analyses', kvUrl, kvToken);
            if (!analyses || Object.keys(analyses).length === 0) {
                return res.status(200).json({ message: 'No analyses found in spaces:analyses' });
            }
        } else {
            const single = await kvHget('spaces:analyses', spaceId, kvUrl, kvToken);
            if (!single) {
                return res.status(404).json({ error: `No analysis found for spaceId: ${spaceId}` });
            }
            analyses = { [spaceId]: single };
        }

        let totalChunks = 0;
        let totalEmbedded = 0;
        const results = [];

        for (const [id, raw] of Object.entries(analyses)) {
            const analysis = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const chunks = chunkTownHall(analysis);
            if (chunks.length === 0) {
                results.push({ id, status: 'skipped', reason: 'no chunks produced' });
                continue;
            }
            totalChunks += chunks.length;

            // Delete existing vectors for this space (clean re-embed)
            const existingIds = chunks.map((_, i) => `th_${id}_${i}`);
            await vectorDelete(existingIds, vectorUrl, vectorToken, 'townhalls').catch(() => {});

            // Embed all chunks
            const texts = chunks.map(c => c.text);
            const embeddings = await getEmbeddingBatch(texts, openaiApiKey);

            // Build vectors with metadata
            const vectors = chunks.map((chunk, i) => ({
                id: `th_${id}_${i}`,
                vector: embeddings[i],
                metadata: {
                    space_id: id,
                    title: analysis.title || 'Unknown',
                    space_date: analysis.space_date || '',
                    section: chunk.section,
                    chunk_index: i
                },
                data: chunk.text
            }));

            await vectorUpsert(vectors, vectorUrl, vectorToken, 'townhalls');
            totalEmbedded += vectors.length;
            results.push({ id, title: analysis.title, chunks: chunks.length, status: 'embedded' });
        }

        return res.status(200).json({
            success: true,
            totalChunks,
            totalEmbedded,
            spaces: results
        });
    } catch (error) {
        console.error('Spaces embed error:', error);
        return res.status(500).json({ error: 'Embedding failed', detail: error.message });
    }
}
