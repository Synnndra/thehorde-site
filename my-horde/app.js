// My Horde - Client Logic

let connectedWallet = null;
let holdersData = null;
let myHolder = null;
let traitData = {}; // mint -> traits object
let currentSort = 'number';
let badgeData = { eventBadges: [], swapCount: 0 };

// Badge definitions (stat-based, computed client-side)
var STAT_BADGES = [
    { id: 'warlord', name: 'Warlord', description: 'Hold 50+ orcs', icon: '⚔️', image: '/badges/warlord.png', check: function(h, b) { return h.count >= 50; } },
    { id: 'commander', name: 'Commander', description: 'Hold 20+ orcs', icon: '🛡️', image: '/badges/commander.png', check: function(h, b) { return h.count >= 20; } },
    { id: 'squad_leader', name: 'Squad Leader', description: 'Hold 10+ orcs', icon: '⚔️', image: '/badges/squad_leader.png', check: function(h, b) { return h.count >= 10; } },
    { id: 'recruit', name: 'Recruit', description: 'Hold your first orc', icon: '👶', image: '/badges/recruit.png', check: function(h, b) { return h.count >= 1; } },
    { id: 'enlisted', name: 'Enlisted', description: '100% of orcs enlisted', icon: '🎖️', image: '/badges/enlisted.png', check: function(h, b) {
        if (h.count === 0) return false;
        var frozen = 0;
        h.orcs.forEach(function(o) { if (o.isFrozen) frozen++; });
        return frozen === h.count;
    }},
    { id: 'drill_sergeant', name: 'Drill Sergeant', description: '10+ orcs enlisted', icon: '🎖️', image: '/badges/drill_sergeant.png', check: function(h, b) {
        var frozen = 0;
        h.orcs.forEach(function(o) { if (o.isFrozen) frozen++; });
        return frozen >= 10;
    }},
    { id: 'legendary_keeper', name: 'Legendary Keeper', description: 'Own a Legendary orc (top 10 rarity)', icon: '👑', image: '/badges/legendary_keeper.png', check: function(h, b) {
        return h.orcs.some(function(o) { return o.rarityRank && o.rarityRank <= 10; });
    }},
    { id: 'rare_collector', name: 'Rare Collector', description: 'Own 5+ Epic or Legendary orcs', icon: '💎', image: '/badges/rare_collector.png', check: function(h, b) {
        var count = 0;
        h.orcs.forEach(function(o) { if (o.rarityRank && o.rarityRank <= 40) count++; });
        return count >= 5;
    }},
    { id: 'diversity', name: 'Diversity', description: 'Own orcs across all 4 rarity tiers', icon: '🌈', image: '/badges/diversity.png', check: function(h, b) {
        var tiers = { legendary: false, epic: false, rare: false, common: false };
        h.orcs.forEach(function(o) {
            if (!o.rarityRank) return;
            var t = getRarityTier(o.rarityRank);
            tiers[t] = true;
        });
        return tiers.legendary && tiers.epic && tiers.rare && tiers.common;
    }},
    { id: 'trader', name: 'Trader', description: 'Completed a swap', icon: '🤝', image: '/badges/trader.png', check: function(h, b) { return b.swapCount >= 1; } },
    { id: 'deal_maker', name: 'Deal Maker', description: 'Completed 5+ swaps', icon: '💼', image: '/badges/deal_maker.png', check: function(h, b) { return b.swapCount >= 5; } },
    { id: 'fully_connected', name: 'Fully Connected', description: 'Linked both Discord and X', icon: '🔗', image: '/badges/fully_connected.png', check: function(h, b) { return h.discord != null && h.x != null; } }
];

// --- Wallet ---

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
        onWalletConnected();
    } catch (err) {
        console.error('Wallet connection failed:', err);
    }
}

async function connectWallet() {
    var wallets = getAvailableWallets();

    if (wallets.length === 0) {
        if (isMobileBrowser()) {
            const currentUrl = encodeURIComponent(window.location.href);
            var frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode('No wallet detected. '));
            var phantomLink = document.createElement('a');
            phantomLink.href = 'https://phantom.app/ul/browse/' + currentUrl;
            phantomLink.style.color = '#c9a227';
            phantomLink.textContent = 'Open in Phantom';
            frag.appendChild(phantomLink);
            frag.appendChild(document.createTextNode(' or '));
            var solflareLink = document.createElement('a');
            solflareLink.href = 'https://solflare.com/ul/v1/browse/' + currentUrl;
            solflareLink.style.color = '#c9a227';
            solflareLink.textContent = 'Solflare';
            frag.appendChild(solflareLink);
            showError(frag);
        } else {
            showError('No Solana wallet found. Please install Phantom or Solflare.');
        }
        return;
    }

    if (wallets.length === 1) {
        connectWithProvider(wallets[0].provider);
        return;
    }

    showWalletModal(wallets);
}

