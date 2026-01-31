import { describe, it, expect, beforeEach, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { setupEnv, setupFetchMock, resetMocks, KV_URL, KV_TOKEN } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
setupFetchMock();

const { default: handler } = await import('../../../api/swap/accept.js');

function makeKeypair() {
    const kp = nacl.sign.keyPair();
    return { kp, wallet: bs58.encode(kp.publicKey) };
}

function sign(message, secretKey) {
    const bytes = new TextEncoder().encode(message);
    return bs58.encode(nacl.sign.detached(bytes, secretKey));
}

function createTestOffer(initiatorWallet, receiverWallet, overrides = {}) {
    return {
        id: 'offer_' + 'a'.repeat(32),
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        initiator: {
            wallet: initiatorWallet,
            nfts: [],
            nftDetails: [],
            sol: 1,
        },
        receiver: {
            wallet: receiverWallet,
            nfts: [],
            nftDetails: [],
            sol: 0,
        },
        fee: 0.02,
        escrowTxSignature: 'escrowTx111',
        ...overrides,
    };
}

describe('accept.js handler', () => {
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

    it('rejects invalid offer ID format', async () => {
        const message = `Midswap accept offer bad-id at ${Date.now()}`;
        const req = createMockReq({
            body: {
                offerId: 'bad-id',
                wallet: receiver.wallet,
                signature: sign(message, receiver.kp.secretKey),
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Invalid offer ID');
    });

    it('rejects invalid wallet address', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const req = createMockReq({
            body: {
                offerId,
                wallet: 'bad',
                signature: 'sig',
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Invalid wallet');
    });

    it('rejects non-receiver wallet', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, initiator.kp.secretKey);

        const req = createMockReq({
            body: {
                offerId,
                wallet: initiator.wallet,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
        expect(res.data.error).toContain('Only the receiver');
    });

    it('rejects if offer is not pending', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet, { status: 'completed' });
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        const req = createMockReq({
            body: {
                offerId,
                wallet: receiver.wallet,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('no longer pending');
    });

    it('rejects expired offers', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet, {
            expiresAt: Date.now() - 1000,
        });
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        const req = createMockReq({
            body: {
                offerId,
                wallet: receiver.wallet,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('expired');
    });

    it('rejects missing tx signature when receiver has assets to escrow', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet, {
            receiver: {
                wallet: receiver.wallet,
                nfts: ['SomeNft11111111111111111111111111111111111111'],
                nftDetails: [{ id: 'SomeNft11111111111111111111111111111111111111', name: 'Test' }],
                sol: 0,
            },
        });
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        const req = createMockReq({
            body: {
                offerId,
                wallet: receiver.wallet,
                signature,
                message,
                // no txSignature
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Transaction signature required');
    });

    it('accepts offer when receiver has nothing to escrow', async () => {
        const offerId = 'offer_' + 'a'.repeat(32);
        const offer = createTestOffer(initiator.wallet, receiver.wallet);
        // Receiver has no NFTs and no SOL to send
        mockKV.set(`offer:${offerId}`, JSON.stringify(offer));

        const message = `Midswap accept offer ${offerId} at ${Date.now()}`;
        const signature = sign(message, receiver.kp.secretKey);

        // The handler will try escrow release which needs ESCROW_PRIVATE_KEY
        // Since we're using a mock key, the Keypair.fromSecretKey will fail,
        // but the offer should still reach 'escrowed' state

        const req = createMockReq({
            body: {
                offerId,
                wallet: receiver.wallet,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        // Status will be 'escrowed' since release likely fails with mock key
        expect(['escrowed', 'completed']).toContain(res.data.status);
    });
});
