// sounds.js - Sound effects for Horde Defense (Audio files + Web Audio API fallbacks)

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.5;
        this.muted = false;
        this.initialized = false;
        this.sounds = {};
        this.basePath = '/minigame/assets/sounds/';
    }

    // Initialize audio context and preload sounds
    init() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.masterVolume;
            this.initialized = true;

            // Preload audio files
            this.preloadSounds();
            console.log('Sound system initialized');
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    preloadSounds() {
        const soundFiles = [
            'tower-attack-melee',
            'tower-attack-arrow',
            'tower-attack-magic',
            'tower-attack-boulder',
            'tower-upgrade',
            'tower-sell',
            'enemy-death',
            'boss-death',
            'life-lost',
            'wave-start',
            'wave-complete',
            'boss-warning',
            'victory',
            'defeat'
        ];

        soundFiles.forEach(name => {
            const audio = new Audio(this.basePath + name + '.mp3');
            audio.preload = 'auto';
            audio.volume = this.masterVolume;
            this.sounds[name] = audio;
        });
    }

    // Play a preloaded sound file
    playSound(name, volume = 1.0) {
        if (this.muted || !this.sounds[name]) return;

        try {
            // Clone the audio to allow overlapping plays
            const sound = this.sounds[name].cloneNode();
            sound.volume = this.masterVolume * volume;
            sound.play().catch(() => {}); // Ignore autoplay errors
        } catch (e) {
            console.warn('Error playing sound:', name, e);
        }
    }

    // Ensure context is running (needed after user interaction)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
        }
        // Update preloaded sounds volume
        Object.values(this.sounds).forEach(audio => {
            audio.volume = this.masterVolume;
        });
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
        }
        return this.muted;
    }

    // Play a tone with envelope (for fallback/UI sounds)
    playTone(frequency, duration, type = 'square', volume = 0.3, attack = 0.01, decay = 0.1) {
        if (!this.initialized || this.muted) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = type;
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(0, this.audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(volume * this.masterVolume, this.audioContext.currentTime + attack);
        gain.gain.linearRampToValueAtTime(volume * this.masterVolume * 0.5, this.audioContext.currentTime + attack + decay);
        gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.audioContext.currentTime);
        osc.stop(this.audioContext.currentTime + duration);
    }

    // === GAME SOUND EFFECTS ===

    // Tower placed (synthesized - no file provided)
    towerPlace() {
        this.playTone(200, 0.15, 'square', 0.25);
        setTimeout(() => this.playTone(300, 0.15, 'square', 0.25), 50);
        setTimeout(() => this.playTone(400, 0.2, 'square', 0.3), 100);
    }

    // Tower attack - varies by type
    towerAttack(type = 'default') {
        switch (type) {
            case 'melee':
                this.playSound('tower-attack-melee', 0.7);
                break;
            case 'arrow':
                this.playSound('tower-attack-arrow', 0.6);
                break;
            case 'magic':
                this.playSound('tower-attack-magic', 0.7);
                break;
            case 'boulder':
                this.playSound('tower-attack-boulder', 0.8);
                break;
            default:
                this.playSound('tower-attack-melee', 0.5);
        }
    }

    // Tower upgrade
    towerUpgrade() {
        this.playSound('tower-upgrade', 0.8);
    }

    // Tower sold
    towerSell() {
        this.playSound('tower-sell', 0.8);
    }

    // Enemy death
    enemyDeath() {
        this.playSound('enemy-death', 0.6);
    }

    // Enemy reached tavern (lost life)
    lifeLost() {
        this.playSound('life-lost', 0.9);
    }

    // Gold earned (synthesized - no file provided)
    goldEarned() {
        this.playTone(800, 0.06, 'sine', 0.15);
        this.playTone(1000, 0.08, 'sine', 0.12, 0.03, 0.05);
    }

    // Wave start
    waveStart() {
        this.playSound('wave-start', 0.8);
    }

    // Wave complete
    waveComplete() {
        this.playSound('wave-complete', 0.8);
    }

    // Boss incoming warning
    bossWarning() {
        this.playSound('boss-warning', 0.9);
    }

    // Boss death
    bossDeath() {
        this.playSound('boss-death', 1.0);
    }

    // Victory fanfare
    victory() {
        this.playSound('victory', 1.0);
    }

    // Defeat
    defeat() {
        this.playSound('defeat', 1.0);
    }

    // UI click (synthesized - no file provided)
    uiClick() {
        this.playTone(600, 0.05, 'square', 0.15);
    }

    // UI hover (synthesized - no file provided)
    uiHover() {
        this.playTone(800, 0.03, 'sine', 0.08);
    }

    // Error / can't afford (synthesized - no file provided)
    error() {
        this.playTone(200, 0.1, 'square', 0.25);
        setTimeout(() => this.playTone(150, 0.15, 'square', 0.25), 100);
    }

    // Pause (synthesized - no file provided)
    pause() {
        this.playTone(300, 0.1, 'sine', 0.2);
        this.playTone(200, 0.15, 'sine', 0.15, 0.05, 0.1);
    }

    // Unpause (synthesized - no file provided)
    unpause() {
        this.playTone(200, 0.1, 'sine', 0.2);
        this.playTone(300, 0.15, 'sine', 0.2, 0.05, 0.1);
    }
}

// Global sound manager instance
const soundManager = new SoundManager();
