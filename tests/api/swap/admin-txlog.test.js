import { describe, it, expect, beforeEach } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/admin-txlog.js');

function makeOffer(overrides = {}) {
    return {
        status: 'pending',
        createdAt: Date.now(),
        initiator: { wallet: '7saRKnTBMmhx4MzaqGxrNwnGE1JQuniYkHtSMjxZxPAA', nfts: [], sol: 0 },
        receiver: { wallet: '41aQxPEFQzHSW5Y3FrdUMzmpZnyYSAsXBwGFjgMdsfgh', nfts: [], sol: 0 },
        ...overrides,
    };
}

describe('admin-txlog.js handler', () => {
    beforeEach(() => resetMocks());

    it('rejects non-POST methods', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects wrong admin secret', async () => {
        const req = createMockReq({ body: { secret: 'wrong' } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('rejects missing admin secret', async () => {
        const req = createMockReq({ body: {} });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('rejects invalid offerId format', async () => {
        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId: 'bad' } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('rejects offerId that is too long', async () => {
        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId: 'offer_' + 'a'.repeat(50) } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('returns 404 for missing offer', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);
    });

    it('returns specific offer with txlog', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = makeOffer({ status: 'completed', createdAt: 1000 });
        mockKV.set(`offer:${offerId}`, offer);

        const txEntry = JSON.stringify({ action: 'created', timestamp: 1000 });
        mockKV.rpush(`txlog:${offerId}`, txEntry);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.offers).toHaveLength(1);
        expect(res.data.offers[0].offerId).toBe(offerId);
        expect(res.data.offers[0].status).toBe('completed');
        expect(res.data.offers[0].createdAt).toBe(1000);
        expect(res.data.offers[0].initiator).toBe('7saRKnTBMmhx4MzaqGxrNwnGE1JQuniYkHtSMjxZxPAA');
        expect(res.data.offers[0].receiver).toBe('41aQxPEFQzHSW5Y3FrdUMzmpZnyYSAsXBwGFjgMdsfgh');
        expect(res.data.offers[0].txLog).toHaveLength(1);
        expect(res.data.offers[0].txLog[0].action).toBe('created');
    });

    it('returns specific offer with empty txlog', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = makeOffer({ status: 'pending' });
        mockKV.set(`offer:${offerId}`, offer);

        const req = createMockReq({ body: { secret: ADMIN_SECRET, offerId } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.offers[0].txLog).toEqual([]);
    });

    it('returns recent offers sorted by createdAt desc, max 10', async () => {
        // Create 12 offers with different createdAt values
        for (let i = 0; i < 12; i++) {
            const id = 'offer_' + i.toString().padStart(32, '0');
            mockKV.set(`offer:${id}`, makeOffer({ createdAt: 1000 + i }));
        }

        const req = createMockReq({ body: { secret: ADMIN_SECRET } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.offers).toHaveLength(10);
        // Should be sorted newest first
        expect(res.data.offers[0].createdAt).toBe(1011);
        expect(res.data.offers[9].createdAt).toBe(1002);
    });

    it('returns empty offers array when no offers exist', async () => {
        const req = createMockReq({ body: { secret: ADMIN_SECRET } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.offers).toEqual([]);
    });

});
