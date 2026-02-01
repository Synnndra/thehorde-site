// Orc NFT Viewer - The Horde

// ============================================
// SECURITY - HTML ESCAPE
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ============================================
// CONFIGURATION
// ============================================
const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
const PLACEHOLDER_IMAGE = '/orclogo.jpg';

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    totalCount: document.getElementById('totalCount'),
    sortSelect: document.getElementById('sortSelect'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    sidebar: document.getElementById('sidebar'),
    filterToggle: document.getElementById('filterToggle'),
    filterGroups: document.getElementById('filterGroups'),
    activeFilters: document.getElementById('activeFilters'),
    clearFilters: document.getElementById('clearFilters'),
    nftGrid: document.getElementById('nftGrid'),
    detailsModal: document.getElementById('detailsModal'),
    closeDetails: document.getElementById('closeDetails'),
    detailsTitle: document.getElementById('detailsTitle'),
    detailsImage: document.getElementById('detailsImage'),
    detailsRarity: document.getElementById('detailsRarity'),
    detailsTraits: document.getElementById('detailsTraits'),
    detailsMint: document.getElementById('detailsMint')
};

// ============================================
// STATE
// ============================================
let allNFTs = [];
let filteredNFTs = [];
let activeFilters = {};
let traitCounts = {};

// ============================================
// EVENT LISTENERS
// ============================================
elements.filterToggle.addEventListener('click', toggleSidebar);
elements.clearFilters.addEventListener('click', clearFilters);
elements.sortSelect.addEventListener('change', applySort);
elements.searchBtn.addEventListener('click', searchById);
elements.searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') searchById();
});

elements.closeDetails.addEventListener('click', closeDetails);

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
    if (elements.sidebar.classList.contains('open') &&
        !elements.sidebar.contains(e.target) &&
        !elements.filterToggle.contains(e.target)) {
        elements.sidebar.classList.remove('open');
    }
});

// ============================================
// API FUNCTIONS
// ============================================
async function fetchCollection() {
    showLoading(true);
    hideError();
    allNFTs = [];
    filteredNFTs = [];
    activeFilters = {};

    try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch('/api/helius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: MIDEVIL_COLLECTION, page })
            });

            if (!response.ok) throw new Error('API request failed');

            const data = await response.json();
            const items = data.items || [];

            items.forEach(nft => {
                const name = nft.content?.metadata?.name || '';
                const isBurnt = nft.burnt === true;
                const traits = extractTraits(nft.content?.metadata?.attributes || []);

                // Skip burnt NFTs and graveyard NFTs
                if (isBurnt || name.toLowerCase().includes('graveyard')) {
                    return;
                }

                // Only include Orcs - check if name contains "Orc"
                const isOrc = name.toLowerCase().includes('orc');

                if (!isOrc) {
                    return; // Skip non-Orcs
                }

                const number = extractNumber(name);
                const displayName = name;

                allNFTs.push({
                    id: nft.id,
                    name: displayName,
                    number: number,
                    imageUrl: getImageUrl(nft),
                    traits: traits,
                    mint: nft.id
                });
            });

            hasMore = items.length === 1000;
            page++;
        }

        if (allNFTs.length === 0) {
            showError('No Orcs found in the collection');
            showLoading(false);
            return;
        }

        elements.totalCount.textContent = `${allNFTs.length} Orcs`;
        setupFilters();
        calculateRarity();
        applySort();
    } catch (err) {
        showError('Failed to summon The Horde: ' + err.message);
    }

    showLoading(false);
}

