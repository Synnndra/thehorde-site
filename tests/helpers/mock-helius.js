// Mock Helius DAS API responses
// Used to intercept fetch calls to helius-rpc.com and api.helius.xyz

export class MockHelius {
    constructor() {
        this.assets = new Map();
        this.assetProofs = new Map();
        this.assetsByOwner = new Map();
        this.transactions = new Map();
        this._notFinalizedSigs = new Set();
        this._failedOnChainSigs = new Set();
        this._failures = [];
    }

    reset() {
        this.assets.clear();
        this.assetProofs.clear();
        this.assetsByOwner.clear();
        this.transactions.clear();
        this._notFinalizedSigs.clear();
        this._failedOnChainSigs.clear();
        this._failures = [];
    }

    // ========== TX Confirmation Behavior Control ==========

    /**
     * Make getTransaction return { result: null } for this signature (not finalized).
     */
    setTxNotFinalized(signature) {
        this._notFinalizedSigs.add(signature);
    }

    /**
     * Make getTransaction return { result: { meta: { err: 'InstructionError' } } } for this signature.
     */
    setTxFailedOnChain(signature) {
        this._failedOnChainSigs.add(signature);
    }

    // ========== Failure Injection ==========

    /**
     * Fail the next matching RPC call.
     * @param {string} method - RPC method name (e.g. 'getAsset', 'getTransaction')
     * @param {Error|string} [error] - error to throw/return
     */
    failOnce(method, error) {
        this._failures.push({
            method,
            countdown: 1,
            error: error || new Error('Injected Helius failure'),
        });
    }

    /**
     * Fail on the Nth matching RPC call.
     */
    failOn(method, { countdown = 1, error } = {}) {
        this._failures.push({
            method,
            countdown,
            error: error || new Error('Injected Helius failure'),
        });
    }

    _shouldFail(method) {
        for (let i = 0; i < this._failures.length; i++) {
            const f = this._failures[i];
            if (f.method === method) {
                f.countdown--;
                if (f.countdown <= 0) {
                    this._failures.splice(i, 1);
                    return f.error;
                }
            }
        }
        return null;
    }

    // ========== Data Registration ==========

    // Register a mock asset
    addAsset(id, asset) {
        this.assets.set(id, { ...asset, id });
    }

    // Register a mock asset proof
    addAssetProof(id, proof) {
        this.assetProofs.set(id, proof);
    }

    // Register assets owned by a wallet
    setAssetsForOwner(ownerAddress, items) {
        this.assetsByOwner.set(ownerAddress, items);
    }

    // Register a mock enhanced transaction
    addTransaction(signature, tx) {
        this.transactions.set(signature, tx);
    }

    // Handle Helius RPC requests (mainnet.helius-rpc.com)
    handleRpcRequest(url, options) {
        try {
            const body = JSON.parse(options.body);
            const { method, params, id } = body;

            // Check failure injection
            const failError = this._shouldFail(method);
            if (failError) {
                return this._rpcResponse(id, null, { code: -32000, message: String(failError) });
            }

            switch (method) {
                case 'getAsset': {
                    const assetId = params?.id;
                    const asset = this.assets.get(assetId) || null;
                    return this._rpcResponse(id, asset);
                }
                case 'getAssetProof': {
                    const assetId = params?.id;
                    const proof = this.assetProofs.get(assetId) || null;
                    return this._rpcResponse(id, proof);
                }
                case 'getAssetsByOwner': {
                    const owner = params?.ownerAddress;
                    const items = this.assetsByOwner.get(owner) || [];
                    return this._rpcResponse(id, { items, total: items.length });
                }
                case 'getTransaction': {
                    const sig = params?.[0];

                    // Check not-finalized override
                    if (this._notFinalizedSigs.has(sig)) {
                        return this._rpcResponse(id, null);
                    }

                    // Check failed-on-chain override
                    if (this._failedOnChainSigs.has(sig)) {
                        return this._rpcResponse(id, { meta: { err: 'InstructionError' } });
                    }

                    const tx = this.transactions.get(sig);
                    if (tx) {
                        return this._rpcResponse(id, { meta: { err: null }, ...tx });
                    }
                    return this._rpcResponse(id, null);
                }
                case 'getBalance': {
                    return this._rpcResponse(id, { value: 5000000000 }); // 5 SOL
                }
                case 'getLatestBlockhash': {
                    return this._rpcResponse(id, {
                        value: {
                            blockhash: 'mock-blockhash-' + Date.now(),
                            lastValidBlockHeight: 999999
                        }
                    });
                }
                default:
                    return this._rpcResponse(id, null);
            }
        } catch (err) {
            return this._jsonResponse({ error: err.message });
        }
    }

    // Handle Enhanced Transactions API (api.helius.xyz)
    handleEnhancedTxRequest(url, options) {
        try {
            // Check failure injection for enhanced tx API
            const failError = this._shouldFail('enhancedTransactions');
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }

            const body = JSON.parse(options.body);
            const signatures = body.transactions || [];
            const results = signatures.map(sig => this.transactions.get(sig) || null).filter(Boolean);
            return this._jsonResponse(results);
        } catch (err) {
            return this._jsonResponse({ error: err.message });
        }
    }

    _rpcResponse(id, result, error = undefined) {
        const data = { jsonrpc: '2.0', id, result };
        if (error) {
            data.error = error;
            data.result = undefined;
        }
        return this._jsonResponse(data);
    }

    _jsonResponse(data, status = 200) {
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data)),
        });
    }
}

// Helper to create a mock NFT asset
export function createMockAsset(id, {
    name = 'Test NFT',
    collection = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW',
    owner = 'TestWallet1111111111111111111111111111111111',
    imageUrl = 'https://example.com/nft.png',
    interfaceType = 'MplCoreAsset',
    compressed = false,
    frozen = false,
    delegated = false,
    burnt = false,
} = {}) {
    const asset = {
        id,
        interface: interfaceType,
        content: {
            metadata: { name },
            links: { image: imageUrl },
            files: [{ uri: imageUrl }],
        },
        grouping: [{ group_key: 'collection', group_value: collection }],
        ownership: { owner, frozen, delegated },
        burnt,
    };

    if (compressed) {
        asset.compression = {
            compressed: true,
            tree: 'MockTree11111111111111111111111111111111111',
            data_hash: '0x' + 'ab'.repeat(32),
            creator_hash: '0x' + 'cd'.repeat(32),
            leaf_id: 0,
        };
    }

    return asset;
}

export const mockHelius = new MockHelius();
