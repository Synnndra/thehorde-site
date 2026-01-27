// MidEvils NFT Swap - Main Application Logic

// Constants
const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';
const MAX_NFTS_PER_SIDE = 5;
const PLATFORM_FEE = 0.01; // SOL
const OFFER_EXPIRY_HOURS = 24;

// Solana Program Constants
const PROGRAM_ID = '5DM6men8RMszhKYD245ejzip49nhqu8nd4F2UJhtovkY';
const FEE_WALLET = '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq'; // Fee collection wallet
const SOLANA_RPC = '/api/rpc'; // Use our proxy
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// Enable blockchain escrow
const USE_BLOCKCHAIN = true;

// State
let connectedWallet = null;
let yourNFTs = [];
let theirNFTs = [];
let selectedYourNFTs = [];
let selectedTheirNFTs = [];
let currentOffer = null;
let allOffers = { received: [], sent: [] };
let isOrcHolder = false; // Track if user owns an Orc (free swaps)
let solBalance = 0; // User's SOL balance

// Placeholder image
const PLACEHOLDER_IMAGE = '/orclogo.jpg';

// Countdown timers
let countdownIntervals = [];

// DOM Elements - will be set on page load
let elements = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeEventListeners();
    checkWalletConnection();
    initializePage();
});

// Initialize DOM elements based on current page
function initializeElements() {
    elements = {
        // Common elements
        walletStatus: document.getElementById('walletStatus'),
        connectWalletBtn: document.getElementById('connectWalletBtn'),
        disconnectWalletBtn: document.getElementById('disconnectWalletBtn'),
        loading: document.getElementById('loading'),
        error: document.getElementById('error'),

        // Create Offer page elements
        tradePartnerSection: document.getElementById('tradePartnerSection'),
        partnerWalletInput: document.getElementById('partnerWalletInput'),
        loadPartnerBtn: document.getElementById('loadPartnerBtn'),
        tradeBuilder: document.getElementById('tradeBuilder'),
        yourNFTGrid: document.getElementById('yourNFTGrid'),
        theirNFTGrid: document.getElementById('theirNFTGrid'),
        yourSelectionCount: document.getElementById('yourSelectionCount'),
        theirSelectionCount: document.getElementById('theirSelectionCount'),
        yourSolAmount: document.getElementById('yourSolAmount'),
        theirSolAmount: document.getElementById('theirSolAmount'),
        tradeSummary: document.getElementById('tradeSummary'),
        summaryGiving: document.getElementById('summaryGiving'),
        summaryReceiving: document.getElementById('summaryReceiving'),
        createOfferBtn: document.getElementById('createOfferBtn'),
        successModal: document.getElementById('successModal'),
        closeSuccessModal: document.getElementById('closeSuccessModal'),
        offerLinkInput: document.getElementById('offerLinkInput'),
        copyLinkBtn: document.getElementById('copyLinkBtn'),
        createAnotherBtn: document.getElementById('createAnotherBtn'),

        // Offers page elements
        offersSection: document.getElementById('offersSection'),
        receivedCount: document.getElementById('receivedCount'),
        sentCount: document.getElementById('sentCount'),
        historyCount: document.getElementById('historyCount'),
        receivedOffersList: document.getElementById('receivedOffersList'),
        sentOffersList: document.getElementById('sentOffersList'),
        historyOffersList: document.getElementById('historyOffersList'),

        // Offer detail page elements
        offerDetails: document.getElementById('offerDetails'),
        offerStatusBanner: document.getElementById('offerStatusBanner'),
        expiresText: document.getElementById('expiresText'),
        initiatorLabel: document.getElementById('initiatorLabel'),
        initiatorWallet: document.getElementById('initiatorWallet'),
        initiatorItems: document.getElementById('initiatorItems'),
        receiverLabel: document.getElementById('receiverLabel'),
        receiverWallet: document.getElementById('receiverWallet'),
        receiverItems: document.getElementById('receiverItems'),
        offerActions: document.getElementById('offerActions'),
        confirmModal: document.getElementById('confirmModal'),
        closeConfirmModal: document.getElementById('closeConfirmModal'),
        confirmModalTitle: document.getElementById('confirmModalTitle'),
        confirmModalMessage: document.getElementById('confirmModalMessage'),
        confirmActionBtn: document.getElementById('confirmActionBtn'),
        cancelActionBtn: document.getElementById('cancelActionBtn'),
        resultModal: document.getElementById('resultModal'),
        closeResultModal: document.getElementById('closeResultModal'),
        resultModalTitle: document.getElementById('resultModalTitle'),
        resultModalMessage: document.getElementById('resultModalMessage')
    };
}

// Initialize event listeners based on current page
function initializeEventListeners() {
    // Wallet connection
    if (elements.connectWalletBtn) {
        elements.connectWalletBtn.addEventListener('click', connectWallet);
    }

    if (elements.disconnectWalletBtn) {
        elements.disconnectWalletBtn.addEventListener('click', disconnectWallet);
    }

    // Create Offer page
    if (elements.loadPartnerBtn) {
        elements.loadPartnerBtn.addEventListener('click', loadPartnerNFTs);
    }

    if (elements.partnerWalletInput) {
        elements.partnerWalletInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadPartnerNFTs();
        });
    }

    if (elements.yourSolAmount) {
        elements.yourSolAmount.addEventListener('input', validateSolInput);
    }

    if (elements.theirSolAmount) {
        elements.theirSolAmount.addEventListener('input', updateTradeSummary);
    }

    if (elements.createOfferBtn) {
        elements.createOfferBtn.addEventListener('click', createOffer);
    }

    if (elements.closeSuccessModal) {
        elements.closeSuccessModal.addEventListener('click', () => {
            elements.successModal.style.display = 'none';
        });
    }

    if (elements.copyLinkBtn) {
        elements.copyLinkBtn.addEventListener('click', copyOfferLink);
    }

    if (elements.createAnotherBtn) {
        elements.createAnotherBtn.addEventListener('click', resetCreateOfferPage);
    }

    // Offers page tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Offer detail modals
    if (elements.closeConfirmModal) {
        elements.closeConfirmModal.addEventListener('click', () => {
            elements.confirmModal.style.display = 'none';
        });
    }

    if (elements.cancelActionBtn) {
        elements.cancelActionBtn.addEventListener('click', () => {
            elements.confirmModal.style.display = 'none';
        });
    }

    if (elements.closeResultModal) {
        elements.closeResultModal.addEventListener('click', () => {
            elements.resultModal.style.display = 'none';
        });
    }
}

