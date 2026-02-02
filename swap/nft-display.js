// MidEvils NFT Swap - NFT Display & Selection

function displayNFTs(nfts, container, side) {
    if (!container) return;

    container.innerHTML = '';

    if (nfts.length === 0) {
        container.innerHTML = '<div class="empty-state">No MidEvils NFTs found</div>';
        return;
    }

    let sortedNfts = [...nfts];
    sortedNfts.sort((a, b) => {
        const aLocked = a.ownership?.frozen || a.ownership?.delegated ? 1 : 0;
        const bLocked = b.ownership?.frozen || b.ownership?.delegated ? 1 : 0;
        return aLocked - bLocked;
    });

    sortedNfts.forEach((nft, index) => {
        const card = createNFTCard(nft, side, index);
        container.appendChild(card);
    });
}

function createNFTCard(nft, side, index) {
    const card = document.createElement('div');
    card.className = 'nft-card';
    card.dataset.nftId = nft.id;
    card.dataset.side = side;

    const name = nft.content?.metadata?.name || 'Unnamed NFT';
    const imageUrl = getImageUrl(nft);

    const isFrozen = nft.ownership?.frozen === true;
    const isDelegated = nft.ownership?.delegated === true;
    const isStaked = isFrozen || isDelegated;

    let lockReason = '';
    if (isFrozen && isDelegated) {
        lockReason = 'Enlisted / On Loan';
    } else if (isFrozen) {
        lockReason = 'Enlisted';
    } else if (isDelegated) {
        lockReason = 'On Loan';
    }

    if (isStaked) {
        card.classList.add('not-tradeable');
        card.dataset.locked = 'true';
    }

    card.innerHTML = `
        <img class="nft-image skeleton" src="${sanitizeImageUrl(imageUrl)}" alt="${escapeHtml(name)}"
             loading="lazy"
             onload="this.classList.remove('skeleton')"
             onerror="this.classList.remove('skeleton'); this.src='${PLACEHOLDER_IMAGE}'">
        <div class="nft-name">${escapeHtml(name)}</div>
        <div class="selection-indicator"></div>
        ${isStaked ? `<div class="lock-overlay"><span class="lock-icon">&#128274;</span><span class="lock-reason">${lockReason}</span></div>` : ''}
    `;

    card.nftData = {
        id: nft.id,
        name: name,
        imageUrl: imageUrl
    };

    if (!isStaked) {
        card.addEventListener('click', () => toggleNFTSelection(card, side));
    } else {
        card.addEventListener('click', () => {
            showError(`This NFT is ${lockReason.toLowerCase()} and cannot be traded`);
        });
    }

    return card;
}

function getImageUrl(nft) {
    if (nft.content?.links?.image) return nft.content.links.image;
    if (nft.content?.files?.[0]?.uri) return nft.content.files[0].uri;
    if (nft.content?.files?.[0]?.cdn_uri) return nft.content.files[0].cdn_uri;
    return PLACEHOLDER_IMAGE;
}

function toggleNFTSelection(card, side) {
    const selectedArray = side === 'your' ? selectedYourNFTs : selectedTheirNFTs;
    const maxSelected = MAX_NFTS_PER_SIDE;
    const nftId = card.dataset.nftId;

    const existingIndex = selectedArray.findIndex(n => n.id === nftId);

    if (existingIndex >= 0) {
        selectedArray.splice(existingIndex, 1);
        card.classList.remove('selected');
        updateSelectionIndicators(selectedArray, side);
    } else {
        if (selectedArray.length >= maxSelected) {
            showError(`Maximum ${maxSelected} NFTs per side`);
            return;
        }

        selectedArray.push(card.nftData);
        card.classList.add('selected');
        updateSelectionIndicators(selectedArray, side);
    }

    updateSelectionCounts();
    updateTradeSummary();
}

function updateSelectionIndicators(selectedArray, side) {
    const container = side === 'your' ? elements.yourNFTGrid : elements.theirNFTGrid;
    if (!container) return;

    container.querySelectorAll('.selection-indicator').forEach(ind => {
        ind.textContent = '';
    });

    selectedArray.forEach((nft, index) => {
        const card = container.querySelector(`[data-nft-id="${nft.id}"]`);
        if (card) {
            const indicator = card.querySelector('.selection-indicator');
            if (indicator) {
                indicator.textContent = index + 1;
            }
        }
    });
}

function updateSelectionCounts() {
    if (elements.yourSelectionCount) {
        elements.yourSelectionCount.textContent = `${selectedYourNFTs.length} selected`;
    }
    if (elements.theirSelectionCount) {
        elements.theirSelectionCount.textContent = `${selectedTheirNFTs.length} selected`;
    }
}
