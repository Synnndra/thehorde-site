import { describe, it, expect, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { setupEnv, setupFetchMock, resetMocks, KV_URL, KV_TOKEN } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/cancel.js');

function makeKeypair() {
    const kp = nacl.sign.keyPair();
    return { kp, wallet: bs58.encode(kp.publicKey) };
}

function sign(message, secretKey) {
    const bytes = new TextEncoder().encode(message);
    return bs58.encode(nacl.sign.detached(bytes, secretKey));
}

function createTestOffer(initiatorWallet, receiverWallet) {
    return {
        id: 'offer_' + 'b'.repeat(32),
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        initiator: { wallet: initiatorWallet, nfts: [], nftDetails: [], sol: 1 },
        receiver: { wallet: receiverWallet, nfts: [], nftDetails: [], sol: 0 },
        fee: 0.02,
        escrowTxSignature: null,
    };
}

describe('cancel.js handler', () => {
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

    it('rejects invalid action', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const message = `Midswap invalid offer ${offerId} at ${Date.now()}`;
        const req = createMockReq({
            body: {
                offerId,
                wallet: initiator.wallet,
                action: 'invalid',
                signature: sign(message, initiator.kp.secretKey),
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Invalid action');
    });

    it('rejects cancel from non-initiator', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap cancel offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: receiver.wallet, action: 'cancel', signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
        expect(res.data.error).toContain('Only the initiator');
    });

    it('rejects decline from non-receiver', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap decline offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, initiator.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: initiator.wallet, action: 'decline', signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
        expect(res.data.error).toContain('Only the receiver');
    });

    it('allows initiator to cancel', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap cancel offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, initiator.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: initiator.wallet, action: 'cancel', signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.offer.status).toBe('cancelled');
    });

    it('allows receiver to decline', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap decline offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: receiver.wallet, action: 'decline', signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.offer.status).toBe('cancelled');
    });

    it('rejects if offer is not pending', async () => {
        const offerId = 'offer_' + 'b'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        offer.status = 'completed';
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap cancel offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, initiator.kp.secretKey);

        const req = createMockReq({
            body: { offerId, wallet: initiator.wallet, action: 'cancel', signature, message }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('no longer pending');
    });
});
