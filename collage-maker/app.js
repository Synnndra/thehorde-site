// This is the main JavaScript file that makes our NFT viewer work

// We use Shyft API - a free, beginner-friendly API for Solana NFTs
// Shyft makes it super easy to get NFT data without complex blockchain calls

// Get references to HTML elements
const walletInputs = [
    document.getElementById('walletInput1'),
    document.getElementById('walletInput2'),
    document.getElementById('walletInput3'),
    document.getElementById('walletInput4'),
    document.getElementById('walletInput5')
];
const fetchButton = document.getElementById('fetchButton');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const nftContainer = document.getElementById('nftContainer');
const selectionControls = document.getElementById('selectionControls');
const selectedCountSpan = document.getElementById('selectedCount');
const createCollageBtn = document.getElementById('createCollageBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const quickActions = document.getElementById('quickActions');
const selectAllBtn = document.getElementById('selectAllBtn');
const previewModal = document.getElementById('previewModal');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const downloadCollageBtn = document.getElementById('downloadCollageBtn');
const cancelPreviewBtn = document.getElementById('cancelPreviewBtn');
const nftDetailsModal = document.getElementById('nftDetailsModal');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');
const filterSection = document.getElementById('filterSection');
const filterControls = document.getElementById('filterControls');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const sortSection = document.getElementById('sortSection');
const sortSelect = document.getElementById('sortSelect');
const sortToggleBtn = document.getElementById('sortToggleBtn');
const sortContent = document.getElementById('sortContent');
const filterToggleBtn = document.getElementById('filterToggleBtn');
const filterContent = document.getElementById('filterContent');
const layoutSelect = document.getElementById('layoutSelect');
const spacingSlider = document.getElementById('spacingSlider');
const spacingValue = document.getElementById('spacingValue');
const trainingFilterSelect = document.getElementById('trainingFilterSelect');
const raceFilterSelect = document.getElementById('raceFilterSelect');

// Track selected NFTs in order
let selectedNFTsArray = [];
// Store all loaded NFTs for select all functionality
let allLoadedNFTs = [];
// Store the current collage canvas for download
let currentCollageCanvas = null;
// Store active filters
let activeFilters = {};
// Store training filter state
let trainingFilter = 'all';
// Store race filter state
let raceFilter = 'all';
// Store current sort option
let currentSortOption = 'background';
// Store current preview NFT array for reordering
let previewNFTArray = [];
// Store montage sizes separately so they persist through reordering
let montageSizeAssignments = new Map();
// Placeholder image URL (orc logo for empty grid spots)
const PLACEHOLDER_IMAGE = '/orclogo.jpg';
// Counter for unique placeholder IDs
let placeholderIdCounter = 0;

// Helper function to create a placeholder object
function createPlaceholder() {
    placeholderIdCounter++;
    return {
        id: `placeholder-${placeholderIdCounter}`,
        name: 'Placeholder',
        imageUrl: PLACEHOLDER_IMAGE,
        isPlaceholder: true
    };
}

// Add click event listener to the button
fetchButton.addEventListener('click', fetchNFTs);

// Also allow pressing Enter in any wallet input field
walletInputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchNFTs();
        }
    });
});

// Add event listeners for collage buttons
createCollageBtn.addEventListener('click', createCollage);
clearSelectionBtn.addEventListener('click', clearSelection);
selectAllBtn.addEventListener('click', toggleSelectAll);

// Add event listeners for preview modal
closePreviewBtn.addEventListener('click', closePreview);
cancelPreviewBtn.addEventListener('click', closePreview);
downloadCollageBtn.addEventListener('click', downloadCollage);

// Add event listener for NFT details modal
closeDetailsBtn.addEventListener('click', closeNFTDetails);

// Add event listener for clear filters button
clearFiltersBtn.addEventListener('click', clearAllFilters);

// Add event listener for sort select
sortSelect.addEventListener('change', (e) => {
    currentSortOption = e.target.value;
    applySortAndDisplay();
});

// Add event listener for training filter
trainingFilterSelect.addEventListener('change', (e) => {
    trainingFilter = e.target.value;
    applyFilters();
});

// Add event listener for race filter
raceFilterSelect.addEventListener('change', (e) => {
    raceFilter = e.target.value;
    applyFilters();
});

// Add event listeners for collapse/expand buttons
sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSection(sortContent, sortToggleBtn);
});

filterToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSection(filterContent, filterToggleBtn);
});

// Also toggle when clicking the header
document.querySelector('#sortSection .section-header').addEventListener('click', () => {
    toggleSection(sortContent, sortToggleBtn);
});

document.querySelector('#filterSection .section-header').addEventListener('click', () => {
    toggleSection(filterContent, filterToggleBtn);
});

// Add event listener for layout select
layoutSelect.addEventListener('change', () => {
    if (previewNFTArray.length > 0) {
        showPreview();
    }
});

// Add event listener for spacing slider
spacingSlider.addEventListener('input', () => {
    spacingValue.textContent = spacingSlider.value;
    if (previewNFTArray.length > 0) {
        showPreview();
    }
});

