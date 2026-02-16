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
                loadKnowledgeFacts();
                loadResearchAccounts();
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
            var body = {
                mode: 'create',
                badgeId: document.getElementById('badge-id-input').value.trim(),
                name: document.getElementById('badge-name-input').value.trim(),
                description: document.getElementById('badge-desc-input').value.trim(),
                icon: document.getElementById('badge-icon-input').value.trim() || '⭐'
            };
            var imageUrl = document.getElementById('badge-image-input').value.trim();
            if (imageUrl) body.imageUrl = imageUrl;
            var data = await fetchBadgeAdmin(body);
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

    // ---- Drak Knowledge Base ----

    var API_DRAK_KNOWLEDGE = '/api/drak-knowledge';
    var knowledgeAddForm = document.getElementById('knowledge-add-form');
    var knowledgeRefreshBtn = document.getElementById('knowledge-refresh-btn');

    async function fetchDrakKnowledge(body) {
        var secret = getSecret();
        var res = await fetch(API_DRAK_KNOWLEDGE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: secret, ...body })
        });
        if (res.status === 403) {
            sessionStorage.removeItem('admin_secret');
            showLogin();
            return null;
        }
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    async function loadKnowledgeFacts() {
        try {
            var data = await fetchDrakKnowledge({ mode: 'list' });
            if (!data) return;

            var listEl = document.getElementById('knowledge-list');
            var emptyEl = document.getElementById('knowledge-list-empty');
            listEl.innerHTML = '';

            var facts = data.facts || [];
            if (facts.length === 0) {
                emptyEl.hidden = false;
                return;
            }
            emptyEl.hidden = true;

            facts.forEach(function (f) {
                var card = document.createElement('div');
                card.className = 'knowledge-fact-card';
                card.dataset.factId = f.id;
                var imageHtml = '';
                if (f.imageBase64) {
                    imageHtml = '<div class="knowledge-fact-image"><img src="data:image/png;base64,' + f.imageBase64 + '" alt="Fact image"></div>';
                }
                card.innerHTML =
                    '<div class="knowledge-fact-header">' +
                        '<span class="knowledge-fact-category cat-' + escapeHtml(f.category || 'general') + '">' + escapeHtml(f.category || 'general') + '</span>' +
                        '<span class="knowledge-fact-date">' + formatDate(f.createdAt) + '</span>' +
                    '</div>' +
                    imageHtml +
                    '<div class="knowledge-fact-text">' + escapeHtml(f.text) + '</div>' +
                    '<div class="knowledge-fact-actions">' +
                        '<button class="knowledge-edit-btn btn-small" data-fact-id="' + escapeHtml(f.id) + '">Edit</button>' +
                        (f.imageBase64 ? '<button class="knowledge-remove-image-btn btn-small" data-fact-id="' + escapeHtml(f.id) + '">Remove Image</button>' : '') +
                        '<button class="knowledge-delete-btn btn-small btn-danger" data-fact-id="' + escapeHtml(f.id) + '">Delete</button>' +
                    '</div>';
                listEl.appendChild(card);
            });
        } catch (err) {
            console.error('Load knowledge failed:', err);
        }
    }

    // Image upload for add-fact form
    var knowledgeImageInput = document.getElementById('knowledge-image-input');
    var knowledgeImagePreview = document.getElementById('knowledge-image-preview');
    var knowledgeImageThumb = document.getElementById('knowledge-image-thumb');
    var knowledgeImageRemove = document.getElementById('knowledge-image-remove');
    var pendingImageBase64 = null;

    knowledgeImageInput.addEventListener('change', function () {
        var file = knowledgeImageInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('Image must be under 2MB');
            knowledgeImageInput.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            knowledgeImageThumb.src = reader.result;
            knowledgeImagePreview.hidden = false;
            pendingImageBase64 = reader.result.split(',')[1];
        };
        reader.readAsDataURL(file);
    });

    knowledgeImageRemove.addEventListener('click', function () {
        knowledgeImagePreview.hidden = true;
        knowledgeImageInput.value = '';
        pendingImageBase64 = null;
    });

    // Add fact form
    knowledgeAddForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var errEl = document.getElementById('knowledge-add-error');
        var successEl = document.getElementById('knowledge-add-success');
        errEl.hidden = true;
        successEl.hidden = true;

        var text = document.getElementById('knowledge-text-input').value.trim();
        var category = document.getElementById('knowledge-category-input').value;
        if (!text) {
            errEl.textContent = 'Fact text is required.';
            errEl.hidden = false;
            return;
        }

        try {
            var body = { mode: 'add', text: text, category: category };
            if (pendingImageBase64) {
                body.imageBase64 = pendingImageBase64;
            }
            var data = await fetchDrakKnowledge(body);
            if (!data) return;
            successEl.textContent = 'Fact added.';
            successEl.hidden = false;
            knowledgeAddForm.reset();
            knowledgeImagePreview.hidden = true;
            pendingImageBase64 = null;
            loadKnowledgeFacts();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    // Edit fact — inline toggle
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.knowledge-edit-btn');
        if (!btn) return;
        var card = btn.closest('.knowledge-fact-card');
        if (!card) return;
        var factId = btn.dataset.factId;

        // If already in edit mode, save
        var existingArea = card.querySelector('.knowledge-fact-edit-area');
        if (existingArea) {
            var newText = existingArea.value.trim();
            var newCat = card.querySelector('.knowledge-edit-category');
            var catVal = newCat ? newCat.value : null;
            if (!newText) { alert('Text cannot be empty.'); return; }

            btn.disabled = true;
            btn.textContent = 'Saving...';
            try {
                var body = { mode: 'edit', factId: factId, text: newText };
                if (catVal) body.category = catVal;
                await fetchDrakKnowledge(body);
                loadKnowledgeFacts();
            } catch (err) {
                alert('Error: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Save';
            }
            return;
        }

        // Enter edit mode
        var textEl = card.querySelector('.knowledge-fact-text');
        var currentText = textEl.textContent;
        var catEl = card.querySelector('.knowledge-fact-category');
        var currentCat = catEl ? catEl.textContent.trim() : 'general';

        var textarea = document.createElement('textarea');
        textarea.className = 'knowledge-fact-edit-area';
        textarea.maxLength = 500;
        textarea.value = currentText;
        textEl.replaceWith(textarea);
        textarea.focus();

        // Add category dropdown
        var catSelect = document.createElement('select');
        catSelect.className = 'knowledge-edit-category';
        catSelect.style.cssText = 'background:var(--color-bg);border:1px solid var(--border);border-radius:3px;color:var(--color-text);font-size:0.8rem;padding:0.2rem 0.4rem;margin-bottom:0.4rem;';
        ['project', 'community', 'market', 'lore', 'general'].forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === currentCat) opt.selected = true;
            catSelect.appendChild(opt);
        });
        textarea.after(catSelect);

        btn.textContent = 'Save';
    });

    // Remove image from fact
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.knowledge-remove-image-btn');
        if (!btn) return;
        var factId = btn.dataset.factId;
        if (!confirm('Remove image from this fact?')) return;

        try {
            await fetchDrakKnowledge({ mode: 'edit', factId: factId, removeImage: true });
            loadKnowledgeFacts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    // Delete fact
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.knowledge-delete-btn');
        if (!btn) return;
        var factId = btn.dataset.factId;
        if (!confirm('Delete this fact?')) return;

        try {
            await fetchDrakKnowledge({ mode: 'delete', factId: factId });
            loadKnowledgeFacts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    knowledgeRefreshBtn.addEventListener('click', loadKnowledgeFacts);

    // ---- Monitored X Accounts ----

    var researchAccountsInput = document.getElementById('research-accounts-input');
    var researchAccountsSave = document.getElementById('research-accounts-save');

    async function loadResearchAccounts() {
        try {
            var data = await fetchDrakKnowledge({ mode: 'list-accounts' });
            if (!data) return;
            var accounts = data.accounts || [];
            researchAccountsInput.value = accounts.join('\n');
        } catch (err) {
            console.error('Load research accounts failed:', err);
        }
    }

    researchAccountsSave.addEventListener('click', async function () {
        var errEl = document.getElementById('research-accounts-error');
        var successEl = document.getElementById('research-accounts-success');
        errEl.hidden = true;
        successEl.hidden = true;

        var raw = researchAccountsInput.value.trim();
        var accounts = raw.split(/[\n,]+/).map(function (h) { return h.trim().replace(/^@/, ''); }).filter(Boolean);

        try {
            var data = await fetchDrakKnowledge({ mode: 'set-accounts', accounts: accounts });
            if (!data) return;
            successEl.textContent = 'Saved ' + data.accounts.length + ' accounts.';
            successEl.hidden = false;
            researchAccountsInput.value = data.accounts.join('\n');
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    // ---- Tweet Management ----

    var API_TWEET_ADMIN = '/api/x/tweet-admin';
    var tweetComposeForm = document.getElementById('tweet-compose-form');
    var tweetTopicInput = document.getElementById('tweet-topic-input');
    var tweetRefreshBtn = document.getElementById('tweet-refresh-btn');
    var tweetHistoryBtn = document.getElementById('tweet-history-btn');

    // Emoji data: [emoji, keywords] — ~500 curated emojis
    var EMOJI_DATA = [
        // ===== Orc / Medieval / Fantasy =====
        ['⚔️','swords battle fight war'],['🛡️','shield defend protect'],['🏰','castle fortress stronghold'],['👹','ogre orc monster'],['🧌','troll orc creature'],['🪓','axe weapon chop'],['🗡️','dagger sword blade'],['💀','skull death dead'],['🔥','fire flame hot burn'],['⚡','lightning bolt power thunder'],['👑','crown king royal'],['🐉','dragon beast fire'],['🧙','wizard mage magic sorcerer'],['🏹','bow arrow archer'],['💎','gem diamond jewel'],['🪙','coin gold money'],['⛓️','chains bound shackle'],['🍺','beer mead drink tavern ale'],['🐺','wolf beast howl'],['🦅','eagle hawk bird'],['🧝','elf elven'],['🧛','vampire dark night'],['🧟','zombie undead'],['🧞','genie djinn lamp'],['🦇','bat vampire night'],['🕷️','spider web creepy'],['🕸️','spiderweb web trap'],['🐍','snake serpent viper'],['🦂','scorpion sting poison'],['🪨','rock stone boulder'],['🌋','volcano eruption lava'],['🏚️','haunted house abandoned'],['⚰️','coffin death burial'],['🪦','gravestone tombstone rip'],['🔮','crystal ball magic fortune'],['🧿','evil eye nazar amulet'],['🗿','moai stone face statue'],['⛏️','pickaxe mine dig'],['🪤','trap mouse catch'],['🏴‍☠️','pirate flag skull'],
        // ===== Smileys & Faces =====
        ['😀','smile happy grin'],['😃','happy smile open'],['😄','grin smile laugh'],['😁','beam grin teeth'],['😆','laugh squint haha'],['😅','sweat smile nervous'],['🤣','rofl laugh rolling lol'],['😂','tears joy laugh crying'],['🙂','slight smile'],['😉','wink flirt'],['😊','blush smile happy'],['😇','angel innocent halo'],['🥰','love smile hearts'],['😍','heart eyes love'],['🤩','star struck excited wow'],['😘','kiss blow love'],['😗','kiss pucker'],['😚','kiss blush'],['😙','kiss smile'],['🥲','smile tear happy sad'],['😋','yummy delicious tongue'],['😛','tongue out playful'],['😜','wink tongue crazy'],['🤪','zany crazy wild silly'],['😝','tongue squint playful'],['🤑','money face rich'],['🤗','hug arms open'],['🤭','oops giggle hand'],['🫢','gasp shock surprise hand'],['🫣','peek shy cover'],['🤫','shh quiet secret'],['🤔','thinking hmm wonder'],['🫡','salute respect honor'],['🤐','zip mouth shut secret'],['🤨','raised eyebrow skeptical sus'],['😐','neutral straight face'],['😑','expressionless blank'],['😶','speechless silent no mouth'],['🫥','dotted face invisible'],['😏','smirk sly'],['😒','unamused annoyed'],['🙄','eye roll whatever'],['😬','grimace awkward cringe'],['😮‍💨','sigh exhale relief'],['🤥','lie pinocchio nose'],['🫠','melting face hot'],['😌','relieved calm peace'],['😔','pensive sad down'],['😪','sleepy tired tear'],['🤤','drool hungry'],['😴','sleep zzz snore'],['😷','mask sick flu'],['🤒','thermometer sick fever'],['🤕','bandage hurt injured'],['🤢','nausea sick green'],['🤮','vomit throw up sick'],['🥵','hot sweating heat'],['🥶','cold frozen ice freeze'],['🥴','woozy dizzy drunk'],['😵','dizzy knocked out'],['😵‍💫','spiral dizzy confused'],['🤯','mind blown explode head'],['🤠','cowboy hat yeehaw'],['🥳','party celebrate birthday'],['🥸','disguise glasses nose'],['😎','cool sunglasses'],['🤓','nerd glasses geek'],['🧐','monocle inspect curious'],['😕','confused unsure'],['🫤','mouth diagonal unsure'],['😟','worried concerned'],['🙁','frown sad'],['☹️','frown sad unhappy'],['😮','open mouth surprise oh'],['😯','hushed surprised'],['😲','astonished shocked wow'],['😳','flushed embarrassed blush'],['🥺','pleading puppy eyes please'],['🥹','hold back tears touched'],['😦','frown open worried'],['😧','anguished distressed'],['😨','fearful scared afraid'],['😰','anxious cold sweat'],['😥','sad relieved sweat'],['😢','crying tear sad'],['😭','sobbing cry wail loud'],['😱','scream shock horror'],['😖','confounded frustrated'],['😣','persevere struggle'],['😞','disappointed let down'],['😓','downcast sweat sad'],['😩','weary tired exhausted'],['😫','tired fed up'],['🥱','yawn bored tired sleepy'],['😤','angry steam mad huff'],['😡','angry rage fury red'],['😠','mad angry grr'],['🤬','swearing cursing angry'],['😈','devil evil smirk imp'],['👿','angry devil imp'],['👻','ghost spooky boo'],['🤡','clown joke circus'],['💩','poop crap'],['👽','alien ufo space'],['🤖','robot bot ai machine'],['😺','cat smile happy'],['😸','cat grin'],['😹','cat joy laugh tears'],['😻','cat heart eyes love'],['😼','cat smirk wry'],['😽','cat kiss'],['🙀','cat weary shocked'],['😿','cat cry sad'],['😾','cat angry mad'],
        // ===== People & Gestures =====
        ['👋','wave hello hi bye'],['🤚','raised hand back stop'],['🖐️','hand fingers spread'],['✋','hand raised stop high five'],['🖖','vulcan spock trek'],['🫱','right hand'],['🫲','left hand'],['🫳','palm down hand'],['🫴','palm up hand'],['👌','ok good perfect fine'],['🤌','pinch italian chef kiss'],['🤏','pinch small tiny'],['✌️','peace victory two'],['🤞','fingers crossed luck hope'],['🫰','hand index thumb'],['🤟','love you sign ily'],['🤘','rock on metal horns'],['🤙','call me shaka hang loose'],['👈','point left'],['👉','point right'],['👆','point up'],['👇','point down'],['☝️','index up one'],['🫵','point at you'],['👍','thumbs up good yes like'],['👎','thumbs down bad no dislike'],['✊','fist solidarity raised'],['👊','punch fist bump'],['🤛','left fist bump'],['🤜','right fist bump'],['👏','clap applause bravo'],['🙌','raised hands celebrate hooray'],['🫶','heart hands love'],['👐','open hands jazz'],['🤲','palms up together prayer'],['🤝','handshake deal alliance'],['🙏','pray please thanks namaste'],['✍️','writing pen hand'],['💅','nail polish sassy'],['🤳','selfie phone camera'],['💪','strong muscle flex power bicep'],['🦾','mechanical arm prosthetic robot'],['🦿','mechanical leg prosthetic'],['🧠','brain smart think mind'],['👀','eyes look watch see'],['👁️','eye see look'],['👅','tongue lick taste'],['👄','lips mouth kiss'],['🫦','biting lip nervous flirt'],['🗣️','speaking head talk voice'],['👤','silhouette person shadow'],['👥','two people group'],
        // ===== Hearts & Love =====
        ['❤️','heart love red'],['🧡','orange heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart dark'],['🤍','white heart pure'],['🤎','brown heart'],['❤️‍🔥','heart fire passion'],['❤️‍🩹','mending heart heal'],['💔','broken heart sad'],['❣️','heart exclamation'],['💕','two hearts love'],['💞','revolving hearts love'],['💓','heartbeat pulse'],['💗','growing heart love'],['💖','sparkling heart love'],['💘','cupid arrow heart love'],['💝','ribbon heart gift love'],['💟','heart decoration'],['♥️','heart suit card'],
        // ===== Animals & Nature =====
        ['🐶','dog puppy woof'],['🐱','cat kitty meow'],['🐭','mouse rat'],['🐹','hamster cute'],['🐰','rabbit bunny'],['🦊','fox clever sly'],['🐻','bear grizzly'],['🐼','panda bear'],['🐻‍❄️','polar bear arctic'],['🐨','koala bear'],['🐯','tiger cat wild'],['🦁','lion king mane'],['🐮','cow moo'],['🐷','pig oink'],['🐸','frog toad ribbit'],['🐵','monkey face'],['🙈','see no evil monkey'],['🙉','hear no evil monkey'],['🙊','speak no evil monkey'],['🐒','monkey chimp'],['🦍','gorilla ape'],['🦧','orangutan ape'],['🐔','chicken hen'],['🐧','penguin cold ice'],['🐦','bird tweet'],['🦜','parrot bird colorful'],['🦆','duck quack'],['🦢','swan elegant white'],['🦉','owl night wise hoot'],['🦩','flamingo pink bird'],['🐊','crocodile alligator'],['🐢','turtle slow shell'],['🦎','lizard reptile'],['🐙','octopus tentacle'],['🦑','squid ocean'],['🦀','crab ocean pinch'],['🦞','lobster ocean'],['🐠','tropical fish'],['🐟','fish ocean'],['🐬','dolphin ocean smart'],['🐳','whale ocean splash'],['🦈','shark ocean danger'],['🐋','whale humpback'],['🐾','paw print animal'],['🦋','butterfly insect pretty'],['🐛','bug caterpillar insect'],['🐝','bee honey buzz wasp'],['🐞','ladybug ladybird'],['🦗','cricket insect chirp'],['🪲','beetle insect bug'],['🌸','cherry blossom flower pink spring'],['🌺','hibiscus flower'],['🌻','sunflower yellow'],['🌹','rose flower red love'],['🌷','tulip flower spring'],['🌼','blossom flower yellow'],['🥀','wilted flower dead'],['💐','bouquet flowers gift'],['🌿','herb leaf green'],['🍀','four leaf clover luck'],['🍁','maple leaf fall autumn'],['🍂','fallen leaf autumn'],['🌲','evergreen tree pine'],['🌳','tree deciduous oak'],['🌴','palm tree tropical beach'],['🌵','cactus desert'],['🍄','mushroom fungus toad'],['🪵','wood log timber'],
        // ===== Food & Drink =====
        ['🍎','apple red fruit'],['🍊','orange tangerine fruit'],['🍋','lemon yellow citrus'],['🍌','banana yellow fruit'],['🍉','watermelon fruit summer'],['🍇','grapes wine purple'],['🍓','strawberry berry red'],['🫐','blueberry berry'],['🍑','peach fruit'],['🍒','cherry fruit red'],['🥭','mango fruit tropical'],['🍍','pineapple fruit tropical'],['🥝','kiwi fruit green'],['🍅','tomato red'],['🥑','avocado guac green'],['🌶️','hot pepper chili spicy'],['🌽','corn cob maize'],['🥔','potato spud'],['🧅','onion'],['🧄','garlic'],['🍔','burger hamburger fast food'],['🍕','pizza slice'],['🌮','taco mexican'],['🌯','burrito wrap mexican'],['🥪','sandwich sub'],['🍗','chicken leg drumstick'],['🥩','steak meat cut'],['🍖','meat bone'],['🍣','sushi japanese fish'],['🍜','ramen noodle soup'],['🍝','spaghetti pasta'],['🍰','cake shortcake dessert'],['🎂','birthday cake candle'],['🧁','cupcake muffin'],['🍩','donut doughnut'],['🍪','cookie biscuit'],['🍫','chocolate bar candy'],['🍬','candy sweet'],['🍭','lollipop candy'],['🍦','ice cream cone'],['☕','coffee tea cup hot'],['🍵','tea green cup'],['🧋','boba bubble tea'],['🥤','cup straw drink soda'],['🍷','wine glass red'],['🍸','cocktail martini drink'],['🍹','tropical drink cocktail'],['🍻','cheers beer mugs clink'],['🥂','champagne toast celebrate'],['🥃','whiskey tumbler drink'],
        // ===== Activities & Sports =====
        ['⚽','soccer football ball'],['🏀','basketball ball'],['🏈','football american ball'],['⚾','baseball ball'],['🎾','tennis ball racket'],['🏐','volleyball ball'],['🏉','rugby ball'],['🎱','billiards pool eight ball'],['🏓','ping pong table tennis'],['🏸','badminton shuttlecock'],['🏒','hockey ice stick'],['🥊','boxing glove fight'],['🥋','martial arts karate'],['⛳','golf flag hole'],['🎣','fishing rod hook'],['🏄','surfing wave'],['🏊','swimming pool water'],['🚴','cycling bike bicycle'],['🏋️','weight lifting gym strong'],['🤸','cartwheel gymnastics'],['⛷️','skiing snow mountain'],['🏂','snowboard winter'],['🎮','game controller video gaming'],['🕹️','joystick arcade game'],['🎲','dice game chance roll'],['🧩','puzzle piece jigsaw'],['🎰','slot machine casino gamble'],['🎳','bowling pins ball'],['🎯','target bullseye aim dart'],['🏆','trophy winner champion cup'],['🥇','gold medal first place'],['🥈','silver medal second'],['🥉','bronze medal third'],['🏅','medal sports award'],['🎖️','military medal honor'],['🎗️','ribbon awareness'],
        // ===== Travel & Places =====
        ['🚗','car automobile drive'],['🚕','taxi cab yellow'],['🏎️','race car fast speed'],['🚓','police car cop'],['🚑','ambulance emergency'],['🚒','fire truck engine'],['🚀','rocket launch moon space'],['✈️','airplane plane fly travel'],['🛸','ufo flying saucer alien'],['🚁','helicopter chopper'],['⛵','sailboat boat wind'],['🚢','ship boat cruise'],['🏠','house home'],['🏡','garden house home'],['🏢','office building'],['🏗️','construction crane build'],['🏭','factory industrial'],['🗼','tokyo tower'],['🗽','statue liberty nyc'],['⛩️','shrine torii japan'],['🕌','mosque islam'],['⛪','church christian'],['🏔️','mountain snow peak'],['⛰️','mountain peak'],['🌅','sunrise morning sun'],['🌄','sunrise mountain dawn'],['🌆','cityscape evening dusk'],['🌇','sunset city'],['🌃','night stars city'],['🌉','bridge night city'],['🎡','ferris wheel carnival'],['🎢','roller coaster ride'],['🗺️','world map earth'],['🧭','compass direction navigate'],
        // ===== Objects =====
        ['⌚','watch time wrist'],['📱','phone mobile cell'],['💻','laptop computer'],['⌨️','keyboard type'],['🖥️','desktop computer monitor'],['🖨️','printer print'],['🖱️','mouse computer click'],['💾','floppy disk save'],['💿','cd disc'],['📷','camera photo'],['📸','camera flash photo'],['📹','video camera record'],['🎬','clapper board movie film'],['📺','tv television screen'],['📻','radio'],['🎙️','microphone studio podcast'],['🎤','mic karaoke sing'],['🎧','headphone music listen'],['🎵','music note sound'],['🎶','music notes melody song'],['🎸','guitar rock music'],['🥁','drum beat music'],['🎺','trumpet horn music'],['🎷','saxophone jazz music'],['🎹','piano keys music'],['🪘','drum african'],['📚','books stack read study'],['📖','book open read'],['📝','memo note write pencil'],['✏️','pencil write draw'],['🖊️','pen write ink'],['🖋️','fountain pen calligraphy'],['📌','pin push tack'],['📎','paperclip clip attach'],['🔒','lock secure locked'],['🔓','unlock open'],['🔑','key access unlock'],['🗝️','old key skeleton vintage'],['🔨','hammer tool build'],['🪚','saw cut tool'],['🔧','wrench tool fix'],['🔩','nut bolt screw'],['⚙️','gear settings cog'],['🧲','magnet attract'],['💣','bomb explosion'],['🧨','firecracker dynamite explosive'],['🪄','magic wand spell'],['🏺','amphora vase ancient'],['🧪','test tube science lab'],['🔬','microscope science lab'],['🔭','telescope space astronomy'],['💊','pill medicine drug'],['💉','syringe needle vaccine'],['🩸','blood drop red'],['🛒','shopping cart store'],['🎁','gift present wrapped'],['🎀','ribbon bow pink'],['🎈','balloon party'],['🎉','party popper celebrate confetti'],['🎊','confetti ball celebrate'],['🎭','theater masks drama'],['🎨','art palette paint'],['🧵','thread sew stitch'],['🪡','sewing needle stitch'],['📦','package box delivery'],['📫','mailbox letter mail'],['📬','mailbox flag mail'],['✉️','envelope letter email mail'],['📜','scroll parchment ancient document'],['📃','page curl document'],['📄','page document file'],['📰','newspaper news press'],['🏷️','label tag price'],['🔖','bookmark mark save'],['💡','light bulb idea'],['🔦','flashlight torch light'],['🕯️','candle flame light'],['🪔','lamp oil diya'],['🧯','fire extinguisher safety'],['🛢️','oil drum barrel'],['💵','dollar bill money cash'],['💴','yen bill money'],['💶','euro bill money'],['💷','pound bill money'],['🪬','hamsa hand protection'],['📿','prayer beads rosary'],['🧿','evil eye nazar amulet'],['⏰','alarm clock time wake'],['⏳','hourglass sand time'],['⌛','hourglass done time'],['🔔','bell notification alert ring'],['🔕','bell silent mute no'],['📡','satellite dish signal'],['🧰','toolbox tools fix'],['🗜️','clamp vise compress'],
        // ===== Crypto / Web3 / Finance =====
        ['💰','money bag rich wealth'],['📈','chart up green pump bull'],['📉','chart down red dump bear'],['📊','graph data stats analytics'],['🔗','link chain connect'],['🌐','globe world web internet'],['🏦','bank finance defi'],['💸','money fly spend send'],['🧱','brick build block chain'],['⛓️‍💥','chain broken free'],['🪙','token coin crypto'],['💳','credit card payment'],['🧾','receipt transaction'],['📋','clipboard list data'],['🔐','locked key secure encrypt'],
        // ===== Symbols & Arrows =====
        ['✅','check yes done complete'],['❌','cross no wrong cancel'],['⚠️','warning alert caution'],['🚫','prohibited forbidden no'],['⛔','no entry stop forbidden'],['🔴','red circle stop'],['🟢','green circle go'],['🟡','yellow circle caution'],['🔵','blue circle'],['🟣','purple circle'],['🟤','brown circle'],['⚫','black circle'],['⚪','white circle'],['🟥','red square'],['🟩','green square'],['🟨','yellow square'],['🟦','blue square'],['🟪','purple square'],['⬛','black square'],['⬜','white square'],['➡️','arrow right next'],['⬅️','arrow left back previous'],['⬆️','arrow up'],['⬇️','arrow down'],['↗️','arrow up right'],['↘️','arrow down right'],['↙️','arrow down left'],['↪️','arrow curve right'],['↩️','arrow curve left'],['🔄','arrows cycle refresh'],['🔃','arrows clockwise'],['🔁','repeat loop again'],['🔀','shuffle random mix'],['▶️','play start forward'],['⏸️','pause stop break'],['⏹️','stop square'],['⏭️','skip next forward'],['⏩','fast forward'],['⏪','rewind back'],['🔹','diamond blue small'],['🔸','diamond orange small'],['🔶','diamond orange large'],['🔷','diamond blue large'],['▪️','square black small'],['◾','square dark medium small'],['•','bullet dot point'],['—','dash em long'],['…','ellipsis dots'],['‼️','double exclamation'],['⁉️','exclamation question'],['❓','question red'],['❔','question white'],['❗','exclamation red'],['❕','exclamation white'],['〰️','wavy dash'],['©️','copyright'],['®️','registered trademark'],['™️','trademark'],['#️⃣','hash number pound'],['*️⃣','asterisk star'],['0️⃣','zero number'],['1️⃣','one number'],['2️⃣','two number'],['3️⃣','three number'],['4️⃣','four number'],['5️⃣','five number'],['6️⃣','six number'],['7️⃣','seven number'],['8️⃣','eight number'],['9️⃣','nine number'],['🔟','ten number keycap'],
        // ===== Weather & Sky =====
        ['☀️','sun sunny bright'],['🌤️','sun cloud partly'],['⛅','cloud sun partly'],['🌥️','cloud sun behind'],['☁️','cloud overcast'],['🌦️','rain sun cloud'],['🌧️','rain cloud'],['⛈️','thunder storm cloud lightning'],['🌩️','lightning cloud storm'],['🌨️','snow cloud winter'],['❄️','snowflake cold winter ice'],['🌪️','tornado twister storm'],['🌫️','fog mist haze'],['🌈','rainbow colors arc'],['🌙','crescent moon night'],['🌕','full moon night'],['🌑','new moon dark'],['⭐','star favorite night'],['🌟','sparkle shine glow star'],['✨','sparkles magic shine glitter'],['💫','dizzy star shooting'],['☄️','comet meteor space'],['🌠','shooting star wish'],['🌌','milky way galaxy space'],['☔','umbrella rain'],['💧','water drop drip'],['🌊','wave ocean water surf'],['💨','wind dash gust blow'],
        // ===== Flags =====
        ['🏁','checkered flag finish race'],['🚩','red flag warning'],['🏳️','white flag surrender'],['🏴','black flag pirate'],['🏳️‍🌈','rainbow flag pride lgbtq'],['🇺🇸','usa america us flag'],['🇬🇧','uk britain england flag'],['🇯🇵','japan flag'],['🇰🇷','korea south flag'],['🇩🇪','germany flag'],['🇫🇷','france flag'],['🇪🇸','spain flag'],['🇮🇹','italy flag'],['🇧🇷','brazil flag'],['🇲🇽','mexico flag'],['🇨🇦','canada flag'],['🇦🇺','australia flag'],['🇮🇳','india flag'],['🇨🇳','china flag'],['🇷🇺','russia flag'],['🇹🇷','turkey flag'],['🇸🇦','saudi arabia flag'],['🇦🇪','uae emirates flag'],['🇳🇬','nigeria flag'],['🇿🇦','south africa flag'],['🇸🇬','singapore flag'],['🇹🇭','thailand flag'],['🇻🇳','vietnam flag'],['🇵🇭','philippines flag'],['🇮🇩','indonesia flag']
    ];

    async function fetchTweetAdmin(body) {
        var secret = getSecret();
        var res = await fetch(API_TWEET_ADMIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: secret, ...body })
        });
        if (res.status === 403) {
            sessionStorage.removeItem('admin_secret');
            showLogin();
            return null;
        }
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || 'Request failed');
        return data;
    }

    function buildEditorHtml(textareaId, displayText, editable) {
        var len = displayText.length;
        var pct = Math.min(100, Math.round((len / 280) * 100));
        var barColor = len > 280 ? '#e74c3c' : len > 240 ? '#f1c40f' : '#2ecc40';

        var html = '';
        if (editable) {
            html += '<div class="tweet-toolbar">' +
                '<button type="button" class="toolbar-btn tweet-emoji-toggle" title="Emoji picker">😀 Emoji</button>' +
                '<label class="toolbar-btn tweet-image-label" title="Attach image">🖼️ Image<input type="file" class="tweet-image-input" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>' +
                '<button type="button" class="toolbar-btn tweet-linebreak-btn" title="Insert line break">↵ Break</button>' +
                '<button type="button" class="toolbar-btn tweet-undo-btn" title="Undo">↩ Undo</button>' +
                '<button type="button" class="toolbar-btn tweet-clear-btn" title="Clear">✕ Clear</button>' +
                '</div>';
            html += '<div class="tweet-emoji-picker" hidden></div>';
            html += '<div class="tweet-image-preview" hidden><img class="tweet-image-thumb"><button type="button" class="tweet-image-remove toolbar-btn">✕ Remove</button></div>';
        }
        html += '<textarea class="tweet-edit-area" id="' + textareaId + '"' + (!editable ? ' readonly' : '') + '>' + escapeHtml(displayText) + '</textarea>';
        html += '<div class="tweet-char-bar">' +
            '<div class="tweet-char-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div>' +
            '</div>';
        html += '<div class="tweet-char-count"><span class="char-count-num" style="color:' + (len > 280 ? '#e44' : '') + '">' + len + '</span>/280</div>';
        html += '<div class="tweet-preview"><div class="tweet-preview-label">Preview</div>' +
            '<div class="tweet-preview-content">' +
            '<div class="tweet-preview-header"><strong>@midhorde</strong> <span class="tweet-preview-handle">· just now</span></div>' +
            '<div class="tweet-preview-text">' + formatTweetPreview(displayText) + '</div>' +
            '</div></div>';
        return html;
    }

    function formatTweetPreview(text) {
        var safe = escapeHtml(text);
        // Convert newlines to <br>
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    function updateEditorState(card) {
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        var len = textarea.value.length;
        var pct = Math.min(100, Math.round((len / 280) * 100));
        var barColor = len > 280 ? '#e74c3c' : len > 240 ? '#f1c40f' : '#2ecc40';

        var countEl = card.querySelector('.char-count-num');
        if (countEl) {
            countEl.textContent = len;
            countEl.style.color = len > 280 ? '#e44' : '';
        }
        var barFill = card.querySelector('.tweet-char-bar-fill');
        if (barFill) {
            barFill.style.width = pct + '%';
            barFill.style.background = barColor;
        }
        var previewText = card.querySelector('.tweet-preview-text');
        if (previewText) {
            previewText.innerHTML = formatTweetPreview(textarea.value);
        }
    }

    function buildEmojiPickerContent(pickerEl) {
        if (pickerEl.children.length > 0) return; // already built
        // Search input
        var searchWrap = document.createElement('div');
        searchWrap.className = 'emoji-search-wrap';
        searchWrap.innerHTML = '<input type="text" class="emoji-search-input" placeholder="Search emoji...">';
        pickerEl.appendChild(searchWrap);
        // Emoji grid
        var grid = document.createElement('div');
        grid.className = 'emoji-grid';
        EMOJI_DATA.forEach(function (pair) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-btn';
            btn.textContent = pair[0];
            btn.title = pair[1];
            btn.dataset.keywords = pair[1];
            grid.appendChild(btn);
        });
        pickerEl.appendChild(grid);
    }

    // Emoji search filtering
    document.addEventListener('input', function (e) {
        if (!e.target.classList.contains('emoji-search-input')) return;
        var query = e.target.value.toLowerCase().trim();
        var picker = e.target.closest('.tweet-emoji-picker');
        if (!picker) return;
        var buttons = picker.querySelectorAll('.emoji-btn');
        buttons.forEach(function (btn) {
            if (!query) { btn.hidden = false; return; }
            var kw = (btn.dataset.keywords || '') + ' ' + btn.textContent;
            btn.hidden = kw.toLowerCase().indexOf(query) === -1;
        });
    });

    async function loadTweetDrafts() {
        var listEl = document.getElementById('tweet-drafts-list');
        var emptyEl = document.getElementById('tweet-drafts-empty');
        var historyEl = document.getElementById('tweet-history-list');
        try {
            var data = await fetchTweetAdmin({ mode: 'list' });
            if (!data) return;

            listEl.innerHTML = '';
            var drafts = data.drafts || [];

            // Split into pending/failed vs posted/rejected
            var pending = drafts.filter(function (d) { return d.status === 'pending' || d.status === 'failed'; });
            var posted = drafts.filter(function (d) { return d.status === 'posted' || d.status === 'rejected'; });

            if (pending.length === 0) {
                emptyEl.hidden = false;
            } else {
                emptyEl.hidden = true;
            }

            pending.forEach(function (d) {
                var card = buildDraftCard(d, true);
                listEl.appendChild(card);
            });

            // Render posted/rejected into history
            historyEl.innerHTML = '';
            if (posted.length === 0) {
                historyEl.innerHTML = '<p class="empty-text">No posted tweets yet.</p>';
            } else {
                var HISTORY_VISIBLE = 3;
                posted.forEach(function (d, idx) {
                    var item = document.createElement('div');
                    item.className = 'tweet-history-item';
                    if (idx >= HISTORY_VISIBLE) item.classList.add('tweet-history-hidden');
                    var displayText = d.editedText || d.text || '';
                    var statusLabel = d.status === 'rejected'
                        ? '<span class="badge badge-failed">rejected</span> '
                        : '';
                    item.innerHTML =
                        '<span class="tweet-history-text">' + statusLabel + escapeHtml(displayText) + '</span>' +
                        '<span class="tweet-history-meta">' + formatDate(d.postedAt || d.createdAt) +
                        (d.tweetId ? ' &middot; <a href="https://x.com/midhorde/status/' + escapeHtml(d.tweetId) + '" target="_blank" rel="noopener">View</a>' : '') +
                        ' &middot; <button class="tweet-delete-btn btn-small" data-draft-id="' + escapeHtml(d.id) + '">Delete</button>' +
                        '</span>';
                    historyEl.appendChild(item);
                });
                if (posted.length > HISTORY_VISIBLE) {
                    var toggleBtn = document.createElement('button');
                    toggleBtn.className = 'btn-small tweet-history-toggle';
                    toggleBtn.textContent = 'Show ' + (posted.length - HISTORY_VISIBLE) + ' more';
                    toggleBtn.addEventListener('click', function () {
                        var hidden = historyEl.querySelectorAll('.tweet-history-hidden');
                        var isCollapsed = hidden.length > 0 && hidden[0].style.display !== 'block';
                        hidden.forEach(function (el) { el.style.display = isCollapsed ? 'block' : ''; });
                        if (isCollapsed) {
                            toggleBtn.textContent = 'Show less';
                            hidden.forEach(function (el) { el.style.display = 'block'; });
                        } else {
                            toggleBtn.textContent = 'Show ' + (posted.length - HISTORY_VISIBLE) + ' more';
                            hidden.forEach(function (el) { el.style.display = ''; });
                        }
                    });
                    historyEl.appendChild(toggleBtn);
                }
            }
        } catch (err) {
            console.error('Load tweet drafts failed:', err);
        }
    }

    function buildDraftCard(d, editable) {
        var card = document.createElement('div');
        card.className = 'tweet-draft-card';
        card.dataset.id = d.id;

        var statusClass = 'badge-' + (d.status || 'pending');
        var dateStr = formatDate(d.createdAt);
        var displayText = d.editedText || d.text || '';
        var textareaId = 'ta-' + d.id;

        var html = '<div class="tweet-draft-header">' +
            '<span class="badge ' + statusClass + '">' + escapeHtml(d.status || '') + '</span>' +
            '<span class="tweet-draft-source">' + escapeHtml(d.source || '') + '</span>' +
            '<span class="tweet-draft-date">' + dateStr + '</span>' +
            '</div>';

        if (d.topic) {
            html += '<div class="tweet-draft-topic">Topic: ' + escapeHtml(d.topic) + '</div>';
        }

        html += '<div class="tweet-editor-wrap">' + buildEditorHtml(textareaId, displayText, editable) + '</div>';

        // Suggested tags
        if (d.suggestedTags && d.suggestedTags.length > 0 && editable) {
            html += '<div class="tweet-suggestions">';
            html += '<span class="tweet-suggestion-label">Tag:</span>';
            d.suggestedTags.forEach(function (tag) {
                html += '<button type="button" class="tweet-tag-pill" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
            });
            html += '</div>';
        }

        // Image idea
        if (d.imageIdea && editable) {
            html += '<div class="tweet-image-idea">';
            html += '<span class="tweet-suggestion-label">Image idea:</span> ' + escapeHtml(d.imageIdea);
            html += '</div>';
        }

        if (editable) {
            html += '<div class="tweet-draft-actions">';
            html += '<button class="tweet-approve-btn" data-draft-id="' + escapeHtml(d.id) + '">Approve & Post</button>';
            html += '<button class="tweet-reject-btn btn-danger" data-draft-id="' + escapeHtml(d.id) + '">Reject</button>';
            html += '<button class="tweet-delete-btn btn-small" data-draft-id="' + escapeHtml(d.id) + '">Delete</button>';
            html += '</div>';
        }

        if (d.error) {
            html += '<div class="tweet-draft-error">Error: ' + escapeHtml(d.error) + '</div>';
        }

        card.innerHTML = html;
        return card;
    }

    // Live update on textarea input
    document.addEventListener('input', function (e) {
        if (!e.target.classList.contains('tweet-edit-area')) return;
        var card = e.target.closest('.tweet-draft-card');
        if (card) updateEditorState(card);
    });

    // Tag pill insert
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-tag-pill');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        var tag = btn.dataset.tag;
        // Append tag to end of tweet with a space
        var text = textarea.value;
        if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
            text += ' ';
        }
        textarea.value = text + tag;
        textarea.focus();
        updateEditorState(card);
        // Dim the pill to show it was used
        btn.classList.add('used');
    });

    // Emoji toggle
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-emoji-toggle');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var picker = card.querySelector('.tweet-emoji-picker');
        if (!picker) return;
        buildEmojiPickerContent(picker);
        picker.hidden = !picker.hidden;
    });

    // Emoji insert
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.emoji-btn');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var emoji = btn.textContent;
        textarea.value = textarea.value.slice(0, start) + emoji + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
        updateEditorState(card);
    });

    // Line break button
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-linebreak-btn');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        var start = textarea.selectionStart;
        textarea.value = textarea.value.slice(0, start) + '\n' + textarea.value.slice(textarea.selectionEnd);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        textarea.focus();
        updateEditorState(card);
    });

    // Undo button
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-undo-btn');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        textarea.focus();
        document.execCommand('undo');
        updateEditorState(card);
    });

    // Clear button
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-clear-btn');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        if (!confirm('Clear all text?')) return;
        textarea.value = '';
        textarea.focus();
        updateEditorState(card);
    });

    // Image file input
    document.addEventListener('change', function (e) {
        if (!e.target.classList.contains('tweet-image-input')) return;
        var card = e.target.closest('.tweet-draft-card');
        if (!card) return;
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) {
            alert('Image must be under 4MB');
            e.target.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var previewWrap = card.querySelector('.tweet-image-preview');
            var thumb = card.querySelector('.tweet-image-thumb');
            if (previewWrap && thumb) {
                thumb.src = reader.result;
                previewWrap.hidden = false;
                // Store base64 and mime on the card for later
                card.dataset.imageBase64 = reader.result.split(',')[1];
                card.dataset.imageMime = file.type;
            }
            // Update preview
            var previewImg = card.querySelector('.tweet-preview-image');
            if (!previewImg) {
                var previewContent = card.querySelector('.tweet-preview-content');
                if (previewContent) {
                    var img = document.createElement('img');
                    img.className = 'tweet-preview-image';
                    img.src = reader.result;
                    previewContent.appendChild(img);
                }
            } else {
                previewImg.src = reader.result;
            }
        };
        reader.readAsDataURL(file);
    });

    // Remove image
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-image-remove');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var previewWrap = card.querySelector('.tweet-image-preview');
        if (previewWrap) previewWrap.hidden = true;
        var input = card.querySelector('.tweet-image-input');
        if (input) input.value = '';
        delete card.dataset.imageBase64;
        delete card.dataset.imageMime;
        var previewImg = card.querySelector('.tweet-preview-image');
        if (previewImg) previewImg.remove();
    });

    // Approve button
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.tweet-approve-btn');
        if (!btn) return;
        var draftId = btn.dataset.draftId;
        var card = btn.closest('.tweet-draft-card');
        var textarea = card.querySelector('.tweet-edit-area');
        var editedText = textarea ? textarea.value.trim() : '';

        if (editedText.length > 280) {
            alert('Tweet too long (' + editedText.length + '/280)');
            return;
        }
        if (!confirm('Post this tweet to @midhorde?')) return;

        btn.disabled = true;
        btn.textContent = 'Posting...';
        try {
            var body = { mode: 'approve', draftId: draftId, text: editedText };
            if (card.dataset.imageBase64) {
                body.imageBase64 = card.dataset.imageBase64;
                body.imageMimeType = card.dataset.imageMime || 'image/png';
            }
            var data = await fetchTweetAdmin(body);
            if (data) {
                loadTweetDrafts();
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Approve & Post';
        }
    });

    // Reject button
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.tweet-reject-btn');
        if (!btn) return;
        var draftId = btn.dataset.draftId;
        if (!confirm('Reject this draft?')) return;

        try {
            await fetchTweetAdmin({ mode: 'reject', draftId: draftId });
            loadTweetDrafts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    // Delete button
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.tweet-delete-btn');
        if (!btn) return;
        var draftId = btn.dataset.draftId;
        if (!confirm('Permanently delete this draft?')) return;

        try {
            await fetchTweetAdmin({ mode: 'delete', draftId: draftId });
            loadTweetDrafts();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    // Compose form
    tweetComposeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var statusEl = document.getElementById('tweet-compose-status');
        var errEl = document.getElementById('tweet-compose-error');
        statusEl.hidden = true;
        errEl.hidden = true;

        var topic = tweetTopicInput.value.trim() || null;
        var submitBtn = tweetComposeForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Composing...';

        try {
            var data = await fetchTweetAdmin({ mode: 'compose', topic: topic });
            if (!data) return;
            statusEl.textContent = 'Draft composed: "' + (data.draft?.text || '').slice(0, 60) + '..."';
            statusEl.hidden = false;
            tweetTopicInput.value = '';
            loadTweetDrafts();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Compose';
        }
    });

    // Refresh drafts
    tweetRefreshBtn.addEventListener('click', loadTweetDrafts);

    // Refresh history (same as refresh drafts — history is auto-rendered)
    tweetHistoryBtn.addEventListener('click', loadTweetDrafts);

    // ---- Init ----

    if (getSecret()) {
        showDashboard();
        loadAll();
        loadBadges();
        loadKnowledgeFacts();
        loadResearchAccounts();
        loadTweetDrafts();
    } else {
        showLogin();
    }
})();
