// towers.js - Tower definitions and logic for Horde Defense

const TOWER_TYPES = {
    grunt: {
        name: "Grunt",
        description: "Basic melee orc. Cheap and reliable.",
        icon: "👊",
        color: "#6B8E23",
        baseCost: 50,
        levels: [
            { damage: 15, range: 1.2, attackSpeed: 1.0, cost: 50 },
            { damage: 25, range: 1.3, attackSpeed: 1.1, cost: 40 },
            { damage: 40, range: 1.5, attackSpeed: 1.2, cost: 60 }
        ],
        sellRatio: 0.6,
        projectileType: "melee",
        targetPriority: "first" // first, last, strongest, weakest
    },

    archer: {
        name: "Archer",
        description: "Ranged attacks with fast fire rate.",
        icon: "🏹",
        color: "#8B4513",
        baseCost: 75,
        levels: [
            { damage: 8, range: 3.5, attackSpeed: 2.0, cost: 75 },
            { damage: 12, range: 4.0, attackSpeed: 2.5, cost: 50 },
            { damage: 18, range: 4.5, attackSpeed: 3.0, cost: 75 }
        ],
        sellRatio: 0.6,
        projectileType: "arrow",
        projectileSpeed: 8,
        targetPriority: "first"
    },

    berserker: {
        name: "Berserker",
        description: "Devastating splash damage, but slow.",
        icon: "⚔️",
        color: "#8B0000",
        baseCost: 150,
        levels: [
            { damage: 40, range: 1.5, attackSpeed: 0.5, splashRadius: 0.8, cost: 150 },
            { damage: 65, range: 1.7, attackSpeed: 0.6, splashRadius: 1.0, cost: 100 },
            { damage: 100, range: 2.0, attackSpeed: 0.7, splashRadius: 1.2, cost: 150 }
        ],
        sellRatio: 0.6,
        projectileType: "melee",
        hasSplash: true,
        targetPriority: "strongest"
    },

    shaman: {
        name: "Shaman",
        description: "Slows enemies with dark magic.",
        icon: "🔮",
        color: "#4B0082",
        baseCost: 100,
        levels: [
            { damage: 5, range: 2.5, attackSpeed: 1.0, slowAmount: 0.3, slowDuration: 2.0, cost: 100 },
            { damage: 8, range: 3.0, attackSpeed: 1.2, slowAmount: 0.4, slowDuration: 2.5, cost: 75 },
            { damage: 12, range: 3.5, attackSpeed: 1.5, slowAmount: 0.5, slowDuration: 3.0, cost: 100 }
        ],
        sellRatio: 0.6,
        projectileType: "magic",
        projectileSpeed: 5,
        hasSlowEffect: true,
        targetPriority: "first"
    },

    warlord: {
        name: "Warlord",
        description: "Buffs nearby orcs with leadership aura.",
        icon: "👑",
        color: "#DAA520",
        baseCost: 200,
        levels: [
            { damage: 20, range: 2.0, attackSpeed: 0.8, auraRadius: 2.0, auraDamageBonus: 0.15, cost: 200 },
            { damage: 30, range: 2.2, attackSpeed: 0.9, auraRadius: 2.5, auraDamageBonus: 0.25, cost: 125 },
            { damage: 45, range: 2.5, attackSpeed: 1.0, auraRadius: 3.0, auraDamageBonus: 0.35, cost: 175 }
        ],
        sellRatio: 0.6,
        projectileType: "melee",
        hasAura: true,
        targetPriority: "strongest"
    },

    siege: {
        name: "Siege Orc",
        description: "Massive damage, ideal against bosses.",
        icon: "💥",
        color: "#2F4F4F",
        baseCost: 300,
        levels: [
            { damage: 100, range: 4.0, attackSpeed: 0.25, bonusVsBoss: 2.0, cost: 300 },
            { damage: 175, range: 4.5, attackSpeed: 0.3, bonusVsBoss: 2.5, cost: 200 },
            { damage: 275, range: 5.0, attackSpeed: 0.35, bonusVsBoss: 3.0, cost: 300 }
        ],
        sellRatio: 0.6,
        projectileType: "boulder",
        projectileSpeed: 4,
        targetPriority: "strongest"
    }
};

