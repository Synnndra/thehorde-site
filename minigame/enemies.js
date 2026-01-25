// enemies.js - Enemy definitions and AI for Horde Defense

const ENEMY_TYPES = {
    squire: {
        name: "Squire",
        description: "Basic trainee knight. Slow and weak.",
        icon: "🛡️",
        color: "#C0C0C0",
        hp: 50,
        speed: 1.0,
        armor: 0,
        goldReward: 10,
        damage: 1, // Damage to lives when reaching end
        size: 0.6
    },

    knight: {
        name: "Knight",
        description: "Armored warrior. Moderate speed and HP.",
        icon: "⚔️",
        color: "#708090",
        hp: 120,
        speed: 1.2,
        armor: 2, // Flat damage reduction
        goldReward: 20,
        damage: 1,
        size: 0.7
    },

    archer: {
        name: "Archer",
        description: "Ranged attacker. Can damage your orcs!",
        icon: "🏹",
        color: "#228B22",
        hp: 60,
        speed: 1.5,
        armor: 0,
        goldReward: 25,
        damage: 1,
        size: 0.55,
        canAttack: true,
        attackDamage: 10,
        attackRange: 2.5,
        attackSpeed: 0.5
    },

    cavalry: {
        name: "Cavalry",
        description: "Fast mounted knight. High HP.",
        icon: "🐴",
        color: "#8B4513",
        hp: 200,
        speed: 2.5,
        armor: 1,
        goldReward: 35,
        damage: 2,
        size: 0.8
    },

    mage: {
        name: "Mage",
        description: "Casts spells. Can disable towers!",
        icon: "🧙",
        color: "#4169E1",
        hp: 80,
        speed: 1.0,
        armor: 0,
        goldReward: 40,
        damage: 1,
        size: 0.6,
        canDisable: true,
        disableChance: 0.1, // 10% chance per second
        disableDuration: 3.0
    }
};

const BOSS_TYPES = {
    knight_commander: {
        name: "Knight Commander",
        description: "Leader of the knights. Extremely tough.",
        icon: "👑",
        color: "#FFD700",
        hp: 1500,
        speed: 0.8,
        armor: 5,
        goldReward: 200,
        damage: 5,
        size: 1.0,
        isBoss: true,
        abilities: ['rally'] // Speeds up nearby enemies
    },

    archmage: {
        name: "Archmage",
        description: "Master of magic. Regenerates health!",
        icon: "⚡",
        color: "#9400D3",
        hp: 1000,
        speed: 1.0,
        armor: 2,
        goldReward: 250,
        damage: 4,
        size: 0.9,
        isBoss: true,
        abilities: ['regenerate', 'massDisable'],
        regenRate: 20 // HP per second
    },

    war_elephant: {
        name: "War Elephant",
        description: "Massive beast! Crushes everything.",
        icon: "🐘",
        color: "#808080",
        hp: 3000,
        speed: 0.5,
        armor: 10,
        goldReward: 350,
        damage: 10,
        size: 1.3,
        isBoss: true,
        abilities: ['trample'] // Damages nearby towers
    },

    dragon_rider: {
        name: "Dragon Rider",
        description: "The final boss! Flying death!",
        icon: "🐉",
        color: "#FF4500",
        hp: 2500,
        speed: 1.5,
        armor: 8,
        goldReward: 500,
        damage: 20,
        size: 1.2,
        isBoss: true,
        abilities: ['fly', 'fireBreath'],
        ignoresPath: false // Could be true for flying
    }
};

// Enemy class
class Enemy {
    constructor(type, path, cellSize, waveNumber = 1) {
        const typeData = ENEMY_TYPES[type] || BOSS_TYPES[type];
        if (!typeData) {
            console.error(`Unknown enemy type: ${type}`);
            return;
        }

        this.type = type;
        this.typeData = typeData;
        this.path = path;
        this.cellSize = cellSize;

        // Scale stats based on wave number
        const waveScale = 1 + (waveNumber - 1) * 0.1; // 10% increase per wave

        // Stats
        this.maxHp = Math.round(typeData.hp * waveScale);
        this.hp = this.maxHp;
        this.baseSpeed = typeData.speed;
        this.speed = typeData.speed;
        this.armor = typeData.armor;
        this.goldReward = Math.round(typeData.goldReward * (1 + (waveNumber - 1) * 0.05));
        this.damage = typeData.damage;
        this.size = typeData.size;
        this.isBoss = typeData.isBoss || false;

        // Position (start at beginning of path)
        this.pathIndex = 0;
        this.distanceTraveled = 0;
        this.x = path[0].x * cellSize + cellSize / 2;
        this.y = path[0].y * cellSize + cellSize / 2;
        this.rotation = 0;

        // State
        this.isDead = false;
        this.reachedEnd = false;
        this.slowEffect = null;
        this.disabledTowers = [];

        // Combat (for archers)
        this.canAttack = typeData.canAttack || false;
        this.attackDamage = typeData.attackDamage || 0;
        this.attackRange = typeData.attackRange || 0;
        this.attackSpeed = typeData.attackSpeed || 0;
        this.attackCooldown = 0;

        // Mage abilities
        this.canDisable = typeData.canDisable || false;
        this.disableChance = typeData.disableChance || 0;
        this.disableDuration = typeData.disableDuration || 0;
        this.disableCooldown = 0;

        // Boss abilities
        this.abilities = typeData.abilities || [];
        this.regenRate = typeData.regenRate || 0;
        this.abilityCooldowns = {};

        // Visual effects
        this.damageFlash = 0;
        this.floatingTexts = [];
    }

