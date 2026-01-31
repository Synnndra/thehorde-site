import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import {
    makeWallet, makeCreateRequest, makeAcceptRequest,
    makeCancelRequest, setupCreateEscrowTx, storeOffer,
    createEscrowedOffer,
} from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

// Mock escrow operations for all handlers
let mockReleaseToReceiver = vi.fn().mockResolvedValue('releaseTxR');
let mockReleaseToInitiator = vi.fn().mockResolvedValue('releaseTxI');
let mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTx');
let mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue(null);
let mockVerifyNftOwnership = vi.fn().mockResolvedValue({ valid: false, issues: [] });

vi.mock('../../../api/swap/utils.js', async () => {
    const actual = await vi.importActual('../../../api/swap/utils.js');
    return {
        ...actual,
        releaseEscrowToReceiver: (...args) => mockReleaseToReceiver(...args),
        releaseEscrowToInitiator: (...args) => mockReleaseToInitiator(...args),
        returnEscrowToInitiator: (...args) => mockReturnEscrowToInitiator(...args),
        returnReceiverEscrowAssets: (...args) => mockReturnReceiverEscrowAssets(...args),
        verifyNftOwnership: (...args) => mockVerifyNftOwnership(...args),
    };
});

const { default: createHandler } = await import('../../../api/swap/create.js');
const { default: acceptHandler } = await import('../../../api/swap/accept.js');
const { default: cancelHandler } = await import('../../../api/swap/cancel.js');
const { default: cleanupHandler } = await import('../../../api/swap/cleanup-expired.js');
const { default: retryReleaseHandler } = await import('../../../api/swap/retry-release.js');

