import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import { makeWallet, createEscrowedOffer, createPendingOffer, storeOffer } from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

let mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');
let mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue('mockRecvReturnTx');

vi.mock('../../../lib/swap-utils.js', async () => {
    const actual = await vi.importActual('../../../lib/swap-utils.js');
    return {
        ...actual,
        returnEscrowToInitiator: (...args) => mockReturnEscrowToInitiator(...args),
        returnReceiverEscrowAssets: (...args) => mockReturnReceiverEscrowAssets(...args),
    };
});

const { default: handler } = await import('../../../api/swap/admin-release.js');

describe('admin-release-failures: failure simulation tests', () => {
    let initiator, receiver;
    const offerId = 'offer_' + 'd'.repeat(32);

    beforeEach(() => {
        resetMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        mockReturnEscrowToInitiator = vi.fn().mockResolvedValue('mockReturnTx');
        mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue('mockRecvReturnTx');
    });

    it('records partial release when initiator return fails but receiver succeeds', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            initiator: { wallet: initiator.wallet, nfts: ['nft1'], nftDetails: [{ id: 'nft1' }], sol: 1 },
            receiver: { wallet: receiver.wallet, nfts: ['nft2'], nftDetails: [{ id: 'nft2' }], sol: 0.5 },
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('initiator return failed'));
        mockReturnReceiverEscrowAssets = vi.fn().mockResolvedValue('recvReturnTx');

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.results.errors).toHaveLength(1);
        expect(res.data.results.errors[0].side).toBe('initiator');
        expect(res.data.results.receiverReturn).toBe('recvReturnTx');
        // Status should NOT be changed to 'failed' because there were errors
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('escrowed');
    });

    it('records both errors when both returns fail', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            initiator: { wallet: initiator.wallet, nfts: ['nft1'], nftDetails: [{ id: 'nft1' }], sol: 1 },
            receiver: { wallet: receiver.wallet, nfts: ['nft2'], nftDetails: [{ id: 'nft2' }], sol: 0.5 },
        });
        storeOffer(mockKV, offer);

        mockReturnEscrowToInitiator = vi.fn().mockRejectedValue(new Error('fail1'));
        mockReturnReceiverEscrowAssets = vi.fn().mockRejectedValue(new Error('fail2'));

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.results.errors).toHaveLength(2);
        const saved = JSON.parse(mockKV.store.get(`offer:${offerId}`));
        expect(saved.status).toBe('escrowed'); // unchanged
    });

    it('skips already-handled assets (idempotency)', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            initiator: { wallet: initiator.wallet, nfts: ['nft1'], nftDetails: [{ id: 'nft1' }], sol: 1 },
            receiver: { wallet: receiver.wallet, nfts: ['nft2'], nftDetails: [{ id: 'nft2' }], sol: 0.5 },
            releaseToReceiverComplete: true, // Phase 1 done: initiator assets already sent to receiver
            releaseToInitiatorComplete: true, // Phase 2 done: receiver assets already sent to initiator
        });
        storeOffer(mockKV, offer);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        // Neither return function should be called since phases are already complete
        expect(mockReturnEscrowToInitiator).not.toHaveBeenCalled();
        expect(mockReturnReceiverEscrowAssets).not.toHaveBeenCalled();
        expect(res.data.results.errors).toHaveLength(0);
    });

    it('rejects completed offers', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            status: 'completed',
        });
        storeOffer(mockKV, offer);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Cannot admin-release');
    });

    it('rejects cancelled offers', async () => {
        const offer = createPendingOffer(initiator, receiver, {
            id: offerId,
            status: 'cancelled',
        });
        storeOffer(mockKV, offer);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Cannot admin-release');
    });

    it('allows admin release of failed offers', async () => {
        const offer = createEscrowedOffer(initiator, receiver, {
            id: offerId,
            status: 'failed',
            initiator: { wallet: initiator.wallet, nfts: ['nft1'], nftDetails: [{ id: 'nft1' }], sol: 1 },
            receiver: { wallet: receiver.wallet, nfts: [], nftDetails: [], sol: 0 },
        });
        storeOffer(mockKV, offer);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.results.initiatorReturn).toBe('mockReturnTx');
    });
});
