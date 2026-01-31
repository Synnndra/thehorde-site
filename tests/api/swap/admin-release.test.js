import { describe, it, expect, beforeEach } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/admin-release.js');

describe('admin-release.js handler', () => {
    beforeEach(() => resetMocks());

    it('rejects non-POST methods', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects wrong admin secret', async () => {
        const req = createMockReq({
            body: { secret: 'wrong', offerId: 'offer_' + 'a'.repeat(32) }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('rejects invalid offer ID', async () => {
        const req = createMockReq({
            body: { secret: ADMIN_SECRET, offerId: 'bad' }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('returns 404 for missing offer', async () => {
        const req = createMockReq({
            body: { secret: ADMIN_SECRET, offerId: 'offer_' + 'a'.repeat(32) }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);
    });

    it('processes admin release for offer with no escrowed assets', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = {
            id: offerId,
            status: 'escrowed',
            initiator: { wallet: 'InitWallet1111111111111111111111111111111111', nfts: [], sol: 0 },
            receiver: { wallet: 'RecvWallet1111111111111111111111111111111111', nfts: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({
            body: { secret: ADMIN_SECRET, offerId }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
    });
});