function extractNumber(name) {
    const match = name?.match(/#?(\d+)/);
    return match ? parseInt(match[1]) + 1 : 0;
}

function getImageUrl(nft) {
    const links = nft.content?.links || {};
    const files = nft.content?.files || [];

    if (links.image) {
        return links.image;
    }

    if (files.length > 0) {
        return files[0].uri || files[0].cdn_uri || '';
    }

    return PLACEHOLDER_IMAGE;
}

function extractTraits(attributes) {
    const traits = {};
    attributes.forEach(attr => {
        if (attr.trait_type && attr.value) {
            traits[attr.trait_type] = attr.value;
        }
    });
    return traits;
}

// ============================================
// RARITY CALCULATION
// ============================================
function calculateRarity() {
    const total = allNFTs.length;

    // Trait weights for rarity calculation
    const traitWeights = { headwear: 4, background: 2, clothing: 1, skin: 1.5, eyewear: 0.75 };

    // Step 1: Rank each trait category individually
    // For each trait type, rank orcs by how rare their value is (rarer = lower rank)
    const traitTypes = Object.keys(traitCounts);
    const traitRanks = {}; // nft.id -> { traitType: rank }

    allNFTs.forEach(nft => { traitRanks[nft.id] = {}; });

    traitTypes.forEach(type => {
        // Score each orc by this trait's rarity (rarer = higher score)
        const scored = allNFTs.map(nft => ({
            nft,
            traitScore: traitCounts[type]?.[nft.traits[type]]
                ? total / traitCounts[type][nft.traits[type]]
                : 0
        }));
        scored.sort((a, b) => b.traitScore - a.traitScore);
        scored.forEach((entry, index) => {
            traitRanks[entry.nft.id][type] = index + 1;
        });
    });

    // Step 2: Combine per-trait ranks into a weighted overall score
    // Lower combined rank = rarer, so we invert at the end
    allNFTs.forEach(nft => {
        let weightedRankSum = 0;
        traitTypes.forEach(type => {
            const weight = traitWeights[type.toLowerCase()] || 1;
            weightedRankSum += weight * traitRanks[nft.id][type];
        });
        // Lower rank sum = rarer, so invert for scoring (higher score = rarer)
        nft.rarityScore = 1 / weightedRankSum;
    });

    // Sort by score descending and assign ranks
    // Force top 4 in fixed order, then rank the rest by score
    const RANK_OVERRIDES = [328, 265, 212, 233];
    const getMetaNum = nft => parseInt(nft.name?.match(/#(\d+)/)?.[1]);

    const overrideNFTs = RANK_OVERRIDES.map(num => allNFTs.find(nft => getMetaNum(nft) === num)).filter(Boolean);
    const rest = [...allNFTs].filter(nft => !RANK_OVERRIDES.includes(getMetaNum(nft))).sort((a, b) => b.rarityScore - a.rarityScore);
    const sorted = [...overrideNFTs, ...rest];
    sorted.forEach((nft, index) => {
        nft.rarityRank = index + 1;
    });

    // Assign tier based on rank, exactly 10 legendary
    allNFTs.forEach(nft => {
        if (nft.rarityRank <= 10) {
            nft.rarityTier = 'legendary';
        } else if (nft.rarityRank <= 40) {
            nft.rarityTier = 'epic';
        } else if (nft.rarityRank <= 115) {
            nft.rarityTier = 'rare';
        } else {
            nft.rarityTier = 'common';
        }
    });
}

function getTierLabel(tier) {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ============================================
// UI FUNCTIONS
// ============================================
function showLoading(show) {
    elements.loading.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    elements.error.textContent = message;
    elements.error.style.display = 'block';
}

function hideError() {
    elements.error.style.display = 'none';
}

function toggleSidebar() {
    elements.sidebar.classList.toggle('open');
}

function searchById() {
    const query = elements.searchInput.value.trim();

    if (!query) {
        filteredNFTs = Object.keys(activeFilters).length > 0
            ? allNFTs.filter(nft => Object.entries(activeFilters).every(([type, values]) => values.includes(nft.traits[type])))
            : [...allNFTs];
        applySort();
        return;
    }

    const searchNum = parseInt(query.replace(/[^0-9]/g, ''));

    if (isNaN(searchNum)) {
        return;
    }

    const found = allNFTs.filter(nft => nft.number === searchNum);

    if (found.length > 0) {
        filteredNFTs = found;
        renderNFTs();
    } else {
        elements.nftGrid.innerHTML = '<div class="no-results">No Orc found with ID #' + escapeHtml(String(searchNum)) + '</div>';
    }
}

// ============================================
// FILTERS
// ============================================
function setupFilters() {
    traitCounts = {};
    allNFTs.forEach(nft => {
        Object.entries(nft.traits).forEach(([type, value]) => {
            if (!traitCounts[type]) traitCounts[type] = {};
            traitCounts[type][value] = (traitCounts[type][value] || 0) + 1;
        });
    });

    elements.filterGroups.innerHTML = '';

    Object.entries(traitCounts).forEach(([traitType, values]) => {
        const sortedValues = Object.entries(values).sort((a, b) => a[0].localeCompare(b[0]));

        const group = document.createElement('div');
        group.className = 'filter-group';
        group.innerHTML = `
            <div class="filter-group-header" data-trait="${escapeHtml(traitType)}">
                <h3>${escapeHtml(traitType)}</h3>
                <span class="chevron">+</span>
            </div>
            <div class="filter-options" style="display: none;">
                ${sortedValues.map(([value, count]) => `
                    <label class="filter-option" data-trait="${escapeHtml(traitType)}" data-value="${escapeHtml(value)}">
                        <input type="checkbox" class="filter-checkbox">
                        <span class="filter-value">${escapeHtml(value)}</span>
                        <span class="count">${count}</span>
                    </label>
                `).join('')}
            </div>
        `;

        group.querySelector('.filter-group-header').addEventListener('click', () => {
            const options = group.querySelector('.filter-options');
            const chevron = group.querySelector('.chevron');
            const isHidden = options.style.display === 'none';
            options.style.display = isHidden ? 'flex' : 'none';
            chevron.textContent = isHidden ? '−' : '+';
        });

        group.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const option = checkbox.closest('.filter-option');
                const trait = option.dataset.trait;
                const value = option.dataset.value;

                if (!activeFilters[trait]) {
                    activeFilters[trait] = [];
                }

                if (checkbox.checked) {
                    activeFilters[trait].push(value);
                } else {
                    activeFilters[trait] = activeFilters[trait].filter(v => v !== value);
                    if (activeFilters[trait].length === 0) {
                        delete activeFilters[trait];
                    }
                }

                applyFilters();
            });
        });

        elements.filterGroups.appendChild(group);
    });
}

