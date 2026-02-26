// game.js - Main game engine for Horde Defense (Sprite-enabled Version)

// Sprite loading status
let spritesLoaded = false;

// Particle class for visual effects
class Particle {
    constructor(x, y, type, options = {}) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.life = options.life || 1;
        this.maxLife = this.life;
        this.isActive = true;

        switch (type) {
            case 'explosion':
                this.vx = (Math.random() - 0.5) * 200;
                this.vy = (Math.random() - 0.5) * 200;
                this.size = Math.random() * 8 + 4;
                this.color = options.color || '#ff6600';
                this.gravity = 100;
                break;
            case 'gold':
                this.vx = (Math.random() - 0.5) * 50;
                this.vy = -100 - Math.random() * 50;
                this.size = 8;
                this.text = '+' + (options.amount || 10);
                this.gravity = 50;
                break;
            case 'smoke':
                this.vx = (Math.random() - 0.5) * 20;
                this.vy = -30 - Math.random() * 20;
                this.size = Math.random() * 10 + 5;
                this.color = 'rgba(100, 100, 100, 0.5)';
                this.gravity = -10;
                break;
            case 'spark':
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 100 + 50;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.size = Math.random() * 3 + 1;
                this.color = options.color || '#ffff00';
                this.gravity = 0;
                break;
            case 'trail':
                this.vx = 0;
                this.vy = 0;
                this.size = options.size || 4;
                this.color = options.color || '#ff0000';
                this.gravity = 0;
                this.life = 0.3;
                this.maxLife = 0.3;
                break;
            case 'levelup':
                this.vx = 0;
                this.vy = -50;
                this.size = 20;
                this.text = '★ LEVEL UP ★';
                this.color = '#c9a227';
                this.gravity = 0;
                break;
            case 'text':
                this.vx = 0;
                this.vy = -60;
                this.size = options.size || 14;
                this.text = options.text || '';
                this.color = options.color || '#ffffff';
                this.gravity = 0;
                this.life = options.life || 1.2;
                this.maxLife = this.life;
                break;
            case 'impact_ring':
                this.vx = 0;
                this.vy = 0;
                this.size = options.size || 5;
                this.maxSize = options.maxSize || 20;
                this.color = options.color || '#9932CC';
                this.gravity = 0;
                this.life = 0.3;
                this.maxLife = 0.3;
                break;
        }
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += (this.gravity || 0) * deltaTime;
        this.life -= deltaTime;

