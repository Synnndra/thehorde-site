// Admin Dashboard App
(function () {
    const API_TXLOG = '/api/swap/admin-txlog';

    // DOM refs
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password-input');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchError = document.getElementById('search-error');
    const offersBody = document.getElementById('offers-body');
    const offersEmpty = document.getElementById('offers-empty');

    let currentOffers = [];

    // ---- Utilities ----

    function getSecret() {
        return sessionStorage.getItem('admin_secret');
    }

    function truncateWallet(addr) {
        if (!addr) return '—';
        return addr.slice(0, 4) + '...' + addr.slice(-4);
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function badgeClass(status) {
        const s = (status || '').toLowerCase();
        if (s === 'accepted') return 'badge-escrowed';
        return 'badge-' + s;
    }

    // ---- Auth ----

    function showLogin() {
        loginScreen.hidden = false;
        dashboard.hidden = true;
    }

    function showDashboard() {
        loginScreen.hidden = true;
        dashboard.hidden = false;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.hidden = true;
        const secret = passwordInput.value.trim();
        if (!secret) return;

        try {
            const res = await fetch(API_TXLOG, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret })
            });
            if (res.ok) {
                sessionStorage.setItem('admin_secret', secret);
                passwordInput.value = '';
                showDashboard();
                loadAll();
                loadBadges();
            } else {
                loginError.textContent = res.status === 403 ? 'Invalid secret.' : 'Login failed.';
                loginError.hidden = false;
            }
        } catch {
            loginError.textContent = 'Network error.';
            loginError.hidden = false;
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('admin_secret');
        showLogin();
    });

    // ---- Data Loading ----

    async function fetchOffers(offerId) {
        const secret = getSecret();
        const body = { secret };
        if (offerId) body.offerId = offerId;

        const res = await fetch(API_TXLOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.status === 403) {
            sessionStorage.removeItem('admin_secret');
            showLogin();
            return null;
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Request failed');
        }
        return res.json();
    }

    async function fetchHealth() {
        const secret = getSecret();
        const res = await fetch(API_TXLOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, mode: 'health' })
        });
        if (!res.ok) return null;
        return res.json();
    }

    // ---- Rendering ----

    function renderHealth(data) {
        const kvEl = document.getElementById('health-kv');
        const heliusEl = document.getElementById('health-helius');
        const escrowEl = document.getElementById('health-escrow');
        const balanceEl = document.getElementById('escrow-balance');

        // Reset
        [kvEl, heliusEl, escrowEl].forEach(el => el.className = 'indicator');

        if (!data) return;

        kvEl.classList.add(data.kv || 'red');
        heliusEl.classList.add(data.helius || 'red');
        escrowEl.classList.add(data.escrow?.status || 'red');

        if (data.escrow?.balance != null) {
            balanceEl.textContent = data.escrow.balance.toFixed(4) + ' SOL';
        } else {
            balanceEl.textContent = '—';
        }
    }

    function computeStats(offers) {
        const counts = { pending: 0, escrowed: 0, accepted: 0, completed: 0, failed: 0, cancelled: 0, expired: 0 };
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        let recent = 0;

        for (const o of offers) {
            const s = (o.status || '').toLowerCase();
            if (s in counts) counts[s]++;
            if (o.createdAt && o.createdAt > oneDayAgo) recent++;
        }

        document.getElementById('stat-total').textContent = offers.length;
        document.getElementById('stat-pending').textContent = counts.pending;
        // Combine escrowed + accepted for display
        document.getElementById('stat-escrowed').textContent = counts.escrowed + counts.accepted;
        document.getElementById('stat-completed').textContent = counts.completed;
        document.getElementById('stat-failed').textContent = counts.failed;
        document.getElementById('stat-cancelled').textContent = counts.cancelled;
        document.getElementById('stat-expired').textContent = counts.expired;
        document.getElementById('stat-24h').textContent = recent;
    }

    function renderOffers(offers) {
        currentOffers = offers;
        offersBody.innerHTML = '';
        offersEmpty.hidden = offers.length > 0;

        for (let i = 0; i < offers.length; i++) {
            const o = offers[i];

            // Main row
            const tr = document.createElement('tr');
            tr.className = 'offer-row';
            tr.innerHTML =
                '<td><button class="expand-btn" data-idx="' + i + '" aria-expanded="false" aria-label="Expand offer details">&#9654;</button></td>' +
                '<td>' + escapeHtml(o.offerId) + '</td>' +
                '<td><span class="badge ' + badgeClass(o.status) + '">' + escapeHtml(o.status || '') + '</span></td>' +
                '<td title="' + escapeHtml(o.initiator || '') + '">' + truncateWallet(o.initiator) + '</td>' +
                '<td title="' + escapeHtml(o.receiver || '') + '">' + truncateWallet(o.receiver) + '</td>' +
                '<td>' + formatDate(o.createdAt) + '</td>';
            offersBody.appendChild(tr);

            // Txlog row (hidden)
            const txtr = document.createElement('tr');
            txtr.className = 'txlog-row';
            txtr.id = 'txlog-' + i;
            txtr.hidden = true;
            const td = document.createElement('td');
            td.colSpan = 6;
            td.innerHTML = '<div class="txlog-container">' + renderTxlogTable(o.txLog) + '</div>';
            txtr.appendChild(td);
            offersBody.appendChild(txtr);
        }
    }

    function renderTxlogTable(txLog) {
        if (!txLog || txLog.length === 0) return '<em>No transaction log entries.</em>';

        let html = '<table><thead><tr><th>Action</th><th>Wallet</th><th>Tx Signature</th><th>Error</th><th>Time</th></tr></thead><tbody>';
        for (const entry of txLog) {
            html += '<tr>' +
                '<td>' + escapeHtml(entry.action || '') + '</td>' +
                '<td title="' + escapeHtml(entry.wallet || '') + '">' + truncateWallet(entry.wallet) + '</td>' +
                '<td title="' + escapeHtml(entry.txSignature || '') + '">' + truncateWallet(entry.txSignature) + '</td>' +
                '<td>' + escapeHtml(entry.error || '') + '</td>' +
                '<td>' + formatDate(entry.timestamp) + '</td>' +
                '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Expand/collapse
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.expand-btn');
        if (!btn) return;
        const idx = btn.dataset.idx;
        const row = document.getElementById('txlog-' + idx);
        if (!row) return;
        row.hidden = !row.hidden;
        btn.setAttribute('aria-expanded', !row.hidden);
        btn.innerHTML = row.hidden ? '&#9654;' : '&#9660;';
    });

    // ---- Search ----

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        searchError.hidden = true;
        const id = searchInput.value.trim();
        if (!id) return;

        try {
            const data = await fetchOffers(id);
            if (data && data.offers) {
                renderOffers(data.offers);
                computeStats(data.offers);
            }
        } catch (err) {
            searchError.textContent = err.message;
            searchError.hidden = false;
        }
    });

    // ---- Refresh ----

    refreshBtn.addEventListener('click', loadAll);

    async function loadAll() {
        // Load health and offers in parallel
        const [healthData, offersData] = await Promise.all([
            fetchHealth().catch(() => null),
            fetchOffers().catch(() => null)
        ]);

        renderHealth(healthData);

        if (offersData && offersData.offers) {
            renderOffers(offersData.offers);
            computeStats(offersData.offers);
        }
    }

    // ---- Badge Management ----

    const API_BADGES_ADMIN = '/api/badges-admin';
    const badgeCreateForm = document.getElementById('badge-create-form');
    const badgeAwardForm = document.getElementById('badge-award-form');
    const badgeAwardSelect = document.getElementById('badge-award-select');
    const badgeRevokeBtn = document.getElementById('badge-revoke-btn');
    const badgeRefreshBtn = document.getElementById('badge-refresh-btn');
    const badgeBackfillBtn = document.getElementById('badge-backfill-btn');

    async function fetchBadgeAdmin(body) {
        const secret = getSecret();
        const res = await fetch(API_BADGES_ADMIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, ...body })
        });
        if (res.status === 403) {
            sessionStorage.removeItem('admin_secret');
            showLogin();
            return null;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    async function loadBadges() {
        try {
            const data = await fetchBadgeAdmin({ mode: 'list' });
            if (!data) return;

            const listEl = document.getElementById('badge-list');
            const emptyEl = document.getElementById('badge-list-empty');
            listEl.innerHTML = '';

            // Update award dropdown
            badgeAwardSelect.innerHTML = '<option value="">Select a badge...</option>';

            if (!data.badges || data.badges.length === 0) {
                emptyEl.hidden = false;
                return;
            }
            emptyEl.hidden = true;

            data.badges.forEach(function (b) {
                // List card
                var card = document.createElement('div');
                card.className = 'badge-list-item';
                card.innerHTML =
                    '<span class="badge-icon">' + escapeHtml(b.icon || '⭐') + '</span>' +
                    '<span class="badge-info"><strong>' + escapeHtml(b.name) + '</strong> <code>' + escapeHtml(b.id) + '</code></span>' +
                    '<span class="badge-count">' + (data.counts[b.id] || 0) + ' awarded</span>';

                card.addEventListener('click', function () { viewBadgeWallets(b.id, b.name); });
                listEl.appendChild(card);

                // Dropdown option
                var opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.icon + ' ' + b.name;
                badgeAwardSelect.appendChild(opt);
            });
        } catch (err) {
            console.error('Load badges failed:', err);
        }
    }

    async function viewBadgeWallets(badgeId, badgeName) {
        try {
            var data = await fetchBadgeAdmin({ mode: 'view', badgeId: badgeId });
            if (!data) return;
            var wallets = data.wallets || [];
            var msg = badgeName + ' (' + wallets.length + ' wallets):\n' + (wallets.length > 0 ? wallets.join('\n') : '(none)');
            alert(msg);
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    badgeCreateForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var errEl = document.getElementById('badge-create-error');
        var successEl = document.getElementById('badge-create-success');
        errEl.hidden = true;
        successEl.hidden = true;

        try {
            var data = await fetchBadgeAdmin({
                mode: 'create',
                badgeId: document.getElementById('badge-id-input').value.trim(),
                name: document.getElementById('badge-name-input').value.trim(),
                description: document.getElementById('badge-desc-input').value.trim(),
                icon: document.getElementById('badge-icon-input').value.trim() || '⭐'
            });
            if (!data) return;
            successEl.textContent = 'Badge "' + data.badge.name + '" created.';
            successEl.hidden = false;
            badgeCreateForm.reset();
            loadBadges();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    badgeAwardForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var errEl = document.getElementById('badge-award-error');
        var successEl = document.getElementById('badge-award-success');
        errEl.hidden = true;
        successEl.hidden = true;

        var badgeId = badgeAwardSelect.value;
        var walletsRaw = document.getElementById('badge-wallets-input').value.trim();
        if (!badgeId || !walletsRaw) {
            errEl.textContent = 'Select a badge and enter wallet addresses.';
            errEl.hidden = false;
            return;
        }

        var wallets = walletsRaw.split(/[\n,]+/).map(function (w) { return w.trim(); }).filter(Boolean);

        try {
            var data = await fetchBadgeAdmin({ mode: 'award', badgeId: badgeId, wallets: wallets });
            if (!data) return;
            successEl.textContent = 'Awarded to ' + data.awarded + ' new wallets (' + data.total + ' total).';
            successEl.hidden = false;
            loadBadges();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    badgeRevokeBtn.addEventListener('click', async function () {
        var errEl = document.getElementById('badge-award-error');
        var successEl = document.getElementById('badge-award-success');
        errEl.hidden = true;
        successEl.hidden = true;

        var badgeId = badgeAwardSelect.value;
        var walletsRaw = document.getElementById('badge-wallets-input').value.trim();
        if (!badgeId || !walletsRaw) {
            errEl.textContent = 'Select a badge and enter wallet addresses.';
            errEl.hidden = false;
            return;
        }

        var wallets = walletsRaw.split(/[\n,]+/).map(function (w) { return w.trim(); }).filter(Boolean);

        try {
            var data = await fetchBadgeAdmin({ mode: 'revoke', badgeId: badgeId, wallets: wallets });
            if (!data) return;
            successEl.textContent = 'Revoked from ' + data.revoked + ' wallets (' + data.total + ' remaining).';
            successEl.hidden = false;
            loadBadges();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    badgeRefreshBtn.addEventListener('click', loadBadges);

    badgeBackfillBtn.addEventListener('click', async function () {
        var resultEl = document.getElementById('badge-backfill-result');
        resultEl.hidden = true;
        badgeBackfillBtn.disabled = true;
        badgeBackfillBtn.textContent = 'Backfilling...';

        try {
            var data = await fetchBadgeAdmin({ mode: 'backfill-swaps' });
            if (!data) return;
            resultEl.textContent = 'Backfill complete: ' + data.walletsUpdated + ' wallets updated.';
            resultEl.hidden = false;
        } catch (err) {
            resultEl.textContent = 'Error: ' + err.message;
            resultEl.hidden = false;
        } finally {
            badgeBackfillBtn.disabled = false;
            badgeBackfillBtn.textContent = 'Backfill Swap Counts';
        }
    });

    // ---- Init ----

    if (getSecret()) {
        showDashboard();
        loadAll();
        loadBadges();
    } else {
        showLogin();
    }
})();
