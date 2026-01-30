// MidEvils NFT Swap - Main Application Logic

// Constants
const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';
const MAX_NFTS_PER_SIDE = 5;
const PLATFORM_FEE = 0.02; // SOL
const OFFER_EXPIRY_HOURS = 24;

// Solana Program Constants
const PROGRAM_ID = '5DM6men8RMszhKYD245ejzip49nhqu8nd4F2UJhtovkY';
const FEE_WALLET = '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq'; // Fee collection wallet
const ESCROW_WALLET = 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh'; // Escrow wallet for holding NFTs during swap
const SOLANA_RPC = '/api/rpc'; // Use our proxy
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// Fee reserve for SOL balance validation (platform fee + rent/tx fees buffer)
const FEE_RESERVE_SOL = 0.05;

// Instruction discriminators
const MPL_CORE_TRANSFER_DISCRIMINATOR = [14, 0];
const BUBBLEGUM_TRANSFER_DISCRIMINATOR = [163, 52, 200, 231, 140, 3, 69, 186];

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

        // How It Works toggle
        howItWorksToggle: document.getElementById('howItWorksToggle'),
        howItWorksContent: document.getElementById('howItWorksContent'),

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

    // How It Works toggle
    if (elements.howItWorksToggle) {
        elements.howItWorksToggle.addEventListener('click', () => {
            const content = elements.howItWorksContent;
            const icon = elements.howItWorksToggle.querySelector('.toggle-icon');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                if (icon) icon.textContent = '−';
            } else {
                content.style.display = 'none';
                if (icon) icon.textContent = '+';
            }
        });
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