    takeDamage(damage) {
        // Apply armor
        const effectiveDamage = Math.max(1, damage - this.armor);
        this.hp -= effectiveDamage;
        this.damageFlash = 0.2; // Flash duration

        // Add floating damage text
        this.floatingTexts.push({
            text: `-${effectiveDamage}`,
            x: this.x,
            y: this.y - this.cellSize * 0.5,
            life: 1.0,
            color: '#ff4444'
        });

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }

        return effectiveDamage;
    }

    applySlow(amount, duration) {
        // Only apply if stronger than current slow
        if (!this.slowEffect || amount > this.slowEffect.amount) {
            this.slowEffect = {
                amount: amount,
                duration: duration,
                remaining: duration
            };
            this.speed = this.baseSpeed * (1 - amount);
        }
    }

    update(deltaTime, towers) {
        if (this.isDead || this.reachedEnd) return;

        // Update slow effect
        if (this.slowEffect) {
            this.slowEffect.remaining -= deltaTime;
            if (this.slowEffect.remaining <= 0) {
                this.slowEffect = null;
                this.speed = this.baseSpeed;
            }
        }

        // Boss regeneration
        if (this.regenRate > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.regenRate * deltaTime);
        }

        // Move along path
        const moveDistance = this.speed * this.cellSize * deltaTime;
        this.distanceTraveled += moveDistance;

        // Calculate position on path
        const pos = this.getPositionOnPath(this.distanceTraveled);
        if (pos.finished) {
            this.reachedEnd = true;
            return;
        }

        this.x = pos.x;
        this.y = pos.y;
        this.rotation = pos.angle;

        // Archer attacking
        if (this.canAttack) {
            this.attackCooldown -= deltaTime;
            if (this.attackCooldown <= 0) {
                const target = this.findTowerTarget(towers);
                if (target) {
                    this.attackTower(target);
                    this.attackCooldown = 1 / this.attackSpeed;
                }
            }
        }

        // Mage disabling
        if (this.canDisable) {
            this.disableCooldown -= deltaTime;
            if (this.disableCooldown <= 0 && Math.random() < this.disableChance * deltaTime) {
                const target = this.findTowerToDisable(towers);
                if (target) {
                    this.disableTower(target);
                    this.disableCooldown = 2.0; // Cooldown between disable attempts
                }
            }
        }

        // Update visual effects
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }

        // Update floating texts
        this.floatingTexts = this.floatingTexts.filter(text => {
            text.life -= deltaTime * 2;
            text.y -= 30 * deltaTime;
            return text.life > 0;
        });
    }

    getPositionOnPath(distance) {
        let traveled = 0;

        for (let i = 0; i < this.path.length - 1; i++) {
            const start = this.path[i];
            const end = this.path[i + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy) * this.cellSize;

            if (traveled + segmentLength >= distance) {
                const remaining = distance - traveled;
                const ratio = remaining / segmentLength;
                return {
                    x: (start.x + dx * ratio) * this.cellSize + this.cellSize / 2,
                    y: (start.y + dy * ratio) * this.cellSize + this.cellSize / 2,
                    angle: Math.atan2(dy, dx),
                    finished: false
                };
            }
            traveled += segmentLength;
        }

        // Reached end of path
        const lastPoint = this.path[this.path.length - 1];
        return {
            x: lastPoint.x * this.cellSize + this.cellSize / 2,
            y: lastPoint.y * this.cellSize + this.cellSize / 2,
            angle: 0,
            finished: true
        };
    }

    findTowerTarget(towers) {
        const rangePixels = this.attackRange * this.cellSize;
        let closest = null;
        let closestDist = Infinity;

        towers.forEach(tower => {
            const dx = tower.x - this.x;
            const dy = tower.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= rangePixels && dist < closestDist) {
                closest = tower;
                closestDist = dist;
            }
        });

        return closest;
    }

    attackTower(tower) {
        // Enemy archers can damage towers (optional mechanic)
        // For now, just visual effect
        this.floatingTexts.push({
            text: '→',
            x: this.x,
            y: this.y,
            life: 0.5,
            color: '#228B22'
        });
    }

    findTowerToDisable(towers) {
        const rangePixels = 3 * this.cellSize; // Fixed disable range
        const available = towers.filter(tower => {
            if (tower.isDisabled) return false;
            const dx = tower.x - this.x;
            const dy = tower.y - this.y;
            return Math.sqrt(dx * dx + dy * dy) <= rangePixels;
        });

        return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
    }

    disableTower(tower) {
        tower.isDisabled = true;
        tower.disabledDuration = this.disableDuration;

        this.floatingTexts.push({
            text: '✧',
            x: this.x,
            y: this.y,
            life: 1.0,
            color: '#4169E1'
        });
    }

    draw(ctx) {
        if (this.isDead && this.floatingTexts.length === 0) return;

        const radius = (this.cellSize * this.size) / 2;

        // Draw enemy body
        if (!this.isDead) {
            ctx.save();
            ctx.translate(this.x, this.y);

            // Damage flash effect
            let bodyColor = this.typeData.color;
            if (this.damageFlash > 0) {
                bodyColor = '#ffffff';
            }

            // Slow effect visual
            if (this.slowEffect) {
                ctx.beginPath();
                ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(75, 0, 130, 0.3)';
                ctx.fill();
            }

            // Boss glow
            if (this.isBoss) {
                ctx.beginPath();
                ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Main body
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fillStyle = bodyColor;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Direction indicator
            ctx.rotate(this.rotation);
            ctx.beginPath();
            ctx.moveTo(radius * 0.3, 0);
            ctx.lineTo(radius, 0);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.restore();

            // Health bar
            const barWidth = radius * 2;
            const barHeight = 4;
            const barY = this.y - radius - 8;

            // Background
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);

            // Health
            const healthRatio = this.hp / this.maxHp;
            let healthColor = '#4CAF50';
            if (healthRatio < 0.3) healthColor = '#f44336';
            else if (healthRatio < 0.6) healthColor = '#ff9800';

            ctx.fillStyle = healthColor;
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthRatio, barHeight);

            // Border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.x - barWidth / 2, barY, barWidth, barHeight);

            // Boss name
            if (this.isBoss) {
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 12px Cinzel, serif';
                ctx.textAlign = 'center';
                ctx.fillText(this.typeData.name, this.x, barY - 5);
            }
        }

        // Draw floating texts
        this.floatingTexts.forEach(text => {
            ctx.fillStyle = text.color;
            ctx.globalAlpha = text.life;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(text.text, text.x, text.y);
        });
        ctx.globalAlpha = 1;
    }
}

