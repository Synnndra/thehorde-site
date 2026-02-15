// Fishing Game - Wallet Connection (adapted from swap/wallet.js)

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
    // Generic fallback
    if (window.solana && !wallets.some(function(w) { return w.provider === window.solana; })) {
        wallets.push({ name: 'Solana Wallet', icon: '', provider: window.solana });
    }
    return wallets;
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
    var connectError = document.getElementById('connectError');
    try {
        if (connectError) connectError.textContent = '';
        var response = await provider.connect();
        selectedProvider = provider;
        var wallet = (response?.publicKey || provider.publicKey).toString();

        // Require signature to prove wallet ownership
        if (connectError) connectError.textContent = 'Please sign the message to verify ownership...';
        var timestamp = Date.now();
        var message = 'Sign to play Bobbers\nWallet: ' + wallet + '\nTimestamp: ' + timestamp;
        var encodedMessage = new TextEncoder().encode(message);
        var signedMessage = await provider.signMessage(encodedMessage);

        // Extract signature bytes
        var sigBytes = signedMessage.signature || signedMessage;
        var signature = typeof sigBytes === 'string' ? sigBytes : toBase58(sigBytes);

        if (connectError) connectError.textContent = '';
        onWalletConnected(wallet, signature, message);
    } catch (err) {
        console.error('Wallet connection failed:', err);
        if (err.message && err.message.includes('User rejected')) {
            if (connectError) connectError.textContent = 'Signature required to play. Please try again.';
        } else {
            if (connectError) connectError.textContent = 'Failed to connect: ' + err.message;
        }
        // Disconnect if they connected but refused to sign
        if (selectedProvider) {
            try { await selectedProvider.disconnect(); } catch(e) {}
            selectedProvider = null;
        }
    }
}

function toBase58(bytes) {
    var alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var digits = [0];
    for (var i = 0; i < bytes.length; i++) {
        var carry = bytes[i];
        for (var j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    var str = '';
    for (var i = 0; i < bytes.length && bytes[i] === 0; i++) {
        str += alphabet[0];
    }
    for (var i = digits.length - 1; i >= 0; i--) {
        str += alphabet[digits[i]];
    }
    return str;
}

async function connectWallet() {
    var wallets = getAvailableWallets();

    if (wallets.length === 0) {
        if (isMobileBrowser()) {
            var connectError = document.getElementById('connectError');
            var currentUrl = encodeURIComponent(window.location.href);
            if (connectError) {
                connectError.innerHTML = 'No wallet detected. <a href="https://phantom.app/ul/browse/' + currentUrl + '" style="color:var(--gold);">Open in Phantom</a>';
            }
        } else {
            var connectError = document.getElementById('connectError');
            if (connectError) {
                connectError.innerHTML = 'No wallet detected. Please install <a href="https://phantom.app/" target="_blank" style="color:var(--gold);">Phantom</a> or another Solana wallet.';
            }
        }
        return;
    }

    if (wallets.length === 1) {
        connectWithProvider(wallets[0].provider);
        return;
    }

    showWalletModal(wallets);
}


// Called when wallet is connected and signature verified
function onWalletConnected(wallet, signature, message) {
    if (typeof handleWalletConnected === 'function') {
        handleWalletConnected(wallet, signature, message);
    }
}