// Function to calculate grid dimensions based on layout
function calculateGridDimensions(nftCount, layout) {
    let cols, rows;

    switch (layout) {
        case 'wide':
            // More columns than rows (landscape)
            cols = Math.ceil(Math.sqrt(nftCount * 2));
            rows = Math.ceil(nftCount / cols);
            break;
        case 'tall':
            // More rows than columns (portrait)
            rows = Math.ceil(Math.sqrt(nftCount * 2));
            cols = Math.ceil(nftCount / rows);
            break;
        case 'twitter-header':
            // Twitter header is 1500x500 (3:1 ratio)
            // cols should be ~3x rows
            cols = Math.ceil(Math.sqrt(nftCount * 3));
            rows = Math.ceil(nftCount / cols);
            // Ensure at least 3:1 ratio
            if (cols < rows * 3) {
                cols = Math.ceil(rows * 3);
                if (cols * rows < nftCount) {
                    rows = Math.ceil(nftCount / cols);
                }
            }
            break;
        case 'phone-wallpaper':
            // Phone wallpaper is ~9:19.5 ratio (roughly 1:2.17)
            // rows should be ~2x cols
            rows = Math.ceil(Math.sqrt(nftCount * 2.17));
            cols = Math.ceil(nftCount / rows);
            // Ensure at least 1:2 ratio
            if (rows < cols * 2) {
                rows = Math.ceil(cols * 2);
                if (cols * rows < nftCount) {
                    cols = Math.ceil(nftCount / rows);
                }
            }
            break;
        case 'auto-square':
        default:
            // Roughly square (current behavior)
            cols = Math.ceil(Math.sqrt(nftCount));
            rows = Math.ceil(nftCount / cols);
            break;
    }

    return { cols, rows };
}

// Helper function to generate montage layout sizes
// Returns array of { size: 1 or 2 } for each NFT (size 2 = 2x2, size 1 = 1x1)
function generateMontageSizes(nftCount) {
    const sizes = [];
    // Pattern: every 4th NFT is large (2x2), starting from first
    for (let i = 0; i < nftCount; i++) {
        if (i % 5 === 0 && i < nftCount - 1) {
            sizes.push({ size: 2 }); // Large 2x2
        } else {
            sizes.push({ size: 1 }); // Normal 1x1
        }
    }
    return sizes;
}

// Function to toggle section collapse/expand
function toggleSection(contentElement, buttonElement) {
    const isCollapsed = contentElement.classList.contains('collapsed');

    if (isCollapsed) {
        contentElement.classList.remove('collapsed');
        buttonElement.textContent = '−';
    } else {
        contentElement.classList.add('collapsed');
        buttonElement.textContent = '+';
    }
}

// Main function to fetch and display NFTs
async function fetchNFTs() {
    // Get all wallet addresses from input fields (filter out empty ones)
    const walletAddresses = walletInputs
        .map(input => input.value.trim())
        .filter(address => address !== '');

    // Validate that user entered at least one wallet
    if (walletAddresses.length === 0) {
        showError('Please enter at least one wallet address');
        return;
    }

    // Hide empty wallet inputs
    walletInputs.forEach(input => {
        if (input.value.trim() === '') {
            input.style.display = 'none';
        }
    });

    // Clear previous results and messages
    nftContainer.innerHTML = '';
    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    fetchButton.disabled = true;

    // Clear any previous selections
    clearSelection();

    try {
        // MidEvil collection addresses
        const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
        const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

        // Show progress message
        loadingDiv.textContent = `Fetching NFTs from ${walletAddresses.length} wallet(s)...`;

        // Fetch NFTs from all wallets
        let allItems = [];

        for (let i = 0; i < walletAddresses.length; i++) {
            const walletAddress = walletAddresses[i];
            console.log(`Fetching NFTs from wallet ${i + 1}/${walletAddresses.length}:`, walletAddress);

            loadingDiv.textContent = `Fetching from wallet ${i + 1}/${walletAddresses.length}...`;

            // Fetch NFTs owned by this wallet (with pagination)
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch('/api/helius', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'midevil-viewer',
                        method: 'getAssetsByOwner',
                        params: {
                            ownerAddress: walletAddress,
                            page: page,
                            limit: 1000
                        }
                    })
                });

                if (!response.ok) {
                    console.error(`Failed to fetch from wallet ${walletAddress}`);
                    // Continue to next wallet instead of failing completely
                    break;
                }

                const data = await response.json();

                if (data.error) {
                    console.error(`Error fetching from wallet ${walletAddress}:`, data.error.message);
                    break;
                }

                const pageItems = data.result?.items || [];

                if (pageItems.length === 0) {
                    hasMore = false;
                    break;
                }

                allItems = allItems.concat(pageItems);

                if (pageItems.length < 1000) {
                    hasMore = false;
                } else {
                    page++;
                    loadingDiv.textContent = `Wallet ${i + 1}/${walletAddresses.length}: Found ${allItems.length} NFTs so far...`;
                }
            }
        }

        console.log('Total NFTs owned across all wallets:', allItems.length);

        // Filter to only MidEvils (exclude Graveyard)
        const nfts = allItems.filter(item => {
            const grouping = item.grouping || [];

            // Check all collection groupings, not just the first one
            const collections = grouping
                .filter(g => g.group_key === 'collection')
                .map(g => g.group_value);

            const hasMidEvil = collections.includes(MIDEVIL_COLLECTION);
            const hasGraveyard = collections.includes(GRAVEYARD_COLLECTION);
            const name = item.content?.metadata?.name || '';

            // Check for Graveyard in name
            const hasGraveyardInName = name.toLowerCase().includes('graveyard');

            // Check if NFT is burnt (Graveyard NFTs are marked as burnt)
            const isBurnt = item.burnt === true;

            // Must have MidEvil collection AND NOT have Graveyard collection
            // ALSO exclude if name contains "Graveyard" OR if burnt
            return hasMidEvil && !hasGraveyard && !hasGraveyardInName && !isBurnt;
        });

        console.log(`✅ MidEvils: ${nfts.length}`);

        // Hide loading message
        loadingDiv.style.display = 'none';

        // Check if any NFTs found
        if (nfts.length === 0) {
            nftContainer.innerHTML = '<div class="empty-state">No MidEvil NFTs found in these wallets</div>';
            return;
        }

        // Store all NFTs for sorting
        allLoadedNFTs = nfts;

        // Sort NFTs by current sort option
        const sortedNFTs = sortNFTs(nfts, currentSortOption);

        // Group NFTs by collection
        const grouped = groupByCollection(sortedNFTs);

        // Display the grouped NFTs
        displayNFTs(grouped);

        // Build sort UI with all available traits
        buildSortUI(nfts);

    } catch (error) {
        // If something went wrong, show error message
        loadingDiv.style.display = 'none';
        console.error('Full error:', error);
        showError(`Error: ${error.message}. Check browser console (F12) for details. You may need to run a local server.`);
    } finally {
        // Re-enable the button
        fetchButton.disabled = false;
    }
}

