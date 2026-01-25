// sprites.js - Sprite loading and management for Horde Defense

class SpriteManager {
    constructor() {
        this.sprites = {};
        this.loaded = false;
        this.loadingPromise = null;
        this.onProgress = null;
    }

    // Define all sprite paths
    getSpritePaths() {
        return {
            // Tower sprites
            towers: {
                grunt: '/minigame/assets/towers/grunt.png',
                archer: '/minigame/assets/towers/archer.png',
                berserker: '/minigame/assets/towers/berserker.png',
                shaman: '/minigame/assets/towers/shaman.png',
                warlord: '/minigame/assets/towers/warlord.png',
                siege: '/minigame/assets/towers/siege.png'
            },
            // Enemy sprites
            enemies: {
                squire: '/minigame/assets/enemies/squire.png',
                knight: '/minigame/assets/enemies/knight.png',
                archer: '/minigame/assets/enemies/archer.png',
                cavalry: '/minigame/assets/enemies/cavalry.png',
                mage: '/minigame/assets/enemies/mage.png'
            },
            // Boss sprites
            bosses: {
                knight_commander: '/minigame/assets/enemies/knight_commander.png',
                archmage: '/minigame/assets/enemies/archmage.png',
                war_elephant: '/minigame/assets/enemies/war_elephant.png',
                dragon_rider: '/minigame/assets/enemies/dragon_rider.png'
            },
            // Map elements
            map: {
                grass: '/minigame/assets/map/grass.png',
                path: '/minigame/assets/map/path.png',
                tavern: '/minigame/assets/map/tavern.png',
                tree: '/minigame/assets/map/tree.png',
                rock: '/minigame/assets/map/rock.png'
            },
            // Projectiles
            projectiles: {
                arrow: '/minigame/assets/projectiles/arrow.png',
                fireball: '/minigame/assets/projectiles/fireball.png',
                magic: '/minigame/assets/projectiles/magic.png'
            }
        };
    }

    // Load a single image
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`Failed to load sprite: ${src}`);
                resolve(null); // Resolve with null instead of rejecting
            };
            img.src = src;
        });
    }

    // Load all sprites
    async loadAll(progressCallback = null) {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.onProgress = progressCallback;
        this.loadingPromise = this._loadAllSprites();
        return this.loadingPromise;
    }

    async _loadAllSprites() {
        const paths = this.getSpritePaths();
        const totalSprites = this._countSprites(paths);
        let loadedCount = 0;

        for (const category of Object.keys(paths)) {
            this.sprites[category] = {};
            for (const [name, path] of Object.entries(paths[category])) {
                const img = await this.loadImage(path);
                this.sprites[category][name] = img;
                loadedCount++;

                if (this.onProgress) {
                    this.onProgress(loadedCount, totalSprites);
                }
            }
        }

        this.loaded = true;
        console.log(`Loaded ${loadedCount} sprites`);
        return this.sprites;
    }

    _countSprites(paths) {
        let count = 0;
        for (const category of Object.values(paths)) {
            count += Object.keys(category).length;
        }
        return count;
    }

    // Get a sprite by category and name
    get(category, name) {
        if (!this.sprites[category]) return null;
        return this.sprites[category][name] || null;
    }

    // Check if a specific sprite exists
    has(category, name) {
        return this.get(category, name) !== null;
    }

    // Check if sprites are loaded
    isLoaded() {
        return this.loaded;
    }
}

// Global sprite manager instance
const spriteManager = new SpriteManager();

// Utility function to draw sprite with fallback
function drawSprite(ctx, sprite, x, y, width, height, options = {}) {
    if (sprite) {
        ctx.save();

        if (options.rotation) {
            ctx.translate(x + width / 2, y + height / 2);
            ctx.rotate(options.rotation);
            ctx.translate(-width / 2, -height / 2);
            x = 0;
            y = 0;
        }

        if (options.alpha !== undefined) {
            ctx.globalAlpha = options.alpha;
        }

        if (options.flip) {
            ctx.scale(-1, 1);
            x = -x - width;
        }

        // Apply shadow/glow if specified
        if (options.glow) {
            ctx.shadowColor = options.glowColor || '#fff';
            ctx.shadowBlur = options.glowSize || 10;
        }

        ctx.drawImage(sprite, x, y, width, height);
        ctx.restore();
        return true;
    }
    return false;
}

// Utility function to draw centered sprite
function drawSpriteCenter(ctx, sprite, centerX, centerY, size, options = {}) {
    const halfSize = size / 2;
    return drawSprite(ctx, sprite, centerX - halfSize, centerY - halfSize, size, size, options);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpriteManager, spriteManager, drawSprite, drawSpriteCenter };
}
