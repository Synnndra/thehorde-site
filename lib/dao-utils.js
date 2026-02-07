// Shared utilities for DAO voting endpoints
import { randomBytes } from 'crypto';
import {
    kvGet,
    kvSet,
    kvDelete,
    cleanApiKey
} from './swap-utils.js';

// ========== Constants ==========

export const ORC_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
export const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

export const MIN_ORCS_TO_CREATE = 3;       // Must hold 3+ Orcs to create a proposal
export const MIN_ORCS_TO_VOTE = 1;         // Must hold 1+ Orc to vote
export const DEFAULT_DURATION_HOURS = 72;  // 3 days
export const MAX_DURATION_HOURS = 72;      // 3 days
export const MIN_DURATION_HOURS = 24;      // 1 day
export const DEFAULT_QUORUM = 33;          // ~10% of 326 Orcs
export const MIN_QUORUM = 5;
export const MAX_QUORUM = 100;
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_ACTIVE_PROPOSALS = 20;    // Global cap on active proposals
export const LOCK_TTL_SECONDS = 30;        // Short lock for proposal state changes

// ========== ID Generation ==========

export function generateProposalId() {
    return `prop_${randomBytes(16).toString('hex')}`;
}

// ========== Orc Holdings ==========

export async function getOrcHoldings(wallet, apiKey) {
    apiKey = cleanApiKey(apiKey);
    if (!apiKey) return { orcCount: 0, orcMints: [] };

    try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'orc-holdings',
                method: 'getAssetsByOwner',
                params: { ownerAddress: wallet, page: 1, limit: 1000 }
            })
        });

        const data = await response.json();
        const items = data.result?.items || [];

        const orcMints = [];
        for (const item of items) {
            const collections = (item.grouping || [])
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            const isMidEvil = collections.includes(ORC_COLLECTION);
            const isGraveyard = collections.includes(GRAVEYARD_COLLECTION);
            const name = (item.content?.metadata?.name || '').toLowerCase();
            const isBurnt = item.burnt === true;

            if (isMidEvil && !isGraveyard && !isBurnt && name.includes('orc')) {
                orcMints.push(item.id);
            }
        }

        return { orcCount: orcMints.length, orcMints };
    } catch (err) {
        console.error('Error fetching Orc holdings:', err);
        return { orcCount: 0, orcMints: [] };
    }
}

// ========== Distributed Lock ==========

export async function daoAcquireLock(proposalId, kvUrl, kvToken) {
    const lockKey = `lock:dao:proposal:${proposalId}`;
    try {
        const res = await fetch(kvUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kvToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(['SET', lockKey, JSON.stringify({ locked: true, at: Date.now() }), 'EX', LOCK_TTL_SECONDS, 'NX'])
        });
        const data = await res.json();
        return { acquired: !!data.result, lockKey };
    } catch (err) {
        console.error('DAO lock acquire error:', err);
        return { acquired: false, lockKey };
    }
}

export async function daoReleaseLock(lockKey, kvUrl, kvToken) {
    await kvDelete(lockKey, kvUrl, kvToken);
}

// ========== Check-on-Read: Close Expired Proposals ==========

export async function closeExpiredProposal(proposalId, kvUrl, kvToken) {
    const proposal = await kvGet(`dao:proposal:${proposalId}`, kvUrl, kvToken);
    if (!proposal || proposal.status !== 'active') return null;
    if (Date.now() < proposal.endsAt) return null; // Not expired

    // Acquire lock to prevent double-close
    const { acquired, lockKey } = await daoAcquireLock(proposalId, kvUrl, kvToken);
    if (!acquired) return null; // Another instance is closing it

    try {
        // Re-fetch under lock
        const fresh = await kvGet(`dao:proposal:${proposalId}`, kvUrl, kvToken);
        if (!fresh || fresh.status !== 'active') return null;
        if (Date.now() < fresh.endsAt) return null;

        // Tally votes
        const forVotes = fresh.votes.filter(v => v.choice === 'for').reduce((sum, v) => sum + v.weight, 0);
        const againstVotes = fresh.votes.filter(v => v.choice === 'against').reduce((sum, v) => sum + v.weight, 0);
        const totalVotes = forVotes + againstVotes;

        let result;
        if (totalVotes < fresh.quorum) {
            result = 'expired'; // Didn't reach quorum
        } else if (forVotes > againstVotes) {
            result = 'passed';
        } else {
            result = 'rejected';
        }

        fresh.status = 'closed';
        fresh.result = result;
        fresh.closedAt = Date.now();
        fresh.forVotes = forVotes;
        fresh.againstVotes = againstVotes;

        // Save updated proposal
        await kvSet(`dao:proposal:${proposalId}`, fresh, kvUrl, kvToken);

        // Move from active to closed list
        const activeIds = await kvGet('dao:proposals:active', kvUrl, kvToken) || [];
        const closedIds = await kvGet('dao:proposals:closed', kvUrl, kvToken) || [];

        const newActive = activeIds.filter(id => id !== proposalId);
        closedIds.unshift(proposalId);

        await kvSet('dao:proposals:active', newActive, kvUrl, kvToken);
        await kvSet('dao:proposals:closed', closedIds, kvUrl, kvToken);

        return fresh;
    } finally {
        await daoReleaseLock(lockKey, kvUrl, kvToken);
    }
}

// Re-export KV helpers for convenience
export { kvGet, kvSet, kvDelete } from './swap-utils.js';
