// Shared test setup - configures fetch interceptor and env vars
import { vi } from 'vitest';
import { mockKV } from './mock-kv.js';
import { mockHelius } from './mock-helius.js';

export const KV_URL = 'https://mock-kv.upstash.io';
export const KV_TOKEN = 'mock-kv-token';
export const HELIUS_API_KEY = 'mock-helius-key';
export const ESCROW_PRIVATE_KEY = 'mock-escrow-key';
export const ADMIN_SECRET = 'mock-admin-secret';

export function setupEnv() {
    process.env.KV_REST_API_URL = KV_URL;
    process.env.KV_REST_API_TOKEN = KV_TOKEN;
    process.env.HELIUS_API_KEY = HELIUS_API_KEY;
    process.env.ESCROW_PRIVATE_KEY = ESCROW_PRIVATE_KEY;
    process.env.ADMIN_SECRET = ADMIN_SECRET;
    process.env.CLEANUP_SECRET = ADMIN_SECRET;
}

export function setupFetchMock() {
    const originalFetch = globalThis.fetch;

    const mockFetch = vi.fn(async (url, options = {}) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Route to KV mock
        if (urlStr.startsWith(KV_URL)) {
            return mockKV.handleRequest(urlStr, options);
        }

        // Route to Helius RPC mock
        if (urlStr.includes('mainnet.helius-rpc.com')) {
            return mockHelius.handleRpcRequest(urlStr, options);
        }

        // Route to Helius Enhanced Transactions API mock
        if (urlStr.includes('api.helius.xyz')) {
            return mockHelius.handleEnhancedTxRequest(urlStr, options);
        }

        // Unexpected fetch call
        throw new Error(`Unmocked fetch call: ${urlStr}`);
    });

    vi.stubGlobal('fetch', mockFetch);

    return {
        mockFetch,
        restore: () => {
            vi.stubGlobal('fetch', originalFetch);
        },
    };
}

export function resetMocks() {
    mockKV.reset();
    mockHelius.reset();
}
