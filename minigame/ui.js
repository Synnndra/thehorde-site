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

        document.getElementById('final-waves').textContent = stats.wavesCompleted;
        document.getElementById('final-kills').textContent = stats.enemiesKilled;
        document.getElementById('final-gold').textContent = stats.totalGoldEarned;
    }

    showVictory(stats) {
        this.gameScreen.classList.add('hidden');
        this.victoryScreen.classList.remove('hidden');

        const score = this.calculateScore(stats);
        document.getElementById('victory-score').textContent = score;
        document.getElementById('victory-lives').textContent = stats.livesRemaining;
        document.getElementById('victory-kills').textContent = stats.enemiesKilled;

        this.saveHighScore(this.game.selectedMap, score);
    }

    showPauseOverlay(show) {
        if (show) {
            this.pauseOverlay.classList.remove('hidden');
        } else {
            this.pauseOverlay.classList.add('hidden');
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
                <div class="tower-icon tower-${type}">${data.icon}</div>
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

    // High score management
    loadHighScores() {
        const scores = JSON.parse(localStorage.getItem('hordeDefenseScores') || '{}');
        this.highScoreList.innerHTML = '';

        const allScores = [];
        Object.entries(scores).forEach(([map, mapScores]) => {
            mapScores.forEach(score => {
                allScores.push({ map, ...score });
            });
        });

        allScores.sort((a, b) => b.score - a.score);
        const topScores = allScores.slice(0, 5);

        if (topScores.length === 0) {
            this.highScoreList.innerHTML = '<p style="color: #b0a890;">No scores yet!</p>';
            return;
        }

        topScores.forEach((entry, index) => {
            const div = document.createElement('div');
            div.className = 'score-entry';
            div.innerHTML = `
                <span>${index + 1}. ${MAPS[entry.map]?.name || entry.map}</span>
                <span>${entry.score}</span>
            `;
            this.highScoreList.appendChild(div);
        });
    }

    saveHighScore(mapId, score) {
        const scores = JSON.parse(localStorage.getItem('hordeDefenseScores') || '{}');

        if (!scores[mapId]) {
            scores[mapId] = [];
        }

        scores[mapId].push({
            score,
            date: new Date().toISOString()
        });

        // Keep only top 10 per map
        scores[mapId].sort((a, b) => b.score - a.score);
        scores[mapId] = scores[mapId].slice(0, 10);

        localStorage.setItem('hordeDefenseScores', JSON.stringify(scores));
    }

    calculateScore(stats) {
        // Score formula: waves * 100 + kills * 10 + gold * 0.5 + lives * 50
        return Math.round(
            stats.wavesCompleted * 100 +
            stats.enemiesKilled * 10 +
            stats.totalGoldEarned * 0.5 +
            stats.livesRemaining * 50
        );
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
            // Use existing Helius API endpoint (you'd need to implement this on your backend)
            const response = await fetch(`/api/nfts?wallet=${walletAddress}`);

            if (!response.ok) {
                throw new Error('Failed to fetch NFTs');
            }

            const nfts = await response.json();

            // Filter for MidEvil Orcs
            const midEvilOrcs = nfts.filter(nft =>
                nft.collection?.name?.includes('MidEvil') ||
                nft.name?.includes('MidEvil')
            );

            if (midEvilOrcs.length > 0) {
                this.walletStatus.textContent += ` | ${midEvilOrcs.length} MidEvil Orcs found!`;
                this.game.setNFTs(midEvilOrcs);
            } else {
                this.walletStatus.textContent += ' | No MidEvil Orcs found';
            }
        } catch (error) {
            console.error('NFT fetch error:', error);
            // Continue without NFTs
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameUI };
}
