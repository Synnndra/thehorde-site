// Vercel Serverless Function - Cast DAO Vote
import {
    isRateLimitedKV,
    getClientIp,
    validateSolanaAddress,
    verifySignature,
    isSignatureUsed,
    markSignatureUsed
} from '../../lib/swap-utils.js';

import {
    getOrcHoldings,
    closeExpiredProposal,
    daoAcquireLock,
    daoReleaseLock,
    kvGet,
    kvSet,
    MIN_ORCS_TO_VOTE
} from '../../lib/dao-utils.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const heliusApiKey = process.env.HELIUS_API_KEY;

    if (!kvUrl || !kvToken) {
        return res.status(503).json({ error: 'Service unavailable' });
    }

    // Rate limit
    const ip = getClientIp(req);
    const limited = await isRateLimitedKV(ip, 'dao-vote', 10, 60000, kvUrl, kvToken);
    if (limited) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { wallet, signature, message, proposalId, choice } = req.body || {};

    // Validate inputs
    if (!wallet || !signature || !message || !proposalId || !choice) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!validateSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    if (!proposalId.startsWith('prop_')) {
        return res.status(400).json({ error: 'Invalid proposal ID' });
    }
    if (choice !== 'for' && choice !== 'against') {
        return res.status(400).json({ error: 'Choice must be "for" or "against"' });
    }

    // Verify message timestamp
    const timestampMatch = message.match(/at (\d+)$/);
    if (!timestampMatch) {
        return res.status(400).json({ error: 'Invalid message format' });
    }
    const messageTimestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();
    if (now - messageTimestamp > 5 * 60 * 1000) {
        return res.status(400).json({ error: 'Message expired - please try again' });
    }
    if (messageTimestamp > now + 60000) {
        return res.status(400).json({ error: 'Invalid message timestamp' });
    }

    // Verify signature
    if (!verifySignature(message, signature, wallet)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check replay
    const sigUsed = await isSignatureUsed(signature, kvUrl, kvToken);
    if (sigUsed) {
        return res.status(400).json({ error: 'Signature already used' });
    }

    // Check-on-read: close if expired before accepting vote
    const closedResult = await closeExpiredProposal(proposalId, kvUrl, kvToken);
    if (closedResult) {
        return res.status(400).json({ error: 'This proposal has ended', result: closedResult.result });
    }

    // Check Orc holdings
    const { orcCount, orcMints } = await getOrcHoldings(wallet, heliusApiKey);
    if (orcCount < MIN_ORCS_TO_VOTE) {
        return res.status(403).json({ error: 'You need at least 1 Orc to vote' });
    }

    // Check wallet hasn't already voted
    const alreadyVoted = await kvGet(`dao:voted:${proposalId}:${wallet}`, kvUrl, kvToken);
    if (alreadyVoted) {
        return res.status(400).json({ error: 'You have already voted on this proposal' });
    }

    // Transfer protection: check if any of this wallet's Orcs already voted via a different wallet
    const votedOrcs = await kvGet(`dao:voted_orcs:${proposalId}`, kvUrl, kvToken) || [];
    const alreadyUsedOrcs = orcMints.filter(mint => votedOrcs.includes(mint));
    const eligibleOrcs = orcMints.filter(mint => !votedOrcs.includes(mint));

    if (eligibleOrcs.length === 0) {
        return res.status(400).json({ error: 'All your Orcs have already been used to vote on this proposal (transfer protection)' });
    }

    // Acquire lock for vote recording
    const { acquired, lockKey } = await daoAcquireLock(proposalId, kvUrl, kvToken);
    if (!acquired) {
        return res.status(409).json({ error: 'Vote is being processed, please try again' });
    }

    try {
        // Re-fetch proposal under lock
        const proposal = await kvGet(`dao:proposal:${proposalId}`, kvUrl, kvToken);
        if (!proposal) {
            return res.status(404).json({ error: 'Proposal not found' });
        }
        if (proposal.status !== 'active') {
            return res.status(400).json({ error: 'Proposal is no longer active' });
        }
        if (Date.now() >= proposal.endsAt) {
            return res.status(400).json({ error: 'Proposal has expired' });
        }

        // Double-check under lock
        const doubleCheck = proposal.votes.find(v => v.wallet === wallet);
        if (doubleCheck) {
            return res.status(400).json({ error: 'You have already voted on this proposal' });
        }

        // Record vote (weight = eligible orcs only)
        const weight = eligibleOrcs.length;
        proposal.votes.push({
            wallet,
            choice,
            weight,
            orcMints: eligibleOrcs,
            votedAt: now
        });

        // Update tallies
        proposal.forVotes = proposal.votes.filter(v => v.choice === 'for').reduce((s, v) => s + v.weight, 0);
        proposal.againstVotes = proposal.votes.filter(v => v.choice === 'against').reduce((s, v) => s + v.weight, 0);

        // Save proposal
        await kvSet(`dao:proposal:${proposalId}`, proposal, kvUrl, kvToken);

        // Mark wallet as voted
        await kvSet(`dao:voted:${proposalId}:${wallet}`, { votedAt: now, choice, weight }, kvUrl, kvToken);

        // Record Orc mints used (transfer protection)
        const updatedVotedOrcs = [...votedOrcs, ...eligibleOrcs];
        await kvSet(`dao:voted_orcs:${proposalId}`, updatedVotedOrcs, kvUrl, kvToken);

        // Mark signature used (after all writes succeed to prevent wasted signatures on failure)
        await markSignatureUsed(signature, kvUrl, kvToken);

        return res.status(200).json({
            success: true,
            vote: { choice, weight, eligibleOrcs: eligibleOrcs.length, skippedOrcs: alreadyUsedOrcs.length },
            forVotes: proposal.forVotes,
            againstVotes: proposal.againstVotes,
            totalVoters: proposal.votes.length
        });
    } finally {
        await daoReleaseLock(lockKey, kvUrl, kvToken);
    }
}
