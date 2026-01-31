// MidEvils NFT Swap - Main Application Entry Point
// All logic has been split into separate modules loaded via <script> tags.
// This file handles initialization only.

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
                if (icon) icon.textContent = '\u2212';
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
        if (connectedWallet) {
            loadOffers();
        }
    } else if (path.includes('offer.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const offerId = urlParams.get('id');
        if (offerId) {
            loadOfferDetails(offerId);
        } else {
            showError('No offer ID provided');
        }
    }
}
