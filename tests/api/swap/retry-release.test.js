import { describe, it, expect, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { setupEnv, setupFetchMock, resetMocks, ADMIN_SECRET } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/retry-release.js');

function makeKeypair() {
    const kp = nacl.sign.keyPair();
    return { kp, wallet: bs58.encode(kp.publicKey) };
}

function sign(message, secretKey) {
    const bytes = new TextEncoder().encode(message);
    return bs58.encode(nacl.sign.detached(bytes, secretKey));
}

describe('retry-release.js handler', () => {
    let initiator, receiver;

    beforeEach(() => {
        resetMocks();
        initiator = makeKeypair();
        receiver = makeKeypair();
    });

    it('rejects non-POST methods', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects invalid offer ID', async () => {
        const req = createMockReq({
            body: { offerId: 'bad', secret: ADMIN_SECRET }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('rejects non-escrowed offers', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = {
            id: offerId,
            status: 'pending',
            initiator: { wallet: initiator.wallet, nfts: [], nftDetails: [], sol: 0 },
            receiver: { wallet: receiver.wallet, nfts: [], nftDetails: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({
            body: { offerId, secret: ADMIN_SECRET }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('not \'escrowed\'');
    });

    it('rejects unauthorized non-party wallet', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = {
            id: offerId,
            status: 'escrowed',
            initiator: { wallet: initiator.wallet, nfts: [], nftDetails: [], sol: 0 },
            receiver: { wallet: receiver.wallet, nfts: [], nftDetails: [], sol: 0 },
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const outsider = makeKeypair();
        const message = `Midswap retry-release offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, outsider.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: outsider.wallet, signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('allows admin secret auth', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = {
            id: offerId,
            status: 'escrowed',
            escrowedAt: Date.now(),
            initiator: { wallet: initiator.wallet, nfts: [], nftDetails: [], sol: 0 },
            receiver: { wallet: receiver.wallet, nfts: [], nftDetails: [], sol: 0 },
            releaseToReceiverComplete: true,
            releaseToInitiatorComplete: true,
        };
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const req = createMockReq({
            body: { offerId, secret: ADMIN_SECRET }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.status).toBe('completed');
    });
});
