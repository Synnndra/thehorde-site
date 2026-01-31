import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { setupEnv, setupFetchMock, resetMocks, KV_URL, KV_TOKEN, HELIUS_API_KEY } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius, createMockAsset } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';

setupEnv();
const fetchMock = setupFetchMock();

const { default: handler } = await import('../../../api/swap/create.js');

// Helper to generate valid auth
function signMessage(message) {
    const keypair = nacl.sign.keyPair();
    const pubkeyBase58 = bs58.encode(keypair.publicKey);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signatureBase58 = bs58.encode(signatureBytes);
    return { pubkeyBase58, signatureBase58, keypair };
}

describe('create.js handler', () => {
    // Use a real-looking base58 address (no 0, O, I, l)
    const receiverWallet = 'Receiver1111111111111111111111111111111111';

    beforeEach(() => {
        resetMocks();
    });

    it('rejects non-POST methods', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects invalid initiator wallet', async () => {
        const req = createMockReq({
            body: { initiatorWallet: 'bad', receiverWallet }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('initiator');
    });

    it('rejects invalid receiver wallet', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const req = createMockReq({
            body: { initiatorWallet: wallet, receiverWallet: 'bad' }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('receiver');
    });

    it('rejects trading with yourself', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const req = createMockReq({
            body: { initiatorWallet: wallet, receiverWallet: wallet }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('yourself');
    });

    it('rejects missing signature', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const req = createMockReq({
            body: {
                initiatorWallet: wallet,
                receiverWallet: receiverWallet,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Signature');
    });

    it('rejects invalid signature', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${wallet} to ${receiverWallet} at ${timestamp}`;

        const req = createMockReq({
            body: {
                initiatorWallet: wallet,
                receiverWallet,
                signature: 'invalidsig',
                message,
                initiatorNfts: [],
                receiverNfts: [],
                initiatorSol: 1,
                receiverSol: 0,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it('rejects offers with nothing to trade', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${wallet} to ${receiverWallet} at ${timestamp}`;
        const messageBytes = new TextEncoder().encode(message);
        const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signature = bs58.encode(sigBytes);

        const req = createMockReq({
            body: {
                initiatorWallet: wallet,
                receiverWallet,
                initiatorNfts: [],
                receiverNfts: [],
                initiatorSol: 0,
                receiverSol: 0,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Must offer');
    });

    it('rejects too many NFTs per side', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${wallet} to ${receiverWallet} at ${timestamp}`;
        const messageBytes = new TextEncoder().encode(message);
        const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signature = bs58.encode(sigBytes);

        // 6 NFTs > MAX_NFTS_PER_SIDE (5)
        const tooManyNfts = Array.from({ length: 6 }, (_, i) => {
            const kp = nacl.sign.keyPair();
            return bs58.encode(kp.publicKey);
        });

        const req = createMockReq({
            body: {
                initiatorWallet: wallet,
                receiverWallet,
                initiatorNfts: tooManyNfts,
                receiverNfts: [],
                initiatorSol: 0,
                receiverSol: 1,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Maximum');
    });

    it('creates an offer successfully with SOL only', async () => {
        const keypair = nacl.sign.keyPair();
        const wallet = bs58.encode(keypair.publicKey);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${wallet} to ${receiverWallet} at ${timestamp}`;
        const messageBytes = new TextEncoder().encode(message);
        const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signature = bs58.encode(sigBytes);

        // Set up mock for escrow tx verification
        const escrowTxSig = 'mockTxSignature1111111111111111111111111111111';
        mockHelius.addTransaction(escrowTxSig, {
            transactionError: null,
            nativeTransfers: [
                {
                    fromUserAccount: wallet,
                    toUserAccount: 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh',
                    amount: 1_000_000_000, // 1 SOL
                },
                {
                    fromUserAccount: wallet,
                    toUserAccount: '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq',
                    amount: 20_000_000, // 0.02 SOL fee
                },
            ],
            tokenTransfers: [],
            instructions: [],
        });

        // Set up Orc ownership check (returns no orcs = fee applies)
        mockHelius.setAssetsForOwner(wallet, []);

        const req = createMockReq({
            body: {
                initiatorWallet: wallet,
                receiverWallet,
                initiatorNfts: [],
                receiverNfts: [],
                initiatorSol: 1,
                receiverSol: 0.5,
                escrowTxSignature: escrowTxSig,
                signature,
                message,
            }
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.offerId).toMatch(/^offer_[a-f0-9]{32}$/);
        expect(res.data.offer.status).toBe('pending');
    });
});