describe('e2e-lifecycle: end-to-end lifecycle tests', () => {
    let initiator, receiver;

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('releaseTxR');
        mockReleaseToInitiator = vi.fn().mockResolvedValue('releaseTxI');
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('returnTx');
        mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue(null);
        mockVerifyNftOwnership = vi.fn().mockResolvedValue({ valid: false, issues: [] });
    });

    it('happy path: create → accept → completed', async () => {
        // Create
        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);

        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        expect(createRes.statusCode).toBe(200);
        const offerId = createRes.data.offerId;

        // Accept — receiver has 0.5 SOL to send, so provide a valid receiver TX
        const recvTxSig = 'recvEscrowTx' + Math.random().toString(36).slice(2).padEnd(36, '0');
        setupCreateEscrowTx(mockHelius, recvTxSig, receiver.wallet, 0.5, 0);
        const acceptBody = makeAcceptRequest(receiver, offerId, { txSignature: recvTxSig });
        const acceptReq = createMockReq({ body: acceptBody });
        const acceptRes = createMockRes();
        await acceptHandler(acceptReq, acceptRes);
        expect(acceptRes.statusCode).toBe(200);
        expect(acceptRes.data.status).toBe('completed');

        // Verify final state
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.releaseToInitiatorComplete).toBe(true);
    });

    it('create → cancel → cancelled', async () => {
        // Create
        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);

        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        expect(createRes.statusCode).toBe(200);
        const offerId = createRes.data.offerId;

        // Cancel
        const cancelBody = makeCancelRequest(initiator, offerId, 'cancel');
        const cancelReq = createMockReq({ body: cancelBody });
        const cancelRes = createMockRes();
        await cancelHandler(cancelReq, cancelRes);
        expect(cancelRes.statusCode).toBe(200);
        expect(cancelRes.data.offer.status).toBe('cancelled');
    });

    it('create → expire → cleanup marks expired', async () => {
        // Create offer that is already expired
        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);

        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        expect(createRes.statusCode).toBe(200);
        const offerId = createRes.data.offerId;

        // Manually expire the offer
        const offer = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        offer.expiresAt = Date.now() - 1000;
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        // Run cleanup
        const cleanupReq = createMockReq({ method: 'POST', body: { secret: ADMIN_SECRET } });
        const cleanupRes = createMockRes();
        await cleanupHandler(cleanupReq, cleanupRes);
        expect(cleanupRes.statusCode).toBe(200);
        expect(cleanupRes.data.results.expired).toBeGreaterThanOrEqual(1);

        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('expired');
    });

    it('accept Phase 2 fails → retry-release → completed', async () => {
        // Create
        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);

        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        expect(createRes.statusCode).toBe(200);
        const offerId = createRes.data.offerId;

        // Accept with Phase 2 failure — receiver has 0.5 SOL, so provide TX
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('Phase 2 TX failed'));
        const recvTxSig = 'recvEscrowTx' + Math.random().toString(36).slice(2).padEnd(36, '0');
        setupCreateEscrowTx(mockHelius, recvTxSig, receiver.wallet, 0.5, 0);
        const acceptBody = makeAcceptRequest(receiver, offerId, { txSignature: recvTxSig });
        const acceptReq = createMockReq({ body: acceptBody });
        const acceptRes = createMockRes();
        await acceptHandler(acceptReq, acceptRes);
        expect(acceptRes.statusCode).toBe(200);
        expect(acceptRes.data.status).toBe('escrowed');

        // Retry release (as admin) - Phase 2 now succeeds
        mockReleaseToInitiator = vi.fn().mockResolvedValue('retryReleaseTx');
        const retryBody = { offerId, secret: ADMIN_SECRET };
        const retryReq = createMockReq({ body: retryBody });
        const retryRes = createMockRes();
        await retryReleaseHandler(retryReq, retryRes);
        expect(retryRes.statusCode).toBe(200);
        expect(retryRes.data.status).toBe('completed');
    });

    it('accept both phases fail → cleanup retry → completed', async () => {
        // Set up an escrowed offer directly (simulating accept that failed both phases)
        const offerId = 'offer_' + 'e'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 6 * 60 * 1000, // 6 min ago
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        // Run cleanup - both phases succeed now
        const cleanupReq = createMockReq({ method: 'POST', body: { secret: ADMIN_SECRET } });
        const cleanupRes = createMockRes();
        await cleanupHandler(cleanupReq, cleanupRes);
        expect(cleanupRes.statusCode).toBe(200);
        expect(cleanupRes.data.results.escrowCompleted).toBe(1);

        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
    });

    it('accept both fail → cleanup force-return after 2h', async () => {
        const offerId = 'offer_' + 'f'.repeat(32);
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            escrowedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
            releaseToReceiverComplete: false,
            releaseToInitiatorComplete: false,
        });
        storeOffer(mockKV, offer);

        const cleanupReq = createMockReq({ method: 'POST', body: { secret: ADMIN_SECRET } });
        const cleanupRes = createMockRes();
        await cleanupHandler(cleanupReq, cleanupRes);
        expect(cleanupRes.statusCode).toBe(200);
        expect(cleanupRes.data.results.escrowFailed).toBe(1);

        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('failed');
        expect(saved.failedReason).toContain('timed out');
    });

    it('verifies KV operation ordering during create', async () => {
        mockKV.clearCallLog();

        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);

        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        expect(createRes.statusCode).toBe(200);

        const log = mockKV.getCallLog();
        const methods = log.map(l => l.method);

        // Should contain: rate limit, signature check, active offer count,
        // escrow claim (pipeline), offer save (set), wallet list updates (set)
        expect(methods).toContain('pipeline'); // escrow claim
        expect(methods).toContain('set');      // offer save

        // Pipeline (escrow claim) should come before the offer set
        const pipelineIdx = methods.indexOf('pipeline');
        const offerSetIdx = methods.findIndex((m, i) =>
            m === 'set' && log[i].key.startsWith('offer:') && i > pipelineIdx
        );
        expect(offerSetIdx).toBeGreaterThan(pipelineIdx);
    });

    it('verifies accept checkpoint ordering', async () => {
        // Create offer first
        const createBody = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, createBody.escrowTxSignature, initiator.wallet);
        mockHelius.setAssetsForOwner(initiator.wallet, []);
        const createReq = createMockReq({ body: createBody });
        const createRes = createMockRes();
        await createHandler(createReq, createRes);
        const offerId = createRes.data.offerId;

        mockKV.clearCallLog();

        // Accept — receiver has 0.5 SOL, provide TX
        const recvTxSig = 'recvEscrowTx' + Math.random().toString(36).slice(2).padEnd(36, '0');
        setupCreateEscrowTx(mockHelius, recvTxSig, receiver.wallet, 0.5, 0);
        const acceptBody = makeAcceptRequest(receiver, offerId, { txSignature: recvTxSig });
        const acceptReq = createMockReq({ body: acceptBody });
        const acceptRes = createMockRes();
        await acceptHandler(acceptReq, acceptRes);
        expect(acceptRes.statusCode).toBe(200);

        const log = mockKV.getCallLog();
        // Find offer set calls — should have escrowed checkpoint, phase 1 save, final save
        const offerSets = log.filter(l => l.method === 'set' && l.key.startsWith('offer:'));
        expect(offerSets.length).toBeGreaterThanOrEqual(3);
    });
});