// Sign a message with the connected wallet for authentication
async function signMessageForAuth(message) {
    const provider = getPhantomProvider();
    if (!provider) {
        throw new Error('Wallet not connected');
    }

    const encodedMessage = new TextEncoder().encode(message);
    const signedMessage = await provider.signMessage(encodedMessage, 'utf8');

    // Convert signature to base58
    const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let signature = signedMessage.signature;

    // Convert Uint8Array to base58
    function toBase58(bytes) {
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
            str += bs58Alphabet[0];
        }
        for (let i = digits.length - 1; i >= 0; i--) {
            str += bs58Alphabet[digits[i]];
        }
        return str;
    }

    return toBase58(signature);
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
        // Fetch SOL balance for accept validation
        fetchSolBalance(connectedWallet).then(balance => {
            solBalance = balance;
        });
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
        // Reserve for platform fee + transaction fees
        const maxSol = Math.max(0, solBalance - PLATFORM_FEE);
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
        <img class="nft-image" src="${sanitizeImageUrl(imageUrl)}" alt="${escapeHtml(name)}"
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
        <img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
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

    // Check wallet has enough SOL before starting
    const fee = isOrcHolder ? 0 : PLATFORM_FEE;
    const requiredSol = yourSol + fee + 0.005; // SOL to send + fee + tx fees buffer
    if (solBalance < requiredSol) {
        showError(`Insufficient SOL balance. You need at least ${requiredSol.toFixed(4)} SOL (${yourSol > 0 ? yourSol + ' SOL to send + ' : ''}${fee > 0 ? fee + ' SOL fee + ' : ''}~0.005 tx fees). Your balance: ${solBalance.toFixed(4)} SOL`);
        return;
    }

    const createSteps = [
        'Approve escrow transaction in Phantom',
        'Sending assets to escrow',
        'Sign message to verify wallet',
        'Saving offer'
    ];
    showSteppedLoading(createSteps, 0);
    elements.createOfferBtn.disabled = true;

    try {
        // Step 1: Build and sign escrow transaction (NFTs + fee to escrow wallet)
        showSteppedLoading(createSteps, 0);
        const escrowResult = await escrowInitiatorAssets(selectedYourNFTs, yourSol);

        if (!escrowResult.success) {
            throw new Error(escrowResult.error || 'Failed to escrow assets');
        }

        // Step 2: Sign message to verify wallet ownership (after on-chain tx to avoid timeout)
        showSteppedLoading(createSteps, 2);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${connectedWallet} to ${partnerWallet} at ${timestamp}`;
        let signature;
        try {
            signature = await signMessageForAuth(message);
        } catch (signErr) {
            throw new Error('Message signing cancelled or failed: ' + signErr.message);
        }

        showSteppedLoading(createSteps, 3);

        // Step 3: Create database record with escrow tx signature
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
                initiatorNftDetails: selectedYourNFTs,
                receiverNftDetails: selectedTheirNFTs,
                escrowTxSignature: escrowResult.signature,
                isOrcHolder: isOrcHolder,
                signature: signature,
                message: message
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

// Escrow initiator's NFTs and SOL to escrow wallet
async function escrowInitiatorAssets(nfts, solAmount) {
    const provider = getPhantomProvider();
    const signer = provider.publicKey;
    const escrowPubkey = new solanaWeb3.PublicKey(ESCROW_WALLET);
    const feePubkey = new solanaWeb3.PublicKey(FEE_WALLET);

    console.log('=== ESCROW INITIATOR ASSETS ===');
    console.log('NFTs to escrow:', nfts.length);
    console.log('SOL to escrow:', solAmount);
    console.log('Signer:', signer.toBase58());
    console.log('Escrow wallet:', escrowPubkey.toBase58());

    try {
        const transaction = new solanaWeb3.Transaction();

        // 1. Pay platform fee (if not Orc holder)
        if (!isOrcHolder) {
            const feeLamports = Math.floor(PLATFORM_FEE * solanaWeb3.LAMPORTS_PER_SOL);
            console.log('Adding fee payment:', PLATFORM_FEE, 'SOL');
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: feePubkey,
                    lamports: feeLamports,
                })
            );
        }

        // 2. Transfer SOL to escrow (if offering SOL)
        if (solAmount > 0) {
            const lamports = Math.floor(solAmount * solanaWeb3.LAMPORTS_PER_SOL);
            console.log('Adding SOL escrow:', solAmount, 'SOL');
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: escrowPubkey,
                    lamports: lamports,
                })
            );
        }

        // 3. Transfer NFTs to escrow (prefetch all assets in parallel)
        const assetResults = await Promise.all(nfts.map(nft => getAssetWithProof(nft.id)));
        const assetMap = new Map(nfts.map((nft, i) => [nft.id, assetResults[i]]));

        for (const nft of nfts) {
            console.log('Processing NFT for escrow:', nft.id, nft.name);

            const asset = assetMap.get(nft.id);
            console.log('Asset interface:', asset?.interface);
            console.log('Asset compression:', asset?.compression);

            if (asset?.interface === 'MplCoreAsset') {
                // Metaplex Core Asset - use MPL Core transfer
                console.log('NFT is MPL Core Asset, using Core transfer to escrow');
                // Get collection from grouping
                const collection = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
                console.log('Collection:', collection);
                const ix = createMplCoreTransferInstruction(nft.id, signer, escrowPubkey, collection);
                transaction.add(ix);
            } else if (asset?.compression?.compressed === true) {
                // Compressed NFT - use Bubblegum transfer to escrow
                console.log('NFT is compressed, using Bubblegum transfer to escrow');
                await transferCompressedNFT(nft.id, signer, escrowPubkey, transaction);
            } else {
                // Standard SPL token transfer to escrow
                console.log('NFT is standard SPL token');
                const mint = new solanaWeb3.PublicKey(nft.id);
                const sourceAta = await getATA(mint, signer);
                const destAta = await getATA(mint, escrowPubkey);

                // Create escrow ATA if needed
                if (!(await ataExists(destAta))) {
                    transaction.add(createATAInstruction(mint, escrowPubkey, signer));
                }

                transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
            }
        }

        if (transaction.instructions.length === 0) {
            console.log('No instructions - nothing to escrow');
            return { success: true, signature: null };
        }

        // Set fee payer (blockhash fetched fresh in signAndSubmitTransaction)
        transaction.feePayer = signer;

        console.log('Total instructions:', transaction.instructions.length);
        showLoading('Please approve the escrow transaction in Phantom...');

        const result = await signAndSubmitTransaction(transaction);

        if (result.success) {
            showLoading('Transaction submitted, confirming on-chain...');
        }

        return result;

    } catch (err) {
        console.error('Escrow failed:', err);
        return { success: false, error: err.message };
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

        // History includes all non-pending offers
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
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    const gettingImagesHtml = (gettingNfts || []).slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
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
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    const theirImagesHtml = theirNfts.slice(0, 3).map(nft =>
        `<img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
              loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
    ).join('');

    // Build text summaries
    const yourText = buildOfferText(yourNfts.length, yourSol);
    const theirText = buildOfferText(theirNfts.length, theirSol);

    // Status text
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
        applyFeeNotice(feeNotice, currentOffer.fee === 0 || currentOffer.isOrcHolder, currentOffer.fee);
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
            <img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
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
    if (currentOffer.status === 'completed') {
        elements.offerActions.innerHTML = '<p class="success-notice">Trade completed successfully! Assets have been exchanged.</p>';
        return;
    }

    if (currentOffer.status === 'escrowed') {
        const hasError = currentOffer.releaseToReceiverError || currentOffer.releaseToInitiatorError;
        if (hasError) {
            const errorMsg = currentOffer.releaseToReceiverError || currentOffer.releaseToInitiatorError;
            elements.offerActions.innerHTML = `<p class="error-notice">Escrow release pending. Error: ${escapeHtml(errorMsg)}</p>
                <p>The release will be retried automatically, or you can <button class="retry-release-btn" onclick="retryRelease('${currentOffer.id}')">Retry Now</button></p>`;
        } else {
            elements.offerActions.innerHTML = '<p class="success-notice">Both sides escrowed. Releases are being processed...</p>';
        }
        return;
    }

    if (currentOffer.status === 'failed') {
        elements.offerActions.innerHTML = '<p class="error-notice">This swap failed. Assets have been returned to their original owners.</p>';
        return;
    }

    if (currentOffer.status === 'accepted') {
        // Legacy status for backward compatibility
        elements.offerActions.innerHTML = '<p class="success-notice">Trade accepted! Processing...</p>';
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

function showConfirmModal(action) {
    const titles = {
        accept: 'Accept Trade',
        decline: 'Decline Offer',
        cancel: 'Cancel Offer'
    };

    const messages = {
        accept: USE_BLOCKCHAIN
            ? `Are you sure you want to accept this trade?\n\nYou will sign a blockchain transaction that sends your NFTs/SOL to escrow. The server will then release both sides.\n\nThis action cannot be undone.`
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

    const isAccept = action === 'accept' && USE_BLOCKCHAIN;
    const acceptSteps = [
        'Approve transaction in Phantom',
        'Sending assets to escrow',
        'Sign message to verify wallet',
        'Releasing escrowed assets',
        'Completing swap'
    ];

    if (isAccept) {
        showSteppedLoading(acceptSteps, 0);
    } else {
        showLoading(`Processing ${action}...`);
    }

    try {
        let endpoint, body;
        let blockchainResult = null;

        if (action === 'accept') {
            // Fetch fresh SOL balance before checking
            solBalance = await fetchSolBalance(connectedWallet);

            // Check wallet has enough SOL before starting
            const receiverSol = parseFloat(currentOffer.receiver?.sol) || 0;
            const requiredSol = receiverSol + 0.005; // SOL to send + tx fees buffer
            if (solBalance < requiredSol) {
                showError(`Insufficient SOL balance. You need at least ${requiredSol.toFixed(4)} SOL (${receiverSol > 0 ? receiverSol + ' SOL to send + ' : ''}~0.005 tx fees). Your balance: ${solBalance.toFixed(4)} SOL`);
                return;
            }

            // Step 1: Execute blockchain tx first (before auth message to avoid timeout)
            if (USE_BLOCKCHAIN) {
                showSteppedLoading(acceptSteps, 0);
                blockchainResult = await acceptOfferOnChain(currentOffer);

                if (!blockchainResult.success) {
                    throw new Error(blockchainResult.error || 'Blockchain transaction failed');
                }
                showSteppedLoading(acceptSteps, 1);
            }
        }

        // Step 2: Sign auth message (after on-chain tx so the 5-min clock starts fresh)
        if (isAccept) {
            showSteppedLoading(acceptSteps, 2);
        } else {
            showLoading('Please sign the message to verify wallet ownership...');
        }
        const timestamp = Date.now();
        const message = `Midswap ${action} offer ${currentOffer.id} at ${timestamp}`;
        let signature;
        try {
            signature = await signMessageForAuth(message);
        } catch (signErr) {
            throw new Error('Message signing cancelled or failed: ' + signErr.message);
        }

        if (action === 'accept') {
            endpoint = '/api/swap/accept';
            body = {
                offerId: currentOffer.id,
                wallet: connectedWallet,
                txSignature: blockchainResult?.signature || null,
                signature: signature,
                message: message
            };
        } else if (action === 'decline' || action === 'cancel') {
            endpoint = '/api/swap/cancel';
            body = {
                offerId: currentOffer.id,
                wallet: connectedWallet,
                action: action,
                signature: signature,
                message: message
            };
        }

        if (isAccept) {
            showSteppedLoading(acceptSteps, 3);
        } else {
            showLoading('Updating offer status...');
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        if (isAccept) {
            showSteppedLoading(acceptSteps, 4);
            await new Promise(r => setTimeout(r, 500));
        }

        hideLoading();

        // Show result modal
        let acceptMessage;
        if (action === 'accept' && USE_BLOCKCHAIN) {
            if (data.status === 'completed') {
                acceptMessage = `Trade completed successfully! NFTs have been exchanged on-chain.${blockchainResult?.signature ? '\n\nTx: ' + blockchainResult.signature.slice(0, 20) + '...' : ''}`;
            } else {
                acceptMessage = 'Your assets are escrowed. The server is releasing both sides — this may take a moment. Refresh to check status.';
            }
        }

        const successMessages = {
            accept: acceptMessage || 'Trade completed successfully! The NFTs have been exchanged.',
            decline: 'Offer declined. The initiator has been notified.',
            cancel: 'Offer cancelled successfully.'
        };

        elements.resultModalTitle.textContent = data.status === 'completed' || action !== 'accept' ? 'Success!' : 'Processing...';
        elements.resultModalMessage.textContent = successMessages[action];
        elements.resultModal.style.display = 'flex';

        // Refresh offer details
        loadOfferDetails(currentOffer.id);

    } catch (err) {
        console.error(`Error ${action}ing offer:`, err);
        showError(`Failed to ${action} offer: ` + err.message);
    }
}

// Promise-based styled confirm dialog (avoids native confirm())
function showStyledConfirm(title, message) {
    return new Promise((resolve) => {
        // Reuse existing confirm modal if available, otherwise create one
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

// Cancel offer from offers list
window.cancelOffer = async function(offerId, event) {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = await showStyledConfirm('Cancel Offer', 'Are you sure you want to cancel this offer?');
    if (!confirmed) {
        return;
    }

    showLoading('Please sign the message to verify wallet ownership...');

    try {
        // Sign a message to verify wallet ownership
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
        elements.loading.innerHTML = `<div class="spinner"></div><div class="loading-text">${escapeHtml(message || 'Loading...')}</div>`;
        elements.loading.style.display = 'flex';
        elements.loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (elements.error) {
        elements.error.style.display = 'none';
    }
}

function showSteppedLoading(steps, activeIndex) {
    if (!elements.loading) return;
    const stepsHtml = steps.map((step, i) => {
        let cls = 'pending';
        if (i < activeIndex) cls = 'done';
        else if (i === activeIndex) cls = 'active';
        return `<div class="loading-step ${cls}">${escapeHtml(step)}</div>`;
    }).join('');
    elements.loading.innerHTML = `<div class="spinner"></div><div class="loading-text">${escapeHtml(steps[activeIndex] || 'Processing...')}<div class="loading-steps">${stepsHtml}</div></div>`;
    elements.loading.style.display = 'flex';
    elements.loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

function sanitizeImageUrl(url) {
    if (!url) return PLACEHOLDER_IMAGE;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return escapeHtml(url);
        }
    } catch {}
    return PLACEHOLDER_IMAGE;
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
    // Convert Uint8Array to base64 without using Node's Buffer
    const base64Tx = btoa(String.fromCharCode.apply(null, serializedTransaction));
    const signature = await rpcCall('sendTransaction', [base64Tx, {
        encoding: 'base64',
        skipPreflight: true,  // Skip simulation to avoid blockhash timing issues
        preflightCommitment: 'confirmed',
        maxRetries: 3
    }]);
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
    const encoder = new TextEncoder();
    const [pda, bump] = await solanaWeb3.PublicKey.findProgramAddress(
        [encoder.encode('offer'), encoder.encode(offerId)],
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
            owner.toBytes(),
            tokenProgramId.toBytes(),
            mint.toBytes(),
        ],
        associatedTokenProgramId
    );
    return ata;
}

// Create ATA instruction if needed
function createATAInstruction(mint, owner, payer) {
    const tokenProgramId = getTokenProgramId();
    const associatedTokenProgramId = getAssociatedTokenProgramId();
    const SYSVAR_RENT_PUBKEY = new solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111');

    const ata = solanaWeb3.PublicKey.findProgramAddressSync(
        [owner.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
        associatedTokenProgramId
    )[0];

    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    console.log('Creating ATA instruction:');
    console.log('  ATA:', ata.toBase58());
    console.log('  Owner:', owner.toBase58());
    console.log('  Mint:', mint.toBase58());
    console.log('  Payer:', payer.toBase58());

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: associatedTokenProgramId,
        data: new Uint8Array(0),
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

    // Transfer instruction = 3, followed by u64 amount (little-endian)
    const data = new Uint8Array(9);
    data[0] = 3; // Transfer instruction
    // Write amount as u64 little-endian
    const amountBigInt = BigInt(amount);
    for (let i = 0; i < 8; i++) {
        data[1 + i] = Number((amountBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }

    console.log('Creating token transfer instruction:');
    console.log('  Source ATA:', source.toBase58());
    console.log('  Dest ATA:', destination.toBase58());
    console.log('  Owner:', owner.toBase58());
    console.log('  Amount:', amount);

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: tokenProgramId,
        data,
    });
}

// Check if ATA exists and has tokens
async function ataExists(ata) {
    try {
        const account = await getAccountInfo(ata);
        return account !== null;
    } catch {
        return false;
    }
}

// Get token accounts for a mint owned by a wallet
async function getTokenAccountsForMint(owner, mint) {
    try {
        console.log('Getting token accounts for owner:', owner.toBase58(), 'mint:', mint.toBase58());
        const result = await rpcCall('getTokenAccountsByOwner', [
            owner.toBase58(),
            { mint: mint.toBase58() },
            { encoding: 'jsonParsed' }
        ]);
        console.log('Token accounts result:', result);
        return result.value || [];
    } catch (err) {
        console.error('Error getting token accounts:', err);
        return [];
    }
}

// Check if NFT is compressed using Helius DAS API
async function getAssetWithProof(assetId) {
    try {
        console.log('Fetching asset data for:', assetId);
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-asset-proof',
                method: 'getAsset',
                params: {
                    id: assetId,
                    displayOptions: {
                        showFungible: false,
                        showUnverifiedCollections: true
                    }
                }
            })
        });

        const data = await response.json();
        console.log('getAsset response:', data);
        if (data.error) {
            console.error('getAsset API error:', data.error);
            throw new Error(data.error.message);
        }
        return data.result;
    } catch (err) {
        console.error('Error getting asset:', err);
        return null;
    }
}

// Get asset proof for compressed NFT transfer
async function getAssetProof(assetId) {
    try {
        console.log('Fetching asset proof for:', assetId);
        const response = await fetch('/api/helius', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'get-proof',
                method: 'getAssetProof',
                params: {
                    id: assetId
                }
            })
        });

        const data = await response.json();
        console.log('getAssetProof response:', data);
        if (data.error) {
            console.error('getAssetProof API error:', data.error);
            throw new Error(data.error.message);
        }
        return data.result;
    } catch (err) {
        console.error('Error getting asset proof:', err);
        return null;
    }
}

