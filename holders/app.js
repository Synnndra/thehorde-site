// Holder Leaderboard - Client Logic

let connectedWallet = null;
let holdersData = null;

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
            showError(`No wallet detected. <a href="https://phantom.app/ul/browse/${currentUrl}" style="color:#c9a227">Open in Phantom</a> or <a href="https://solflare.com/ul/v1/browse/${currentUrl}" style="color:#c9a227">Solflare</a>`);
        } else {
            showError('No Solana wallet found. Please install Phantom or Solflare.');
        }
        return;
    }
    try {
        const response = await provider.connect();
        connectedWallet = response.publicKey.toString();
        updateWalletUI();
        highlightMyRow();
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
    updateWalletUI();
    highlightMyRow();
}

function updateWalletUI() {
    const connectBtn = document.getElementById('connect-wallet-btn');
    const disconnectBtn = document.getElementById('disconnect-wallet-btn');
    const walletAddr = document.getElementById('wallet-address');
    const linkBtn = document.getElementById('link-discord-btn');
    const unlinkBtn = document.getElementById('unlink-discord-btn');
    const linkXBtn = document.getElementById('link-x-btn');
    const unlinkXBtn = document.getElementById('unlink-x-btn');
    const privacyInfo = document.querySelector('.privacy-info');

    if (connectedWallet) {
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = '';
        walletAddr.style.display = '';
        walletAddr.textContent = connectedWallet.slice(0, 4) + '...' + connectedWallet.slice(-4);
        walletAddr.title = 'Click to copy: ' + connectedWallet;

        // Show link/unlink Discord based on whether we have Discord in localStorage
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

        // Show link/unlink X
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
        // Show privacy info when any link button is visible
        if (privacyInfo) {
            const anyLinkVisible = linkBtn.style.display !== 'none' || unlinkBtn.style.display !== 'none' ||
                linkXBtn.style.display !== 'none' || unlinkXBtn.style.display !== 'none';
            privacyInfo.style.display = anyLinkVisible ? '' : 'none';
        }
    } else {
        connectBtn.style.display = '';
        disconnectBtn.style.display = 'none';
        walletAddr.style.display = 'none';
        linkBtn.style.display = 'none';
        unlinkBtn.style.display = 'none';
        linkXBtn.style.display = 'none';
        unlinkXBtn.style.display = 'none';
        if (privacyInfo) privacyInfo.style.display = 'none';
    }
}

function getStoredDiscord() {
    const username = localStorage.getItem('discord_username');
    const id = localStorage.getItem('discord_id');
    const avatar = localStorage.getItem('discord_avatar');
    if (!username) return null;
    return { username, id, avatar };
}

function isWalletLinked() {
    if (!connectedWallet || !holdersData) return false;
    const holder = holdersData.holders.find(h => h.wallet === connectedWallet);
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
    const holder = holdersData.holders.find(h => h.wallet === connectedWallet);
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
        const message = `Link Discord to wallet ${connectedWallet} on midhorde.com`;
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature, discord })
        });

        const data = await res.json();
        if (data.error) {
            showError('Link failed: ' + data.error);
            return;
        }

        // Refresh data
        await fetchHolders();
        updateWalletUI();
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
        const message = `Unlink Discord from wallet ${connectedWallet} on midhorde.com`;
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature })
        });

        const data = await res.json();
        if (data.error) {
            showError('Unlink failed: ' + data.error);
            return;
        }

        await fetchHolders();
        updateWalletUI();
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
        const message = `Link X to wallet ${connectedWallet} on midhorde.com`;
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link-x', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature, x })
        });

        const data = await res.json();
        if (data.error) {
            showError('Link failed: ' + data.error);
            return;
        }

        await fetchHolders();
        updateWalletUI();
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
        const message = `Unlink X from wallet ${connectedWallet} on midhorde.com`;
        const encodedMsg = new TextEncoder().encode(message);
        const signed = await provider.signMessage(encodedMsg, 'utf8');
        const signature = toBase58(signed.signature);

        const res = await fetch('/api/holders-link-x', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: connectedWallet, signature })
        });

        const data = await res.json();
        if (data.error) {
            showError('Unlink failed: ' + data.error);
            return;
        }

        await fetchHolders();
        updateWalletUI();
    } catch (err) {
        console.error('Unlink X failed:', err);
        if (err.message?.includes('User rejected')) return;
        showError('Failed to unlink X. Please try again.');
    }
}

// --- Data Loading ---

async function fetchHolders() {
    try {
        const res = await fetch('/api/holders');
        if (!res.ok) throw new Error('Failed to fetch');
        holdersData = await res.json();
        renderStats();
        renderTable();
        renderListedForSale();
        highlightMyRow();
    } catch (err) {
        console.error('Fetch holders failed:', err);
        showError('Failed to load holder data. Please try again later.');
    }
}

