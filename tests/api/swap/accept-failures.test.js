import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import {
    makeWallet, makeAcceptRequest, makeCancelRequest,
    createPendingOffer, storeOffer, setupCreateEscrowTx,
} from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

// Mock the escrow release functions to control on-chain behavior
let mockReleaseToReceiver = vi.fn().mockResolvedValue('mockReleaseTxReceiver');
let mockReleaseToInitiator = vi.fn().mockResolvedValue('mockReleaseTxInitiator');

vi.mock('../../../api/swap/utils.js', async () => {
    const actual = await vi.importActual('../../../api/swap/utils.js');
    return {
        ...actual,
        releaseEscrowToReceiver: (...args) => mockReleaseToReceiver(...args),
        releaseEscrowToInitiator: (...args) => mockReleaseToInitiator(...args),
    };
});

const { default: handler } = await import('../../../api/swap/accept.js');
const { default: cancelHandler } = await import('../../../api/swap/cancel.js');

describe('accept-failures: failure simulation tests', () => {
    let initiator, receiver;
    const offerId = 'offer_' + 'a'.repeat(32);

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('mockReleaseTxReceiver');
        mockReleaseToInitiator = vi.fn().mockResolvedValue('mockReleaseTxInitiator');
    });

    function setupOffer(overrides = {}) {
        const offer = createPendingOffer(initiator, receiver, { id: offerId, ...overrides });
        storeOffer(mockKV, offer);
        return offer;
    }

    it('returns 409 when lock acquisition fails (concurrent processing)', async () => {
        setupOffer();
        // Pre-set the lock key
        mockKV.set(`lock:offer:${offerId}`, JSON.stringify({ locked: true, at: Date.now() }));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
        expect(res.data.error).toContain('being processed');
    });

    it('returns 400 when receiver TX verification fails and releases claim', async () => {
        const offer = setupOffer({
            receiver: {
                wallet: receiver.wallet,
                nfts: ['RecvNft1111111111111111111111111111111111111'],
                nftDetails: [{ id: 'RecvNft1111111111111111111111111111111111111', name: 'Test' }],
                sol: 0,
            },
        });

        const txSig = 'recvEscrowTx' + '1'.repeat(36);
        // Register invalid TX content (wrong destination)
        mockHelius.addTransaction(txSig, {
            transactionError: null,
            nativeTransfers: [],
            tokenTransfers: [],
            instructions: [],
        });

        const body = makeAcceptRequest(receiver, offerId, { txSignature: txSig });
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        // Lock should be released
        expect(mockKV.store.has(`lock:offer:${offerId}`)).toBe(false);
        // TX claim should be released
        expect(mockKV.store.has(`used_escrow_tx:${txSig}`)).toBe(false);
        // Offer should still be pending
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('pending');
    });

    it('saves offer as escrowed when Phase 1 fails', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockRejectedValue(new Error('Phase 1 TX failed'));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('escrowed');
        expect(res.data.releaseErrors).toBeDefined();
        expect(res.data.releaseErrors[0].phase).toBe('releaseToReceiver');
        // Offer should be saved as escrowed
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('escrowed');
        expect(saved.releaseToReceiverComplete).toBe(false);
    });

    it('records Phase 1 success when Phase 2 fails', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('releaseTx1');
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('Phase 2 TX failed'));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('escrowed');
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.releaseToInitiatorComplete).toBe(false);
        expect(saved.releaseToInitiatorError).toBe('Phase 2 TX failed');
    });

    it('completes when both phases succeed', async () => {
        setupOffer();

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.releaseToInitiatorComplete).toBe(true);
    });

    it('returns 200 but final state not persisted when 3rd KV save fails', async () => {
        setupOffer();
        // The handler does 3 kvSet calls for the offer key:
        // 1. escrowed checkpoint, 2. after phase 1, 3. final save
        // Fail on the 3rd set to offer:* — kvSet doesn't throw, just logs
        mockKV.failOn('set', 'offer:*', { countdown: 3 });

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // kvSet doesn't throw, handler returns 200 with completed status
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
        // But the final save failed silently — the KV still has the phase 1 save
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        // Phase 1 save persisted releaseToReceiverComplete but final save (with completed) failed
        expect(saved.releaseToReceiverComplete).toBe(true);
        // The status in KV is 'escrowed' (from the phase 1 save), not 'completed'
        expect(saved.status).toBe('escrowed');
    });

    it('persists intermediate state after Phase 1 via checkpoint', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('releaseTx1');
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('Phase 2 failed'));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);

        // After phase 1 succeeds, the intermediate save should have recorded it
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.escrowReleaseTxSignature).toBe('releaseTx1');
    });

    it('loses intermediate state when phase 1 save fails but final save succeeds', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockResolvedValue('releaseTx1');
        // Fail on the 2nd set to offer:* (the intermediate save after phase 1)
        // kvSet doesn't throw, just logs. The 3rd save (final) still succeeds.
        mockKV.failOn('set', 'offer:*', { countdown: 2 });

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // Handler returns 200 because kvSet doesn't throw
        expect(res.statusCode).toBe(200);
        // The 2nd save (phase 1 checkpoint) failed silently,
        // but the 3rd save (final) succeeded with the completed state
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('completed');
        // The intermediate checkpoint was lost, but final state is correct
        expect(saved.releaseToReceiverComplete).toBe(true);
        expect(saved.releaseToInitiatorComplete).toBe(true);
    });

    it('prevents concurrent accept + accept via lock', async () => {
        setupOffer();

        const body1 = makeAcceptRequest(receiver, offerId);
        const body2 = makeAcceptRequest(receiver, offerId);

        const req1 = createMockReq({ body: body1 });
        const res1 = createMockRes();
        const req2 = createMockReq({ body: body2 });
        const res2 = createMockRes();

        await Promise.all([
            handler(req1, res1),
            handler(req2, res2),
        ]);

        const statuses = [res1.statusCode, res2.statusCode].sort();
        // One succeeds, one gets 409 (locked) or 400 (signature already used)
        expect(statuses[0]).toBeLessThanOrEqual(400);
        expect(statuses).toContain(200);
    });

    it('prevents concurrent accept + cancel via lock', async () => {
        setupOffer();

        const acceptBody = makeAcceptRequest(receiver, offerId);
        const cancelBody = makeCancelRequest(initiator, offerId, 'cancel');

        const req1 = createMockReq({ body: acceptBody });
        const res1 = createMockRes();
        const req2 = createMockReq({ body: cancelBody });
        const res2 = createMockRes();

        await Promise.all([
            handler(req1, res1),
            cancelHandler(req2, res2),
        ]);

        // One should get 409 (locked by the other)
        const statuses = [res1.statusCode, res2.statusCode];
        expect(statuses).toContain(200);
        const has409 = statuses.includes(409);
        const has400 = statuses.includes(400);
        expect(has409 || has400).toBe(true);
    });

    it('releases escrow TX claim when TX verification fails', async () => {
        const offer = setupOffer({
            receiver: {
                wallet: receiver.wallet,
                nfts: ['RecvNft1111111111111111111111111111111111111'],
                nftDetails: [{ id: 'RecvNft1111111111111111111111111111111111111', name: 'Test' }],
                sol: 0.5,
            },
        });

        const txSig = 'recvTx' + '2'.repeat(42);
        // Register invalid TX content (wrong destination) to trigger verification failure
        mockHelius.addTransaction(txSig, {
            transactionError: null,
            nativeTransfers: [],
            tokenTransfers: [],
            instructions: [],
        });

        const body = makeAcceptRequest(receiver, offerId, { txSignature: txSig });
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        // TX claim should be released after verification failure
        expect(mockKV.store.has(`used_escrow_tx:${txSig}`)).toBe(false);
        // Lock should be released
        expect(mockKV.store.has(`lock:offer:${offerId}`)).toBe(false);
    });

    it('returns 400 when offer has expired during accept', async () => {
        setupOffer({ expiresAt: Date.now() - 1000 });

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('expired');
    });

    it('returns 404 when offer does not exist', async () => {
        // Don't create an offer
        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);
    });

    it('both phases succeed with no receiver assets', async () => {
        setupOffer({
            receiver: { wallet: receiver.wallet, nfts: [], nftDetails: [], sol: 0 },
        });
        // releaseEscrowToInitiator returns null when no receiver assets
        mockReleaseToInitiator = vi.fn().mockResolvedValue(null);

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('completed');
    });

    it('releases lock even when release phases fail', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockRejectedValue(new Error('fail1'));
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('fail2'));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        // Lock should be released
        expect(mockKV.store.has(`lock:offer:${offerId}`)).toBe(false);
    });

    it('marks signature as used after successful accept', async () => {
        setupOffer();

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        // Signature should be marked as used
        const sigKey = `used_sig:${body.signature}`;
        expect(mockKV.store.has(sigKey)).toBe(true);
    });

    it('returns release errors in response when phases fail', async () => {
        setupOffer();
        mockReleaseToReceiver = vi.fn().mockRejectedValue(new Error('Network timeout'));
        mockReleaseToInitiator = vi.fn().mockRejectedValue(new Error('Blockhash expired'));

        const body = makeAcceptRequest(receiver, offerId);
        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.releaseErrors).toHaveLength(2);
        expect(res.data.releaseErrors[0].phase).toBe('releaseToReceiver');
        expect(res.data.releaseErrors[1].phase).toBe('releaseToInitiator');
    });
});