// Tower class
class Tower {
    constructor(type, gridX, gridY, cellSize) {
        this.type = type;
        this.gridX = gridX;
        this.gridY = gridY;
        this.cellSize = cellSize;
        this.level = 0;
        this.totalInvested = TOWER_TYPES[type].baseCost;

        // Position in canvas coordinates
        this.x = gridX * cellSize + cellSize / 2;
        this.y = gridY * cellSize + cellSize / 2;

        // Combat state
        this.target = null;
        this.attackCooldown = 0;
        this.rotation = 0;

        // Visual state
        this.isSelected = false;
        this.showRange = false;
        this.attackFlash = 0;
        this.recoil = 0;

        // NFT bonus (can be set externally)
        this.nftBonus = 0;
        this.isNftTower = false;

        // Aura effect tracking
        this.affectedByAura = false;
        this.auraBonus = 0;
    }

    getStats() {
        const typeData = TOWER_TYPES[this.type];
        const levelStats = typeData.levels[this.level];
        return {
            ...levelStats,
            name: typeData.name,
            icon: typeData.icon,
            color: typeData.color,
            projectileType: typeData.projectileType,
            projectileSpeed: typeData.projectileSpeed || 0,
            hasSplash: typeData.hasSplash || false,
            hasSlowEffect: typeData.hasSlowEffect || false,
            hasAura: typeData.hasAura || false,
            targetPriority: typeData.targetPriority
        };
    }

    getEffectiveDamage(targetEnemy = null) {
        const stats = this.getStats();
        let damage = stats.damage;

        // Apply aura bonus
        if (this.auraBonus > 0) {
            damage *= (1 + this.auraBonus);
        }

        // Apply NFT bonus
        if (this.nftBonus > 0) {
            damage *= (1 + this.nftBonus);
        }

        // Apply boss bonus for siege orcs
        if (targetEnemy && targetEnemy.isBoss && stats.bonusVsBoss) {
            damage *= stats.bonusVsBoss;
        }

        return Math.round(damage);
    }

    getUpgradeCost() {
        const typeData = TOWER_TYPES[this.type];
        if (this.level >= typeData.levels.length - 1) {
            return null; // Max level
        }
        return typeData.levels[this.level + 1].cost;
    }

    getSellValue() {
        const typeData = TOWER_TYPES[this.type];
        return Math.floor(this.totalInvested * typeData.sellRatio);
    }

    upgrade() {
        const cost = this.getUpgradeCost();
        if (cost === null) return false;

        this.level++;
        this.totalInvested += cost;
        return true;
    }

    canAttack() {
        return this.attackCooldown <= 0;
    }

    findTarget(enemies) {
        const stats = this.getStats();
        const rangePixels = stats.range * this.cellSize;

        // Filter enemies in range
        const inRange = enemies.filter(enemy => {
            if (enemy.isDead) return false;
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= rangePixels;
        });

        if (inRange.length === 0) return null;

        // Sort by priority
        switch (stats.targetPriority) {
            case 'first':
                // Enemy furthest along path
                return inRange.reduce((a, b) => a.distanceTraveled > b.distanceTraveled ? a : b);
            case 'last':
                return inRange.reduce((a, b) => a.distanceTraveled < b.distanceTraveled ? a : b);
            case 'strongest':
                return inRange.reduce((a, b) => a.maxHp > b.maxHp ? a : b);
            case 'weakest':
                return inRange.reduce((a, b) => a.hp < b.hp ? a : b);
            default:
                return inRange[0];
        }
    }

    attack(target, projectiles) {
        const stats = this.getStats();

        // Update rotation to face target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        this.rotation = Math.atan2(dy, dx);

        // Set cooldown (attacks per second -> seconds per attack)
        this.attackCooldown = 1 / stats.attackSpeed;

        // Create projectile or instant hit
        if (stats.projectileType === 'melee') {
            // Instant melee attack
            this.dealDamage(target, projectiles);
        } else {
            // Create projectile
            projectiles.push(new Projectile(
                this.x,
                this.y,
                target,
                this,
                stats
            ));
        }

        return true;
    }