async function disconnectWallet() {
    const provider = getWalletProvider();
    if (provider) {
        try { await provider.disconnect(); } catch (e) { /* ignore */ }
    }
    selectedProvider = null;
    connectedWallet = null;
    myHolder = null;
    traitData = {};
    document.getElementById('connect-prompt').style.display = '';
    document.getElementById('connected-content').style.display = 'none';
}

function onWalletConnected() {
    document.getElementById('connect-prompt').style.display = 'none';
    document.getElementById('connected-content').style.display = '';
    updateWalletUI();
    loadData();

    // Check for pending wallet link (step 2)
    var pending = getPendingWalletLink();
    if (pending && connectedWallet !== pending.walletA) {
        showWalletLinkStep2Prompt();
        if (confirm('You have a pending wallet link from ' + pending.walletA.slice(0, 4) + '...' + pending.walletA.slice(-4) + '. Complete the link with this wallet?')) {
            completeWalletLink();
        }
    }
}

function updateWalletUI() {
    const walletAddr = document.getElementById('wallet-address');
    const linkBtn = document.getElementById('link-discord-btn');
    const unlinkBtn = document.getElementById('unlink-discord-btn');
    const linkXBtn = document.getElementById('link-x-btn');
    const unlinkXBtn = document.getElementById('unlink-x-btn');
    const privacyInfo = document.querySelector('.privacy-info');
    const linkWalletBtn = document.getElementById('link-wallet-btn');
    const unlinkWalletBtn = document.getElementById('unlink-wallet-btn');
    const cancelWalletLinkBtn = document.getElementById('cancel-wallet-link-btn');
    const linkedWalletInfo = document.getElementById('linked-wallet-info');
    const walletLinkStep2 = document.getElementById('wallet-link-step2');

    if (connectedWallet) {
        walletAddr.textContent = connectedWallet.slice(0, 4) + '...' + connectedWallet.slice(-4);
        walletAddr.title = 'Click to copy: ' + connectedWallet;

        const discordInfo = getStoredDiscord();
        const isLinked = isWalletLinked();

        if (discordInfo && !isLinked) {
            linkBtn.style.display = '';
            unlinkBtn.style.display = 'none';
        } else if (isLinked) {
            linkBtn.style.display = 'none';
            unlinkBtn.style.display = '';
        } else {
            linkBtn.style.display = 'none';
            unlinkBtn.style.display = 'none';
        }

        const xInfo = getStoredX();
        const isXLinked = isWalletXLinked();

        if (xInfo && !isXLinked) {
            linkXBtn.style.display = '';
            unlinkXBtn.style.display = 'none';
        } else if (isXLinked) {
            linkXBtn.style.display = 'none';
            unlinkXBtn.style.display = '';
        } else {
            linkXBtn.style.display = 'none';
            unlinkXBtn.style.display = 'none';
        }

        // Wallet link button visibility
        var pending = getPendingWalletLink();
        var linkedW = getLinkedWallet();

        if (pending) {
            // Pending link in progress
            linkWalletBtn.style.display = 'none';
            unlinkWalletBtn.style.display = 'none';
            cancelWalletLinkBtn.style.display = '';
            linkedWalletInfo.style.display = 'none';
            if (connectedWallet === pending.walletA) {
                showWalletLinkStep2Prompt();
            } else {
                walletLinkStep2.style.display = 'none';
            }
        } else if (linkedW) {
            // Already linked
            linkWalletBtn.style.display = 'none';
            unlinkWalletBtn.style.display = '';
            cancelWalletLinkBtn.style.display = 'none';
            walletLinkStep2.style.display = 'none';
            linkedWalletInfo.style.display = '';
            linkedWalletInfo.innerHTML = 'Linked: <span class="linked-addr">' + linkedW.slice(0, 4) + '...' + linkedW.slice(-4) + '</span>';
        } else if (myHolder || holdersData) {
            // Can link
            linkWalletBtn.style.display = '';
            unlinkWalletBtn.style.display = 'none';
            cancelWalletLinkBtn.style.display = 'none';
            walletLinkStep2.style.display = 'none';
            linkedWalletInfo.style.display = 'none';
        } else {
            linkWalletBtn.style.display = 'none';
            unlinkWalletBtn.style.display = 'none';
            cancelWalletLinkBtn.style.display = 'none';
            walletLinkStep2.style.display = 'none';
            linkedWalletInfo.style.display = 'none';
        }

        if (privacyInfo) {
            const anyLinkVisible = linkBtn.style.display !== 'none' || unlinkBtn.style.display !== 'none' ||
                linkXBtn.style.display !== 'none' || unlinkXBtn.style.display !== 'none' ||
                linkWalletBtn.style.display !== 'none' || unlinkWalletBtn.style.display !== 'none' ||
                cancelWalletLinkBtn.style.display !== 'none';
            privacyInfo.style.display = anyLinkVisible ? '' : 'none';
        }
    }

    renderSocialStatus();
}

// --- Stored Social ---

function getStoredDiscord() {
    const username = localStorage.getItem('discord_username');
    const id = localStorage.getItem('discord_id');
    const avatar = localStorage.getItem('discord_avatar');
    if (!username) return null;
    return { username, id, avatar };
}