// Create Bubblegum transfer instruction for compressed NFT
function createBubblegumTransferInstruction(
    treeAddress,
    leafOwner,
    newLeafOwner,
    leafDelegate,
    merkleTree,
    rootHash,
    dataHash,
    creatorHash,
    nonce,
    index,
    proof
) {
    const BUBBLEGUM_PROGRAM_ID = new solanaWeb3.PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
    const SPL_NOOP_PROGRAM_ID = new solanaWeb3.PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
    const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new solanaWeb3.PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

    // Get tree authority PDA
    const [treeAuthority] = solanaWeb3.PublicKey.findProgramAddressSync(
        [treeAddress.toBytes()],
        BUBBLEGUM_PROGRAM_ID
    );

    const keys = [
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        { pubkey: leafDelegate, isSigner: false, isWritable: false },
        { pubkey: newLeafOwner, isSigner: false, isWritable: false },
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    // Add proof accounts
    for (const proofNode of proof) {
        keys.push({ pubkey: new solanaWeb3.PublicKey(proofNode), isSigner: false, isWritable: false });
    }

    // Bubblegum transfer instruction discriminator
    // Followed by: root (32 bytes), dataHash (32 bytes), creatorHash (32 bytes), nonce (8 bytes), index (4 bytes)
    const discriminator = new Uint8Array(BUBBLEGUM_TRANSFER_DISCRIMINATOR);

    // Convert hex strings to bytes
    const rootBytes = hexToBytes(rootHash);
    const dataHashBytes = hexToBytes(dataHash);
    const creatorHashBytes = hexToBytes(creatorHash);

    // Nonce as u64 little-endian (8 bytes)
    const nonceBytes = new Uint8Array(8);
    const nonceBigInt = BigInt(nonce);
    for (let i = 0; i < 8; i++) {
        nonceBytes[i] = Number((nonceBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }

    // Index as u32 little-endian (4 bytes)
    const indexBytes = new Uint8Array(4);
    indexBytes[0] = index & 0xff;
    indexBytes[1] = (index >> 8) & 0xff;
    indexBytes[2] = (index >> 16) & 0xff;
    indexBytes[3] = (index >> 24) & 0xff;

    // Combine all data
    const data = new Uint8Array(8 + 32 + 32 + 32 + 8 + 4);
    data.set(discriminator, 0);
    data.set(rootBytes, 8);
    data.set(dataHashBytes, 40);
    data.set(creatorHashBytes, 72);
    data.set(nonceBytes, 104);
    data.set(indexBytes, 112);

    console.log('Creating Bubblegum transfer instruction:');
    console.log('  Tree:', merkleTree.toBase58());
    console.log('  Tree Authority:', treeAuthority.toBase58());
    console.log('  From:', leafOwner.toBase58());
    console.log('  To:', newLeafOwner.toBase58());
    console.log('  Index:', index);

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: BUBBLEGUM_PROGRAM_ID,
        data,
    });
}

// MPL Core program ID
const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const SPL_NOOP_PROGRAM_ID = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';

// Create MPL Core transfer instruction
function createMplCoreTransferInstruction(assetId, fromPubkey, toPubkey, collectionAddress = null) {
    const programId = new solanaWeb3.PublicKey(MPL_CORE_PROGRAM_ID);
    const asset = new solanaWeb3.PublicKey(assetId);
    const systemProgram = solanaWeb3.SystemProgram.programId;
    const logWrapper = new solanaWeb3.PublicKey(SPL_NOOP_PROGRAM_ID);

    // MPL Core TransferV1 uses discriminator 14, followed by Option<CompressionProof> = None (0)
    const data = new Uint8Array(MPL_CORE_TRANSFER_DISCRIMINATOR);

    // All accounts in order per MPL Core TransferV1
    const keys = [
        { pubkey: asset, isSigner: false, isWritable: true },                                    // 0: asset
        { pubkey: collectionAddress ? new solanaWeb3.PublicKey(collectionAddress) : programId, isSigner: false, isWritable: false }, // 1: collection
        { pubkey: fromPubkey, isSigner: true, isWritable: true },                                // 2: payer
        { pubkey: fromPubkey, isSigner: true, isWritable: false },                               // 3: authority (owner)
        { pubkey: toPubkey, isSigner: false, isWritable: false },                                // 4: newOwner
        { pubkey: systemProgram, isSigner: false, isWritable: false },                           // 5: systemProgram
        { pubkey: logWrapper, isSigner: false, isWritable: false },                              // 6: logWrapper (SPL Noop)
    ];

    console.log('Creating MPL Core transfer instruction:');
    console.log('  Asset:', asset.toBase58());
    console.log('  Collection:', collectionAddress || 'none (using program ID)');
    console.log('  From:', fromPubkey.toBase58());
    console.log('  To:', toPubkey.toBase58());

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId,
        data,
    });
}

