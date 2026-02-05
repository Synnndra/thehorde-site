// obstacles.js - Obstacle types and spawner for Orc Run
// NFT flat-vector style: dark outlines, solid fills, geometric shapes

function darkenColorObs(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}

function lightenColorObs(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))},${Math.min(255, Math.floor(g + (255 - g) * factor))},${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
}

const OUTLINE = '#1a0a0a';
const OUTLINE_W = 2;

// Load obstacle images
const OBSTACLE_IMAGES = {
    log: new Image(),
    fence: new Image(),
    rock: new Image(),
    barrel: new Image(),
    branch: new Image(),
    prime: new Image(),
    pizza: new Image(),
    jonny: new Image()
};
OBSTACLE_IMAGES.log.src = '/orc-run/obstacle-log.png';
OBSTACLE_IMAGES.fence.src = '/orc-run/obstacle-fence.png';
OBSTACLE_IMAGES.rock.src = '/orc-run/obstacle-rock.png';
OBSTACLE_IMAGES.barrel.src = '/orc-run/obstacle-barrel.png';
OBSTACLE_IMAGES.branch.src = '/orc-run/obstacle-branch.png';
OBSTACLE_IMAGES.prime.src = '/orc-run/obstacle-prime.png';
OBSTACLE_IMAGES.pizza.src = '/orc-run/obstacle-pizza.png';
OBSTACLE_IMAGES.jonny.src = '/orc-run/obstacle-jonny.png';

