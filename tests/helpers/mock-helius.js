// Mock Helius DAS API responses
// Used to intercept fetch calls to helius-rpc.com and api.helius.xyz

export class MockHelius {
    constructor() {
        this.assets = new Map();
        this.assetProofs = new Map();
        this.assetsByOwner = new Map();
        this.transactions = new Map();
    }

    reset() {
        this.assets.clear();
        this.assetProofs.clear();
        this.assetsByOwner.clear();
        this.transactions.clear();
    }

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
            const body = JSON.parse(options.body);
            const signatures = body.transactions || [];
            const results = signatures.map(sig => this.transactions.get(sig) || null).filter(Boolean);
            return this._jsonResponse(results);
        } catch (err) {
            return this._jsonResponse({ error: err.message });
        }
    }

    _rpcResponse(id, result) {
        return this._jsonResponse({ jsonrpc: '2.0', id, result });
    }

    _jsonResponse(data) {
        return Promise.resolve({
            ok: true,
            status: 200,
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