function applyFilters() {
    if (Object.keys(activeFilters).length === 0) {
        filteredNFTs = [...allNFTs];
    } else {
        filteredNFTs = allNFTs.filter(nft => {
            return Object.entries(activeFilters).every(([type, values]) =>
                values.includes(nft.traits[type])
            );
        });
    }

    renderActiveFilters();
    applySort();
}

function renderActiveFilters() {
    elements.activeFilters.innerHTML = '';

    Object.entries(activeFilters).forEach(([type, values]) => {
        values.forEach(value => {
            const tag = document.createElement('div');
            tag.className = 'active-filter';
            tag.innerHTML = `
                <span>${escapeHtml(type)}: ${escapeHtml(value)}</span>
                <button data-trait="${escapeHtml(type)}" data-value="${escapeHtml(value)}">&times;</button>
            `;

            tag.querySelector('button').addEventListener('click', (e) => {
                const trait = e.target.dataset.trait;
                const val = e.target.dataset.value;

                const checkbox = document.querySelector(`.filter-option[data-trait="${trait}"][data-value="${val}"] .filter-checkbox`);
                if (checkbox) checkbox.checked = false;

                activeFilters[trait] = activeFilters[trait].filter(v => v !== val);
                if (activeFilters[trait].length === 0) {
                    delete activeFilters[trait];
                }
                applyFilters();
            });

            elements.activeFilters.appendChild(tag);
        });
    });
}

function clearFilters() {
    activeFilters = {};
    document.querySelectorAll('.filter-groups .filter-checkbox').forEach(cb => cb.checked = false);
    applyFilters();
}

