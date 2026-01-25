// ui.js - UI management for Horde Defense

class GameUI {
    constructor(game) {
        this.game = game;
        this.selectedTowerType = null;
        this.selectedPlacedTower = null;

        this.initElements();
        this.initEventListeners();
        this.loadHighScores();
    }

    initElements() {
        // Screens
        this.startScreen = document.getElementById('start-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameoverScreen = document.getElementById('gameover-screen');
        this.victoryScreen = document.getElementById('victory-screen');
        this.pauseOverlay = document.getElementById('pause-overlay');

        // Top bar
        this.goldDisplay = document.getElementById('gold-display');
        this.livesDisplay = document.getElementById('lives-display');
        this.waveDisplay = document.getElementById('wave-display');

        // Tower panel
        this.towerList = document.getElementById('tower-list');
        this.selectedTowerInfo = document.getElementById('selected-tower-info');
        this.selectedTowerName = document.getElementById('selected-tower-name');
        this.selectedTowerStats = document.getElementById('selected-tower-stats');
        this.upgradeBtn = document.getElementById('upgrade-btn');
        this.sellBtn = document.getElementById('sell-btn');

        // Wave controls
        this.startWaveBtn = document.getElementById('start-wave-btn');
        this.enemyPreview = document.getElementById('enemy-preview');

        // Buttons
        this.mapButtons = document.querySelectorAll('.map-btn');
        this.startGameBtn = document.getElementById('start-game-btn');
        this.soundBtn = document.getElementById('sound-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.speedBtn = document.getElementById('speed-btn');
        this.menuBtn = document.getElementById('menu-btn');
        this.resumeBtn = document.getElementById('resume-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.quitBtn = document.getElementById('quit-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.mainMenuBtn = document.getElementById('main-menu-btn');
        this.victoryRetryBtn = document.getElementById('victory-retry-btn');
        this.victoryMenuBtn = document.getElementById('victory-menu-btn');

        // Wallet
        this.connectWalletBtn = document.getElementById('connect-wallet-btn');
        this.walletStatus = document.getElementById('wallet-status');

        // High scores
        this.highScoreList = document.getElementById('high-score-list');
    }

    initEventListeners() {
        // Map selection
        this.mapButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.mapButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.game.selectedMap = btn.dataset.map;
            });
        });

        // Start game
        this.startGameBtn.addEventListener('click', () => this.game.startGame());

        // Pause/Resume
        this.pauseBtn.addEventListener('click', () => this.game.togglePause());
        this.resumeBtn.addEventListener('click', () => this.game.togglePause());

        // Sound toggle
        this.soundBtn.addEventListener('click', () => {
            if (typeof soundManager !== 'undefined') {
                const muted = soundManager.toggleMute();
                this.soundBtn.textContent = muted ? '🔇' : '🔊';
                soundManager.uiClick();
            }
        });

        // Speed control
        this.speedBtn.addEventListener('click', () => this.game.toggleSpeed());

        // Menu button
        this.menuBtn.addEventListener('click', () => this.game.togglePause());

        // Restart
        this.restartBtn.addEventListener('click', () => {
            this.game.togglePause();
            this.game.startGame();
        });

        // Quit to menu
        this.quitBtn.addEventListener('click', () => {
            this.game.togglePause();
            this.showStartScreen();
        });

        // Game over buttons
        this.retryBtn.addEventListener('click', () => this.game.startGame());
        this.mainMenuBtn.addEventListener('click', () => this.showStartScreen());
        this.victoryRetryBtn.addEventListener('click', () => this.game.startGame());
        this.victoryMenuBtn.addEventListener('click', () => this.showStartScreen());

        // High score save buttons - save and go to leaderboard
        document.getElementById('save-score-btn').addEventListener('click', async () => {
            const name = document.getElementById('player-name').value.trim() || 'Anonymous';
            await this.saveHighScore(this.game.selectedMap, this.pendingScore, name);
            document.getElementById('highscore-entry').classList.add('hidden');
            this.showStartScreen();
        });
        document.getElementById('victory-save-score-btn').addEventListener('click', async () => {
            const name = document.getElementById('victory-player-name').value.trim() || 'Anonymous';
            await this.saveHighScore(this.game.selectedMap, this.pendingScore, name);
            document.getElementById('victory-highscore-entry').classList.add('hidden');
            this.showStartScreen();
        });

