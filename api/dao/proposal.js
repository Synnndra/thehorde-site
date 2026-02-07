// Vercel Serverless Function - Get Single DAO Proposal Detail (with check-on-read)
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
    const limited = await isRateLimitedKV(ip, 'dao-proposal', 30, 60000, kvUrl, kvToken);
    if (limited) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const proposalId = req.query?.id;
    if (!proposalId || typeof proposalId !== 'string' || !proposalId.startsWith('prop_')) {
        return res.status(400).json({ error: 'Invalid proposal ID' });
    }

    // Check-on-read: close if expired
    await closeExpiredProposal(proposalId, kvUrl, kvToken);

    const proposal = await kvGet(`dao:proposal:${proposalId}`, kvUrl, kvToken);
    if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
    }

    // Compute vote tallies
    const forVotes = proposal.votes.filter(v => v.choice === 'for').reduce((s, v) => s + v.weight, 0);
    const againstVotes = proposal.votes.filter(v => v.choice === 'against').reduce((s, v) => s + v.weight, 0);

    return res.status(200).json({
        proposal: {
            id: proposal.id,
            title: proposal.title,
            description: proposal.description,
            creator: proposal.creator,
            creatorOrcCount: proposal.creatorOrcCount,
            status: proposal.status,
            createdAt: proposal.createdAt,
            endsAt: proposal.endsAt,
            durationHours: proposal.durationHours,
            quorum: proposal.quorum,
            forVotes,
            againstVotes,
            totalVoters: proposal.votes.length,
            result: proposal.result,
            closedAt: proposal.closedAt,
            votes: proposal.votes.map(v => ({
                wallet: v.wallet,
                choice: v.choice,
                weight: v.weight,
                votedAt: v.votedAt
            }))
        }
    });
}
