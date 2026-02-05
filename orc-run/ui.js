// ui.js - UI management for Orc Run

class GameUI {
    constructor(game) {
        this.game = game;
        this.initElements();
        this.initEventListeners();
        this.loadHighScores();
    }

    initElements() {
        // Screens
        this.startScreen = document.getElementById('start-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameoverScreen = document.getElementById('gameover-screen');
        this.pauseOverlay = document.getElementById('pause-overlay');

        // HUD
        this.distanceDisplay = document.getElementById('distance-display');
        this.coinsDisplay = document.getElementById('coins-display');
        this.scoreDisplay = document.getElementById('score-display');

        // Buttons
        this.startGameBtn = document.getElementById('start-game-btn');
        this.soundBtn = document.getElementById('sound-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resumeBtn = document.getElementById('resume-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.quitBtn = document.getElementById('quit-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.mainMenuBtn = document.getElementById('main-menu-btn');

        // Wallet
        this.connectWalletBtn = document.getElementById('connect-wallet-btn');
        this.walletStatus = document.getElementById('wallet-status');

        // High scores
        this.highScoreList = document.getElementById('high-score-list');
    }

    initEventListeners() {
        this.startGameBtn.addEventListener('click', () => this.game.startGame());

        this.pauseBtn.addEventListener('click', () => this.game.togglePause());
        this.resumeBtn.addEventListener('click', () => this.game.togglePause());

        this.soundBtn.addEventListener('click', () => {
            const muted = soundManager.toggleMute();
            this.soundBtn.textContent = muted ? '🔇' : '🔊';
        });

        this.restartBtn.addEventListener('click', () => {
            this.game.togglePause();
            this.game.startGame();
        });

        this.quitBtn.addEventListener('click', () => {
            this.game.togglePause();
            this.game.isRunning = false;
            this.showStartScreen();
        });

        this.retryBtn.addEventListener('click', () => this.game.startGame());
        this.mainMenuBtn.addEventListener('click', () => this.showStartScreen());

        // High score save
        document.getElementById('save-score-btn').addEventListener('click', async () => {
            const name = document.getElementById('player-name').value.trim() || 'Anonymous';
            await this.saveHighScore(name);
            document.getElementById('highscore-entry').classList.add('hidden');
            this.showStartScreen();
        });

        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('save-score-btn').click();
            }
        });

        // Wallet connect
        this.connectWalletBtn.addEventListener('click', () => this.connectWallet());
    }

