// Bobbers - Fishing Game

// ============================================
// LOCAL DEV MODE (skip API calls on localhost)
// ============================================
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// ============================================
// CONFIGURATION
// ============================================
// Fisherman options
const FISHERMEN = [
    { id: 'amos', name: 'Amos', image: 'fisherman5.png', pos: { left: '8.1%', bottom: '30.8%', width: '20.0%' }, castFrom: { left: '25.7%', top: '39.1%' }, lure: { left: '60.7%', top: '64.9%' } },
    { id: 'grimfang', name: 'Grimfang', image: 'fisherman1.png', pos: { left: '18.6%', bottom: '22.6%', width: '14.5%' }, castFrom: { left: '29.3%', top: '57.3%' }, lure: { left: '62.0%', top: '61.6%' } },
    { id: 'captain-goldtusk', name: 'Captain Goldtusk', image: 'fisherman2.png', pos: { left: '12.6%', bottom: '34.5%', width: '15.3%' }, castFrom: { left: '24.1%', top: '40.5%' }, lure: { left: '66.5%', top: '64.4%' } },
    { id: 'gristlebeard', name: 'Gristlebeard', image: 'fisherman3.png', pos: { left: '20.2%', bottom: '45.1%', width: '14.5%' }, castFrom: { left: '31.1%', top: '34.9%' }, lure: { left: '60.0%', top: '59.5%' } },
    { id: 'gill', name: 'Gill', image: 'fisherman4.png', pos: { left: '12.0%', bottom: '34.4%', width: '16.1%' }, castFrom: { left: '24.1%', top: '44.7%' }, lure: { left: '64.7%', top: '62.1%' } }
];

// Fish Species (MidEvil themed)
const FISH_SPECIES = [
    { name: 'Goblin Guppy', image: 'fish-goblin-guppy.png', fallback: '🐟', baseRarity: 'common' },
    { name: 'Orc Bass', image: 'fish-orc-bass.png', fallback: '🐠', baseRarity: 'common' },
    { name: 'BigDriver Diesel Catfish', image: 'fish-diesel-catfish.png', fallback: '🐡', baseRarity: 'common' },
    { name: 'Skeleton Fish', image: 'fish-skeleton-fish.png', fallback: '💀', baseRarity: 'uncommon' },
    { name: 'Cursed Carp', image: 'fish-cursed-carp.png', fallback: '👻', baseRarity: 'uncommon' },
    { name: 'Dragon Eel', image: 'fish-dragon-eel.png', fallback: '🐉', baseRarity: 'rare' },
    { name: 'Phantom Pike', image: 'fish-phantom-pike.png', fallback: '👁️', baseRarity: 'rare' },
    { name: 'Ancient Angler', image: 'fish-ancient-angler.png', fallback: '🦑', baseRarity: 'epic' },
    { name: 'Demon Trout', image: 'fish-demon-trout.png', fallback: '😈', baseRarity: 'epic' },
    { name: 'Primordial Leviathan', image: 'fish-primordial-leviathan.png', fallback: '🐲', baseRarity: 'legendary' },
    { name: 'Golden Kraken', image: 'fish-golden-kraken.png', fallback: '🦈', baseRarity: 'legendary' }
];

const FISH_SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Massive'];
const FISH_COLORS = ['Shadowy', 'Bloody', 'Mossy', 'Ashen', 'Golden', 'Cursed', 'Ancient'];
const FISH_SPECIALS = ['None', 'Glowing', 'Spectral', 'Corrupted', 'Blessed', 'Enchanted'];

const RARITY_WEIGHTS = {
    common: 40,
    uncommon: 30,
    rare: 18,
    epic: 9,
    legendary: 3
};

const RARITY_COLORS = {
    common: '#aaa',
    uncommon: '#2ecc71',
    rare: '#3498db',
    epic: '#9b59b6',
    legendary: '#ffd700'
};

const RARITY_MULTIPLIERS = {
    common: 1,
    uncommon: 2,
    rare: 5,
    epic: 10,
    legendary: 25
};

// Pre-computed caches for performance
const SPECIES_BY_RARITY = {};
const RARITY_TOTAL = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);

// Cache species pools by rarity (computed once)
Object.keys(RARITY_WEIGHTS).forEach(rarity => {
    SPECIES_BY_RARITY[rarity] = FISH_SPECIES.filter(s => s.baseRarity === rarity);
});

// Preload all game images
function preloadImages() {
    const images = [
        'Map.jpg', 'Lure.png',
        ...FISHERMEN.map(f => f.image),
        ...FISH_SPECIES.map(f => f.image)
    ];
    images.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}
preloadImages();

// ============================================
// SOUND EFFECTS (Lazy-loaded for performance)
// ============================================
const SOUND_URLS = {
    cast: 'sounds/cast.mp3',
    splash: 'sounds/splash.mp3',
    bite: 'sounds/bite.mp3',
    reel: 'sounds/reel.mp3',
    catch: 'sounds/catch.mp3',
    escape: 'sounds/escape.mp3',
};

// Sound cache - populated on first use
const SOUNDS = {};
let soundsLoaded = false;

// Background music (lazy-loaded)
let BACKGROUND_MUSIC = null;

// Mute state
let isMuted = false;

