// DAO Voting - Client-side Logic

var connectedWallet = null;
var orcCount = 0;
var orcMints = [];
var allProposals = [];
var currentFilter = 'all';
var countdownIntervals = [];

// ========== Page Detection ==========

function getPageType() {
    var path = window.location.pathname;
    if (path.includes('create.html')) return 'create';
    if (path.includes('proposal.html')) return 'proposal';
    return 'list';
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', function() {
    var connectBtn = document.getElementById('connectWalletBtn');
    var disconnectBtn = document.getElementById('disconnectWalletBtn');

    if (connectBtn) connectBtn.addEventListener('click', connectWallet);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);

    // Rules toggle
    var rulesToggle = document.getElementById('daoRulesToggle');
    var rulesContent = document.getElementById('daoRulesContent');
    if (rulesToggle && rulesContent) {
        rulesToggle.addEventListener('click', function() {
            var isOpen = rulesContent.style.display !== 'none';
            rulesContent.style.display = isOpen ? 'none' : 'block';
            rulesToggle.querySelector('.toggle-icon').textContent = isOpen ? '+' : '-';
            if (!isOpen) {
                rulesToggle.style.borderRadius = '8px 8px 0 0';
            } else {
                rulesToggle.style.borderRadius = '8px';
            }
        });
    }

    var page = getPageType();

    if (page === 'list') {
        initListPage();
    } else if (page === 'create') {
        initCreatePage();
    } else if (page === 'proposal') {
        initProposalPage();
    }

    checkWalletConnection();
});

// ========== Wallet Callbacks ==========

function onWalletConnected() {
    var votingPower = document.getElementById('votingPower');
    if (votingPower) {
        votingPower.textContent = 'Loading Orcs...';
        votingPower.style.display = 'inline-block';
    }

    // Fetch Orc holdings via proposals endpoint (piggyback) or directly
    fetchOrcCount();
}

function onWalletDisconnected() {
    orcCount = 0;
    orcMints = [];
    var page = getPageType();
    if (page === 'create') {
        var formSection = document.getElementById('createFormSection');
        var needOrcs = document.getElementById('needOrcsMsg');
        if (formSection) formSection.style.display = 'none';
        if (needOrcs) needOrcs.style.display = 'block';
        needOrcs.textContent = 'Connect your wallet to create a proposal.';
    }
    if (page === 'proposal') {
        renderProposalVoteButtons();
    }
}

async function fetchOrcCount() {
    // We'll use a simple check by trying to vote — but actually let's just
    // call the proposals endpoint and check server-side when needed.
    // For UX, we show a "checking..." then fetch from Helius client-side.
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

        orcMints = [];
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
                orcMints.push(item.id);
            }
        }
        orcCount = orcMints.length;
    } catch (err) {
        console.error('Error fetching Orc count:', err);
        // Fallback: we'll rely on server-side check
        orcCount = -1; // Unknown
    }

    var votingPower = document.getElementById('votingPower');
    if (votingPower) {
        if (orcCount > 0) {
            votingPower.textContent = orcCount + ' Orc' + (orcCount !== 1 ? 's' : '') + ' = ' + orcCount + ' vote' + (orcCount !== 1 ? 's' : '');
            votingPower.style.display = 'inline-block';
        } else if (orcCount === 0) {
            votingPower.textContent = 'No Orcs found';
            votingPower.style.display = 'inline-block';
        } else {
            votingPower.style.display = 'none';
        }
    }

    var page = getPageType();
    if (page === 'create') {
        var formSection = document.getElementById('createFormSection');
        var needOrcs = document.getElementById('needOrcsMsg');
        if (orcCount >= 3) {
            if (formSection) formSection.style.display = 'block';
            if (needOrcs) needOrcs.style.display = 'none';
        } else if (orcCount >= 0) {
            if (formSection) formSection.style.display = 'none';
            if (needOrcs) {
                needOrcs.style.display = 'block';
                needOrcs.textContent = 'You need at least 3 Orcs to create a proposal. You currently hold ' + orcCount + '.';
            }
        }
    }

    if (page === 'proposal') {
        renderProposalVoteButtons();
    }
}

