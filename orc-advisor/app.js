// Orc Advisor - Visual Novel AI Chat
// Wallet connection adapted from dao/wallet.js

var connectedWallet = null;
var orcCount = 0;
var selectedProvider = null;
var conversationHistory = [];
var isProcessing = false;
var voiceEnabled = false;
var currentAudio = null;
var authSignature = null;
var authMessage = null;

// ========== Wallet Functions (adapted from dao/wallet.js) ==========

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
        var placeholder = document.getElementById('chatPlaceholder');
        if (placeholder) {
            placeholder.textContent = '';
            var p = document.createElement('p');
            p.textContent = 'Wallet connection failed. Please try again.';
            placeholder.appendChild(p);
            placeholder.style.display = '';
        }
    }
}

async function connectWallet() {
    var wallets = getAvailableWallets();

    if (wallets.length === 0) {
        if (isMobileBrowser()) {
            showMobileWalletPrompt();
        } else {
            var placeholder = document.getElementById('chatPlaceholder');
            if (placeholder) {
                placeholder.textContent = '';
                var p = document.createElement('p');
                p.textContent = 'No wallet detected. Install ';
                var phantomLink = document.createElement('a');
                phantomLink.href = 'https://phantom.app';
                phantomLink.target = '_blank';
                phantomLink.rel = 'noopener';
                phantomLink.textContent = 'Phantom';
                var orText = document.createTextNode(' or ');
                var solflareLink = document.createElement('a');
                solflareLink.href = 'https://solflare.com';
                solflareLink.target = '_blank';
                solflareLink.rel = 'noopener';
                solflareLink.textContent = 'Solflare';
                var endText = document.createTextNode(' to continue.');
                p.appendChild(phantomLink);
                p.appendChild(orText);
                p.appendChild(solflareLink);
                p.appendChild(endText);
                placeholder.appendChild(p);
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

function showMobileWalletPrompt() {
    var currentUrl = encodeURIComponent(window.location.href);
    var phantomUrl = 'https://phantom.app/ul/browse/' + currentUrl;
    var solflareUrl = 'https://solflare.com/ul/v1/browse/' + currentUrl;

    var placeholder = document.getElementById('chatPlaceholder');
    if (placeholder) {
        placeholder.innerHTML = '<div class="mobile-wallet-prompt"><p>No wallet detected. Open this page in your wallet app:</p><div class="mobile-wallet-buttons"><a href="' + phantomUrl + '" class="mobile-wallet-btn">Open in Phantom</a><a href="' + solflareUrl + '" class="mobile-wallet-btn">Open in Solflare</a></div></div>';
    }
}

function updateWalletUI(connected) {
    var walletStatus = document.getElementById('walletStatus');
    var connectBtn = document.getElementById('connectWalletBtn');
    var disconnectBtn = document.getElementById('disconnectWalletBtn');

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
    }
}

async function disconnectWallet() {
    var provider = getWalletProvider();
    if (provider) {
        try { await provider.disconnect(); } catch (err) { console.error('Error disconnecting:', err); }
    }

    selectedProvider = null;
    connectedWallet = null;
    orcCount = 0;
    authSignature = null;
    authMessage = null;
    conversationHistory = [];

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    updateWalletUI(false);
    setOrcState('idle');
    setChatEnabled(false);

    var placeholder = document.getElementById('chatPlaceholder');
    var messages = document.getElementById('chatMessages');
    if (placeholder && messages) {
        // Clear all messages except placeholder
        while (messages.firstChild) messages.removeChild(messages.firstChild);
        placeholder.style.display = '';
        placeholder.innerHTML = '<p>Connect your wallet to consult the advisor.</p>';
        messages.appendChild(placeholder);
    }

    var voiceBtn = document.getElementById('voiceToggleBtn');
    if (voiceBtn) voiceBtn.style.display = 'none';
}

async function checkWalletConnection() {
    var provider = getWalletProvider();
    if (provider) {
        try {
            var response = await provider.connect({ onlyIfTrusted: true });
            connectedWallet = (response?.publicKey || provider.publicKey).toString();
            updateWalletUI(true);
            onWalletConnected();
        } catch (err) {
            console.log('Auto-connect not available:', err.message);
        }
    }
}

// bs58 encode (same as dao/wallet.js)
function toBase58(bytes) {
    var bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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
        str += bs58Alphabet[0];
    }
    for (var i = digits.length - 1; i >= 0; i--) {
        str += bs58Alphabet[digits[i]];
    }
    return str;
}

async function signMessageForAuth(message) {
    var provider = getWalletProvider();
    if (!provider) throw new Error('Wallet not connected');

    var encodedMessage = new TextEncoder().encode(message);
    var signedMessage = await provider.signMessage(encodedMessage);
    var signature = signedMessage.signature || signedMessage;

    if (typeof signature === 'string') return signature;
    return toBase58(signature);
}

// ========== Auth Signature Management ==========

async function getAuthCredentials() {
    // Reuse existing signature if still valid (within 4 minutes to leave buffer)
    if (authSignature && authMessage) {
        var timestampMatch = authMessage.match(/at (\d+)$/);
        if (timestampMatch) {
            var ts = parseInt(timestampMatch[1], 10);
            if (Date.now() - ts < 28 * 60 * 1000) {
                return { signature: authSignature, message: authMessage };
            }
        }
    }

    // Sign a new message
    var timestamp = Date.now();
    var message = 'Orc Advisor auth for ' + connectedWallet + ' at ' + timestamp;
    var signature = await signMessageForAuth(message);

    authSignature = signature;
    authMessage = message;

    return { signature: signature, message: message };
}

// ========== Orc Holdings Check ==========

async function fetchOrcCount() {
    try {
        var response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'orc-check-client',
                method: 'getAssetsByOwner',
                params: { ownerAddress: connectedWallet, page: 1, limit: 1000 }
            })
        });
        var data = await response.json();
        var items = (data.result && data.result.items) || [];

        var ORC_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
        var GRAVEYARD = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

        orcCount = 0;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var collections = (item.grouping || [])
                .filter(function(g) { return g.group_key === 'collection'; })
                .map(function(g) { return g.group_value; });

            var isMidEvil = collections.indexOf(ORC_COLLECTION) !== -1;
            var isGraveyard = collections.indexOf(GRAVEYARD) !== -1;
            var name = ((item.content && item.content.metadata && item.content.metadata.name) || '').toLowerCase();
            var isBurnt = item.burnt === true;

            if (isMidEvil && !isGraveyard && !isBurnt && name.indexOf('orc') !== -1) {
                orcCount++;
            }
        }
    } catch (err) {
        console.error('Error fetching Orc count:', err);
        orcCount = 0;
    }

    return orcCount;
}