// Function to sort NFTs based on selected criteria
function sortNFTs(nfts, sortBy) {
    if (sortBy === 'default') {
        // Return original order (no sorting)
        return nfts;
    }

    return [...nfts].sort((a, b) => {
        if (sortBy === 'number') {
            // Extract number from NFT name (e.g., "MidEvil #1234" -> 1234)
            const getNumber = (nft) => {
                const name = nft.content?.metadata?.name || '';
                const match = name.match(/#(\d+)/);
                return match ? parseInt(match[1]) : 999999;
            };
            return getNumber(a) - getNumber(b);
        }

        // For trait-based sorting (including background)
        const getTrait = (nft, traitType) => {
            const attributes = nft.content?.metadata?.attributes || [];
            const trait = attributes.find(attr =>
                attr.trait_type?.toLowerCase() === traitType.toLowerCase()
            );
            return trait?.value || 'zzz'; // Put NFTs without trait at the end
        };

        const valueA = getTrait(a, sortBy);
        const valueB = getTrait(b, sortBy);

        // Sort alphabetically
        return valueA.toString().localeCompare(valueB.toString());
    });
}

// Function to group NFTs by their collection
function groupByCollection(nfts) {
    const collections = {};

    nfts.forEach(nft => {
        // Get collection name from Helius DAS API response
        const collectionAddress = nft.grouping?.find(g => g.group_key === 'collection')?.group_value;

        // Use "MidEvils" as the display name
        const collectionName = 'MidEvils';

        // Create array for this collection if it doesn't exist
        if (!collections[collectionName]) {
            collections[collectionName] = [];
        }

        // Add NFT to its collection
        collections[collectionName].push(nft);
    });

    // Collections organized by name

    return collections;
}

// Function to apply sort and redisplay NFTs
function applySortAndDisplay() {
    if (allLoadedNFTs.length === 0) return;

    // Sort NFTs by current sort option
    const sortedNFTs = sortNFTs(allLoadedNFTs, currentSortOption);

    // Group NFTs by collection
    const grouped = groupByCollection(sortedNFTs);

    // Display the grouped NFTs
    displayNFTs(grouped);
}

// Function to build sort UI with all available traits
function buildSortUI(nfts) {
    const traits = extractTraits(nfts);

    // Get current selected value
    const currentValue = sortSelect.value;

    // Clear existing options except default, number, and background
    sortSelect.innerHTML = `
        <option value="default">Default Order</option>
        <option value="number">NFT Number</option>
        <option value="background">Background Color</option>
    `;

    // Add options for each trait type (exclude background since it's already added)
    Object.keys(traits).sort().forEach(traitType => {
        if (traitType.toLowerCase() !== 'background' && traitType.toLowerCase() !== 'background color') {
            const option = document.createElement('option');
            option.value = traitType;
            option.textContent = traitType;
            sortSelect.appendChild(option);
        }
    });

    // Restore selected value if it still exists
    if (currentValue && [...sortSelect.options].find(opt => opt.value === currentValue)) {
        sortSelect.value = currentValue;
    }

    // Show sort section
    sortSection.style.display = 'block';
}

// Function to display NFTs grouped by collection
function displayNFTs(collections) {
    // Clear container
    nftContainer.innerHTML = '';
    let displayedNFTs = [];

    // Loop through each collection
    Object.keys(collections).forEach(collectionName => {
        const nfts = collections[collectionName];

        // Store all NFTs for select all functionality
        displayedNFTs = displayedNFTs.concat(nfts);

        // Create collection section
        const collectionDiv = document.createElement('div');
        collectionDiv.className = 'collection';

        // Create collection header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'collection-header';
        headerDiv.innerHTML = `
            <div class="collection-name">${escapeHtml(collectionName)}</div>
            <div class="collection-count">${nfts.length} NFT${nfts.length > 1 ? 's' : ''}</div>
        `;

        // Create grid for NFTs
        const gridDiv = document.createElement('div');
        gridDiv.className = 'nft-grid';

        // Add each NFT to the grid
        nfts.forEach(nft => {
            const nftCard = createNFTCard(nft);
            gridDiv.appendChild(nftCard);
        });

        // Add header and grid to collection section
        collectionDiv.appendChild(headerDiv);
        collectionDiv.appendChild(gridDiv);

        // Add collection section to main container
        nftContainer.appendChild(collectionDiv);
    });

    // Show quick actions after NFTs are loaded
    if (allLoadedNFTs.length > 0) {
        quickActions.style.display = 'block';
        updateSelectAllButton();

        // Build filter UI based on loaded NFTs
        buildFilterUI(allLoadedNFTs);
    }
}

// Function to create an NFT card
function createNFTCard(nft) {
    const card = document.createElement('div');
    card.className = 'nft-card';
    card.dataset.nftId = nft.id;

    // Get NFT data from Helius DAS API format (with fallbacks if data is missing)
    const name = nft.content?.metadata?.name || 'Unnamed NFT';
    const imageUrl = nft.content?.links?.image ||
                     nft.content?.files?.[0]?.uri ||
                     nft.content?.json_uri || '';

    // Create a placeholder image as a data URL (inline SVG)
    const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';

    // Create checkbox for selection
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'nft-checkbox';
    checkbox.dataset.nftId = nft.id;

    // Create card HTML with lazy loading for images (removed description for performance)
    card.innerHTML = `
        <img class="nft-image" loading="lazy" src="${escapeHtml(imageUrl || placeholderImage)}" alt="${escapeHtml(name)}"
             onerror="this.src='${placeholderImage}'">
        <div class="nft-info">
            <div class="nft-name">${escapeHtml(name)}</div>
        </div>
    `;

    // Add checkbox to card
    card.insertBefore(checkbox, card.firstChild);

    // Store minimal NFT data on the card element
    card.nftData = {
        id: nft.id,
        name: name,
        imageUrl: imageUrl || placeholderImage
    };

    // Store original NFT object
    card.originalNft = nft;

    // Handle checkbox change
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleNFTSelection(nft.id, card, checkbox.checked);
    });

    // Click card to show details (but not when clicking checkbox)
    card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
            showNFTDetails(nft);
        }
    });

    return card;
}

