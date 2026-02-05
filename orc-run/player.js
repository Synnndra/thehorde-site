// player.js - Sprite-based Orc player character for Orc Run
// Uses 4 separate sprite images: orc-run1.png, orc-run2.png, orc-jump.png, orc-duck.png

class Player {
    constructor(x, groundY) {
        this.x = x;
        this.y = groundY;
        this.groundY = groundY;

        // Display size (scaled for game)
        this.width = 55;
        this.height = 95;
        this.duckHeight = 65;

        // Physics
        this.vy = 0;
        this.gravity = 1800;
        this.jumpVelocity = -650;

        // State
        this.state = 'running';
        this.prevState = 'running';

        // Animation
        this.runFrame = 0;
        this.runTimer = 0;
        this.deathTimer = 0;

        // Power-ups
        this.hasShield = false;
        this.shieldTimer = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.invincibleFlash = 0;

        // Dust particles
        this.dustParticles = [];
        this.dustTimer = 0;

        // Load individual sprite images
        this.sprites = {
            run1: new Image(),
            run2: new Image(),
            jump: new Image(),
            duck: new Image()
        };
        this.sprites.run1.src = '/orc-run/orc-run1.png';
        this.sprites.run2.src = '/orc-run/orc-run2.png';
        this.sprites.jump.src = '/orc-run/orc-jump.png';
        this.sprites.duck.src = '/orc-run/orc-duck.png';

        this.spritesLoaded = 0;
        const onLoad = () => {
            this.spritesLoaded++;
        };
        this.sprites.run1.onload = onLoad;
        this.sprites.run2.onload = onLoad;
        this.sprites.jump.onload = onLoad;
        this.sprites.duck.onload = onLoad;
    }

    get allSpritesLoaded() {
        return this.spritesLoaded >= 4;
    }

    get currentHeight() {
        return this.state === 'ducking' ? this.duckHeight : this.height;
    }

    get hitbox() {
        const inset = 10;
        const h = this.currentHeight;
        const w = this.width;
        return {
            x: this.x + inset,
            y: this.y - h + inset,
            width: w - inset * 2,
            height: h - inset * 2
        };
    }

    jump() {
        if (this.state === 'dead') return;
        if (this.state === 'jumping') return;
        this.state = 'jumping';
        this.vy = this.jumpVelocity;
        if (this.prevState === 'ducking') {
            this.prevState = 'running';
        }
        soundManager.jump();
    }

    duck() {
        if (this.state === 'dead') return;
        if (this.state === 'jumping') return;
        this.state = 'ducking';
        soundManager.duck();
    }

    stopDuck() {
        if (this.state === 'ducking') {
            this.state = 'running';
        }
    }

    die() {
        if (this.state === 'dead') return;
        this.state = 'dead';
        this.deathTimer = 0;
        soundManager.death();
    }

    activateShield(duration) {
        this.hasShield = true;
        this.shieldTimer = duration;
    }

    activateInvincible(duration) {
        this.isInvincible = true;
        this.invincibleTimer = duration;
    }

    hitObstacle() {
        if (this.isInvincible) return false;
        if (this.hasShield) {
            this.hasShield = false;
            this.shieldTimer = 0;
            soundManager.shieldHit();
            this.activateInvincible(0.5);
            return false;
        }
        this.die();
        return true;
    }

    update(dt) {
        if (this.state === 'dead') {
            this.deathTimer += dt;
            return;
        }

        if (this.hasShield) {
            this.shieldTimer -= dt;
            if (this.shieldTimer <= 0) this.hasShield = false;
        }

        if (this.isInvincible) {
            this.invincibleTimer -= dt;
            this.invincibleFlash += dt * 20;
            if (this.invincibleTimer <= 0) this.isInvincible = false;
        }

        if (this.state === 'jumping') {
            this.vy += this.gravity * dt;
            this.y += this.vy * dt;

            if (this.y >= this.groundY) {
                this.y = this.groundY;
                this.vy = 0;
                this.state = 'running';
                soundManager.land();
                for (let i = 0; i < 5; i++) {
                    this.dustParticles.push({
                        x: this.x + this.width / 2 + (Math.random() - 0.5) * 24,
                        y: this.groundY,
                        vx: (Math.random() - 0.5) * 70,
                        vy: -Math.random() * 35 - 10,
                        life: 0.45,
                        maxLife: 0.45,
                        size: Math.random() * 4 + 2
                    });
                }
            }
        }

        // Run animation cycle
        if (this.state === 'running') {
            this.runTimer += dt;
            if (this.runTimer > 0.12) {
                this.runTimer = 0;
                this.runFrame = (this.runFrame + 1) % 2;
            }
        }

        // Dust particles
        this.dustTimer += dt;
        if ((this.state === 'running' || this.state === 'ducking') && this.dustTimer > 0.12) {
            this.dustTimer = 0;
            this.dustParticles.push({
                x: this.x + 5,
                y: this.groundY,
                vx: -Math.random() * 50 - 15,
                vy: -Math.random() * 18,
                life: 0.35,
                maxLife: 0.35,
                size: Math.random() * 3.5 + 1
            });
        }

        this.dustParticles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        });
        this.dustParticles = this.dustParticles.filter(p => p.life > 0);
    }

    draw(ctx) {
        ctx.save();

        // Dust particles
        this.dustParticles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#b89a6a';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Invincibility flash
        if (this.isInvincible && Math.sin(this.invincibleFlash) > 0.3) {
            ctx.globalAlpha = 0.5;
        }

        // Draw sprite
        if (this.allSpritesLoaded) {
            this._drawSprite(ctx);
        } else {
            // Fallback rectangle while loading
            ctx.fillStyle = '#5a9a8a';
            ctx.fillRect(this.x, this.y - this.currentHeight, this.width, this.currentHeight);
        }

        // Shield glow
        if (this.hasShield) {
            const h = this.currentHeight;
            ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.15;
            ctx.strokeStyle = '#00ccff';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00ccff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.ellipse(
                this.x + this.width / 2,
                this.y - h / 2,
                this.width / 2 + 10,
                h / 2 + 10,
                0, 0, Math.PI * 2
            );
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    _drawSprite(ctx) {
        let sprite;
        let drawHeight = this.height;
        let drawWidth = this.width;

        if (this.state === 'dead') {
            sprite = this.sprites.run1;
        } else if (this.state === 'jumping') {
            sprite = this.sprites.jump;
        } else if (this.state === 'ducking') {
            sprite = this.sprites.duck;
            drawHeight = this.duckHeight;
        } else {
            // Running - alternate between run1 and run2
            sprite = this.runFrame === 0 ? this.sprites.run1 : this.sprites.run2;
        }

        // Calculate draw width maintaining aspect ratio
        if (sprite.width && sprite.height) {
            const aspectRatio = sprite.width / sprite.height;
            drawWidth = drawHeight * aspectRatio;
        }

        if (this.state === 'dead') {
            // Death animation - fall over
            ctx.save();
            const fallAngle = Math.min(this.deathTimer * 3, Math.PI / 2);
            ctx.translate(this.x + drawWidth / 2, this.y);
            ctx.rotate(fallAngle);

            // Draw slightly faded
            ctx.globalAlpha = Math.max(0.3, 1 - this.deathTimer * 0.5);

            ctx.drawImage(
                sprite,
                -drawWidth / 2, -drawHeight,
                drawWidth, drawHeight
            );
            ctx.restore();
        } else {
            // Normal drawing - align feet to ground
            ctx.drawImage(
                sprite,
                this.x, this.y - drawHeight,
                drawWidth, drawHeight
            );
        }
    }
}