// ========== Helpers ==========

function showError(msg) {
    var el = document.getElementById('errorMsg');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 8000);
    }
}

function showSuccess(msg) {
    var el = document.getElementById('successMsg');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 8000);
    }
}

function shortWallet(addr) {
    if (!addr) return '';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatTimeLeft(endsAt) {
    var diff = endsAt - Date.now();
    if (diff <= 0) return 'Ended';

    var hours = Math.floor(diff / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
        var days = Math.floor(hours / 24);
        var remainHours = hours % 24;
        return days + 'd ' + remainHours + 'h left';
    }
    if (hours > 0) return hours + 'h ' + minutes + 'm left';
    return minutes + 'm left';
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========== List Page ==========

function initListPage() {
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            currentFilter = tab.getAttribute('data-filter');
            renderProposals();
        });
    });

    loadProposals();
}

async function loadProposals() {
    var loadingEl = document.getElementById('loadingMsg');
    var listEl = document.getElementById('proposalsList');

    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';

    try {
        var response = await fetch('/api/dao/proposals');
        var data = await response.json();

        if (data.error) {
            showError(data.error);
            if (listEl) listEl.innerHTML = '<div class="empty-state">Failed to load proposals</div>';
            return;
        }

        allProposals = data.proposals || [];

        // Update stats
        var statActive = document.getElementById('statActive');
        var statClosed = document.getElementById('statClosed');
        if (statActive) statActive.textContent = data.activeCount || 0;
        if (statClosed) statClosed.textContent = data.closedCount || 0;

        renderProposals();
    } catch (err) {
        console.error('Error loading proposals:', err);
        showError('Failed to load proposals');
        if (listEl) listEl.innerHTML = '<div class="empty-state">Failed to load proposals</div>';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function renderProposals() {
    var listEl = document.getElementById('proposalsList');
    if (!listEl) return;

    // Clear existing countdowns
    countdownIntervals.forEach(function(id) { clearInterval(id); });
    countdownIntervals = [];

    var filtered = allProposals;
    if (currentFilter === 'active') {
        filtered = allProposals.filter(function(p) { return p.status === 'active'; });
    } else if (currentFilter === 'closed') {
        filtered = allProposals.filter(function(p) { return p.status === 'closed'; });
    }

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No proposals found</div>';
        return;
    }

    listEl.innerHTML = '';

    filtered.forEach(function(p) {
        var card = document.createElement('div');
        card.className = 'proposal-card';
        card.addEventListener('click', function() {
            window.location.href = '/dao/proposal.html?id=' + p.id;
        });

        var totalVotes = p.forVotes + p.againstVotes;
        var forPct = totalVotes > 0 ? ((p.forVotes / totalVotes) * 100).toFixed(1) : 0;
        var againstPct = totalVotes > 0 ? ((p.againstVotes / totalVotes) * 100).toFixed(1) : 0;

        var statusClass = p.status === 'active' ? 'active' : (p.result || 'expired');
        var statusText = p.status === 'active' ? 'Active' : (p.result ? p.result.charAt(0).toUpperCase() + p.result.slice(1) : 'Closed');

        var countdownId = 'countdown-' + p.id;

        card.innerHTML =
            '<div class="proposal-card-header">' +
                '<span class="proposal-title">' + escapeHtml(p.title) + '</span>' +
                '<span class="proposal-status ' + statusClass + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="vote-bar-mini">' +
                '<div class="vote-bar-for" style="width:' + forPct + '%"></div>' +
                '<div class="vote-bar-against" style="width:' + againstPct + '%"></div>' +
            '</div>' +
            '<div class="proposal-card-meta">' +
                '<div class="proposal-votes-summary">' +
                    '<span class="votes-for">For: ' + p.forVotes + '</span>' +
                    '<span class="votes-against">Against: ' + p.againstVotes + '</span>' +
                    '<span>Voters: ' + p.totalVoters + '</span>' +
                    '<span>Quorum: ' + totalVotes + '/' + p.quorum + '</span>' +
                '</div>' +
                '<span class="proposal-countdown" id="' + countdownId + '">' +
                    (p.status === 'active' ? formatTimeLeft(p.endsAt) : formatDate(p.closedAt || p.endsAt)) +
                '</span>' +
            '</div>';

        listEl.appendChild(card);

        // Live countdown for active proposals
        if (p.status === 'active') {
            var intervalId = setInterval(function() {
                var el = document.getElementById(countdownId);
                if (el) {
                    var text = formatTimeLeft(p.endsAt);
                    el.textContent = text;
                    if (text === 'Ended') {
                        clearInterval(intervalId);
                        loadProposals(); // Refresh to trigger check-on-read
                    }
                } else {
                    clearInterval(intervalId);
                }
            }, 30000);
            countdownIntervals.push(intervalId);
        }
    });
}

// ========== Proposal Detail Page ==========

var currentProposal = null;

function initProposalPage() {
    var params = new URLSearchParams(window.location.search);
    var proposalId = params.get('id');
    if (proposalId) {
        loadProposal(proposalId);
    } else {
        showError('No proposal ID specified');
    }

    var copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function() {
            navigator.clipboard.writeText(window.location.href).then(function() {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(function() {
                    copyBtn.textContent = 'Copy Link';
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        });
    }
}

async function loadProposal(proposalId) {
    var loadingEl = document.getElementById('loadingMsg');
    var detailEl = document.getElementById('proposalDetail');

    if (loadingEl) loadingEl.style.display = 'block';

    try {
        var response = await fetch('/api/dao/proposal?id=' + encodeURIComponent(proposalId));
        var data = await response.json();

        if (data.error) {
            showError(data.error);
            return;
        }

        currentProposal = data.proposal;
        renderProposalDetail();
    } catch (err) {
        console.error('Error loading proposal:', err);
        showError('Failed to load proposal');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function renderProposalDetail() {
    var detailEl = document.getElementById('proposalDetail');
    if (!detailEl || !currentProposal) return;

    var p = currentProposal;
    var totalVotes = p.forVotes + p.againstVotes;
    var forPct = totalVotes > 0 ? ((p.forVotes / totalVotes) * 100).toFixed(1) : 0;
    var againstPct = totalVotes > 0 ? ((p.againstVotes / totalVotes) * 100).toFixed(1) : 0;
    var statusClass = p.status === 'active' ? 'active' : (p.result || 'expired');
    var statusText = p.status === 'active' ? 'Active' : (p.result ? p.result.charAt(0).toUpperCase() + p.result.slice(1) : 'Closed');

    var html =
        '<div class="proposal-detail">' +
            '<div class="proposal-detail-header">' +
                '<h2 class="proposal-detail-title">' + escapeHtml(p.title) + '</h2>' +
                '<div class="proposal-detail-meta">' +
                    '<span class="proposal-status ' + statusClass + '">' + statusText + '</span>' +
                    '<span>By ' + shortWallet(p.creator) + '</span>' +
                    '<span>Created ' + formatDate(p.createdAt) + '</span>' +
                    '<span id="proposalCountdown">' + (p.status === 'active' ? formatTimeLeft(p.endsAt) : 'Ended ' + formatDate(p.closedAt || p.endsAt)) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="proposal-detail-description">' + escapeHtml(p.description) + '</div>' +
        '</div>' +
        '<div class="vote-section">' +
            '<h3>Results</h3>' +
            '<div class="vote-tally">' +
                '<span class="vote-tally-for">For: ' + p.forVotes + ' (' + forPct + '%)</span>' +
                '<span class="vote-tally-against">Against: ' + p.againstVotes + ' (' + againstPct + '%)</span>' +
            '</div>' +
            '<div class="vote-bar-large">' +
                '<div class="vote-bar-for" style="width:' + forPct + '%">' + (forPct > 10 ? forPct + '%' : '') + '</div>' +
                '<div class="vote-bar-against" style="width:' + againstPct + '%">' + (againstPct > 10 ? againstPct + '%' : '') + '</div>' +
            '</div>' +
            '<div class="vote-info">' +
                '<span>Total voters: ' + p.totalVoters + '</span>' +
                '<span>Quorum: ' + totalVotes + ' / ' + p.quorum + (totalVotes >= p.quorum ? ' (reached)' : '') + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="vote-actions" id="voteActions"></div>';

    // Voter list
    if (p.votes && p.votes.length > 0) {
        html += '<div class="voters-section"><h3>Votes (' + p.votes.length + ')</h3><div class="voter-list">';
        p.votes.forEach(function(v) {
            html += '<div class="voter-row">' +
                '<span class="voter-wallet">' + shortWallet(v.wallet) + '</span>' +
                '<span class="voter-choice ' + v.choice + '">' + (v.choice === 'for' ? 'For' : 'Against') + '</span>' +
                '<span class="voter-weight">' + v.weight + ' vote' + (v.weight !== 1 ? 's' : '') + '</span>' +
            '</div>';
        });
        html += '</div></div>';
    }

    detailEl.innerHTML = html;

    // Render vote buttons
    renderProposalVoteButtons();

    // Live countdown
    if (p.status === 'active') {
        var countdownInterval = setInterval(function() {
            var el = document.getElementById('proposalCountdown');
            if (el && currentProposal) {
                var text = formatTimeLeft(currentProposal.endsAt);
                el.textContent = text;
                if (text === 'Ended') {
                    clearInterval(countdownInterval);
                    loadProposal(currentProposal.id);
                }
            } else {
                clearInterval(countdownInterval);
            }
        }, 30000);
    }
}

function renderProposalVoteButtons() {
    var actionsEl = document.getElementById('voteActions');
    if (!actionsEl || !currentProposal) return;

    var p = currentProposal;

    if (p.status !== 'active') {
        actionsEl.innerHTML = '';
        return;
    }

    if (!connectedWallet) {
        actionsEl.innerHTML = '<p style="color:var(--text-dim);font-style:italic;">Connect your wallet to vote</p>';
        return;
    }

    // Check if user already voted
    var existingVote = null;
    if (p.votes) {
        for (var i = 0; i < p.votes.length; i++) {
            if (p.votes[i].wallet === connectedWallet) {
                existingVote = p.votes[i];
                break;
            }
        }
    }

    if (existingVote) {
        var forClass = existingVote.choice === 'for' ? 'vote-btn vote-btn-for voted' : 'vote-btn vote-btn-for';
        var againstClass = existingVote.choice === 'against' ? 'vote-btn vote-btn-against voted' : 'vote-btn vote-btn-against';
        actionsEl.innerHTML =
            '<button class="' + forClass + '" disabled>For</button>' +
            '<button class="' + againstClass + '" disabled>Against</button>';
        return;
    }

    if (orcCount === 0) {
        actionsEl.innerHTML = '<p style="color:var(--text-dim);font-style:italic;">You need at least 1 Orc to vote</p>';
        return;
    }

    actionsEl.innerHTML =
        '<button class="vote-btn vote-btn-for" id="voteForBtn">Vote For</button>' +
        '<button class="vote-btn vote-btn-against" id="voteAgainstBtn">Vote Against</button>';

    document.getElementById('voteForBtn').addEventListener('click', function() { castVote('for'); });
    document.getElementById('voteAgainstBtn').addEventListener('click', function() { castVote('against'); });
}

async function castVote(choice) {
    if (!connectedWallet || !currentProposal) return;

    var forBtn = document.getElementById('voteForBtn');
    var againstBtn = document.getElementById('voteAgainstBtn');
    if (forBtn) forBtn.disabled = true;
    if (againstBtn) againstBtn.disabled = true;

    try {
        var timestamp = Date.now();
        var message = 'The Horde DAO: Vote ' + choice + ' on ' + currentProposal.id + ' at ' + timestamp;
        var signature = await signMessageForAuth(message);

        var response = await fetch('/api/dao/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: connectedWallet,
                signature: signature,
                message: message,
                proposalId: currentProposal.id,
                choice: choice
            })
        });

        var data = await response.json();

        if (data.error) {
            showError(data.error);
            if (forBtn) forBtn.disabled = false;
            if (againstBtn) againstBtn.disabled = false;
            return;
        }

        showSuccess('Vote cast! ' + data.vote.weight + ' vote' + (data.vote.weight !== 1 ? 's' : '') + ' recorded.');

        // Reload proposal to show updated state
        loadProposal(currentProposal.id);
    } catch (err) {
        console.error('Vote error:', err);
        showError('Failed to cast vote: ' + err.message);
        if (forBtn) forBtn.disabled = false;
        if (againstBtn) againstBtn.disabled = false;
    }
}

// ========== Create Proposal Page ==========

function initCreatePage() {
    var titleInput = document.getElementById('proposalTitle');
    var descInput = document.getElementById('proposalDescription');
    var form = document.getElementById('createForm');
    var submitBtn = document.getElementById('submitBtn');

    if (titleInput) {
        titleInput.addEventListener('input', function() {
            var count = titleInput.value.length;
            var countEl = document.getElementById('titleCharCount');
            if (countEl) {
                countEl.textContent = count + ' / 100';
                countEl.className = count > 100 ? 'char-count over' : 'char-count';
            }
            updatePreview();
            validateCreateForm();
        });
    }

    if (descInput) {
        descInput.addEventListener('input', function() {
            var count = descInput.value.length;
            var countEl = document.getElementById('descCharCount');
            if (countEl) {
                countEl.textContent = count + ' / 2000';
                countEl.className = count > 2000 ? 'char-count over' : 'char-count';
            }
            updatePreview();
            validateCreateForm();
        });
    }

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            submitProposal();
        });
    }
}