// Function to show error messages
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Function to escape HTML to prevent security issues
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to toggle NFT selection
function toggleNFTSelection(nftId, card, isSelected) {
    if (isSelected) {
        // Add to selected array
        selectedNFTsArray.push(card.nftData);
        card.classList.add('selected');
    } else {
        // Remove from array
        selectedNFTsArray = selectedNFTsArray.filter(nft => nft.id !== nftId);
        card.classList.remove('selected');
    }
    updateSelectionUI();
    updateSelectAllButton();
}

// Function to update the selection UI
function updateSelectionUI() {
    const count = selectedNFTsArray.length;
    selectedCountSpan.textContent = `${count} NFT${count !== 1 ? 's' : ''} selected`;

    // Show/hide selection controls
    if (count > 0) {
        selectionControls.style.display = 'flex';
        createCollageBtn.disabled = false;
    } else {
        selectionControls.style.display = 'none';
        createCollageBtn.disabled = true;
    }
}

// Function to clear all selections
function clearSelection() {
    selectedNFTsArray = [];

    // Uncheck all checkboxes and remove selected class
    document.querySelectorAll('.nft-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('.nft-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    updateSelectionUI();
    updateSelectAllButton();
}

// Function to toggle select all NFTs
function toggleSelectAll() {
    // Get all visible (non-filtered) cards
    const allCards = document.querySelectorAll('.nft-card');
    const visibleCards = Array.from(allCards).filter(card => card.style.display !== 'none');
    const visibleNFTIds = new Set(visibleCards.map(card => card.dataset.nftId));

    // Check if all visible NFTs are selected
    const allVisibleSelected = visibleCards.length > 0 &&
        visibleCards.every(card => card.classList.contains('selected'));

    if (allVisibleSelected) {
        // Deselect all visible NFTs
        selectedNFTsArray = selectedNFTsArray.filter(nft => !visibleNFTIds.has(nft.id));

        visibleCards.forEach(card => {
            const checkbox = card.querySelector('.nft-checkbox');
            if (checkbox) checkbox.checked = false;
            card.classList.remove('selected');
        });
    } else {
        // Select all visible NFTs (only those that aren't already selected)
        visibleCards.forEach(card => {
            const nftId = card.dataset.nftId;
            const nft = card.originalNft;

            // Only add if not already selected
            if (!selectedNFTsArray.some(selected => selected.id === nftId)) {
                const imageUrl = nft.content?.links?.image ||
                               nft.content?.files?.[0]?.uri ||
                               nft.content?.json_uri || '';
                const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';

                selectedNFTsArray.push({
                    id: nft.id,
                    name: nft.content?.metadata?.name || 'Unnamed NFT',
                    imageUrl: imageUrl || placeholderImage
                });
            }

            const checkbox = card.querySelector('.nft-checkbox');
            if (checkbox) checkbox.checked = true;
            card.classList.add('selected');
        });
    }

    updateSelectionUI();
    updateSelectAllButton();
}

// Function to update the select all button text and style
function updateSelectAllButton() {
    // Get all visible (non-filtered) cards
    const allCards = document.querySelectorAll('.nft-card');
    const visibleCards = Array.from(allCards).filter(card => card.style.display !== 'none');

    // Check if all visible NFTs are selected
    const allVisibleSelected = visibleCards.length > 0 &&
        visibleCards.every(card => card.classList.contains('selected'));

    if (allVisibleSelected) {
        selectAllBtn.textContent = 'Deselect All Visible';
        selectAllBtn.classList.add('deselect');
    } else {
        selectAllBtn.textContent = 'Select All Visible';
        selectAllBtn.classList.remove('deselect');
    }
}

// Function to create collage from selected NFTs
async function createCollage() {
    if (selectedNFTsArray.length === 0) {
        alert('Please select at least one NFT to create a collage');
        return;
    }

    // Reset and store only real NFTs (no empty placeholders from previous previews)
    previewNFTArray = [...selectedNFTsArray];

    // Assign montage sizes to each NFT (persists through reordering)
    montageSizeAssignments.clear();
    const sizes = generateMontageSizes(previewNFTArray.length);
    previewNFTArray.forEach((nft, index) => {
        montageSizeAssignments.set(nft.id, sizes[index]?.size || 1);
    });

    // Show preview modal with draggable grid
    showPreview();
}

// Function to generate collage canvas from NFT array
async function generateCollageCanvas(nftArray) {
    // Calculate grid dimensions based on selected layout
    const nftCount = nftArray.length;
    const selectedLayout = layoutSelect.value;
    const gap = parseInt(spacingSlider.value); // Space between NFTs from slider

    // Handle montage layout differently
    if (selectedLayout === 'montage') {
        return await generateMontageCanvas(nftArray, gap);
    }

    const { cols, rows } = calculateGridDimensions(nftCount, selectedLayout);

    // Set canvas size (270x270 per NFT) with gaps between them
    const nftSize = 270;
    const canvasWidth = (cols * nftSize) + ((cols + 1) * gap);
    const canvasHeight = (rows * nftSize) + ((rows + 1) * gap);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Fill background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Load images with better error handling
    await Promise.all(nftArray.map((nft, index) => {
        return new Promise((resolve) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = gap + (col * (nftSize + gap));
            const y = gap + (row * (nftSize + gap));

            function drawPlaceholder() {
                // Leave blank - just white background, no placeholder image
                // Optionally draw a subtle border to show the grid spot
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, nftSize, nftSize);
            }

            const img = new Image();
            img.crossOrigin = 'anonymous'; // Enable CORS

            img.onload = () => {
                try {
                    // Draw image
                    ctx.drawImage(img, x, y, nftSize, nftSize);

                    // Draw border
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, nftSize, nftSize);

                    resolve();
                } catch (e) {
                    console.error('Error drawing image:', e);
                    drawPlaceholder();
                    resolve();
                }
            };

            img.onerror = (e) => {
                console.warn('Failed to load image:', nft.imageUrl, e);
                drawPlaceholder();
                resolve();
            };

            // Start loading
            img.src = nft.imageUrl;
        });
    }));

    return canvas;
}

