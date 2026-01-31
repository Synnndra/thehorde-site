// Shared test data factory for failure simulation tests
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const ESCROW_WALLET = 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh';
const FEE_WALLET = '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq';

/**
 * Generate an Ed25519 keypair and return wallet address + secret key.
 */
export function makeWallet() {
    const kp = nacl.sign.keyPair();
    return {
        wallet: bs58.encode(kp.publicKey),
        secretKey: kp.secretKey,
        kp,
    };
}

/**
 * Sign a message string and return bs58-encoded signature.
 */
export function signMessage(message, secretKey) {
    const bytes = new TextEncoder().encode(message);
    return bs58.encode(nacl.sign.detached(bytes, secretKey));
}

/**
 * Build an offer object in pending state.
 */
export function createPendingOffer(initiator, receiver, overrides = {}) {
    const offerId = overrides.id || 'offer_' + 'a'.repeat(32);
    return {
        id: offerId,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        initiator: {
            wallet: initiator.wallet,
            nfts: [],
            nftDetails: [],
            sol: 1,
        },
        receiver: {
            wallet: receiver.wallet,
            nfts: [],
            nftDetails: [],
            sol: 0,
        },
        fee: 0.02,
        isOrcHolder: false,
        escrowTxSignature: 'escrowTx' + 'a'.repeat(40),
        ...overrides,
    };
}

/**
 * Build an offer in escrowed state (after accept, before release completes).
 */
export function createEscrowedOffer(initiator, receiver, overrides = {}) {
    return createPendingOffer(initiator, receiver, {
        status: 'escrowed',
        escrowedAt: Date.now() - 60000, // 1 minute ago
        receiverTxSignature: 'recvTx' + 'b'.repeat(42),
        receiverTransferComplete: true,
        releaseToReceiverComplete: false,
        releaseToInitiatorComplete: false,
        ...overrides,
    });
}

/**
 * Build a valid create request with proper signature.
 */
export function makeCreateRequest(initiator, receiver, overrides = {}) {
    const timestamp = Date.now();
    const message = `Midswap create offer from ${initiator.wallet} to ${receiver.wallet} at ${timestamp}`;
    const signature = signMessage(message, initiator.secretKey);

    return {
        initiatorWallet: initiator.wallet,
        receiverWallet: receiver.wallet,
        initiatorNfts: [],
        receiverNfts: [],
        initiatorSol: 1,
        receiverSol: 0.5,
        escrowTxSignature: 'escrowTx' + Math.random().toString(36).slice(2).padEnd(40, '0'),
        signature,
        message,
        ...overrides,
    };
}

/**
 * Build a valid accept request with proper signature.
 */
export function makeAcceptRequest(receiver, offerId, overrides = {}) {
    const timestamp = Date.now();
    const message = `Midswap accept offer ${offerId} at ${timestamp}`;
    const signature = signMessage(message, receiver.secretKey);

    return {
        offerId,
        wallet: receiver.wallet,
        signature,
        message,
        ...overrides,
    };
}

/**
 * Build a valid cancel request with proper signature.
 */
export function makeCancelRequest(wallet, offerId, action = 'cancel', overrides = {}) {
    const timestamp = Date.now();
    const message = `Midswap ${action} offer ${offerId} at ${timestamp}`;
    const signature = signMessage(message, wallet.secretKey);

    return {
        offerId,
        wallet: wallet.wallet,
        action,
        signature,
        message,
        ...overrides,
    };
}

/**
 * Build a valid retry-release request with proper signature.
 */
export function makeRetryReleaseRequest(wallet, offerId, overrides = {}) {
    const timestamp = Date.now();
    const message = `Midswap retry-release offer ${offerId} at ${timestamp}`;
    const signature = signMessage(message, wallet.secretKey);

    return {
        offerId,
        wallet: wallet.wallet,
        signature,
        message,
        ...overrides,
    };
}

/**
 * Set up mock Helius data for a successful create escrow TX.
 */
export function setupCreateEscrowTx(mockHelius, txSig, senderWallet, solAmount = 1, fee = 0.02) {
    mockHelius.addTransaction(txSig, {
        transactionError: null,
        nativeTransfers: [
            {
                fromUserAccount: senderWallet,
                toUserAccount: ESCROW_WALLET,
                amount: Math.floor(solAmount * 1e9),
            },
            ...(fee > 0 ? [{
                fromUserAccount: senderWallet,
                toUserAccount: FEE_WALLET,
                amount: Math.floor(fee * 1e9),
            }] : []),
        ],
        tokenTransfers: [],
        instructions: [],
    });
    // Also register for getTransaction (finalization check)
    // The mock already handles this via the transactions map
}

/**
 * Store an offer in mock KV in the format the handlers expect.
 */
export function storeOffer(mockKV, offer) {
    mockKV.set(`offer:${offer.id}`, JSON.stringify(offer));
}
