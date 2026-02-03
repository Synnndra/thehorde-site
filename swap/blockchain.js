// MidEvils NFT Swap - Solana Blockchain Functions

// RPC helper - calls our proxy endpoint
async function rpcCall(method, params = []) {
    const response = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        })
    });
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result;
}

async function getLatestBlockhash() {
    const result = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    return {
        blockhash: result.value.blockhash,
        lastValidBlockHeight: result.value.lastValidBlockHeight
    };
}

async function sendTransaction(serializedTransaction) {
    const base64Tx = btoa(String.fromCharCode.apply(null, serializedTransaction));
    const signature = await rpcCall('sendTransaction', [base64Tx, {
        encoding: 'base64',
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 3
    }]);
    return signature;
}

async function getSignatureStatus(signature) {
    const result = await rpcCall('getSignatureStatuses', [[signature]]);
    return result.value[0];
}

async function getAccountInfo(pubkey) {
    const result = await rpcCall('getAccountInfo', [pubkey.toBase58(), { encoding: 'base64' }]);
    return result.value;
}

function getSolanaConnection() {
    return { rpcEndpoint: SOLANA_RPC };
}

function getProgramId() {
    return new solanaWeb3.PublicKey(PROGRAM_ID);
}

function getFeeWallet() {
    return new solanaWeb3.PublicKey(FEE_WALLET);
}

function getTokenProgramId() {
    return new solanaWeb3.PublicKey(TOKEN_PROGRAM_ID);
}

function getAssociatedTokenProgramId() {
    return new solanaWeb3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
}

async function getOfferPDA(offerId) {
    const programId = getProgramId();
    const encoder = new TextEncoder();
    const [pda, bump] = await solanaWeb3.PublicKey.findProgramAddress(
        [encoder.encode('offer'), encoder.encode(offerId)],
        programId
    );
    return { pda, bump };
}

async function getATA(mint, owner) {
    const tokenProgramId = getTokenProgramId();
    const associatedTokenProgramId = getAssociatedTokenProgramId();

    const [ata] = await solanaWeb3.PublicKey.findProgramAddress(
        [
            owner.toBytes(),
            tokenProgramId.toBytes(),
            mint.toBytes(),
        ],
        associatedTokenProgramId
    );
    return ata;
}

function createATAInstruction(mint, owner, payer) {
    const tokenProgramId = getTokenProgramId();
    const associatedTokenProgramId = getAssociatedTokenProgramId();
    const SYSVAR_RENT_PUBKEY = new solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111');

    const ata = solanaWeb3.PublicKey.findProgramAddressSync(
        [owner.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
        associatedTokenProgramId
    )[0];

    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: associatedTokenProgramId,
        data: new Uint8Array(0),
    });
}

