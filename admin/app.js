// Admin Dashboard App
(function () {
    const API_TXLOG = '/api/swap/admin-txlog';
    const API_HEALTH = '/api/swap/admin-health';

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
        const res = await fetch(API_HEALTH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret })
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
                '<td><button class="expand-btn" data-idx="' + i + '">&#9654;</button></td>' +
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

    // ---- Init ----

    if (getSecret()) {
        showDashboard();
        loadAll();
    } else {
        showLogin();
    }
})();
