// Server-side fish generation — deterministic, seeded by game token
// Mirrors exact probabilities from fishing/game.js

const FISH_SPECIES = [
    { name: 'Goblin Guppy', image: 'fish-goblin-guppy.png', fallback: '🐟', baseRarity: 'common' },
    { name: 'Orc Bass', image: 'fish-orc-bass.png', fallback: '🐠', baseRarity: 'common' },
    { name: 'Skeleton Fish', image: 'fish-skeleton-fish.png', fallback: '💀', baseRarity: 'uncommon' },
    { name: 'Cursed Carp', image: 'fish-cursed-carp.png', fallback: '👻', baseRarity: 'uncommon' },
    { name: 'Dragon Eel', image: 'fish-dragon-eel.png', fallback: '🐉', baseRarity: 'rare' },
    { name: 'Phantom Pike', image: 'fish-phantom-pike.png', fallback: '👁️', baseRarity: 'rare' },
    { name: 'Ancient Angler', image: 'fish-ancient-angler.png', fallback: '🦑', baseRarity: 'epic' },
    { name: 'Demon Trout', image: 'fish-demon-trout.png', fallback: '😈', baseRarity: 'epic' },
    { name: 'Primordial Leviathan', image: 'fish-primordial-leviathan.png', fallback: '🐲', baseRarity: 'legendary' },
    { name: 'Golden Kraken', image: 'fish-golden-kraken.png', fallback: '🦈', baseRarity: 'legendary' }
];

const RARITY_WEIGHTS = { common: 40, uncommon: 30, rare: 18, epic: 9, legendary: 3 };
const RARITY_TOTAL = 100;

const FISH_SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Massive'];
const FISH_COLORS = ['Shadowy', 'Bloody', 'Mossy', 'Ashen', 'Golden', 'Cursed', 'Ancient'];
const FISH_SPECIALS = ['None', 'Glowing', 'Spectral', 'Corrupted', 'Blessed', 'Enchanted'];

const BASE_WEIGHTS = { Tiny: 0.5, Small: 2, Medium: 5, Large: 15, Massive: 40 };
const RARITY_MULTIPLIERS = { common: 1, uncommon: 2, rare: 5, epic: 10, legendary: 25 };

// Pre-compute species pools by rarity
const SPECIES_BY_RARITY = {};
for (const species of FISH_SPECIES) {
    if (!SPECIES_BY_RARITY[species.baseRarity]) SPECIES_BY_RARITY[species.baseRarity] = [];
    SPECIES_BY_RARITY[species.baseRarity].push(species);
}

// Mulberry32 seeded PRNG — deterministic, fast, well-distributed
function createRng(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function generateFish(seed) {
    const rand = createRng(seed);

    // Rarity — same weighted random as client
    let r = rand() * RARITY_TOTAL;
    let rarity = 'common';
    for (const [rar, weight] of Object.entries(RARITY_WEIGHTS)) {
        r -= weight;
        if (r <= 0) { rarity = rar; break; }
    }

    // Species from rarity pool
    const pool = SPECIES_BY_RARITY[rarity] || FISH_SPECIES;
    const species = pool[Math.floor(rand() * pool.length)];

    // Size, color
    const size = FISH_SIZES[Math.floor(rand() * FISH_SIZES.length)];
    const color = FISH_COLORS[Math.floor(rand() * FISH_COLORS.length)];

    // Special trait — higher rarities more likely
    let special = 'None';
    const specialChance = rarity === 'legendary' ? 0.8 :
                          rarity === 'epic' ? 0.5 :
                          rarity === 'rare' ? 0.3 : 0.1;
    if (rand() < specialChance) {
        special = FISH_SPECIALS[1 + Math.floor(rand() * (FISH_SPECIALS.length - 1))];
    }

    // Weight based on size (1x–2x base weight)
    const weight = (BASE_WEIGHTS[size] + rand() * BASE_WEIGHTS[size]).toFixed(1);

    const multiplier = RARITY_MULTIPLIERS[rarity] || 1;
    const score = (parseFloat(weight) * multiplier).toFixed(1);

    return {
        species: species.name,
        image: species.image,
        fallback: species.fallback,
        rarity,
        size,
        color,
        special,
        weight: `${weight} lbs`,
        score,
        timestamp: new Date().toISOString()
    };
}