function showError(msg) {
    const el = document.getElementById('error');
    el.innerHTML = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
}

function renderStats() {
    document.getElementById('total-holders').textContent = holdersData.totalHolders;
    document.getElementById('total-orcs').textContent = holdersData.totalOrcs;
    const listed = holdersData.listedForSale?.length || 0;
    const listedPct = holdersData.totalOrcs ? ((listed / holdersData.totalOrcs) * 100).toFixed(1) : 0;
    document.getElementById('total-listed').textContent = listed + ' (' + listedPct + '%)';
    const enlisted = holdersData.enlistedCount || 0;
    const enlistedPct = holdersData.totalOrcs ? ((enlisted / holdersData.totalOrcs) * 100).toFixed(1) : 0;
    document.getElementById('total-enlisted').textContent = enlisted + ' (' + enlistedPct + '%)';
    document.getElementById('avg-hold').textContent = holdersData.avgHold || '—';
    document.getElementById('floor-price').textContent = holdersData.floorPrice != null
        ? holdersData.floorPrice + ' SOL'
        : '—';

    const updatedAt = new Date(holdersData.updatedAt);
    const now = new Date();
    const diffMin = Math.round((now - updatedAt) / 60000);
    document.getElementById('last-updated').textContent =
        diffMin < 1 ? 'Just now' : diffMin + 'm ago';
}

