import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import {
    makeWallet, makeRetryReleaseRequest,
    createEscrowedOffer, storeOffer,
} from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

let mockReleaseToReceiver = vi.fn().mockResolvedValue('mockReleaseTx');
let mockReleaseToInitiator = vi.fn().mockResolvedValue('mockReleaseTx');

vi.mock('../../../lib/swap-utils.js', async () => {
    const actual = await vi.importActual('../../../lib/swap-utils.js');
    return {
        ...actual,
        releaseEscrowToReceiver: (...args) => mockReleaseToReceiver(...args),
        releaseEscrowToInitiator: (...args) => mockReleaseToInitiator(...args),
    };
});

const { default: handler } = await import('../../../api/swap/retry-release.js');

describe('retry-release-failures: failure simulation tests', () => {
    let initiator, receiver;
    const offerId = 'offer_' + 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('mockReleaseTx');
        mockReleaseToInitiator = vi.fn().mockResolvedValue('mockReleaseTx');
    });

    function setupEscrowedOffer(overrides = {}) {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            ...overrides,
        });
        storeOffer(mockKV, offer);
        return offer;
    }

    it('completes Phase 1 but records Phase 2 failure', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        mockReleaseToReceiver = vi.fn().mockResolvedValue('receiverTx');
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('Phase 2 failed'));

        const body = makeRetryReleaseRequest(initiator, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('escrowed');
        expect(res.data.releaseErrors).toHaveLength(1);
        expect(res.data.releaseErrors[0].phase).toBe('releaseToInitiator');
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.releaseToInitiatorComplete).toBe(false);
    });

    it('completes both retries successfully', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });

        const body = makeRetryReleaseRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
        expect(saved.retryCount).toBe(1);
    });

    it('returns 409 on lock contention', async () => {
        setupEscrowedOffer();
        mockKV.set(`lock:offer:${offerId}`, JSON.stringify({ locked: true }));

        const body = makeRetryReleaseRequest(initiator, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
    });

    it('skips already-completed phases and marks completed', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: true,
            releaseToInitiatorComplete: true,
        });

        const body = { offerId, secret: ADMIN_SECRET };
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
        // Neither release function should be called
        expect(mockReleaseToReceiver).not.toHaveBeenCalled();
        expect(mockReleaseToInitiator).not.toHaveBeenCalled();
    });

    it('retries only Phase 2 when Phase 1 already complete', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: true,
            releaseToInitiatorComplete: false,
        });

        const body = { offerId, secret: ADMIN_SECRET };
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
        expect(mockReleaseToReceiver).not.toHaveBeenCalled();
        expect(mockReleaseToInitiator).toHaveBeenCalled();
    });

    it('rejects non-escrowed offers', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            status: 'pending', // override to pending
        });
        storeOffer(mockKV, offer);

        const body = { offerId, secret: ADMIN_SECRET };
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain("not 'escrowed'");
    });

    it('increments retry count on each attempt', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
            retryCount: 3,
        });

        const body = { offerId, secret: ADMIN_SECRET };
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.retryCount).toBe(4);
    });

    it('both phases fail - stays escrowed with errors', async () => {
        setupEscrowedOffer({
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        mockReleaseToReceiver = vi.fn().mockRejectedValue(new Error('fail1'));
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('fail2'));

        const body = { offerId, secret: ADMIN_SECRET };
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('escrowed');
        expect(res.data.releaseErrors).toHaveLength(2);
    });
});
