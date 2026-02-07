// Vercel Serverless Function - List DAO Proposals (with check-on-read)
import {
    isRateLimitedKV,
    getClientIp
} from '../../lib/swap-utils.js';

import {
    closeExpiredProposal,
    kvGet
} from '../../lib/dao-utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
        return res.status(503).json({ error: 'Service unavailable' });
    }

    // Rate limit
    const ip = getClientIp(req);
    const limited = await isRateLimitedKV(ip, 'dao-proposals', 30, 60000, kvUrl, kvToken);
    if (limited) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const filter = req.query?.filter || 'all'; // 'all', 'active', 'closed'

    // Fetch active and closed ID lists
    const [activeIds, closedIds] = await Promise.all([
        kvGet('dao:proposals:active', kvUrl, kvToken).then(r => r || []),
        kvGet('dao:proposals:closed', kvUrl, kvToken).then(r => r || [])
    ]);

    // Check-on-read: close any expired active proposals
    for (const id of activeIds) {
        await closeExpiredProposal(id, kvUrl, kvToken);
    }

    // Re-fetch lists after potential closings
    const [freshActiveIds, freshClosedIds] = await Promise.all([
        kvGet('dao:proposals:active', kvUrl, kvToken).then(r => r || []),
        kvGet('dao:proposals:closed', kvUrl, kvToken).then(r => r || [])
    ]);

    // Determine which IDs to fetch
    let idsToFetch;
    if (filter === 'active') {
        idsToFetch = freshActiveIds;
    } else if (filter === 'closed') {
        idsToFetch = freshClosedIds.slice(0, 50); // Limit closed to most recent 50
    } else {
        idsToFetch = [...freshActiveIds, ...freshClosedIds.slice(0, 50)];
    }

    // Fetch all proposals in parallel
    const proposals = await Promise.all(
        idsToFetch.map(id => kvGet(`dao:proposal:${id}`, kvUrl, kvToken))
    );

    // Build summary response (no full vote arrays for list view)
    const summaries = proposals
        .filter(Boolean)
        .map(p => ({
            id: p.id,
            title: p.title,
            creator: p.creator,
            status: p.status,
            createdAt: p.createdAt,
            endsAt: p.endsAt,
            quorum: p.quorum,
            forVotes: p.forVotes || p.votes.filter(v => v.choice === 'for').reduce((s, v) => s + v.weight, 0),
            againstVotes: p.againstVotes || p.votes.filter(v => v.choice === 'against').reduce((s, v) => s + v.weight, 0),
            totalVoters: p.votes.length,
            result: p.result
        }));

    return res.status(200).json({
        proposals: summaries,
        activeCount: freshActiveIds.length,
        closedCount: freshClosedIds.length
    });
}