        // Allow Enter key to save score
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('save-score-btn').click();
            }
        });
        document.getElementById('victory-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('victory-save-score-btn').click();
            }
        });

        // Start wave
        this.startWaveBtn.addEventListener('click', () => this.game.startWave());

        // Tower upgrade/sell
        this.upgradeBtn.addEventListener('click', () => this.game.upgradeTower());
        this.sellBtn.addEventListener('click', () => this.game.sellTower());

        // Wallet connect
        this.connectWalletBtn.addEventListener('click', () => this.connectWallet());
    }

    showStartScreen() {
        this.startScreen.classList.remove('hidden');
        this.gameScreen.classList.add('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.victoryScreen.classList.add('hidden');
        this.loadHighScores();
    }

    showGameScreen() {
        this.startScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.victoryScreen.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
    }

    showGameOver(stats) {
        this.gameScreen.classList.add('hidden');
        this.gameoverScreen.classList.remove('hidden');

        const score = this.calculateScore(stats, false);
        this.pendingScore = score;
        this.pendingVictory = false;

        document.getElementById('final-score').textContent = score.toLocaleString();
        document.getElementById('final-waves').textContent = stats.wavesCompleted;
        document.getElementById('final-kills').textContent = stats.enemiesKilled;
        document.getElementById('final-gold').textContent = stats.totalGoldEarned;

        // Check if it's a high score
        const highscoreEntry = document.getElementById('highscore-entry');
        if (this.isHighScore(this.game.selectedMap, score)) {
            highscoreEntry.classList.remove('hidden');
            document.getElementById('player-name').value = localStorage.getItem('lastPlayerName') || '';
            document.getElementById('player-name').focus();
        } else {
            highscoreEntry.classList.add('hidden');
        }
    }

    showVictory(stats) {
        this.gameScreen.classList.add('hidden');
        this.victoryScreen.classList.remove('hidden');

        const score = this.calculateScore(stats, true);
        this.pendingScore = score;
        this.pendingVictory = true;

        document.getElementById('victory-score').textContent = score.toLocaleString();
        document.getElementById('victory-lives').textContent = stats.livesRemaining;
        document.getElementById('victory-kills').textContent = stats.enemiesKilled;

        // Check if it's a high score
        const highscoreEntry = document.getElementById('victory-highscore-entry');
        if (this.isHighScore(this.game.selectedMap, score)) {
            highscoreEntry.classList.remove('hidden');
            document.getElementById('victory-player-name').value = localStorage.getItem('lastPlayerName') || '';
            document.getElementById('victory-player-name').focus();
        } else {
            highscoreEntry.classList.add('hidden');
        }
    }

    showPauseOverlay(show) {
        if (show) {
            this.pauseOverlay.classList.remove('hidden');
        } else {
            this.pauseOverlay.classList.add('hidden');
        }
    }

    showLoadingScreen(message = 'Loading...') {
        // Create loading overlay if it doesn't exist
        let loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            loadingOverlay.className = 'screen loading-screen';
            loadingOverlay.innerHTML = `
                <div class="loading-content">
                    <h2 id="loading-message">${message}</h2>
                    <div class="loading-bar-container">
                        <div class="loading-bar" id="loading-bar"></div>
                    </div>
                    <p id="loading-percent">0%</p>
                </div>
            `;
            document.getElementById('game-wrapper').appendChild(loadingOverlay);
        }

        document.getElementById('loading-message').textContent = message;
        loadingOverlay.classList.remove('hidden');
        this.startScreen.classList.add('hidden');
    }

    updateLoadingProgress(percent) {
        const bar = document.getElementById('loading-bar');
        const percentText = document.getElementById('loading-percent');
        if (bar) bar.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;

        // Hide loading screen when complete
        if (percent >= 100) {
            setTimeout(() => {
                const loadingOverlay = document.getElementById('loading-overlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.add('hidden');
                }
            }, 300);
        }
    }

    updateGold(amount) {
        this.goldDisplay.textContent = amount;
        this.updateTowerButtons();
    }

    updateLives(amount) {
        this.livesDisplay.textContent = amount;
        if (amount <= 5) {
            this.livesDisplay.style.color = '#c62828';
        } else {
            this.livesDisplay.style.color = '';
        }
    }

    updateWave(current, total) {
        this.waveDisplay.textContent = `Wave ${current}/${total}`;
    }

    updateSpeed(speed) {
        this.speedBtn.textContent = `${speed}x`;
    }

    populateTowerList() {
        this.towerList.innerHTML = '';

        Object.entries(TOWER_TYPES).forEach(([type, data]) => {
            const btn = document.createElement('button');
            btn.className = 'tower-btn';
            btn.dataset.type = type;

            btn.innerHTML = `
                <div class="tower-icon tower-${type}">
                    <img src="/minigame/assets/towers/${type}.png" alt="${data.name}" onerror="this.style.display='none';this.parentElement.textContent='${data.icon}';">
                </div>
                <div class="tower-info">
                    <span class="tower-name">${data.name}</span>
                    <span class="tower-cost">${data.baseCost} gold</span>
                </div>
            `;

            btn.addEventListener('click', () => this.selectTowerType(type));
            btn.addEventListener('mouseenter', () => this.showTowerPreview(type));
            btn.addEventListener('mouseleave', () => this.hideTowerPreview());

            this.towerList.appendChild(btn);
        });

        this.updateTowerButtons();
    }

    updateTowerButtons() {
        const buttons = this.towerList.querySelectorAll('.tower-btn');
        buttons.forEach(btn => {
            const type = btn.dataset.type;
            const cost = TOWER_TYPES[type].baseCost;
            const canAfford = this.game.gold >= cost;

            btn.disabled = !canAfford;
            if (type === this.selectedTowerType) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    selectTowerType(type) {
        if (this.selectedTowerType === type) {
            this.selectedTowerType = null;
        } else {
            this.selectedTowerType = type;
            this.deselectPlacedTower();
        }
        this.updateTowerButtons();
        this.game.selectedTowerType = this.selectedTowerType;
    }

    showTowerPreview(type) {
        const data = TOWER_TYPES[type];
        const stats = data.levels[0];

        this.selectedTowerInfo.classList.remove('hidden');
        this.selectedTowerName.textContent = data.name;
        this.selectedTowerStats.innerHTML = `
            <div class="stat-line"><span>Damage:</span><span>${stats.damage}</span></div>
            <div class="stat-line"><span>Range:</span><span>${stats.range.toFixed(1)}</span></div>
            <div class="stat-line"><span>Attack Speed:</span><span>${stats.attackSpeed}/s</span></div>
            ${stats.splashRadius ? `<div class="stat-line"><span>Splash:</span><span>${stats.splashRadius}</span></div>` : ''}
            ${stats.slowAmount ? `<div class="stat-line"><span>Slow:</span><span>${(stats.slowAmount * 100).toFixed(0)}%</span></div>` : ''}
            ${stats.auraDamageBonus ? `<div class="stat-line"><span>Aura Bonus:</span><span>+${(stats.auraDamageBonus * 100).toFixed(0)}%</span></div>` : ''}
            ${stats.bonusVsBoss ? `<div class="stat-line"><span>Boss Damage:</span><span>${stats.bonusVsBoss}x</span></div>` : ''}
            <p style="font-size: 0.8rem; color: #b0a890; margin-top: 10px;">${data.description}</p>
        `;

        this.upgradeBtn.classList.add('hidden');
        this.sellBtn.classList.add('hidden');
    }

    hideTowerPreview() {
        if (!this.selectedPlacedTower) {
            this.selectedTowerInfo.classList.add('hidden');
        }
    }

    selectPlacedTower(tower) {
        if (this.selectedPlacedTower) {
            this.selectedPlacedTower.isSelected = false;
        }

        this.selectedPlacedTower = tower;
        this.selectedTowerType = null;
        this.updateTowerButtons();

        if (tower) {
            tower.isSelected = true;
            this.showPlacedTowerInfo(tower);
        } else {
            this.selectedTowerInfo.classList.add('hidden');
        }

        this.game.selectedPlacedTower = tower;
    }

    deselectPlacedTower() {
        if (this.selectedPlacedTower) {
            this.selectedPlacedTower.isSelected = false;
            this.selectedPlacedTower = null;
            this.selectedTowerInfo.classList.add('hidden');
            this.game.selectedPlacedTower = null;
        }
    }

    showPlacedTowerInfo(tower) {
        const stats = tower.getStats();
        const typeData = TOWER_TYPES[tower.type];
        const upgradeCost = tower.getUpgradeCost();
        const sellValue = tower.getSellValue();

        this.selectedTowerInfo.classList.remove('hidden');
        this.selectedTowerName.textContent = `${stats.name} (Lvl ${tower.level + 1})`;

        let effectiveDamage = tower.getEffectiveDamage();
        let damageText = effectiveDamage.toString();
        if (tower.auraBonus > 0 || tower.nftBonus > 0) {
            damageText += ` <span style="color: #c9a227;">(+${Math.round((tower.auraBonus + tower.nftBonus) * 100)}%)</span>`;
        }

        this.selectedTowerStats.innerHTML = `
            <div class="stat-line"><span>Damage:</span><span>${damageText}</span></div>
            <div class="stat-line"><span>Range:</span><span>${stats.range.toFixed(1)}</span></div>
            <div class="stat-line"><span>Attack Speed:</span><span>${stats.attackSpeed}/s</span></div>
            ${stats.splashRadius ? `<div class="stat-line"><span>Splash:</span><span>${stats.splashRadius}</span></div>` : ''}
            ${stats.slowAmount ? `<div class="stat-line"><span>Slow:</span><span>${(stats.slowAmount * 100).toFixed(0)}%</span></div>` : ''}
            ${stats.auraDamageBonus ? `<div class="stat-line"><span>Aura Bonus:</span><span>+${(stats.auraDamageBonus * 100).toFixed(0)}%</span></div>` : ''}
            ${tower.isNftTower ? `<div class="stat-line"><span>NFT Bonus:</span><span style="color: #c9a227;">+${(tower.nftBonus * 100).toFixed(0)}%</span></div>` : ''}
            <div class="stat-line"><span>Sell Value:</span><span>${sellValue} gold</span></div>
        `;

        // Update upgrade button
        this.upgradeBtn.classList.remove('hidden');
        this.sellBtn.classList.remove('hidden');

        if (upgradeCost === null) {
            this.upgradeBtn.textContent = 'MAX';
            this.upgradeBtn.disabled = true;
        } else {
            this.upgradeBtn.textContent = `Upgrade (${upgradeCost})`;
            this.upgradeBtn.disabled = this.game.gold < upgradeCost;
        }

        this.sellBtn.textContent = `Sell (${sellValue})`;
    }

    updateWavePreview(waveNumber, mapDifficulty) {
        const preview = getWavePreview(waveNumber, mapDifficulty);
        this.enemyPreview.innerHTML = '';

        Object.entries(preview).forEach(([type, count]) => {
            const typeData = ENEMY_TYPES[type] || BOSS_TYPES[type];
            if (!typeData) return;

            const icon = document.createElement('div');
            icon.className = 'enemy-preview-icon';
            icon.style.backgroundColor = typeData.color;
            icon.textContent = count > 1 ? count : '';
            icon.title = `${typeData.name} x${count}`;
            this.enemyPreview.appendChild(icon);
        });
    }

    setWaveButtonState(isWaveActive) {
        this.startWaveBtn.disabled = isWaveActive;
        this.startWaveBtn.textContent = isWaveActive ? 'Wave In Progress' : 'Start Wave';
    }

    // High score management - uses shared leaderboard API
    async loadHighScores() {
        this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">Loading leaderboard...</p>';

        try {
            const response = await fetch('/api/leaderboard');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load');
            }

            const topScores = (data.scores || []).slice(0, 10);

            if (topScores.length === 0) {
                this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">No scores yet! Be the first to defend the tavern.</p>';
                return;
            }

            this.highScoreList.innerHTML = '';
            topScores.forEach((entry, index) => {
                const div = document.createElement('div');
                div.className = 'score-entry';
                const mapName = MAPS[entry.map]?.name || entry.map;
                const playerName = entry.name || 'Anonymous';
                div.innerHTML = `
                    <span class="rank">#${index + 1}</span>
                    <span class="player-name">${playerName}</span>
                    <span class="map-name">${mapName}</span>
                    <span class="score-value">${entry.score.toLocaleString()}</span>
                `;
                this.highScoreList.appendChild(div);
            });
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
            this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">Could not load leaderboard</p>';
        }
    }

    isHighScore(mapId, score) {
        // Always allow name entry for any score above 0
        return score > 0;
    }

    async saveHighScore(mapId, score, playerName) {
        localStorage.setItem('lastPlayerName', playerName);

        try {
            const response = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: playerName || 'Anonymous',
                    score: score,
                    map: mapId,
                    wavesCompleted: this.game.stats?.wavesCompleted || 0,
                    enemiesKilled: this.game.stats?.enemiesKilled || 0,
                    victory: this.pendingVictory || false
                })
            });

            const data = await response.json();

            if (data.isTopTen) {
                console.log(`New top 10 score! Rank: ${data.rank}`);
            }
        } catch (error) {
            console.error('Failed to save score:', error);
        }

        this.loadHighScores();
    }

    calculateScore(stats, victory = false) {
        // Get map difficulty multiplier
        const mapDifficulty = MAPS[this.game.selectedMap]?.difficulty || 'easy';
        const difficultyMultiplier = {
            'easy': 1.0,
            'medium': 1.5,
            'hard': 2.0
        }[mapDifficulty] || 1.0;

        // Base score formula
        let baseScore =
            stats.wavesCompleted * 100 +
            stats.enemiesKilled * 10 +
            stats.totalGoldEarned * 0.5 +
            stats.livesRemaining * 50;

        // Victory bonus (50% more)
        if (victory) {
            baseScore *= 1.5;
        }

        // Apply difficulty multiplier
        return Math.round(baseScore * difficultyMultiplier);
    }

    // Wallet/NFT functions
    async connectWallet() {
        this.walletStatus.textContent = 'Connecting...';

        try {
            // Check for Phantom wallet
            const provider = window.phantom?.solana;

            if (!provider) {
                this.walletStatus.textContent = 'Phantom wallet not found. Please install it.';
                return;
            }

            const response = await provider.connect();
            const publicKey = response.publicKey.toString();

            this.walletStatus.textContent = `Connected: ${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
            this.connectWalletBtn.textContent = 'Connected';
            this.connectWalletBtn.disabled = true;

            // Fetch NFTs
            await this.fetchNFTs(publicKey);
        } catch (error) {
            console.error('Wallet connection error:', error);
            this.walletStatus.textContent = 'Connection failed. Please try again.';
        }
    }

    async fetchNFTs(walletAddress) {
        try {
            this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | Fetching NFTs...`;

            // Use existing Helius API endpoint with JSON-RPC format
            const response = await fetch('/api/helius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'minigame-nfts',
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: walletAddress,
                        page: 1,
                        limit: 1000,
                        displayOptions: {
                            showCollectionMetadata: true
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch NFTs');
            }

            const data = await response.json();
            const nfts = data.result?.items || [];

            // MidEvil Orcs collection addresses
            const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
            const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

            // Filter for MidEvil Orcs (same logic as collage-maker)
            const midEvilOrcs = nfts.filter(nft => {
                const grouping = nft.grouping || [];

                // Check all collection groupings
                const collections = grouping
                    .filter(g => g.group_key === 'collection')
                    .map(g => g.group_value);

                const hasMidEvil = collections.includes(MIDEVIL_COLLECTION);
                const hasGraveyard = collections.includes(GRAVEYARD_COLLECTION);
                const name = nft.content?.metadata?.name || '';
                const hasGraveyardInName = name.toLowerCase().includes('graveyard');
                const isBurnt = nft.burnt === true;

                // Must be MidEvil, not graveyard, not burnt, AND have "Orc" in name
                const isOrc = name.toLowerCase().includes('orc');
                return hasMidEvil && !hasGraveyard && !hasGraveyardInName && !isBurnt && isOrc;
            });

            if (midEvilOrcs.length > 0) {
                this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | ${midEvilOrcs.length} MidEvil Orc${midEvilOrcs.length > 1 ? 's' : ''} found!`;
                this.game.setNFTs(midEvilOrcs);

                // Show bonus info
                const bonusPercent = Math.min(midEvilOrcs.length * 5, 25);
                this.walletStatus.textContent += ` (+${bonusPercent}% tower damage)`;
            } else {
                this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | No MidEvil Orcs found`;
            }
        } catch (error) {
            console.error('NFT fetch error:', error);
            this.walletStatus.textContent += ' | Failed to load NFTs';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameUI };
}
