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

    update(deltaTime, enemies, projectiles, towers) {
        // Update cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
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
                this.attack(target, projectiles);
            }
        }
    }

    draw(ctx) {
        const stats = this.getStats();

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

        // Draw aura range for warlords
        if (stats.hasAura && (this.showRange || this.isSelected)) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, stats.auraRadius * this.cellSize, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(218, 165, 32, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(218, 165, 32, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw aura effect indicator
        if (this.affectedByAura) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.cellSize * 0.55, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(218, 165, 32, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw tower base
        ctx.save();
        ctx.translate(this.x, this.y);

        // Base circle
        ctx.beginPath();
        ctx.arc(0, 0, this.cellSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = stats.color;
        ctx.fill();
        ctx.strokeStyle = this.isSelected ? '#c9a227' : '#000';
        ctx.lineWidth = this.isSelected ? 3 : 2;
        ctx.stroke();

        // NFT glow effect
        if (this.isNftTower) {
            ctx.beginPath();
            ctx.arc(0, 0, this.cellSize * 0.45, 0, Math.PI * 2);
            ctx.strokeStyle = '#c9a227';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#c9a227';
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw facing direction
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.moveTo(this.cellSize * 0.2, 0);
        ctx.lineTo(this.cellSize * 0.4, 0);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();

        // Draw level indicator
        if (this.level > 0) {
            ctx.fillStyle = '#c9a227';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('★'.repeat(this.level), this.x, this.y + this.cellSize * 0.55);
        }
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

        // Visual properties based on type
        switch (towerStats.projectileType) {
            case 'arrow':
                this.size = 6;
                this.color = '#8B4513';
                break;
            case 'magic':
                this.size = 8;
                this.color = '#9932CC';
                break;
            case 'boulder':
                this.size = 12;
                this.color = '#696969';
                break;
            default:
                this.size = 5;
                this.color = '#fff';
        }
    }

    update(deltaTime) {
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
                // Draw arrow shape
                ctx.beginPath();
                ctx.moveTo(this.size, 0);
                ctx.lineTo(-this.size / 2, -this.size / 3);
                ctx.lineTo(-this.size / 2, this.size / 3);
                ctx.closePath();
                ctx.fillStyle = this.color;
                ctx.fill();
                break;

            case 'magic':
                // Draw magic orb with glow
                ctx.beginPath();
                ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
                break;

            case 'boulder':
                // Draw boulder
                ctx.beginPath();
                ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;

            default:
                ctx.beginPath();
                ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
        }

        ctx.restore();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TOWER_TYPES, Tower, Projectile };
}
