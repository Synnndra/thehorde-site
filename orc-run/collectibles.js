// collectibles.js - Coins and power-ups for Orc Run
// NFT flat-vector style: dark outlines, solid fills, geometric shapes

const COLLECT_OUTLINE = '#1a0a0a';

class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.active = true;
        this.collected = false;
        this.collectAnim = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    get hitbox() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    update(dt, speed, magnetX, magnetY, magnetActive) {
        this.x -= speed * dt;
        this.angle += dt * 4;
        this.bobOffset += dt * 3;

        if (magnetActive && !this.collected) {
            const dx = magnetX - this.x;
            const dy = magnetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 200) {
                const force = 400 * (1 - dist / 200);
                this.x += (dx / dist) * force * dt;
                this.y += (dy / dist) * force * dt;
            }
        }

        if (this.collected) {
            this.collectAnim += dt * 3;
            if (this.collectAnim > 1) this.active = false;
        }

        if (this.x < -20) this.active = false;
    }

    draw(ctx) {
        if (this.collected) {
            ctx.globalAlpha = 1 - this.collectAnim;
            ctx.fillStyle = '#D4A017';
            ctx.strokeStyle = COLLECT_OUTLINE;
            ctx.lineWidth = 1;
            ctx.font = 'bold 14px Cinzel, serif';
            ctx.textAlign = 'center';
            ctx.strokeText('+10', this.x, this.y - 10 - this.collectAnim * 20);
            ctx.fillText('+10', this.x, this.y - 10 - this.collectAnim * 20);
            ctx.globalAlpha = 1;
            return;
        }

        const bob = Math.sin(this.bobOffset) * 3;
        const squeeze = Math.abs(Math.cos(this.angle));

        ctx.save();
        ctx.translate(this.x, this.y + bob);

        // Soft glow
        ctx.shadowColor = '#D4A017';
        ctx.shadowBlur = 6;

        // Coin body (spinning ellipse) - gold with outline
        ctx.fillStyle = '#D4A017';
        ctx.strokeStyle = COLLECT_OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * squeeze, this.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner detail when facing forward
        if (squeeze > 0.3) {
            // Inner ring
            ctx.fillStyle = '#a88520';
            ctx.strokeStyle = '#8a6a18';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.radius * squeeze * 0.6, this.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // "H" emblem when wide enough
            if (squeeze > 0.6) {
                ctx.fillStyle = '#e0c050';
                ctx.font = `bold ${Math.floor(this.radius)}px Cinzel, serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('H', 0, 0);
            }
        }

        // Highlight on top edge
        if (squeeze > 0.2) {
            ctx.strokeStyle = 'rgba(255, 240, 180, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(0, -this.radius * 0.3, this.radius * squeeze * 0.4, this.radius * 0.15, 0, 0, Math.PI);
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

const POWERUP_TYPES = {
    shield: {
        color: '#2288bb',
        duration: 8,
        icon: 'S',
        label: 'SHIELD'
    },
    speed_boost: {
        color: '#cc3322',
        duration: 5,
        icon: 'B',
        label: 'SPEED BOOST'
    },
    coin_magnet: {
        color: '#8833aa',
        duration: 8,
        icon: 'M',
        label: 'MAGNET'
    },
    double_points: {
        color: '#228833',
        duration: 10,
        icon: '2x',
        label: 'DOUBLE POINTS'
    }
};

class PowerUp {
    constructor(type, x, y) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.active = true;
        this.collected = false;
        this.bobAngle = Math.random() * Math.PI * 2;
        this.glowAngle = 0;
    }

    get hitbox() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    update(dt, speed) {
        this.x -= speed * dt;
        this.bobAngle += dt * 3;
        this.glowAngle += dt * 5;
        if (this.x < -30) this.active = false;
    }

    draw(ctx) {
        const def = POWERUP_TYPES[this.type];
        const bob = Math.sin(this.bobAngle) * 5;
        const glow = Math.sin(this.glowAngle) * 0.3 + 0.7;

        ctx.save();
        ctx.translate(this.x, this.y + bob);

        // Outer glow (subtle)
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 10 * glow;

        // Orb body with flat fill and outline
        ctx.fillStyle = def.color;
        ctx.strokeStyle = COLLECT_OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner lighter circle
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(-2, -2, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Highlight crescent
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(-3, -4, this.radius * 0.35, this.radius * 0.2, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Icon text with outline
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COLLECT_OUTLINE;
        ctx.lineWidth = 1;
        ctx.font = 'bold 12px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(def.icon, 0, 0);
        ctx.fillText(def.icon, 0, 0);

        ctx.restore();
    }
}

class CollectibleManager {
    constructor(groundY, canvasWidth) {
        this.groundY = groundY;
        this.canvasWidth = canvasWidth;
        this.coins = [];
        this.powerUps = [];
        this.lastCoinDistance = 0;
        this.lastPowerUpDistance = 0;
        this.coinPatterns = ['line', 'arc', 'jump_arc'];
    }

    update(dt, speed, distance, playerX, playerY, magnetActive) {
        // Update coins
        this.coins.forEach(c => c.update(dt, speed, playerX, playerY, magnetActive));
        this.coins = this.coins.filter(c => c.active);

        // Update power-ups
        this.powerUps.forEach(p => p.update(dt, speed));
        this.powerUps = this.powerUps.filter(p => p.active);

        // Spawn coins
        if (distance - this.lastCoinDistance > 200 + Math.random() * 300) {
            this.spawnCoinPattern(distance);
            this.lastCoinDistance = distance;
        }

        // Spawn power-ups
        if (distance - this.lastPowerUpDistance > 1800 + Math.random() * 400) {
            this.spawnPowerUp();
            this.lastPowerUpDistance = distance;
        }
    }

    spawnCoinPattern(distance) {
        const pattern = this.coinPatterns[Math.floor(Math.random() * this.coinPatterns.length)];
        const startX = this.canvasWidth + 50;

        switch (pattern) {
            case 'line':
                for (let i = 0; i < 5; i++) {
                    this.coins.push(new Coin(startX + i * 30, this.groundY - 30));
                }
                break;
            case 'arc':
                for (let i = 0; i < 7; i++) {
                    const t = i / 6;
                    const arcY = this.groundY - 30 - Math.sin(t * Math.PI) * 60;
                    this.coins.push(new Coin(startX + i * 25, arcY));
                }
                break;
            case 'jump_arc':
                for (let i = 0; i < 5; i++) {
                    const t = i / 4;
                    const arcY = this.groundY - 40 - Math.sin(t * Math.PI) * 80;
                    this.coins.push(new Coin(startX + i * 30, arcY));
                }
                break;
        }
    }

    spawnPowerUp() {
        const types = Object.keys(POWERUP_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        const x = this.canvasWidth + 50;
        const y = this.groundY - 50 - Math.random() * 30;
        this.powerUps.push(new PowerUp(type, x, y));
    }

    checkCoinCollisions(playerHitbox) {
        let collected = 0;
        this.coins.forEach(coin => {
            if (!coin.collected && this._aabb(playerHitbox, coin.hitbox)) {
                coin.collected = true;
                collected++;
            }
        });
        return collected;
    }

    checkPowerUpCollisions(playerHitbox) {
        const hit = [];
        this.powerUps.forEach(pu => {
            if (!pu.collected && this._aabb(playerHitbox, pu.hitbox)) {
                pu.collected = true;
                pu.active = false;
                hit.push(pu.type);
            }
        });
        return hit;
    }

    _aabb(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }

    draw(ctx) {
        this.coins.forEach(c => c.draw(ctx));
        this.powerUps.forEach(p => p.draw(ctx));
    }

    reset(canvasWidth) {
        this.coins = [];
        this.powerUps = [];
        this.lastCoinDistance = 0;
        this.lastPowerUpDistance = 0;
        this.canvasWidth = canvasWidth;
    }
}