// Load sounds on first user interaction
function loadSounds() {
    if (soundsLoaded) return;
    soundsLoaded = true;

    // Load sound effects
    Object.entries(SOUND_URLS).forEach(([name, url]) => {
        const sound = new Audio(url);
        sound.preload = 'auto';
        sound.volume = 0.5;
        SOUNDS[name] = sound;
    });

    // Load background music
    BACKGROUND_MUSIC = new Audio('sounds/background.mp3');
    BACKGROUND_MUSIC.loop = true;
    BACKGROUND_MUSIC.volume = 0.3;
}

function playSound(soundName) {
    if (isMuted) return;
    loadSounds(); // Ensure sounds are loaded
    try {
        const sound = SOUNDS[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {
                // Silently fail if sound can't play (file missing or autoplay blocked)
            });
        }
    } catch (e) {
        // Ignore sound errors
    }
}

function stopSound(soundName) {
    try {
        const sound = SOUNDS[soundName];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    } catch (e) {
        // Ignore sound errors
    }
}

function startBackgroundMusic() {
    if (!isMuted && BACKGROUND_MUSIC) {
        BACKGROUND_MUSIC.play().catch(() => {
            // Autoplay blocked, will start on first interaction
        });
    }
}

function toggleMute() {
    isMuted = !isMuted;
    loadSounds(); // Ensure sounds are loaded

    if (isMuted) {
        if (BACKGROUND_MUSIC) BACKGROUND_MUSIC.pause();
        // Stop all currently playing sounds
        Object.values(SOUNDS).forEach(sound => {
            if (sound) {
                sound.pause();
                sound.currentTime = 0;
            }
        });
    } else {
        if (BACKGROUND_MUSIC) BACKGROUND_MUSIC.play().catch(() => {});
    }

    // Update button icon
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
    }
}

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    // Screens
    connectScreen: document.getElementById('connectScreen'),
    selectScreen: document.getElementById('selectScreen'),
    gameScreen: document.getElementById('gameScreen'),

    // Connect
    connectError: document.getElementById('connectError'),

    // Select
    nftGrid: document.getElementById('nftGrid'),
    selectError: document.getElementById('selectError'),

    // Game
    fisherman: document.getElementById('fisherman'),
    fishermanImg: document.getElementById('fishermanImg'),
    fishingLine: null,
    bobber: document.getElementById('bobber'),
    splash: document.getElementById('splash'),
    castBtn: document.getElementById('castBtn'),
    reelBtn: document.getElementById('reelBtn'),
    gameStatus: document.getElementById('gameStatus'),
    catchDisplay: document.getElementById('catchDisplay'),
    caughtFish: document.getElementById('caughtFish'),
    closeCatch: document.getElementById('closecatch'),
    catchCount: document.getElementById('catchCount'),
    catchList: document.getElementById('catchList'),
    changeBtn: document.getElementById('changeBtn'),

    // Loading
    loading: document.getElementById('loading'),

    // Discord
    discordLink: document.getElementById('discordLink'),
    discordStatus: document.getElementById('discordStatus'),
    linkDiscordBtn: document.getElementById('linkDiscordBtn')
};

// ============================================
// STATE
// ============================================
let userWallet = null;
let walletSignature = null;
let walletMessage = null;
let currentCastToken = null; // Cast token from cooldown (wallet-bound, one-time)
let selectedFisherman = null;
let catches = [];
let gameState = 'idle'; // idle, casting, waiting, bite, reeling
let isUnlimitedWallet = false; // Admin wallets get unlimited casts
let castsRemaining = 0;
let lastCooldownData = null; // Cache cooldown response for bonus display

// ============================================
// DAILY COOLDOWN TRACKING (Server-side via Redis)
// ============================================

