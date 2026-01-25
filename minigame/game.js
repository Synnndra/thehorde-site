// game.js - Main game engine for Horde Defense

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Game state
        this.isRunning = false;
        this.isPaused = false;
        this.gameSpeed = 1;

        // Game settings
        this.selectedMap = 'tavern_road';
        this.totalWaves = 20;
        this.startingGold = 1000;
        this.startingLives = 20;

        // Game data
        this.gold = 0;
        this.lives = 0;
        this.currentWave = 0;
        this.waveActive = false;

        // Game objects
        this.towers = [];
        this.enemies = [];
        this.projectiles = [];

        // Wave spawning
        this.waveEnemies = [];
        this.spawnTimer = 0;
        this.spawnInterval = 0.8; // Seconds between spawns

        // Selection state
        this.selectedTowerType = null;
        this.selectedPlacedTower = null;
        this.hoverCell = null;

        // Stats tracking
        this.stats = {
            enemiesKilled: 0,
            totalGoldEarned: 0,
            wavesCompleted: 0,
            livesRemaining: 0
        };

        // NFT data
        this.playerNFTs = [];

        // Timing
        this.lastTime = 0;
        this.deltaTime = 0;

        // Map data
        this.currentMap = null;
        this.cellSize = 40;

        // Initialize UI
        this.ui = new GameUI(this);

        // Setup canvas events
        this.setupCanvasEvents();

        // Initial resize
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupCanvasEvents() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMove(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverCell = null;
        });
    }

    resizeCanvas() {
        const container = document.getElementById('game-container');
        const panel = document.getElementById('tower-panel');
        const topBar = document.getElementById('top-bar');

        // Calculate available space with fallbacks
        const panelWidth = panel ? panel.offsetWidth : 220;
        const topBarHeight = topBar ? topBar.offsetHeight : 60;

        let availableWidth = window.innerWidth - panelWidth - 20;
        let availableHeight = window.innerHeight - topBarHeight - 20;

        // Use container dimensions if valid
        if (container && container.clientWidth > 0) {
            availableWidth = container.clientWidth - panelWidth;
        }
        if (container && container.clientHeight > 0) {
            availableHeight = container.clientHeight;
        }

        // Ensure minimum dimensions
        availableWidth = Math.max(availableWidth, 400);
        availableHeight = Math.max(availableHeight, 300);

        // Set canvas size based on map
        if (this.currentMap) {
            // Calculate cell size to fit map
            const cellWidth = Math.floor(availableWidth / this.currentMap.gridWidth);
            const cellHeight = Math.floor(availableHeight / this.currentMap.gridHeight);
            this.cellSize = Math.max(Math.min(cellWidth, cellHeight, 50), 20);

            this.canvas.width = this.currentMap.gridWidth * this.cellSize;
            this.canvas.height = this.currentMap.gridHeight * this.cellSize;
        } else {
            this.canvas.width = availableWidth;
            this.canvas.height = availableHeight;
        }
    }

    handleCanvasClick(e) {
        if (this.isPaused) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        // Check if clicking on existing tower
        const existingTower = this.towers.find(t => t.gridX === gridX && t.gridY === gridY);

        if (existingTower) {
            // Select the tower
            this.ui.selectPlacedTower(existingTower);
            this.selectedTowerType = null;
            this.ui.updateTowerButtons();
        } else if (this.selectedTowerType) {
            // Try to place tower
            this.placeTower(this.selectedTowerType, gridX, gridY);
        } else {
            // Deselect
            this.ui.deselectPlacedTower();
        }
    }

    handleCanvasMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        this.hoverCell = { x: gridX, y: gridY };
    }

    placeTower(type, gridX, gridY) {
        // Check if buildable
        if (!isBuildable(this.selectedMap, gridX, gridY)) {
            return false;
        }

        // Check if already occupied
        if (this.towers.some(t => t.gridX === gridX && t.gridY === gridY)) {
            return false;
        }

        // Check cost
        const cost = TOWER_TYPES[type].baseCost;
        if (this.gold < cost) {
            return false;
        }

        // Place tower
        const tower = new Tower(type, gridX, gridY, this.cellSize);

        // Apply NFT bonus if available
        this.applyNFTBonus(tower);

        this.towers.push(tower);
        this.gold -= cost;
        this.ui.updateGold(this.gold);

        // Select the newly placed tower
        this.ui.selectPlacedTower(tower);
        this.selectedTowerType = null;
        this.ui.updateTowerButtons();

        return true;
    }

    upgradeTower() {
        if (!this.selectedPlacedTower) return;

        const cost = this.selectedPlacedTower.getUpgradeCost();
        if (cost === null || this.gold < cost) return;

        this.gold -= cost;
        this.selectedPlacedTower.upgrade();
        this.ui.updateGold(this.gold);
        this.ui.showPlacedTowerInfo(this.selectedPlacedTower);
    }

    sellTower() {
        if (!this.selectedPlacedTower) return;

        const value = this.selectedPlacedTower.getSellValue();
        this.gold += value;

        // Remove tower
        const index = this.towers.indexOf(this.selectedPlacedTower);
        if (index > -1) {
            this.towers.splice(index, 1);
        }

        this.ui.deselectPlacedTower();
        this.ui.updateGold(this.gold);
    }

    startGame() {
        // Reset game state
        this.gold = this.startingGold;
        this.lives = this.startingLives;
        this.currentWave = 0;
        this.waveActive = false;
        this.isRunning = true;
        this.isPaused = false;
        this.gameSpeed = 1;

        // Reset objects
        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.waveEnemies = [];

        // Reset stats
        this.stats = {
            enemiesKilled: 0,
            totalGoldEarned: 0,
            wavesCompleted: 0,
            livesRemaining: 0
        };

        // Load map
        this.currentMap = MAPS[this.selectedMap];
        if (!this.currentMap) {
            console.error('Map not found:', this.selectedMap);
            return;
        }

        // Resize canvas for map (with slight delay to ensure DOM is ready)
        this.resizeCanvas();
        setTimeout(() => this.resizeCanvas(), 100);

        // Update UI
        this.ui.showGameScreen();
        this.ui.updateGold(this.gold);
        this.ui.updateLives(this.lives);
        this.ui.updateWave(this.currentWave, this.totalWaves);
        this.ui.updateSpeed(this.gameSpeed);
        this.ui.populateTowerList();
        this.ui.updateWavePreview(this.currentWave + 1, this.currentMap.difficulty);
        this.ui.setWaveButtonState(false);

        // Start game loop
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    startWave() {
        if (this.waveActive) return;
        if (this.currentWave >= this.totalWaves) return;

        this.currentWave++;
        this.waveActive = true;

        // Generate enemies for this wave
        this.waveEnemies = generateWave(this.currentWave, this.currentMap.difficulty);
        this.spawnTimer = 0;

        this.ui.updateWave(this.currentWave, this.totalWaves);
        this.ui.setWaveButtonState(true);
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.ui.showPauseOverlay(this.isPaused);

        if (!this.isPaused) {
            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.gameLoop(time));
        }
    }

    toggleSpeed() {
        this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
        this.ui.updateSpeed(this.gameSpeed);
    }

    gameLoop(currentTime) {
        if (!this.isRunning || this.isPaused) return;

        // Calculate delta time
        this.deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1) * this.gameSpeed;
        this.lastTime = currentTime;

        // Update
        this.update();

        // Draw
        this.draw();

        // Continue loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update() {
        // Spawn enemies
        if (this.waveActive && this.waveEnemies.length > 0) {
            this.spawnTimer += this.deltaTime;
            if (this.spawnTimer >= this.spawnInterval) {
                this.spawnTimer = 0;
                this.spawnEnemy();
            }
        }

        // Update towers
        this.towers.forEach(tower => {
            tower.update(this.deltaTime, this.enemies, this.projectiles, this.towers);
        });

        // Update enemies
        this.enemies.forEach(enemy => {
            enemy.update(this.deltaTime, this.towers);
        });

        // Update projectiles
        this.projectiles.forEach(projectile => {
            projectile.update(this.deltaTime);
        });

        // Check for dead enemies
        this.enemies = this.enemies.filter(enemy => {
            if (enemy.isDead) {
                this.gold += enemy.goldReward;
                this.stats.enemiesKilled++;
                this.stats.totalGoldEarned += enemy.goldReward;
                this.ui.updateGold(this.gold);
                return false;
            }
            if (enemy.reachedEnd) {
                this.lives -= enemy.damage;
                this.ui.updateLives(this.lives);
                if (this.lives <= 0) {
                    this.gameOver(false);
                }
                return false;
            }
            return true;
        });

        // Remove inactive projectiles
        this.projectiles = this.projectiles.filter(p => p.isActive);

        // Check wave completion
        if (this.waveActive && this.waveEnemies.length === 0 && this.enemies.length === 0) {
            this.waveComplete();
        }
    }

    spawnEnemy() {
        if (this.waveEnemies.length === 0) return;

        const enemyType = this.waveEnemies.shift();

        // Select random spawn point and corresponding path
        const spawnIndex = Math.floor(Math.random() * this.currentMap.spawnPoints.length);
        const path = this.currentMap.paths[spawnIndex % this.currentMap.paths.length];

        const enemy = new Enemy(enemyType, path, this.cellSize, this.currentWave);
        this.enemies.push(enemy);
    }

    waveComplete() {
        this.waveActive = false;
        this.stats.wavesCompleted = this.currentWave;

        if (this.currentWave >= this.totalWaves) {
            // Victory!
            this.gameOver(true);
        } else {
            // Prepare next wave
            this.ui.setWaveButtonState(false);
            this.ui.updateWavePreview(this.currentWave + 1, this.currentMap.difficulty);
        }
    }

    gameOver(victory) {
        this.isRunning = false;
        this.stats.livesRemaining = Math.max(0, this.lives);

        if (victory) {
            this.ui.showVictory(this.stats);
        } else {
            this.ui.showGameOver(this.stats);
        }
    }

    draw() {
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = this.currentMap.groundColor || '#1a2f1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw paths
        this.drawPaths();

        // Draw tavern (end point)
        this.drawTavern();

        // Draw buildable areas highlight when placing
        if (this.selectedTowerType && this.hoverCell) {
            this.drawPlacementPreview();
        }

        // Draw towers
        this.towers.forEach(tower => tower.draw(ctx));

        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(ctx));

        // Draw projectiles
        this.projectiles.forEach(projectile => projectile.draw(ctx));
    }

    drawGrid() {
        const ctx = this.ctx;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;

        // Vertical lines
        for (let x = 0; x <= this.currentMap.gridWidth; x++) {
            ctx.beginPath();
            ctx.moveTo(x * this.cellSize, 0);
            ctx.lineTo(x * this.cellSize, this.canvas.height);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= this.currentMap.gridHeight; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * this.cellSize);
            ctx.lineTo(this.canvas.width, y * this.cellSize);
            ctx.stroke();
        }
    }

    drawPaths() {
        const ctx = this.ctx;

        // Draw path areas
        ctx.fillStyle = this.currentMap.pathColor || '#3d2817';

        for (let y = 0; y < this.currentMap.gridHeight; y++) {
            for (let x = 0; x < this.currentMap.gridWidth; x++) {
                if (this.currentMap.buildableAreas[y][x] === 2) {
                    ctx.fillRect(
                        x * this.cellSize,
                        y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }

        // Draw path lines
        this.currentMap.paths.forEach(path => {
            ctx.beginPath();
            ctx.moveTo(
                path[0].x * this.cellSize + this.cellSize / 2,
                path[0].y * this.cellSize + this.cellSize / 2
            );

            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(
                    path[i].x * this.cellSize + this.cellSize / 2,
                    path[i].y * this.cellSize + this.cellSize / 2
                );
            }

            ctx.strokeStyle = 'rgba(139, 69, 19, 0.5)';
            ctx.lineWidth = this.cellSize * 0.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        });
    }

    drawTavern() {
        const ctx = this.ctx;
        const tavern = this.currentMap.tavernPosition;
        const x = tavern.x * this.cellSize + this.cellSize / 2;
        const y = tavern.y * this.cellSize + this.cellSize / 2;
        const size = this.cellSize * 0.8;

        // Draw tavern building
        ctx.save();

        // Base
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(x - size / 2, y - size / 2, size, size);

        // Roof
        ctx.beginPath();
        ctx.moveTo(x - size / 2 - 5, y - size / 2);
        ctx.lineTo(x, y - size / 2 - 15);
        ctx.lineTo(x + size / 2 + 5, y - size / 2);
        ctx.fillStyle = '#8b4513';
        ctx.fill();

        // Door
        ctx.fillStyle = '#3d2817';
        ctx.fillRect(x - 5, y, 10, size / 2);

        // Sign
        ctx.fillStyle = '#c9a227';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🍺', x, y - 5);

        // Glow effect
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(201, 162, 39, 0.3)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }

    drawPlacementPreview() {
        const ctx = this.ctx;
        const { x, y } = this.hoverCell;

        if (x < 0 || x >= this.currentMap.gridWidth || y < 0 || y >= this.currentMap.gridHeight) {
            return;
        }

        const canPlace = isBuildable(this.selectedMap, x, y) &&
            !this.towers.some(t => t.gridX === x && t.gridY === y);

        const centerX = x * this.cellSize + this.cellSize / 2;
        const centerY = y * this.cellSize + this.cellSize / 2;

        // Draw placement indicator
        ctx.fillStyle = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);

        ctx.strokeStyle = canPlace ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);

        // Draw range preview if can place
        if (canPlace && this.selectedTowerType) {
            const towerData = TOWER_TYPES[this.selectedTowerType];
            const range = towerData.levels[0].range * this.cellSize;

            ctx.beginPath();
            ctx.arc(centerX, centerY, range, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // NFT Integration
    setNFTs(nfts) {
        this.playerNFTs = nfts;
    }

    applyNFTBonus(tower) {
        if (this.playerNFTs.length === 0) return;

        // Simple bonus: any NFT gives 5% damage bonus
        // Could be expanded to check specific traits
        tower.isNftTower = true;
        tower.nftBonus = 0.05 * this.playerNFTs.length; // 5% per NFT, stacking

        // Cap at 25% bonus
        tower.nftBonus = Math.min(tower.nftBonus, 0.25);
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