function isWalletLinked() {
    if (!connectedWallet || !holdersData) return false;
    const holder = holdersData.holders.find(function(h) { return h.wallet === connectedWallet; });
    return holder?.discord != null;
}

function getStoredX() {
    const username = localStorage.getItem('x_username');
    const id = localStorage.getItem('x_id');
    const avatar = localStorage.getItem('x_avatar');
    if (!username) return null;
    return { username, id, avatar };
}

function isWalletXLinked() {
    if (!connectedWallet || !holdersData) return false;
    const holder = holdersData.holders.find(function(h) { return h.wallet === connectedWallet; });
    return holder?.x != null;
}

// --- Base58 ---

function toBase58(bytes) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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
        str += alphabet[0];
    }
    for (let i = digits.length - 1; i >= 0; i--) {
        str += alphabet[digits[i]];
    }
    return str;
}

// --- Discord Linking ---

async function linkDiscord() {
    if (!connectedWallet) return;
    const discord = getStoredDiscord();
    if (!discord) {
        showError('No Discord linked. Use the Discord button on the home page first.');
        return;
    }

    const provider = getWalletProvider();
    if (!provider) return;

    try {
        const message = 'Link Discord to wallet ' + connectedWallet + ' on midhorde.com';
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature: signature, discord: discord })
        });

        const data = await res.json();
        if (data.error) {
            showError('Link failed: ' + data.error);
            return;
        }

        await loadData();
    } catch (err) {
        console.error('Link Discord failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to link Discord. Please try again.');
    }
}

async function unlinkDiscord() {
    if (!connectedWallet) return;
    const provider = getWalletProvider();
    if (!provider) return;

    try {
        const message = 'Unlink Discord from wallet ' + connectedWallet + ' on midhorde.com';
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature: signature })
        });

        const data = await res.json();
        if (data.error) {
            showError('Unlink failed: ' + data.error);
            return;
        }

        await loadData();
    } catch (err) {
        console.error('Unlink Discord failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to unlink Discord. Please try again.');
    }
}

// --- X Linking ---

async function linkX() {
    if (!connectedWallet) return;
    const x = getStoredX();
    if (!x) {
        showError('No X account linked. Use the X button on the home page first.');
        return;
    }

    const provider = getWalletProvider();
    if (!provider) return;

    try {
        const message = 'Link X to wallet ' + connectedWallet + ' on midhorde.com';
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link-x', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature: signature, x: x })
        });

        const data = await res.json();
        if (data.error) {
            showError('Link failed: ' + data.error);
            return;
        }

        await loadData();
    } catch (err) {
        console.error('Link X failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to link X. Please try again.');
    }
}

async function unlinkX() {
    if (!connectedWallet) return;
    const provider = getWalletProvider();
    if (!provider) return;

    try {
        const message = 'Unlink X from wallet ' + connectedWallet + ' on midhorde.com';
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link-x', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature: signature })
        });

        const data = await res.json();
        if (data.error) {
            showError('Unlink failed: ' + data.error);
            return;
        }

        await loadData();
    } catch (err) {
        console.error('Unlink X failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to unlink X. Please try again.');
    }
}

// --- Wallet Linking ---

function getPendingWalletLink() {
    try {
        var raw = localStorage.getItem('pending_wallet_link');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function getLinkedWallet() {
    if (!connectedWallet || !holdersData) return null;
    var holder = holdersData.holders.find(function(h) { return h.wallet === connectedWallet; });
    if (holder && holder.linkedWallet) return holder.linkedWallet;
    // Check if another holder references us
    var other = holdersData.holders.find(function(h) { return h.linkedWallet === connectedWallet; });
    if (other) return other.wallet;
    return null;
}

async function linkWallet() {
    if (!connectedWallet) return;
    var provider = getWalletProvider();
    if (!provider) return;

    try {
        var message = 'Link wallet ' + connectedWallet + ' to another wallet on midhorde.com';
        var encodedMsg = new TextEncoder().encode(message);
        var signed = await provider.signMessage(encodedMsg, 'utf8');
        var signature = toBase58(signed.signature);

        localStorage.setItem('pending_wallet_link', JSON.stringify({
            walletA: connectedWallet,
            signatureA: signature
        }));

        showWalletLinkStep2Prompt();
        updateWalletUI();
    } catch (err) {
        console.error('Link wallet step 1 failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to sign wallet link. Please try again.');
    }
}

function showWalletLinkStep2Prompt() {
    var el = document.getElementById('wallet-link-step2');
    el.style.display = '';
    el.textContent = 'Step 1 complete. Now disconnect and connect your second wallet to finish linking.';
}

async function completeWalletLink() {
    var pending = getPendingWalletLink();
    if (!pending || !connectedWallet) return;

    if (connectedWallet === pending.walletA) {
        showError('Please connect a different wallet to complete the link.');
        return;
    }

    var provider = getWalletProvider();
    if (!provider) return;

    try {
        var message = 'Confirm link wallet ' + connectedWallet + ' to wallet ' + pending.walletA + ' on midhorde.com';
        var encodedMsg = new TextEncoder().encode(message);
        var signed = await provider.signMessage(encodedMsg, 'utf8');
        var signatureB = toBase58(signed.signature);

        var res = await fetch('/api/holders-link-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletA: pending.walletA,
                signatureA: pending.signatureA,
                walletB: connectedWallet,
                signatureB: signatureB
            })
        });

        var data = await res.json();
        if (data.error) {
            showError('Link failed: ' + data.error);
            return;
        }

        localStorage.removeItem('pending_wallet_link');
        document.getElementById('wallet-link-step2').style.display = 'none';
        await loadData();
    } catch (err) {
        console.error('Complete wallet link failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to complete wallet link. Please try again.');
    }
}