// ============================================
// SORTING
// ============================================
function applySort() {
    const sortBy = elements.sortSelect.value;
    const nfts = filteredNFTs.length > 0 || Object.keys(activeFilters).length > 0
        ? [...filteredNFTs]
        : [...allNFTs];

    if (sortBy === 'random') {
        for (let i = nfts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [nfts[i], nfts[j]] = [nfts[j], nfts[i]];
        }
    } else if (sortBy === 'rarity') {
        const tierOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
        nfts.sort((a, b) => (tierOrder[a.rarityTier] ?? 4) - (tierOrder[b.rarityTier] ?? 4) || a.rarityRank - b.rarityRank);
    } else if (sortBy === 'number') {
        nfts.sort((a, b) => a.number - b.number);
    } else {
        nfts.sort((a, b) => {
            const valA = a.traits[sortBy] || '';
            const valB = b.traits[sortBy] || '';
            return valA.localeCompare(valB);
        });
    }

    filteredNFTs = nfts;
    renderNFTs();
}

// ============================================
// NFT RENDERING
// ============================================
function renderNFTs() {
    elements.nftGrid.innerHTML = '';

    filteredNFTs.forEach(nft => {
        const card = document.createElement('div');
        card.className = 'nft-card';

        const img = document.createElement('img');
        img.className = 'nft-image loading';
        img.alt = nft.name;
        img.loading = 'lazy';
        img.onload = () => {
            img.classList.remove('loading');
            img.classList.add('loaded');
        };
        img.onerror = () => {
            img.src = PLACEHOLDER_IMAGE;
            img.classList.remove('loading');
            img.classList.add('loaded');
        };
        img.src = nft.imageUrl;

        const info = document.createElement('div');
        info.className = 'nft-info';
        info.innerHTML = `<div class="nft-name">${escapeHtml(nft.name)}</div>` +
            (nft.rarityRank ? `<div class="nft-rarity"><span class="rarity-rank">#${nft.rarityRank}</span><span class="rarity-tier tier-${nft.rarityTier}">${getTierLabel(nft.rarityTier)}</span></div>` : '');

        card.appendChild(img);
        card.appendChild(info);

        card.addEventListener('click', () => showDetails(nft));

        elements.nftGrid.appendChild(card);
    });
}

// ============================================
// NFT DETAILS
// ============================================
function showDetails(nft) {
    elements.detailsTitle.textContent = nft.name;
    elements.detailsImage.src = nft.imageUrl;

    if (nft.rarityRank) {
        elements.detailsRarity.innerHTML = `
            <span class="rarity-rank">#${nft.rarityRank}</span>
            <span class="rarity-tier tier-${nft.rarityTier}">${getTierLabel(nft.rarityTier)}</span>
            <span class="rarity-score">Score: ${nft.rarityScore.toFixed(1)}</span>
        `;
    } else {
        elements.detailsRarity.innerHTML = '';
    }

    const total = allNFTs.length;
    elements.detailsTraits.innerHTML = Object.entries(nft.traits)
        .map(([type, value]) => {
            const count = traitCounts[type]?.[value] || 0;
            const pct = ((count / total) * 100).toFixed(1);
            return `
            <div class="trait-item">
                <div class="trait-type">${escapeHtml(type)}</div>
                <div class="trait-value">${escapeHtml(value)}</div>
                <div class="trait-rarity">${pct}% have this</div>
            </div>
            `;
        }).join('');
    elements.detailsMint.textContent = nft.mint;
    elements.detailsModal.style.display = 'flex';
}

function closeDetails() {
    elements.detailsModal.style.display = 'none';
}

// Close modal on background click
elements.detailsModal.addEventListener('click', (e) => {
    if (e.target === elements.detailsModal) {
        closeDetails();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.detailsModal.style.display === 'flex') {
        closeDetails();
    }
});

// ============================================
// INITIALIZE
// ============================================
fetchCollection();
