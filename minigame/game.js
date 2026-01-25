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
        this.particles = [];

        // Environmental decorations
        this.decorations = [];
        this.torches = [];

        // Wave spawning
        this.waveEnemies = [];
        this.spawnTimer = 0;
        this.spawnInterval = 0.8;

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

        // Kill streak tracking
        this.killStreak = 0;
        this.killStreakTimer = 0;
        this.lastKillStreakAnnounced = 0;

        // Screen shake
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };

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
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        this.hoverCell = { x: gridX, y: gridY };
    }

    placeTower(type, gridX, gridY) {
        if (!isBuildable(this.selectedMap, gridX, gridY)) {
            return false;
        }

        if (this.towers.some(t => t.gridX === gridX && t.gridY === gridY)) {
            return false;
        }

        const cost = TOWER_TYPES[type].baseCost;
        if (this.gold < cost) {
            return false;
        }

        const tower = new Tower(type, gridX, gridY, this.cellSize);
        this.applyNFTBonus(tower);

        this.towers.push(tower);
        this.gold -= cost;
        this.ui.updateGold(this.gold);

        // Placement effect
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'spark', { color: '#00ff00' }));
        }

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

        // Level up effect
        const tower = this.selectedPlacedTower;
        this.particles.push(new Particle(tower.x, tower.y - 20, 'levelup'));
        for (let i = 0; i < 12; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'spark', { color: '#c9a227' }));
        }
    }

    sellTower() {
        if (!this.selectedPlacedTower) return;

        const value = this.selectedPlacedTower.getSellValue();
        const tower = this.selectedPlacedTower;
        this.gold += value;

        // Sell effect
        for (let i = 0; i < 6; i++) {
            this.particles.push(new Particle(tower.x, tower.y, 'smoke'));
        }

        const index = this.towers.indexOf(this.selectedPlacedTower);
        if (index > -1) {
            this.towers.splice(index, 1);
        }

        this.ui.deselectPlacedTower();
        this.ui.updateGold(this.gold);
    }

    generateDecorations() {
        this.decorations = [];
        this.torches = [];

        const map = this.currentMap;

        for (let y = 0; y < map.gridHeight; y++) {
            for (let x = 0; x < map.gridWidth; x++) {
                const cellType = map.buildableAreas[y][x];

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

                // Add torches along paths
                if (cellType === 2 && Math.random() < 0.08) {
                    this.torches.push({
                        x: x * this.cellSize + this.cellSize / 2,
                        y: y * this.cellSize + this.cellSize / 2,
                        flicker: Math.random() * Math.PI * 2
                    });
                }
            }
        }
    }

    async startGame() {
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

        this.gold = this.startingGold;
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

        this.killStreak = 0;
        this.killStreakTimer = 0;
        this.announcement = null;

        this.stats = {
            enemiesKilled: 0,
            totalGoldEarned: 0,
            wavesCompleted: 0,
            livesRemaining: 0
        };

        this.currentMap = MAPS[this.selectedMap];
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

        // Check for boss wave
        const hasBoss = this.waveEnemies.some(e => BOSS_TYPES[e]);
        if (hasBoss) {
            this.showAnnouncement('⚠️ BOSS INCOMING! ⚠️', '#ff4444', 3);
            this.triggerScreenShake(10, 0.5);
        } else {
            this.showAnnouncement(`Wave ${this.currentWave}`, '#c9a227', 1.5);
        }

        this.ui.updateWave(this.currentWave, this.totalWaves);
        this.ui.setWaveButtonState(true);
    }

    showAnnouncement(text, color, duration) {
        this.announcement = {
            text,
            color,
            duration,
            maxDuration: duration,
            y: this.canvas.height / 2
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
            enemy.update(this.deltaTime, this.towers);
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

        // Check for dead enemies
        this.enemies = this.enemies.filter(enemy => {
            if (enemy.isDead) {
                // Death explosion
                const colors = ['#ff6600', '#ff3300', '#ffcc00', '#ff0000'];
                for (let i = 0; i < 12; i++) {
                    this.particles.push(new Particle(enemy.x, enemy.y, 'explosion', {
                        color: colors[Math.floor(Math.random() * colors.length)]
                    }));
                }

                // Gold particle
                this.particles.push(new Particle(enemy.x, enemy.y - 10, 'gold', {
                    amount: enemy.goldReward
                }));

                // Boss death = big shake
                if (enemy.isBoss) {
                    this.triggerScreenShake(20, 0.8);
                    this.showAnnouncement('BOSS DEFEATED!', '#00ff00', 2);
                }

                this.gold += enemy.goldReward;
                this.stats.enemiesKilled++;
                this.stats.totalGoldEarned += enemy.goldReward;
                this.ui.updateGold(this.gold);

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
        this.enemies.push(enemy);

        // Spawn particles
        for (let i = 0; i < 5; i++) {
            this.particles.push(new Particle(enemy.x, enemy.y, 'smoke'));
        }
    }

    waveComplete() {
        this.waveActive = false;
        this.stats.wavesCompleted = this.currentWave;

        this.showAnnouncement('Wave Complete!', '#00ff00', 1.5);

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
        } else {
            this.ui.showGameOver(this.stats);
        }
    }

    draw() {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(this.screenShake.x, this.screenShake.y);

        // Clear canvas
        ctx.fillStyle = this.currentMap.groundColor || '#1a2f1a';
        ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        // Draw decorations (behind everything)
        this.drawDecorations();

        // Draw grid
        this.drawGrid();

        // Draw paths with cobblestones
        this.drawPaths();

        // Draw torches
        this.drawTorches();

        // Draw tavern
        this.drawTavern();

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

        // Draw announcement
        if (this.announcement) {
            this.drawAnnouncement();
        }

        ctx.restore();
    }

    drawDecorations() {
        const ctx = this.ctx;

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

    drawGrid() {
        const ctx = this.ctx;

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

    drawPaths() {
        const ctx = this.ctx;
        const hasPathSprite = typeof spriteManager !== 'undefined' && spriteManager.has('map', 'path');
        const hasGrassSprite = typeof spriteManager !== 'undefined' && spriteManager.has('map', 'grass');
        const pathSprite = hasPathSprite ? spriteManager.get('map', 'path') : null;
        const grassSprite = hasGrassSprite ? spriteManager.get('map', 'grass') : null;

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
                        // Crop out the decorative border by using only the center portion
                        const cropPercent = 0.15;
                        const sw = pathSprite.width;
                        const sh = pathSprite.height;
                        const cropX = sw * cropPercent;
                        const cropY = sh * cropPercent;
                        const cropW = sw * (1 - cropPercent * 2);
                        const cropH = sh * (1 - cropPercent * 2);
                        ctx.drawImage(pathSprite, cropX, cropY, cropW, cropH, px, py, this.cellSize, this.cellSize);
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

    drawTavern() {
        const ctx = this.ctx;
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

        const canPlace = isBuildable(this.selectedMap, x, y) &&
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

        const alpha = Math.min(1, ann.duration / 0.3, (ann.maxDuration - ann.duration + 0.3) / 0.3);
        const scale = 1 + (1 - alpha) * 0.2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.canvas.width / 2, this.canvas.height / 3);
        ctx.scale(scale, scale);

        ctx.font = 'bold 36px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(ann.text, 0, 0);
        ctx.fillStyle = ann.color;
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = 20;
        ctx.fillText(ann.text, 0, 0);

        ctx.restore();
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
});