// Check if wallet can play (server-side check)
async function checkWalletCooldown(wallet) {
    if (IS_LOCAL) return { canPlay: true, unlimited: true };
    try {
        const response = await fetch(`/api/fishing/cooldown?wallet=${encodeURIComponent(wallet)}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to check cooldown:', error);
        return { canPlay: false, error: true };
    }
}

// Mark wallet as played (server-side) — consumes game token, returns cast token
async function markWalletAsPlayed(gameToken) {
    if (IS_LOCAL) return { success: true, castToken: 'local' };
    try {
        const response = await fetch('/api/fishing/cooldown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: userWallet, gameToken })
        });
        return await response.json();
    } catch (error) {
        console.error('Failed to mark wallet as played:', error);
        return { success: false };
    }
}

function formatTimeRemaining(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function formatCastsMessage(remaining) {
    const bonus = lastCooldownData?.bonusCasts || 0;
    const label = `${remaining} cast${remaining !== 1 ? 's' : ''} remaining`;
    if (bonus > 0) {
        return `${label} (${lastCooldownData.baseCasts} base + ${bonus} Orc bonus)`;
    }
    return label;
}

// ============================================
// EVENT LISTENERS
// ============================================
// Connect Wallet button (extension-based)
const connectWalletBtn = document.getElementById('connectWalletBtn');
if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', connectWallet);
}

elements.castBtn.addEventListener('click', castLine);
elements.reelBtn.addEventListener('click', reelIn);
elements.closeCatch.addEventListener('click', closeCatchDisplay);
elements.changeBtn.addEventListener('click', changeFisherman);
document.getElementById('muteBtn').addEventListener('click', toggleMute);

// Fallback: load sounds and start music on first user interaction
document.addEventListener('click', function initAudioOnClick() {
    loadSounds();
    startBackgroundMusic();
    document.removeEventListener('click', initAudioOnClick);
}, { once: true });

// ============================================
// WALLET VALIDATION & RECORDING
// ============================================
// Called by wallet.js after extension-based wallet connect + signature verification
async function handleWalletConnected(wallet, signature, message) {
    elements.connectError.textContent = '';
    showLoading(true);

    try {
        if (!IS_LOCAL) {
            await fetch('/api/fishing/record-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet, signature, message })
            });
        }
    } catch (err) {
        console.error('Failed to record wallet:', err);
    }

    userWallet = wallet;
    walletSignature = signature;
    walletMessage = message;

    // Persist session so navigating to leaderboard and back doesn't require reconnect
    try {
        sessionStorage.setItem('fishing_wallet', wallet);
        if (signature) sessionStorage.setItem('fishing_sig', signature);
        if (message) sessionStorage.setItem('fishing_msg', message);
    } catch (e) {}

    showSelectScreen();
    showLoading(false);
}


async function showSelectScreen() {
    elements.connectScreen.style.display = 'none';
    elements.selectScreen.style.display = 'flex';
    elements.nftGrid.innerHTML = '<p style="color: #aaa;">Checking play status...</p>';

    // Check if this wallet has casts remaining today (server-side)
    const cooldownData = await checkWalletCooldown(userWallet);
    lastCooldownData = cooldownData;
    const noCastsLeft = !cooldownData.canPlay && !cooldownData.unlimited;
    castsRemaining = cooldownData.castsRemaining ?? 0;

    elements.nftGrid.innerHTML = '';

    if (noCastsLeft) {
        const timeLeft = cooldownData.resetInSeconds ? formatTimeRemaining(cooldownData.resetInSeconds) : '24h';
        elements.selectError.textContent = `No casts remaining! Resets in ${timeLeft}`;
    } else if (cooldownData.unlimited) {
        elements.selectError.textContent = 'Unlimited access enabled';
    } else {
        elements.selectError.textContent = `${formatCastsMessage(castsRemaining)} today`;
    }

    FISHERMEN.forEach((fisherman, index) => {
        const card = document.createElement('div');
        card.className = 'nft-card' + (noCastsLeft ? ' on-cooldown' : '');
        card.dataset.id = fisherman.id;
        card.innerHTML = `
            <img src="${fisherman.image}" alt="${fisherman.name}" width="120" height="120" loading="eager">
            <div class="nft-name">${fisherman.name}</div>
            ${noCastsLeft ? '<div class="cooldown-badge">No Casts Left</div>' : ''}
        `;
        if (!noCastsLeft) {
            card.addEventListener('click', () => selectFisherman(index));
        }
        elements.nftGrid.appendChild(card);
    });
}

async function selectFisherman(index) {
    selectedFisherman = FISHERMEN[index];

    elements.fishermanImg.src = selectedFisherman.image;

    // Apply per-fisherman positioning
    const pos = selectedFisherman.pos;
    if (pos) {
        elements.fisherman.style.left = pos.left;
        elements.fisherman.style.bottom = pos.bottom;
        elements.fisherman.style.width = pos.width;
    }

    // Apply per-fisherman lure position
    const lure = selectedFisherman.lure;
    if (lure) {
        elements.bobber.style.left = lure.left;
        elements.bobber.style.top = lure.top;
        elements.splash.style.left = lure.left;
        elements.splash.style.top = lure.top;
    }

    elements.selectScreen.style.display = 'none';
    elements.gameScreen.style.display = 'flex';
    elements.fisherman.style.display = 'flex';

    gameState = 'idle';
    if (isUnlimitedWallet) {
        updateStatus('Click "Cast Line" to start fishing!');
    } else {
        updateStatus(`${formatCastsMessage(castsRemaining)} — Cast Line to fish!`);
    }

    // Check Discord link status
    checkDiscordStatus();
}

function changeFisherman() {
    elements.gameScreen.style.display = 'none';
    elements.fisherman.style.display = 'none';
    showSelectScreen();
}

// ============================================
// FISHING MECHANICS
// ============================================
async function castLine() {
    if (gameState !== 'idle') return;

    // Check if casts remaining
    const cooldownData = await checkWalletCooldown(userWallet);
    lastCooldownData = cooldownData;
    isUnlimitedWallet = cooldownData.unlimited || false;
    castsRemaining = cooldownData.castsRemaining ?? 0;

    if (!cooldownData.canPlay && !isUnlimitedWallet) {
        updateStatus("No casts remaining! Come back tomorrow.");
        elements.castBtn.disabled = true;
        return;
    }

    // Get a fresh game session token for this cast
    let gameToken = null;
    if (!IS_LOCAL) {
        try {
            const tokenRes = await fetch('/api/game-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: 'fishing' })
            });
            const tokenData = await tokenRes.json();
            gameToken = tokenData.token || null;
        } catch (e) {
            console.error('Failed to get game session:', e);
        }
    }

    // Consume cast and get cast token (required for leaderboard submission)
    currentCastToken = null;
    if (!IS_LOCAL && gameToken) {
        const result = await markWalletAsPlayed(gameToken);
        if (result.castToken) {
            currentCastToken = result.castToken;
        }
        if (result.castsRemaining !== undefined) {
            castsRemaining = result.castsRemaining;
        }
        if (!result.success && !result.unlimited) {
            updateStatus("No casts remaining! Come back tomorrow.");
            elements.castBtn.disabled = true;
            return;
        }
    }

    gameState = 'casting';
    updateStatus('Casting...');
    playSound('cast');

    elements.castBtn.disabled = true;

    // Calculate cast arc: pole tip → water
    let startLeftPct, startTopPct;
    if (selectedFisherman.castFrom) {
        // Use manually defined pole tip position
        startLeftPct = parseFloat(selectedFisherman.castFrom.left);
        startTopPct = parseFloat(selectedFisherman.castFrom.top);
    } else {
        // Fallback: estimate from fisherman rect
        const container = document.querySelector('.game-container');
        const containerRect = container.getBoundingClientRect();
        const fishermanRect = elements.fisherman.getBoundingClientRect();
        startLeftPct = ((fishermanRect.left + fishermanRect.width * 0.8 - containerRect.left) / containerRect.width * 100);
        startTopPct = ((fishermanRect.top + fishermanRect.height * 0.1 - containerRect.top) / containerRect.height * 100);
    }

    // End: lure landing position
    const endLeftPct = parseFloat(selectedFisherman.lure.left);
    const endTopPct = parseFloat(selectedFisherman.lure.top);

    // Build smooth parabolic arc keyframes
    const arcHeight = 20; // how high (in %) above the straight line
    const numFrames = 12;
    const keyframes = [];
    for (let i = 0; i <= numFrames; i++) {
        const t = i / numFrames;
        const left = startLeftPct + (endLeftPct - startLeftPct) * t;
        const straightTop = startTopPct + (endTopPct - startTopPct) * t;
        const arc = 4 * arcHeight * t * (1 - t); // parabola peaking at t=0.5
        const rotation = t * 720; // 2 full spins during cast
        keyframes.push({ left: left + '%', top: (straightTop - arc) + '%', transform: `translateX(-50%) rotate(${rotation}deg)` });
    }

    // Position bobber at pole tip and show it
    elements.bobber.style.left = startLeftPct + '%';
    elements.bobber.style.top = startTopPct + '%';
    elements.bobber.classList.remove('bobbing', 'bite');
    elements.bobber.classList.add('visible');

    // Animate the cast arc
    const castAnim = elements.bobber.animate(keyframes, {
        duration: 1200,
        easing: 'ease-out'
    });

    castAnim.onfinish = () => {
        // Set final position
        elements.bobber.style.left = selectedFisherman.lure.left;
        elements.bobber.style.top = selectedFisherman.lure.top;

        // Splash on landing
        elements.splash.classList.add('active');
        playSound('splash');
        setTimeout(() => elements.splash.classList.remove('active'), 500);

        // Start bobbing
        elements.bobber.classList.add('bobbing');
        gameState = 'waiting';
        updateStatus('Waiting for a bite...');

        // Random wait time before bite (3-10 seconds)
        const waitTime = 3000 + Math.random() * 7000;
        setTimeout(() => {
            if (gameState === 'waiting') {
                triggerBite();
            }
        }, waitTime);
    };
}

function triggerBite() {
    gameState = 'bite';
    elements.bobber.classList.remove('bobbing');
    elements.bobber.classList.add('bite');
    playSound('bite');

    updateStatus('🎣 You got a bite! Reel it in!');
    elements.reelBtn.disabled = false;

    // Auto-fail if not reeled in within 3 seconds
    setTimeout(() => {
        if (gameState === 'bite') {
            // Sink the bobber before showing escape
            elements.bobber.classList.remove('bite');
            const sinkAnim = elements.bobber.animate([
                { transform: 'translateX(-50%) translateY(0)', opacity: 0.8 },
                { transform: 'translateX(-50%) translateY(40px)', opacity: 0 }
            ], { duration: 600, easing: 'ease-in' });
            sinkAnim.onfinish = () => fishGotAway();
        }
    }, 3000);
}

function reelIn() {
    if (gameState !== 'bite') return;

    gameState = 'reeling';
    elements.reelBtn.disabled = true;
    elements.bobber.classList.remove('bite', 'bobbing');
    playSound('reel');

    updateStatus('Reeling in...');

    // Reel-in animation: drag lure through water to shoreline
    const startLeftPct = parseFloat(selectedFisherman.lure.left);
    const startTopPct = parseFloat(selectedFisherman.lure.top);

    // End point: stop at the water's edge (65% of the way from lure toward castFrom)
    let shoreLeftPct, shoreTopPct;
    if (selectedFisherman.castFrom) {
        const castLeftPct = parseFloat(selectedFisherman.castFrom.left);
        shoreLeftPct = startLeftPct + (castLeftPct - startLeftPct) * 0.65;
        shoreTopPct = startTopPct;
    } else {
        const fishLeftPct = parseFloat(selectedFisherman.pos.left) + parseFloat(selectedFisherman.pos.width);
        shoreLeftPct = startLeftPct + (fishLeftPct - startLeftPct) * 0.65;
        shoreTopPct = startTopPct;
    }

    const numFrames = 10;
    const reelKeyframes = [];
    for (let i = 0; i <= numFrames; i++) {
        const t = i / numFrames;
        const left = startLeftPct + (shoreLeftPct - startLeftPct) * t;
        const top = startTopPct + (shoreTopPct - startTopPct) * t;
        reelKeyframes.push({ left: left + '%', top: top + '%', transform: 'translateX(-50%)', opacity: 1 - t * 0.7 });
    }

    const reelAnim = elements.bobber.animate(reelKeyframes, {
        duration: 800,
        easing: 'ease-in'
    });

    reelAnim.onfinish = () => {
        elements.bobber.classList.remove('visible');
        elements.bobber.style.left = selectedFisherman.lure.left;
        elements.bobber.style.top = selectedFisherman.lure.top;

        // 90% chance to catch, 10% chance fish escapes
        if (Math.random() < 0.90) {
            catchFish();
        } else {
            fishGotAway();
        }
    };
}

function fishGotAway() {
    stopSound('reel');
    gameState = 'idle';
    playSound('escape');

    // Consume the cast token server-side so it can't be reused
    if (currentCastToken) {
        fetch('/api/fishing/escape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ castToken: currentCastToken })
        }).catch(() => {});
        currentCastToken = null;
    }

    elements.bobber.classList.remove('bite', 'bobbing', 'visible');
    elements.reelBtn.disabled = true;
    elements.castBtn.disabled = !(isUnlimitedWallet || castsRemaining > 0);

    // Show escape popup
    displayEscape();
}

function displayEscape() {
    const subtext = (isUnlimitedWallet || castsRemaining > 0) ? 'Try again!' : 'Better luck tomorrow!';
    elements.caughtFish.innerHTML = `
        <div class="escape-display">
            <div class="escape-emoji">😢</div>
            <div class="escape-text">The fish got away!</div>
            <div class="escape-subtext">${subtext}</div>
        </div>
    `;
    elements.catchDisplay.style.display = 'flex';
    elements.fisherman.style.display = 'none';
    elements.catchDisplay.querySelector('h3').textContent = 'Oh no!';
}

async function catchFish() {
    stopSound('reel');
    playSound('catch');

    let fish;

    if (!IS_LOCAL && currentCastToken) {
        try {
            const leaderboardResponse = await fetch('/api/fishing/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: userWallet, castToken: currentCastToken })
            });

            const leaderboardData = await leaderboardResponse.json();
            if (leaderboardData.fish) {
                fish = leaderboardData.fish;
                fish.timestamp = new Date().toLocaleTimeString();
            } else if (leaderboardData.error) {
                console.error('Leaderboard API error:', leaderboardData.error);
            }
        } catch (error) {
            console.error('API error:', error);
        }

        // Cast token is consumed
        currentCastToken = null;
    }

    // Fallback to client-side generation for local dev or API failure
    if (!fish) {
        fish = generateFish();
    }

    catches.unshift(fish);
    displayCatch(fish);
    updateCatchLog();

    gameState = 'idle';
    elements.castBtn.disabled = !(isUnlimitedWallet || castsRemaining > 0);
}

// ============================================
// FISH GENERATION
// ============================================
function generateFish() {
    // Determine rarity first
    const rarity = getRandomRarity();

    // Get species from pre-computed cache
    const speciesPool = SPECIES_BY_RARITY[rarity];
    const species = speciesPool.length > 0
        ? speciesPool[Math.floor(Math.random() * speciesPool.length)]
        : FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];

    // Generate other traits
    const size = FISH_SIZES[Math.floor(Math.random() * FISH_SIZES.length)];
    const color = FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];

    // Special trait more likely on higher rarities
    let special = 'None';
    const specialChance = rarity === 'legendary' ? 0.8 :
                          rarity === 'epic' ? 0.5 :
                          rarity === 'rare' ? 0.3 : 0.1;
    if (Math.random() < specialChance) {
        special = FISH_SPECIALS[1 + Math.floor(Math.random() * (FISH_SPECIALS.length - 1))];
    }

    // Calculate weight based on size
    const baseWeight = { Tiny: 0.5, Small: 2, Medium: 5, Large: 15, Massive: 40 };
    const weight = (baseWeight[size] + Math.random() * baseWeight[size]).toFixed(1);

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
        timestamp: new Date().toLocaleTimeString()
    };
}

function getRandomRarity() {
    let random = Math.random() * RARITY_TOTAL;

    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
        random -= weight;
        if (random <= 0) return rarity;
    }

    return 'common';
}

// ============================================
// UI UPDATES
// ============================================
let _setShareFish;
const shareFishOnX = (() => {
    let _catch = null;
    _setShareFish = (fish) => { _catch = fish; };
    return () => {
        if (!_catch) return;
        const name = `${_catch.color} ${_catch.species}`;
        const tweetText = `🎣 I just caught a ${_catch.rarity} ${name} (${_catch.weight}) in the Primordial Pit! +${_catch.score} pts 🔥

Play now: https://midhorde.com/fishing/

@MidEvilsNFT @MidHorde #MidEvils #PrimordialPit`;
        const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(tweetUrl, '_blank', 'width=550,height=420');
    };
})();