// Function to generate montage canvas with mixed sizes
async function generateMontageCanvas(nftArray, gap) {
    const nftCount = nftArray.length;
    const baseSize = 270; // Base size for 1x1 NFTs

    // Get sizes from stored assignments (persists through reordering)
    const nftSizes = nftArray.map(nft => ({
        size: montageSizeAssignments.get(nft.id) || 1
    }));

    // Calculate columns based on total cells needed
    let totalCells = 0;
    nftSizes.forEach(s => { totalCells += s.size * s.size; });
    let cols = Math.ceil(Math.sqrt(totalCells * 1.5));
    cols = Math.max(cols, 3);

    // Create a grid to track occupied cells
    const maxRows = Math.ceil(nftCount * 2); // Generous estimate
    const grid = Array(maxRows).fill(null).map(() => Array(cols).fill(false));

    // Calculate positions for each NFT
    const positions = [];

    for (let i = 0; i < nftArray.length; i++) {
        const size = nftSizes[i]?.size || 1;
        const cellsNeeded = size;

        // Find next available position
        let placed = false;
        for (let row = 0; row < maxRows && !placed; row++) {
            for (let col = 0; col <= cols - cellsNeeded && !placed; col++) {
                // Check if all required cells are free
                let canPlace = true;
                for (let dr = 0; dr < cellsNeeded && canPlace; dr++) {
                    for (let dc = 0; dc < cellsNeeded && canPlace; dc++) {
                        if (grid[row + dr]?.[col + dc]) {
                            canPlace = false;
                        }
                    }
                }

                if (canPlace) {
                    // Mark cells as occupied
                    for (let dr = 0; dr < cellsNeeded; dr++) {
                        for (let dc = 0; dc < cellsNeeded; dc++) {
                            grid[row + dr][col + dc] = true;
                        }
                    }

                    positions.push({
                        nft: nftArray[i],
                        col: col,
                        row: row,
                        size: cellsNeeded
                    });
                    placed = true;
                }
            }
        }
    }

    // Calculate actual bounds (trim empty rows/cols to ensure NFTs on all edges)
    let minCol = cols, maxCol = 0, minRow = maxRows, maxRow = 0;
    positions.forEach(p => {
        minCol = Math.min(minCol, p.col);
        maxCol = Math.max(maxCol, p.col + p.size - 1);
        minRow = Math.min(minRow, p.row);
        maxRow = Math.max(maxRow, p.row + p.size - 1);
    });

    // Find which rows and columns have at least one NFT
    const rowsWithNFTs = new Set();
    const colsWithNFTs = new Set();
    positions.forEach(p => {
        for (let dr = 0; dr < p.size; dr++) {
            rowsWithNFTs.add(p.row + dr);
        }
        for (let dc = 0; dc < p.size; dc++) {
            colsWithNFTs.add(p.col + dc);
        }
    });

    // Only fill empty cells in rows/columns that have NFTs (not entire empty rows/cols)
    for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
            if (!grid[row][col] && rowsWithNFTs.has(row) && colsWithNFTs.has(col)) {
                positions.push({
                    nft: { imageUrl: PLACEHOLDER_IMAGE, isPlaceholder: true },
                    col: col,
                    row: row,
                    size: 1
                });
                grid[row][col] = true;
            }
        }
    }

    // Adjust positions to start from 0,0
    positions.forEach(p => {
        p.col -= minCol;
        p.row -= minRow;
    });

    // Calculate trimmed dimensions
    const actualCols = maxCol - minCol + 1;
    const actualRows = maxRow - minRow + 1;

    // Calculate canvas dimensions based on trimmed grid
    const canvasWidth = (actualCols * baseSize) + ((actualCols + 1) * gap);
    const canvasHeight = (actualRows * baseSize) + ((actualRows + 1) * gap);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Fill background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw all NFTs
    await Promise.all(positions.map((pos) => {
        return new Promise((resolve) => {
            const pixelSize = pos.size * baseSize + (pos.size - 1) * gap;
            const x = gap + (pos.col * (baseSize + gap));
            const y = gap + (pos.row * (baseSize + gap));

            function drawPlaceholder() {
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, pixelSize, pixelSize);
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    ctx.drawImage(img, x, y, pixelSize, pixelSize);
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, pixelSize, pixelSize);
                    resolve();
                } catch (e) {
                    console.error('Error drawing image:', e);
                    drawPlaceholder();
                    resolve();
                }
            };

            img.onerror = (e) => {
                console.warn('Failed to load image:', pos.nft.imageUrl, e);
                drawPlaceholder();
                resolve();
            };

            img.src = pos.nft.imageUrl;
        });
    }));

    return canvas;
}

