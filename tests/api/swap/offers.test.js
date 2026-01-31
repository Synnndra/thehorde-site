import { describe, it, expect, beforeEach } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/offers.js');

describe('offers.js handler', () => {
    beforeEach(() => resetMocks());

    it('rejects non-GET methods', async () => {
        const req = createMockReq({ method: 'POST' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects invalid wallet', async () => {
        const req = createMockReq({ method: 'GET', query: { wallet: 'bad' } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('returns empty array for wallet with no offers', async () => {
        const wallet = 'Empty11111111111111111111111111111111111111';
        const req = createMockReq({ method: 'GET', query: { wallet } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offers).toEqual([]);
    });

    it('returns offers for a wallet', async () => {
        const wallet = 'Test111111111111111111111111111111111111111';
        const offerId = 'offer_' + 'e'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            initiator: { wallet, nfts: [], sol: 1 },
            receiver: { wallet: 'Peer1111111111111111111111111111111111111111', nfts: [], sol: 0 },
        };

        mockKV.set(`wallet:${wallet}:offers`, JSON.stringify([offerId]));
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({ method: 'GET', query: { wallet } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offers).toHaveLength(1);
        expect(res.data.offers[0].id).toBe(offerId);
    });

    it('marks expired offers as expired in response', async () => {
        const wallet = 'Test111111111111111111111111111111111111111';
        const offerId = 'offer_' + 'f'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            createdAt: Date.now() - 100000,
            expiresAt: Date.now() - 1000,
            initiator: { wallet, nfts: [], sol: 1 },
            receiver: { wallet: 'Peer1111111111111111111111111111111111111111', nfts: [], sol: 0 },
        };

        mockKV.set(`wallet:${wallet}:offers`, JSON.stringify([offerId]));
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({ method: 'GET', query: { wallet } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.offers[0].status).toBe('expired');
    });
});