function displayCatch(fish) {
    _setShareFish(fish);
    elements.caughtFish.innerHTML = `
        <div class="fish-image">
            <img src="${fish.image}" alt="${fish.species}" width="150" height="150" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
            <span class="fish-fallback" style="display:none; font-size:80px;">${fish.fallback}</span>
        </div>
        <div class="fish-name" style="color: ${RARITY_COLORS[fish.rarity]}">${fish.color} ${fish.species}</div>
        <div class="fish-traits">
            <span class="trait rarity-${fish.rarity}">${capitalize(fish.rarity)}</span>
            <span class="trait">${fish.size}</span>
            <span class="trait">${fish.weight}</span>
            ${fish.special !== 'None' ? `<span class="trait">${fish.special}</span>` : ''}
        </div>
        <div class="fish-score">+${fish.score} pts</div>
        <button class="btn btn-share-x" id="shareFishBtn">Share on 𝕏</button>
    `;

    document.getElementById('shareFishBtn').addEventListener('click', shareFishOnX);
    elements.catchDisplay.style.display = 'flex';
    elements.fisherman.style.display = 'none';
}

function closeCatchDisplay() {
    elements.catchDisplay.style.display = 'none';
    elements.fisherman.style.display = 'flex';
    // Reset the header text
    elements.catchDisplay.querySelector('h3').textContent = 'You caught a fish!';
    if (isUnlimitedWallet) {
        updateStatus('Click "Cast Line" to fish again!');
    } else if (castsRemaining > 0) {
        updateStatus(`${formatCastsMessage(castsRemaining)} — Cast again!`);
        elements.castBtn.disabled = false;
    } else {
        updateStatus("No casts remaining today. Come back tomorrow!");
        elements.castBtn.disabled = true;
    }
}

