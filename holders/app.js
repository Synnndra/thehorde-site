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
    } else {
        connectBtn.style.display = '';
        disconnectBtn.style.display = 'none';
        walletAddr.style.display = 'none';
        linkBtn.style.display = 'none';
        unlinkBtn.style.display = 'none';
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

// --- Data Loading ---

async function fetchHolders() {
    try {
        const res = await fetch('/api/holders');
        if (!res.ok) throw new Error('Failed to fetch');
        holdersData = await res.json();
        renderStats();
        renderTable();
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
            discordTd.textContent = holder.discord.username;
        } else {
            discordTd.innerHTML = '<span class="no-discord">—</span>';
        }
        tr.appendChild(discordTd);

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
    gridTd.colSpan = 5;

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
    setupWalletAddressCopy();

    fetchHolders();
    tryAutoConnect();
});