// Wave generation
function generateWave(waveNumber, mapDifficulty) {
    const enemies = [];

    // Base enemy counts that increase with wave number
    let squireCount = Math.floor(5 + waveNumber * 0.5);
    let knightCount = Math.max(0, Math.floor((waveNumber - 2) * 0.8));
    let archerCount = Math.max(0, Math.floor((waveNumber - 4) * 0.6));
    let cavalryCount = Math.max(0, Math.floor((waveNumber - 6) * 0.4));
    let mageCount = Math.max(0, Math.floor((waveNumber - 8) * 0.3));

    // Difficulty multipliers
    const difficultyMult = {
        easy: 0.8,
        medium: 1.0,
        hard: 1.3
    }[mapDifficulty] || 1.0;

    squireCount = Math.round(squireCount * difficultyMult);
    knightCount = Math.round(knightCount * difficultyMult);
    archerCount = Math.round(archerCount * difficultyMult);
    cavalryCount = Math.round(cavalryCount * difficultyMult);
    mageCount = Math.round(mageCount * difficultyMult);

    // Add enemies to wave
    for (let i = 0; i < squireCount; i++) enemies.push('squire');
    for (let i = 0; i < knightCount; i++) enemies.push('knight');
    for (let i = 0; i < archerCount; i++) enemies.push('archer');
    for (let i = 0; i < cavalryCount; i++) enemies.push('cavalry');
    for (let i = 0; i < mageCount; i++) enemies.push('mage');

    // Boss waves (5, 10, 15, 20)
    if (waveNumber % 5 === 0) {
        const bossIndex = Math.floor(waveNumber / 5) - 1;
        const bossTypes = ['knight_commander', 'archmage', 'war_elephant', 'dragon_rider'];
        if (bossIndex < bossTypes.length) {
            enemies.push(bossTypes[bossIndex]);
        } else {
            enemies.push('dragon_rider'); // Final boss repeats
        }
    }

    // Shuffle enemies for variety (but keep boss at end)
    const boss = enemies.find(e => BOSS_TYPES[e]);
    const regularEnemies = enemies.filter(e => !BOSS_TYPES[e]);

    // Fisher-Yates shuffle
    for (let i = regularEnemies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [regularEnemies[i], regularEnemies[j]] = [regularEnemies[j], regularEnemies[i]];
    }

    // Add boss at the end if present
    if (boss) {
        regularEnemies.push(boss);
    }

    return regularEnemies;
}

// Get wave preview info
function getWavePreview(waveNumber, mapDifficulty) {
    const enemies = generateWave(waveNumber, mapDifficulty);
    const counts = {};

    enemies.forEach(type => {
        counts[type] = (counts[type] || 0) + 1;
    });

    return counts;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ENEMY_TYPES, BOSS_TYPES, Enemy, generateWave, getWavePreview };
}
