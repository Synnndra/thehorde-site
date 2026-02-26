// One-time local script — embeds existing KBs + town hall analyses into Upstash Vector
// Run: node embed-backfill.js
// Reads .env.local for credentials
import { readFileSync } from 'fs';
import {
    getEmbeddingBatch, vectorUpsert, vectorInfo,
    chunkText, chunkTownHall
} from './lib/vector-utils.js';

// Load env vars from .env.local
const envFile = readFileSync('C:\\Users\\bobby\\thehorde-site\\.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)="(.*)"/);
    if (match) env[match[1]] = match[2].replace(/\\n$/, '');
}

const KV_URL = env.KV_REST_API_URL;
const KV_TOKEN = env.KV_REST_API_TOKEN;
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const VECTOR_URL = env.UPSTASH_VECTOR_URL;
const VECTOR_TOKEN = env.UPSTASH_VECTOR_TOKEN;

if (!KV_URL || !KV_TOKEN || !OPENAI_API_KEY || !VECTOR_URL || !VECTOR_TOKEN) {
    console.error('Missing env vars. Need: KV_REST_API_URL, KV_REST_API_TOKEN, OPENAI_API_KEY, UPSTASH_VECTOR_URL, UPSTASH_VECTOR_TOKEN');
    process.exit(1);
}

const CHANNELS = [
    { id: '1408632599441834248', name: 'midevils-bst' },
    { id: '1408631977061650594', name: 'mid-chat' },
    { id: '1405392744272232459', name: 'announcements' },
    { id: '1438567217787830333', name: 'the-horde' },
];

function log(msg) {
    const ts = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
    console.log(`${ts}: ${msg}`);
}

async function kvGet(key) {
    const res = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
}

async function kvHgetall(key) {
    const res = await fetch(`${KV_URL}/hgetall/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await res.json();
    if (!data.result || data.result.length === 0) return null;
    // Redis HGETALL returns [field1, value1, field2, value2, ...]
    const obj = {};
    for (let i = 0; i < data.result.length; i += 2) {
        try {
            obj[data.result[i]] = JSON.parse(data.result[i + 1]);
        } catch {
            obj[data.result[i]] = data.result[i + 1];
        }
    }
    return obj;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function embedAndUpsert(chunks, idPrefix, namespace, metadata) {
    if (chunks.length === 0) return 0;

    log(`  Embedding ${chunks.length} chunks...`);
    const texts = chunks.map(c => typeof c === 'string' ? c : c.text);
    await sleep(3000); // Rate limit pause for Tier 1 accounts
    const embeddings = await getEmbeddingBatch(texts, OPENAI_API_KEY);

    const vectors = embeddings.map((embedding, i) => {
        const chunk = chunks[i];
        const chunkMeta = typeof chunk === 'object' && chunk.metadata ? { ...metadata, ...chunk.metadata } : metadata;
        return {
            id: `${idPrefix}:${i}`,
            vector: embedding,
            metadata: chunkMeta,
            data: typeof chunk === 'string' ? chunk : chunk.text
        };
    });

    await vectorUpsert(vectors, VECTOR_URL, VECTOR_TOKEN, namespace);
    log(`  Upserted ${vectors.length} vectors to ${namespace} namespace`);
    return vectors.length;
}

async function main() {
    log('=== Drak RAG Backfill ===\n');

    // Check index
    try {
        const info = await vectorInfo(VECTOR_URL, VECTOR_TOKEN);
        log(`Vector index: ${JSON.stringify(info.result || info)}`);
    } catch (e) {
        log(`WARNING: Could not reach vector index: ${e.message}`);
    }

    let totalVectors = 0;

    // ===== Phase 1: Per-channel KBs =====
    log('\n--- Phase 1: Per-channel KBs ---');
    for (const channel of CHANNELS) {
        log(`\nChannel: #${channel.name} (${channel.id})`);
        const kb = await kvGet(`discord:kb:${channel.id}`);
        if (!kb?.content) {
            log('  No KB found, skipping');
            continue;
        }
        log(`  KB: ${kb.content.length} chars, ${kb.messageCount || '?'} messages`);

        const chunks = chunkText(kb.content);
        log(`  Chunked into ${chunks.length} pieces`);

        const count = await embedAndUpsert(
            chunks,
            `discord:per_channel_kb:${channel.name}`,
            'discord',
            { type: 'per_channel_kb', channel: channel.name, date: new Date().toISOString().slice(0, 10) }
        );
        totalVectors += count;
    }

    // ===== Phase 2: Merged KB =====
    log('\n--- Phase 2: Merged knowledge base ---');
    const mergedKb = await kvGet('discord:knowledge_base');
    if (mergedKb?.content) {
        log(`Merged KB: ${mergedKb.content.length} chars`);

        const chunks = chunkText(mergedKb.content);
        log(`Chunked into ${chunks.length} pieces`);

        const count = await embedAndUpsert(
            chunks,
            'discord:compiled_kb:merged',
            'discord',
            { type: 'compiled_kb', channel: 'merged', date: new Date().toISOString().slice(0, 10) }
        );
        totalVectors += count;
    } else {
        log('No merged KB found, skipping');
    }

    // ===== Phase 3: Town hall analyses =====
    log('\n--- Phase 3: Town hall analyses ---');
    const analyses = await kvHgetall('spaces:analyses');
    if (analyses && Object.keys(analyses).length > 0) {
        log(`Found ${Object.keys(analyses).length} town hall analyses`);

        for (const [spaceId, data] of Object.entries(analyses)) {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            log(`\nTown hall: ${parsed.title || spaceId} (${parsed.space_date || '?'})`);

            const analysisText = parsed.analysis || parsed.content || '';
            if (!analysisText) {
                log('  No analysis text, skipping');
                continue;
            }

            const sectionChunks = chunkTownHall(parsed);
            log(`  Split into ${sectionChunks.length} sections`);

            if (sectionChunks.length === 0) continue;

            const vectors = [];
            const texts = sectionChunks.map(c => c.text);
            await sleep(3000); // Rate limit pause
            const embeddings = await getEmbeddingBatch(texts, OPENAI_API_KEY);

            for (let i = 0; i < sectionChunks.length; i++) {
                vectors.push({
                    id: `townhall:${spaceId}:${sectionChunks[i].section.replace(/\s+/g, '_').toLowerCase()}:${i}`,
                    vector: embeddings[i],
                    metadata: {
                        title: parsed.title || 'Unknown',
                        space_date: parsed.space_date || '',
                        section: sectionChunks[i].section
                    },
                    data: sectionChunks[i].text
                });
            }

            await vectorUpsert(vectors, VECTOR_URL, VECTOR_TOKEN, 'townhalls');
            log(`  Upserted ${vectors.length} vectors to townhalls namespace`);
            totalVectors += vectors.length;
        }
    } else {
        log('No town hall analyses found, skipping');
    }

    log(`\n=== DONE! Total vectors upserted: ${totalVectors} ===`);

    // Final check
    try {
        const info = await vectorInfo(VECTOR_URL, VECTOR_TOKEN);
        log(`Final index stats: ${JSON.stringify(info.result || info)}`);
    } catch (e) {
        log(`Could not check final stats: ${e.message}`);
    }
}

main().catch(e => {
    log(`FATAL: ${e.message}`);
    log(e.stack);
    process.exit(1);
});