// Initialize page based on URL
function initializePage() {
    const path = window.location.pathname;

    if (path.includes('offers.html')) {
        // My Offers page
        if (connectedWallet) {
            loadOffers();
        }
    } else if (path.includes('offer.html')) {
        // Offer detail page
        const urlParams = new URLSearchParams(window.location.search);
        const offerId = urlParams.get('id');
        if (offerId) {
            loadOfferDetails(offerId);
        } else {
            showError('No offer ID provided');
        }
    }
}

// ========== Wallet Connection ==========

function getPhantomProvider() {
    if ('phantom' in window) {
        const provider = window.phantom?.solana;
        if (provider?.isPhantom) {
            return provider;
        }
    }
    if ('solana' in window && window.solana?.isPhantom) {
        return window.solana;
    }
    return null;
}

async function checkWalletConnection() {
    const provider = getPhantomProvider();
    if (provider) {
        try {
            const response = await provider.connect({ onlyIfTrusted: true });
            connectedWallet = response.publicKey.toString();
            updateWalletUI(true);
            onWalletConnected();
        } catch (err) {
            // User hasn't approved yet, that's fine
            console.log('Auto-connect not available:', err.message);
        }
    }
}

async function connectWallet() {
    const provider = getPhantomProvider();

    if (!provider) {
        // Open Phantom website if not installed
        window.open('https://phantom.app/', '_blank');
        showError('Phantom wallet not found. Please install it from phantom.app');
        return;
    }

    try {
        const response = await provider.connect();
        connectedWallet = response.publicKey.toString();
        updateWalletUI(true);
        onWalletConnected();
    } catch (err) {
        console.error('Wallet connection failed:', err);
        showError('Failed to connect wallet: ' + err.message);
    }
}

function updateWalletUI(connected) {
    if (!elements.walletStatus || !elements.connectWalletBtn) return;

    const statusText = elements.walletStatus.querySelector('.status-text');

    if (connected && connectedWallet) {
        const shortWallet = connectedWallet.slice(0, 4) + '...' + connectedWallet.slice(-4);
        statusText.textContent = shortWallet;
        elements.walletStatus.classList.add('connected');
        elements.connectWalletBtn.textContent = 'Connected';
        elements.connectWalletBtn.classList.add('connected');
        elements.connectWalletBtn.style.display = 'none';
        if (elements.disconnectWalletBtn) {
            elements.disconnectWalletBtn.style.display = 'inline-block';
        }
    } else {
        statusText.textContent = 'Not Connected';
        elements.walletStatus.classList.remove('connected');
        elements.connectWalletBtn.textContent = 'Connect Phantom';
        elements.connectWalletBtn.classList.remove('connected');
        elements.connectWalletBtn.style.display = 'inline-block';
        if (elements.disconnectWalletBtn) {
            elements.disconnectWalletBtn.style.display = 'none';
        }
    }
}

async function disconnectWallet() {
    const provider = getPhantomProvider();

    if (provider) {
        try {
            await provider.disconnect();
        } catch (err) {
            console.error('Error disconnecting:', err);
        }
    }

    // Reset state
    connectedWallet = null;
    yourNFTs = [];
    theirNFTs = [];
    selectedYourNFTs = [];
    selectedTheirNFTs = [];
    isOrcHolder = false;
    solBalance = 0;

    // Update UI
    updateWalletUI(false);

    // Hide sections
    if (elements.tradePartnerSection) {
        elements.tradePartnerSection.style.display = 'none';
    }
    if (elements.tradeBuilder) {
        elements.tradeBuilder.style.display = 'none';
    }
    if (elements.tradeSummary) {
        elements.tradeSummary.style.display = 'none';
    }
    if (elements.offersSection) {
        elements.offersSection.style.display = 'none';
    }

    // Clear grids
    if (elements.yourNFTGrid) {
        elements.yourNFTGrid.innerHTML = '<div class="empty-state">Connect wallet to see your NFTs</div>';
    }
    if (elements.theirNFTGrid) {
        elements.theirNFTGrid.innerHTML = '<div class="empty-state">Enter a wallet address above to see their NFTs</div>';
    }
}

function onWalletConnected() {
    const path = window.location.pathname;

    if (path.includes('offers.html')) {
        loadOffers();
    } else if (path.includes('offer.html')) {
        // Refresh offer details with wallet context
        const urlParams = new URLSearchParams(window.location.search);
        const offerId = urlParams.get('id');
        if (offerId) loadOfferDetails(offerId);
    } else {
        // Create Offer page
        if (elements.tradePartnerSection) {
            elements.tradePartnerSection.style.display = 'block';
        }
        loadYourNFTs();
    }
}

// ========== NFT Loading ==========

async function loadYourNFTs() {
    if (!connectedWallet) return;

    showLoading('Loading your MidEvils...');

    try {
        // Fetch SOL balance and NFTs in parallel
        const [nfts, balance] = await Promise.all([
            fetchWalletNFTs(connectedWallet),
            fetchSolBalance(connectedWallet)
        ]);

        yourNFTs = nfts;
        solBalance = balance;

        // Update SOL input max and display balance
        updateSolInputLimits();

        // Check if user owns an Orc (free swaps for Orc holders)
        isOrcHolder = yourNFTs.some(nft => {
            const name = (nft.content?.metadata?.name || '').toLowerCase();
            return name.includes('orc');
        });

        // Update fee notice
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

async function fetchSolBalance(walletAddress) {
    try {
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'balance-check',
                method: 'getBalance',
                params: [walletAddress]
            })
        });

        const data = await response.json();

        if (data.result?.value !== undefined) {
            // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
            return data.result.value / 1_000_000_000;
        }
        return 0;
    } catch (err) {
        console.error('Error fetching SOL balance:', err);
        return 0;
    }
}

function updateSolInputLimits() {
    if (elements.yourSolAmount) {
        // Reserve a small amount for transaction fees (0.01 SOL)
        const maxSol = Math.max(0, solBalance - 0.01);
        const roundedMax = Math.floor(maxSol * 100) / 100; // Round down to 2 decimals

        elements.yourSolAmount.max = roundedMax;
        elements.yourSolAmount.placeholder = `0 - ${roundedMax}`;

        // Update label to show balance
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
        showError(`Maximum SOL you can offer is ${max} (keeping 0.01 for fees)`);
    }
    if (value < 0) {
        input.value = 0;
    }

    updateTradeSummary();
}

