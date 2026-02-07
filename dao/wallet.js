// DAO Voting - Wallet Connection (adapted from swap/wallet.js)

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
    if (window.solana && !wallets.some(function(w) { return w.provider === window.solana; })) {
        wallets.push({ name: 'Solana Wallet', icon: '', provider: window.solana });
    }
    return wallets;
}

function getWalletProvider() {
    if (selectedProvider) return selectedProvider;
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.solana) return window.solana;
    return null;
}

function showWalletModal(wallets) {
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
    const signedMessage = await provider.signMessage(encodedMessage);

    const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let signature = signedMessage.signature || signedMessage;

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
    var walletStatus = document.getElementById('walletStatus');
    var connectBtn = document.getElementById('connectWalletBtn');
    var disconnectBtn = document.getElementById('disconnectWalletBtn');
    var votingPower = document.getElementById('votingPower');

    if (!walletStatus || !connectBtn) return;

    var statusText = walletStatus.querySelector('.status-text');

    if (connected && connectedWallet) {
        var shortWallet = connectedWallet.slice(0, 4) + '...' + connectedWallet.slice(-4);
        statusText.textContent = shortWallet;
        walletStatus.classList.add('connected');
        connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
    } else {
        statusText.textContent = 'Not Connected';
        walletStatus.classList.remove('connected');
        connectBtn.style.display = 'inline-block';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        if (votingPower) votingPower.style.display = 'none';
    }
}

async function disconnectWallet() {
    const provider = getWalletProvider();
    if (provider) {
        try { await provider.disconnect(); } catch (err) { console.error('Error disconnecting:', err); }
    }

    selectedProvider = null;
    connectedWallet = null;
    orcCount = 0;
    orcMints = [];

    updateWalletUI(false);
    onWalletDisconnected();
}

function showMobileWalletPrompt() {
    const currentUrl = encodeURIComponent(window.location.href);
    const phantomUrl = `https://phantom.app/ul/browse/${currentUrl}`;
    const solflareUrl = `https://solflare.com/ul/v1/browse/${currentUrl}`;

    var errorEl = document.getElementById('errorMsg');
    if (errorEl) {
        errorEl.innerHTML = '<div class="mobile-wallet-prompt"><p>No wallet detected. Open this page in your wallet app:</p><div class="mobile-wallet-buttons"><a href="' + phantomUrl + '" class="mobile-wallet-btn phantom-btn">Open in Phantom</a><a href="' + solflareUrl + '" class="mobile-wallet-btn solflare-btn">Open in Solflare</a></div></div>';
        errorEl.style.display = 'block';
    }
}