function createTokenTransferInstruction(source, destination, owner, amount) {
    const tokenProgramId = getTokenProgramId();

    const keys = [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
    ];

    const data = new Uint8Array(9);
    data[0] = 3;
    const amountBigInt = BigInt(amount);
    for (let i = 0; i < 8; i++) {
        data[1 + i] = Number((amountBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: tokenProgramId,
        data,
    });
}

async function ataExists(ata) {
    try {
        const account = await getAccountInfo(ata);
        return account !== null;
    } catch {
        return false;
    }
}

async function getTokenAccountsForMint(owner, mint) {
    try {
        const result = await rpcCall('getTokenAccountsByOwner', [
            owner.toBase58(),
            { mint: mint.toBase58() },
            { encoding: 'jsonParsed' }
        ]);
        return result.value || [];
    } catch (err) {
        console.error('Error getting token accounts:', err);
        return [];
    }
}

async function getAssetWithProof(assetId) {
    try {
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-asset-proof',
                method: 'getAsset',
                params: {
                    id: assetId,
                    displayOptions: {
                        showFungible: false,
                        showUnverifiedCollections: true
                    }
                }
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        return data.result;
    } catch (err) {
        console.error('Error getting asset:', err);
        return null;
    }
}

async function getAssetProof(assetId) {
    try {
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-proof',
                method: 'getAssetProof',
                params: { id: assetId }
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        return data.result;
    } catch (err) {
        console.error('Error getting asset proof:', err);
        return null;
    }
}

function createBubblegumTransferInstruction(
    treeAddress, leafOwner, newLeafOwner, leafDelegate,
    merkleTree, rootHash, dataHash, creatorHash, nonce, index, proof
) {
    const BUBBLEGUM_PROGRAM_ID = new solanaWeb3.PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
    const SPL_NOOP_PROGRAM_ID_BG = new solanaWeb3.PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
    const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new solanaWeb3.PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

    const [treeAuthority] = solanaWeb3.PublicKey.findProgramAddressSync(
        [treeAddress.toBytes()],
        BUBBLEGUM_PROGRAM_ID
    );

    const keys = [
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        { pubkey: leafDelegate, isSigner: false, isWritable: false },
        { pubkey: newLeafOwner, isSigner: false, isWritable: false },
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        { pubkey: SPL_NOOP_PROGRAM_ID_BG, isSigner: false, isWritable: false },
        { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    for (const proofNode of proof) {
        keys.push({ pubkey: new solanaWeb3.PublicKey(proofNode), isSigner: false, isWritable: false });
    }

    const discriminator = new Uint8Array(BUBBLEGUM_TRANSFER_DISCRIMINATOR);
    const rootBytes = hexToBytes(rootHash);
    const dataHashBytes = hexToBytes(dataHash);
    const creatorHashBytes = hexToBytes(creatorHash);

    const nonceBytes = new Uint8Array(8);
    const nonceBigInt = BigInt(nonce);
    for (let i = 0; i < 8; i++) {
        nonceBytes[i] = Number((nonceBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }

    const indexBytes = new Uint8Array(4);
    indexBytes[0] = index & 0xff;
    indexBytes[1] = (index >> 8) & 0xff;
    indexBytes[2] = (index >> 16) & 0xff;
    indexBytes[3] = (index >> 24) & 0xff;

    const data = new Uint8Array(8 + 32 + 32 + 32 + 8 + 4);
    data.set(discriminator, 0);
    data.set(rootBytes, 8);
    data.set(dataHashBytes, 40);
    data.set(creatorHashBytes, 72);
    data.set(nonceBytes, 104);
    data.set(indexBytes, 112);

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: BUBBLEGUM_PROGRAM_ID,
        data,
    });
}

// MPL Core program ID (client-side constant)
const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const SPL_NOOP_PROGRAM_ID = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';

function createMplCoreTransferInstruction(assetId, fromPubkey, toPubkey, collectionAddress) {
    collectionAddress = collectionAddress || null;
    const programId = new solanaWeb3.PublicKey(MPL_CORE_PROGRAM_ID);
    const asset = new solanaWeb3.PublicKey(assetId);
    const systemProgram = solanaWeb3.SystemProgram.programId;
    const logWrapper = new solanaWeb3.PublicKey(SPL_NOOP_PROGRAM_ID);

    const data = new Uint8Array(MPL_CORE_TRANSFER_DISCRIMINATOR);

    const keys = [
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: collectionAddress ? new solanaWeb3.PublicKey(collectionAddress) : programId, isSigner: false, isWritable: false },
        { pubkey: fromPubkey, isSigner: true, isWritable: true },
        { pubkey: fromPubkey, isSigner: false, isWritable: false },
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        { pubkey: systemProgram, isSigner: false, isWritable: false },
        { pubkey: logWrapper, isSigner: false, isWritable: false },
    ];

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId,
        data,
    });
}

function hexToBytes(hex) {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

async function transferCompressedNFT(assetId, fromPubkey, toPubkey, transaction) {
    const [asset, proof] = await Promise.all([
        getAssetWithProof(assetId),
        getAssetProof(assetId)
    ]);

    if (!asset) throw new Error('Failed to get asset data for ' + assetId);
    if (!proof) throw new Error('Failed to get proof for ' + assetId);

    const compression = asset.compression;
    if (!compression || !compression.compressed) {
        throw new Error('Asset is not a compressed NFT');
    }

    const merkleTree = new solanaWeb3.PublicKey(compression.tree);

    const ix = createBubblegumTransferInstruction(
        merkleTree, fromPubkey, toPubkey, fromPubkey,
        merkleTree, proof.root, compression.data_hash,
        compression.creator_hash, compression.leaf_id,
        compression.leaf_id, proof.proof
    );

    transaction.add(ix);
}

async function signAndSubmitTransaction(transaction, retryCount) {
    retryCount = retryCount || 0;
    const provider = getWalletProvider();

    try {
        const { blockhash } = await getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        const { signature } = await provider.signAndSendTransaction(transaction, {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 3
        });

        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 30;

        while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;

            try {
                const status = await getSignatureStatus(signature);
                if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
                    if (status.err) {
                        throw new Error('Transaction failed: ' + JSON.stringify(status.err));
                    }
                    confirmed = true;
                }
            } catch (statusErr) {
                console.log('Status check error:', statusErr.message);
            }
        }

        if (!confirmed) {
            return { success: false, error: 'Transaction confirmation timed out. It may still complete — please wait and try again.' };
        }

        return { success: true, signature };
    } catch (err) {
        console.error('Transaction failed:', err);
        return { success: false, error: err.message };
    }
}

async function fetchSolBalance(walletAddress) {
    try {
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'balance-check',
                method: 'getBalance',
                params: [walletAddress]
            })
        });

        const data = await response.json();
        if (data.result?.value !== undefined) {
            return data.result.value / 1_000_000_000;
        }
        return 0;
    } catch (err) {
        console.error('Error fetching SOL balance:', err);
        return 0;
    }
}