    showStartScreen() {
        this.startScreen.classList.remove('hidden');
        this.gameScreen.classList.add('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.loadHighScores();
    }

    showGameScreen() {
        this.startScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
    }

    showGameOver(stats) {
        this.gameScreen.classList.add('hidden');
        this.gameoverScreen.classList.remove('hidden');

        this.pendingStats = stats;
        const score = this.calculateScore(stats);

        document.getElementById('final-score').textContent = score.toLocaleString();
        document.getElementById('final-distance').textContent = Math.floor(stats.distance) + 'm';
        document.getElementById('final-coins').textContent = stats.coins;

        const highscoreEntry = document.getElementById('highscore-entry');
        if (score > 0) {
            highscoreEntry.classList.remove('hidden');
            document.getElementById('player-name').value = localStorage.getItem('lastPlayerName') || '';
            document.getElementById('player-name').focus();
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

    updateHUD(distance, coins, score) {
        this.distanceDisplay.textContent = Math.floor(distance) + 'm';
        this.coinsDisplay.textContent = coins;
        this.scoreDisplay.textContent = Math.floor(score).toLocaleString();
    }

    calculateScore(stats) {
        const nftMultiplier = 1 + Math.min(this.game.playerNFTs.length * 0.05, 0.25);
        const doubleMultiplier = stats.doublePointsScore || 0;
        const baseScore = Math.floor(stats.distance) + stats.coins * 10 + doubleMultiplier;
        return Math.round(baseScore * nftMultiplier);
    }

    // Leaderboard
    async loadHighScores() {
        this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">Loading leaderboard...</p>';

        try {
            const response = await fetch('/api/leaderboard-orcrun');
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to load');

            const scores = (data.scores || []).slice(0, 10);

            if (scores.length === 0) {
                this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">No scores yet! Be the first!</p>';
                return;
            }

            this.highScoreList.innerHTML = '';
            scores.forEach((entry, index) => {
                const div = document.createElement('div');
                div.className = 'score-entry';

                const rank = document.createElement('span');
                rank.className = 'rank';
                rank.textContent = `#${index + 1}`;

                const name = document.createElement('span');
                name.className = 'player-name';
                name.textContent = entry.name || 'Anonymous';

                const dist = document.createElement('span');
                dist.className = 'distance-info';
                dist.textContent = `${entry.distance || 0}m`;

                const score = document.createElement('span');
                score.className = 'score-value';
                score.textContent = (entry.score || 0).toLocaleString();

                div.appendChild(rank);
                div.appendChild(name);
                div.appendChild(dist);
                div.appendChild(score);
                this.highScoreList.appendChild(div);
            });
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
            this.highScoreList.innerHTML = '<p style="color: #b0a890; text-align: center;">Could not load leaderboard</p>';
        }
    }

    async saveHighScore(playerName) {
        localStorage.setItem('lastPlayerName', playerName);
        const stats = this.pendingStats;
        const score = this.calculateScore(stats);

        try {
            await fetch('/api/leaderboard-orcrun', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: playerName || 'Anonymous',
                    score: score,
                    distance: Math.floor(stats.distance),
                    coins: stats.coins
                })
            });
        } catch (error) {
            console.error('Failed to save score:', error);
        }

        this.loadHighScores();
    }

    // Wallet/NFT functions
    async connectWallet() {
        this.walletStatus.textContent = 'Connecting...';

        try {
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

            await this.fetchNFTs(publicKey);
        } catch (error) {
            console.error('Wallet connection error:', error);
            this.walletStatus.textContent = 'Connection failed. Please try again.';
        }
    }

    async fetchNFTs(walletAddress) {
        try {
            this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | Fetching NFTs...`;

            const response = await fetch('/api/helius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'orcrun-nfts',
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: walletAddress,
                        page: 1,
                        limit: 1000,
                        displayOptions: { showCollectionMetadata: true }
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to fetch NFTs');

            const data = await response.json();
            const nfts = data.result?.items || [];

            const MIDEVIL_COLLECTION = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
            const GRAVEYARD_COLLECTION = 'DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF';

            const midEvilOrcs = nfts.filter(nft => {
                const grouping = nft.grouping || [];
                const collections = grouping
                    .filter(g => g.group_key === 'collection')
                    .map(g => g.group_value);
                const hasMidEvil = collections.includes(MIDEVIL_COLLECTION);
                const hasGraveyard = collections.includes(GRAVEYARD_COLLECTION);
                const name = nft.content?.metadata?.name || '';
                const hasGraveyardInName = name.toLowerCase().includes('graveyard');
                const isBurnt = nft.burnt === true;
                const isOrc = name.toLowerCase().includes('orc');
                return hasMidEvil && !hasGraveyard && !hasGraveyardInName && !isBurnt && isOrc;
            });

            if (midEvilOrcs.length > 0) {
                this.game.playerNFTs = midEvilOrcs;
                const bonusPercent = Math.min(midEvilOrcs.length * 5, 25);
                this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | ${midEvilOrcs.length} Orc${midEvilOrcs.length > 1 ? 's' : ''} (+${bonusPercent}% score)`;
            } else {
                this.walletStatus.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} | No MidEvil Orcs found`;
            }
        } catch (error) {
            console.error('NFT fetch error:', error);
            this.walletStatus.textContent += ' | Failed to load NFTs';
        }
    }
}
