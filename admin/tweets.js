// Tweet Manager App
(function () {
    var API_TXLOG = '/api/swap/admin-txlog';
    var API_TWEET_ADMIN = '/api/x/tweet-admin';
    var API_DRAK_KNOWLEDGE = '/api/drak-knowledge';

    // DOM refs
    var loginScreen = document.getElementById('login-screen');
    var dashboard = document.getElementById('dashboard');
    var loginForm = document.getElementById('login-form');
    var passwordInput = document.getElementById('password-input');
    var loginError = document.getElementById('login-error');
    var logoutBtn = document.getElementById('logout-btn');
    var refreshBtn = document.getElementById('refresh-btn');

    var monitoredAccounts = [];

    // ---- Utilities ----

    function getSecret() {
        return sessionStorage.getItem('admin_secret');
    }

    function formatDate(ts) {
        if (!ts) return '—';
        var d = new Date(ts);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        loginError.hidden = true;
        var secret = passwordInput.value.trim();
        if (!secret) return;

        try {
            var res = await fetch(API_TXLOG, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: secret })
            });
            if (res.ok) {
                sessionStorage.setItem('admin_secret', secret);
                passwordInput.value = '';
                showDashboard();
                loadResearchAccounts().then(function () {
                    loadTweetDrafts();
                });
                loadKnowledgeFacts();
                loadMetrics();
            } else {
                loginError.textContent = res.status === 403 ? 'Invalid secret.' : 'Login failed.';
                loginError.hidden = false;
            }
        } catch (err) {
            loginError.textContent = 'Network error.';
            loginError.hidden = false;
        }
    });

    logoutBtn.addEventListener('click', function () {
        sessionStorage.removeItem('admin_secret');
        showLogin();
    });

    // ---- Tweet Admin API ----

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

    // ---- Tweet Editor ----

    function buildEditorHtml(textareaId, displayText, editable) {
        var len = displayText.length;
        var pct = Math.min(100, Math.round((len / 4000) * 100));
        var barColor = len > 4000 ? '#e74c3c' : len > 280 ? '#f1c40f' : '#2ecc40';

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
        html += '<div class="tweet-char-count"><span class="char-count-num" style="color:' + (len > 4000 ? '#e44' : '') + '">' + len + '</span>/4000</div>';
        html += '<div class="tweet-preview"><div class="tweet-preview-label">Preview</div>' +
            '<div class="tweet-preview-content">' +
            '<div class="tweet-preview-header"><strong>@midhorde</strong> <span class="tweet-preview-handle">· just now</span></div>' +
            '<div class="tweet-preview-text">' + formatTweetPreview(displayText) + '</div>' +
            '</div></div>';
        return html;
    }

    function formatTweetPreview(text) {
        var safe = escapeHtml(text);
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    function updateEditorState(card) {
        var textarea = card.querySelector('.tweet-edit-area');
        if (!textarea) return;
        var len = textarea.value.length;
        var pct = Math.min(100, Math.round((len / 4000) * 100));
        var barColor = len > 4000 ? '#e74c3c' : len > 280 ? '#f1c40f' : '#2ecc40';

        var countEl = card.querySelector('.char-count-num');
        if (countEl) {
            countEl.textContent = len;
            countEl.style.color = len > 4000 ? '#e44' : '';
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

    // ---- Tweet Drafts ----

    async function loadTweetDrafts() {
        var listEl = document.getElementById('tweet-drafts-list');
        var emptyEl = document.getElementById('tweet-drafts-empty');
        var historyEl = document.getElementById('tweet-history-list');
        try {
            var data = await fetchTweetAdmin({ mode: 'list' });
            if (!data) return;

            listEl.innerHTML = '';
            var drafts = data.drafts || [];

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

        if (d.quoteTweetId) {
            html += '<div class="tweet-draft-topic">Quote tweet: <a href="https://x.com/' + escapeHtml(d.quotedUsername || 'i') + '/status/' + escapeHtml(d.quoteTweetId) + '" target="_blank" rel="noopener">@' + escapeHtml(d.quotedUsername || '?') + '</a></div>';
        }

        html += '<div class="tweet-editor-wrap">' + buildEditorHtml(textareaId, displayText, editable) + '</div>';

        if (d.suggestedTags && d.suggestedTags.length > 0 && editable) {
            html += '<div class="tweet-suggestions">';
            html += '<span class="tweet-suggestion-label">Tag:</span>';
            d.suggestedTags.forEach(function (tag) {
                html += '<button type="button" class="tweet-tag-pill" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
            });
            html += '</div>';
        }

        if (monitoredAccounts.length > 0 && editable) {
            html += '<div class="tweet-suggestions">';
            html += '<span class="tweet-suggestion-label">Accounts:</span>';
            monitoredAccounts.forEach(function (handle) {
                var tag = '@' + handle;
                html += '<button type="button" class="tweet-tag-pill tweet-tag-account" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
            });
            html += '</div>';
        }

        if (d.imageIdea && editable) {
            html += '<div class="tweet-image-idea">';
            html += '<span class="tweet-suggestion-label">Image idea:</span> ' + escapeHtml(d.imageIdea);
            html += '</div>';
        }

        if (d.generatedImageBase64 && editable) {
            html += '<div class="tweet-generated-image">';
            html += '<span class="generated-image-tag">AI Generated</span>';
            html += '<img class="tweet-generated-image-thumb" src="data:image/png;base64,' + d.generatedImageBase64 + '" title="Click to enlarge">';
            html += '<button type="button" class="tweet-generated-image-remove toolbar-btn">✕ Remove</button>';
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

        // Pre-set AI-generated image for approve flow
        if (d.generatedImageBase64 && editable) {
            card.dataset.imageBase64 = d.generatedImageBase64;
            card.dataset.imageMime = 'image/png';
            card.dataset.aiImageBase64 = d.generatedImageBase64;
        }

        return card;
    }

    // ---- Tweet Event Handlers ----

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
        var text = textarea.value;
        if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
            text += ' ';
        }
        textarea.value = text + tag;
        textarea.focus();
        updateEditorState(card);
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
                card.dataset.imageBase64 = reader.result.split(',')[1];
                card.dataset.imageMime = file.type;
            }
            // Hide AI-generated image when manual upload replaces it
            var aiImageWrap = card.querySelector('.tweet-generated-image');
            if (aiImageWrap) aiImageWrap.hidden = true;
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

    // Enlarge AI-generated image
    document.addEventListener('click', function (e) {
        var thumb = e.target.closest('.tweet-generated-image-thumb');
        if (!thumb) return;
        var overlay = document.createElement('div');
        overlay.className = 'image-lightbox';
        overlay.innerHTML = '<img src="' + thumb.src + '">';
        overlay.addEventListener('click', function () { overlay.remove(); });
        document.body.appendChild(overlay);
    });

    // Remove AI-generated image
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-generated-image-remove');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var aiImageWrap = card.querySelector('.tweet-generated-image');
        if (aiImageWrap) aiImageWrap.hidden = true;
        delete card.dataset.imageBase64;
        delete card.dataset.imageMime;
        delete card.dataset.aiImageBase64;
        var previewImg = card.querySelector('.tweet-preview-image');
        if (previewImg) previewImg.remove();
    });

    // Remove manual image
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.tweet-image-remove');
        if (!btn) return;
        var card = btn.closest('.tweet-draft-card');
        if (!card) return;
        var previewWrap = card.querySelector('.tweet-image-preview');
        if (previewWrap) previewWrap.hidden = true;
        var input = card.querySelector('.tweet-image-input');
        if (input) input.value = '';

        // Restore AI image if available
        if (card.dataset.aiImageBase64) {
            card.dataset.imageBase64 = card.dataset.aiImageBase64;
            card.dataset.imageMime = 'image/png';
            var aiImageWrap = card.querySelector('.tweet-generated-image');
            if (aiImageWrap) aiImageWrap.hidden = false;
        } else {
            delete card.dataset.imageBase64;
            delete card.dataset.imageMime;
        }
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

        if (editedText.length > 4000) {
            alert('Tweet too long (' + editedText.length + '/4000)');
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
    var tweetComposeForm = document.getElementById('tweet-compose-form');
    var tweetTopicInput = document.getElementById('tweet-topic-input');

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
    document.getElementById('tweet-refresh-btn').addEventListener('click', loadTweetDrafts);
    document.getElementById('tweet-history-btn').addEventListener('click', loadTweetDrafts);

    // ---- Tweet Performance Metrics ----

    var metricsRefreshBtn = document.getElementById('metrics-refresh-btn');
    var metricsFetchBtn = document.getElementById('metrics-fetch-btn');

    async function loadMetrics() {
        try {
            var data = await fetchTweetAdmin({ mode: 'metrics' });
            if (!data) return;

            var bodyEl = document.getElementById('metrics-body');
            var emptyEl = document.getElementById('metrics-empty');
            bodyEl.innerHTML = '';

            var metrics = data.metrics || [];
            if (metrics.length === 0) {
                emptyEl.hidden = false;
                return;
            }
            emptyEl.hidden = true;

            metrics.forEach(function (m) {
                var tr = document.createElement('tr');
                var tweetText = (m.text || '').length > 80 ? m.text.slice(0, 80) + '...' : (m.text || '');
                var link = m.tweetId ? '<a href="https://x.com/midhorde/status/' + escapeHtml(m.tweetId) + '" target="_blank" rel="noopener">' + escapeHtml(tweetText) + '</a>' : escapeHtml(tweetText);
                tr.innerHTML =
                    '<td class="metrics-tweet-cell">' + link + '</td>' +
                    '<td>' + (m.likes || 0) + '</td>' +
                    '<td>' + (m.retweets || 0) + '</td>' +
                    '<td>' + (m.replies || 0) + '</td>' +
                    '<td>' + (m.impressions || 0) + '</td>' +
                    '<td><strong>' + (m.engagement || 0) + '</strong></td>' +
                    '<td>' + formatDate(m.postedAt) + '</td>';
                bodyEl.appendChild(tr);
            });
        } catch (err) {
            console.error('Load metrics failed:', err);
        }
    }

    metricsRefreshBtn.addEventListener('click', loadMetrics);

    metricsFetchBtn.addEventListener('click', async function () {
        var statusEl = document.getElementById('metrics-fetch-status');
        statusEl.hidden = true;
        metricsFetchBtn.disabled = true;
        metricsFetchBtn.textContent = 'Fetching...';

        try {
            var data = await fetchTweetAdmin({ mode: 'fetch-metrics' });
            if (!data) return;
            statusEl.textContent = 'Fetched metrics for ' + (data.fetched || 0) + ' tweets.';
            statusEl.hidden = false;
            loadMetrics();
        } catch (err) {
            statusEl.textContent = 'Error: ' + err.message;
            statusEl.style.color = '#e44';
            statusEl.hidden = false;
        } finally {
            metricsFetchBtn.disabled = false;
            metricsFetchBtn.textContent = 'Fetch Latest Metrics';
        }
    });

    // ---- Suggested Engagement ----

    var engagementFindBtn = document.getElementById('engagement-find-btn');

    async function loadEngagementSuggestions() {
        var listEl = document.getElementById('engagement-list');
        var emptyEl = document.getElementById('engagement-empty');
        var statusEl = document.getElementById('engagement-status');
        statusEl.hidden = true;

        engagementFindBtn.disabled = true;
        engagementFindBtn.textContent = 'Searching...';

        try {
            var data = await fetchTweetAdmin({ mode: 'suggest-retweets' });
            if (!data) return;

            listEl.innerHTML = '';
            var suggestions = data.suggestions || [];
            var pending = suggestions.filter(function (s) { return s.status === 'pending'; });
            var actioned = suggestions.filter(function (s) { return s.status !== 'pending'; });

            if (pending.length === 0 && actioned.length === 0) {
                emptyEl.hidden = false;
                return;
            }
            emptyEl.hidden = true;

            if (data.cached) {
                statusEl.textContent = 'Showing cached results';
                statusEl.hidden = false;
            }

            pending.forEach(function (s) { listEl.appendChild(buildEngagementCard(s)); });
            actioned.forEach(function (s) { listEl.appendChild(buildEngagementCard(s)); });
        } catch (err) {
            statusEl.textContent = 'Error: ' + err.message;
            statusEl.style.color = '#e44';
            statusEl.hidden = false;
        } finally {
            engagementFindBtn.disabled = false;
            engagementFindBtn.textContent = 'Find Posts';
        }
    }

    function buildEngagementCard(s) {
        var card = document.createElement('div');
        card.className = 'engagement-card';
        card.dataset.tweetId = s.tweetId;
        card.dataset.suggestionId = s.id;

        if (s.status !== 'pending') card.classList.add('actioned');

        var html = '<div class="engagement-author">' +
            '<a href="https://x.com/' + escapeHtml(s.username) + '/status/' + escapeHtml(s.tweetId) + '" target="_blank" rel="noopener">@' + escapeHtml(s.username) + '</a>';
        if (s.status !== 'pending') {
            html += ' <span class="engagement-status-badge ' + escapeHtml(s.status) + '">' + escapeHtml(s.status) + '</span>';
        }
        html += '</div>';

        html += '<div class="engagement-text">' + escapeHtml(s.text) + '</div>';

        if (s.metrics) {
            html += '<div class="engagement-metrics">';
            if (s.metrics.like_count != null) html += '<span class="engagement-metric">' + s.metrics.like_count + ' likes</span>';
            if (s.metrics.retweet_count != null) html += '<span class="engagement-metric">' + s.metrics.retweet_count + ' RTs</span>';
            if (s.metrics.reply_count != null) html += '<span class="engagement-metric">' + s.metrics.reply_count + ' replies</span>';
            if (s.metrics.impression_count != null) html += '<span class="engagement-metric">' + s.metrics.impression_count + ' views</span>';
            html += '</div>';
        }

        if (s.status === 'pending') {
            html += '<div class="engagement-card-actions">' +
                '<button class="eng-retweet-btn">Retweet</button>' +
                '<button class="eng-like-btn">Like</button>' +
                '<button class="eng-quote-btn">Quote Tweet</button>' +
                '<button class="eng-dismiss-btn btn-small" style="background:var(--color-bg);border:1px solid var(--border);color:var(--color-text-dim);">Dismiss</button>' +
                '</div>';
        }

        card.innerHTML = html;
        return card;
    }

    // Engagement action handlers
    document.getElementById('engagement-list').addEventListener('click', async function (e) {
        var card = e.target.closest('.engagement-card');
        if (!card) return;
        var tid = card.dataset.tweetId;
        var sid = card.dataset.suggestionId;

        if (e.target.closest('.eng-retweet-btn')) {
            if (!confirm('Retweet this post as @midhorde?')) return;
            var btn = e.target.closest('.eng-retweet-btn');
            btn.disabled = true;
            btn.textContent = 'Retweeting...';
            try {
                await fetchTweetAdmin({ mode: 'retweet', tweetId: tid });
                card.classList.add('actioned');
                card.querySelector('.engagement-card-actions').innerHTML = '<span class="engagement-status-badge retweeted">retweeted</span>';
            } catch (err) {
                alert('Error: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Retweet';
            }
            return;
        }

        if (e.target.closest('.eng-like-btn')) {
            var btn2 = e.target.closest('.eng-like-btn');
            btn2.disabled = true;
            btn2.textContent = 'Liking...';
            try {
                await fetchTweetAdmin({ mode: 'like', tweetId: tid });
                card.classList.add('actioned');
                card.querySelector('.engagement-card-actions').innerHTML = '<span class="engagement-status-badge liked">liked</span>';
            } catch (err) {
                alert('Error: ' + err.message);
                btn2.disabled = false;
                btn2.textContent = 'Like';
            }
            return;
        }

        if (e.target.closest('.eng-quote-btn')) {
            var btn3 = e.target.closest('.eng-quote-btn');
            btn3.disabled = true;
            btn3.textContent = 'Creating draft...';
            try {
                await fetchTweetAdmin({ mode: 'quote-tweet', tweetId: tid });
                card.classList.add('actioned');
                card.querySelector('.engagement-card-actions').innerHTML = '<span class="engagement-status-badge quoted">quoted</span>';
                loadTweetDrafts();
            } catch (err) {
                alert('Error: ' + err.message);
                btn3.disabled = false;
                btn3.textContent = 'Quote Tweet';
            }
            return;
        }

        if (e.target.closest('.eng-dismiss-btn')) {
            try {
                await fetchTweetAdmin({ mode: 'dismiss-suggestion', suggestionId: sid });
                card.remove();
                var listEl = document.getElementById('engagement-list');
                if (listEl.children.length === 0) {
                    document.getElementById('engagement-empty').hidden = false;
                }
            } catch (err) {
                alert('Error: ' + err.message);
            }
            return;
        }
    });

    engagementFindBtn.addEventListener('click', loadEngagementSuggestions);

    // ---- Drak Knowledge Base ----

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
                card.className = 'knowledge-fact-card collapsed';
                card.dataset.factId = f.id;
                var imageHtml = '';
                if (f.imageBase64) {
                    imageHtml = '<div class="knowledge-fact-image"><img src="data:image/png;base64,' + f.imageBase64 + '" alt="Fact image"></div>';
                }
                var preview = f.text.length > 60 ? f.text.slice(0, 60) + '...' : f.text;
                card.innerHTML =
                    '<div class="knowledge-fact-header">' +
                        '<span class="knowledge-fact-category cat-' + escapeHtml(f.category || 'general') + '">' + escapeHtml(f.category || 'general') + '</span>' +
                        '<span class="knowledge-fact-preview">' + escapeHtml(preview) + '</span>' +
                        '<span class="knowledge-fact-date">' + formatDate(f.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="knowledge-fact-body">' +
                        imageHtml +
                        '<div class="knowledge-fact-text">' + escapeHtml(f.text) + '</div>' +
                        '<div class="knowledge-fact-actions">' +
                            '<button class="knowledge-edit-btn btn-small" data-fact-id="' + escapeHtml(f.id) + '">Edit</button>' +
                            (f.imageBase64 ? '<button class="knowledge-remove-image-btn btn-small" data-fact-id="' + escapeHtml(f.id) + '">Remove Image</button>' : '') +
                            '<button class="knowledge-delete-btn btn-small btn-danger" data-fact-id="' + escapeHtml(f.id) + '">Delete</button>' +
                        '</div>' +
                    '</div>';
                listEl.appendChild(card);
            });
        } catch (err) {
            console.error('Load knowledge failed:', err);
        }
    }

    // Toggle fact card expand/collapse
    document.addEventListener('click', function (e) {
        var header = e.target.closest('.knowledge-fact-header');
        if (!header) return;
        if (e.target.closest('button')) return;
        var card = header.closest('.knowledge-fact-card');
        if (!card) return;
        card.classList.toggle('collapsed');
    });

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
    var knowledgeAddForm = document.getElementById('knowledge-add-form');
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

    // Edit fact
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.knowledge-edit-btn');
        if (!btn) return;
        var card = btn.closest('.knowledge-fact-card');
        if (!card) return;
        var factId = btn.dataset.factId;

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

    document.getElementById('knowledge-refresh-btn').addEventListener('click', loadKnowledgeFacts);

    // ---- Monitored X Accounts ----

    var researchAccountsInput = document.getElementById('research-accounts-input');
    var researchAccountsSave = document.getElementById('research-accounts-save');

    async function loadResearchAccounts() {
        try {
            var data = await fetchDrakKnowledge({ mode: 'list-accounts' });
            if (!data) return;
            var accounts = data.accounts || [];
            monitoredAccounts = accounts;
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
            monitoredAccounts = data.accounts;
            successEl.textContent = 'Saved ' + data.accounts.length + ' accounts.';
            successEl.hidden = false;
            researchAccountsInput.value = data.accounts.join('\n');
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    // ---- Collapsible Cards ----

    var DEFAULT_COLLAPSED = ['metrics-section', 'engagement-section', 'knowledge-section'];

    function initCollapsibleCards() {
        var cards = document.querySelectorAll('.card[id]');
        cards.forEach(function (card) {
            var saved = sessionStorage.getItem('card_' + card.id);
            if (saved === 'collapsed' || (saved === null && DEFAULT_COLLAPSED.indexOf(card.id) !== -1)) {
                card.classList.add('collapsed');
            }
            var h2 = card.querySelector('h2');
            if (!h2) return;
            h2.addEventListener('click', function () {
                card.classList.toggle('collapsed');
                sessionStorage.setItem('card_' + card.id, card.classList.contains('collapsed') ? 'collapsed' : 'open');
            });
        });
    }

    initCollapsibleCards();

    // ---- Refresh All ----

    refreshBtn.addEventListener('click', function () {
        loadTweetDrafts();
        loadMetrics();
        loadKnowledgeFacts();
    });

    // ---- Init ----

    if (getSecret()) {
        showDashboard();
        loadResearchAccounts().then(function () {
            loadTweetDrafts();
        });
        loadKnowledgeFacts();
        loadMetrics();
    } else {
        showLogin();
    }
})();