function cancelWalletLink() {
    localStorage.removeItem('pending_wallet_link');
    document.getElementById('wallet-link-step2').style.display = 'none';
    updateWalletUI();
}

async function unlinkWallet() {
    if (!connectedWallet) return;
    var provider = getWalletProvider();
    if (!provider) return;

    try {
        var message = 'Unlink wallet ' + connectedWallet + ' on midhorde.com';
        var encodedMsg = new TextEncoder().encode(message);
        var signed = await provider.signMessage(encodedMsg, 'utf8');
        var signature = toBase58(signed.signature);

        var res = await fetch('/api/holders-link-wallet', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature: signature })
        });

        var data = await res.json();
        if (data.error) {
            showError('Unlink failed: ' + data.error);
            return;
        }

        await loadData();
    } catch (err) {
        console.error('Unlink wallet failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to unlink wallet. Please try again.');
    }
}

// --- Data Loading ---

async function loadData() {
    const loading = document.getElementById('loading');
    loading.style.display = '';
    hideError();
    document.getElementById('not-holder').style.display = 'none';
    document.getElementById('badges-section').style.display = 'none';
    document.getElementById('gallery-section').style.display = 'none';
    document.getElementById('rarity-section').style.display = 'none';
    document.getElementById('social-status').style.display = 'none';

    try {
        // Fetch holder data
        const res = await fetch('/api/holders');
        if (!res.ok) throw new Error('Failed to fetch holder data');
        holdersData = await res.json();

        // Find current wallet
        myHolder = holdersData.holders.find(function(h) { return h.wallet === connectedWallet; });

        // Check for linked wallet and merge orcs
        var linkedWalletAddr = myHolder ? myHolder.linkedWallet : null;
        if (!linkedWalletAddr) {
            // Check if another holder references this wallet
            var referencing = holdersData.holders.find(function(h) { return h.linkedWallet === connectedWallet; });
            if (referencing) linkedWalletAddr = referencing.wallet;
        }

        if (linkedWalletAddr) {
            var linkedHolder = holdersData.holders.find(function(h) { return h.wallet === linkedWalletAddr; });

            if (!myHolder && linkedHolder) {
                // Current wallet has no orcs, create synthetic holder from linked
                myHolder = {
                    rank: linkedHolder.rank,
                    wallet: connectedWallet,
                    count: linkedHolder.count,
                    discord: linkedHolder.discord,
                    x: linkedHolder.x,
                    linkedWallet: linkedWalletAddr,
                    orcs: linkedHolder.orcs.map(function(o) { var c = Object.assign({}, o); c.sourceWallet = linkedWalletAddr; return c; })
                };
            } else if (myHolder && linkedHolder) {
                // Both wallets have orcs — merge
                var myOrcs = myHolder.orcs.map(function(o) { var c = Object.assign({}, o); c.sourceWallet = connectedWallet; return c; });
                var linkedOrcs = linkedHolder.orcs.map(function(o) { var c = Object.assign({}, o); c.sourceWallet = linkedWalletAddr; return c; });
                myHolder.orcs = myOrcs.concat(linkedOrcs);
                myHolder.count = myHolder.orcs.length;
                myHolder.rank = Math.min(myHolder.rank, linkedHolder.rank);
                // Prefer connected wallet's social data
                if (!myHolder.discord && linkedHolder.discord) myHolder.discord = linkedHolder.discord;
                if (!myHolder.x && linkedHolder.x) myHolder.x = linkedHolder.x;
            } else if (myHolder) {
                // Linked wallet has no orcs — tag source on existing
                myHolder.orcs = myHolder.orcs.map(function(o) { var c = Object.assign({}, o); c.sourceWallet = connectedWallet; return c; });
            }
        }

        if (!myHolder) {
            loading.style.display = 'none';
            document.getElementById('not-holder').style.display = '';
            renderEmptyStats();
            updateWalletUI();
            return;
        }

        renderStats();
        updateWalletUI();

        // Populate trait data from holders API response (no extra fetching needed)
        traitData = {};
        myHolder.orcs.forEach(function(orc) {
            if (orc.traits) {
                traitData[orc.mint] = orc.traits;
            }
        });

        // Fetch badge data
        await fetchBadgeData(connectedWallet);

        renderBadges();
        renderGallery();
        renderRarityDistribution();
        renderSocialStatus();

        loading.style.display = 'none';
        document.getElementById('badges-section').style.display = '';
        document.getElementById('gallery-section').style.display = '';
        document.getElementById('rarity-section').style.display = '';
        document.getElementById('social-status').style.display = '';
    } catch (err) {
        console.error('Load data failed:', err);
        loading.style.display = 'none';
        showError('Failed to load your Horde data. Please try again later.');
    }
}

