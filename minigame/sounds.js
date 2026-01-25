// sounds.js - Web Audio API sound effects for Horde Defense

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.5;
        this.muted = false;
        this.initialized = false;
    }

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.masterVolume;
            this.initialized = true;
            console.log('Sound system initialized');
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
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
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
        }
        return this.muted;
    }

    // Play a tone with envelope
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

    // Play noise burst (for explosions, hits)
    playNoise(duration, volume = 0.2, filter = 1000) {
        if (!this.initialized || this.muted) return;
        this.resume();

        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        filterNode.type = 'lowpass';
        filterNode.frequency.value = filter;

        gainNode.gain.setValueAtTime(volume * this.masterVolume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        noise.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGain);

        noise.start();
        noise.stop(this.audioContext.currentTime + duration);
    }

    // === GAME SOUND EFFECTS ===

    // Tower placed
    towerPlace() {
        this.playTone(200, 0.15, 'square', 0.25);
        setTimeout(() => this.playTone(300, 0.15, 'square', 0.25), 50);
        setTimeout(() => this.playTone(400, 0.2, 'square', 0.3), 100);
    }

    // Tower attack - varies by type
    towerAttack(type = 'default') {
        switch (type) {
            case 'melee':
                this.playNoise(0.08, 0.15, 2000);
                this.playTone(150, 0.08, 'sawtooth', 0.2);
                break;
            case 'arrow':
                this.playTone(800, 0.05, 'sine', 0.15);
                this.playTone(600, 0.08, 'sine', 0.1, 0.05, 0.03);
                break;
            case 'magic':
                this.playTone(400, 0.15, 'sine', 0.2);
                this.playTone(600, 0.2, 'sine', 0.15, 0.05, 0.1);
                break;
            case 'boulder':
                this.playNoise(0.15, 0.25, 500);
                this.playTone(80, 0.2, 'sine', 0.3);
                break;
            default:
                this.playTone(300, 0.08, 'square', 0.15);
        }
    }

    // Tower upgrade
    towerUpgrade() {
        this.playTone(300, 0.1, 'sine', 0.25);
        setTimeout(() => this.playTone(400, 0.1, 'sine', 0.25), 80);
        setTimeout(() => this.playTone(500, 0.1, 'sine', 0.25), 160);
        setTimeout(() => this.playTone(600, 0.2, 'sine', 0.3), 240);
    }

    // Tower sold
    towerSell() {
        this.playTone(400, 0.1, 'square', 0.2);
        setTimeout(() => this.playTone(300, 0.1, 'square', 0.2), 80);
        setTimeout(() => this.playTone(200, 0.15, 'square', 0.15), 160);
    }

    // Enemy death
    enemyDeath() {
        this.playNoise(0.12, 0.2, 1500);
        this.playTone(200, 0.1, 'sawtooth', 0.2);
        this.playTone(100, 0.15, 'sawtooth', 0.15, 0.05, 0.1);
    }

    // Enemy reached tavern (lost life)
    lifeLost() {
        this.playTone(200, 0.2, 'sawtooth', 0.35);
        setTimeout(() => this.playTone(150, 0.3, 'sawtooth', 0.35), 150);
    }

    // Gold earned
    goldEarned() {
        this.playTone(800, 0.06, 'sine', 0.15);
        this.playTone(1000, 0.08, 'sine', 0.12, 0.03, 0.05);
    }

    // Wave start
    waveStart() {
        this.playTone(150, 0.15, 'square', 0.25);
        setTimeout(() => this.playTone(200, 0.15, 'square', 0.25), 120);
        setTimeout(() => this.playTone(250, 0.15, 'square', 0.25), 240);
        setTimeout(() => this.playTone(300, 0.25, 'square', 0.3), 360);
    }

    // Wave complete
    waveComplete() {
        const notes = [400, 500, 600, 800];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.15, 'sine', 0.25), i * 100);
        });
    }

    // Boss incoming warning
    bossWarning() {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.playTone(100, 0.3, 'sawtooth', 0.35);
                this.playTone(50, 0.3, 'square', 0.2);
            }, i * 400);
        }
    }

    // Boss death
    bossDeath() {
        this.playNoise(0.4, 0.35, 800);
        this.playTone(150, 0.3, 'sawtooth', 0.3);
        setTimeout(() => {
            this.playTone(100, 0.3, 'sawtooth', 0.25);
            this.playNoise(0.3, 0.25, 600);
        }, 200);
        setTimeout(() => {
            this.playTone(200, 0.2, 'square', 0.3);
            this.playTone(300, 0.2, 'square', 0.25);
        }, 400);
    }

    // Victory fanfare
    victory() {
        const melody = [
            { freq: 400, time: 0 },
            { freq: 500, time: 150 },
            { freq: 600, time: 300 },
            { freq: 500, time: 450 },
            { freq: 600, time: 600 },
            { freq: 800, time: 750 },
        ];
        melody.forEach(note => {
            setTimeout(() => this.playTone(note.freq, 0.2, 'sine', 0.3), note.time);
        });
    }

    // Defeat
    defeat() {
        const melody = [
            { freq: 400, time: 0 },
            { freq: 350, time: 200 },
            { freq: 300, time: 400 },
            { freq: 200, time: 600 },
        ];
        melody.forEach(note => {
            setTimeout(() => this.playTone(note.freq, 0.35, 'sawtooth', 0.3), note.time);
        });
    }

    // UI click
    uiClick() {
        this.playTone(600, 0.05, 'square', 0.15);
    }

    // UI hover
    uiHover() {
        this.playTone(800, 0.03, 'sine', 0.08);
    }

    // Error / can't afford
    error() {
        this.playTone(200, 0.1, 'square', 0.25);
        setTimeout(() => this.playTone(150, 0.15, 'square', 0.25), 100);
    }

    // Pause
    pause() {
        this.playTone(300, 0.1, 'sine', 0.2);
        this.playTone(200, 0.15, 'sine', 0.15, 0.05, 0.1);
    }

    // Unpause
    unpause() {
        this.playTone(200, 0.1, 'sine', 0.2);
        this.playTone(300, 0.15, 'sine', 0.2, 0.05, 0.1);
    }
}

// Global sound manager instance
const soundManager = new SoundManager();