        if (this.life <= 0) {
            this.isActive = false;
        }
    }

    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);

        ctx.save();
        ctx.globalAlpha = alpha;

        switch (this.type) {
            case 'explosion':
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.fill();
                break;
            case 'gold':
                ctx.font = 'bold 16px Cinzel, serif';
                ctx.fillStyle = '#ffd700';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                ctx.strokeText(this.text, this.x, this.y);
                ctx.fillText(this.text, this.x, this.y);
                break;
            case 'smoke':
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(100, 100, 100, ${alpha * 0.3})`;
                ctx.fill();
                break;
            case 'spark':
            case 'trail':
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 5;
                ctx.fill();
                break;
            case 'levelup':
                ctx.font = 'bold 14px Cinzel, serif';
                ctx.fillStyle = this.color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                ctx.strokeText(this.text, this.x, this.y);
                ctx.fillText(this.text, this.x, this.y);
                break;
            case 'text':
                ctx.font = `bold ${this.size}px Cinzel, serif`;
                ctx.fillStyle = this.color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                ctx.strokeText(this.text, this.x, this.y);
                ctx.fillText(this.text, this.x, this.y);
                break;
            case 'impact_ring': {
                const ringProgress = 1 - (this.life / this.maxLife);
                const ringSize = this.size + (this.maxSize - this.size) * ringProgress;
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringSize, 0, Math.PI * 2);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2 * alpha;
                ctx.stroke();
                break;
            }
        }

        ctx.restore();
    }
}

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
        this.startingGold = 500;
        this.startingLives = 10;

        // Game data
        this.gold = 0;
        this.lives = 0;
        this.currentWave = 0;
        this.waveActive = false;

        // Game objects
        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];

        // Environmental decorations
        this.decorations = [];
        this.torches = [];

        // Wave spawning
        this.waveEnemies = [];
        this.spawnTimer = 0;
        this.spawnInterval = 0.5;

        // Selection state
        this.selectedTowerType = null;
        this.selectedPlacedTower = null;
        this.hoverCell = null;

        // Stats tracking
        this.stats = {
            enemiesKilled: 0,
            totalGoldEarned: 0,
            wavesCompleted: 0,
            livesRemaining: 0,
            speedBonusPoints: 0
        };

        // Kill streak tracking
        this.killStreak = 0;
        this.killStreakTimer = 0;
        this.lastKillStreakAnnounced = 0;

        // Screen shake
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };

        // VFX toggle (V key to disable)
        this.vfxEnabled = true;

        // Screen flash overlay (boss death, wave complete)
        this.screenFlash = { alpha: 0, color: '#ffffff', decay: 3 };

        // Ambient particles (embers near torches, fireflies on grass)
        this.ambientParticles = [];

        // Water tile positions for shimmer effect
        this.waterTiles = [];

        // Wave transition fade overlay
        this.waveFade = { alpha: 0, decay: 1.5 };

        // Rain system
        this.rainDrops = [];
        this.rainActive = false;

        // Cached vignette gradient
        this.vignetteGradient = null;

        // Announcements
        this.announcement = null;

        // NFT data
        this.playerNFTs = [];

        // Timing
        this.lastTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;

        // Map data
        this.currentMap = null;
        this.cellSize = 40;

        // Cached background canvas (for performance)
        this.bgCanvas = null;
        this.bgCtx = null;
        this.bgDirty = true;

        // Tavern smoke timer
        this.smokeTimer = 0;

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

        const panelWidth = panel ? panel.offsetWidth : 220;
        const topBarHeight = topBar ? topBar.offsetHeight : 60;

        let availableWidth = window.innerWidth - panelWidth - 20;
        let availableHeight = window.innerHeight - topBarHeight - 20;

        if (container && container.clientWidth > 0) {
            availableWidth = container.clientWidth - panelWidth;
        }
        if (container && container.clientHeight > 0) {
            availableHeight = container.clientHeight;
        }

        availableWidth = Math.max(availableWidth, 400);
        availableHeight = Math.max(availableHeight, 300);

        if (this.currentMap) {
            const cellWidth = Math.floor(availableWidth / this.currentMap.gridWidth);
            const cellHeight = Math.floor(availableHeight / this.currentMap.gridHeight);
            this.cellSize = Math.max(Math.min(cellWidth, cellHeight, 50), 20);

            this.canvas.width = this.currentMap.gridWidth * this.cellSize;
            this.canvas.height = this.currentMap.gridHeight * this.cellSize;
            this.bgDirty = true; // Re-render background on resize
            this.vignetteGradient = null; // Re-cache vignette on resize
        } else {
            this.canvas.width = availableWidth;
            this.canvas.height = availableHeight;
        }
    }

    handleCanvasClick(e) {
        if (this.isPaused) return;

        const rect = this.canvas.getBoundingClientRect();
        // Scale click coordinates to match canvas resolution vs CSS display size
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        const existingTower = this.towers.find(t => t.gridX === gridX && t.gridY === gridY);

        if (existingTower) {
            this.ui.selectPlacedTower(existingTower);
            this.selectedTowerType = null;
            this.ui.updateTowerButtons();
        } else if (this.selectedTowerType) {
            this.placeTower(this.selectedTowerType, gridX, gridY);
        } else {
            this.ui.deselectPlacedTower();
        }
    }

    handleCanvasMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale coordinates to match canvas resolution vs CSS display size
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        this.hoverCell = { x: gridX, y: gridY };
    }

    placeTower(type, gridX, gridY) {
        if (!isBuildable(this.currentMap, gridX, gridY)) {
            return false;
        }

        if (this.towers.some(t => t.gridX === gridX && t.gridY === gridY)) {
            return false;
        }

        const cost = TOWER_TYPES[type].baseCost;
        if (this.gold < cost) {
            if (typeof soundManager !== 'undefined') soundManager.error();
            return false;
        }

        const tower = new Tower(type, gridX, gridY, this.cellSize);
        tower.setInitialRotation(this.currentMap);
        this.applyNFTBonus(tower);

        this.towers.push(tower);
        this.gold -= cost;
        this.ui.updateGold(this.gold);

        // Placement effect (reduced for performance)
        for (let i = 0; i < 4; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'spark', { color: '#00ff00' }));
        }
        if (typeof soundManager !== 'undefined') soundManager.towerPlace();

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

        // Level up effect (reduced for performance)
        const tower = this.selectedPlacedTower;
        this.particles.push(new Particle(tower.x, tower.y - 20, 'levelup'));
        for (let i = 0; i < 6; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'spark', { color: '#c9a227' }));
        }
        if (typeof soundManager !== 'undefined') soundManager.towerUpgrade();
    }

    sellTower() {
        if (!this.selectedPlacedTower) return;

        const value = this.selectedPlacedTower.getSellValue();
        const tower = this.selectedPlacedTower;
        this.gold += value;

        // Sell effect (reduced for performance)
        for (let i = 0; i < 3; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'smoke'));
        }
        if (typeof soundManager !== 'undefined') soundManager.towerSell();

        const index = this.towers.indexOf(this.selectedPlacedTower);
        if (index > -1) {
            this.towers.splice(index, 1);
        }

        this.ui.deselectPlacedTower();
        this.ui.updateGold(this.gold);
    }

    // Render static elements to offscreen canvas for performance
    renderBackground() {
        if (!this.bgCanvas) {
            this.bgCanvas = document.createElement('canvas');
            this.bgCtx = this.bgCanvas.getContext('2d');
        }

        this.bgCanvas.width = this.canvas.width;
        this.bgCanvas.height = this.canvas.height;

        const ctx = this.bgCtx;

        // Clear and fill with ground color
        ctx.fillStyle = this.currentMap.groundColor || '#1a2f1a';
        ctx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);

        // Draw decorations
        this.drawDecorationsToCtx(ctx);

        // Draw grid
        this.drawGridToCtx(ctx);

        // Draw paths
        this.drawPathsToCtx(ctx);

        // Draw static tavern
        this.drawTavernToCtx(ctx);

        this.bgDirty = false;
    }

    generateDecorations() {
        this.decorations = [];
        this.torches = [];
        this.waterTiles = [];

        const map = this.currentMap;

        for (let y = 0; y < map.gridHeight; y++) {
            for (let x = 0; x < map.gridWidth; x++) {
                const cellType = map.buildableAreas[y][x];

                // Collect water tile positions for animated shimmer
                if (cellType === 3) {
                    this.waterTiles.push({
                        x: x * this.cellSize + this.cellSize / 2,
                        y: y * this.cellSize + this.cellSize / 2,
                        px: x * this.cellSize,
                        py: y * this.cellSize
                    });
                }

                // Add decorations on buildable areas (not paths)
                if (cellType === 1 && Math.random() < 0.15) {
                    const decorType = Math.random();
                    let type;
                    if (decorType < 0.4) type = 'tree';
                    else if (decorType < 0.7) type = 'rock';
                    else if (decorType < 0.85) type = 'bush';
                    else type = 'grass';

                    this.decorations.push({
                        type,
                        x: x * this.cellSize + Math.random() * this.cellSize * 0.6 + this.cellSize * 0.2,
                        y: y * this.cellSize + Math.random() * this.cellSize * 0.6 + this.cellSize * 0.2,
                        size: Math.random() * 0.3 + 0.7,
                        rotation: Math.random() * Math.PI * 2
                    });
                }

                // Add torches on the edge of paths (on grass tiles adjacent to path)
                if (cellType === 1 && Math.random() < 0.06) {
                    // Check if this grass tile is adjacent to a path
                    const adjacentToPath =
                        (x > 0 && this.currentMap.buildableAreas[y][x-1] === 2) ||
                        (x < this.currentMap.gridWidth - 1 && this.currentMap.buildableAreas[y][x+1] === 2) ||
                        (y > 0 && this.currentMap.buildableAreas[y-1][x] === 2) ||
                        (y < this.currentMap.gridHeight - 1 && this.currentMap.buildableAreas[y+1][x] === 2);

                    if (adjacentToPath) {
                        this.torches.push({
                            x: x * this.cellSize + this.cellSize / 2,
                            y: y * this.cellSize + this.cellSize / 2,
                            flicker: Math.random() * Math.PI * 2
                        });
                    }
                }
            }
        }
    }

    async startGame() {
        // Request game session token for leaderboard validation
        try {
            const tokenRes = await fetch('/api/game-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: 'horde' })
            });
            const tokenData = await tokenRes.json();
            this.gameToken = tokenData.token || null;
        } catch (e) {
            console.warn('Failed to get game token:', e);
            this.gameToken = null;
        }

        // Initialize sound system
        if (typeof soundManager !== 'undefined') {
            soundManager.init();
        }

        // Load sprites if not already loaded
        if (typeof spriteManager !== 'undefined' && !spriteManager.isLoaded()) {
            this.ui.showLoadingScreen('Loading sprites...');
            try {
                await spriteManager.loadAll((loaded, total) => {
                    const percent = Math.round((loaded / total) * 100);
                    this.ui.updateLoadingProgress(percent);
                });
                spritesLoaded = true;
            } catch (e) {
                console.warn('Sprite loading failed, using fallback graphics:', e);
            }
        }

        // Check if using procedural map
        if (this.selectedMap.startsWith('random_')) {
            const difficulty = this.selectedMap.split('_')[1];
            this.currentMap = generateProceduralMap(difficulty);
        } else {
            this.currentMap = MAPS[this.selectedMap];
        }

        // Starting gold bonus for harder maps
        const mapDifficulty = this.currentMap?.difficulty || 'easy';
        const mapGoldBonus = {
            easy: 0,
            medium: 50,
            hard: 150
        }[mapDifficulty] || 0;

        this.gold = this.startingGold + mapGoldBonus;
        this.lives = this.startingLives;
        this.currentWave = 0;
        this.waveActive = false;
        this.isRunning = true;
        this.isPaused = false;
        this.gameSpeed = 1;
        this.gameTime = 0;

        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];
        this.waveEnemies = [];
        this.ambientParticles = [];
        this.rainDrops = [];
        this.rainActive = false;
        this.screenFlash = { alpha: 0, color: '#ffffff', decay: 3 };
        this.waveFade = { alpha: 0, decay: 1.5 };
        this.vignetteGradient = null;

        this.killStreak = 0;
        this.killStreakTimer = 0;
        this.announcement = null;

        this.stats = {
            enemiesKilled: 0,
            totalGoldEarned: 0,
            wavesCompleted: 0,
            livesRemaining: 0,
            speedBonusPoints: 0
        };

        // currentMap already set above for random maps, load static map if not set
        if (!this.currentMap) {
            this.currentMap = MAPS[this.selectedMap];
        }
        if (!this.currentMap) {
            console.error('Map not found:', this.selectedMap);
            return;
        }

        this.resizeCanvas();
        setTimeout(() => this.resizeCanvas(), 100);

        this.generateDecorations();

        this.ui.showGameScreen();
        this.ui.updateGold(this.gold);
        this.ui.updateLives(this.lives);
        this.ui.updateWave(this.currentWave, this.totalWaves);
        this.ui.updateSpeed(this.gameSpeed);
        this.ui.populateTowerList();
        this.ui.updateWavePreview(this.currentWave + 1, this.currentMap.difficulty);
        this.ui.setWaveButtonState(false);

        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    startWave() {
        if (this.waveActive) return;
        if (this.currentWave >= this.totalWaves) return;

        this.currentWave++;
        this.waveActive = true;

        this.waveEnemies = generateWave(this.currentWave, this.currentMap.difficulty);
        this.spawnTimer = 0;

        // Build enemy composition sub-text
        const counts = {};
        this.waveEnemies.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
        const compParts = [];
        for (const [type, count] of Object.entries(counts)) {
            const name = (ENEMY_TYPES[type] || BOSS_TYPES[type] || {}).name || type;
            compParts.push(`${count}x ${name}`);
        }
        const compositionText = compParts.join(' · ');

        // Check for boss wave
        const hasBoss = this.waveEnemies.some(e => BOSS_TYPES[e]);
        if (hasBoss) {
            this.showAnnouncement('⚠️ BOSS INCOMING! ⚠️', '#ff4444', 3, compositionText);
            this.triggerScreenShake(10, 0.5);
            if (typeof soundManager !== 'undefined') soundManager.bossWarning();
            // Boss intro: slower, darker fade
            if (this.vfxEnabled) this.waveFade = { alpha: 0.6, decay: 0.8 };
        } else {
            this.showAnnouncement(`Wave ${this.currentWave}`, '#c9a227', 1.5, compositionText);
            if (typeof soundManager !== 'undefined') soundManager.waveStart();
            // Wave start: brief dark overlay
            if (this.vfxEnabled) this.waveFade = { alpha: 0.4, decay: 1.5 };
        }

        this.ui.updateWave(this.currentWave, this.totalWaves);
        this.ui.setWaveButtonState(true);
    }

    showAnnouncement(text, color, duration, subText) {
        this.announcement = {
            text,
            color,
            duration,
            maxDuration: duration,
            y: this.canvas.height / 2,
            subText: subText || null,
            sparksSpawned: false
        };
    }

    triggerScreenShake(intensity, duration) {
        this.screenShake.intensity = intensity;
        this.screenShake.duration = duration;
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

        this.deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1) * this.gameSpeed;
        this.lastTime = currentTime;
        this.gameTime += this.deltaTime;

        this.update();
        this.draw();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update() {
        // Update screen shake
        if (this.screenShake.duration > 0) {
            this.screenShake.duration -= this.deltaTime;
            const intensity = this.screenShake.intensity * (this.screenShake.duration / 0.5);
            this.screenShake.x = (Math.random() - 0.5) * intensity;
            this.screenShake.y = (Math.random() - 0.5) * intensity;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }

        // Update announcement
        if (this.announcement) {
            this.announcement.duration -= this.deltaTime;
            if (this.announcement.duration <= 0) {
                this.announcement = null;
            }
        }

        // Update screen flash
        if (this.screenFlash.alpha > 0) {
            this.screenFlash.alpha -= this.screenFlash.decay * this.deltaTime;
            if (this.screenFlash.alpha < 0) this.screenFlash.alpha = 0;
        }

        // Update wave fade
        if (this.waveFade.alpha > 0) {
            this.waveFade.alpha -= this.waveFade.decay * this.deltaTime;
            if (this.waveFade.alpha < 0) this.waveFade.alpha = 0;
        }

        // Update kill streak timer
        if (this.killStreakTimer > 0) {
            this.killStreakTimer -= this.deltaTime;
            if (this.killStreakTimer <= 0) {
                this.killStreak = 0;
                this.lastKillStreakAnnounced = 0;
            }
        }

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
            tower.update(this.deltaTime, this.enemies, this.projectiles, this.towers, this.particles);
        });

        // Update enemies
        this.enemies.forEach(enemy => {
            enemy.update(this.deltaTime, this.towers, this.particles);
        });

        // Update projectiles
        this.projectiles.forEach(projectile => {
            projectile.update(this.deltaTime, this.particles);
        });

        // Update particles
        this.particles.forEach(p => p.update(this.deltaTime));
        this.particles = this.particles.filter(p => p.isActive);

        // Tavern smoke
        this.smokeTimer += this.deltaTime;
        if (this.smokeTimer >= 0.3) {
            this.smokeTimer = 0;
            const tavern = this.currentMap.tavernPosition;
            this.particles.push(new Particle(
                tavern.x * this.cellSize + this.cellSize / 2 + 5,
                tavern.y * this.cellSize,
                'smoke'
            ));
        }

        // Update ambient particles (embers & fireflies)
        if (this.vfxEnabled) {
            // Spawn embers near torches
            if (this.ambientParticles.length < 30 && this.torches.length > 0 && Math.random() < 0.15) {
                const torch = this.torches[Math.floor(Math.random() * this.torches.length)];
                this.ambientParticles.push({
                    x: torch.x + (Math.random() - 0.5) * 20,
                    y: torch.y - 10,
                    vx: (Math.random() - 0.5) * 8,
                    vy: -12 - Math.random() * 8,
                    size: Math.random() * 2 + 1,
                    life: 3 + Math.random() * 2,
                    maxLife: 5,
                    type: 'ember'
                });
            }
            // Spawn fireflies on grass areas
            if (this.ambientParticles.length < 30 && Math.random() < 0.05) {
                this.ambientParticles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 6,
                    vy: (Math.random() - 0.5) * 6,
                    size: Math.random() * 2 + 1,
                    life: 4 + Math.random() * 4,
                    maxLife: 8,
                    type: 'firefly',
                    phase: Math.random() * Math.PI * 2
                });
            }
            // Update existing ambient particles
            for (let i = this.ambientParticles.length - 1; i >= 0; i--) {
                const p = this.ambientParticles[i];
                p.x += p.vx * this.deltaTime;
                p.y += p.vy * this.deltaTime;
                p.life -= this.deltaTime;
                if (p.life <= 0) {
                    this.ambientParticles.splice(i, 1);
                }
            }
        }

        // Update rain
        if (this.vfxEnabled) {
            const mapName = (this.currentMap.name || '').toLowerCase();
            const rainThreshold = mapName.includes('forest') ? 10 : 15;
            this.rainActive = this.currentWave >= rainThreshold;
            if (this.rainActive) {
                while (this.rainDrops.length < 80) {
                    this.rainDrops.push({
                        x: Math.random() * this.canvas.width,
                        y: Math.random() * this.canvas.height,
                        speed: 300 + Math.random() * 200,
                        length: 8 + Math.random() * 12
                    });
                }
                for (let i = 0; i < this.rainDrops.length; i++) {
                    const drop = this.rainDrops[i];
                    drop.x -= drop.speed * 0.15 * this.deltaTime;
                    drop.y += drop.speed * this.deltaTime;
                    if (drop.y > this.canvas.height) {
                        drop.y = -drop.length;
                        drop.x = Math.random() * this.canvas.width;
                    }
                }
            } else {
                this.rainDrops.length = 0;
            }
        }

        // Check for dead enemies
        this.enemies = this.enemies.filter(enemy => {
            if (enemy.isDead) {
                // Death explosion
                const colors = ['#ff6600', '#ff3300', '#ffcc00', '#ff0000'];
                const explosionCount = (this.vfxEnabled && enemy.isBoss) ? 22 : (this.vfxEnabled ? 10 : 6);
                for (let i = 0; i < explosionCount; i++) {
                    this.particles.push(new Particle(enemy.x, enemy.y, 'explosion', {
                        color: colors[Math.floor(Math.random() * colors.length)]
                    }));
                }

                // Smoke puffs on death
                if (this.vfxEnabled) {
                    const smokeCount = enemy.isBoss ? 6 : 3;
                    for (let i = 0; i < smokeCount; i++) {
                        this.particles.push(new Particle(
                            enemy.x + (Math.random() - 0.5) * 20,
                            enemy.y + (Math.random() - 0.5) * 20,
                            'smoke'
                        ));
                    }
                }

                // Gold particle
                this.particles.push(new Particle(enemy.x, enemy.y - 10, 'gold', {
                    amount: enemy.goldReward
                }));

                // Gold pickup sparkle
                if (this.vfxEnabled) {
                    for (let i = 0; i < 4; i++) {
                        this.particles.push(new Particle(enemy.x, enemy.y - 10, 'spark', {
                            color: '#ffd700'
                        }));
                    }
                }

                // Boss death = big shake + screen flash
                if (enemy.isBoss) {
                    this.triggerScreenShake(20, 0.8);
                    this.showAnnouncement('BOSS DEFEATED!', '#00ff00', 2);
                    if (typeof soundManager !== 'undefined') soundManager.bossDeath();
                    if (this.vfxEnabled) this.screenFlash = { alpha: 0.6, color: '#ffd700', decay: 2 };
                } else {
                    if (typeof soundManager !== 'undefined') soundManager.enemyDeath();
                }

                this.gold += enemy.goldReward;
                this.stats.enemiesKilled++;
                this.stats.totalGoldEarned += enemy.goldReward;
                this.ui.updateGold(this.gold);

                // Speed bonus for quick kills
                const speedBonus = enemy.calculateSpeedBonus(this.gameTime);
                if (speedBonus > 0) {
                    this.stats.speedBonusPoints += speedBonus;
                    // Show speed bonus as floating text
                    this.particles.push(new Particle(enemy.x, enemy.y - 25, 'text', {
                        text: `QUICK! +${speedBonus}`,
                        color: '#00ffff',
                        size: 14
                    }));
                }

                // Kill streak
                this.killStreak++;
                this.killStreakTimer = 2;

                if (this.killStreak >= 5 && this.killStreak > this.lastKillStreakAnnounced) {
                    let streakText = '';
                    if (this.killStreak >= 20) streakText = '🔥 UNSTOPPABLE! 🔥';
                    else if (this.killStreak >= 15) streakText = '💀 RAMPAGE! 💀';
                    else if (this.killStreak >= 10) streakText = '⚡ DOMINATING! ⚡';
                    else if (this.killStreak >= 5) streakText = '🗡️ KILLING SPREE! 🗡️';

                    if (streakText) {
                        this.showAnnouncement(streakText, '#ff00ff', 1.5);
                        this.lastKillStreakAnnounced = this.killStreak;
                    }
                }

                return false;
            }
            if (enemy.reachedEnd) {
                this.lives -= enemy.damage;
                this.ui.updateLives(this.lives);
                this.triggerScreenShake(8, 0.3);
                if (typeof soundManager !== 'undefined') soundManager.lifeLost();

                if (this.lives <= 0) {
                    this.gameOver(false);
                }
                return false;
            }
            return true;
        });

        this.projectiles = this.projectiles.filter(p => p.isActive);

        if (this.waveActive && this.waveEnemies.length === 0 && this.enemies.length === 0) {
            this.waveComplete();
        }
    }

    spawnEnemy() {
        if (this.waveEnemies.length === 0) return;

        const enemyType = this.waveEnemies.shift();
        const spawnIndex = Math.floor(Math.random() * this.currentMap.spawnPoints.length);
        const path = this.currentMap.paths[spawnIndex % this.currentMap.paths.length];

        const enemy = new Enemy(enemyType, path, this.cellSize, this.currentWave);
        enemy.spawnTime = this.gameTime; // Track spawn time for speed bonus
        this.enemies.push(enemy);

        // Spawn particles (reduced for performance)
        for (let i = 0; i < 2; i++) {
            this.particles.push(new Particle(enemy.x, enemy.y, 'smoke'));
        }
    }

    waveComplete() {
        this.waveActive = false;
        this.stats.wavesCompleted = this.currentWave;

        this.showAnnouncement('Wave Complete!', '#00ff00', 1.5);
        if (typeof soundManager !== 'undefined') soundManager.waveComplete();
        // Golden screen flash on wave complete
        if (this.vfxEnabled) this.screenFlash = { alpha: 0.3, color: '#ffd700', decay: 2 };

        if (this.currentWave >= this.totalWaves) {
            this.gameOver(true);
        } else {
            this.ui.setWaveButtonState(false);
            this.ui.updateWavePreview(this.currentWave + 1, this.currentMap.difficulty);
        }
    }

    gameOver(victory) {
        this.isRunning = false;
        this.stats.livesRemaining = Math.max(0, this.lives);

        if (victory) {
            this.ui.showVictory(this.stats);
            if (typeof soundManager !== 'undefined') soundManager.victory();
        } else {
            this.ui.showGameOver(this.stats);
            if (typeof soundManager !== 'undefined') soundManager.defeat();
        }
    }

    draw() {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(this.screenShake.x, this.screenShake.y);

        // Draw cached background (much faster than redrawing every frame)
        if (this.bgDirty || !this.bgCanvas) {
            this.renderBackground();
        }
        ctx.drawImage(this.bgCanvas, 0, 0);

        // Animated water shimmer
        if (this.vfxEnabled && this.waterTiles.length > 0) {
            this.drawAnimatedWater();
        }

        // Draw animated torches (need to update each frame)
        this.drawTorches();

        // Ambient particles (embers & fireflies) — behind towers
        if (this.vfxEnabled) {
            this.drawAmbientParticles();
        }

        // Draw placement preview
        if (this.selectedTowerType && this.hoverCell) {
            this.drawPlacementPreview();
        }

        // Draw towers
        this.towers.forEach(tower => tower.draw(ctx, this.gameTime));

        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(ctx, this.gameTime));

        // Draw projectiles
        this.projectiles.forEach(projectile => projectile.draw(ctx));

        // Draw particles
        this.particles.forEach(p => p.draw(ctx));

        // Screen flash overlay
        if (this.vfxEnabled && this.screenFlash.alpha > 0) {
            ctx.fillStyle = this.screenFlash.color;
            ctx.globalAlpha = this.screenFlash.alpha;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1;
        }

        // Wave transition fade
        if (this.vfxEnabled && this.waveFade.alpha > 0) {
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = this.waveFade.alpha;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1;
        }

        // Day/night lighting
        if (this.vfxEnabled) {
            this.drawDayNightOverlay();
        }

        // Rain
        if (this.vfxEnabled && this.rainActive) {
            this.drawRain();
        }

        // Draw announcement
        if (this.announcement) {
            this.drawAnnouncement();
        }

        // Vignette (very last overlay)
        if (this.vfxEnabled) {
            this.drawVignette();
        }

        ctx.restore();
    }

    drawDecorationsToCtx(ctx) {
        this.decorations.forEach(dec => {
            ctx.save();
            ctx.translate(dec.x, dec.y);

            // Use canvas drawing for decorations (sprites are isometric and don't fit well)
            switch (dec.type) {
                case 'tree':
                    // Tree trunk
                    ctx.fillStyle = '#4a3728';
                    ctx.fillRect(-3 * dec.size, -5 * dec.size, 6 * dec.size, 15 * dec.size);
                    // Tree foliage
                    ctx.beginPath();
                    ctx.arc(0, -12 * dec.size, 12 * dec.size, 0, Math.PI * 2);
                    ctx.fillStyle = '#2d5a27';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(-5 * dec.size, -8 * dec.size, 8 * dec.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(5 * dec.size, -8 * dec.size, 8 * dec.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'rock':
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 8 * dec.size, 6 * dec.size, dec.rotation, 0, Math.PI * 2);
                    ctx.fillStyle = '#5a5a5a';
                    ctx.fill();
                    ctx.strokeStyle = '#3a3a3a';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    break;

                case 'bush':
                    ctx.beginPath();
                    ctx.arc(0, 0, 6 * dec.size, 0, Math.PI * 2);
                    ctx.fillStyle = '#3d7a37';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(-4 * dec.size, 2 * dec.size, 5 * dec.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(4 * dec.size, 2 * dec.size, 5 * dec.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'grass':
                    ctx.strokeStyle = '#4a8a44';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < 5; i++) {
                        ctx.beginPath();
                        ctx.moveTo((i - 2) * 3, 5);
                        ctx.quadraticCurveTo((i - 2) * 3 + Math.sin(dec.rotation + i) * 3, -5, (i - 2) * 3, -10 * dec.size);
                        ctx.stroke();
                    }
                    break;
            }

            ctx.restore();
        });
    }

    drawGridToCtx(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= this.currentMap.gridWidth; x++) {
            ctx.beginPath();
            ctx.moveTo(x * this.cellSize, 0);
            ctx.lineTo(x * this.cellSize, this.canvas.height);
            ctx.stroke();
        }

        for (let y = 0; y <= this.currentMap.gridHeight; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * this.cellSize);
            ctx.lineTo(this.canvas.width, y * this.cellSize);
            ctx.stroke();
        }
    }

    drawPathsToCtx(ctx) {
        const hasPathSprite = typeof spriteManager !== 'undefined' && spriteManager.has('map', 'path');
        const hasGrassSprite = typeof spriteManager !== 'undefined' && spriteManager.has('map', 'grass');
        const hasWaterSprite = typeof spriteManager !== 'undefined' && spriteManager.has('map', 'water');
        const pathSprite = hasPathSprite ? spriteManager.get('map', 'path') : null;
        const grassSprite = hasGrassSprite ? spriteManager.get('map', 'grass') : null;
        const waterSprite = hasWaterSprite ? spriteManager.get('map', 'water') : null;

        // Fill entire canvas with a color that matches the grass sprite
        ctx.fillStyle = '#5a8a3a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // First pass: Draw ALL grass tiles with overlap
        for (let y = 0; y < this.currentMap.gridHeight; y++) {
            for (let x = 0; x < this.currentMap.gridWidth; x++) {
                const px = x * this.cellSize;
                const py = y * this.cellSize;
                const cellType = this.currentMap.buildableAreas[y][x];

                if (cellType === 1) {
                    if (grassSprite) {
                        // Aggressively crop out border (35%) and draw larger for seamless tiling
                        const cropPercent = 0.35;
                        const sw = grassSprite.width;
                        const sh = grassSprite.height;
                        const cropX = sw * cropPercent;
                        const cropY = sh * cropPercent;
                        const cropW = sw * (1 - cropPercent * 2);
                        const cropH = sh * (1 - cropPercent * 2);
                        const overlap = 3;
                        ctx.drawImage(grassSprite, cropX, cropY, cropW, cropH, px - overlap, py - overlap, this.cellSize + overlap * 2, this.cellSize + overlap * 2);
                    } else {
                        // DEBUG: Bright red if sprite not loading
                        ctx.fillStyle = '#ff0000';
                        ctx.fillRect(px, py, this.cellSize, this.cellSize);
                    }
                }
            }
        }

        // Second pass: Draw ALL path tiles on top
        for (let y = 0; y < this.currentMap.gridHeight; y++) {
            for (let x = 0; x < this.currentMap.gridWidth; x++) {
                const px = x * this.cellSize;
                const py = y * this.cellSize;
                const cellType = this.currentMap.buildableAreas[y][x];

                if (cellType === 2) {
                    if (pathSprite) {
                        // Crop out the decorative border and draw slightly larger to cover grass overlap
                        const cropPercent = 0.15;
                        const sw = pathSprite.width;
                        const sh = pathSprite.height;
                        const cropX = sw * cropPercent;
                        const cropY = sh * cropPercent;
                        const cropW = sw * (1 - cropPercent * 2);
                        const cropH = sh * (1 - cropPercent * 2);
                        const overlap = 4;
                        ctx.drawImage(pathSprite, cropX, cropY, cropW, cropH, px - overlap, py - overlap, this.cellSize + overlap * 2, this.cellSize + overlap * 2);
                    } else {
                        ctx.fillStyle = this.currentMap.pathColor || '#3d2817';
                        ctx.fillRect(px, py, this.cellSize, this.cellSize);

                        ctx.fillStyle = 'rgba(80, 60, 40, 0.5)';
                        const stoneSize = this.cellSize / 4;
                        for (let sy = 0; sy < 4; sy++) {
                            for (let sx = 0; sx < 4; sx++) {
                                const offset = (sy % 2) * (stoneSize / 2);
                                ctx.beginPath();
                                ctx.roundRect(
                                    px + sx * stoneSize + offset + 1,
                                    py + sy * stoneSize + 1,
                                    stoneSize - 2,
                                    stoneSize - 2,
                                    2
                                );
                                ctx.fill();
                            }
                        }
                    }
                }

                // Draw water tiles (cellType 3 - non-buildable, non-walkable)
                if (cellType === 3) {
                    if (waterSprite) {
                        const overlap = 2;
                        ctx.drawImage(waterSprite, px - overlap, py - overlap, this.cellSize + overlap * 2, this.cellSize + overlap * 2);
                    } else {
                        // Fallback blue water
                        ctx.fillStyle = '#4a90c2';
                        ctx.fillRect(px, py, this.cellSize, this.cellSize);
                    }
                }
            }
        }
    }

    drawTorches() {
        const ctx = this.ctx;

        this.torches.forEach(torch => {
            torch.flicker += this.deltaTime * 10;
            const flickerSize = Math.sin(torch.flicker) * 2 + Math.sin(torch.flicker * 1.5) * 1.5;

            // Torch post
            ctx.fillStyle = '#4a3728';
            ctx.fillRect(torch.x - 2, torch.y - 5, 4, 15);

            // Flame glow
            const gradient = ctx.createRadialGradient(torch.x, torch.y - 8, 0, torch.x, torch.y - 8, 20 + flickerSize);
            gradient.addColorStop(0, 'rgba(255, 150, 50, 0.6)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(torch.x, torch.y - 8, 20 + flickerSize, 0, Math.PI * 2);
            ctx.fill();

            // Flame
            ctx.beginPath();
            ctx.moveTo(torch.x - 4, torch.y - 5);
            ctx.quadraticCurveTo(torch.x - 2 + flickerSize, torch.y - 15, torch.x, torch.y - 18 - flickerSize);
            ctx.quadraticCurveTo(torch.x + 2 - flickerSize, torch.y - 15, torch.x + 4, torch.y - 5);
            ctx.fillStyle = '#ff6600';
            ctx.fill();

            // Inner flame
            ctx.beginPath();
            ctx.moveTo(torch.x - 2, torch.y - 5);
            ctx.quadraticCurveTo(torch.x, torch.y - 12, torch.x, torch.y - 14 - flickerSize * 0.5);
            ctx.quadraticCurveTo(torch.x, torch.y - 12, torch.x + 2, torch.y - 5);
            ctx.fillStyle = '#ffcc00';
            ctx.fill();
        });
    }

    drawTavernToCtx(ctx) {
        const tavern = this.currentMap.tavernPosition;
        const x = tavern.x * this.cellSize + this.cellSize / 2;
        const y = tavern.y * this.cellSize + this.cellSize / 2;
        const size = this.cellSize * 0.9;

        ctx.save();

        // Try to use sprite
        if (typeof spriteManager !== 'undefined' && spriteManager.has('map', 'tavern')) {
            const sprite = spriteManager.get('map', 'tavern');
            const spriteSize = this.cellSize * 1.8;

            // Glow effect behind sprite
            const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, spriteSize);
            glowGradient.addColorStop(0, 'rgba(255, 200, 100, 0.2)');
            glowGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
            ctx.fillStyle = glowGradient;
            ctx.beginPath();
            ctx.arc(x, y, spriteSize, 0, Math.PI * 2);
            ctx.fill();

            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(x + 5, y + spriteSize * 0.3, spriteSize * 0.4, spriteSize * 0.15, 0, 0, Math.PI * 2);
            ctx.fill();

            // Draw sprite
            ctx.drawImage(
                sprite,
                x - spriteSize / 2,
                y - spriteSize / 2 - 10,
                spriteSize,
                spriteSize
            );

            ctx.restore();
            return;
        }

        // Fallback to canvas drawing
        // Building shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x - size / 2 + 5, y - size / 2 + 5, size, size);

        // Main building
        ctx.fillStyle = '#5c3a21';
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 2;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);

        // Wood planks texture
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x - size / 2, y - size / 2 + (size / 4) * i);
            ctx.lineTo(x + size / 2, y - size / 2 + (size / 4) * i);
            ctx.stroke();
        }

        // Roof
        ctx.beginPath();
        ctx.moveTo(x - size / 2 - 8, y - size / 2);
        ctx.lineTo(x, y - size / 2 - 20);
        ctx.lineTo(x + size / 2 + 8, y - size / 2);
        ctx.closePath();
        ctx.fillStyle = '#8b4513';
        ctx.fill();
        ctx.strokeStyle = '#5c3a21';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Chimney
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(x + size / 4, y - size / 2 - 15, 8, 12);

        // Door
        ctx.fillStyle = '#3d2817';
        ctx.fillRect(x - 6, y + size / 4 - 5, 12, size / 2);
        ctx.fillStyle = '#c9a227';
        ctx.beginPath();
        ctx.arc(x + 3, y + size / 4 + 5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Window
        ctx.fillStyle = 'rgba(255, 200, 100, 0.6)';
        ctx.fillRect(x - size / 3, y - size / 4, size / 4, size / 4);
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - size / 3, y - size / 4, size / 4, size / 4);
        // Window cross
        ctx.beginPath();
        ctx.moveTo(x - size / 3 + size / 8, y - size / 4);
        ctx.lineTo(x - size / 3 + size / 8, y);
        ctx.moveTo(x - size / 3, y - size / 4 + size / 8);
        ctx.lineTo(x - size / 3 + size / 4, y - size / 4 + size / 8);
        ctx.stroke();

        // Sign
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(x + size / 3 - 2, y - size / 4, 4, 15);
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.ellipse(x + size / 3, y - size / 4 - 8, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#c9a227';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🍺', x + size / 3, y - size / 4 - 5);

        // Glow effect
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
        glowGradient.addColorStop(0, 'rgba(255, 200, 100, 0.15)');
        glowGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawPlacementPreview() {
        const ctx = this.ctx;
        const { x, y } = this.hoverCell;

        if (x < 0 || x >= this.currentMap.gridWidth || y < 0 || y >= this.currentMap.gridHeight) {
            return;
        }

        const canPlace = isBuildable(this.currentMap, x, y) &&
            !this.towers.some(t => t.gridX === x && t.gridY === y);

        const centerX = x * this.cellSize + this.cellSize / 2;
        const centerY = y * this.cellSize + this.cellSize / 2;

        // Animated pulse effect
        const pulse = Math.sin(this.gameTime * 5) * 0.1 + 0.9;

        ctx.fillStyle = canPlace ? `rgba(0, 255, 0, ${0.3 * pulse})` : `rgba(255, 0, 0, ${0.3 * pulse})`;
        ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);

        ctx.strokeStyle = canPlace ? `rgba(0, 255, 0, ${0.8 * pulse})` : `rgba(255, 0, 0, ${0.8 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x * this.cellSize + 2, y * this.cellSize + 2, this.cellSize - 4, this.cellSize - 4);

        if (canPlace && this.selectedTowerType) {
            const towerData = TOWER_TYPES[this.selectedTowerType];
            const range = towerData.levels[0].range * this.cellSize;

            ctx.beginPath();
            ctx.arc(centerX, centerY, range, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawAnnouncement() {
        const ctx = this.ctx;
        const ann = this.announcement;

        const fadeIn = Math.min(1, (ann.maxDuration - ann.duration) / 0.3);
        const fadeOut = Math.min(1, ann.duration / 0.3);
        const alpha = Math.min(fadeIn, fadeOut);

        // Slide in from top
        const slideOffset = (1 - fadeIn) * -60;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.canvas.width / 2, this.canvas.height / 3 + slideOffset);

        ctx.font = 'bold 36px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(ann.text, 0, 0);
        ctx.fillStyle = ann.color;
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = 20;
        ctx.fillText(ann.text, 0, 0);
        ctx.shadowBlur = 0;

        // Sub-text showing wave enemy composition
        if (ann.subText) {
            ctx.font = '13px Cinzel, serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(ann.subText, 0, 24);
            ctx.fillText(ann.subText, 0, 24);
        }

        ctx.restore();

        // Spawn spark particles behind text on first frame
        if (this.vfxEnabled && !ann.sparksSpawned) {
            ann.sparksSpawned = true;
            for (let i = 0; i < 10; i++) {
                this.particles.push(new Particle(
                    this.canvas.width / 2 + (Math.random() - 0.5) * 200,
                    this.canvas.height / 3,
                    'spark',
                    { color: ann.color }
                ));
            }
        }
    }

    drawAnimatedWater() {
        const ctx = this.ctx;
        this.waterTiles.forEach(tile => {
            const shimmer = Math.sin(this.gameTime * 2 + tile.x * 0.1 + tile.y * 0.05) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(180, 220, 255, ${shimmer * 0.12})`;
            ctx.fillRect(tile.px, tile.py, this.cellSize, this.cellSize);

            // Ripple lines
            const rippleY = tile.py + this.cellSize * 0.3 + Math.sin(this.gameTime * 1.5 + tile.x * 0.2) * 3;
            const rippleY2 = tile.py + this.cellSize * 0.7 + Math.sin(this.gameTime * 1.8 + tile.x * 0.15) * 3;
            ctx.strokeStyle = `rgba(255, 255, 255, ${shimmer * 0.15})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tile.px + 4, rippleY);
            ctx.lineTo(tile.px + this.cellSize - 4, rippleY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tile.px + 8, rippleY2);
            ctx.lineTo(tile.px + this.cellSize - 8, rippleY2);
            ctx.stroke();
        });
    }

    drawAmbientParticles() {
        const ctx = this.ctx;
        this.ambientParticles.forEach(p => {
            const alpha = Math.min(1, p.life / p.maxLife * 2, p.life);
            if (p.type === 'ember') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 140, 40, ${alpha * 0.8})`;
                ctx.fill();
            } else if (p.type === 'firefly') {
                const pulse = Math.sin(this.gameTime * 3 + p.phase) * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(180, 255, 80, ${alpha * pulse * 0.7})`;
                ctx.fill();
            }
        });
    }

    drawDayNightOverlay() {
        const ctx = this.ctx;
        const progress = this.currentWave / this.totalWaves;
        let color = null;

        const hasBoss = this.enemies.some(e => e.isBoss);
        if (hasBoss) {
            color = 'rgba(150, 0, 0, 0.08)';
        } else if (progress >= 0.8) {
            color = 'rgba(20, 20, 80, 0.12)';
        } else if (progress >= 0.6) {
            color = 'rgba(180, 100, 50, 0.08)';
        } else if (progress <= 0.2 && this.currentWave > 0) {
            color = 'rgba(255, 200, 100, 0.05)';
        }

        if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawRain() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(180, 200, 220, 0.3)';
        ctx.lineWidth = 1;
        this.rainDrops.forEach(drop => {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x - drop.length * 0.15, drop.y + drop.length);
            ctx.stroke();
        });
    }

    drawVignette() {
        const ctx = this.ctx;
        if (!this.vignetteGradient) {
            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2;
            const radius = Math.max(this.canvas.width, this.canvas.height) * 0.7;
            this.vignetteGradient = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
            this.vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            this.vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        }
        ctx.fillStyle = this.vignetteGradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    setNFTs(nfts) {
        this.playerNFTs = nfts;
    }

    applyNFTBonus(tower) {
        if (this.playerNFTs.length === 0) return;

        tower.isNftTower = true;
        tower.nftBonus = 0.05 * this.playerNFTs.length;
        tower.nftBonus = Math.min(tower.nftBonus, 0.25);
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();

    // VFX toggle (V key)
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'v' || e.key === 'V') && window.game && window.game.isRunning) {
            window.game.vfxEnabled = !window.game.vfxEnabled;
        }
    });
});
