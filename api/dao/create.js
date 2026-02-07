// Vercel Serverless Function - Create DAO Proposal
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
    generateProposalId,
    kvGet,
    kvSet,
    MIN_ORCS_TO_CREATE,
    MAX_TITLE_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    DEFAULT_DURATION_HOURS,
    MAX_DURATION_HOURS,
    MIN_DURATION_HOURS,
    DEFAULT_QUORUM,
    MIN_QUORUM,
    MAX_QUORUM,
    MAX_ACTIVE_PROPOSALS
} from '../../lib/dao-utils.js';

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
    const limited = await isRateLimitedKV(ip, 'dao-create', 5, 300000, kvUrl, kvToken); // 5 per 5 min
    if (limited) {
        return res.status(429).json({ error: 'Too many requests. Please wait before creating another proposal.' });
    }

    const { wallet, signature, message, title, description, durationHours, quorum } = req.body || {};

    // Validate inputs
    if (!wallet || !signature || !message) {
        return res.status(400).json({ error: 'Missing wallet, signature, or message' });
    }
    if (!validateSolanaAddress(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > MAX_TITLE_LENGTH) {
        return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
        return res.status(400).json({ error: 'Description is required' });
    }
    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less` });
    }

    // Validate duration
    const duration = typeof durationHours === 'number' ? durationHours : DEFAULT_DURATION_HOURS;
    if (duration < MIN_DURATION_HOURS || duration > MAX_DURATION_HOURS) {
        return res.status(400).json({ error: `Duration must be between ${MIN_DURATION_HOURS} and ${MAX_DURATION_HOURS} hours` });
    }

    // Validate quorum
    const proposalQuorum = typeof quorum === 'number' ? quorum : DEFAULT_QUORUM;
    if (proposalQuorum < MIN_QUORUM || proposalQuorum > MAX_QUORUM) {
        return res.status(400).json({ error: `Quorum must be between ${MIN_QUORUM} and ${MAX_QUORUM}` });
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

    // Check Orc holdings
    const { orcCount } = await getOrcHoldings(wallet, heliusApiKey);
    if (orcCount < MIN_ORCS_TO_CREATE) {
        return res.status(403).json({ error: `You need at least ${MIN_ORCS_TO_CREATE} Orcs to create a proposal. You have ${orcCount}.` });
    }

    // Check global active proposal cap
    const activeIds = await kvGet('dao:proposals:active', kvUrl, kvToken) || [];
    if (activeIds.length >= MAX_ACTIVE_PROPOSALS) {
        return res.status(400).json({ error: 'Maximum active proposals reached. Please wait for some to close.' });
    }

    // Mark signature used
    await markSignatureUsed(signature, kvUrl, kvToken);

    // Create proposal
    const proposalId = generateProposalId();
    const proposal = {
        id: proposalId,
        title: title.trim(),
        description: description.trim(),
        creator: wallet,
        creatorOrcCount: orcCount,
        status: 'active',
        createdAt: now,
        endsAt: now + (duration * 60 * 60 * 1000),
        durationHours: duration,
        quorum: proposalQuorum,
        votes: [],
        forVotes: 0,
        againstVotes: 0,
        result: null,
        closedAt: null
    };

    // Store proposal
    await kvSet(`dao:proposal:${proposalId}`, proposal, kvUrl, kvToken);

    // Add to active list
    activeIds.unshift(proposalId);
    await kvSet('dao:proposals:active', activeIds, kvUrl, kvToken);

    // Track per-wallet proposals
    const walletProposals = await kvGet(`wallet:${wallet}:proposals`, kvUrl, kvToken) || [];
    walletProposals.unshift(proposalId);
    await kvSet(`wallet:${wallet}:proposals`, walletProposals, kvUrl, kvToken);

    return res.status(200).json({
        success: true,
        proposalId,
        proposal: {
            id: proposal.id,
            title: proposal.title,
            status: proposal.status,
            createdAt: proposal.createdAt,
            endsAt: proposal.endsAt,
            quorum: proposal.quorum
        }
    });
}