function updateCatchLog() {
    elements.catchCount.textContent = `(${catches.length})`;

    // Only prepend new fish instead of rebuilding entire list
    const fish = catches[0];
    const newItem = `
        <div class="catch-item">
            <img class="fish-icon-img" src="${fish.image}" alt="${fish.species}" width="40" height="40" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="fish-icon" style="display:none;">${fish.fallback}</span>
            <div class="fish-info">
                <div class="name" style="color: ${RARITY_COLORS[fish.rarity]}">${fish.species}</div>
                <div class="rarity">${capitalize(fish.rarity)} - ${fish.weight}</div>
            </div>
        </div>
    `;
    elements.catchList.insertAdjacentHTML('afterbegin', newItem);

    // Remove excess items (keep max 20)
    while (elements.catchList.children.length > 20) {
        elements.catchList.lastChild.remove();
    }
}

function updateStatus(message) {
    elements.gameStatus.textContent = message;
}

function showLoading(show) {
    elements.loading.style.display = show ? 'flex' : 'none';
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// DISCORD LINKING
// ============================================
async function checkDiscordStatus() {
    if (!userWallet || IS_LOCAL) return;
    // Always sync nav Discord data to Redis (overwrites stale data)
    syncNavDiscordToWallet();
}

// Sync nav bar's localStorage Discord data to the wallet-specific Redis key
async function syncNavDiscordToWallet() {
    const localId = localStorage.getItem('discord_id');
    const localUsername = localStorage.getItem('discord_username');
    const localAvatar = localStorage.getItem('discord_avatar');

    if (localId && localUsername && userWallet && walletSignature && walletMessage) {
        try {
            const resp = await fetch('/api/fishing/discord-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: userWallet,
                    discordId: localId,
                    username: localUsername,
                    avatar: localAvatar || null,
                    signature: walletSignature,
                    message: walletMessage
                })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.error('Discord sync failed:', err.error || resp.status);
            }
        } catch (e) {
            console.error('Discord sync error:', e);
        }
    }
}