// Helper to convert hex string to bytes
function hexToBytes(hex) {
    // Remove '0x' prefix if present
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// Transfer a compressed NFT
async function transferCompressedNFT(assetId, fromPubkey, toPubkey, transaction) {
    console.log('Transferring compressed NFT:', assetId);

    // Get asset info and proof
    const [asset, proof] = await Promise.all([
        getAssetWithProof(assetId),
        getAssetProof(assetId)
    ]);

    console.log('Asset result:', asset);
    console.log('Proof result:', proof);

    if (!asset) {
        throw new Error('Failed to get asset data for ' + assetId);
    }
    if (!proof) {
        throw new Error('Failed to get proof for ' + assetId + '. Asset compression: ' + JSON.stringify(asset?.compression));
    }

    console.log('Asset compression info:', asset.compression);
    console.log('Proof:', proof);

    const compression = asset.compression;
    if (!compression || !compression.compressed) {
        throw new Error('Asset is not a compressed NFT');
    }

    const merkleTree = new solanaWeb3.PublicKey(compression.tree);
    const leafOwner = fromPubkey;
    const leafDelegate = fromPubkey; // Usually same as owner unless delegated
    const newLeafOwner = toPubkey;

    // Create the transfer instruction
    const ix = createBubblegumTransferInstruction(
        merkleTree,
        leafOwner,
        newLeafOwner,
        leafDelegate,
        merkleTree,
        proof.root,
        compression.data_hash,
        compression.creator_hash,
        compression.leaf_id,
        compression.leaf_id, // index is same as leaf_id for cNFTs
        proof.proof
    );

    transaction.add(ix);
    console.log('Added Bubblegum transfer instruction');
}

// Sign and submit transaction with retry logic
async function signAndSubmitTransaction(transaction, retryCount = 0) {
    const provider = getPhantomProvider();
    const maxRetries = 2;

    try {
        // Get fresh blockhash right before signing to minimize expiry risk
        console.log('Getting fresh blockhash...');
        const { blockhash } = await getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        console.log('Requesting signature from Phantom...');

        // Use signAndSendTransaction so Blowfish can properly analyze the transaction
        // This avoids the "Request blocked" warning for unverified dApps
        const { signature } = await provider.signAndSendTransaction(transaction, {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 3
        });
        console.log('Transaction signed and submitted:', signature);

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
        const receiverPubkey = new solanaWeb3.PublicKey(offer.receiver.wallet);
        const escrowPubkey = new solanaWeb3.PublicKey(ESCROW_WALLET);

        console.log('Receiver:', receiverPubkey.toBase58());
        console.log('Escrow:', escrowPubkey.toBase58());

        // Verify signer is the receiver
        if (signer.toBase58() !== offer.receiver.wallet) {
            throw new Error('Only the receiver can accept this offer');
        }

        const transaction = new solanaWeb3.Transaction();

        // Transfer receiver's NFTs to escrow (not directly to initiator)
        const receiverNfts = offer.receiver.nftDetails || [];
        console.log('Receiver NFTs to escrow:', receiverNfts.length);

        // Prefetch all asset data in parallel
        const swapAssetResults = await Promise.all(receiverNfts.map(nft => getAssetWithProof(nft.id)));
        const swapAssetMap = new Map(receiverNfts.map((nft, i) => [nft.id, swapAssetResults[i]]));

        for (const nft of receiverNfts) {
            console.log('Processing NFT:', nft.id, nft.name);

            const asset = swapAssetMap.get(nft.id);
            console.log('Asset interface:', asset?.interface);
            console.log('Asset compression:', asset?.compression);

            if (asset?.interface === 'MplCoreAsset') {
                // Metaplex Core Asset - use MPL Core transfer to escrow
                console.log('NFT is MPL Core Asset, using Core transfer to escrow');
                const collection = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
                console.log('Collection:', collection);
                const ix = createMplCoreTransferInstruction(nft.id, receiverPubkey, escrowPubkey, collection);
                transaction.add(ix);
            } else if (asset?.compression?.compressed === true) {
                // Compressed NFT - use Bubblegum transfer to escrow
                console.log('NFT is compressed, using Bubblegum transfer to escrow');
                await transferCompressedNFT(nft.id, receiverPubkey, escrowPubkey, transaction);
            } else {
                // Standard SPL token transfer to escrow
                console.log('NFT is standard SPL token');
                const mint = new solanaWeb3.PublicKey(nft.id);

                // Find the actual token account holding this NFT
                const tokenAccounts = await getTokenAccountsForMint(receiverPubkey, mint);
                console.log('Token accounts found:', tokenAccounts.length);

                if (tokenAccounts.length === 0) {
                    throw new Error(`You don't own this NFT (${nft.name})`);
                }

                // Use the first account that has balance
                let sourceAta = null;
                for (const ta of tokenAccounts) {
                    const balance = ta.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                    console.log('Token account:', ta.pubkey, 'balance:', balance);
                    if (balance > 0) {
                        sourceAta = new solanaWeb3.PublicKey(ta.pubkey);
                        break;
                    }
                }

                if (!sourceAta) {
                    throw new Error(`No token account with balance found for ${nft.name}`);
                }

                console.log('Using source account:', sourceAta.toBase58());

                // Destination is the escrow ATA
                const destAta = await getATA(mint, escrowPubkey);
                console.log('Dest ATA (escrow):', destAta.toBase58());

                // Create escrow ATA if needed
                const destExists = await ataExists(destAta);
                console.log('Dest ATA exists:', destExists);
                if (!destExists) {
                    console.log('Creating escrow ATA...');
                    transaction.add(createATAInstruction(mint, escrowPubkey, signer));
                }

                // Transfer NFT (1 token for NFT)
                transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
            }
        }

        // Transfer receiver's SOL to escrow (if requested)
        if (offer.receiver.sol > 0) {
            const lamports = Math.floor(offer.receiver.sol * solanaWeb3.LAMPORTS_PER_SOL);
            console.log('Adding SOL transfer to escrow:', offer.receiver.sol, 'SOL =', lamports, 'lamports');
            console.log('From:', signer.toBase58());
            console.log('To escrow:', escrowPubkey.toBase58());
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: escrowPubkey,
                    lamports: lamports,
                })
            );
        }

        // Set fee payer (blockhash will be fetched fresh in signAndSubmitTransaction)
        transaction.feePayer = signer;

        console.log('=== TRANSACTION SUMMARY ===');
        console.log('Total instructions:', transaction.instructions.length);
        transaction.instructions.forEach((ix, i) => {
            console.log(`Instruction ${i}: programId=${ix.programId.toBase58()}, keys=${ix.keys.length}`);
        });
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

        if (result.success) {
            showLoading('Transaction submitted, confirming on-chain...');
        }

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

