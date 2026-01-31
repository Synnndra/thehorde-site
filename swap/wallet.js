// MidEvils NFT Swap - Wallet Connection

function getWalletProvider() {
    // Phantom
    if (window.phantom?.solana?.isPhantom) {
        return window.phantom.solana;
    }
    // Solflare
    if (window.solflare?.isSolflare) {
        return window.solflare;
    }
    // Generic fallback (Wallet Standard via window.solana)
    if (window.solana) {
        return window.solana;
    }
    return null;
}

async function signMessageForAuth(message) {
    const provider = getWalletProvider();
    if (!provider) {
        throw new Error('Wallet not connected');
    }

    const encodedMessage = new TextEncoder().encode(message);
    const signedMessage = await provider.signMessage(encodedMessage, 'utf8');

    const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let signature = signedMessage.signature;

    function toBase58(bytes) {
        const digits = [0];
        for (let i = 0; i < bytes.length; i++) {
            let carry = bytes[i];
            for (let j = 0; j < digits.length; j++) {
                carry += digits[j] << 8;
                digits[j] = carry % 58;
                carry = (carry / 58) | 0;
            }
            while (carry > 0) {
                digits.push(carry % 58);
                carry = (carry / 58) | 0;
            }
        }
        let str = '';
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
            str += bs58Alphabet[0];
        }
        for (let i = digits.length - 1; i >= 0; i--) {
            str += bs58Alphabet[digits[i]];
        }
        return str;
    }

    return toBase58(signature);
}

async function checkWalletConnection() {
    const provider = getWalletProvider();
    if (provider) {
        try {
            const response = await provider.connect({ onlyIfTrusted: true });
            connectedWallet = response.publicKey.toString();
            updateWalletUI(true);
            onWalletConnected();
        } catch (err) {
            console.log('Auto-connect not available:', err.message);
        }
    }
}

async function connectWallet() {
    const provider = getWalletProvider();

    if (!provider) {
        showError('No Solana wallet found. Please install Phantom or Solflare to continue.');
        return;
    }

    try {
        const response = await provider.connect();
        connectedWallet = response.publicKey.toString();
        updateWalletUI(true);
        onWalletConnected();
    } catch (err) {
        console.error('Wallet connection failed:', err);
        showError('Failed to connect wallet: ' + err.message);
    }
}

function updateWalletUI(connected) {
    if (!elements.walletStatus || !elements.connectWalletBtn) return;

    const statusText = elements.walletStatus.querySelector('.status-text');

    if (connected && connectedWallet) {
        const shortWallet = connectedWallet.slice(0, 4) + '...' + connectedWallet.slice(-4);
        statusText.textContent = shortWallet;
        elements.walletStatus.classList.add('connected');
        elements.connectWalletBtn.textContent = 'Connected';
        elements.connectWalletBtn.classList.add('connected');
        elements.connectWalletBtn.style.display = 'none';
        if (elements.disconnectWalletBtn) {
            elements.disconnectWalletBtn.style.display = 'inline-block';
        }
    } else {
        statusText.textContent = 'Not Connected';
        elements.walletStatus.classList.remove('connected');
        elements.connectWalletBtn.textContent = 'Connect Wallet';
        elements.connectWalletBtn.classList.remove('connected');
        elements.connectWalletBtn.style.display = 'inline-block';
        if (elements.disconnectWalletBtn) {
            elements.disconnectWalletBtn.style.display = 'none';
        }
    }
}

async function disconnectWallet() {
    const provider = getWalletProvider();

    if (provider) {
        try {
            await provider.disconnect();
        } catch (err) {
            console.error('Error disconnecting:', err);
        }
    }

    connectedWallet = null;
    yourNFTs = [];
    theirNFTs = [];
    selectedYourNFTs = [];
    selectedTheirNFTs = [];
    isOrcHolder = false;
    solBalance = 0;

    updateWalletUI(false);

    if (elements.tradePartnerSection) {
        elements.tradePartnerSection.style.display = 'none';
    }
    if (elements.tradeBuilder) {
        elements.tradeBuilder.style.display = 'none';
    }
    if (elements.tradeSummary) {
        elements.tradeSummary.style.display = 'none';
    }
    if (elements.offersSection) {
        elements.offersSection.style.display = 'none';
    }

    if (elements.yourNFTGrid) {
        elements.yourNFTGrid.innerHTML = '<div class="empty-state">Connect wallet to see your NFTs</div>';
    }
    if (elements.theirNFTGrid) {
        elements.theirNFTGrid.innerHTML = '<div class="empty-state">Enter a wallet address above to see their NFTs</div>';
    }
}

function onWalletConnected() {
    const path = window.location.pathname;

    if (path.includes('offers.html')) {
        loadOffers();
    } else if (path.includes('offer.html')) {
        fetchSolBalance(connectedWallet).then(balance => {
            solBalance = balance;
        });
        const urlParams = new URLSearchParams(window.location.search);
        const offerId = urlParams.get('id');
        if (offerId) loadOfferDetails(offerId);
    } else {
        if (elements.tradePartnerSection) {
            elements.tradePartnerSection.style.display = 'block';
        }
        loadYourNFTs();
    }
}
