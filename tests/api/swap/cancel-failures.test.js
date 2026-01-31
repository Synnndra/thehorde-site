import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import {
    makeWallet, makeCancelRequest, makeAcceptRequest,
    createPendingOffer, storeOffer,
} from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

// Mock escrow return function
let mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');

vi.mock('../../../api/swap/utils.js', async () => {
    const actual = await vi.importActual('../../../api/swap/utils.js');
    return {
        ...actual,
        returnEscrowToInitiator: (...args) => mockReturnEscrowToInitiator(...args),
    };
});

const { default: handler } = await import('../../../api/swap/cancel.js');

describe('cancel-failures: failure simulation tests', () => {
    let initiator, receiver;
    const offerId = 'offer_' + 'c'.repeat(32);

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');
    });

    function setupOffer(overrides = {}) {
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            escrowTxSignature: 'escrowTx' + 'c'.repeat(40),
            ...overrides,
        });
        storeOffer(mockKV, offer);
        return offer;
    }

    it('marks offer as cancelRequested when escrow return TX fails', async () => {
        setupOffer();
        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('TX send failed'));

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.escrowReturnPending).toBe(true);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.cancelRequested).toBe(true);
        expect(saved.status).toBe('pending'); // NOT cancelled
    });

    it('cancels successfully when escrow return succeeds', async () => {
        setupOffer();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTxSig123');

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offer.status).toBe('cancelled');
        expect(res.data.escrowReturnTx).toBe('returnTxSig123');
    });

    it('returns 409 when lock is held', async () => {
        setupOffer();
        mockKV.set(`lock:offer:${offerId}`, JSON.stringify({ locked: true }));

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
    });

    it('returns 400 when offer is already completed', async () => {
        setupOffer({ status: 'completed' });

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('no longer pending');
    });

    it('returns 200 but offer not persisted as cancelled when KV save fails', async () => {
        setupOffer();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTx');

        // Fail the KV save for the offer — kvSet logs error but doesn't throw
        mockKV.failOn('set', 'offer:*', { countdown: 1 });

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // kvSet doesn't throw, so handler returns 200
        expect(res.statusCode).toBe(200);
        // But the offer is not updated in KV (set failed silently)
        // The original offer was stored with status 'pending' and the failed set means
        // the cancelled version wasn't saved — original pending version remains
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('pending');
        // Lock should be released
        expect(mockKV.store.has(`lock:offer:${offerId}`)).toBe(false);
    });

    it('handles decline from receiver correctly', async () => {
        setupOffer();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTx');

        const body = makeCancelRequest(receiver, offerId, 'decline');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offer.status).toBe('cancelled');
        expect(res.data.offer.cancelAction).toBe('decline');
    });

    it('cancels offer with no escrow TX without calling return function', async () => {
        setupOffer({ escrowTxSignature: null });

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offer.status).toBe('cancelled');
        expect(mockReturnEscrowToInitiator).not.toHaveBeenCalled();
    });

    it('releases lock in catch block on unexpected error', async () => {
        setupOffer();
        // Fail the offer fetch to trigger catch
        mockKV.failOnce('get', 'offer:*');

        const body = makeCancelRequest(initiator, offerId, 'cancel');
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // Lock should be released regardless
        expect(mockKV.store.has(`lock:offer:${offerId}`)).toBe(false);
    });
});