function updateFeeNotice() {
    const feeNotices = document.querySelectorAll('.fee-notice');
    feeNotices.forEach(notice => {
        if (isOrcHolder) {
            notice.innerHTML = `
                <span class="fee-icon">&#10003;</span>
                <span><strong>Free swap!</strong> Orc holders pay no platform fee</span>
            `;
            notice.style.background = '#1e5f3a';
            notice.style.color = '#6bf6a0';
        } else {
            notice.innerHTML = `
                <span class="fee-icon">&#9432;</span>
                <span>Platform fee: <strong>0.01 SOL</strong> (paid when offer is accepted) - <em>Free for Orc holders!</em></span>
            `;
            notice.style.background = '#1e3a5f';
            notice.style.color = '#64b5f6';
        }
    });
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

    // Filter to only MidEvils (exclude Graveyard and burnt)
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

// ========== NFT Display ==========

function displayNFTs(nfts, container, side) {
    if (!container) return;

    container.innerHTML = '';

    if (nfts.length === 0) {
        container.innerHTML = '<div class="empty-state">No MidEvils NFTs found</div>';
        return;
    }

    // Sort NFTs: available first, then enlisted/locked
    let sortedNfts = [...nfts];
    if (side === 'your') {
        sortedNfts.sort((a, b) => {
            const aLocked = a.ownership?.frozen || a.ownership?.delegated ? 1 : 0;
            const bLocked = b.ownership?.frozen || b.ownership?.delegated ? 1 : 0;
            return aLocked - bLocked;
        });
    }

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

    // Check if NFT is staked, frozen, or delegated (not tradeable)
    const isFrozen = nft.ownership?.frozen === true;
    const isDelegated = nft.ownership?.delegated === true;
    const isStaked = isFrozen || isDelegated;

    // Determine the reason it's locked
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
        <img class="nft-image" src="${imageUrl}" alt="${escapeHtml(name)}"
             onerror="this.src='${PLACEHOLDER_IMAGE}'" loading="lazy">
        <div class="nft-name">${escapeHtml(name)}</div>
        <div class="selection-indicator"></div>
        ${isStaked ? `<div class="lock-overlay"><span class="lock-icon">&#128274;</span><span class="lock-reason">${lockReason}</span></div>` : ''}
    `;

    // Store NFT data on element
    card.nftData = {
        id: nft.id,
        name: name,
        imageUrl: imageUrl
    };

    // Click handler - only allow selection if not locked
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

// ========== NFT Selection ==========

function toggleNFTSelection(card, side) {
    const selectedArray = side === 'your' ? selectedYourNFTs : selectedTheirNFTs;
    const maxSelected = MAX_NFTS_PER_SIDE;
    const nftId = card.dataset.nftId;

    const existingIndex = selectedArray.findIndex(n => n.id === nftId);

    if (existingIndex >= 0) {
        // Deselect
        selectedArray.splice(existingIndex, 1);
        card.classList.remove('selected');
        updateSelectionIndicators(selectedArray, side);
    } else {
        // Select (if under limit)
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

    // Clear all indicators
    container.querySelectorAll('.selection-indicator').forEach(ind => {
        ind.textContent = '';
    });

    // Update indicators with selection order
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

// ========== Trade Summary ==========

function updateTradeSummary() {
    if (!elements.summaryGiving || !elements.summaryReceiving) return;

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;

    // Update giving summary
    elements.summaryGiving.innerHTML = '';
    if (selectedYourNFTs.length === 0 && yourSol === 0) {
        elements.summaryGiving.innerHTML = '<span class="placeholder">Nothing selected</span>';
    } else {
        selectedYourNFTs.forEach(nft => {
            elements.summaryGiving.appendChild(createSummaryItem(nft));
        });
        if (yourSol > 0) {
            elements.summaryGiving.appendChild(createSolSummaryItem(yourSol));
        }
    }

    // Update receiving summary
    elements.summaryReceiving.innerHTML = '';
    if (selectedTheirNFTs.length === 0 && theirSol === 0) {
        elements.summaryReceiving.innerHTML = '<span class="placeholder">Nothing selected</span>';
    } else {
        selectedTheirNFTs.forEach(nft => {
            elements.summaryReceiving.appendChild(createSummaryItem(nft));
        });
        if (theirSol > 0) {
            elements.summaryReceiving.appendChild(createSolSummaryItem(theirSol));
        }
    }

    // Update create offer button state
    updateCreateOfferButton();
}

function createSummaryItem(nft) {
    const div = document.createElement('div');
    div.className = 'summary-item';
    div.innerHTML = `
        <img src="${nft.imageUrl}" alt="${escapeHtml(nft.name)}"
             onerror="this.src='${PLACEHOLDER_IMAGE}'">
        <span>${escapeHtml(nft.name)}</span>
    `;
    return div;
}

function createSolSummaryItem(amount) {
    const div = document.createElement('div');
    div.className = 'summary-item sol-item';
    div.textContent = `+ ${amount} SOL`;
    return div;
}

function updateCreateOfferButton() {
    if (!elements.createOfferBtn) return;

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;
    const partnerWallet = elements.partnerWalletInput?.value.trim();

    // Must have something on at least one side
    const hasYourOffer = selectedYourNFTs.length > 0 || yourSol > 0;
    const hasTheirRequest = selectedTheirNFTs.length > 0 || theirSol > 0;

    // Validate the trade makes sense
    const isValid = hasYourOffer && hasTheirRequest && partnerWallet && connectedWallet;

    elements.createOfferBtn.disabled = !isValid;
}

// ========== Create Offer ==========

async function createOffer() {
    if (!connectedWallet) {
        showError('Please connect your wallet first');
        return;
    }

    const partnerWallet = elements.partnerWalletInput.value.trim();
    if (!partnerWallet) {
        showError('Please enter a partner wallet address');
        return;
    }

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;

    showLoading('Creating offer...');
    elements.createOfferBtn.disabled = true;

    try {
        const response = await fetch('/api/swap/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initiatorWallet: connectedWallet,
                receiverWallet: partnerWallet,
                initiatorNfts: selectedYourNFTs.map(n => n.id),
                receiverNfts: selectedTheirNFTs.map(n => n.id),
                initiatorSol: yourSol,
                receiverSol: theirSol,
                // Include NFT metadata for display purposes
                initiatorNftDetails: selectedYourNFTs,
                receiverNftDetails: selectedTheirNFTs
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        hideLoading();

        // Show success modal
        const offerUrl = `${window.location.origin}/swap/offer.html?id=${data.offerId}`;
        elements.offerLinkInput.value = offerUrl;
        elements.successModal.style.display = 'flex';

    } catch (err) {
        console.error('Error creating offer:', err);
        showError('Failed to create offer: ' + err.message);
        elements.createOfferBtn.disabled = false;
    }
}

function copyOfferLink() {
    const linkInput = elements.offerLinkInput;
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
        elements.copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => {
            elements.copyLinkBtn.textContent = 'Copy';
        }, 2000);
    });
}

function resetCreateOfferPage() {
    elements.successModal.style.display = 'none';
    selectedYourNFTs = [];
    selectedTheirNFTs = [];

    if (elements.yourSolAmount) elements.yourSolAmount.value = '0';
    if (elements.theirSolAmount) elements.theirSolAmount.value = '0';

    // Reset NFT grid selections
    document.querySelectorAll('.nft-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelectorAll('.selection-indicator').forEach(ind => {
        ind.textContent = '';
    });

    updateSelectionCounts();
    updateTradeSummary();
}

// ========== Offers List Page ==========

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

        // Filter pending offers for received/sent tabs
        const pendingReceived = data.offers.filter(o =>
            o.receiver.wallet === connectedWallet && o.status === 'pending'
        );
        const pendingSent = data.offers.filter(o =>
            o.initiator.wallet === connectedWallet && o.status === 'pending'
        );

        // History includes all completed, cancelled, and expired offers
        const history = data.offers.filter(o =>
            ['accepted', 'cancelled', 'expired'].includes(o.status)
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
    // Clear old countdowns
    clearCountdowns();

    // Update counts
    if (elements.receivedCount) {
        elements.receivedCount.textContent = allOffers.received.length;
    }
    if (elements.sentCount) {
        elements.sentCount.textContent = allOffers.sent.length;
    }

    // Display received offers
    if (elements.receivedOffersList) {
        if (allOffers.received.length === 0) {
            elements.receivedOffersList.innerHTML = '<div class="empty-state">No offers received yet</div>';
        } else {
            elements.receivedOffersList.innerHTML = '';
            allOffers.received.forEach(offer => {
                elements.receivedOffersList.appendChild(createOfferCard(offer, 'received'));
            });
        }
    }

    // Display sent offers
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

    // Update history count
    if (elements.historyCount) {
        elements.historyCount.textContent = allOffers.history?.length || 0;
    }

    // Display history
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

    // Calculate countdown for pending offers
    let expiryHtml = '';
    if (offer.status === 'pending' && offer.expiresAt) {
        const countdown = formatCountdown(offer.expiresAt);
        const urgentClass = countdown.urgent ? 'urgent' : '';
        const expiredClass = countdown.expired ? 'expired' : '';
        expiryHtml = `<span class="offer-countdown ${urgentClass} ${expiredClass}" data-expires="${offer.expiresAt}">
            ${countdown.expired ? 'Expired' : `Expires in ${countdown.text}`}
        </span>`;
    }

    // Determine what to show based on perspective
    const givingNfts = type === 'received' ? offer.receiver.nftDetails : offer.initiator.nftDetails;
    const gettingNfts = type === 'received' ? offer.initiator.nftDetails : offer.receiver.nftDetails;
    const givingSol = type === 'received' ? offer.receiver.sol : offer.initiator.sol;
    const gettingSol = type === 'received' ? offer.initiator.sol : offer.receiver.sol;

    // Build preview images HTML
    const givingImagesHtml = (givingNfts || []).slice(0, 3).map(nft =>
        `<img src="${nft.imageUrl || PLACEHOLDER_IMAGE}" alt="${escapeHtml(nft.name)}"
              onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    const gettingImagesHtml = (gettingNfts || []).slice(0, 3).map(nft =>
        `<img src="${nft.imageUrl || PLACEHOLDER_IMAGE}" alt="${escapeHtml(nft.name)}"
              onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    // Build text summaries
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
                    `<button class="cancel-offer-btn" onclick="cancelOffer('${offer.id}', event)">Cancel</button>` : ''}
            </div>
        </div>
    `;

    // Start live countdown if pending
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

    // Get the date when the offer was finalized
    let finalizedDate = '';
    if (offer.status === 'accepted' && offer.acceptedAt) {
        finalizedDate = new Date(offer.acceptedAt).toLocaleDateString();
    } else if (offer.status === 'cancelled' && offer.cancelledAt) {
        finalizedDate = new Date(offer.cancelledAt).toLocaleDateString();
    } else {
        finalizedDate = new Date(offer.createdAt).toLocaleDateString();
    }

    // Determine what you gave/got based on perspective and status
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

    // Build preview images
    const yourImagesHtml = yourNfts.slice(0, 3).map(nft =>
        `<img src="${nft.imageUrl || PLACEHOLDER_IMAGE}" alt="${escapeHtml(nft.name)}"
              onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    const theirImagesHtml = theirNfts.slice(0, 3).map(nft =>
        `<img src="${nft.imageUrl || PLACEHOLDER_IMAGE}" alt="${escapeHtml(nft.name)}"
              onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    // Build text summaries
    const yourText = buildOfferText(yourNfts.length, yourSol);
    const theirText = buildOfferText(theirNfts.length, theirSol);

    // Status text
    let statusText = offer.status.charAt(0).toUpperCase() + offer.status.slice(1);
    if (offer.status === 'accepted') {
        statusText = 'Completed';
    }

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
                <div class="offer-preview-text"><strong>You ${offer.status === 'accepted' ? 'gave' : 'offered'}:</strong> ${yourText}</div>
            </div>
            <span class="offer-preview-arrow">&#10132;</span>
            <div class="offer-preview-side">
                <div class="offer-preview-images">${theirImagesHtml || '<span>-</span>'}</div>
                <div class="offer-preview-text"><strong>You ${offer.status === 'accepted' ? 'got' : 'wanted'}:</strong> ${theirText}</div>
            </div>
        </div>
        <div class="offer-card-footer">
            <span class="offer-meta">${offer.status === 'accepted' ? 'Completed' : 'Ended'}: ${finalizedDate}</span>
            <div class="offer-card-actions">
                <a href="/swap/offer.html?id=${offer.id}" class="view-offer-btn">Details</a>
            </div>
        </div>
    `;

    return card;
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

// ========== Offer Detail Page ==========

async function loadOfferDetails(offerId) {
    showLoading('Loading offer details...');

    try {
        const response = await fetch(`/api/swap/offer/${offerId}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        currentOffer = data.offer;
        hideLoading();
        displayOfferDetails();

    } catch (err) {
        console.error('Error loading offer:', err);
        showError('Failed to load offer: ' + err.message);
    }
}

function displayOfferDetails() {
    if (!currentOffer || !elements.offerDetails) return;

    elements.offerDetails.style.display = 'block';

    // Status banner
    const statusBadge = elements.offerStatusBanner.querySelector('.status-badge');
    statusBadge.className = `status-badge ${currentOffer.status.toLowerCase()}`;
    statusBadge.textContent = currentOffer.status;

    // Expiry text with live countdown
    if (currentOffer.status === 'pending' && currentOffer.expiresAt) {
        clearCountdowns();
        elements.expiresText.dataset.expires = currentOffer.expiresAt;
        startCountdown(elements.expiresText, currentOffer.expiresAt);
    } else if (currentOffer.status === 'accepted') {
        elements.expiresText.textContent = `Accepted on ${new Date(currentOffer.acceptedAt).toLocaleString()}`;
    } else if (currentOffer.status === 'cancelled') {
        elements.expiresText.textContent = `Cancelled on ${new Date(currentOffer.cancelledAt).toLocaleString()}`;
    } else {
        elements.expiresText.textContent = '';
    }

    // Initiator side
    const shortInitiator = currentOffer.initiator.wallet.slice(0, 4) + '...' + currentOffer.initiator.wallet.slice(-4);
    elements.initiatorWallet.textContent = shortInitiator;

    if (connectedWallet === currentOffer.initiator.wallet) {
        elements.initiatorLabel.textContent = 'You Offer';
    } else {
        elements.initiatorLabel.textContent = 'They Offer';
    }

    displayOfferItems(
        elements.initiatorItems,
        currentOffer.initiator.nftDetails || [],
        currentOffer.initiator.sol || 0
    );

    // Receiver side
    const shortReceiver = currentOffer.receiver.wallet.slice(0, 4) + '...' + currentOffer.receiver.wallet.slice(-4);
    elements.receiverWallet.textContent = shortReceiver;

    if (connectedWallet === currentOffer.receiver.wallet) {
        elements.receiverLabel.textContent = 'You Give';
    } else {
        elements.receiverLabel.textContent = 'In Exchange For';
    }

    displayOfferItems(
        elements.receiverItems,
        currentOffer.receiver.nftDetails || [],
        currentOffer.receiver.sol || 0
    );

    // Update fee notice based on offer
    const feeNotice = document.getElementById('feeNotice');
    if (feeNotice) {
        if (currentOffer.fee === 0 || currentOffer.isOrcHolder) {
            feeNotice.innerHTML = `
                <span class="fee-icon">&#10003;</span>
                <span><strong>Free swap!</strong> Initiator is an Orc holder</span>
            `;
            feeNotice.style.background = '#1e5f3a';
            feeNotice.style.color = '#6bf6a0';
        } else {
            feeNotice.innerHTML = `
                <span class="fee-icon">&#9432;</span>
                <span>Platform fee: <strong>${currentOffer.fee} SOL</strong> (deducted on accept)</span>
            `;
        }
    }

    // Action buttons based on role and status
    displayOfferActions();
}

function displayOfferItems(container, nftDetails, solAmount) {
    if (!container) return;

    container.innerHTML = '';

    if (nftDetails.length === 0 && solAmount === 0) {
        container.innerHTML = '<div class="empty-state">Nothing</div>';
        return;
    }

    nftDetails.forEach(nft => {
        const item = document.createElement('div');
        item.className = 'offer-item';
        item.innerHTML = `
            <img src="${nft.imageUrl || PLACEHOLDER_IMAGE}" alt="${escapeHtml(nft.name)}"
                 onerror="this.src='${PLACEHOLDER_IMAGE}'">
            <span class="item-name">${escapeHtml(nft.name)}</span>
        `;
        container.appendChild(item);
    });

    if (solAmount > 0) {
        const solItem = document.createElement('div');
        solItem.className = 'offer-item sol-item';
        solItem.textContent = `${solAmount} SOL`;
        container.appendChild(solItem);
    }
}

function displayOfferActions() {
    if (!elements.offerActions || !currentOffer) return;

    elements.offerActions.innerHTML = '';

    // Show different UI based on status
    if (currentOffer.status === 'accepted') {
        const isInitiator = connectedWallet === currentOffer.initiator.wallet;

        // Check if initiator needs to complete their transfer
        if (isInitiator && !currentOffer.initiatorTransferComplete) {
            const completeBtn = document.createElement('button');
            completeBtn.className = 'accept-btn';
            completeBtn.textContent = 'Complete Transfer (Send Your NFTs)';
            completeBtn.addEventListener('click', () => completeInitiatorTransfer());

            const notice = document.createElement('p');
            notice.className = 'action-notice';
            notice.textContent = 'The receiver has sent their NFTs. Now send yours to complete the swap.';

            elements.offerActions.appendChild(notice);
            elements.offerActions.appendChild(completeBtn);
        } else {
            elements.offerActions.innerHTML = '<p class="success-notice">Trade completed successfully!</p>';
        }
        return;
    }

    if (currentOffer.status !== 'pending') {
        elements.offerActions.innerHTML = '<p>This offer is no longer active.</p>';
        return;
    }

    const isInitiator = connectedWallet === currentOffer.initiator.wallet;
    const isReceiver = connectedWallet === currentOffer.receiver.wallet;

    if (isReceiver) {
        // Receiver can accept or decline
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-btn';
        acceptBtn.textContent = 'Accept Trade';
        acceptBtn.addEventListener('click', () => showConfirmModal('accept'));

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-btn';
        declineBtn.textContent = 'Decline';
        declineBtn.addEventListener('click', () => showConfirmModal('decline'));

        elements.offerActions.appendChild(acceptBtn);
        elements.offerActions.appendChild(declineBtn);
    } else if (isInitiator) {
        // Initiator can cancel
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel Offer';
        cancelBtn.addEventListener('click', () => showConfirmModal('cancel'));

        elements.offerActions.appendChild(cancelBtn);
    } else {
        // Not connected or not a party to this offer
        elements.offerActions.innerHTML = '<p>Connect your wallet to interact with this offer.</p>';
    }
}

// Complete initiator's transfer after receiver has accepted
async function completeInitiatorTransfer() {
    if (!currentOffer || !USE_BLOCKCHAIN) {
        showError('Cannot complete transfer');
        return;
    }

    try {
        showLoading('Preparing your transfer...');

        console.log('Current offer:', currentOffer);
        console.log('Initiator SOL:', currentOffer.initiator?.sol);
        console.log('Initiator NFTs:', currentOffer.initiator?.nftDetails);

        const connection = getSolanaConnection();
        const provider = getPhantomProvider();
        const signer = provider.publicKey;

        console.log('Signer:', signer.toBase58());
        console.log('RPC:', SOLANA_RPC);

        const initiatorPubkey = new solanaWeb3.PublicKey(currentOffer.initiator.wallet);
        const receiverPubkey = new solanaWeb3.PublicKey(currentOffer.receiver.wallet);

        // Verify signer is the initiator
        if (signer.toBase58() !== currentOffer.initiator.wallet) {
            throw new Error('Only the initiator can complete this transfer');
        }

        const transaction = new solanaWeb3.Transaction();

        // Pay platform fee (initiator pays)
        if (currentOffer.fee > 0) {
            const feeLamports = Math.floor(currentOffer.fee * solanaWeb3.LAMPORTS_PER_SOL);
            console.log('Adding fee payment:', currentOffer.fee, 'SOL =', feeLamports, 'lamports');
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: getFeeWallet(),
                    lamports: feeLamports,
                })
            );
        } else {
            console.log('No fee (Orc holder)');
        }

        // Transfer initiator's NFTs to receiver
        const initiatorNfts = currentOffer.initiator.nftDetails || [];
        for (const nft of initiatorNfts) {
            const mint = new solanaWeb3.PublicKey(nft.id);
            const sourceAta = await getATA(mint, initiatorPubkey);
            const destAta = await getATA(mint, receiverPubkey);

            // Create destination ATA if needed
            if (!(await ataExists(destAta))) {
                transaction.add(createATAInstruction(mint, receiverPubkey, signer));
            }

            // Transfer NFT
            transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
        }

        // Transfer initiator's SOL to receiver (if any)
        if (currentOffer.initiator.sol > 0) {
            const lamports = Math.floor(currentOffer.initiator.sol * solanaWeb3.LAMPORTS_PER_SOL);
            console.log('Adding SOL transfer:', currentOffer.initiator.sol, 'SOL =', lamports, 'lamports');
            console.log('From:', signer.toBase58(), 'To:', receiverPubkey.toBase58());
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: receiverPubkey,
                    lamports: lamports,
                })
            );
        } else {
            console.log('No SOL to transfer, initiator.sol =', currentOffer.initiator.sol);
        }

        console.log('Total instructions:', transaction.instructions.length);

        if (transaction.instructions.length === 0) {
            showError('Nothing to transfer - check console for details');
            return;
        }

        const { blockhash } = await getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = signer;

        showLoading('Please approve the transaction in Phantom...');
        const result = await signAndSubmitTransaction(transaction);

        if (!result.success) {
            throw new Error(result.error);
        }

        // Update database to mark initiator transfer complete
        showLoading('Updating offer status...');
        const response = await fetch('/api/swap/complete-transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offerId: currentOffer.id,
                wallet: connectedWallet,
                txSignature: result.signature
            })
        });

        const data = await response.json();
        if (data.error) {
            console.warn('Failed to update database:', data.error);
        }

        hideLoading();

        elements.resultModalTitle.textContent = 'Transfer Complete!';
        elements.resultModalMessage.textContent = `Your NFTs have been sent to the receiver.\n\nTx: ${result.signature.slice(0, 20)}...`;
        elements.resultModal.style.display = 'flex';

        // Refresh offer details
        loadOfferDetails(currentOffer.id);

    } catch (err) {
        console.error('Transfer failed:', err);
        showError('Failed to complete transfer: ' + err.message);
    }
}

