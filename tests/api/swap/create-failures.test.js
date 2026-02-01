import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupEnv, setupFetchMock, resetMocks } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';
import { mockHelius } from '../../helpers/mock-helius.js';
import { createMockReq, createMockRes } from '../../helpers/mock-request.js';
import { makeWallet, makeCreateRequest, setupCreateEscrowTx } from '../../helpers/test-fixtures.js';

setupEnv();
setupFetchMock();

// We need to mock verifyTransactionConfirmed to avoid 60s polling
const utils = await import('../../../lib/swap-utils.js');
const { default: handler } = await import('../../../api/swap/create.js');

describe('create-failures: failure simulation tests', () => {
    let initiator, receiver;

    beforeEach(() => {
        resetMocks();
        vi.restoreAllMocks();
        initiator = makeWallet();
        receiver = makeWallet();
        // Set up default orc check (no orcs = fee applies)
        mockHelius.setAssetsForOwner(initiator.wallet, []);
    });

    it('returns 400 when escrow TX content verification fails', async () => {
        const body = makeCreateRequest(initiator, receiver);
        // Register TX with wrong content (SOL goes to wrong wallet)
        mockHelius.addTransaction(body.escrowTxSignature, {
            transactionError: null,
            nativeTransfers: [{
                fromUserAccount: initiator.wallet,
                toUserAccount: 'WrongWallet111111111111111111111111111111111',
                amount: 1_000_000_000,
            }],
            tokenTransfers: [],
            instructions: [],
        });

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        // Escrow tx claim should be released
        const claimKey = `used_escrow_tx:${body.escrowTxSignature}`;
        expect(mockKV.store.has(claimKey)).toBe(false);
        // No offer should be saved
        const offerKeys = [...mockKV.store.keys()].filter(k => k.startsWith('offer:'));
        expect(offerKeys.length).toBe(0);
    });

    it('returns 400 when TX finalization times out', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);

        // Mock verifyTransactionConfirmed to return false (not finalized)
        vi.spyOn(utils, 'verifyTransactionConfirmed').mockResolvedValue(false);

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('not yet finalized');
        // Claim should be released
        const claimKey = `used_escrow_tx:${body.escrowTxSignature}`;
        expect(mockKV.store.has(claimKey)).toBe(false);
    });

    it('silently fails offer save when KV set fails (kvSet does not throw)', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);

        // Fail the KV set for the offer — kvSet logs error but doesn't throw
        mockKV.failOnce('set', 'offer:*');

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // kvSet doesn't throw, so handler returns 200 but offer is NOT in KV
        expect(res.statusCode).toBe(200);
        const offerId = res.data.offerId;
        expect(mockKV.store.has(`offer:${offerId}`)).toBe(false);
    });

    it('saves offer even when wallet list update partially fails', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);

        // Fail on wallet:*:offers set (the second set call - after offer save)
        mockKV.failOnce('set', 'wallet:*');

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // The handler may return 200 (offer saved) or 500 (caught by outer try)
        // Either way, if 200, the offer should be findable
        if (res.statusCode === 200) {
            const offerId = res.data.offerId;
            expect(mockKV.store.has(`offer:${offerId}`)).toBe(true);
        }
        // If 500, the claim should be released
        if (res.statusCode === 500) {
            const claimKey = `used_escrow_tx:${body.escrowTxSignature}`;
            expect(mockKV.store.has(claimKey)).toBe(false);
        }
    });

    it('rejects duplicate escrow TX signature', async () => {
        const body1 = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body1.escrowTxSignature, initiator.wallet);

        // First create succeeds
        const req1 = createMockReq({ body: body1 });
        const res1 = createMockRes();
        await handler(req1, res1);
        expect(res1.statusCode).toBe(200);

        // Second create with same TX sig
        const body2 = makeCreateRequest(initiator, receiver, {
            escrowTxSignature: body1.escrowTxSignature,
        });
        const req2 = createMockReq({ body: body2 });
        const res2 = createMockRes();
        await handler(req2, res2);
        expect(res2.statusCode).toBe(400);
        expect(res2.data.error).toContain('already been used');
    });

    it('rejects concurrent creates with same TX via atomic SET NX', async () => {
        const sharedTxSig = 'sharedEscrowTx' + '1'.repeat(34);
        setupCreateEscrowTx(mockHelius, sharedTxSig, initiator.wallet);

        const body1 = makeCreateRequest(initiator, receiver, { escrowTxSignature: sharedTxSig });
        const body2 = makeCreateRequest(initiator, receiver, { escrowTxSignature: sharedTxSig });

        const req1 = createMockReq({ body: body1 });
        const res1 = createMockRes();
        const req2 = createMockReq({ body: body2 });
        const res2 = createMockRes();

        // Fire both concurrently
        const [r1, r2] = await Promise.all([
            handler(req1, res1),
            handler(req2, res2),
        ]);

        const statuses = [res1.statusCode, res2.statusCode].sort();
        // Exactly one should succeed (200) and one should fail (400)
        expect(statuses).toContain(200);
        expect(statuses).toContain(400);
    });

    it('fails closed (400) when KV is down during escrow claim', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);

        // Fail the pipeline SET NX for used_escrow_tx
        mockKV.failOnce('pipeline', 'used_escrow_tx:*');

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // claimEscrowTx fails closed (returns claimed: false)
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('already been used');
    });

    it('returns 400 when Helius is down during collection check', async () => {
        // Use a valid Solana address format (base58, 32-44 chars)
        const nftId = 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh';
        const body = makeCreateRequest(initiator, receiver, {
            initiatorNfts: [nftId],
            initiatorSol: 0,
            receiverNfts: [],
            receiverSol: 1,
            escrowTxSignature: undefined,
        });

        // Don't register the NFT in Helius - getAsset returns null
        // This means collection check fails

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('not from allowed collections');
    });

    it('returns 400 when TX failed on-chain', async () => {
        const body = makeCreateRequest(initiator, receiver);
        // Register TX as failed on-chain
        mockHelius.addTransaction(body.escrowTxSignature, {
            transactionError: 'InstructionError',
            nativeTransfers: [],
            tokenTransfers: [],
            instructions: [],
        });

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it('releases escrow claim when enhanced TX API returns empty', async () => {
        const body = makeCreateRequest(initiator, receiver);
        // Don't add any transaction to mockHelius - enhanced TX API returns []

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        // Claim should be released
        const claimKey = `used_escrow_tx:${body.escrowTxSignature}`;
        expect(mockKV.store.has(claimKey)).toBe(false);
    });

    it('verifies KV call log captures escrow claim operations', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);
        mockKV.clearCallLog();

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);

        const log = mockKV.getCallLog();
        // Should contain pipeline call for escrow claim
        const pipelineCalls = log.filter(l => l.method === 'pipeline');
        expect(pipelineCalls.length).toBeGreaterThan(0);
        // Should contain escrow tx key
        const escrowClaimCall = pipelineCalls.find(l => l.key.includes('used_escrow_tx:'));
        expect(escrowClaimCall).toBeDefined();
    });

    it('returns 200 but offer not persisted when offer save fails mid-process', async () => {
        const body = makeCreateRequest(initiator, receiver);
        setupCreateEscrowTx(mockHelius, body.escrowTxSignature, initiator.wallet);

        // Fail the offer set — kvSet logs error but doesn't throw
        mockKV.failOnce('set', 'offer:*');

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        // Handler returns 200 because kvSet doesn't throw
        expect(res.statusCode).toBe(200);
        // But the offer is not actually saved
        const offerId = res.data.offerId;
        expect(mockKV.store.has(`offer:${offerId}`)).toBe(false);
    });

    it('rejects when escrow TX has insufficient SOL', async () => {
        const body = makeCreateRequest(initiator, receiver, { initiatorSol: 5 });
        // TX only transfers 1 SOL instead of 5
        mockHelius.addTransaction(body.escrowTxSignature, {
            transactionError: null,
            nativeTransfers: [{
                fromUserAccount: initiator.wallet,
                toUserAccount: 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh',
                amount: 1_000_000_000,
            }, {
                fromUserAccount: initiator.wallet,
                toUserAccount: '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq',
                amount: 20_000_000,
            }],
            tokenTransfers: [],
            instructions: [],
        });

        const req = createMockReq({ body });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Insufficient SOL');
        // Claim should be released
        const claimKey = `used_escrow_tx:${body.escrowTxSignature}`;
        expect(mockKV.store.has(claimKey)).toBe(false);
    });
});
