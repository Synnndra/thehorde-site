// MidEvils NFT Swap - NFT Loading

async function loadYourNFTs() {
    if (!connectedWallet) return;

    showLoading('Loading your MidEvils...');

    try {
        const [nfts, balance] = await Promise.all([
            fetchWalletNFTs(connectedWallet),
            fetchSolBalance(connectedWallet)
        ]);

        yourNFTs = nfts;
        solBalance = balance;

        updateSolInputLimits();

        isOrcHolder = yourNFTs.some(nft => {
            const name = (nft.content?.metadata?.name || '').toLowerCase();
            return name.includes('orc');
        });

        updateFeeNotice();

        displayNFTs(yourNFTs, elements.yourNFTGrid, 'your');
        hideLoading();

        if (elements.tradeBuilder) {
            elements.tradeBuilder.style.display = 'block';
        }
        if (elements.tradeSummary) {
            elements.tradeSummary.style.display = 'block';
        }
    } catch (err) {
        console.error('Error loading your NFTs:', err);
        showError('Failed to load your NFTs: ' + err.message);
    }
}

async function loadPartnerNFTs() {
    const partnerWallet = elements.partnerWalletInput.value.trim();

    if (!partnerWallet) {
        showError('Please enter a wallet address');
        return;
    }

    if (partnerWallet === connectedWallet) {
        showError('You cannot trade with yourself');
        return;
    }

    showLoading('Loading partner\'s MidEvils...');

    try {
        theirNFTs = await fetchWalletNFTs(partnerWallet);

        if (theirNFTs.length === 0) {
            elements.theirNFTGrid.innerHTML = '<div class="empty-state">This wallet has no MidEvils NFTs</div>';
        } else {
            displayNFTs(theirNFTs, elements.theirNFTGrid, 'their');
        }

        hideLoading();
    } catch (err) {
        console.error('Error loading partner NFTs:', err);
        showError('Failed to load partner\'s NFTs: ' + err.message);
    }
}

async function fetchWalletNFTs(walletAddress) {
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'midswap',
                method: 'getAssetsByOwner',
                params: {
                    ownerAddress: walletAddress,
                    page: page,
                    limit: 1000
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch NFTs');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const pageItems = data.result?.items || [];

        if (pageItems.length === 0) {
            hasMore = false;
            break;
        }

        allItems.push(...pageItems);

        if (pageItems.length < 1000) {
            hasMore = false;
        } else {
            page++;
        }
    }

    return allItems.filter(item => {
        const grouping = item.grouping || [];
        const collections = grouping
            .filter(g => g.group_key === 'collection')
            .map(g => g.group_value);

        const hasMidEvil = collections.includes(MIDEVIL_COLLECTION);
        const hasGraveyard = collections.includes(GRAVEYARD_COLLECTION);
        const name = item.content?.metadata?.name || '';
        const hasGraveyardInName = name.toLowerCase().includes('graveyard');
        const isBurnt = item.burnt === true;

        return hasMidEvil && !hasGraveyard && !hasGraveyardInName && !isBurnt;
    });
}

function updateSolInputLimits() {
    if (elements.yourSolAmount) {
        const maxSol = Math.max(0, solBalance - PLATFORM_FEE);
        const roundedMax = Math.floor(maxSol * 100) / 100;

        elements.yourSolAmount.max = roundedMax;
        elements.yourSolAmount.placeholder = `0 - ${roundedMax}`;

        const label = elements.yourSolAmount.closest('.sol-input-section')?.querySelector('label');
        if (label) {
            label.innerHTML = `+ Add SOL: <span class="sol-balance">(${roundedMax} available)</span>`;
        }
    }
}

function validateSolInput(e) {
    const input = e.target;
    const value = parseFloat(input.value) || 0;
    const max = parseFloat(input.max) || 0;

    if (value > max) {
        input.value = max;
        showError(`Maximum SOL you can offer is ${max} (keeping 0.02 for fees)`);
    }
    if (value < 0) {
        input.value = 0;
    }

    updateTradeSummary();
}

function applyFeeNotice(el, isFree, feeAmount) {
    if (isFree) {
        el.innerHTML = `
            <span class="fee-icon">&#10003;</span>
            <span><strong>Free swap!</strong> Orc holders pay no platform fee</span>
        `;
        el.style.background = '#1e5f3a';
        el.style.color = '#6bf6a0';
    } else {
        el.innerHTML = `
            <span class="fee-icon">&#9432;</span>
            <span>Platform fee: <strong>${feeAmount || PLATFORM_FEE} SOL</strong> (paid when creating offer) - <em>Free for Orc holders!</em></span>
        `;
        el.style.background = '#1e3a5f';
        el.style.color = '#64b5f6';
    }
}

function updateFeeNotice() {
    document.querySelectorAll('.fee-notice').forEach(notice => {
        applyFeeNotice(notice, isOrcHolder, PLATFORM_FEE);
    });
}
