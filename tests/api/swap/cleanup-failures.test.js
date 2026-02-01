import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import { makeWallet, createPendingOffer, createEscrowedOffer, storeOffer } from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

// Mock escrow operations
let mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');
let mockReleaseEscrowToReceiver = vi.fn().mockResolvedValue('mockReleaseTx');
let mockReleaseEscrowToInitiator = vi.fn().mockResolvedValue('mockReleaseTx');
let mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue(null);
let mockVerifyNftOwnership = vi.fn().mockResolvedValue({ valid: false, issues: [] });

vi.mock('../../../lib/swap-utils.js', async () => {
    const actual = await vi.importActual('../../../lib/swap-utils.js');
    return {
        ...actual,
        returnEscrowToInitiator: (...args) => mockReturnEscrowToInitiator(...args),
        releaseEscrowToReceiver: (...args) => mockReleaseEscrowToReceiver(...args),
        releaseEscrowToInitiator: (...args) => mockReleaseEscrowToInitiator(...args),
        returnReceiverEscrowAssets: (...args) => mockReturnReceiverEscrowAssets(...args),
        verifyNftOwnership: (...args) => mockVerifyNftOwnership(...args),
    };
});

const { default: handler } = await import('../../../api/swap/cleanup-expired.js');

function makeCleanupReq() {
    return createMockReq({ method: 'POST', body: { secret: ADMIN_SECRET } });
}

