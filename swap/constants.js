// MidEvils NFT Swap - Constants & Configuration

// Collection Constants
const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';
const MAX_NFTS_PER_SIDE = 5;
const PLATFORM_FEE = 0.02; // SOL
const OFFER_EXPIRY_HOURS = 24;

// Solana Program Constants
const PROGRAM_ID = '5DM6men8RMszhKYD245ejzip49nhqu8nd4F2UJhtovkY';
const FEE_WALLET = '6zLek4SZSKNhvzDZP4AZWyUYYLzEYCYBaYeqvdZgXpZq';
const ESCROW_WALLET = 'BxoL6PUiM5rmY7YMUu6ua9vZdfmgr8fkK163RsdB8ZHh';
const SOLANA_RPC = '/api/rpc';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// Fee reserve for SOL balance validation
const FEE_RESERVE_SOL = 0.05;

// Instruction discriminators
const MPL_CORE_TRANSFER_DISCRIMINATOR = [14, 0];
const BUBBLEGUM_TRANSFER_DISCRIMINATOR = [163, 52, 200, 231, 140, 3, 69, 186];

// Enable blockchain escrow
const USE_BLOCKCHAIN = true;

// State
var connectedWallet = null;
var yourNFTs = [];
var theirNFTs = [];
var selectedYourNFTs = [];
var selectedTheirNFTs = [];
var currentOffer = null;
var allOffers = { received: [], sent: [] };
var isOrcHolder = false;
var solBalance = 0;

// Placeholder image
const PLACEHOLDER_IMAGE = '/orclogo.jpg';

// Global delegated image error handler
document.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG' && e.target.src !== window.location.origin + PLACEHOLDER_IMAGE) {
        e.target.src = PLACEHOLDER_IMAGE;
    }
}, true);

// Countdown timers
var countdownIntervals = [];

// DOM Elements - will be set on page load
var elements = {};