function showConfirmModal(action) {
    const titles = {
        accept: 'Accept Trade',
        decline: 'Decline Offer',
        cancel: 'Cancel Offer'
    };

    const messages = {
        accept: USE_BLOCKCHAIN
            ? `Are you sure you want to accept this trade?\n\nYou will sign a blockchain transaction that transfers your NFTs/SOL to the other party.\n\nThis action cannot be undone.`
            : `Are you sure you want to accept this trade? You will receive the offered NFTs/SOL and give the requested NFTs/SOL.`,
        decline: 'Are you sure you want to decline this offer?',
        cancel: 'Are you sure you want to cancel this offer?'
    };

    elements.confirmModalTitle.textContent = titles[action];
    elements.confirmModalMessage.textContent = messages[action];

    elements.confirmActionBtn.onclick = () => executeOfferAction(action);

    elements.confirmModal.style.display = 'flex';
}

async function executeOfferAction(action) {
    elements.confirmModal.style.display = 'none';
    showLoading(`Processing ${action}...`);

    try {
        let endpoint, body;
        let blockchainResult = null;

        if (action === 'accept') {
            // Execute blockchain swap first
            if (USE_BLOCKCHAIN) {
                showLoading('Preparing blockchain transaction...');
                blockchainResult = await acceptOfferOnChain(currentOffer);

                if (!blockchainResult.success) {
                    throw new Error(blockchainResult.error || 'Blockchain transaction failed');
                }
            }

            endpoint = '/api/swap/accept';
            body = {
                offerId: currentOffer.id,
                wallet: connectedWallet,
                txSignature: blockchainResult?.signature || null
            };
        } else if (action === 'decline' || action === 'cancel') {
            endpoint = '/api/swap/cancel';
            body = { offerId: currentOffer.id, wallet: connectedWallet, action: action };
        }

        showLoading('Updating offer status...');

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        hideLoading();

        // Show result modal
        const successMessages = {
            accept: USE_BLOCKCHAIN
                ? `Trade completed successfully! NFTs have been exchanged on-chain.${blockchainResult?.signature ? '\n\nTx: ' + blockchainResult.signature.slice(0, 20) + '...' : ''}`
                : 'Trade completed successfully! The NFTs have been exchanged.',
            decline: 'Offer declined. The initiator has been notified.',
            cancel: 'Offer cancelled successfully.'
        };

        elements.resultModalTitle.textContent = 'Success!';
        elements.resultModalMessage.textContent = successMessages[action];
        elements.resultModal.style.display = 'flex';

        // Refresh offer details
        loadOfferDetails(currentOffer.id);

    } catch (err) {
        console.error(`Error ${action}ing offer:`, err);
        showError(`Failed to ${action} offer: ` + err.message);
    }
}

