// MidEvils NFT Swap - Wallet Connection

var selectedProvider = null;

function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getAvailableWallets() {
    var wallets = [];
    if (window.phantom?.solana?.isPhantom) {
        wallets.push({ name: 'Phantom', icon: window.phantom.solana.icon || '', provider: window.phantom.solana });
    }
    if (window.solflare?.isSolflare) {
        wallets.push({ name: 'Solflare', icon: window.solflare.icon || '', provider: window.solflare });
    }
    if (window.backpack?.isBackpack) {
        wallets.push({ name: 'Backpack', icon: window.backpack.icon || '', provider: window.backpack });
    }
    // Generic fallback — only if not already matched
    if (window.solana && !wallets.some(function(w) { return w.provider === window.solana; })) {
        wallets.push({ name: 'Solana Wallet', icon: '', provider: window.solana });
    }
    return wallets;
}

function getWalletProvider() {
    if (selectedProvider) return selectedProvider;
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

function showWalletModal(wallets) {
    // Remove existing modal if any
    hideWalletModal();

    var overlay = document.createElement('div');
    overlay.className = 'wallet-modal-overlay';
    overlay.id = 'wallet-modal-overlay';

    var card = document.createElement('div');
    card.className = 'wallet-modal-card';

    var header = document.createElement('div');
    header.className = 'wallet-modal-header';
    header.innerHTML = '<span>Select Wallet</span>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'wallet-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', hideWalletModal);
    header.appendChild(closeBtn);
    card.appendChild(header);

    var list = document.createElement('div');
    list.className = 'wallet-modal-list';

    wallets.forEach(function(w) {
        var btn = document.createElement('button');
        btn.className = 'wallet-modal-option';
        if (w.icon) {
            var img = document.createElement('img');
            img.src = w.icon;
            img.alt = w.name;
            img.className = 'wallet-modal-icon';
            img.onerror = function() { this.style.display = 'none'; };
            btn.appendChild(img);
        }
        var nameSpan = document.createElement('span');
        nameSpan.textContent = w.name;
        btn.appendChild(nameSpan);
        btn.addEventListener('click', function() {
            hideWalletModal();
            connectWithProvider(w.provider);
        });
        list.appendChild(btn);
    });

    card.appendChild(list);
    overlay.appendChild(card);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) hideWalletModal();
    });

    document.body.appendChild(overlay);
}

function hideWalletModal() {
    var existing = document.getElementById('wallet-modal-overlay');
    if (existing) existing.remove();
}

async function connectWithProvider(provider) {
    try {
        var response = await provider.connect();
        selectedProvider = provider;
        connectedWallet = (response?.publicKey || provider.publicKey).toString();
        updateWalletUI(true);
        onWalletConnected();
    } catch (err) {
        console.error('Wallet connection failed:', err);
        showError('Failed to connect wallet: ' + err.message);
    }
}

async function signMessageForAuth(message) {
    const provider = getWalletProvider();
    if (!provider) {
        throw new Error('Wallet not connected');
    }

    const encodedMessage = new TextEncoder().encode(message);
    const signedMessage = await provider.signMessage(encodedMessage, 'utf8');

    const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    // Some wallets (Phantom) return { signature: Uint8Array }
    // Others (Backpack) return the Uint8Array directly
    let signature = signedMessage.signature || signedMessage;

    // If already a string (some wallets return base58), return as-is
    if (typeof signature === 'string') {
        return signature;
    }

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
            connectedWallet = (response?.publicKey || provider.publicKey).toString();
            updateWalletUI(true);
            onWalletConnected();
        } catch (err) {
            console.log('Auto-connect not available:', err.message);
        }
    }
}

async function connectWallet() {
    var wallets = getAvailableWallets();

    if (wallets.length === 0) {
        if (isMobileBrowser()) {
            showMobileWalletPrompt();
        } else {
            showError('No Solana wallet found. Please install Phantom or Solflare to continue.');
        }
        return;
    }

    if (wallets.length === 1) {
        connectWithProvider(wallets[0].provider);
        return;
    }

    showWalletModal(wallets);
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

    selectedProvider = null;
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

function showMobileWalletPrompt() {
    const currentUrl = encodeURIComponent(window.location.href);
    const phantomUrl = `https://phantom.app/ul/browse/${currentUrl}`;
    const solflareUrl = `https://solflare.com/ul/v1/browse/${currentUrl}`;

    hideLoading();
    if (elements.error) {
        elements.error.innerHTML = `
            <div class="mobile-wallet-prompt">
                <p>No wallet detected. Open this page in your wallet app to connect:</p>
                <div class="mobile-wallet-buttons">
                    <a href="${phantomUrl}" class="mobile-wallet-btn phantom-btn">Open in Phantom</a>
                    <a href="${solflareUrl}" class="mobile-wallet-btn solflare-btn">Open in Solflare</a>
                </div>
            </div>
        `;
        elements.error.style.display = 'block';
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

    checkUnseenOffers();
}

async function checkUnseenOffers() {
    if (!connectedWallet) return;
    // Skip on offers page — loadOffers() handles the badge there
    if (window.location.pathname.includes('offers.html')) return;
    try {
        const response = await fetch(`/api/swap/offers?wallet=${connectedWallet}`);
        const data = await response.json();
        if (data.error || !data.offers) return;

        const received = data.offers.filter(o =>
            o.receiver.wallet === connectedWallet && o.status === 'pending'
        );

        const seen = new Set(getSeenOfferIds());
        const unseenCount = received.filter(o => !seen.has(o.id)).length;

        const navLink = document.querySelector('a.nav-link[href*="offers.html"]');
        if (navLink && unseenCount > 0) {
            let badge = navLink.querySelector('.nav-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                navLink.appendChild(badge);
            }
            badge.textContent = unseenCount;
            navLink.classList.add('has-unseen');
        }
    } catch (err) {
        // Non-critical — silently ignore
    }
}