// Retry escrow release for stuck offers
async function retryRelease(offerId) {
    if (!connectedWallet) {
        showError('Please connect your wallet first');
        return;
    }

    try {
        const retrySteps = ['Sign message to verify wallet', 'Retrying escrow release'];
        showSteppedLoading(retrySteps, 0);
        const timestamp = Date.now();
        const message = `Midswap retry-release offer ${offerId} at ${timestamp}`;
        const signature = await signMessageForAuth(message);

        showSteppedLoading(retrySteps, 1);
        const response = await fetch('/api/swap/retry-release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offerId,
                wallet: connectedWallet,
                signature,
                message
            })
        });

        const data = await response.json();
        hideLoading();

        if (data.error) {
            showError('Retry failed: ' + data.error);
            return;
        }

        if (data.status === 'completed') {
            elements.resultModalTitle.textContent = 'Success!';
            elements.resultModalMessage.textContent = 'Swap completed! Both sides have been released.';
            elements.resultModal.style.display = 'flex';
        } else {
            showError('Release still pending. It will be retried automatically.');
        }

        loadOfferDetails(offerId);
    } catch (err) {
        hideLoading();
        showError('Retry failed: ' + err.message);
    }
}
// Make retryRelease available from inline onclick
window.retryRelease = retryRelease;