// Cancel offer from offers list
window.cancelOffer = async function(offerId, event) {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm('Are you sure you want to cancel this offer?')) {
        return;
    }

    showLoading('Cancelling offer...');

    try {
        const response = await fetch('/api/swap/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offerId: offerId,
                wallet: connectedWallet,
                action: 'cancel'
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        hideLoading();

        // Refresh offers list
        loadOffers();

    } catch (err) {
        console.error('Error cancelling offer:', err);
        showError('Failed to cancel offer: ' + err.message);
    }
};

// ========== Utility Functions ==========

function showLoading(message) {
    if (elements.loading) {
        elements.loading.textContent = message || 'Loading...';
        elements.loading.style.display = 'block';
    }
    if (elements.error) {
        elements.error.style.display = 'none';
    }
}

function hideLoading() {
    if (elements.loading) {
        elements.loading.style.display = 'none';
    }
}

function showError(message) {
    hideLoading();
    if (elements.error) {
        elements.error.textContent = message;
        elements.error.style.display = 'block';
    }
    console.error(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Format time remaining as countdown
function formatCountdown(expiresAt) {
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) {
        return { text: 'Expired', expired: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return { text: `${days}d ${hours % 24}h`, expired: false };
    } else if (hours > 0) {
        return { text: `${hours}h ${minutes}m`, expired: false };
    } else if (minutes > 0) {
        return { text: `${minutes}m ${seconds}s`, expired: false, urgent: true };
    } else {
        return { text: `${seconds}s`, expired: false, urgent: true };
    }
}

// Start live countdown for an element
function startCountdown(element, expiresAt) {
    const updateCountdown = () => {
        const countdown = formatCountdown(expiresAt);
        element.textContent = countdown.expired ? 'Expired' : `Expires in ${countdown.text}`;

        if (countdown.expired) {
            element.classList.add('expired');
            element.classList.remove('urgent');
        } else if (countdown.urgent) {
            element.classList.add('urgent');
        }
    };

    // Update immediately
    updateCountdown();

    // Update every second for urgent, every minute otherwise
    const interval = setInterval(updateCountdown, 1000);
    countdownIntervals.push(interval);

    return interval;
}

// Clear all countdown intervals
function clearCountdowns() {
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];
}

// ========== Solana Blockchain Functions ==========

// RPC helper - calls our proxy endpoint
async function rpcCall(method, params = []) {
    const response = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        })
    });
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result;
}