function renderTable() {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    for (const holder of holdersData.holders) {
        const tr = document.createElement('tr');
        tr.dataset.wallet = holder.wallet;

        if (holder.rank <= 3) tr.classList.add('rank-' + holder.rank);

        // Rank
        const rankTd = document.createElement('td');
        rankTd.className = 'rank-cell';
        if (holder.rank === 1) rankTd.innerHTML = '<span class="rank-medal">&#x1F947;</span>';
        else if (holder.rank === 2) rankTd.innerHTML = '<span class="rank-medal">&#x1F948;</span>';
        else if (holder.rank === 3) rankTd.innerHTML = '<span class="rank-medal">&#x1F949;</span>';
        else rankTd.textContent = holder.rank;
        tr.appendChild(rankTd);

        // Wallet
        const walletTd = document.createElement('td');
        walletTd.className = 'wallet-cell';
        walletTd.textContent = holder.wallet.slice(0, 4) + '...' + holder.wallet.slice(-4);
        walletTd.title = 'Click to copy';
        walletTd.addEventListener('click', () => copyToClipboard(holder.wallet, walletTd));
        tr.appendChild(walletTd);

        // Discord
        const discordTd = document.createElement('td');
        discordTd.className = 'discord-cell';
        if (holder.discord?.username) {
            const discordWrap = document.createElement('span');
            discordWrap.className = 'discord-linked';

            if (holder.discord.avatar && holder.discord.id) {
                const avatar = document.createElement('img');
                avatar.className = 'discord-avatar';
                avatar.src = 'https://cdn.discordapp.com/avatars/' + holder.discord.id + '/' + holder.discord.avatar + '.png?size=32';
                avatar.alt = '';
                avatar.onerror = function() { this.style.display = 'none'; };
                discordWrap.appendChild(avatar);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'discord-name';
            nameSpan.textContent = holder.discord.username;
            discordWrap.appendChild(nameSpan);

            discordTd.appendChild(discordWrap);
        } else {
            discordTd.innerHTML = '<span class="no-discord">—</span>';
        }
        tr.appendChild(discordTd);

        // X
        const xTd = document.createElement('td');
        xTd.className = 'x-cell';
        if (holder.x?.username) {
            const xWrap = document.createElement('a');
            xWrap.className = 'x-linked';
            xWrap.href = 'https://x.com/' + holder.x.username;
            xWrap.target = '_blank';
            xWrap.rel = 'noopener';

            if (holder.x.avatar) {
                const avatar = document.createElement('img');
                avatar.className = 'x-avatar';
                avatar.src = holder.x.avatar;
                avatar.alt = '';
                avatar.onerror = function() { this.style.display = 'none'; };
                xWrap.appendChild(avatar);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'x-name';
            nameSpan.textContent = '@' + holder.x.username;
            xWrap.appendChild(nameSpan);

            xTd.appendChild(xWrap);
        } else {
            xTd.innerHTML = '<span class="no-x">—</span>';
        }
        tr.appendChild(xTd);

        // Count + percentage
        const countTd = document.createElement('td');
        countTd.className = 'count-cell';
        const pct = ((holder.count / holdersData.totalOrcs) * 100).toFixed(1);
        countTd.innerHTML = holder.count + '<span class="pct">' + pct + '%</span>';
        tr.appendChild(countTd);

        // Expand
        const expandTd = document.createElement('td');
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-btn';
        expandBtn.innerHTML = '&#9654;'; // right triangle
        expandBtn.title = 'Show Orcs';
        expandBtn.addEventListener('click', () => toggleExpand(tr, holder, expandBtn));
        expandTd.appendChild(expandBtn);
        tr.appendChild(expandTd);

        tbody.appendChild(tr);
    }

    document.getElementById('loading').style.display = 'none';
    document.getElementById('leaderboard-container').style.display = '';
}

function renderListedForSale() {
    const container = document.getElementById('listed-for-sale');
    if (!container) return;

    const listed = holdersData.listedForSale;
    if (!listed || !listed.length) {
        container.style.display = 'none';
        return;
    }

    const countEl = document.getElementById('listed-count');
    if (countEl) countEl.textContent = listed.length;

    const grid = document.getElementById('listed-grid');
    grid.innerHTML = '';

    for (const orc of listed) {
        const wrapper = document.createElement('div');
        wrapper.className = 'orc-thumb-wrapper';

        const img = document.createElement('img');
        img.className = 'orc-thumb';
        img.src = orc.imageUrl;
        img.alt = orc.name;
        img.loading = 'lazy';
        img.onerror = function() { this.src = '/orclogo.jpg'; };

        const tooltip = document.createElement('div');
        tooltip.className = 'orc-tooltip';
        tooltip.textContent = orc.name + (orc.rarityRank ? ' (#' + orc.rarityRank + ' rarity)' : '');

        wrapper.appendChild(img);
        wrapper.appendChild(tooltip);
        grid.appendChild(wrapper);
    }

    container.style.display = '';
}

function toggleExpand(tr, holder, btn) {
    const existing = tr.nextElementSibling;
    if (existing?.classList.contains('orc-grid-row')) {
        existing.remove();
        btn.classList.remove('expanded');
        return;
    }

    btn.classList.add('expanded');

    const gridRow = document.createElement('tr');
    gridRow.className = 'orc-grid-row';
    const gridTd = document.createElement('td');
    gridTd.colSpan = 6;

    const grid = document.createElement('div');
    grid.className = 'orc-grid';

    for (const orc of holder.orcs) {
        const wrapper = document.createElement('div');
        wrapper.className = 'orc-thumb-wrapper';

        const img = document.createElement('img');
        img.className = 'orc-thumb';
        img.src = orc.imageUrl;
        img.alt = orc.name;
        img.loading = 'lazy';
        img.onerror = function() { this.src = '/orclogo.jpg'; };

        // Show staking/delegation status badge
        if (orc.isFrozen || orc.isDelegated) {
            const badge = document.createElement('span');
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
            wrapper.appendChild(badge);
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'orc-tooltip';
        let tooltipText = orc.name + (orc.rarityRank ? ' (#' + orc.rarityRank + ' rarity)' : '');
        if (orc.isFrozen && orc.isDelegated) tooltipText += ' — Enlisted';
        else if (orc.isFrozen) tooltipText += ' — Enlisted';
        else if (orc.isDelegated) tooltipText += ' — On Loan';
        tooltip.textContent = tooltipText;

        wrapper.appendChild(img);
        wrapper.appendChild(tooltip);
        grid.appendChild(wrapper);
    }

    gridTd.appendChild(grid);
    gridRow.appendChild(gridTd);
    tr.after(gridRow);
}

function highlightMyRow() {
    document.querySelectorAll('.row-highlight').forEach(el => el.classList.remove('row-highlight'));
    if (!connectedWallet) return;

    const row = document.querySelector(`tr[data-wallet="${connectedWallet}"]`);
    if (row) row.classList.add('row-highlight');
}

async function copyToClipboard(text, el) {
    try {
        await navigator.clipboard.writeText(text);
        const orig = el.textContent;
        el.textContent = 'Copied!';
        el.classList.add('copied');
        setTimeout(() => {
            el.textContent = orig;
            el.classList.remove('copied');
        }, 1500);
    } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// --- Wallet address copy (in actions bar) ---

function setupWalletAddressCopy() {
    const walletAddr = document.getElementById('wallet-address');
    walletAddr.addEventListener('click', () => {
        if (connectedWallet) copyToClipboard(connectedWallet, walletAddr);
    });
}

// --- Auto-connect ---

async function tryAutoConnect() {
    const provider = getWalletProvider();
    if (provider) {
        try {
            const response = await provider.connect({ onlyIfTrusted: true });
            connectedWallet = response.publicKey.toString();
            updateWalletUI();
            highlightMyRow();
        } catch (e) {
            // Not auto-trusted, that's fine
        }
    }
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('disconnect-wallet-btn').addEventListener('click', disconnectWallet);
    document.getElementById('link-discord-btn').addEventListener('click', linkDiscord);
    document.getElementById('unlink-discord-btn').addEventListener('click', unlinkDiscord);
    document.getElementById('link-x-btn').addEventListener('click', linkX);
    document.getElementById('unlink-x-btn').addEventListener('click', unlinkX);
    setupWalletAddressCopy();

    fetchHolders();
    tryAutoConnect();
});