    dealDamage(target, projectiles) {
        const stats = this.getStats();
        const damage = this.getEffectiveDamage(target);

        // Apply damage
        target.takeDamage(damage);

        // Apply splash damage
        if (stats.hasSplash && stats.splashRadius) {
            const splashRadiusPixels = stats.splashRadius * this.cellSize;
            // Splash damage handled by game loop
        }

        // Apply slow effect
        if (stats.hasSlowEffect) {
            target.applySlow(stats.slowAmount, stats.slowDuration);
        }

        return damage;
    }

    update(deltaTime, enemies, projectiles, towers, particles) {
        // Update cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }

        // Update attack flash
        if (this.attackFlash > 0) {
            this.attackFlash -= deltaTime * 5;
        }

        // Update recoil
        if (this.recoil > 0) {
            this.recoil -= deltaTime * 10;
        }

        // Check aura effects from nearby warlords
        this.auraBonus = 0;
        this.affectedByAura = false;

        towers.forEach(tower => {
            if (tower === this) return;
            const towerStats = tower.getStats();
            if (towerStats.hasAura) {
                const dx = tower.x - this.x;
                const dy = tower.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const auraRange = towerStats.auraRadius * this.cellSize;

                if (distance <= auraRange) {
                    this.affectedByAura = true;
                    this.auraBonus = Math.max(this.auraBonus, towerStats.auraDamageBonus);
                }
            }
        });

        // Find and attack target
        if (this.canAttack()) {
            const target = this.findTarget(enemies);
            if (target) {
                this.target = target;
                this.attack(target, projectiles, particles);
            }
        }
    }

    attack(target, projectiles, particles) {
        const stats = this.getStats();

        // Update rotation to face target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        this.rotation = Math.atan2(dy, dx);

        // Set cooldown
        this.attackCooldown = 1 / stats.attackSpeed;

        // Visual feedback
        this.attackFlash = 1;
        this.recoil = 1;

        // Add muzzle flash particles
        if (particles && stats.projectileType !== 'melee') {
            const flashX = this.x + Math.cos(this.rotation) * this.cellSize * 0.4;
            const flashY = this.y + Math.sin(this.rotation) * this.cellSize * 0.4;
            for (let i = 0; i < 3; i++) {
                particles.push(new Particle(flashX, flashY, 'spark', {
                    color: stats.projectileType === 'magic' ? '#9932CC' : '#ffaa00'
                }));
            }
        }

        if (stats.projectileType === 'melee') {
            this.dealDamage(target, projectiles);
            // Melee slash effect
            if (particles) {
                for (let i = 0; i < 5; i++) {
                    particles.push(new Particle(target.x, target.y, 'spark', { color: stats.color }));
                }
            }
        } else {
            projectiles.push(new Projectile(this.x, this.y, target, this, stats));
        }

        return true;
    }

