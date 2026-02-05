// sounds.js - Synthesized sound effects for Orc Run (Web Audio API only, no files needed)

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.4;
        this.muted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.masterVolume;
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
        }
        return this.muted;
    }

    _play(fn) {
        if (!this.initialized || this.muted) return;
        try { fn(); } catch (e) { /* ignore */ }
    }

    _tone(freq, duration, type = 'square', volume = 0.3) {
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    _noise(duration, volume = 0.1) {
        const ctx = this.audioContext;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * volume;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 1;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        source.connect(gain);
        gain.connect(this.masterGain);
        source.start(ctx.currentTime);
    }

    jump() {
        this._play(() => {
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        });
    }

    land() {
        this._play(() => {
            this._noise(0.08, 0.15);
            this._tone(100, 0.1, 'sine', 0.15);
        });
    }

    duck() {
        this._play(() => {
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.12);
        });
    }

    coinCollect() {
        this._play(() => {
            this._tone(880, 0.08, 'square', 0.15);
            setTimeout(() => this._tone(1100, 0.08, 'square', 0.15), 60);
        });
    }

    powerUp() {
        this._play(() => {
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        });
    }

    shieldHit() {
        this._play(() => {
            this._tone(300, 0.15, 'sawtooth', 0.2);
            this._noise(0.1, 0.2);
        });
    }

    death() {
        this._play(() => {
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
            this._noise(0.3, 0.15);
        });
    }

    milestone() {
        this._play(() => {
            this._tone(523, 0.1, 'square', 0.15);
            setTimeout(() => this._tone(659, 0.1, 'square', 0.15), 100);
            setTimeout(() => this._tone(784, 0.15, 'square', 0.2), 200);
        });
    }

    footstep() {
        this._play(() => {
            this._noise(0.04, 0.05);
        });
    }
}

const soundManager = new SoundManager();
