// Extract Buffer from @solana/web3.js's internal bundle and expose it globally.
// Wallets like Solflare expect window.Buffer to exist; Phantom injects its own
// but other wallets do not. The web3.js IIFE bundles a full Buffer implementation
// so we pull it out via PublicKey.toBuffer().constructor.
if (typeof Buffer === 'undefined') {
    try {
        window.Buffer = new solanaWeb3.PublicKey('11111111111111111111111111111111').toBuffer().constructor;
    } catch (e) {
        // solanaWeb3 not loaded yet or toBuffer unavailable — Buffer stays undefined
    }
}