// Handle Discord OAuth callback messages
function handleDiscordCallback() {
    const params = new URLSearchParams(window.location.search);
    const discordStatus = params.get('discord');

    if (discordStatus === 'success') {
        const name = params.get('name');
        alert(`Discord linked successfully${name ? ` as ${decodeURIComponent(name)}` : ''}!`);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (discordStatus === 'denied') {
        alert('Discord authorization was denied.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (discordStatus === 'error') {
        const reason = params.get('reason') || 'unknown';
        alert(`Failed to link Discord: ${reason}`);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Add Discord button listener
if (elements.linkDiscordBtn) {
    elements.linkDiscordBtn.addEventListener('click', linkDiscord);
}

// Check for Discord callback on page load
handleDiscordCallback();

// Restore wallet session (survives page navigations within same tab)
(function restoreSession() {
    try {
        const savedWallet = sessionStorage.getItem('fishing_wallet');
        if (savedWallet && !userWallet) {
            userWallet = savedWallet;
            walletSignature = sessionStorage.getItem('fishing_sig');
            walletMessage = sessionStorage.getItem('fishing_msg');
            showSelectScreen();
        }
    } catch (e) {}
})();

// ============================================
// POSITION MODE (dev tool: ?position=true)
// ============================================
if (new URLSearchParams(window.location.search).get('position') === 'true') {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');

    // Show game container with map
    const container = document.querySelector('.game-container');

    // Create all fishermen as draggable
    FISHERMEN.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'fisherman';
        div.id = `pos-fisherman-${i}`;
        div.style.position = 'absolute';
        div.style.left = f.pos.left;
        div.style.bottom = f.pos.bottom;
        div.style.cursor = 'grab';
        div.style.width = f.pos.width;
        div.style.zIndex = 50 + i;
        div.innerHTML = `
            <img src="${f.image}" style="width:100%; height:auto; object-fit:contain; filter:drop-shadow(2px 4px 6px rgba(0,0,0,0.7));">
            <div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#ffd700; padding:4px 8px; border-radius:4px; font-size:0.75rem; text-align:center; white-space:nowrap;">${f.name}</div>
            <div class="pos-label" style="position:absolute; top:calc(100% + 24px); left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#0f0; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:0.65rem; text-align:center; white-space:nowrap;"></div>
        `;
        container.appendChild(div);

        // Drag logic
        let dragging = false, startX, startY, startLeft, startBottom;
        const updateLabel = () => {
            const rect = container.getBoundingClientRect();
            const divRect = div.getBoundingClientRect();
            const leftPct = ((divRect.left - rect.left) / rect.width * 100).toFixed(1);
            const bottomPct = ((rect.bottom - divRect.bottom) / rect.height * 100).toFixed(1);
            div.querySelector('.pos-label').textContent = `left:${leftPct}% bottom:${bottomPct}%`;
        };
        updateLabel();

        div.addEventListener('mousedown', (e) => {
            dragging = true;
            div.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            startLeft = div.offsetLeft;
            startBottom = parseInt(getComputedStyle(div).bottom);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            div.style.left = (startLeft + dx) + 'px';
            div.style.bottom = (startBottom - dy) + 'px';
            updateLabel();
        });
        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                div.style.cursor = 'grab';
            }
        });

        // Create draggable lure for this fisherman (absolute within container)
        const lureDiv = document.createElement('div');
        lureDiv.id = `pos-lure-${i}`;
        lureDiv.style.cssText = `position:absolute; left:${f.lure.left}; top:${f.lure.top}; transform:translateX(-50%); cursor:grab; z-index:${60 + i};`;
        lureDiv.innerHTML = `
            <img src="Lure.png" style="width:40px; height:auto;">
            <div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#ffd700; padding:2px 6px; border-radius:4px; font-size:0.6rem; text-align:center; white-space:nowrap;">${f.name} lure</div>
            <div class="lure-pos-label" style="position:absolute; top:calc(100% + 20px); left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#0ff; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:0.6rem; text-align:center; white-space:nowrap;"></div>
        `;
        container.appendChild(lureDiv);

        const updateLureLabel = () => {
            const rect = container.getBoundingClientRect();
            const lr = lureDiv.getBoundingClientRect();
            const lPct = ((lr.left - rect.left) / rect.width * 100).toFixed(1);
            const tPct = ((lr.top - rect.top) / rect.height * 100).toFixed(1);
            lureDiv.querySelector('.lure-pos-label').textContent = `left:${lPct}% top:${tPct}%`;
        };
        updateLureLabel();

        let lureDragging = false, lureStartX, lureStartY, lureStartLeft, lureStartTop;
        lureDiv.addEventListener('mousedown', (e) => {
            lureDragging = true;
            lureDiv.style.cursor = 'grabbing';
            lureStartX = e.clientX;
            lureStartY = e.clientY;
            lureStartLeft = lureDiv.offsetLeft;
            lureStartTop = lureDiv.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!lureDragging) return;
            lureDiv.style.left = (lureStartLeft + e.clientX - lureStartX) + 'px';
            lureDiv.style.top = (lureStartTop + e.clientY - lureStartY) + 'px';
            updateLureLabel();
        });
        document.addEventListener('mouseup', () => {
            if (lureDragging) { lureDragging = false; lureDiv.style.cursor = 'grab'; }
        });
        lureDiv.addEventListener('touchstart', (e) => {
            lureDragging = true;
            const t = e.touches[0];
            lureStartX = t.clientX; lureStartY = t.clientY;
            lureStartLeft = lureDiv.offsetLeft; lureStartTop = lureDiv.offsetTop;
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (!lureDragging) return;
            const t = e.touches[0];
            lureDiv.style.left = (lureStartLeft + t.clientX - lureStartX) + 'px';
            lureDiv.style.top = (lureStartTop + t.clientY - lureStartY) + 'px';
            updateLureLabel();
        }, { passive: false });
        document.addEventListener('touchend', () => { lureDragging = false; });

        // Create draggable castFrom lure (pole tip / cast start point)
        if (f.castFrom) {
            const castDiv = document.createElement('div');
            castDiv.id = `pos-castfrom-${i}`;
            castDiv.style.cssText = `position:absolute; left:${f.castFrom.left}; top:${f.castFrom.top}; transform:translateX(-50%); cursor:grab; z-index:${70 + i};`;
            castDiv.innerHTML = `
                <img src="Lure.png" style="width:30px; height:auto; filter:hue-rotate(90deg) brightness(1.5);">
                <div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); background:rgba(0,80,0,0.9); color:#0f0; padding:2px 6px; border-radius:4px; font-size:0.6rem; text-align:center; white-space:nowrap;">${f.name} cast</div>
                <div class="cast-pos-label" style="position:absolute; top:calc(100% + 20px); left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#0f0; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:0.6rem; text-align:center; white-space:nowrap;"></div>
            `;
            container.appendChild(castDiv);

            const updateCastLabel = () => {
                const rect = container.getBoundingClientRect();
                const cr = castDiv.getBoundingClientRect();
                const lPct = ((cr.left - rect.left) / rect.width * 100).toFixed(1);
                const tPct = ((cr.top - rect.top) / rect.height * 100).toFixed(1);
                castDiv.querySelector('.cast-pos-label').textContent = `left:${lPct}% top:${tPct}%`;
            };
            updateCastLabel();

            let castDragging = false, castStartX, castStartY, castStartLeft, castStartTop;
            castDiv.addEventListener('mousedown', (e) => {
                castDragging = true;
                castDiv.style.cursor = 'grabbing';
                castStartX = e.clientX; castStartY = e.clientY;
                castStartLeft = castDiv.offsetLeft; castStartTop = castDiv.offsetTop;
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!castDragging) return;
                castDiv.style.left = (castStartLeft + e.clientX - castStartX) + 'px';
                castDiv.style.top = (castStartTop + e.clientY - castStartY) + 'px';
                updateCastLabel();
            });
            document.addEventListener('mouseup', () => {
                if (castDragging) { castDragging = false; castDiv.style.cursor = 'grab'; }
            });
        }

        // Touch support for fisherman
        div.addEventListener('touchstart', (e) => {
            dragging = true;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            startLeft = div.offsetLeft;
            startBottom = parseInt(getComputedStyle(div).bottom);
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            div.style.left = (startLeft + dx) + 'px';
            div.style.bottom = (startBottom - dy) + 'px';
            updateLabel();
        }, { passive: false });
        document.addEventListener('touchend', () => { dragging = false; });
    });

    // Per-fisherman copy buttons
    const btnBar = document.createElement('div');
    btnBar.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:999; display:flex; gap:8px;';
    FISHERMEN.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Copy ${f.name}`;
        btn.style.cssText = 'padding:10px 16px; background:#ffd700; color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:0.85rem;';
        btn.addEventListener('click', () => {
            const rect = container.getBoundingClientRect();
            const div = document.getElementById(`pos-fisherman-${i}`);
            const divRect = div.getBoundingClientRect();
            const leftPct = ((divRect.left - rect.left) / rect.width * 100).toFixed(1);
            const bottomPct = ((rect.bottom - divRect.bottom) / rect.height * 100).toFixed(1);
            const lureDiv = document.getElementById(`pos-lure-${i}`);
            const lr = lureDiv.getBoundingClientRect();
            const lureLPct = ((lr.left - rect.left) / rect.width * 100).toFixed(1);
            const lureTPct = ((lr.top - rect.top) / rect.height * 100).toFixed(1);
            const text = `${f.name} pos:${leftPct}%,${bottomPct}% lure:${lureLPct}%,${lureTPct}%`;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = `Copy ${f.name}`, 2000);
            });
        });
        btnBar.appendChild(btn);
    });
    document.body.appendChild(btnBar);

    // Per-fisherman lure-only copy buttons
    const lureBtnBar = document.createElement('div');
    lureBtnBar.style.cssText = 'position:fixed; top:50px; left:50%; transform:translateX(-50%); z-index:999; display:flex; gap:8px;';
    FISHERMEN.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Copy ${f.name} Lure`;
        btn.style.cssText = 'padding:8px 12px; background:#0ff; color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:0.75rem;';
        btn.addEventListener('click', () => {
            const rect = container.getBoundingClientRect();
            const lureDiv = document.getElementById(`pos-lure-${i}`);
            const lr = lureDiv.getBoundingClientRect();
            const lureLPct = ((lr.left - rect.left) / rect.width * 100).toFixed(1);
            const lureTPct = ((lr.top - rect.top) / rect.height * 100).toFixed(1);
            const text = `${f.name} lure:${lureLPct}%,${lureTPct}%`;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = `Copy ${f.name} Lure`, 2000);
            });
        });
        lureBtnBar.appendChild(btn);
    });
    document.body.appendChild(lureBtnBar);

    // Per-fisherman castFrom copy buttons
    const castBtnBar = document.createElement('div');
    castBtnBar.style.cssText = 'position:fixed; top:85px; left:50%; transform:translateX(-50%); z-index:999; display:flex; gap:8px;';
    FISHERMEN.forEach((f, i) => {
        if (!f.castFrom) return;
        const btn = document.createElement('button');
        btn.textContent = `Copy ${f.name} Cast`;
        btn.style.cssText = 'padding:8px 12px; background:#0f0; color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:0.75rem;';
        btn.addEventListener('click', () => {
            const rect = container.getBoundingClientRect();
            const castDiv = document.getElementById(`pos-castfrom-${i}`);
            const cr = castDiv.getBoundingClientRect();
            const castLPct = ((cr.left - rect.left) / rect.width * 100).toFixed(1);
            const castTPct = ((cr.top - rect.top) / rect.height * 100).toFixed(1);
            const text = `${f.name} cast:${castLPct}%,${castTPct}%`;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = `Copy ${f.name} Cast`, 2000);
            });
        });
        castBtnBar.appendChild(btn);
    });
    document.body.appendChild(castBtnBar);

    // Mouse coordinate tracker — click to copy left%,top%
    const coordLabel = document.createElement('div');
    coordLabel.style.cssText = 'position:fixed; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#0f0; padding:8px 16px; border-radius:6px; font-family:monospace; font-size:0.9rem; z-index:999; pointer-events:none;';
    coordLabel.textContent = 'Move mouse over map';
    document.body.appendChild(coordLabel);

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const leftPct = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        const topPct = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        coordLabel.textContent = `left: ${leftPct}%  top: ${topPct}%  (click to copy)`;
    });

    container.addEventListener('click', (e) => {
        const rect = container.getBoundingClientRect();
        const leftPct = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        const topPct = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        const text = `${leftPct}%,${topPct}%`;
        navigator.clipboard.writeText(text).then(() => {
            coordLabel.textContent = `Copied: ${text}`;
            setTimeout(() => coordLabel.textContent = 'Move mouse over map', 1500);
        });
    });
}
