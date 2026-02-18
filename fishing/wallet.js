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

function fromBase58(str) {
    var alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var bytes = [0];
    for (var i = 0; i < str.length; i++) {
        var value = alphabet.indexOf(str[i]);
        if (value < 0) throw new Error('Invalid base58 character');
        var carry = value;
        for (var j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    // leading zeros
    for (var i = 0; i < str.length && str[i] === '1'; i++) {
        bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
}

// --- Phantom Universal Links (mobile deeplink flow) ---

function cleanupPhantomState() {
    ['phantom_dapp_keypair', 'phantom_session', 'phantom_shared_secret',
     'phantom_wallet', 'phantom_state', 'phantom_sign_message'].forEach(function(k) {
        localStorage.removeItem(k);
    });
}

function startPhantomDeeplink() {
    var connectError = document.getElementById('connectError');
    if (connectError) connectError.textContent = 'Connecting to Phantom...';

    // Generate X25519 keypair for encryption
    var keypair = nacl.box.keyPair();
    localStorage.setItem('phantom_dapp_keypair', JSON.stringify({
        publicKey: toBase58(keypair.publicKey),
        secretKey: toBase58(keypair.secretKey)
    }));
    localStorage.setItem('phantom_state', 'connecting');

    var params = new URLSearchParams({
        app_url: 'https://midhorde.com',
        dapp_encryption_public_key: toBase58(keypair.publicKey),
        cluster: 'mainnet-beta',
        redirect_link: 'https://midhorde.com/fishing/?phantom_action=connect'
    });

    window.location.href = 'https://phantom.app/ul/v1/connect?' + params.toString();
}

function handlePhantomRedirect() {
    var params = new URLSearchParams(window.location.search);
    var action = params.get('phantom_action');
    if (!action) return;

    var connectError = document.getElementById('connectError');

    // Check for error responses from Phantom
    if (params.has('errorCode')) {
        var errorMsg = decodeURIComponent(params.get('errorMessage') || 'Connection rejected');
        if (connectError) connectError.textContent = errorMsg;
        cleanupPhantomState();
        window.history.replaceState({}, '', window.location.pathname);
        return;
    }

    try {
        if (action === 'connect') {
            handlePhantomConnect(params, connectError);
        } else if (action === 'sign') {
            handlePhantomSign(params, connectError);
        }
    } catch (err) {
        console.error('Phantom deeplink error:', err);
        if (connectError) connectError.textContent = 'Connection failed. Please try again.';
        cleanupPhantomState();
        window.history.replaceState({}, '', window.location.pathname);
    }
}

function handlePhantomConnect(params, connectError) {
    var phantomPubKeyB58 = params.get('phantom_encryption_public_key');
    var nonceB58 = params.get('nonce');
    var dataB58 = params.get('data');

    if (!phantomPubKeyB58 || !nonceB58 || !dataB58) {
        throw new Error('Missing connect response params');
    }

    // Recover our keypair from localStorage
    var stored = JSON.parse(localStorage.getItem('phantom_dapp_keypair'));
    if (!stored) throw new Error('Missing dapp keypair');

    var ourSecretKey = fromBase58(stored.secretKey);
    var phantomPubKey = fromBase58(phantomPubKeyB58);
    var nonce = fromBase58(nonceB58);
    var encryptedData = fromBase58(dataB58);

    // Derive shared secret
    var sharedSecret = nacl.box.before(phantomPubKey, ourSecretKey);
    localStorage.setItem('phantom_shared_secret', toBase58(sharedSecret));

    // Decrypt response
    var decrypted = nacl.box.open.after(encryptedData, nonce, sharedSecret);
    if (!decrypted) throw new Error('Failed to decrypt connect response');

    var responseJSON = JSON.parse(nacl.util.decodeUTF8(decrypted));
    var walletAddress = responseJSON.public_key;
    var session = responseJSON.session;

    localStorage.setItem('phantom_wallet', walletAddress);
    localStorage.setItem('phantom_session', session);

    // Build sign message (same format as desktop)
    var timestamp = Date.now();
    var message = 'Sign to play Bobbers\nWallet: ' + walletAddress + '\nTimestamp: ' + timestamp;
    localStorage.setItem('phantom_sign_message', message);
    localStorage.setItem('phantom_state', 'signing');

    // Build signMessage request
    var messageBytes = nacl.util.decodeUTF8(message);
    var payload = JSON.stringify({
        message: toBase58(messageBytes),
        session: session
    });

    var freshNonce = nacl.randomBytes(24);
    var encryptedPayload = nacl.box.after(
        nacl.util.decodeUTF8(payload),
        freshNonce,
        sharedSecret
    );

    var signParams = new URLSearchParams({
        dapp_encryption_public_key: stored.publicKey,
        nonce: toBase58(freshNonce),
        redirect_link: 'https://midhorde.com/fishing/?phantom_action=sign',
        payload: toBase58(encryptedPayload)
    });

    if (connectError) connectError.textContent = 'Redirecting to sign...';
    window.location.href = 'https://phantom.app/ul/v1/signMessage?' + signParams.toString();
}

function handlePhantomSign(params, connectError) {
    var nonceB58 = params.get('nonce');
    var dataB58 = params.get('data');

    if (!nonceB58 || !dataB58) {
        throw new Error('Missing sign response params');
    }

    var sharedSecretB58 = localStorage.getItem('phantom_shared_secret');
    if (!sharedSecretB58) throw new Error('Missing shared secret');

    var sharedSecret = fromBase58(sharedSecretB58);
    var nonce = fromBase58(nonceB58);
    var encryptedData = fromBase58(dataB58);

    // Decrypt signature response
    var decrypted = nacl.box.open.after(encryptedData, nonce, sharedSecret);
    if (!decrypted) throw new Error('Failed to decrypt sign response');

    var responseJSON = JSON.parse(nacl.util.decodeUTF8(decrypted));
    var signature = responseJSON.signature;

    var wallet = localStorage.getItem('phantom_wallet');
    var message = localStorage.getItem('phantom_sign_message');

    if (!wallet || !message) throw new Error('Missing wallet state');

    // Clean up all deeplink state
    cleanupPhantomState();
    window.history.replaceState({}, '', window.location.pathname);

    // Flow into normal game
    onWalletConnected(wallet, signature, message);
}

async function connectWallet() {
    var wallets = getAvailableWallets();

    if (wallets.length === 0) {
        if (isMobileBrowser()) {
            startPhantomDeeplink();
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

// Handle Phantom deeplink redirects on page load
(function() {
    if (new URLSearchParams(window.location.search).has('phantom_action')) {
        // Defer until DOM is ready so connectError element exists
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', handlePhantomRedirect);
        } else {
            handlePhantomRedirect();
        }
    }
})();
