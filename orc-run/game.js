// game.js - Main game engine for Orc Run
// NFT flat-vector style environment: dark outlines, geometric shapes, muted fantasy palette

function darkenColorEnv(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}

function lightenColorEnv(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))},${Math.min(255, Math.floor(g + (255 - g) * factor))},${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
}

const ENV_OUTLINE = '#1a0a0a';

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Game state
        this.isRunning = false;
        this.isPaused = false;

        // Player & systems (initialized on start)
        this.player = null;
        this.obstacleSpawner = null;
        this.collectibleManager = null;

        // Distance & scoring
        this.distance = 0;
        this.coins = 0;
        this.doublePointsScore = 0;
        this.baseSpeed = 300;
        this.speed = this.baseSpeed;
        this.maxSpeed = 800;

        // Power-up timers
        this.activePowerUps = {};

        // Parallax layers
        this.parallaxLayers = [];

        // Background images (only load what's actually used)
        this.bgImages = {
            clouds: new Image(),
            mountains: new Image(),
            trees: new Image(),
            ground: new Image()
        };
        this.bgImages.clouds.src = '/orc-run/bg-clouds.png';
        this.bgImages.mountains.src = '/orc-run/bg-mountains.png';
        this.bgImages.trees.src = '/orc-run/bg-trees.png';
        this.bgImages.ground.src = '/orc-run/bg-ground.png';

        // Track scroll positions for each parallax layer
        this.bgScroll = {
            clouds: 0,
            mountains: 0,
            trees: 0
        };

        // Day/night cycle
        this.dayNightCycle = 0;

        // Virtual coordinate system — design at reference height, scale to fill screen
        this.virtualHeight = 400;
        this.virtualWidth = 800;
        this.scale = 1;

        // Ground
        this.groundY = 0;
        this.groundScrollX = 0;

        // Screen shake
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };

        // Announcements
        this.announcement = null;

        // Milestone tracking
        this.lastMilestone = 0;

        // Particles
        this.particles = [];

        // NFT data
        this.playerNFTs = [];

        // Timing
        this.lastTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;

        // Touch tracking
        this.touchStartY = 0;

        // Event listener references (for cleanup)
        this._boundHandlers = {};

        // Initialize UI
        this.ui = new GameUI(this);

        // Setup input (only once)
        this.setupInput();

        // Initial resize
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupInput() {
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.isRunning || this.isPaused) {
                if (e.key === 'Escape' && this.isRunning) {
                    this.togglePause();
                }
                return;
            }

            switch (e.key) {
                case ' ':
                case 'ArrowUp':
                    e.preventDefault();
                    this.player.jump();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.player.duck();
                    break;
                case 'Escape':
                    this.togglePause();
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!this.isRunning) return;
            if (e.key === 'ArrowDown') {
                this.player.stopDuck();
            }
        });

        // Touch - tap to jump, swipe down to duck
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.isRunning || this.isPaused) return;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.isRunning || this.isPaused) return;
            const dy = e.touches[0].clientY - this.touchStartY;
            if (dy > 30) {
                this.player.duck();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!this.isRunning || this.isPaused) return;
            if (this.player.state === 'ducking') {
                this.player.stopDuck();
            } else {
                const dy = e.changedTouches[0].clientY - this.touchStartY;
                if (Math.abs(dy) < 30) {
                    this.player.jump();
                }
            }
        }, { passive: false });

        // Click on canvas to jump (desktop)
        this.canvas.addEventListener('click', (e) => {
            if (!this.isRunning || this.isPaused) return;
            this.player.jump();
        });
    }

    resizeCanvas() {
        const hudBar = document.getElementById('hud-bar');
        const navHeight = 33;
        const hudHeight = hudBar ? hudBar.offsetHeight : 44;

        // Actual pixel size of canvas
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight - navHeight - hudHeight;

        // Scale factor: map virtual height to actual canvas height
        this.scale = this.canvas.height / this.virtualHeight;
        this.virtualWidth = this.canvas.width / this.scale;

        // Ground in virtual coordinates
        this.groundY = this.virtualHeight - 50;

        if (this.player) {
            this.player.groundY = this.groundY;
            this.player.y = this.groundY;
        }
        if (this.obstacleSpawner) {
            this.obstacleSpawner.canvasWidth = this.virtualWidth;
            this.obstacleSpawner.groundY = this.groundY;
        }
        if (this.collectibleManager) {
            this.collectibleManager.canvasWidth = this.virtualWidth;
            this.collectibleManager.groundY = this.groundY;
        }

        this.initParallaxLayers();
    }

    initParallaxLayers() {
        // Only generate procedural layers if images aren't loaded
        const cloudsLoaded = this.bgImages.clouds.complete && this.bgImages.clouds.naturalWidth > 0;
        const mountainsLoaded = this.bgImages.mountains.complete && this.bgImages.mountains.naturalWidth > 0;
        const treesLoaded = this.bgImages.trees.complete && this.bgImages.trees.naturalWidth > 0;

        this.parallaxLayers = [
            { speed: 0.05, elements: cloudsLoaded ? [] : this._generateClouds() },
            { speed: 0.15, elements: mountainsLoaded ? [] : this._generateMountains() },
            { speed: 0.4, elements: treesLoaded ? [] : this._generateTrees() }
        ];
    }

    _generateClouds() {
        const clouds = [];
        for (let i = 0; i < 6; i++) {
            clouds.push({
                x: Math.random() * this.virtualWidth * 2,
                y: 20 + Math.random() * 80,
                width: 60 + Math.random() * 80,
                height: 20 + Math.random() * 15,
                puffs: 2 + Math.floor(Math.random() * 3) // 2-4 puffs per cloud
            });
        }
        return clouds;
    }

    _generateMountains() {
        const mountains = [];
        for (let i = 0; i < 8; i++) {
            mountains.push({
                x: i * (this.virtualWidth / 4) + Math.random() * 50,
                width: 150 + Math.random() * 100,
                height: 80 + Math.random() * 60,
                shade: Math.random() * 0.3,
                snowCap: Math.random() > 0.4, // 60% chance of snow
                ridgeOffset: Math.random() * 0.3 - 0.15
            });
        }
        return mountains;
    }

    _generateTrees() {
        const trees = [];
        for (let i = 0; i < 15; i++) {
            trees.push({
                x: i * (this.virtualWidth / 7) + Math.random() * 40,
                height: 50 + Math.random() * 40,
                width: 22 + Math.random() * 15,
                shade: Math.random() * 0.4,
                tiers: 2 + Math.floor(Math.random() * 2), // 2-3 foliage tiers
                trunkWidth: 5 + Math.random() * 3
            });
        }
        return trees;
    }

    async startGame() {
        // Request game session token for leaderboard validation
        try {
            const tokenRes = await fetch('/api/game-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: 'orcrun' })
            });
            const tokenData = await tokenRes.json();
            this.gameToken = tokenData.token || null;
        } catch (e) {
            console.warn('Failed to get game token:', e);
            this.gameToken = null;
        }

        soundManager.init();

        this.resizeCanvas();

        // Clear previous game state to prevent memory leaks
        if (this.obstacleSpawner) {
            this.obstacleSpawner.obstacles.length = 0;
        }
        if (this.collectibleManager) {
            this.collectibleManager.coins.length = 0;
            this.collectibleManager.powerUps.length = 0;
        }

        this.distance = 0;
        this.coins = 0;
        this.doublePointsScore = 0;
        this.speed = this.baseSpeed;
        this.isRunning = true;
        this.isPaused = false;
        this.gameTime = 0;
        this.dayNightCycle = 0;
        this.lastMilestone = 0;
        this.activePowerUps = {};
        this.particles.length = 0; // Clear array without creating new reference
        this.announcement = null;
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
        this.groundScrollX = 0;

        // Reset scroll positions
        this.bgScroll.clouds = 0;
        this.bgScroll.mountains = 0;
        this.bgScroll.trees = 0;

        // Create player
        this.player = new Player(80, this.groundY);

        // Create/reset spawners (use virtual coordinates)
        this.obstacleSpawner = new ObstacleSpawner(this.groundY, this.virtualWidth);
        this.collectibleManager = new CollectibleManager(this.groundY, this.virtualWidth);

        this.initParallaxLayers();

        this.ui.showGameScreen();
        this.ui.updateHUD(0, 0, 0);

        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.ui.showPauseOverlay(this.isPaused);

        if (!this.isPaused) {
            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.gameLoop(time));
        }
    }

    gameLoop(currentTime) {
        if (!this.isRunning || this.isPaused) return;

        this.deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;
        this.gameTime += this.deltaTime;

        this.update();
        this.draw();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update() {
        const dt = this.deltaTime;

        // Speed increases every 500m, cap at maxSpeed
        this.speed = Math.min(this.baseSpeed + Math.floor(this.distance / 500) * 20, this.maxSpeed);

        // Apply speed boost power-up
        let effectiveSpeed = this.speed;
        if (this.activePowerUps.speed_boost) {
            effectiveSpeed *= 1.5;
        }

        // Distance
        this.distance += effectiveSpeed * dt / 10; // px/s to meters approx

        // Day/night cycle
        this.dayNightCycle = (this.distance % 5000) / 5000;

        // Milestones
        const milestone = Math.floor(this.distance / 500) * 500;
        if (milestone > this.lastMilestone && milestone > 0) {
            this.lastMilestone = milestone;
            this.showAnnouncement(`${milestone}m!`, '#c9a227', 1.5);
            soundManager.milestone();
        }

        // Update player
        this.player.update(dt);

        // Update obstacles
        this.obstacleSpawner.update(dt, effectiveSpeed, this.distance);

        // Update collectibles
        const magnetActive = !!this.activePowerUps.coin_magnet;
        this.collectibleManager.update(
            dt, effectiveSpeed, this.distance,
            this.player.x + this.player.width / 2,
            this.player.y - this.player.currentHeight / 2,
            magnetActive
        );

        // Power-up timers
        Object.keys(this.activePowerUps).forEach(key => {
            this.activePowerUps[key] -= dt;
            if (this.activePowerUps[key] <= 0) {
                delete this.activePowerUps[key];
            }
        });

        // Collision detection (only if not dead)
        if (this.player.state !== 'dead') {
            const playerHitbox = this.player.hitbox;

            // Obstacle collisions
            this.obstacleSpawner.obstacles.forEach(obstacle => {
                if (!obstacle.scored && obstacle.x + obstacle.width < this.player.x) {
                    obstacle.scored = true;
                }
                if (this._aabb(playerHitbox, obstacle.hitbox)) {
                    if (!(this.activePowerUps.speed_boost > 0)) {
                        const died = this.player.hitObstacle();
                        if (died) {
                            this.onDeath();
                        }
                    }
                }
            });

            // Coin collisions
            const coinsCollected = this.collectibleManager.checkCoinCollisions(playerHitbox);
            if (coinsCollected > 0) {
                this.coins += coinsCollected;
                if (this.activePowerUps.double_points) {
                    this.doublePointsScore += coinsCollected * 10;
                }
                soundManager.coinCollect();
            }

            // Power-up collisions
            const powerUps = this.collectibleManager.checkPowerUpCollisions(playerHitbox);
            powerUps.forEach(type => {
                this.activatePowerUp(type);
            });
        }

        // Check for death completion (for game over screen timing)
        if (this.player.state === 'dead' && this.player.deathTimer > 1.5) {
            this.isRunning = false;
            this.ui.showGameOver({
                distance: this.distance,
                coins: this.coins,
                doublePointsScore: this.doublePointsScore
            });
        }

        // Ground scroll
        this.groundScrollX = (this.groundScrollX + effectiveSpeed * dt) % 40;

        // Parallax scroll
        this.parallaxLayers.forEach(layer => {
            layer.elements.forEach(el => {
                el.x -= effectiveSpeed * layer.speed * dt;
                // Wrap around
                const maxX = this.virtualWidth + 200;
                if (el.x + (el.width || el.size || 50) < -50) {
                    el.x = maxX + Math.random() * 100;
                }
            });
        });

        // Screen shake
        if (this.screenShake.duration > 0) {
            this.screenShake.duration -= dt;
            const intensity = this.screenShake.intensity * (this.screenShake.duration / 0.5);
            this.screenShake.x = (Math.random() - 0.5) * intensity;
            this.screenShake.y = (Math.random() - 0.5) * intensity;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }

        // Announcement
        if (this.announcement) {
            this.announcement.duration -= dt;
            if (this.announcement.duration <= 0) {
                this.announcement = null;
            }
        }

        // Particles
        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += (p.gravity || 0) * dt;
            p.life -= dt;
        });
        this.particles = this.particles.filter(p => p.life > 0);

        // Update HUD
        const nftMultiplier = 1 + Math.min(this.playerNFTs.length * 0.05, 0.25);
        const score = (Math.floor(this.distance) + this.coins * 10 + this.doublePointsScore) * nftMultiplier;
        this.ui.updateHUD(this.distance, this.coins, score);
    }

    activatePowerUp(type) {
        const def = POWERUP_TYPES[type];
        this.activePowerUps[type] = def.duration;
        soundManager.powerUp();
        this.showAnnouncement(def.label + '!', def.color, 1);

        if (type === 'shield') {
            this.player.activateShield(def.duration);
        } else if (type === 'speed_boost') {
            this.player.activateInvincible(def.duration);
        }
    }

    onDeath() {
        this.triggerScreenShake(15, 0.5);

        // Death particles
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: this.player.x + this.player.width / 2,
                y: this.player.y - this.player.currentHeight / 2,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                gravity: 300,
                life: 0.8,
                maxLife: 0.8,
                size: Math.random() * 6 + 3,
                color: ['#ff6600', '#ff3300', '#ffcc00', '#cc0000'][Math.floor(Math.random() * 4)]
            });
        }
    }

    showAnnouncement(text, color, duration) {
        this.announcement = {
            text,
            color,
            duration,
            maxDuration: duration
        };
    }

    triggerScreenShake(intensity, duration) {
        this.screenShake.intensity = intensity;
        this.screenShake.duration = duration;
    }

    _aabb(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }

    // ========== DRAWING ==========

    draw() {
        const ctx = this.ctx;

        // Clear at actual canvas resolution
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        // Scale everything from virtual coords to actual pixels
        ctx.scale(this.scale, this.scale);
        ctx.translate(this.screenShake.x, this.screenShake.y);

        // Sky gradient with day/night cycle
        this.drawSky(ctx);

        // Parallax layers
        this.drawParallax(ctx);

        // Ground
        this.drawGround(ctx);

        // Collectibles (behind player)
        this.collectibleManager.draw(ctx);

        // Obstacles
        this.obstacleSpawner.draw(ctx);

        // Player
        this.player.draw(ctx);

        // Particles
        this.drawParticles(ctx);

        // Power-up indicators on canvas
        this.drawPowerUpIndicators(ctx);

        // Announcement
        if (this.announcement) {
            this.drawAnnouncement(ctx);
        }

        ctx.restore();
    }

    drawSky(ctx) {
        const t = this.dayNightCycle;
        let r1, g1, b1, r2, g2, b2;

        if (t < 0.4) {
            // Day - muted fantasy sky
            r1 = 90; g1 = 130; b1 = 190;
            r2 = 55; g2 = 90; b2 = 155;
        } else if (t < 0.5) {
            // Day -> sunset transition
            const p = (t - 0.4) / 0.1;
            r1 = 90 + p * 120; g1 = 130 - p * 70; b1 = 190 - p * 120;
            r2 = 55 + p * 50; g2 = 90 - p * 55; b2 = 155 - p * 100;
        } else if (t < 0.9) {
            // Night
            r1 = 12; g1 = 12; b1 = 35;
            r2 = 5; g2 = 5; b2 = 22;
        } else {
            // Night -> dawn transition
            const p = (t - 0.9) / 0.1;
            r1 = 12 + p * 78; g1 = 12 + p * 118; b1 = 35 + p * 155;
            r2 = 5 + p * 50; g2 = 5 + p * 85; b2 = 22 + p * 133;
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, this.groundY);
        gradient.addColorStop(0, `rgb(${Math.floor(r1)},${Math.floor(g1)},${Math.floor(b1)})`);
        gradient.addColorStop(1, `rgb(${Math.floor(r2)},${Math.floor(g2)},${Math.floor(b2)})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.virtualWidth, this.groundY);

        // Sun/moon
        this._drawCelestialBody(ctx, t);

        // Stars at night
        if (this.dayNightCycle > 0.45 && this.dayNightCycle < 0.95) {
            const starAlpha = this.dayNightCycle < 0.5 ? (this.dayNightCycle - 0.45) / 0.05 :
                              this.dayNightCycle > 0.9 ? (0.95 - this.dayNightCycle) / 0.05 : 1;
            ctx.fillStyle = `rgba(255, 255, 220, ${starAlpha * 0.8})`;
            for (let i = 0; i < 50; i++) {
                const sx = (i * 137.5 + 23) % this.virtualWidth;
                const sy = (i * 97.3 + 11) % (this.groundY * 0.6);
                const ss = ((i * 31) % 3) + 1;
                ctx.beginPath();
                ctx.moveTo(sx, sy - ss);
                ctx.lineTo(sx + ss * 0.6, sy);
                ctx.lineTo(sx, sy + ss);
                ctx.lineTo(sx - ss * 0.6, sy);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    _drawCelestialBody(ctx, t) {
        // Sun during day, moon at night
        const skyW = this.virtualWidth;
        const skyH = this.groundY * 0.5;

        if (t < 0.45) {
            // Sun arc across sky
            const sunT = t / 0.45;
            const sunX = skyW * 0.15 + skyW * 0.7 * sunT;
            const sunY = skyH - Math.sin(sunT * Math.PI) * skyH * 0.6 + 30;
            const alpha = t < 0.05 ? t / 0.05 : t > 0.4 ? (0.45 - t) / 0.05 : 1;

            ctx.save();
            ctx.globalAlpha = alpha * 0.9;
            // Sun glow
            const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 30);
            glow.addColorStop(0, 'rgba(255, 220, 100, 0.6)');
            glow.addColorStop(1, 'rgba(255, 220, 100, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
            ctx.fill();
            // Sun disc
            ctx.fillStyle = '#ffe066';
            ctx.strokeStyle = '#ccaa33';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (t > 0.5 && t < 0.95) {
            // Moon arc
            const moonT = (t - 0.5) / 0.45;
            const moonX = skyW * 0.85 - skyW * 0.7 * moonT;
            const moonY = skyH - Math.sin(moonT * Math.PI) * skyH * 0.5 + 25;
            const alpha = t < 0.55 ? (t - 0.5) / 0.05 : t > 0.9 ? (0.95 - t) / 0.05 : 1;

            ctx.save();
            ctx.globalAlpha = alpha * 0.85;
            // Moon glow
            const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 25);
            glow.addColorStop(0, 'rgba(200, 210, 240, 0.4)');
            glow.addColorStop(1, 'rgba(200, 210, 240, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(moonX, moonY, 25, 0, Math.PI * 2);
            ctx.fill();
            // Moon disc
            ctx.fillStyle = '#d8dce8';
            ctx.strokeStyle = '#aab0c0';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Craters
            ctx.fillStyle = '#c0c4d0';
            ctx.beginPath();
            ctx.arc(moonX - 3, moonY - 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(moonX + 4, moonY + 3, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawParallax(ctx) {
        const layers = this.parallaxLayers;
        const isNight = this.dayNightCycle > 0.45 && this.dayNightCycle < 0.95;
        const nightDarken = isNight ? 0.5 : 1;

        // === IMAGE-BASED CLOUDS ===
        const cloudImg = this.bgImages.clouds;
        const skipProceduralClouds = cloudImg.complete && cloudImg.naturalWidth > 0;
        if (skipProceduralClouds) {
            this.bgScroll.clouds += this.speed * this.deltaTime * 0.02;
            const imgAspect = cloudImg.naturalWidth / cloudImg.naturalHeight;
            const drawHeight = this.groundY * 0.55;
            const drawWidth = drawHeight * imgAspect;
            const scrollX = this.bgScroll.clouds % drawWidth;
            const yPos = 40;

            for (let x = -scrollX; x < this.virtualWidth + drawWidth; x += drawWidth) {
                ctx.drawImage(cloudImg, x, yPos, drawWidth, drawHeight);
            }
        }

        // === IMAGE-BASED MOUNTAINS ===
        const mtImg = this.bgImages.mountains;
        if (mtImg.complete && mtImg.naturalWidth > 0) {
            this.bgScroll.mountains += this.speed * this.deltaTime * 0.05;
            const imgAspect = mtImg.naturalWidth / mtImg.naturalHeight;
            const drawHeight = this.groundY * 1.0;
            const drawWidth = drawHeight * imgAspect;
            const scrollX = this.bgScroll.mountains % drawWidth;
            const yPos = this.groundY - drawHeight + 20;

            for (let x = -scrollX; x < this.virtualWidth + drawWidth; x += drawWidth) {
                ctx.drawImage(mtImg, x, yPos, drawWidth, drawHeight);
            }
        }

        // === IMAGE-BASED TREES ===
        const treeImg = this.bgImages.trees;
        const skipProceduralTrees = treeImg.complete && treeImg.naturalWidth > 0;
        if (skipProceduralTrees) {
            this.bgScroll.trees += this.speed * this.deltaTime * 0.15;
            const imgAspect = treeImg.naturalWidth / treeImg.naturalHeight;
            const drawHeight = this.groundY * 0.5;
            const drawWidth = drawHeight * imgAspect;
            const scrollX = this.bgScroll.trees % drawWidth;
            const yPos = this.groundY - drawHeight - 5;

            for (let x = -scrollX; x < this.virtualWidth + drawWidth; x += drawWidth) {
                ctx.drawImage(treeImg, x, yPos, drawWidth, drawHeight);
            }
        }

        // Layer 0: Clouds with outlines (skip if image loaded)
        if (!skipProceduralClouds) layers[0]?.elements.forEach(cloud => {
            ctx.save();
            const cloudAlpha = isNight ? 0.15 : 0.45;
            ctx.globalAlpha = cloudAlpha;
            ctx.fillStyle = isNight ? '#8888aa' : '#e8e4dd';
            ctx.strokeStyle = isNight ? 'rgba(60,60,80,0.3)' : 'rgba(120,110,100,0.3)';
            ctx.lineWidth = 1.5;

            // Main puff
            ctx.beginPath();
            ctx.ellipse(cloud.x, cloud.y, cloud.width / 2, cloud.height / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Side puffs with outlines
            const offsets = [
                { dx: -0.32, dy: 0.15, sx: 0.35, sy: 0.45 },
                { dx: 0.28, dy: 0.1, sx: 0.3, sy: 0.4 },
            ];
            if (cloud.puffs > 2) {
                offsets.push({ dx: -0.15, dy: -0.12, sx: 0.25, sy: 0.35 });
            }
            if (cloud.puffs > 3) {
                offsets.push({ dx: 0.12, dy: -0.1, sx: 0.2, sy: 0.3 });
            }
            offsets.forEach(o => {
                ctx.beginPath();
                ctx.ellipse(
                    cloud.x + cloud.width * o.dx,
                    cloud.y + cloud.height * o.dy,
                    cloud.width * o.sx,
                    cloud.height * o.sy,
                    0, 0, Math.PI * 2
                );
                ctx.fill();
                ctx.stroke();
            });

            ctx.restore();
        });

        // Layer 1: Mountains with outlines, snow caps, ridges
        // Skip procedural mountains if image is loaded
        const skipProceduralMountains = this.bgImages.mountains.complete && this.bgImages.mountains.naturalWidth > 0;

        if (!skipProceduralMountains) layers[1]?.elements.forEach(mt => {
            ctx.save();
            const baseColor = isNight
                ? `rgb(${Math.floor(25 + mt.shade * 15)},${Math.floor(30 + mt.shade * 10)},${Math.floor(40 + mt.shade * 10)})`
                : `rgb(${Math.floor(55 + mt.shade * 30)},${Math.floor(65 + mt.shade * 20)},${Math.floor(75 + mt.shade * 15)})`;

            // Main triangle
            ctx.fillStyle = baseColor;
            ctx.strokeStyle = ENV_OUTLINE;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mt.x, this.groundY);
            ctx.lineTo(mt.x + mt.width * (0.45 + mt.ridgeOffset), this.groundY - mt.height);
            ctx.lineTo(mt.x + mt.width, this.groundY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Lighter face (left side)
            ctx.fillStyle = isNight
                ? lightenColorEnv('#2a3040', 0.1)
                : lightenColorEnv('#556575', 0.12);
            ctx.beginPath();
            ctx.moveTo(mt.x, this.groundY);
            ctx.lineTo(mt.x + mt.width * (0.45 + mt.ridgeOffset), this.groundY - mt.height);
            ctx.lineTo(mt.x + mt.width * 0.35, this.groundY);
            ctx.closePath();
            ctx.fill();

            // Snow cap
            if (mt.snowCap && mt.height > 90) {
                const peakX = mt.x + mt.width * (0.45 + mt.ridgeOffset);
                const peakY = this.groundY - mt.height;
                const snowH = mt.height * 0.2;
                ctx.fillStyle = isNight ? '#8888a0' : '#e8e4dd';
                ctx.strokeStyle = ENV_OUTLINE;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(peakX, peakY);
                ctx.lineTo(peakX - mt.width * 0.08, peakY + snowH);
                ctx.lineTo(peakX - mt.width * 0.04, peakY + snowH * 0.7); // jagged snow line
                ctx.lineTo(peakX + mt.width * 0.02, peakY + snowH * 0.9);
                ctx.lineTo(peakX + mt.width * 0.06, peakY + snowH * 0.6);
                ctx.lineTo(peakX + mt.width * 0.1, peakY + snowH);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            ctx.restore();
        });

        // Layer 2: Trees with outlines - coniferous/fantasy style
        if (!skipProceduralTrees) layers[2]?.elements.forEach(tree => {
            ctx.save();
            const baseY = this.groundY;
            const trunkColor = isNight ? '#2a1e14' : `rgb(${Math.floor(65 + tree.shade * 25)},${Math.floor(45 + tree.shade * 15)},${25})`;
            const foliageBase = isNight ? '#1a3018' : '#2d5a22';
            const foliageLight = isNight ? '#1e381c' : `rgb(${Math.floor(40 + tree.shade * 40)},${Math.floor(75 + tree.shade * 25)},${Math.floor(28 + tree.shade * 15)})`;

            // Trunk
            ctx.fillStyle = trunkColor;
            ctx.strokeStyle = ENV_OUTLINE;
            ctx.lineWidth = 1.5;
            const tw = tree.trunkWidth;
            ctx.beginPath();
            ctx.moveTo(tree.x + tree.width / 2 - tw / 2, baseY);
            ctx.lineTo(tree.x + tree.width / 2 - tw / 2 + 1, baseY - tree.height * 0.45);
            ctx.lineTo(tree.x + tree.width / 2 + tw / 2 - 1, baseY - tree.height * 0.45);
            ctx.lineTo(tree.x + tree.width / 2 + tw / 2, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Foliage tiers (triangles, bottom-up, each smaller)
            for (let tier = 0; tier < tree.tiers; tier++) {
                const tierT = tier / tree.tiers;
                const tierWidth = tree.width * (1.1 - tierT * 0.3);
                const tierBottom = baseY - tree.height * (0.2 + tierT * 0.3);
                const tierTop = baseY - tree.height * (0.5 + tierT * 0.25);
                const cx = tree.x + tree.width / 2;

                // Shadow/dark foliage
                ctx.fillStyle = foliageBase;
                ctx.strokeStyle = ENV_OUTLINE;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx - tierWidth / 2, tierBottom);
                ctx.lineTo(cx, tierTop);
                ctx.lineTo(cx + tierWidth / 2, tierBottom);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Lighter left highlight
                ctx.fillStyle = foliageLight;
                ctx.beginPath();
                ctx.moveTo(cx - tierWidth / 2, tierBottom);
                ctx.lineTo(cx, tierTop);
                ctx.lineTo(cx - tierWidth * 0.1, tierBottom);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        });

    }

    drawGround(ctx) {
        ctx.save();

        // === IMAGE-BASED GROUND ===
        const groundImg = this.bgImages.ground;
        if (groundImg.complete && groundImg.naturalWidth > 0) {
            this.groundScrollX = this.groundScrollX || 0;
            const imgAspect = groundImg.naturalWidth / groundImg.naturalHeight;
            const drawHeight = this.virtualHeight - this.groundY + 50;  // Extend below visible area
            const drawWidth = drawHeight * imgAspect;
            const scrollX = this.groundScrollX % drawWidth;
            const yPos = this.groundY - 42;  // Position grass top to align with tree bottoms

            for (let x = -scrollX; x < this.virtualWidth + drawWidth; x += drawWidth) {
                ctx.drawImage(groundImg, x, yPos, drawWidth, drawHeight);
            }
            ctx.restore();
            return;
        }

        // === FALLBACK PROCEDURAL GROUND ===
        const isNight = this.dayNightCycle > 0.45 && this.dayNightCycle < 0.95;

        // Ground base - earthy brown
        const groundColor = isNight ? '#2e1e11' : '#5c3a21';
        const groundDark = isNight ? '#231710' : '#4a2e18';
        ctx.fillStyle = groundColor;
        ctx.fillRect(0, this.groundY, this.virtualWidth, this.virtualHeight - this.groundY);

        // Top edge outline
        ctx.strokeStyle = ENV_OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(this.virtualWidth, this.groundY);
        ctx.stroke();

        // Grass tufts along top edge
        const grassColor = isNight ? '#2a4a1e' : '#4a8b3a';
        const grassDark = isNight ? '#1e3516' : '#3a6a2e';
        ctx.lineWidth = 1;

        // Grass strip
        ctx.fillStyle = grassColor;
        ctx.fillRect(0, this.groundY - 3, this.virtualWidth, 7);
        ctx.strokeStyle = ENV_OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY - 3);
        ctx.lineTo(this.virtualWidth, this.groundY - 3);
        ctx.stroke();

        // Individual grass blades
        ctx.strokeStyle = grassDark;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        const grassSpacing = 12;
        const offset = -(this.groundScrollX % grassSpacing);
        for (let gx = offset; gx < this.virtualWidth + grassSpacing; gx += grassSpacing) {
            const h = 4 + Math.sin(gx * 0.7) * 3;
            const lean = Math.sin(gx * 0.3 + this.gameTime * 2) * 2;
            ctx.beginPath();
            ctx.moveTo(gx, this.groundY - 2);
            ctx.lineTo(gx + lean, this.groundY - 2 - h);
            ctx.stroke();
        }

        // Scrolling stone/cobble pattern
        ctx.fillStyle = groundDark;
        const stoneW = 40;
        const stoneH = 20;
        const startX = -this.groundScrollX;
        for (let row = 0; row < 3; row++) {
            const rowOffset = row % 2 === 0 ? 0 : stoneW / 2;
            for (let col = -1; col < this.virtualWidth / stoneW + 2; col++) {
                const sx = startX + col * stoneW + rowOffset;
                const sy = this.groundY + 5 + row * stoneH;

                // Stone outline
                ctx.strokeStyle = ENV_OUTLINE;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(sx + 2, sy + 2, stoneW - 4, stoneH - 4, 3);
                ctx.stroke();

                // Subtle highlight on top-left
                if (row === 0) {
                    ctx.strokeStyle = isNight ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(sx + 5, sy + 4);
                    ctx.lineTo(sx + stoneW - 8, sy + 4);
                    ctx.stroke();
                }
            }
        }

        // Occasional pebbles / small rocks on ground surface
        ctx.fillStyle = isNight ? '#3a2a1a' : '#6b5535';
        ctx.strokeStyle = ENV_OUTLINE;
        ctx.lineWidth = 1;
        const pebbleOffset = -(this.groundScrollX * 0.8) % 120;
        for (let px = pebbleOffset; px < this.virtualWidth + 120; px += 120) {
            const py = this.groundY + 3;
            ctx.beginPath();
            ctx.ellipse(px + 20, py, 3, 2, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.ellipse(px + 80, py + 1, 2, 1.5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    drawParticles(ctx) {
        this.particles.forEach(p => {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.strokeStyle = ENV_OUTLINE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
            if (p.size > 3) ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    drawPowerUpIndicators(ctx) {
        let y = 10;
        Object.keys(this.activePowerUps).forEach(key => {
            const remaining = this.activePowerUps[key];
            const def = POWERUP_TYPES[key];
            if (!def) return;

            ctx.fillStyle = def.color;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.roundRect(10, y, 120, 22, 11);
            ctx.fill();
            ctx.strokeStyle = ENV_OUTLINE;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px Cinzel, serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${def.label} ${remaining.toFixed(1)}s`, 18, y + 15);

            y += 28;
        });
    }

    drawAnnouncement(ctx) {
        const ann = this.announcement;
        const alpha = Math.min(1, ann.duration / 0.3, (ann.maxDuration - (ann.maxDuration - ann.duration) + 0.3) / 0.3);
        const scale = 1 + (1 - Math.min(1, (ann.maxDuration - ann.duration) / 0.2)) * 0.3;

        ctx.save();
        ctx.globalAlpha = Math.min(alpha, 1);
        ctx.translate(this.virtualWidth / 2, this.virtualHeight / 3);
        ctx.scale(scale, scale);

        ctx.font = 'bold 36px Cinzel, serif';
        ctx.textAlign = 'center';
        // Dark outline on text
        ctx.strokeStyle = ENV_OUTLINE;
        ctx.lineWidth = 5;
        ctx.strokeText(ann.text, 0, 0);
        ctx.fillStyle = ann.color;
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = 20;
        ctx.fillText(ann.text, 0, 0);

        ctx.restore();
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