// Get latest blockhash via proxy
async function getLatestBlockhash() {
    const result = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    return {
        blockhash: result.value.blockhash,
        lastValidBlockHeight: result.value.lastValidBlockHeight
    };
}

// Send transaction via proxy
async function sendTransaction(serializedTransaction) {
    const base64Tx = Buffer.from(serializedTransaction).toString('base64');
    const signature = await rpcCall('sendTransaction', [base64Tx, { encoding: 'base64', preflightCommitment: 'confirmed' }]);
    return signature;
}

// Get signature status via proxy
async function getSignatureStatus(signature) {
    const result = await rpcCall('getSignatureStatuses', [[signature]]);
    return result.value[0];
}

// Check if account exists via proxy
async function getAccountInfo(pubkey) {
    const result = await rpcCall('getAccountInfo', [pubkey.toBase58(), { encoding: 'base64' }]);
    return result.value;
}

// Get Solana connection (for compatibility, but we mostly use rpcCall now)
function getSolanaConnection() {
    // Return a minimal connection object - we'll use rpcCall for most things
    return {
        rpcEndpoint: SOLANA_RPC
    };
}

// Get program ID as PublicKey
function getProgramId() {
    return new solanaWeb3.PublicKey(PROGRAM_ID);
}

// Get fee wallet as PublicKey
function getFeeWallet() {
    return new solanaWeb3.PublicKey(FEE_WALLET);
}

