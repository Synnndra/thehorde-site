// Shared embedding + vector DB utilities (raw fetch, no npm packages)

// ========== OpenAI Embedding ==========

export async function getEmbedding(text, openaiApiKey) {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-embedding-3-large',
            input: text
        })
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`OpenAI embedding failed (${resp.status}): ${err}`);
    }
    const json = await resp.json();
    return json.data[0].embedding;
}

export async function getEmbeddingBatch(texts, openaiApiKey) {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-embedding-3-large',
            input: texts
        })
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`OpenAI batch embedding failed (${resp.status}): ${err}`);
    }
    const json = await resp.json();
    return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ========== Upstash Vector ==========

export async function vectorUpsert(vectors, vectorUrl, vectorToken, namespace) {
    const url = namespace
        ? `${vectorUrl}/upsert/${namespace}`
        : `${vectorUrl}/upsert`;
    // Batch in groups of 1000
    for (let i = 0; i < vectors.length; i += 1000) {
        const batch = vectors.slice(i, i + 1000);
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${vectorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(batch)
        });
        if (!resp.ok) {
            const err = await resp.text().catch(() => '');
            throw new Error(`Vector upsert failed (${resp.status}): ${err}`);
        }
    }
}

export async function vectorQuery(queryVector, topK, vectorUrl, vectorToken, opts = {}) {
    const { namespace, includeMetadata = true, includeData = true, filter } = opts;
    const url = namespace
        ? `${vectorUrl}/query/${namespace}`
        : `${vectorUrl}/query`;
    const body = {
        vector: queryVector,
        topK,
        includeMetadata,
        includeData
    };
    if (filter) body.filter = filter;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${vectorToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`Vector query failed (${resp.status}): ${err}`);
    }
    const json = await resp.json();
    return json.result || [];
}

export async function vectorDelete(ids, vectorUrl, vectorToken, namespace) {
    const url = namespace
        ? `${vectorUrl}/delete/${namespace}`
        : `${vectorUrl}/delete`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${vectorToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(ids)
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`Vector delete failed (${resp.status}): ${err}`);
    }
}

export async function vectorInfo(vectorUrl, vectorToken) {
    const resp = await fetch(`${vectorUrl}/info`, {
        headers: { 'Authorization': `Bearer ${vectorToken}` }
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`Vector info failed (${resp.status}): ${err}`);
    }
    return await resp.json();
}

// ========== Chunking ==========

export function chunkText(text, { minChars = 200, maxChars = 2000, targetChars = 1000 } = {}) {
    if (!text || text.length < minChars) return text ? [text] : [];

    // Split on double newlines (paragraphs)
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    const chunks = [];
    let current = '';

    for (const para of paragraphs) {
        // If this single paragraph is oversized, split at sentence boundaries
        if (para.length > maxChars) {
            if (current.trim()) {
                chunks.push(current.trim());
                current = '';
            }
            const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
            let sentBuf = '';
            for (const sent of sentences) {
                if (sentBuf.length + sent.length > maxChars && sentBuf.trim()) {
                    chunks.push(sentBuf.trim());
                    sentBuf = '';
                }
                sentBuf += sent;
            }
            if (sentBuf.trim()) {
                current = sentBuf;
            }
            continue;
        }

        // Merge small paragraphs
        if (current.length + para.length + 2 <= targetChars) {
            current += (current ? '\n\n' : '') + para;
        } else {
            if (current.trim() && current.length >= minChars) {
                chunks.push(current.trim());
                current = para;
            } else if (current.trim()) {
                // Current is too small, merge with next
                current += '\n\n' + para;
            } else {
                current = para;
            }
        }
    }

    if (current.trim()) {
        // If last chunk is too small, merge with previous
        if (current.length < minChars && chunks.length > 0) {
            chunks[chunks.length - 1] += '\n\n' + current.trim();
        } else {
            chunks.push(current.trim());
        }
    }

    return chunks;
}

// ========== Reranking ==========

export async function rerankResults(query, results, topN, anthropicApiKey) {
    if (results.length <= topN) return results;

    try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: anthropicApiKey });

        const numbered = results.map((r, i) =>
            `[${i}] (score: ${Math.round(r.score * 100)}%) ${(r.metadata?.title || r.metadata?.channel || '')} — ${(r.data || '').slice(0, 300)}`
        ).join('\n');

        const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [{ role: 'user', content: `Given the search query: "${query}"

Rate each result's relevance (0-10) to answering this query. Return ONLY a JSON array of indices sorted by relevance, most relevant first. Include only results scoring 4+.

Results:
${numbered}

Respond with ONLY a JSON array like [2,0,5]` }]
        });

        const text = response.content[0]?.text || '[]';
        const indices = JSON.parse(text.match(/\[[\d,\s]*\]/)?.[0] || '[]');
        return indices.slice(0, topN).map(i => results[i]).filter(Boolean);
    } catch (err) {
        console.error('Reranking failed, returning original results:', err.message);
        return results.slice(0, topN);
    }
}

export function chunkTownHall(analysis, { maxSectionChars = 3000 } = {}) {
    if (!analysis) return [];
    const title = analysis.title || 'Unknown Town Hall';
    const date = analysis.space_date || 'unknown date';
    const prefix = `${title} (${date})`;

    const text = typeof analysis === 'string' ? analysis :
        (analysis.analysis || analysis.content || JSON.stringify(analysis));

    // Split by section headers (lines starting with ## or **Section**)
    const sections = text.split(/\n(?=#{1,3}\s|(?:\*\*[A-Z]))/);
    const chunks = [];

    for (const section of sections) {
        if (!section.trim()) continue;

        // Extract section name from first line
        const firstLine = section.split('\n')[0].trim();
        const sectionName = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();

        const fullText = `${prefix} — ${sectionName}\n\n${section.trim()}`;

        if (fullText.length <= maxSectionChars) {
            chunks.push({ text: fullText, section: sectionName });
        } else {
            // Split oversized sections at bullet boundaries
            const lines = section.trim().split('\n');
            let buf = `${prefix} — ${sectionName}\n\n`;
            let partIndex = 0;

            for (const line of lines) {
                if (buf.length + line.length + 1 > maxSectionChars && buf.length > prefix.length + sectionName.length + 10) {
                    chunks.push({ text: buf.trim(), section: `${sectionName} (part ${partIndex + 1})` });
                    buf = `${prefix} — ${sectionName} (continued)\n\n`;
                    partIndex++;
                }
                buf += line + '\n';
            }
            if (buf.trim().length > prefix.length + 10) {
                chunks.push({ text: buf.trim(), section: partIndex > 0 ? `${sectionName} (part ${partIndex + 1})` : sectionName });
            }
        }
    }

    return chunks;
}