async function fetchTraitData(orcs) {
    // Fetch traits for all orcs using helius getAsset
    // Batch into groups to avoid rate limits
    const BATCH_SIZE = 10;
    traitData = {};

    for (let i = 0; i < orcs.length; i += BATCH_SIZE) {
        const batch = orcs.slice(i, i + BATCH_SIZE);
        const promises = batch.map(function(orc) {
            return fetch('/api/helius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: orc.mint,
                    method: 'getAsset',
                    params: { id: orc.mint }
                })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                const attributes = data.result?.content?.metadata?.attributes || [];
                const traits = {};
                attributes.forEach(function(attr) {
                    if (attr.trait_type && attr.value) {
                        traits[attr.trait_type] = attr.value;
                    }
                });
                traitData[orc.mint] = traits;
            })
            .catch(function(err) {
                console.error('Failed to fetch traits for ' + orc.mint, err);
                traitData[orc.mint] = {};
            });
        });
        await Promise.all(promises);
    }
}

// --- Badges ---

async function fetchBadgeData(wallet) {
    try {
        var res = await fetch('/api/badges?wallet=' + encodeURIComponent(wallet));
        if (res.ok) {
            badgeData = await res.json();
        } else {
            badgeData = { eventBadges: [], swapCount: 0 };
        }
    } catch (e) {
        console.error('Badge fetch failed:', e);
        badgeData = { eventBadges: [], swapCount: 0 };
    }
}

function getBadgeDates() {
    try {
        return JSON.parse(localStorage.getItem('badge-dates') || '{}');
    } catch (e) {
        return {};
    }
}

function saveBadgeDates(dates) {
    localStorage.setItem('badge-dates', JSON.stringify(dates));
}

function renderBadges() {
    var grid = document.getElementById('badges-grid');
    if (!grid || !myHolder) return;
    grid.innerHTML = '';

    var dates = getBadgeDates();
    var changed = false;

    // Stat-based badges
    STAT_BADGES.forEach(function(badge) {
        var earned = badge.check(myHolder, badgeData);
        if (earned && !dates[badge.id]) {
            dates[badge.id] = Date.now();
            changed = true;
        }
        var date = earned ? (dates[badge.id] || null) : null;
        grid.appendChild(createBadgeElement(badge.id, badge.icon, badge.name, badge.description, earned, badge.image, date));
    });

    // Event-based badges
    var eventBadges = badgeData.eventBadges || [];
    eventBadges.forEach(function(badge) {
        var id = 'event_' + (badge.id || badge.name);
        if (!dates[id]) {
            dates[id] = Date.now();
            changed = true;
        }
        var date = dates[id] || null;
        grid.appendChild(createBadgeElement(id, badge.icon || '⭐', badge.name, badge.description || '', true, badge.imageUrl || null, date));
    });

    if (changed) saveBadgeDates(dates);
}

function createBadgeElement(badgeId, icon, name, tooltip, earned, imageUrl, date) {
    var el = document.createElement('div');
    el.className = 'badge-card' + (earned ? ' earned' : ' locked');
    el.style.cursor = 'pointer';

    var iconEl = document.createElement('div');
    iconEl.className = 'badge-card-icon';
    if (imageUrl) {
        var img = document.createElement('img');
        img.src = imageUrl;
        img.alt = name;
        img.className = 'badge-card-img';
        img.onerror = function() { this.remove(); iconEl.textContent = icon; };
        iconEl.appendChild(img);
    } else {
        iconEl.textContent = icon;
    }
    el.appendChild(iconEl);

    var nameEl = document.createElement('div');
    nameEl.className = 'badge-card-name';
    nameEl.textContent = name;
    el.appendChild(nameEl);

    if (tooltip) {
        var tipEl = document.createElement('div');
        tipEl.className = 'badge-tooltip';
        tipEl.textContent = tooltip;
        el.appendChild(tipEl);
    }

    el.addEventListener('click', function() {
        showBadgeModal(badgeId, name, tooltip, earned, imageUrl, icon, date);
    });

    return el;
}