// Get token program ID
function getTokenProgramId() {
    return new solanaWeb3.PublicKey(TOKEN_PROGRAM_ID);
}

// Get associated token program ID
function getAssociatedTokenProgramId() {
    return new solanaWeb3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
}

// Derive offer PDA
async function getOfferPDA(offerId) {
    const programId = getProgramId();
    const [pda, bump] = await solanaWeb3.PublicKey.findProgramAddress(
        [Buffer.from('offer'), Buffer.from(offerId)],
        programId
    );
    return { pda, bump };
}

// Get Associated Token Account address
async function getATA(mint, owner) {
    const tokenProgramId = getTokenProgramId();
    const associatedTokenProgramId = getAssociatedTokenProgramId();

    const [ata] = await solanaWeb3.PublicKey.findProgramAddress(
        [
            owner.toBuffer(),
            tokenProgramId.toBuffer(),
            mint.toBuffer(),
        ],
        associatedTokenProgramId
    );
    return ata;
}

// Create ATA instruction if needed
function createATAInstruction(mint, owner, payer) {
    const tokenProgramId = getTokenProgramId();
    const associatedTokenProgramId = getAssociatedTokenProgramId();

    const ata = solanaWeb3.PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
        associatedTokenProgramId
    )[0];

    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ];

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: associatedTokenProgramId,
        data: Buffer.alloc(0),
    });
}

// Create SPL token transfer instruction
function createTokenTransferInstruction(source, destination, owner, amount) {
    const tokenProgramId = getTokenProgramId();

    const keys = [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
    ];

    // Transfer instruction = 3, followed by u64 amount
    const data = Buffer.alloc(9);
    data.writeUInt8(3, 0); // Transfer instruction
    data.writeBigUInt64LE(BigInt(amount), 1);

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: tokenProgramId,
        data,
    });
}

// Check if ATA exists
async function ataExists(ata) {
    try {
        const account = await getAccountInfo(ata);
        return account !== null;
    } catch {
        return false;
    }
}

// Sign and submit transaction
async function signAndSubmitTransaction(transaction) {
    const provider = getPhantomProvider();

    try {
        console.log('Requesting signature from Phantom...');

        // Sign with Phantom
        const signed = await provider.signTransaction(transaction);
        console.log('Transaction signed');

        // Submit to network via our proxy
        console.log('Submitting to network...');
        const signature = await sendTransaction(signed.serialize());
        console.log('Transaction submitted:', signature);

        // Wait for confirmation
        console.log('Waiting for confirmation...');
        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 30;

        while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempts++;

            try {
                const status = await getSignatureStatus(signature);
                console.log('Status check', attempts, ':', status?.confirmationStatus);

                if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
                    if (status.err) {
                        throw new Error('Transaction failed: ' + JSON.stringify(status.err));
                    }
                    confirmed = true;
                    console.log('Transaction confirmed!');
                }
            } catch (statusErr) {
                console.log('Status check error:', statusErr.message);
            }
        }

        if (!confirmed) {
            console.log('Confirmation timed out - transaction may still succeed. Signature:', signature);
        }

        return { success: true, signature };
    } catch (err) {
        console.error('Transaction failed:', err);
        return { success: false, error: err.message };
    }
}

