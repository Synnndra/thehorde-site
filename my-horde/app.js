// My Horde - Client Logic

let connectedWallet = null;
let holdersData = null;
let myHolder = null;
let traitData = {}; // mint -> traits object
let currentSort = 'number';
let badgeData = { eventBadges: [], swapCount: 0 };

// Badge definitions (stat-based, computed client-side)
var STAT_BADGES = [
    { id: 'warlord', name: 'Warlord', description: 'Hold 50+ orcs', icon: '⚔️', check: function(h, b) { return h.count >= 50; } },
    { id: 'commander', name: 'Commander', description: 'Hold 20+ orcs', icon: '🛡️', check: function(h, b) { return h.count >= 20; } },
    { id: 'squad_leader', name: 'Squad Leader', description: 'Hold 10+ orcs', icon: '⚔️', check: function(h, b) { return h.count >= 10; } },
    { id: 'recruit', name: 'Recruit', description: 'Hold your first orc', icon: '👶', check: function(h, b) { return h.count >= 1; } },
    { id: 'enlisted', name: 'Enlisted', description: '100% of orcs enlisted', icon: '🎖️', check: function(h, b) {
        if (h.count === 0) return false;
        var frozen = 0;
        h.orcs.forEach(function(o) { if (o.isFrozen) frozen++; });
        return frozen === h.count;
    }},
    { id: 'drill_sergeant', name: 'Drill Sergeant', description: '10+ orcs enlisted', icon: '🎖️', check: function(h, b) {
        var frozen = 0;
        h.orcs.forEach(function(o) { if (o.isFrozen) frozen++; });
        return frozen >= 10;
    }},
    { id: 'legendary_keeper', name: 'Legendary Keeper', description: 'Own a Legendary orc (top 10 rarity)', icon: '👑', check: function(h, b) {
        return h.orcs.some(function(o) { return o.rarityRank && o.rarityRank <= 10; });
    }},
    { id: 'rare_collector', name: 'Rare Collector', description: 'Own 5+ Epic or Legendary orcs', icon: '💎', check: function(h, b) {
        var count = 0;
        h.orcs.forEach(function(o) { if (o.rarityRank && o.rarityRank <= 40) count++; });
        return count >= 5;
    }},
    { id: 'diversity', name: 'Diversity', description: 'Own orcs across all 4 rarity tiers', icon: '🌈', check: function(h, b) {
        var tiers = { legendary: false, epic: false, rare: false, common: false };
        h.orcs.forEach(function(o) {
            if (!o.rarityRank) return;
            var t = getRarityTier(o.rarityRank);
            tiers[t] = true;
        });
        return tiers.legendary && tiers.epic && tiers.rare && tiers.common;
    }},
    { id: 'trader', name: 'Trader', description: 'Completed a swap', icon: '🤝', check: function(h, b) { return b.swapCount >= 1; } },
    { id: 'deal_maker', name: 'Deal Maker', description: 'Completed 5+ swaps', icon: '💼', check: function(h, b) { return b.swapCount >= 5; } },
    { id: 'fully_connected', name: 'Fully Connected', description: 'Linked both Discord and X', icon: '🔗', check: function(h, b) { return h.discord != null && h.x != null; } }
];

// --- Wallet ---

function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getWalletProvider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.solana) return window.solana;
    return null;
}

async function connectWallet() {
    const provider = getWalletProvider();
    if (!provider) {
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
    try {
        const response = await provider.connect();
        connectedWallet = response.publicKey.toString();
        onWalletConnected();
    } catch (err) {
        console.error('Wallet connection failed:', err);
    }
}

async function disconnectWallet() {
    const provider = getWalletProvider();
    if (provider) {
        try { await provider.disconnect(); } catch (e) { /* ignore */ }
    }
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
}

function updateWalletUI() {
    const walletAddr = document.getElementById('wallet-address');
    const linkBtn = document.getElementById('link-discord-btn');
    const unlinkBtn = document.getElementById('unlink-discord-btn');
    const linkXBtn = document.getElementById('link-x-btn');
    const unlinkXBtn = document.getElementById('unlink-x-btn');
    const privacyInfo = document.querySelector('.privacy-info');

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

        if (privacyInfo) {
            const anyLinkVisible = linkBtn.style.display !== 'none' || unlinkBtn.style.display !== 'none' ||
                linkXBtn.style.display !== 'none' || unlinkXBtn.style.display !== 'none';
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

        if (!myHolder) {
            loading.style.display = 'none';
            document.getElementById('not-holder').style.display = '';
            renderEmptyStats();
            updateWalletUI();
            return;
        }

        renderStats();
        updateWalletUI();

        // Fetch badge data and trait data in parallel
        await Promise.all([
            fetchBadgeData(connectedWallet),
            fetchTraitData(myHolder.orcs)
        ]);

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

function renderBadges() {
    var grid = document.getElementById('badges-grid');
    if (!grid || !myHolder) return;
    grid.innerHTML = '';

    // Stat-based badges
    STAT_BADGES.forEach(function(badge) {
        var earned = badge.check(myHolder, badgeData);
        grid.appendChild(createBadgeElement(badge.icon, badge.name, badge.description, earned));
    });

    // Event-based badges
    var eventBadges = badgeData.eventBadges || [];
    eventBadges.forEach(function(badge) {
        grid.appendChild(createBadgeElement(badge.icon || '⭐', badge.name, badge.description || '', true));
    });
}

function createBadgeElement(icon, name, tooltip, earned) {
    var el = document.createElement('div');
    el.className = 'badge-card' + (earned ? ' earned' : ' locked');

    var iconEl = document.createElement('div');
    iconEl.className = 'badge-card-icon';
    iconEl.textContent = icon;
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

    return el;
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
            connectedWallet = response.publicKey.toString();
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
    document.getElementById('share-x-btn').addEventListener('click', shareToX);
    document.getElementById('modal-close').addEventListener('click', closeOrcModal);
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

    // Escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.getElementById('orc-modal').style.display === 'flex') {
            closeOrcModal();
        }
    });

    tryAutoConnect();
});