function showBadgeModal(badgeId, name, description, earned, imageUrl, icon, date) {
    var wrap = document.getElementById('badge-modal-image-wrap');
    wrap.innerHTML = '';
    if (imageUrl) {
        var img = document.createElement('img');
        img.src = imageUrl;
        img.alt = name;
        img.className = 'badge-modal-img';
        if (!earned) img.classList.add('locked');
        img.onerror = function() {
            this.remove();
            var fallback = document.createElement('div');
            fallback.className = 'badge-modal-icon';
            if (!earned) fallback.classList.add('locked');
            fallback.textContent = icon;
            wrap.appendChild(fallback);
        };
        wrap.appendChild(img);
    } else {
        var iconEl = document.createElement('div');
        iconEl.className = 'badge-modal-icon';
        if (!earned) iconEl.classList.add('locked');
        iconEl.textContent = icon;
        wrap.appendChild(iconEl);
    }

    document.getElementById('badge-modal-name').textContent = name;
    document.getElementById('badge-modal-desc').textContent = description || '';

    var statusEl = document.getElementById('badge-modal-status');
    if (earned) {
        statusEl.innerHTML = '<span class="badge-status-pill earned">Earned</span>';
    } else {
        statusEl.innerHTML = '<span class="badge-status-pill locked">Locked</span>';
    }

    var dateEl = document.getElementById('badge-modal-date');
    if (earned && date) {
        dateEl.textContent = 'Achieved ' + new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
        dateEl.textContent = '';
    }

    var shareBtn = document.getElementById('badge-modal-share');
    if (earned) {
        shareBtn.style.display = '';
        shareBtn.onclick = function() {
            var badgeUrl = 'https://midhorde.com/badge/' + encodeURIComponent(badgeId);
            var text = '\uD83C\uDFC5 I earned the "' + name + '" badge on The Horde!\n';
            if (description) text += '\n' + description + '\n';
            text += '\n@MidHorde @MidEvilsNFT';
            var url = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(badgeUrl);
            window.open(url, '_blank', 'noopener');
        };
    } else {
        shareBtn.style.display = 'none';
    }

    document.getElementById('badge-modal').style.display = 'flex';
}

function closeBadgeModal() {
    document.getElementById('badge-modal').style.display = 'none';
}

// --- Stats ---

function renderStats() {
    if (!myHolder || !holdersData) return;

    document.getElementById('stat-rank').textContent = '#' + myHolder.rank + ' of ' + holdersData.totalHolders;
    document.getElementById('stat-orcs').textContent = myHolder.count;

    // Enlisted count
    var enlisted = 0;
    myHolder.orcs.forEach(function(orc) {
        if (orc.isFrozen || (orc.isFrozen && orc.isDelegated)) enlisted++;
    });
    var enlistedPct = myHolder.count > 0 ? ((enlisted / myHolder.count) * 100).toFixed(0) : 0;
    document.getElementById('stat-enlisted').textContent = enlisted + ' (' + enlistedPct + '%)';

    // Portfolio value
    var floorPrice = holdersData.floorPrice;
    if (floorPrice != null) {
        var value = (myHolder.count * floorPrice).toFixed(2);
        document.getElementById('stat-value').textContent = value + ' SOL';
    } else {
        document.getElementById('stat-value').textContent = '\u2014';
    }

    // Rarest orc
    var rarest = null;
    myHolder.orcs.forEach(function(orc) {
        if (orc.rarityRank && (!rarest || orc.rarityRank < rarest.rarityRank)) {
            rarest = orc;
        }
    });
    if (rarest) {
        document.getElementById('stat-rarest').textContent = rarest.name + ' (#' + rarest.rarityRank + ')';
    }
}

function renderEmptyStats() {
    document.getElementById('stat-rank').textContent = '\u2014';
    document.getElementById('stat-orcs').textContent = '0';
    document.getElementById('stat-enlisted').textContent = '\u2014';
    document.getElementById('stat-value').textContent = '\u2014';
    document.getElementById('stat-rarest').textContent = '\u2014';
}

// --- Gallery ---

function renderGallery() {
    if (!myHolder) return;

    var orcs = myHolder.orcs.slice();
    sortOrcs(orcs);

    var gallery = document.getElementById('orc-gallery');
    gallery.innerHTML = '';

    orcs.forEach(function(orc) {
        var card = document.createElement('div');
        card.className = 'gallery-card';
        var rarityTier = orc.rarityRank ? getRarityTier(orc.rarityRank) : '';
        if (rarityTier && rarityTier !== 'common') card.classList.add('rarity-' + rarityTier);

        var img = document.createElement('img');
        img.src = orc.imageUrl;
        img.alt = orc.name;
        img.loading = 'lazy';
        img.onerror = function() { this.src = '/orclogo.jpg'; };
        card.appendChild(img);

        // Status badge
        if (orc.isFrozen || orc.isDelegated) {
            var badge = document.createElement('span');
            badge.className = 'orc-status-badge';
            if (orc.isFrozen && orc.isDelegated) {
                badge.textContent = 'Enlisted';
                badge.classList.add('enlisted');
            } else if (orc.isFrozen) {
                badge.textContent = 'Enlisted';
                badge.classList.add('enlisted');
            } else {
                badge.textContent = 'On Loan';
                badge.classList.add('on-loan');
            }
            card.appendChild(badge);
        }

        var info = document.createElement('div');
        info.className = 'gallery-card-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'gallery-card-name';
        nameEl.textContent = orc.name;
        info.appendChild(nameEl);

        if (orc.rarityRank) {
            var rankEl = document.createElement('div');
            rankEl.className = 'gallery-card-rank';
            rankEl.textContent = '#' + orc.rarityRank + ' rarity';
            info.appendChild(rankEl);
        }

        card.appendChild(info);

        card.addEventListener('click', function() {
            showOrcModal(orc);
        });

        gallery.appendChild(card);
    });
}