// Function to show preview modal
function showPreview() {
    const previewGrid = document.getElementById('previewGrid');
    previewGrid.innerHTML = '';

    // Calculate grid dimensions based on selected layout
    const nftCount = previewNFTArray.length;
    const selectedLayout = layoutSelect.value;

    // Get spacing from slider
    const gridGap = parseInt(spacingSlider.value);
    const previewBodyPadding = 40; // 20px each side

    // Handle montage layout differently
    if (selectedLayout === 'montage') {
        // Get sizes from stored assignments (persists through reordering)
        const nftSizes = previewNFTArray.map(nft => ({
            size: montageSizeAssignments.get(nft.id) || 1
        }));

        // Calculate columns based on total cells needed
        let totalCells = 0;
        nftSizes.forEach(s => { totalCells += s.size * s.size; });
        let cols = Math.ceil(Math.sqrt(totalCells * 1.5));
        cols = Math.max(cols, 3);

        // Calculate positions same as canvas generation
        const maxRows = Math.ceil(nftCount * 2);
        const grid = Array(maxRows).fill(null).map(() => Array(cols).fill(false));
        const positions = [];

        for (let i = 0; i < previewNFTArray.length; i++) {
            const size = nftSizes[i]?.size || 1;
            let placed = false;
            for (let row = 0; row < maxRows && !placed; row++) {
                for (let col = 0; col <= cols - size && !placed; col++) {
                    let canPlace = true;
                    for (let dr = 0; dr < size && canPlace; dr++) {
                        for (let dc = 0; dc < size && canPlace; dc++) {
                            if (grid[row + dr]?.[col + dc]) canPlace = false;
                        }
                    }
                    if (canPlace) {
                        for (let dr = 0; dr < size; dr++) {
                            for (let dc = 0; dc < size; dc++) {
                                grid[row + dr][col + dc] = true;
                            }
                        }
                        positions.push({ nft: previewNFTArray[i], col, row, size, index: i });
                        placed = true;
                    }
                }
            }
        }

        // Calculate trimmed bounds
        let minCol = cols, maxCol = 0, minRow = maxRows, maxRow = 0;
        positions.forEach(p => {
            minCol = Math.min(minCol, p.col);
            maxCol = Math.max(maxCol, p.col + p.size - 1);
            minRow = Math.min(minRow, p.row);
            maxRow = Math.max(maxRow, p.row + p.size - 1);
        });

        const actualCols = maxCol - minCol + 1;
        const actualRows = maxRow - minRow + 1;

        // Find which rows and columns have at least one NFT
        const rowsWithNFTs = new Set();
        const colsWithNFTs = new Set();
        positions.forEach(p => {
            for (let dr = 0; dr < p.size; dr++) {
                rowsWithNFTs.add(p.row + dr);
            }
            for (let dc = 0; dc < p.size; dc++) {
                colsWithNFTs.add(p.col + dc);
            }
        });

        // Only fill empty cells in rows/columns that have NFTs (not entire empty rows/cols)
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (!grid[row][col] && rowsWithNFTs.has(row) && colsWithNFTs.has(col)) {
                    // Create placeholder for this empty cell
                    const placeholder = createPlaceholder();
                    previewNFTArray.push(placeholder);
                    montageSizeAssignments.set(placeholder.id, 1);
                    positions.push({
                        nft: placeholder,
                        col: col,
                        row: row,
                        size: 1,
                        index: previewNFTArray.length - 1
                    });
                    grid[row][col] = true;
                }
            }
        }

        const previewGridPadding = gridGap * 2;
        // Account for modal padding, body padding, grid padding, and some extra margin
        const totalHorizontalPadding = 40 + previewBodyPadding + previewGridPadding + 40;
        const maxContentWidth = (window.innerWidth * 0.9) - totalHorizontalPadding;
        const availableForItems = maxContentWidth - (gridGap * (actualCols - 1));
        const calculatedItemSize = Math.floor(availableForItems / actualCols);
        // Ensure minimum size of 60px, max of 150px for montage
        const itemSize = Math.max(60, Math.min(calculatedItemSize, 150));

        // Set grid template for montage with trimmed dimensions
        previewGrid.style.gap = `${gridGap}px`;
        previewGrid.style.padding = `${gridGap}px`;
        previewGrid.style.gridTemplateColumns = `repeat(${actualCols}, ${itemSize}px)`;
        previewGrid.style.gridTemplateRows = `repeat(${actualRows}, ${itemSize}px)`;

        // Create grid items with explicit positioning
        positions.forEach((pos) => {
            const item = document.createElement('div');
            item.className = 'preview-grid-item';
            if (pos.nft.isPlaceholder) {
                item.classList.add('placeholder-item');
            }
            item.draggable = true;
            item.dataset.index = pos.index;

            // Position in trimmed grid
            const adjustedCol = pos.col - minCol + 1;
            const adjustedRow = pos.row - minRow + 1;

            item.style.gridColumn = `${adjustedCol} / span ${pos.size}`;
            item.style.gridRow = `${adjustedRow} / span ${pos.size}`;

            const img = document.createElement('img');
            img.src = pos.nft.imageUrl;
            img.alt = pos.nft.name;

            item.appendChild(img);

            // Drag and drop event listeners
            item.addEventListener('dragstart', handlePreviewDragStart);
            item.addEventListener('dragend', handlePreviewDragEnd);
            item.addEventListener('dragover', handlePreviewDragOver);
            item.addEventListener('dragenter', handlePreviewDragEnter);
            item.addEventListener('dragleave', handlePreviewDragLeave);
            item.addEventListener('drop', handlePreviewDrop);

            previewGrid.appendChild(item);
        });
    } else {
        // Standard grid layout
        const { cols } = calculateGridDimensions(nftCount, selectedLayout);

        // Add placeholders only to complete the last row (not entire empty rows)
        const nftsInLastRow = previewNFTArray.length % cols;
        if (nftsInLastRow > 0) {
            const placeholdersNeeded = cols - nftsInLastRow;
            for (let i = 0; i < placeholdersNeeded; i++) {
                const placeholder = createPlaceholder();
                previewNFTArray.push(placeholder);
                montageSizeAssignments.set(placeholder.id, 1);
            }
        }

        // Calculate actual rows based on content
        const actualRows = Math.ceil(previewNFTArray.length / cols);

        const previewGridPadding = gridGap * 2;
        // Account for modal padding, body padding, grid padding, and some extra margin
        const totalHorizontalPadding = 40 + previewBodyPadding + previewGridPadding + 40;
        const maxContentWidth = (window.innerWidth * 0.9) - totalHorizontalPadding;
        const availableForItems = maxContentWidth - (gridGap * (cols - 1));
        const calculatedItemSize = Math.floor(availableForItems / cols);
        // Ensure minimum size of 60px, max of 200px
        const itemSize = Math.max(60, Math.min(calculatedItemSize, 200));

        // Set grid template with dynamic gap and border padding
        previewGrid.style.gap = `${gridGap}px`;
        previewGrid.style.padding = `${gridGap}px`;
        previewGrid.style.gridTemplateColumns = `repeat(${cols}, ${itemSize}px)`;
        previewGrid.style.gridTemplateRows = `repeat(${actualRows}, ${itemSize}px)`;

        // Create grid items for NFTs and placeholders
        previewNFTArray.forEach((nft, index) => {
            const item = document.createElement('div');
            item.className = 'preview-grid-item';
            if (nft.isPlaceholder) {
                item.classList.add('placeholder-item');
            }
            item.draggable = true;
            item.dataset.index = index;

            // Reset any montage styles
            item.style.gridColumn = '';
            item.style.gridRow = '';

            const img = document.createElement('img');
            img.src = nft.imageUrl;
            img.alt = nft.name;

            item.appendChild(img);

            // Drag and drop event listeners
            item.addEventListener('dragstart', handlePreviewDragStart);
            item.addEventListener('dragend', handlePreviewDragEnd);
            item.addEventListener('dragover', handlePreviewDragOver);
            item.addEventListener('dragenter', handlePreviewDragEnter);
            item.addEventListener('dragleave', handlePreviewDragLeave);
            item.addEventListener('drop', handlePreviewDrop);

            previewGrid.appendChild(item);
        });
    }

    // Show modal
    previewModal.style.display = 'flex';
}