// ========== Wallet Connected Flow ==========

async function onWalletConnected() {
    var placeholder = document.getElementById('chatPlaceholder');
    if (placeholder) {
        placeholder.innerHTML = '<p>Checking your horde...</p>';
    }

    setOrcState('thinking');
    var count = await fetchOrcCount();

    if (count === 0) {
        // No orcs — show rejection in character
        setOrcState('talking');
        hidePlaceholder();
        var rejectionText = "You dare approach me without an Orc in your horde? Begone, filthy dog! Return when you carry the mark of a true warrior.";
        addAdvisorMessage(rejectionText, true, true);
        setChatEnabled(false);
    } else {
        // Has orcs — enable chat
        setOrcState('idle');
        hidePlaceholder();
        setChatEnabled(true);

        var voiceBtn = document.getElementById('voiceToggleBtn');
        if (voiceBtn) voiceBtn.style.display = 'flex';

        // Show greeting
        var greetings = [
            "Hrrm... a warrior of The Horde approaches. Speak your mind, and be quick about it.",
            "What brings you to Drak's chamber, warrior? Speak!",
            "Ah, another orc holder dares seek my counsel. Very well... what plagues your mind?"
        ];
        var greeting = greetings[Math.floor(Math.random() * greetings.length)];
        addAdvisorMessage(greeting, true, true);
    }
}