function validateCreateForm() {
    var titleInput = document.getElementById('proposalTitle');
    var descInput = document.getElementById('proposalDescription');
    var submitBtn = document.getElementById('submitBtn');

    if (!titleInput || !descInput || !submitBtn) return;

    var titleValid = titleInput.value.trim().length > 0 && titleInput.value.length <= 100;
    var descValid = descInput.value.trim().length > 0 && descInput.value.length <= 2000;

    submitBtn.disabled = !(titleValid && descValid && connectedWallet);
}

function updatePreview() {
    var titleInput = document.getElementById('proposalTitle');
    var descInput = document.getElementById('proposalDescription');
    var previewSection = document.getElementById('previewSection');
    var previewContent = document.getElementById('previewContent');

    if (!titleInput || !descInput || !previewSection || !previewContent) return;

    var title = titleInput.value.trim();
    var desc = descInput.value.trim();

    if (title || desc) {
        previewSection.style.display = 'block';
        previewContent.innerHTML =
            '<h2 class="proposal-detail-title" style="font-size:1.2rem;margin-bottom:8px;">' + escapeHtml(title || 'Untitled') + '</h2>' +
            '<div class="proposal-detail-description" style="margin-bottom:0;">' + escapeHtml(desc || 'No description') + '</div>';
    } else {
        previewSection.style.display = 'none';
    }
}