// Preview drag and drop handlers
let previewDraggedItem = null;

function handlePreviewDragStart(e) {
    previewDraggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handlePreviewDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.preview-grid-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    previewDraggedItem = null;
}

function handlePreviewDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handlePreviewDragEnter(e) {
    if (this !== previewDraggedItem) {
        this.classList.add('drag-over');
    }
}

function handlePreviewDragLeave(e) {
    this.classList.remove('drag-over');
}

function handlePreviewDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    this.classList.remove('drag-over');

    if (previewDraggedItem && previewDraggedItem !== this) {
        const fromIndex = parseInt(previewDraggedItem.dataset.index);
        const toIndex = parseInt(this.dataset.index);

        const fromNFT = previewNFTArray[fromIndex];
        const toNFT = previewNFTArray[toIndex];

        // For montage layout, swap the size assignments
        if (layoutSelect.value === 'montage') {
            const fromSize = montageSizeAssignments.get(fromNFT.id);
            const toSize = montageSizeAssignments.get(toNFT.id);
            montageSizeAssignments.set(fromNFT.id, toSize);
            montageSizeAssignments.set(toNFT.id, fromSize);
        }

        // Swap the NFTs in the array (true swap, not insert)
        previewNFTArray[fromIndex] = toNFT;
        previewNFTArray[toIndex] = fromNFT;

        // Refresh the preview grid
        showPreview();
    }

    return false;
}

// Function to close preview modal
function closePreview() {
    previewModal.style.display = 'none';
    document.getElementById('previewGrid').innerHTML = '';
    currentCollageCanvas = null;
    // Clear preview array and montage size assignments
    previewNFTArray = [];
    montageSizeAssignments.clear();
}