    draw(ctx, gameTime) {
        const stats = this.getStats();
        gameTime = gameTime || 0;

        // Draw range indicator if selected or hovering
        if (this.showRange || this.isSelected) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, stats.range * this.cellSize, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw aura range for warlords with pulsing effect
        if (stats.hasAura) {
            const auraPulse = Math.sin(gameTime * 2) * 0.1 + 0.9;
            if (this.showRange || this.isSelected) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, stats.auraRadius * this.cellSize * auraPulse, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(218, 165, 32, 0.1)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(218, 165, 32, 0.5)';
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Always show subtle aura
            ctx.beginPath();
            ctx.arc(this.x, this.y, stats.auraRadius * this.cellSize * auraPulse, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(218, 165, 32, ${0.2 * auraPulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw aura effect indicator
        if (this.affectedByAura) {
            const glowPulse = Math.sin(gameTime * 3) * 0.3 + 0.7;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.cellSize * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(218, 165, 32, ${glowPulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw tower shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(this.x + 3, this.y + 3, this.cellSize * 0.35, this.cellSize * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(this.x, this.y);

        // Apply recoil
        const recoilOffset = (this.recoil || 0) * -3;
        ctx.translate(Math.cos(this.rotation) * recoilOffset, Math.sin(this.rotation) * recoilOffset);

        // Attack flash glow
        if (this.attackFlash > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.cellSize * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${this.attackFlash * 0.5})`;
            ctx.fill();
        }

        // Draw tower based on type
        this.drawTowerSprite(ctx, stats, gameTime);

        ctx.restore();

        // Draw level indicator
        if (this.level > 0) {
            ctx.fillStyle = '#c9a227';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            const stars = '★'.repeat(this.level);
            ctx.strokeText(stars, this.x, this.y + this.cellSize * 0.6);
            ctx.fillText(stars, this.x, this.y + this.cellSize * 0.6);
        }
    }

    drawTowerSprite(ctx, stats, gameTime) {
        const size = this.cellSize * 0.4;

        // Base platform
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(0, -size/3, 0, 0, 0, size);
        gradient.addColorStop(0, this.lightenColor(stats.color, 30));
        gradient.addColorStop(1, this.darkenColor(stats.color, 30));
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = this.isSelected ? '#c9a227' : this.darkenColor(stats.color, 50);
        ctx.lineWidth = this.isSelected ? 3 : 2;
        ctx.stroke();

        // NFT glow effect
        if (this.isNftTower) {
            ctx.beginPath();
            ctx.arc(0, 0, size + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#c9a227';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#c9a227';
            ctx.shadowBlur = 15;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw weapon/characteristic based on type
        ctx.rotate(this.rotation);

        switch (this.type) {
            case 'grunt':
                // Fist/club
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(size * 0.2, -4, size * 0.6, 8);
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(size * 0.7, 0, 6, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'archer':
                // Bow
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(size * 0.3, 0, size * 0.5, -Math.PI/3, Math.PI/3);
                ctx.stroke();
                // Arrow
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(0, -1, size * 0.8, 2);
                ctx.beginPath();
                ctx.moveTo(size * 0.8, 0);
                ctx.lineTo(size * 0.6, -4);
                ctx.lineTo(size * 0.6, 4);
                ctx.closePath();
                ctx.fillStyle = '#888';
                ctx.fill();
                break;
            case 'berserker':
                // Double axes
                ctx.fillStyle = '#666';
                ctx.fillRect(size * 0.1, -2, size * 0.5, 4);
                // Axe heads
                ctx.beginPath();
                ctx.moveTo(size * 0.5, -8);
                ctx.lineTo(size * 0.8, 0);
                ctx.lineTo(size * 0.5, 8);
                ctx.fillStyle = '#aaa';
                ctx.fill();
                break;
            case 'shaman':
                // Staff with orb
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(-size * 0.1, -2, size * 0.7, 4);
                ctx.beginPath();
                ctx.arc(size * 0.5, 0, 8, 0, Math.PI * 2);
                const orbGlow = Math.sin(gameTime * 4) * 0.3 + 0.7;
                ctx.fillStyle = `rgba(153, 50, 204, ${orbGlow})`;
                ctx.shadowColor = '#9932CC';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
            case 'warlord':
                // Banner/flag
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(size * 0.2, -2, size * 0.6, 4);
                // Flag
                ctx.fillStyle = '#c9a227';
                ctx.beginPath();
                ctx.moveTo(size * 0.6, -2);
                ctx.lineTo(size * 0.9, -8);
                ctx.lineTo(size * 0.9, 6);
                ctx.lineTo(size * 0.6, 2);
                ctx.closePath();
                ctx.fill();
                // Crown symbol
                ctx.fillStyle = '#fff';
                ctx.font = '8px Arial';
                ctx.fillText('♔', size * 0.65, 2);
                break;
            case 'siege':
                // Cannon/catapult
                ctx.fillStyle = '#2F4F4F';
                ctx.fillRect(-size * 0.2, -6, size * 0.8, 12);
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(size * 0.5, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                // Barrel
                ctx.fillStyle = '#444';
                ctx.fillRect(size * 0.3, -4, size * 0.5, 8);
                break;
        }
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
}

// Projectile class
class Projectile {
    constructor(x, y, target, tower, towerStats) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.tower = tower;
        this.stats = towerStats;
        this.speed = towerStats.projectileSpeed * tower.cellSize;
        this.isActive = true;
        this.trailTimer = 0;

        // Visual properties based on type
        switch (towerStats.projectileType) {
            case 'arrow':
                this.size = 8;
                this.color = '#8B4513';
                this.trailColor = '#654321';
                this.trailInterval = 0.05;
                break;
            case 'magic':
                this.size = 10;
                this.color = '#9932CC';
                this.trailColor = '#9932CC';
                this.trailInterval = 0.02;
                break;
            case 'boulder':
                this.size = 14;
                this.color = '#696969';
                this.trailColor = '#555555';
                this.trailInterval = 0.08;
                break;
            default:
                this.size = 6;
                this.color = '#fff';
                this.trailColor = '#aaa';
                this.trailInterval = 0.05;
        }
    }

    update(deltaTime, particles) {
        if (!this.isActive) return;

        // Check if target is still valid
        if (!this.target || this.target.isDead) {
            this.isActive = false;
            return;
        }

        // Move towards target
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.speed * deltaTime) {
            // Hit target
            this.hit();
        } else {
            // Move towards target
            const vx = (dx / distance) * this.speed * deltaTime;
            const vy = (dy / distance) * this.speed * deltaTime;
            this.x += vx;
            this.y += vy;
        }

        this.rotation = Math.atan2(dy, dx);

        // Add trail particles
        if (particles) {
            this.trailTimer += deltaTime;
            if (this.trailTimer >= this.trailInterval) {
                this.trailTimer = 0;
                particles.push(new Particle(this.x, this.y, 'trail', {
                    color: this.trailColor,
                    size: this.size * 0.4
                }));
            }
        }
    }

    hit() {
        this.isActive = false;

        if (!this.target || this.target.isDead) return;

        // Deal damage
        const damage = this.tower.getEffectiveDamage(this.target);
        this.target.takeDamage(damage);

        // Apply slow effect
        if (this.stats.hasSlowEffect) {
            this.target.applySlow(this.stats.slowAmount, this.stats.slowDuration);
        }
    }

    draw(ctx) {
        if (!this.isActive) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation || 0);

        switch (this.stats.projectileType) {
            case 'arrow':
                // Arrow shaft
                ctx.fillStyle = '#654321';
                ctx.fillRect(-this.size * 0.6, -1.5, this.size * 1.2, 3);
                // Arrow head
                ctx.beginPath();
                ctx.moveTo(this.size * 0.8, 0);
                ctx.lineTo(this.size * 0.4, -4);
                ctx.lineTo(this.size * 0.4, 4);
                ctx.closePath();
                ctx.fillStyle = '#aaa';
                ctx.fill();
                // Fletching
                ctx.fillStyle = '#8B4513';
                ctx.beginPath();
                ctx.moveTo(-this.size * 0.6, 0);
                ctx.lineTo(-this.size * 0.4, -4);
                ctx.lineTo(-this.size * 0.3, 0);
                ctx.lineTo(-this.size * 0.4, 4);
                ctx.closePath();
                ctx.fill();
                break;

            case 'magic':
                // Outer glow
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
                gradient.addColorStop(0, 'rgba(153, 50, 204, 1)');
                gradient.addColorStop(0.5, 'rgba(153, 50, 204, 0.5)');
                gradient.addColorStop(1, 'rgba(153, 50, 204, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.beginPath();
                ctx.arc(0, 0, this.size * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#9932CC';
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
                break;

            case 'boulder':
                // Boulder with texture
                ctx.beginPath();
                ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
                const boulderGrad = ctx.createRadialGradient(-this.size/4, -this.size/4, 0, 0, 0, this.size/2);
                boulderGrad.addColorStop(0, '#888');
                boulderGrad.addColorStop(1, '#444');
                ctx.fillStyle = boulderGrad;
                ctx.fill();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2;
                ctx.stroke();
                // Cracks
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-2, -2);
                ctx.lineTo(3, 4);
                ctx.moveTo(2, -3);
                ctx.lineTo(-1, 2);
                ctx.stroke();
                break;

            default:
                ctx.beginPath();
                ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 5;
                ctx.fill();
                ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TOWER_TYPES, Tower, Projectile };
}
