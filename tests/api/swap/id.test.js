import { describe, it, expect, beforeEach } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, KV_URL, KV_TOKEN } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

// [id].js uses req.query.id
const { default: handler } = await import('../../../api/swap/[id].js');

describe('[id].js handler', () => {
    beforeEach(() => resetMocks());

    it('rejects non-GET methods', async () => {
        const req = createMockReq({ method: 'POST' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects invalid offer ID format', async () => {
        const req = createMockReq({ method: 'GET', query: { id: 'bad-id' } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('returns 404 for missing offer', async () => {
        const req = createMockReq({ method: 'GET', query: { id: 'offer_' + 'c'.repeat(32) } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);
    });

    it('returns offer data', async () => {
        const offerId = 'offer_' + 'c'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            initiator: { wallet: 'WalletA11111111111111111111111111111111111111', nfts: [], sol: 0 },
            receiver: { wallet: 'WalletB11111111111111111111111111111111111111', nfts: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({ method: 'GET', query: { id: offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offer.id).toBe(offerId);
    });

    it('shows expired status for past-due pending offers', async () => {
        const offerId = 'offer_' + 'd'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: Date.now() - 100000,
            expiresAt: Date.now() - 1000, // expired
            initiator: { wallet: 'WalletA11111111111111111111111111111111111111', nfts: [], sol: 0 },
            receiver: { wallet: 'WalletB11111111111111111111111111111111111111', nfts: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({ method: 'GET', query: { id: offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offer.status).toBe('expired');
    });
});