async function submitProposal() {
    if (!connectedWallet) {
        showError('Please connect your wallet first');
        return;
    }

    var titleInput = document.getElementById('proposalTitle');
    var descInput = document.getElementById('proposalDescription');
    var durationSelect = document.getElementById('proposalDuration');
    var quorumInput = document.getElementById('proposalQuorum');
    var submitBtn = document.getElementById('submitBtn');

    if (!titleInput || !descInput) return;

    var title = titleInput.value.trim();
    var description = descInput.value.trim();
    var durationHours = parseInt(durationSelect.value, 10);
    var quorum = parseInt(quorumInput.value, 10);

    if (!title || !description) {
        showError('Title and description are required');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
        var timestamp = Date.now();
        var message = 'The Horde DAO: Create proposal at ' + timestamp;
        var signature = await signMessageForAuth(message);

        var response = await fetch('/api/dao/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: connectedWallet,
                signature: signature,
                message: message,
                title: title,
                description: description,
                durationHours: durationHours,
                quorum: quorum
            })
        });

        var data = await response.json();

        if (data.error) {
            showError(data.error);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Proposal';
            return;
        }

        showSuccess('Proposal created successfully!');

        // Redirect to proposal detail after short delay
        setTimeout(function() {
            window.location.href = '/dao/proposal.html?id=' + data.proposalId;
        }, 1500);
    } catch (err) {
        console.error('Create proposal error:', err);
        showError('Failed to create proposal: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Proposal';
    }
}