// ========== UI Helpers ==========

function setOrcState(state) {
    var img = document.getElementById('orcImage');
    if (!img) return;
    img.className = 'orc-portrait ' + state;
    // Only swap image src if images exist — fallback gracefully
    var newSrc = '/orc-advisor/orc-' + state + '.png';
    if (img.src.indexOf('/orc-advisor/orc-') !== -1) {
        img.src = newSrc;
    }
}

function setChatEnabled(enabled) {
    var input = document.getElementById('chatInput');
    var btn = document.getElementById('chatSendBtn');
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
    if (enabled && input) input.focus();
}

function hidePlaceholder() {
    var placeholder = document.getElementById('chatPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addUserMessage(text) {
    var messages = document.getElementById('chatMessages');
    var div = document.createElement('div');
    div.className = 'chat-message user';
    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    messages.appendChild(div);
    scrollToBottom();
}

function addAdvisorMessage(text, typewriter, skipTTS) {
    var messages = document.getElementById('chatMessages');
    var div = document.createElement('div');
    div.className = 'chat-message advisor';
    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    div.appendChild(bubble);
    messages.appendChild(div);

    if (typewriter) {
        typewriterEffect(bubble, text, skipTTS);
    } else {
        bubble.textContent = text;
        scrollToBottom();
    }

    return bubble;
}

function addThinkingIndicator() {
    var messages = document.getElementById('chatMessages');
    var div = document.createElement('div');
    div.className = 'chat-message advisor';
    div.id = 'thinkingIndicator';
    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
    div.appendChild(bubble);
    messages.appendChild(div);
    scrollToBottom();
}

function removeThinkingIndicator() {
    var indicator = document.getElementById('thinkingIndicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    var messages = document.getElementById('chatMessages');
    if (messages) {
        messages.scrollTop = messages.scrollHeight;
    }
}

// ========== Typewriter Effect ==========

function typewriterEffect(element, text, skipTTS) {
    var index = 0;
    var cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    element.textContent = '';
    element.appendChild(cursor);

    setOrcState('talking');

    // Start TTS fetch immediately in parallel with typing
    var ttsFinished = false;
    var typeFinished = false;

    if (!skipTTS && voiceEnabled && orcCount > 0) {
        playTTS(text).finally(function() {
            ttsFinished = true;
            if (typeFinished) setOrcState('idle');
        });
    } else {
        ttsFinished = true;
    }

    function type() {
        if (index < text.length) {
            var textNode = element.firstChild;
            if (!textNode || textNode.nodeType !== 3) {
                textNode = document.createTextNode('');
                element.insertBefore(textNode, cursor);
            }
            textNode.textContent = text.substring(0, index + 1);
            index++;
            scrollToBottom();
            var delay = 80 + Math.random() * 40;
            setTimeout(type, delay);
        } else {
            cursor.remove();
            element.textContent = text;
            typeFinished = true;
            if (ttsFinished) setOrcState('idle');
        }
    }

    type();
}

// ========== TTS Playback ==========

async function playTTS(text) {
    try {
        var auth = await getAuthCredentials();

        var response = await fetch('/api/orc-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                wallet: connectedWallet,
                signature: auth.signature,
                message: auth.message
            })
        });

        if (!response.ok) {
            console.error('TTS error:', response.status);
            return;
        }

        var blob = await response.blob();
        var url = URL.createObjectURL(blob);

        if (currentAudio) {
            currentAudio.pause();
            URL.revokeObjectURL(currentAudio.src);
        }

        currentAudio = new Audio(url);

        // Return a promise that resolves when audio finishes playing
        return new Promise(function(resolve) {
            currentAudio.addEventListener('ended', function() {
                URL.revokeObjectURL(url);
                currentAudio = null;
                resolve();
            });

            currentAudio.addEventListener('error', function() {
                console.error('Audio playback error');
                URL.revokeObjectURL(url);
                currentAudio = null;
                resolve();
            });

            currentAudio.play().catch(function(err) {
                console.error('Audio play error:', err);
                URL.revokeObjectURL(url);
                currentAudio = null;
                resolve();
            });
        });
    } catch (err) {
        console.error('TTS playback error:', err);
    }
}

