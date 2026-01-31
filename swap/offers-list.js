// MidEvils NFT Swap - Offers List Page

function getSeenOfferIds() {
    try {
        return JSON.parse(localStorage.getItem('seenOfferIds') || '[]');
    } catch { return []; }
}

function markOffersSeen(offerIds) {
    const seen = new Set(getSeenOfferIds());
    offerIds.forEach(id => seen.add(id));
    localStorage.setItem('seenOfferIds', JSON.stringify([...seen]));
}

function countUnseenOffers(receivedOffers) {
    const seen = new Set(getSeenOfferIds());
    return receivedOffers.filter(o => !seen.has(o.id)).length;
}

async function loadOffers() {
    if (!connectedWallet) {
        if (elements.offersSection) {
            elements.offersSection.style.display = 'none';
        }
        return;
    }

    showLoading('Loading your offers...');

    try {
        const response = await fetch(`/api/swap/offers?wallet=${connectedWallet}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const pendingReceived = data.offers.filter(o =>
            o.receiver.wallet === connectedWallet && o.status === 'pending'
        );
        const pendingSent = data.offers.filter(o =>
            o.initiator.wallet === connectedWallet && o.status === 'pending'
        );

        const history = data.offers.filter(o =>
            ['accepted', 'completed', 'escrowed', 'failed', 'cancelled', 'expired'].includes(o.status)
        );

        allOffers = {
            received: pendingReceived,
            sent: pendingSent,
            history: history
        };

        hideLoading();

        if (elements.offersSection) {
            elements.offersSection.style.display = 'block';
        }

        displayOffers();

    } catch (err) {
        console.error('Error loading offers:', err);
        showError('Failed to load offers: ' + err.message);
    }
}

function displayOffers() {
    clearCountdowns();

    const unseenCount = countUnseenOffers(allOffers.received);

    if (elements.receivedCount) {
        elements.receivedCount.textContent = allOffers.received.length;
        if (unseenCount > 0) {
            elements.receivedCount.textContent = `${allOffers.received.length} (${unseenCount} new)`;
            elements.receivedCount.classList.add('has-new');
        } else {
            elements.receivedCount.classList.remove('has-new');
        }
    }
    if (elements.sentCount) {
        elements.sentCount.textContent = allOffers.sent.length;
    }

    if (elements.receivedOffersList) {
        if (allOffers.received.length === 0) {
            elements.receivedOffersList.innerHTML = '<div class="empty-state">No offers received yet</div>';
        } else {
            const seen = new Set(getSeenOfferIds());
            elements.receivedOffersList.innerHTML = '';
            allOffers.received.forEach(offer => {
                const card = createOfferCard(offer, 'received');
                if (!seen.has(offer.id)) {
                    card.classList.add('unseen-offer');
                }
                elements.receivedOffersList.appendChild(card);
            });
        }
    }

    // Mark all received offers as seen now that user has viewed the list
    markOffersSeen(allOffers.received.map(o => o.id));

    if (elements.sentOffersList) {
        if (allOffers.sent.length === 0) {
            elements.sentOffersList.innerHTML = '<div class="empty-state">You haven\'t made any offers yet</div>';
        } else {
            elements.sentOffersList.innerHTML = '';
            allOffers.sent.forEach(offer => {
                elements.sentOffersList.appendChild(createOfferCard(offer, 'sent'));
            });
        }
    }

    if (elements.historyCount) {
        elements.historyCount.textContent = allOffers.history?.length || 0;
    }

    if (elements.historyOffersList) {
        if (!allOffers.history || allOffers.history.length === 0) {
            elements.historyOffersList.innerHTML = '<div class="empty-state">No completed or cancelled swaps yet</div>';
        } else {
            elements.historyOffersList.innerHTML = '';
            allOffers.history.forEach(offer => {
                const type = offer.initiator.wallet === connectedWallet ? 'sent' : 'received';
                elements.historyOffersList.appendChild(createHistoryCard(offer, type));
            });
        }
    }
}

function createOfferCard(offer, type) {
    const card = document.createElement('div');
    card.className = 'offer-card';
    card.dataset.offerId = offer.id;

    const shortId = offer.id.slice(0, 8) + '...';
    const statusClass = offer.status.toLowerCase();
    const createdDate = new Date(offer.createdAt).toLocaleDateString();

    let expiryHtml = '';
    if (offer.status === 'pending' && offer.expiresAt) {
        const countdown = formatCountdown(offer.expiresAt);
        const urgentClass = countdown.urgent ? 'urgent' : '';
        const expiredClass = countdown.expired ? 'expired' : '';
        expiryHtml = `<span class="offer-countdown ${urgentClass} ${expiredClass}" data-expires="${offer.expiresAt}">
            ${countdown.expired ? 'Expired' : `Expires in ${countdown.text}`}
        </span>`;
    }

    const givingNfts = type === 'received' ? offer.receiver.nftDetails : offer.initiator.nftDetails;
    const gettingNfts = type === 'received' ? offer.initiator.nftDetails : offer.receiver.nftDetails;
    const givingSol = type === 'received' ? offer.receiver.sol : offer.initiator.sol;
    const gettingSol = type === 'received' ? offer.initiator.sol : offer.receiver.sol;

    const givingImagesHtml = (givingNfts || []).slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy">`
    ).join('');

    const gettingImagesHtml = (gettingNfts || []).slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy">`
    ).join('');

    const givingText = buildOfferText(givingNfts?.length || 0, givingSol || 0);
    const gettingText = buildOfferText(gettingNfts?.length || 0, gettingSol || 0);

    card.innerHTML = `
        <div class="offer-card-header">
            <span class="offer-id">ID: ${shortId}</span>
            <div class="offer-header-right">
                ${expiryHtml}
                <span class="status-badge ${statusClass}">${offer.status}</span>
            </div>
        </div>
        <div class="offer-card-body">
            <div class="offer-preview-side">
                <div class="offer-preview-images">${givingImagesHtml || '<span>-</span>'}</div>
                <div class="offer-preview-text"><strong>Give:</strong> ${givingText}</div>
            </div>
            <span class="offer-preview-arrow">&#10132;</span>
            <div class="offer-preview-side">
                <div class="offer-preview-images">${gettingImagesHtml || '<span>-</span>'}</div>
                <div class="offer-preview-text"><strong>Get:</strong> ${gettingText}</div>
            </div>
        </div>
        <div class="offer-card-footer">
            <span class="offer-meta">Created: ${createdDate}</span>
            <div class="offer-card-actions">
                <a href="/swap/offer.html?id=${offer.id}" class="view-offer-btn">View</a>
                ${offer.status === 'pending' && type === 'sent' ?
                    `<button class="cancel-offer-btn" data-offer-id="${escapeHtml(offer.id)}">Cancel</button>` : ''}
            </div>
        </div>
    `;

    const cancelBtn = card.querySelector('.cancel-offer-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            cancelOffer(cancelBtn.dataset.offerId, event);
        });
    }

    if (offer.status === 'pending' && offer.expiresAt) {
        const countdownEl = card.querySelector('.offer-countdown');
        if (countdownEl) {
            startCountdown(countdownEl, offer.expiresAt);
        }
    }

    return card;
}