function sortOrcs(orcs) {
    if (currentSort === 'rarity') {
        orcs.sort(function(a, b) { return (a.rarityRank || 999) - (b.rarityRank || 999); });
    } else if (currentSort === 'status') {
        orcs.sort(function(a, b) {
            var statusA = getStatusOrder(a);
            var statusB = getStatusOrder(b);
            return statusA - statusB;
        });
    } else {
        // number
        orcs.sort(function(a, b) {
            var numA = extractNumber(a.name);
            var numB = extractNumber(b.name);
            return numA - numB;
        });
    }
}

function getStatusOrder(orc) {
    if (orc.isFrozen && orc.isDelegated) return 0; // Enlisted
    if (orc.isFrozen) return 0; // Enlisted
    if (orc.isDelegated) return 1; // On Loan
    return 2; // None
}

function extractNumber(name) {
    var match = name?.match(/#?(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// --- Orc Detail Modal ---

function showOrcModal(orc) {
    document.getElementById('modal-image').src = orc.imageUrl;
    document.getElementById('modal-name').textContent = orc.name;

    // Rarity
    var rarityEl = document.getElementById('modal-rarity');
    if (orc.rarityRank) {
        var tier = getRarityTier(orc.rarityRank);
        rarityEl.innerHTML = '<span class="rarity-rank">#' + orc.rarityRank + ' Rarity</span> ' +
            '<span class="rarity-tier tier-' + tier + '">' + capitalize(tier) + '</span>';
    } else {
        rarityEl.innerHTML = '';
    }

    // Status
    var statusEl = document.getElementById('modal-status');
    if (orc.isFrozen && orc.isDelegated) {
        statusEl.innerHTML = '<span class="status-badge enlisted">Enlisted</span>';
    } else if (orc.isFrozen) {
        statusEl.innerHTML = '<span class="status-badge enlisted">Enlisted</span>';
    } else if (orc.isDelegated) {
        statusEl.innerHTML = '<span class="status-badge on-loan">On Loan</span>';
    } else {
        statusEl.innerHTML = '';
    }

    // Traits
    var traitsEl = document.getElementById('modal-traits');
    var traits = traitData[orc.mint] || {};
    var traitEntries = Object.entries(traits);
    if (traitEntries.length > 0) {
        traitsEl.innerHTML = traitEntries.map(function(entry) {
            return '<div class="modal-trait">' +
                '<span class="modal-trait-type">' + escapeHtml(entry[0]) + '</span>' +
                '<span class="modal-trait-value">' + escapeHtml(entry[1]) + '</span>' +
                '</div>';
        }).join('');
    } else {
        traitsEl.innerHTML = '<div class="modal-trait"><span class="modal-trait-type">Loading traits...</span></div>';
    }

    // Mint
    var mintEl = document.getElementById('modal-mint');
    mintEl.textContent = orc.mint;
    mintEl.onclick = function() {
        copyToClipboard(orc.mint, mintEl);
    };

    document.getElementById('orc-modal').style.display = 'flex';
}

function closeOrcModal() {
    document.getElementById('orc-modal').style.display = 'none';
}

function getRarityTier(rank) {
    if (rank <= 10) return 'legendary';
    if (rank <= 40) return 'epic';
    if (rank <= 115) return 'rare';
    return 'common';
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Rarity Distribution ---

function renderRarityDistribution() {
    if (!myHolder) return;

    var tiers = { legendary: 0, epic: 0, rare: 0, common: 0 };

    myHolder.orcs.forEach(function(orc) {
        if (!orc.rarityRank) return;
        var tier = getRarityTier(orc.rarityRank);
        tiers[tier]++;
    });

    var container = document.getElementById('rarity-tiers');
    container.innerHTML = '';

    var tierDefs = [
        { key: 'legendary', label: 'Legendary', range: 'Top 10' },
        { key: 'epic', label: 'Epic', range: '#11 - 40' },
        { key: 'rare', label: 'Rare', range: '#41 - 115' },
        { key: 'common', label: 'Common', range: '#116+' }
    ];

    tierDefs.forEach(function(def) {
        var card = document.createElement('div');
        card.className = 'rarity-tier-card tier-' + def.key;
        card.innerHTML =
            '<div class="tier-label">' + def.label + '</div>' +
            '<div class="tier-count">' + tiers[def.key] + '</div>' +
            '<div class="tier-range">' + def.range + '</div>';
        container.appendChild(card);
    });
}

// --- Social Status ---

function renderSocialStatus() {
    if (!myHolder) return;

    var discordEl = document.getElementById('discord-status');
    var xEl = document.getElementById('x-status');

    if (myHolder.discord?.username) {
        var discordHtml = '<span class="discord-linked">';
        if (myHolder.discord.avatar && myHolder.discord.id) {
            discordHtml += '<img class="discord-avatar" src="https://cdn.discordapp.com/avatars/' +
                myHolder.discord.id + '/' + myHolder.discord.avatar + '.png?size=32" alt="">';
        }
        discordHtml += '<span class="discord-name">' + escapeHtml(myHolder.discord.username) + '</span></span>';
        discordEl.innerHTML = discordHtml;
    } else {
        discordEl.innerHTML = '';
    }

    if (myHolder.x?.username) {
        var xHtml = '<a class="x-linked" href="https://x.com/' + encodeURIComponent(myHolder.x.username) + '" target="_blank" rel="noopener">';
        if (myHolder.x.avatar) {
            xHtml += '<img class="x-avatar" src="' + escapeHtml(myHolder.x.avatar) + '" alt="">';
        }
        xHtml += '<span class="x-name">@' + escapeHtml(myHolder.x.username) + '</span></a>';
        xEl.innerHTML = xHtml;
    } else {
        xEl.innerHTML = '';
    }
}

// --- Share to X ---

function shareToX() {
    if (!myHolder) return;

    var rarest = null;
    myHolder.orcs.forEach(function(orc) {
        if (orc.rarityRank && (!rarest || orc.rarityRank < rarest.rarityRank)) {
            rarest = orc;
        }
    });

    var tier = rarest ? getRarityTier(rarest.rarityRank) : '';
    var tierEmoji = tier === 'legendary' ? '\uD83D\uDC51' : tier === 'epic' ? '\uD83D\uDC8E' : tier === 'rare' ? '\u2728' : '\u2694\uFE0F';

    var text = '\uD83D\uDEE1\uFE0F My Horde\n\n';
    text += '\u2694\uFE0F ' + myHolder.count + ' Orcs\n';
    text += '\uD83C\uDFC6 Rank #' + myHolder.rank + ' of ' + holdersData.totalHolders + ' holders\n';
    if (rarest) {
        text += tierEmoji + ' Rarest: ' + rarest.name + ' (#' + rarest.rarityRank + ' — ' + capitalize(tier) + ')\n';
    }
    if (holdersData.floorPrice != null) {
        text += '\uD83D\uDCB0 Portfolio: ' + (myHolder.count * holdersData.floorPrice).toFixed(2) + ' SOL\n';
    }
    text += '\nmidhorde.com\n@MidHorde @MidEvilsNFT';

    var url = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
}

// --- Utility ---

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showError(msg) {
    var el = document.getElementById('error');
    el.textContent = '';
    if (msg instanceof HTMLElement) {
        el.appendChild(msg);
    } else {
        el.textContent = msg;
    }
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 8000);
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

async function copyToClipboard(text, el) {
    try {
        await navigator.clipboard.writeText(text);
        var orig = el.textContent;
        el.textContent = 'Copied!';
        el.classList.add('copied');
        setTimeout(function() {
            el.textContent = orig;
            el.classList.remove('copied');
        }, 1500);
    } catch (e) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// --- Auto-connect ---

async function tryAutoConnect() {
    var provider = getWalletProvider();
    if (provider) {
        try {
            var response = await provider.connect({ onlyIfTrusted: true });
            connectedWallet = (response?.publicKey || provider.publicKey).toString();
            onWalletConnected();
        } catch (e) {
            // Not auto-trusted
        }
    }
}

// --- Init ---

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('disconnect-wallet-btn').addEventListener('click', disconnectWallet);
    document.getElementById('link-discord-btn').addEventListener('click', linkDiscord);
    document.getElementById('unlink-discord-btn').addEventListener('click', unlinkDiscord);
    document.getElementById('link-x-btn').addEventListener('click', linkX);
    document.getElementById('unlink-x-btn').addEventListener('click', unlinkX);
    document.getElementById('link-wallet-btn').addEventListener('click', linkWallet);
    document.getElementById('unlink-wallet-btn').addEventListener('click', unlinkWallet);
    document.getElementById('cancel-wallet-link-btn').addEventListener('click', cancelWalletLink);
    document.getElementById('share-x-btn').addEventListener('click', shareToX);
    document.getElementById('modal-close').addEventListener('click', closeOrcModal);
    document.getElementById('badge-modal-close').addEventListener('click', closeBadgeModal);
    document.getElementById('badge-modal').addEventListener('click', function(e) {
        if (e.target === this) closeBadgeModal();
    });
    document.getElementById('sort-select').addEventListener('change', function(e) {
        currentSort = e.target.value;
        renderGallery();
    });

    // Wallet address copy
    document.getElementById('wallet-address').addEventListener('click', function() {
        if (connectedWallet) copyToClipboard(connectedWallet, this);
    });

    // Modal background click to close
    document.getElementById('orc-modal').addEventListener('click', function(e) {
        if (e.target === this) closeOrcModal();
    });

    // Escape key to close modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('badge-modal').style.display === 'flex') {
                closeBadgeModal();
            } else if (document.getElementById('orc-modal').style.display === 'flex') {
                closeOrcModal();
            }
        }
    });

    tryAutoConnect();
});