const OBSTACLE_TYPES = {
    log: {
        action: 'jump', width: 55, height: 28,
        unlockDistance: 0, // original: 0
        draw(ctx, x, y, w, h) {
            ctx.save();
            ctx.lineWidth = OUTLINE_W;
            ctx.strokeStyle = OUTLINE;
            ctx.lineCap = 'round';

            // Log body (side view - rounded rect)
            const logColor = '#6b4226';
            ctx.fillStyle = logColor;
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 4, w - 4, h - 6, 6);
            ctx.fill();
            ctx.stroke();

            // Wood grain lines
            ctx.strokeStyle = darkenColorObs('#6b4226', 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 8, y + h * 0.35);
            ctx.lineTo(x + w - 8, y + h * 0.35);
            ctx.moveTo(x + 10, y + h * 0.6);
            ctx.lineTo(x + w - 10, y + h * 0.6);
            ctx.moveTo(x + 6, y + h * 0.8);
            ctx.lineTo(x + w - 6, y + h * 0.8);
            ctx.stroke();

            // Left end circle (cross-section)
            ctx.fillStyle = '#8b5e3c';
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;
            ctx.beginPath();
            ctx.ellipse(x + 6, y + h / 2 + 1, 7, h / 2 - 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Rings on cross-section
            ctx.strokeStyle = darkenColorObs('#8b5e3c', 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(x + 6, y + h / 2 + 1, 3, h / 4 - 1, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Highlight on top edge
            ctx.strokeStyle = lightenColorObs('#6b4226', 0.25);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 10, y + 5);
            ctx.lineTo(x + w - 10, y + 5);
            ctx.stroke();

            ctx.restore();
        }
    },
    fence: {
        action: 'jump', width: 24, height: 44,
        unlockDistance: 0, // original: 300
        draw(ctx, x, y, w, h) {
            ctx.save();
            ctx.lineWidth = OUTLINE_W;
            ctx.strokeStyle = OUTLINE;

            const woodColor = '#8b7355';
            const darkWood = darkenColorObs('#8b7355', 0.7);

            // Vertical posts
            ctx.fillStyle = woodColor;
            ctx.beginPath();
            ctx.rect(x + 1, y, 6, h);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.rect(x + w - 7, y, 6, h);
            ctx.fill();
            ctx.stroke();

            // Pointed tops
            ctx.fillStyle = woodColor;
            ctx.beginPath();
            ctx.moveTo(x + 1, y);
            ctx.lineTo(x + 4, y - 5);
            ctx.lineTo(x + 7, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x + w - 7, y);
            ctx.lineTo(x + w - 4, y - 5);
            ctx.lineTo(x + w - 1, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Horizontal rails
            ctx.fillStyle = darkWood;
            ctx.beginPath();
            ctx.rect(x, y + 8, w, 5);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.rect(x, y + h - 16, w, 5);
            ctx.fill();
            ctx.stroke();

            // Nail dots
            ctx.fillStyle = '#555';
            [8 + 2.5, h - 16 + 2.5].forEach(ny => {
                [4, w - 4].forEach(nx => {
                    ctx.beginPath();
                    ctx.arc(x + nx, y + ny, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                });
            });

            // Highlight on left post
            ctx.strokeStyle = lightenColorObs('#8b7355', 0.2);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 3, y + 2);
            ctx.lineTo(x + 3, y + h - 2);
            ctx.stroke();

            ctx.restore();
        }
    },
    rock: {
        action: 'jump', width: 44, height: 38,
        unlockDistance: 0, // original: 500
        draw(ctx, x, y, w, h) {
            ctx.save();
            ctx.lineWidth = OUTLINE_W;
            ctx.strokeStyle = OUTLINE;

            const rockColor = '#6b6b6b';

            // Main rock body - angular, geometric
            ctx.fillStyle = rockColor;
            ctx.beginPath();
            ctx.moveTo(x + 4, y + h);
            ctx.lineTo(x + 1, y + h * 0.55);
            ctx.lineTo(x + w * 0.2, y + h * 0.15);
            ctx.lineTo(x + w * 0.45, y);
            ctx.lineTo(x + w * 0.75, y + h * 0.08);
            ctx.lineTo(x + w - 1, y + h * 0.45);
            ctx.lineTo(x + w - 2, y + h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Lighter face (left)
            ctx.fillStyle = lightenColorObs('#6b6b6b', 0.15);
            ctx.beginPath();
            ctx.moveTo(x + 1, y + h * 0.55);
            ctx.lineTo(x + w * 0.2, y + h * 0.15);
            ctx.lineTo(x + w * 0.45, y);
            ctx.lineTo(x + w * 0.35, y + h * 0.4);
            ctx.lineTo(x + 4, y + h);
            ctx.closePath();
            ctx.fill();

            // Crack lines
            ctx.strokeStyle = darkenColorObs('#6b6b6b', 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.45, y + 3);
            ctx.lineTo(x + w * 0.4, y + h * 0.35);
            ctx.lineTo(x + w * 0.5, y + h * 0.6);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x + w * 0.65, y + h * 0.2);
            ctx.lineTo(x + w * 0.6, y + h * 0.5);
            ctx.stroke();

            // Small moss patch
            ctx.fillStyle = '#4a6a3a';
            ctx.beginPath();
            ctx.ellipse(x + w * 0.3, y + h * 0.85, 6, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    },
    barrel: {
        action: 'jump', width: 32, height: 38,
        unlockDistance: 0, // original: 1000
        draw(ctx, x, y, w, h) {
            ctx.save();
            ctx.lineWidth = OUTLINE_W;
            ctx.strokeStyle = OUTLINE;

            const barrelColor = '#8b5e3c';

            // Barrel body (bulging sides)
            ctx.fillStyle = barrelColor;
            ctx.beginPath();
            ctx.moveTo(x + 5, y + 2);
            ctx.quadraticCurveTo(x - 1, y + h / 2, x + 5, y + h - 2);
            ctx.lineTo(x + w - 5, y + h - 2);
            ctx.quadraticCurveTo(x + w + 1, y + h / 2, x + w - 5, y + 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Top rim
            ctx.fillStyle = darkenColorObs('#8b5e3c', 0.8);
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + 3, w / 2 - 4, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Vertical wood planks (lines)
            ctx.strokeStyle = darkenColorObs('#8b5e3c', 0.7);
            ctx.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
                const px = x + (w / 4) * i;
                ctx.beginPath();
                ctx.moveTo(px, y + 4);
                ctx.lineTo(px, y + h - 4);
                ctx.stroke();
            }

            // Metal bands
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';

            const bandPositions = [0.22, 0.5, 0.78];
            bandPositions.forEach(bp => {
                const by = y + h * bp;
                // Band curves with barrel bulge
                const bulge = Math.sin(bp * Math.PI) * 2;
                ctx.beginPath();
                ctx.moveTo(x + 3 - bulge, by);
                ctx.lineTo(x + w - 3 + bulge, by);
                ctx.stroke();
            });

            // Band highlight
            ctx.strokeStyle = lightenColorObs('#888888', 0.3);
            ctx.lineWidth = 1;
            const topBandY = y + h * 0.22 - 1;
            ctx.beginPath();
            ctx.moveTo(x + 6, topBandY);
            ctx.lineTo(x + w - 6, topBandY);
            ctx.stroke();

            // Rivets on bands
            ctx.fillStyle = '#666666';
            bandPositions.forEach(bp => {
                const by = y + h * bp;
                ctx.beginPath();
                ctx.arc(x + 6, by, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x + w - 6, by, 1.5, 0, Math.PI * 2);
                ctx.fill();
            });

            // Light highlight on left
            ctx.fillStyle = lightenColorObs('#8b5e3c', 0.2);
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(x + 6, y + 6);
            ctx.quadraticCurveTo(x + 2, y + h / 2, x + 6, y + h - 6);
            ctx.lineTo(x + 10, y + h - 6);
            ctx.quadraticCurveTo(x + 6, y + h / 2, x + 10, y + 6);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.restore();
        }
    },
    prime: {
        action: 'jump', width: 50, height: 60,
        unlockDistance: 0, // TEST: unlock immediately
        draw(ctx, x, y, w, h) {
            // Fallback procedural - yellow monster placeholder
            ctx.save();
            ctx.fillStyle = '#e8c820';
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;
            ctx.beginPath();
            ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    },
    pizza: {
        action: 'jump', width: 55, height: 50,
        unlockDistance: 0, // TEST: unlock immediately
        draw(ctx, x, y, w, h) {
            // Fallback procedural - pizza placeholder
            ctx.save();
            ctx.fillStyle = '#c4a35a';
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;
            ctx.beginPath();
            ctx.arc(x + w/2, y + h/2, w/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    },
    jonny: {
        action: 'duck', width: 100, height: 25,
        yOffset: -95,
        unlockDistance: 0, // TEST: unlock immediately
        draw(ctx, x, y, w, h) {
            // Fallback procedural - flying knight placeholder
            ctx.save();
            ctx.fillStyle = '#7080a0';
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;
            ctx.beginPath();
            ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    },
    branch: {
        action: 'duck', width: 100, height: 25,
        yOffset: -95,
        unlockDistance: 0, // original: 800
        draw(ctx, x, y, w, h) {
            ctx.save();
            ctx.lineWidth = OUTLINE_W;
            ctx.strokeStyle = OUTLINE;
            ctx.lineCap = 'round';

            const branchColor = '#5c3a21';

            // Main thick branch
            ctx.fillStyle = branchColor;
            ctx.beginPath();
            ctx.moveTo(x + w + 5, y + h / 2 - 4);
            ctx.lineTo(x + w + 5, y + h / 2 + 4);
            ctx.lineTo(x - 2, y + h / 2 + 3);
            ctx.lineTo(x - 2, y + h / 2 - 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Bark texture lines
            ctx.strokeStyle = darkenColorObs('#5c3a21', 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 5, y + h / 2 - 1);
            ctx.lineTo(x + w - 5, y + h / 2 - 2);
            ctx.moveTo(x + 10, y + h / 2 + 2);
            ctx.lineTo(x + w - 3, y + h / 2 + 2);
            ctx.stroke();

            // Sub-branches (pointed, geometric)
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;

            // Upper twig 1
            ctx.fillStyle = darkenColorObs('#5c3a21', 0.85);
            ctx.beginPath();
            ctx.moveTo(x + w * 0.25, y + h / 2 - 2);
            ctx.lineTo(x + w * 0.18, y - 4);
            ctx.lineTo(x + w * 0.3, y + h / 2 - 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Upper twig 2
            ctx.beginPath();
            ctx.moveTo(x + w * 0.55, y + h / 2 - 2);
            ctx.lineTo(x + w * 0.48, y - 2);
            ctx.lineTo(x + w * 0.6, y + h / 2 - 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Lower twig
            ctx.beginPath();
            ctx.moveTo(x + w * 0.7, y + h / 2 + 3);
            ctx.lineTo(x + w * 0.65, y + h + 4);
            ctx.lineTo(x + w * 0.75, y + h / 2 + 3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Leaves (geometric ovals with outlines)
            const leafColor = '#3a6a2e';
            ctx.fillStyle = leafColor;
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 1.5;

            const leaves = [
                { cx: x + w * 0.12, cy: y - 2, rx: 9, ry: 5, rot: -0.3 },
                { cx: x + w * 0.22, cy: y - 5, rx: 8, ry: 4, rot: 0.2 },
                { cx: x + w * 0.42, cy: y - 1, rx: 10, ry: 5, rot: -0.15 },
                { cx: x + w * 0.55, cy: y - 3, rx: 8, ry: 4, rot: 0.4 },
                { cx: x + w * 0.75, cy: y + h + 2, rx: 7, ry: 4, rot: 0.1 },
            ];

            leaves.forEach(l => {
                ctx.beginPath();
                ctx.ellipse(l.cx, l.cy, l.rx, l.ry, l.rot, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Leaf vein
                ctx.strokeStyle = darkenColorObs('#3a6a2e', 0.7);
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(l.cx - l.rx * 0.7 * Math.cos(l.rot), l.cy - l.rx * 0.7 * Math.sin(l.rot));
                ctx.lineTo(l.cx + l.rx * 0.7 * Math.cos(l.rot), l.cy + l.rx * 0.7 * Math.sin(l.rot));
                ctx.stroke();
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = 1.5;
            });

            ctx.restore();
        }
    }
};

class Obstacle {
    constructor(type, x, groundY) {
        this.type = type;
        const def = OBSTACLE_TYPES[type];
        this.width = def.width;
        this.height = def.height;
        this.action = def.action;
        this.isPit = def.isPit || false;

        this.x = x;
        if (def.yOffset) {
            this.y = groundY + def.yOffset;
        } else if (this.isPit) {
            this.y = groundY - 5;
        } else {
            this.y = groundY - this.height;
        }

        this.active = true;
        this.scored = false;
    }

    get hitbox() {
        const inset = 4;
        return {
            x: this.x + inset,
            y: this.y + inset,
            width: this.width - inset * 2,
            height: this.height - inset * 2
        };
    }

    update(dt, speed) {
        this.x -= speed * dt;
        if (this.x + this.width < -50) {
            this.active = false;
        }
    }

    draw(ctx) {
        const img = OBSTACLE_IMAGES[this.type];
        if (img && img.complete && img.naturalWidth > 0) {
            const imgAspect = img.naturalWidth / img.naturalHeight;
            let drawWidth, drawHeight, drawX, drawY;

            // Ground level reference (this.y + this.height for ground obstacles gives groundY)
            if (this.type === 'branch') {
                drawHeight = 80;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - 10;
                drawY = this.y - 25;  // Moved up
            } else if (this.type === 'jonny') {
                drawHeight = 130;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - 10;
                drawY = this.y - 80;  // Moved up more
            } else if (this.type === 'log') {
                drawHeight = 45;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight + 5;  // Bottom at ground
            } else if (this.type === 'fence') {
                drawHeight = 70;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight + 5;  // Bottom at ground
            } else if (this.type === 'rock') {
                drawHeight = 55;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight + 5;  // Bottom at ground
            } else if (this.type === 'barrel') {
                drawHeight = 55;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight + 5;  // Bottom at ground
            } else if (this.type === 'prime') {
                drawHeight = 80;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight - 10;  // Raised up
            } else if (this.type === 'pizza') {
                drawHeight = 70;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y + this.height - drawHeight + 5;  // Bottom at ground
            } else {
                // Fallback for any other type
                drawHeight = this.height * 1.2;
                drawWidth = drawHeight * imgAspect;
                drawX = this.x - (drawWidth - this.width) / 2;
                drawY = this.y;
            }

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        } else {
            // Fallback to procedural drawing
            OBSTACLE_TYPES[this.type].draw(ctx, this.x, this.y, this.width, this.height);
        }
    }
}

class ObstacleSpawner {
    constructor(groundY, canvasWidth) {
        this.groundY = groundY;
        this.canvasWidth = canvasWidth;
        this.obstacles = [];
        this.lastSpawnDistance = 0;
        this.minGap = 300;
    }

    getAvailableTypes(distance) {
        return Object.keys(OBSTACLE_TYPES).filter(
            type => distance >= OBSTACLE_TYPES[type].unlockDistance
        );
    }

    update(dt, speed, distance) {
        // Update existing obstacles
        this.obstacles.forEach(o => o.update(dt, speed));
        this.obstacles = this.obstacles.filter(o => o.active);

        // Spawn new obstacles
        const gap = 50; // TEST MODE: was Math.max(this.minGap, 500 - distance * 0.05);
        if (distance - this.lastSpawnDistance > gap) {
            const types = this.getAvailableTypes(distance);
            if (types.length > 0) {
                const type = types[Math.floor(Math.random() * types.length)];
                const obstacle = new Obstacle(type, this.canvasWidth + 50, this.groundY);
                this.obstacles.push(obstacle);
                this.lastSpawnDistance = distance;
            }
        }
    }

    draw(ctx) {
        this.obstacles.forEach(o => o.draw(ctx));
    }

    reset(canvasWidth) {
        this.obstacles = [];
        this.lastSpawnDistance = 0;
        this.canvasWidth = canvasWidth;
    }
}