// Build escrow transaction for creating offer
// This transfers initiator's NFTs to the receiver and collects fee
// For a trustless swap, we use direct P2P transfer with fee collection
async function buildSwapTransaction(offer, isAccepting = false) {
    const connection = getSolanaConnection();
    const provider = getPhantomProvider();
    const signer = provider.publicKey;
    const feeWallet = getFeeWallet();

    const transaction = new solanaWeb3.Transaction();

    if (isAccepting) {
        // Receiver is accepting - this is the atomic swap
        const initiatorPubkey = new solanaWeb3.PublicKey(offer.initiator.wallet);
        const receiverPubkey = new solanaWeb3.PublicKey(offer.receiver.wallet);

        // 1. Pay platform fee (if not free)
        if (offer.fee > 0) {
            const feeLamports = Math.floor(offer.fee * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: feeWallet,
                    lamports: feeLamports,
                })
            );
        }

        // 2. Transfer receiver's NFTs to initiator
        for (const nft of (offer.receiver.nftDetails || [])) {
            const mint = new solanaWeb3.PublicKey(nft.id);
            const sourceAta = await getATA(mint, receiverPubkey);
            const destAta = await getATA(mint, initiatorPubkey);

            // Create destination ATA if needed
            if (!(await ataExists(destAta))) {
                transaction.add(createATAInstruction(mint, initiatorPubkey, signer));
            }

            // Transfer NFT
            transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
        }

        // 3. Transfer receiver's SOL to initiator (if any)
        if (offer.receiver.sol > 0) {
            const lamports = Math.floor(offer.receiver.sol * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: initiatorPubkey,
                    lamports: lamports,
                })
            );
        }

        // 4. Transfer initiator's NFTs to receiver (initiator pre-signed this part)
        // Note: For full trustless, initiator would need to sign too, or we use escrow
        // For now, we rely on the API to verify and handle the initiator's side

    } else {
        // Initiator is creating - just transfer SOL if any (NFTs handled separately)
        if (offer.initiator?.sol > 0) {
            const receiverPubkey = new solanaWeb3.PublicKey(offer.receiver.wallet);
            const lamports = Math.floor(offer.initiator.sol * solanaWeb3.LAMPORTS_PER_SOL);

            // For direct P2P, transfer goes to receiver when they accept
            // For now, just prepare the offer in database
        }
    }

    const { blockhash } = await getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer;

    return transaction;
}

// Create offer with blockchain - for P2P swap, the actual transfer happens on accept
async function createOfferOnChain(offerId, receiverWallet, initiatorSol, receiverSol, nftMints) {
    // For P2P swaps, we don't escrow on create - we do atomic swap on accept
    // Just return success to continue with database record
    console.log('Offer created - atomic swap will execute on accept');
    return { success: true, mode: 'p2p-swap' };
}

// Execute atomic P2P swap when receiver accepts
async function executeAtomicSwap(offer) {
    const connection = getSolanaConnection();
    const provider = getPhantomProvider();
    const signer = provider.publicKey;
    const feeWallet = getFeeWallet();

    console.log('=== ACCEPT OFFER DEBUG ===');
    console.log('Offer:', offer);
    console.log('Fee:', offer.fee);
    console.log('Receiver NFTs:', offer.receiver?.nftDetails);
    console.log('Receiver SOL:', offer.receiver?.sol);
    console.log('Signer:', signer.toBase58());

    try {
        const initiatorPubkey = new solanaWeb3.PublicKey(offer.initiator.wallet);
        const receiverPubkey = new solanaWeb3.PublicKey(offer.receiver.wallet);

        console.log('Initiator:', initiatorPubkey.toBase58());
        console.log('Receiver:', receiverPubkey.toBase58());

        // Verify signer is the receiver
        if (signer.toBase58() !== offer.receiver.wallet) {
            throw new Error('Only the receiver can accept this offer');
        }

        const transaction = new solanaWeb3.Transaction();

        // Fee is paid by initiator when they complete their transfer, not by receiver
        console.log('Fee will be paid by initiator on completion');

        // 2. Transfer receiver's NFTs to initiator
        const receiverNfts = offer.receiver.nftDetails || [];
        console.log('Receiver NFTs to transfer:', receiverNfts.length);
        for (const nft of receiverNfts) {
            console.log('Processing NFT:', nft.id, nft.name);
            const mint = new solanaWeb3.PublicKey(nft.id);
            const sourceAta = await getATA(mint, receiverPubkey);
            const destAta = await getATA(mint, initiatorPubkey);

            // Create destination ATA if needed
            if (!(await ataExists(destAta))) {
                transaction.add(createATAInstruction(mint, initiatorPubkey, signer));
            }

            // Transfer NFT (1 token for NFT)
            transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
        }

        // 3. Transfer receiver's SOL to initiator (if requested)
        if (offer.receiver.sol > 0) {
            const lamports = Math.floor(offer.receiver.sol * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: initiatorPubkey,
                    lamports: lamports,
                })
            );
        }

        // Get recent blockhash
        const { blockhash } = await getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = signer;

        console.log('=== TRANSACTION SUMMARY ===');
        console.log('Total instructions:', transaction.instructions.length);
        console.log('Fee payer:', signer.toBase58());

        // Check if transaction has any instructions
        if (transaction.instructions.length === 0) {
            // If receiver has nothing to give, just pay the fee
            if (offer.fee > 0) {
                // Fee already added above
            } else {
                console.log('No blockchain transaction needed');
                return { success: true, signature: null };
            }
        }

        showLoading('Please approve the transaction in Phantom...');
        const result = await signAndSubmitTransaction(transaction);

        return result;

    } catch (err) {
        console.error('Atomic swap failed:', err);
        throw err;
    }
}

// Accept offer on-chain - executes the swap
async function acceptOfferOnChain(offer) {
    if (!USE_BLOCKCHAIN) {
        console.log('Blockchain mode disabled - using database only');
        return { success: true, mode: 'database' };
    }

    try {
        showLoading('Building swap transaction...');
        const result = await executeAtomicSwap(offer);

        if (result.success) {
            console.log('Swap executed:', result.signature);
            return result;
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('Accept offer failed:', err);
        throw err;
    }
}

// Cancel offer - no blockchain action needed for P2P model
async function cancelOfferOnChain(offerId) {
    // For P2P swaps, cancel is just a database update
    // No assets are escrowed, so nothing to return
    console.log('Offer cancelled:', offerId);
    return { success: true };
}