function buildOfferText(nftCount, solAmount) {
    const parts = [];
    if (nftCount > 0) {
        parts.push(`${nftCount} NFT${nftCount > 1 ? 's' : ''}`);
    }
    if (solAmount > 0) {
        parts.push(`${solAmount} SOL`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'Nothing';
}

function createHistoryCard(offer, type) {
    const card = document.createElement('div');
    card.className = 'offer-card history-card';
    card.dataset.offerId = offer.id;

    const shortId = offer.id.slice(0, 8) + '...';
    const statusClass = offer.status.toLowerCase();

    let finalizedDate = '';
    if (offer.status === 'completed' && offer.completedAt) {
        finalizedDate = new Date(offer.completedAt).toLocaleDateString();
    } else if (offer.status === 'accepted' && offer.acceptedAt) {
        finalizedDate = new Date(offer.acceptedAt).toLocaleDateString();
    } else if (offer.status === 'escrowed' && offer.escrowedAt) {
        finalizedDate = new Date(offer.escrowedAt).toLocaleDateString();
    } else if (offer.status === 'failed' && offer.failedAt) {
        finalizedDate = new Date(offer.failedAt).toLocaleDateString();
    } else if (offer.status === 'cancelled' && offer.cancelledAt) {
        finalizedDate = new Date(offer.cancelledAt).toLocaleDateString();
    } else {
        finalizedDate = new Date(offer.createdAt).toLocaleDateString();
    }

    const youWereInitiator = offer.initiator.wallet === connectedWallet;
    let yourNfts, theirNfts, yourSol, theirSol;
    let partnerWallet;

    if (youWereInitiator) {
        yourNfts = offer.initiator.nftDetails || [];
        yourSol = offer.initiator.sol || 0;
        theirNfts = offer.receiver.nftDetails || [];
        theirSol = offer.receiver.sol || 0;
        partnerWallet = offer.receiver.wallet;
    } else {
        yourNfts = offer.receiver.nftDetails || [];
        yourSol = offer.receiver.sol || 0;
        theirNfts = offer.initiator.nftDetails || [];
        theirSol = offer.initiator.sol || 0;
        partnerWallet = offer.initiator.wallet;
    }

    const shortPartner = partnerWallet.slice(0, 4) + '...' + partnerWallet.slice(-4);

    const yourImagesHtml = yourNfts.slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy">`
    ).join('');

    const theirImagesHtml = theirNfts.slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy">`
    ).join('');

    const yourText = buildOfferText(yourNfts.length, yourSol);
    const theirText = buildOfferText(theirNfts.length, theirSol);

    const statusLabels = {
        completed: 'Completed',
        accepted: 'Completed',
        escrowed: 'Processing',
        failed: 'Failed',
        cancelled: 'Cancelled',
        expired: 'Expired'
    };
    const statusText = statusLabels[offer.status] || offer.status.charAt(0).toUpperCase() + offer.status.slice(1);

    card.innerHTML = `
        <div class="offer-card-header">
            <span class="offer-id">ID: ${shortId}</span>
            <div class="offer-header-right">
                <span class="history-partner">with ${shortPartner}</span>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
        </div>
        <div class="offer-card-body">
            <div class="offer-preview-side">
                <div class="offer-preview-images">${yourImagesHtml || '<span>-</span>'}</div>
                <div class="offer-preview-text"><strong>You ${['accepted', 'completed'].includes(offer.status) ? 'gave' : 'offered'}:</strong> ${yourText}</div>
            </div>
            <span class="offer-preview-arrow">&#10132;</span>
            <div class="offer-preview-side">
                <div class="offer-preview-images">${theirImagesHtml || '<span>-</span>'}</div>
                <div class="offer-preview-text"><strong>You ${['accepted', 'completed'].includes(offer.status) ? 'got' : 'wanted'}:</strong> ${theirText}</div>
            </div>
        </div>
        <div class="offer-card-footer">
            <span class="offer-meta">${offer.status === 'accepted' ? 'Completed' : 'Ended'}: ${finalizedDate}</span>
            <div class="offer-card-actions">
                ${['completed', 'accepted'].includes(offer.status) && offer.escrowTxSignature ? `<a href="https://solscan.io/tx/${offer.escrowTxSignature}" target="_blank" rel="noopener" class="solscan-link">Solscan</a>` : ''}
                <a href="/swap/offer.html?id=${offer.id}" class="view-offer-btn">Details</a>
            </div>
        </div>
    `;

    return card;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

// Promise-based styled confirm dialog
function showStyledConfirm(title, message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('confirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'inlineConfirmModal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `
                <div class="modal-content confirm-modal">
                    <div class="modal-header">
                        <h2 class="confirm-title"></h2>
                        <button class="close-modal-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="confirm-message"></p>
                        <div class="modal-actions">
                            <button class="confirm-btn">Confirm</button>
                            <button class="cancel-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const titleEl = modal.querySelector('.confirm-title, #confirmModalTitle');
        const msgEl = modal.querySelector('.confirm-message, #confirmModalMessage');
        const confirmBtn = modal.querySelector('.confirm-btn, #confirmActionBtn');
        const cancelBtn = modal.querySelector('.cancel-btn, #cancelActionBtn');
        const closeBtn = modal.querySelector('.close-modal-btn');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        modal.style.display = 'flex';

        function cleanup(result) {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            resolve(result);
        }
        function onConfirm() { cleanup(true); }
        function onCancel() { cleanup(false); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
    });
}

async function cancelOffer(offerId, event) {
    const confirmed = await showStyledConfirm('Cancel Offer', 'Are you sure you want to cancel this offer?');
    if (!confirmed) {
        return;
    }

    showLoading('Please sign the message to verify wallet ownership...');

    try {
        const timestamp = Date.now();
        const message = `Midswap cancel offer ${offerId} at ${timestamp}`;
        let signature;
        try {
            signature = await signMessageForAuth(message);
        } catch (signErr) {
            throw new Error('Message signing cancelled or failed: ' + signErr.message);
        }

        showLoading('Cancelling offer...');

        const response = await fetch('/api/swap/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offerId: offerId,
                wallet: connectedWallet,
                action: 'cancel',
                signature: signature,
                message: message
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        hideLoading();
        loadOffers();

    } catch (err) {
        console.error('Error cancelling offer:', err);
        showError('Failed to cancel offer: ' + err.message);
    }
}
