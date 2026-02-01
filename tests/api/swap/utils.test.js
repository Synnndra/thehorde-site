import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { setupEnv, setupFetchMock, resetMocks, KV_URL, KV_TOKEN } from '../../helpers/setup.js';
import { mockKV } from '../../helpers/mock-kv.js';

// Setup env before importing module under test
setupEnv();
const fetchMock = setupFetchMock();

const {
    validateSolanaAddress,
    verifySignature,
    validateTimestamp,
    isRateLimitedMemory,
    isRateLimitedKV,
    isSignatureUsed,
    markSignatureUsed,
    kvGet,
    kvSet,
    kvDelete,
    acquireLock,
    releaseLock,
    countActiveOffers,
    cleanApiKey,
    getClientIp,
    MAX_MESSAGE_AGE,
    ALLOWED_COLLECTIONS,
    ESCROW_WALLET,
} = await import('../../../lib/swap-utils.js');

describe('utils.js', () => {
    beforeEach(() => {
        resetMocks();
    });

    // ========== validateSolanaAddress ==========
    describe('validateSolanaAddress', () => {
        it('returns true for valid base58 addresses', () => {
            expect(validateSolanaAddress('BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh')).toBe(true);
            expect(validateSolanaAddress('6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq')).toBe(true);
        });

        it('returns false for null/undefined/empty', () => {
            expect(validateSolanaAddress(null)).toBe(false);
            expect(validateSolanaAddress(undefined)).toBe(false);
            expect(validateSolanaAddress('')).toBe(false);
        });

        it('returns false for non-string values', () => {
            expect(validateSolanaAddress(123)).toBe(false);
            expect(validateSolanaAddress({})).toBe(false);
        });

        it('returns false for too-short addresses', () => {
            expect(validateSolanaAddress('abc')).toBe(false);
        });

        it('returns false for too-long addresses', () => {
            expect(validateSolanaAddress('A'.repeat(45))).toBe(false);
        });

        it('returns false for addresses with invalid base58 chars', () => {
            // 0, O, I, l are not valid base58
            expect(validateSolanaAddress('0' + 'A'.repeat(43))).toBe(false);
            expect(validateSolanaAddress('O' + 'A'.repeat(43))).toBe(false);
            expect(validateSolanaAddress('I' + 'A'.repeat(43))).toBe(false);
            expect(validateSolanaAddress('l' + 'A'.repeat(43))).toBe(false);
        });
    });

    // ========== verifySignature ==========
    describe('verifySignature', () => {
        it('returns true for a valid Ed25519 signature', () => {
            const keypair = nacl.sign.keyPair();
            const pubkeyBase58 = bs58.encode(keypair.publicKey);
            const message = 'test message';
            const messageBytes = new TextEncoder().encode(message);
            const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
            const signatureBase58 = bs58.encode(signatureBytes);

            expect(verifySignature(message, signatureBase58, pubkeyBase58)).toBe(true);
        });

        it('returns false for wrong message', () => {
            const keypair = nacl.sign.keyPair();
            const pubkeyBase58 = bs58.encode(keypair.publicKey);
            const messageBytes = new TextEncoder().encode('original message');
            const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
            const signatureBase58 = bs58.encode(signatureBytes);

            expect(verifySignature('tampered message', signatureBase58, pubkeyBase58)).toBe(false);
        });

        it('returns false for wrong key', () => {
            const keypair1 = nacl.sign.keyPair();
            const keypair2 = nacl.sign.keyPair();
            const message = 'test message';
            const messageBytes = new TextEncoder().encode(message);
            const signatureBytes = nacl.sign.detached(messageBytes, keypair1.secretKey);
            const signatureBase58 = bs58.encode(signatureBytes);
            const wrongPubkey = bs58.encode(keypair2.publicKey);

            expect(verifySignature(message, signatureBase58, wrongPubkey)).toBe(false);
        });

        it('returns false for malformed inputs', () => {
            expect(verifySignature('msg', 'bad-sig', 'bad-key')).toBe(false);
        });
    });

    // ========== validateTimestamp ==========
    describe('validateTimestamp', () => {
        it('returns valid for a fresh timestamp', () => {
            const message = `test at ${Date.now()}`;
            const result = validateTimestamp(message);
            expect(result.valid).toBe(true);
            expect(result.timestamp).toBeTypeOf('number');
        });

        it('returns invalid for missing timestamp', () => {
            const result = validateTimestamp('no timestamp here');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('missing timestamp');
        });

        it('returns invalid for expired timestamp', () => {
            const oldTime = Date.now() - MAX_MESSAGE_AGE - 1000;
            const message = `test at ${oldTime}`;
            const result = validateTimestamp(message);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('expired');
        });

        it('returns invalid for far-future timestamp', () => {
            const futureTime = Date.now() + 120000; // 2 minutes ahead
            const message = `test at ${futureTime}`;
            const result = validateTimestamp(message);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid');
        });

        it('accepts timestamp within 1 minute tolerance', () => {
            const slightlyFuture = Date.now() + 30000; // 30 seconds ahead
            const message = `test at ${slightlyFuture}`;
            const result = validateTimestamp(message);
            expect(result.valid).toBe(true);
        });
    });

    // ========== Rate Limiting ==========
    describe('isRateLimitedMemory', () => {
        it('allows requests under the limit', () => {
            expect(isRateLimitedMemory('1.2.3.4', 'test-mem', 3, 60000)).toBe(false);
            expect(isRateLimitedMemory('1.2.3.4', 'test-mem', 3, 60000)).toBe(false);
            expect(isRateLimitedMemory('1.2.3.4', 'test-mem', 3, 60000)).toBe(false);
        });

        it('blocks requests over the limit', () => {
            isRateLimitedMemory('5.6.7.8', 'test-mem2', 2, 60000);
            isRateLimitedMemory('5.6.7.8', 'test-mem2', 2, 60000);
            expect(isRateLimitedMemory('5.6.7.8', 'test-mem2', 2, 60000)).toBe(true);
        });

        it('tracks different IPs independently', () => {
            isRateLimitedMemory('10.0.0.1', 'test-mem3', 1, 60000);
            expect(isRateLimitedMemory('10.0.0.1', 'test-mem3', 1, 60000)).toBe(true);
            expect(isRateLimitedMemory('10.0.0.2', 'test-mem3', 1, 60000)).toBe(false);
        });
    });

    describe('isRateLimitedKV', () => {
        it('falls back to memory when KV not configured', async () => {
            const result = await isRateLimitedKV('1.1.1.1', 'test-kv', 10, 60000, null, null);
            expect(result).toBe(false);
        });

        it('allows requests under the limit via KV', async () => {
            const result = await isRateLimitedKV('2.2.2.2', 'test-kv2', 10, 60000, KV_URL, KV_TOKEN);
            expect(result).toBe(false);
        });

        it('blocks after exceeding limit via KV', async () => {
            for (let i = 0; i < 3; i++) {
                await isRateLimitedKV('3.3.3.3', 'test-kv3', 3, 60000, KV_URL, KV_TOKEN);
            }
            const result = await isRateLimitedKV('3.3.3.3', 'test-kv3', 3, 60000, KV_URL, KV_TOKEN);
            expect(result).toBe(true);
        });
    });

    // ========== Signature Replay Prevention ==========
    describe('isSignatureUsed / markSignatureUsed', () => {
        it('returns false for unused signature', async () => {
            const result = await isSignatureUsed('new-sig-123', KV_URL, KV_TOKEN);
            expect(result).toBe(false);
        });

        it('returns true after marking signature used', async () => {
            await markSignatureUsed('used-sig-456', KV_URL, KV_TOKEN);
            const result = await isSignatureUsed('used-sig-456', KV_URL, KV_TOKEN);
            expect(result).toBe(true);
        });

        it('returns true (fail closed) when KV unavailable', async () => {
            const result = await isSignatureUsed('any-sig', null, null);
            expect(result).toBe(true);
        });
    });

    // ========== KV Operations ==========
    describe('kvGet / kvSet / kvDelete', () => {
        it('round-trips a JSON object', async () => {
            const data = { name: 'test', count: 42 };
            await kvSet('test:key', data, KV_URL, KV_TOKEN);
            const result = await kvGet('test:key', KV_URL, KV_TOKEN);
            expect(result).toEqual(data);
        });

        it('returns null for missing key', async () => {
            const result = await kvGet('nonexistent', KV_URL, KV_TOKEN);
            expect(result).toBe(null);
        });

        it('deletes a key', async () => {
            await kvSet('del:key', { x: 1 }, KV_URL, KV_TOKEN);
            await kvDelete('del:key', KV_URL, KV_TOKEN);
            const result = await kvGet('del:key', KV_URL, KV_TOKEN);
            expect(result).toBe(null);
        });
    });

    // ========== Lock Acquisition ==========
    describe('acquireLock / releaseLock', () => {
        it('acquires lock successfully', async () => {
            const lock = await acquireLock('test-offer-1', KV_URL, KV_TOKEN);
            expect(lock.acquired).toBe(true);
            expect(lock.lockKey).toBe('lock:offer:test-offer-1');
        });

        it('fails to acquire lock when already held', async () => {
            await acquireLock('test-offer-2', KV_URL, KV_TOKEN);
            const second = await acquireLock('test-offer-2', KV_URL, KV_TOKEN);
            expect(second.acquired).toBe(false);
        });

        it('can acquire after release', async () => {
            const first = await acquireLock('test-offer-3', KV_URL, KV_TOKEN);
            await releaseLock(first.lockKey, KV_URL, KV_TOKEN);
            const second = await acquireLock('test-offer-3', KV_URL, KV_TOKEN);
            expect(second.acquired).toBe(true);
        });
    });

    // ========== countActiveOffers ==========
    describe('countActiveOffers', () => {
        it('returns 0 for wallet with no offers', async () => {
            const count = await countActiveOffers('EmptyWallet111111111111111111111111111111', KV_URL, KV_TOKEN);
            expect(count).toBe(0);
        });

        it('counts only pending offers', async () => {
            const wallet = 'TestWallet1111111111111111111111111111111111';
            await kvSet(`wallet:${wallet}:offers`, ['offer_a', 'offer_b', 'offer_c'], KV_URL, KV_TOKEN);
            await kvSet('offer:offer_a', { status: 'pending' }, KV_URL, KV_TOKEN);
            await kvSet('offer:offer_b', { status: 'completed' }, KV_URL, KV_TOKEN);
            await kvSet('offer:offer_c', { status: 'pending' }, KV_URL, KV_TOKEN);

            const count = await countActiveOffers(wallet, KV_URL, KV_TOKEN);
            expect(count).toBe(2);
        });
    });

    // ========== Misc ==========
    describe('cleanApiKey', () => {
        it('trims whitespace and removes escaped newlines', () => {
            expect(cleanApiKey(' mykey\\n ')).toBe('mykey');
        });

        it('returns empty string for null', () => {
            expect(cleanApiKey(null)).toBe('');
        });
    });

    describe('getClientIp', () => {
        it('extracts IP from x-forwarded-for', () => {
            expect(getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4');
        });

        it('falls back to x-real-ip', () => {
            expect(getClientIp({ headers: { 'x-real-ip': '9.8.7.6' } })).toBe('9.8.7.6');
        });

        it('returns unknown when no IP headers', () => {
            expect(getClientIp({ headers: {} })).toBe('unknown');
        });
    });

    describe('constants', () => {
        it('exports expected collections', () => {
            expect(ALLOWED_COLLECTIONS).toContain('w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW');
            expect(ALLOWED_COLLECTIONS).toContain('DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF');
        });

        it('exports escrow wallet', () => {
            expect(ESCROW_WALLET).toBe('BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh');
        });
    });
});