describe('cleanup-failures: failure simulation tests', () => {
    let initiator, receiver;

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');
        mockReleaseEscrowToReceiver = vi.fn().mockResolvedValue('mockReleaseTx');
        mockReleaseEscrowToInitiator = vi.fn().mockResolvedValue('mockReleaseTx');
        mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue(null);
        mockVerifyNftOwnership = vi.fn().mockResolvedValue({ valid: false, issues: [] });
    });

    it('skips locked expired offer and processes others', async () => {
        const offer1Id = 'offer_' + 'a'.repeat(32);
        const offer2Id = 'offer_' + 'b'.repeat(32);

        const offer1 = createPendingOffer(initiator, receiver, {
            id: offer1Id,
            expiresAt: Date.now() - 1000,
            escrowTxSignature: null,
        });
        const offer2 = createPendingOffer(initiator, receiver, {
            id: offer2Id,
            expiresAt: Date.now() - 1000,
            escrowTxSignature: null,
        });

        storeOffer(mockKV, offer1);
        storeOffer(mockKV, offer2);

        // Lock offer1
        mockKV.set(`lock:offer:${offer1Id}`, JSON.stringify({ locked: true }));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        // offer1 should be skipped (still pending), offer2 should be expired
        const saved1 = JSON.parse(mockKV.store.get(`offer:${offer1Id}`));
        const saved2 = JSON.parse(mockKV.store.get(`offer:${offer2Id}`));
        expect(saved1.status).toBe('pending');
        expect(saved2.status).toBe('expired');
    });

    it('increments expiryRetryCount when escrow return fails', async () => {
        const offerId = 'offer_' + 'c'.repeat(32);
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            expiresAt: Date.now() - 1000,
            escrowTxSignature: 'escrowTx' + 'c'.repeat(40),
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('TX failed'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.expiryRetryCount).toBe(1);
        expect(saved.status).toBe('pending'); // stays pending for retry
    });

    it('marks offer as failed after 10+ retry failures', async () => {
        const offerId = 'offer_' + 'd'.repeat(32);
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            expiresAt: Date.now() - 1000,
            escrowTxSignature: 'escrowTx' + 'd'.repeat(40),
            expiryRetryCount: 10,
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('TX failed'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('failed');
        expect(saved.failedReason).toContain('10 cleanup retries');
    });

    it('completes escrowed offer when Phase 2 retry succeeds (>5min)', async () => {
        const offerId = 'offer_' + 'e'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
            releaseToReceiverComplete: true,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
        expect(saved.releaseToInitiatorComplete).toBe(true);
        expect(res.data.results.escrowCompleted).toBe(1);
    });

    it('increments cleanupRetryCount when Phase 2 retry fails (>5min)', async () => {
        const offerId = 'offer_' + 'f'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 6 * 60 * 1000,
            releaseToReceiverComplete: true,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        mockReleaseEscrowToInitiator = vi.fn().mockRejectedValue(new Error('retry failed'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('escrowed');
        expect(saved.cleanupRetryCount).toBe(1);
        expect(saved.releaseToInitiatorError).toBe('retry failed');
    });

    it('force-returns assets to owners when escrowed >2h', async () => {
        const offerId = 'offer_' + '1'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('failed');
        expect(saved.failedReason).toContain('timed out');
        expect(res.data.results.escrowFailed).toBe(1);
    });

    it('records errors when force-return fails (>2h)', async () => {
        const offerId = 'offer_' + '2'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 3 * 60 * 60 * 1000,
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('return failed'));
        mockReturnReceiverEscrowAssets = vi.fn().mockRejectedValue(new Error('return failed'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        // Status stays escrowed because returns failed
        expect(saved.status).toBe('escrowed');
        expect(saved.returnErrors).toHaveLength(2);
    });

    it('continues processing other offers when one throws', async () => {
        const offer1Id = 'offer_' + '3'.repeat(32);
        const offer2Id = 'offer_' + '4'.repeat(32);

        // Store offer1 as corrupt data that will cause a throw when processing
        // kvGet will return this, but accessing offer.status will work — we need
        // the processing logic to throw. Set expiresAt in the past so it enters
        // the expired block, then acquireLock will work, but accessing offer.id
        // inside the block after lock will throw since we store a broken object.
        mockKV.set(`offer:${offer1Id}`, JSON.stringify({
            status: 'pending',
            expiresAt: Date.now() - 1000,
            escrowTxSignature: 'someTx',
            // Missing id field — accessing offer.id inside cleanup will use undefined
            // but won't throw. Instead, make acquireLock succeed but returnEscrowToInitiator throw
        }));

        const offer2 = createPendingOffer(initiator, receiver, {
            id: offer2Id,
            expiresAt: Date.now() - 1000,
            escrowTxSignature: null,
        });
        storeOffer(mockKV, offer2);

        // Make returnEscrowToInitiator throw to generate an error for offer1
        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('TX failed for offer1'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        // offer2 should still be processed (no escrow TX, so it goes straight to expired)
        const saved2 = JSON.parse(mockKV.store.get(`offer:${offer2Id}`));
        expect(saved2.status).toBe('expired');
        // offer1 should have generated an error from the escrow return failure
        expect(res.data.results.errors.length).toBeGreaterThan(0);
    });

    it('handles cancel-requested offer by retrying escrow return', async () => {
        const offerId = 'offer_' + '5'.repeat(32);
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            cancelRequested: true,
            cancelRequestedBy: initiator.wallet,
            cancelRequestedAction: 'cancel',
            escrowTxSignature: 'escrowTx' + '5'.repeat(40),
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTx');

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('cancelled');
        expect(saved.cancelledByCleanup).toBe(true);
    });

    it('keeps cancel-requested offer as pending when retry fails', async () => {
        const offerId = 'offer_' + '6'.repeat(32);
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            cancelRequested: true,
            cancelRequestedBy: initiator.wallet,
            cancelRequestedAction: 'cancel',
            escrowTxSignature: 'escrowTx' + '6'.repeat(40),
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('retry failed'));

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('pending');
        expect(saved.escrowReturnError).toBe('retry failed');
    });

    it('retries both phases for escrowed offer >5min with neither complete', async () => {
        const offerId = 'offer_' + '7'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 6 * 60 * 1000,
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        expect(mockReleaseEscrowToReceiver).toHaveBeenCalled();
        expect(mockReleaseEscrowToInitiator).toHaveBeenCalled();
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
    });

    it('returns assets to owners after max retries exceeded', async () => {
        const offerId = 'offer_' + '8'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 6 * 60 * 1000,
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
            cleanupRetryCount: 10, // Already at max
        });
        storeOffer(mockKV, offer);

        const res = createMockRes();
        await handler(makeCleanupReq(), res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('failed');
        expect(saved.cleanupRetryCount).toBe(11);
    });
});