// ========== Send Message ==========

async function sendMessage() {
    var input = document.getElementById('chatInput');
    var text = (input.value || '').trim();
    if (!text || isProcessing || !connectedWallet || orcCount === 0) return;

    isProcessing = true;
    setChatEnabled(false);
    input.value = '';

    // Add user message to chat
    addUserMessage(text);

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: text });

    // Show thinking state
    setOrcState('thinking');
    addThinkingIndicator();

    try {
        // Get fresh auth credentials
        var auth;
        try {
            auth = await getAuthCredentials();
        } catch (signErr) {
            console.error('Wallet sign error:', signErr);
            removeThinkingIndicator();
            addAdvisorMessage('*growls* You must sign the message, warrior. Drak cannot hear you otherwise.', false);
            setOrcState('idle');
            isProcessing = false;
            setChatEnabled(true);
            return;
        }

        // Send last 10 messages for context
        var historySlice = conversationHistory.slice(-10);

        var response = await fetch('/api/orc-advisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                wallet: connectedWallet,
                signature: auth.signature,
                msg: auth.message,
                history: historySlice
            })
        });

        removeThinkingIndicator();

        if (!response.ok) {
            var errorData = await response.json().catch(function() { return {}; });
            var errorText = errorData.error || 'The spirits are silent. Try again.';

            if (response.status === 429) {
                errorText = '*grunts* You talk too much, warrior. Give Drak a moment to think.';
            } else if (response.status === 401) {
                // Signature rejected — clear cached auth so next attempt re-signs
                authSignature = null;
                authMessage = null;
                errorText = '*snarls* Your seal is broken. Try speaking again, warrior.';
            }

            addAdvisorMessage(errorText, true);
            conversationHistory.push({ role: 'assistant', content: errorText });
        } else {
            var data = await response.json();
            var reply = data.reply || 'Hrrm... the words escape me.';

            addAdvisorMessage(reply, true);
            conversationHistory.push({ role: 'assistant', content: reply });
        }
    } catch (err) {
        console.error('Send message error:', err);
        removeThinkingIndicator();
        addAdvisorMessage('*clutches head* Something went wrong in the spirit realm. Try again.', false);
        setOrcState('idle');
    }

    isProcessing = false;
    setChatEnabled(true);
}

// ========== Voice Toggle ==========

function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    var btn = document.getElementById('voiceToggleBtn');
    if (!btn) return;

    var label = btn.querySelector('.voice-label');
    if (voiceEnabled) {
        btn.classList.remove('muted');
        if (label) label.textContent = 'Voice On';
    } else {
        btn.classList.add('muted');
        if (label) label.textContent = 'Voice Off';

        // Stop current audio if playing
        if (currentAudio) {
            currentAudio.pause();
            URL.revokeObjectURL(currentAudio.src);
            currentAudio = null;
            setOrcState('idle');
        }
    }
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', function() {
    var connectBtn = document.getElementById('connectWalletBtn');
    var disconnectBtn = document.getElementById('disconnectWalletBtn');
    var sendBtn = document.getElementById('chatSendBtn');
    var chatInput = document.getElementById('chatInput');
    var voiceBtn = document.getElementById('voiceToggleBtn');

    if (connectBtn) connectBtn.addEventListener('click', connectWallet);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoice);

    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    checkWalletConnection();
});