// Function to download the collage
async function downloadCollage() {
    if (previewNFTArray.length === 0) {
        alert('No collage to download');
        return;
    }

    // Show loading state
    const originalText = downloadCollageBtn.textContent;
    downloadCollageBtn.textContent = 'Generating PNG (this may take a moment)...';
    downloadCollageBtn.disabled = true;

    try {
        // Include all items (NFTs and placeholders) in the collage
        const allItems = [...previewNFTArray];

        if (allItems.length === 0) {
            alert('No items to create collage');
            downloadCollageBtn.textContent = originalText;
            downloadCollageBtn.disabled = false;
            return;
        }

        // Add a small delay to ensure all images are loaded
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate the final collage canvas from current order (without empty spots)
        const canvas = await generateCollageCanvas(allItems);

        // Download the canvas
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `midevil-collage-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Close the preview after download
            closePreview();

            alert(`Collage downloaded successfully! Note: Some images may appear blank due to server restrictions.`);
        }, 'image/png');
    } catch (error) {
        console.error('Error generating collage:', error);
        alert('Error generating collage for download. Some NFT images may not be accessible.');
    } finally {
        downloadCollageBtn.textContent = originalText;
        downloadCollageBtn.disabled = false;
    }
}

// Function to show NFT details modal
function showNFTDetails(nft) {
    // Get NFT information
    const name = nft.content?.metadata?.name || 'Unnamed NFT';
    const description = nft.content?.metadata?.description || 'No description available';
    const imageUrl = nft.content?.links?.image ||
                     nft.content?.files?.[0]?.uri ||
                     nft.content?.json_uri || '';
    const attributes = nft.content?.metadata?.attributes || [];

    // Populate modal
    document.getElementById('nftDetailsName').textContent = name;
    document.getElementById('nftDetailsDescription').textContent = description;
    document.getElementById('nftDetailsMint').textContent = nft.id;
    document.getElementById('nftDetailsImage').src = imageUrl;

    // Populate traits
    const traitsContainer = document.getElementById('nftDetailsTraits');
    traitsContainer.innerHTML = '';

    if (attributes && attributes.length > 0) {
        attributes.forEach(attr => {
            const traitDiv = document.createElement('div');
            traitDiv.className = 'trait-item';
            traitDiv.innerHTML = `
                <div class="trait-type">${escapeHtml(attr.trait_type || 'Trait')}</div>
                <div class="trait-value">${escapeHtml(attr.value || 'N/A')}</div>
            `;
            traitsContainer.appendChild(traitDiv);
        });
    } else {
        traitsContainer.innerHTML = '<p class="no-traits">No traits available</p>';
    }

    // Show modal
    nftDetailsModal.style.display = 'flex';
}

// Function to close NFT details modal
function closeNFTDetails() {
    nftDetailsModal.style.display = 'none';
}

// Function to extract all unique traits from NFTs
function extractTraits(nfts) {
    const traitMap = {};

    nfts.forEach(nft => {
        const attributes = nft.content?.metadata?.attributes || [];
        attributes.forEach(attr => {
            const traitType = attr.trait_type;
            const traitValue = attr.value;

            if (traitType && traitValue) {
                if (!traitMap[traitType]) {
                    traitMap[traitType] = new Set();
                }
                traitMap[traitType].add(traitValue);
            }
        });
    });

    // Convert Sets to sorted arrays
    const traits = {};
    Object.keys(traitMap).forEach(traitType => {
        traits[traitType] = Array.from(traitMap[traitType]).sort();
    });

    return traits;
}

// Function to build filter UI
function buildFilterUI(nfts) {
    const traits = extractTraits(nfts);
    filterControls.innerHTML = '';
    activeFilters = {};

    // Create a dropdown for each trait type
    Object.keys(traits).sort().forEach(traitType => {
        const filterGroup = document.createElement('div');
        filterGroup.className = 'filter-group';

        const label = document.createElement('label');
        label.textContent = traitType;
        label.htmlFor = `filter-${traitType}`;

        const select = document.createElement('select');
        select.id = `filter-${traitType}`;
        select.dataset.traitType = traitType;

        // Add "All" option
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All';
        select.appendChild(allOption);

        // Add options for each trait value
        traits[traitType].forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

        // Add change event listener
        select.addEventListener('change', (e) => {
            const traitType = e.target.dataset.traitType;
            const value = e.target.value;

            if (value) {
                activeFilters[traitType] = value;
            } else {
                delete activeFilters[traitType];
            }

            applyFilters();
        });

        filterGroup.appendChild(label);
        filterGroup.appendChild(select);
        filterControls.appendChild(filterGroup);
    });

    // Show filter section if there are traits
    if (Object.keys(traits).length > 0) {
        filterSection.style.display = 'block';
    }
}

// Function to apply filters
function applyFilters() {
    const nftCards = document.querySelectorAll('.nft-card');
    const totalCount = nftCards.length;
    let visibleCount = 0;

    nftCards.forEach(card => {
        const nft = card.originalNft;
        const attributes = nft.content?.metadata?.attributes || [];

        // Check if NFT matches all active filters
        let matches = true;

        // Check trait filters
        for (const [traitType, traitValue] of Object.entries(activeFilters)) {
            const hasMatchingTrait = attributes.some(
                attr => attr.trait_type === traitType && attr.value === traitValue
            );

            if (!hasMatchingTrait) {
                matches = false;
                break;
            }
        }

        // Check training filter (frozen = training/staked)
        if (matches && trainingFilter !== 'all') {
            const isFrozen = nft.ownership?.frozen === true;
            if (trainingFilter === 'training' && !isFrozen) {
                matches = false;
            } else if (trainingFilter === 'not-training' && isFrozen) {
                matches = false;
            }
        }

        // Check race filter (Orcs only)
        if (matches && raceFilter === 'orc') {
            const name = nft.content?.metadata?.name || '';
            const raceTrait = attributes.find(attr =>
                attr.trait_type?.toLowerCase() === 'race' ||
                attr.trait_type?.toLowerCase() === 'species' ||
                attr.trait_type?.toLowerCase() === 'type'
            );
            const isOrc = name.toLowerCase().includes('orc') ||
                         (raceTrait && raceTrait.value?.toLowerCase().includes('orc'));
            if (!isOrc) {
                matches = false;
            }
        }

        // Show or hide the card
        if (matches) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Update the collection count display
    const collectionCountEl = document.querySelector('.collection-count');
    if (collectionCountEl) {
        if (visibleCount === totalCount) {
            collectionCountEl.textContent = `${totalCount} NFT${totalCount !== 1 ? 's' : ''}`;
        } else {
            collectionCountEl.textContent = `${visibleCount} of ${totalCount} NFTs`;
        }
    }

    // Update the select all button to reflect filtered state
    updateSelectAllButton();
}

// Function to clear all filters
function clearAllFilters() {
    activeFilters = {};
    trainingFilter = 'all';
    raceFilter = 'all';

    // Reset all dropdowns to "All"
    const selects = filterControls.querySelectorAll('select');
    selects.forEach(select => {
        select.value = '';
    });

    // Reset training filter dropdown
    trainingFilterSelect.value = 'all';

    // Reset race filter dropdown
    raceFilterSelect.value = 'all';

    // Show all NFT cards
    const nftCards = document.querySelectorAll('.nft-card');
    nftCards.forEach(card => {
        card.style.display = '';
    });

    // Reset the collection count display
    const totalCount = nftCards.length;
    const collectionCountEl = document.querySelector('.collection-count');
    if (collectionCountEl) {
        collectionCountEl.textContent = `${totalCount} NFT${totalCount !== 1 ? 's' : ''}`;
    }

    // Update the select all button
    updateSelectAllButton();
}
