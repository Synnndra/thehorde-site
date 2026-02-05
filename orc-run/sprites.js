// sprites.js - Stub SpriteManager for Orc Run
// All rendering uses canvas-drawn placeholders. This stub exists so future
// sprite assets can be dropped in without changing game code.

class SpriteManager {
    constructor() {
        this.sprites = {};
        this.loaded = false;
    }

    isLoaded() { return true; }

    async loadAll(onProgress) {
        this.loaded = true;
        if (onProgress) onProgress(1, 1);
    }

    get(category, name) { return null; }
    has(category, name) { return false; }
}

const spriteManager = new SpriteManager();
