import { describe, it, expect, beforeEach } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/cleanup-expired.js');

describe('cleanup-expired.js handler', () => {
    beforeEach(() => resetMocks());

    it('rejects unauthorized requests', async () => {
        const req = createMockReq({ method: 'POST', body: { secret: 'wrong' } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('allows GET with header secret', async () => {
        const req = createMockReq({
            method: 'GET',
            headers: { 'x-cleanup-secret': ADMIN_SECRET },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('allows POST with body secret', async () => {
        const req = createMockReq({
            method: 'POST',
            body: { secret: ADMIN_SECRET },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
    });

    it('processes expired pending offers', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: Date.now() - 100000,
            expiresAt: Date.now() - 1000,
            initiator: { wallet: 'Init111111111111111111111111111111111111111', nfts: [], nftDetails: [], sol: 0 },
            receiver: { wallet: 'Recv111111111111111111111111111111111111111', nfts: [], nftDetails: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({
            method: 'POST',
            body: { secret: ADMIN_SECRET },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.results.expired).toBe(1);
    });

    it('processes cancel-requested offers', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            cancelRequested: true,
            cancelRequestedBy: 'Init111111111111111111111111111111111111111',
            cancelRequestedAction: 'cancel',
            escrowTxSignature: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            initiator: { wallet: 'Init111111111111111111111111111111111111111', nfts: [], nftDetails: [], sol: 0 },
            receiver: { wallet: 'Recv111111111111111111111111111111111111111', nfts: [], nftDetails: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({
            method: 'POST',
            body: { secret: ADMIN_SECRET },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        // Offer should be marked cancelled since no escrow to return
    });
});
