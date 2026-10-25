type SfxId =
  | 'next_turn'
  | 'season_change'
  | 'event'
  | 'build'
  | 'combat'
  | 'dice'
  | 'victory'
  | 'trade'
  | 'robber'
  | 'discard'
  | 'collect'
  | 'ck_knight'
  | 'ck_progress'
  | 'ck_urban'
  | 'ck_invasion'
  | 'ck_ship';

interface ToneStep {
  freq: number;
  duration: number;
  gain: number;
  type: OscillatorType;
}

interface TextureStep {
  duration: number;
  gain: number;
  filterHz: number;
}

const SFX_TEXTURES: Partial<Record<SfxId, TextureStep>> = {
  dice: { duration: 0.16, gain: 0.055, filterHz: 3100 },
  build: { duration: 0.18, gain: 0.06, filterHz: 1050 },
  trade: { duration: 0.12, gain: 0.028, filterHz: 2400 },
  robber: { duration: 0.22, gain: 0.045, filterHz: 620 },
  ck_knight: { duration: 0.16, gain: 0.05, filterHz: 1400 },
  ck_ship: { duration: 0.3, gain: 0.04, filterHz: 720 },
  ck_invasion: { duration: 0.48, gain: 0.075, filterHz: 480 },
  victory: { duration: 0.24, gain: 0.026, filterHz: 3800 },
};

const SFX_LIBRARY: Record<SfxId, ToneStep[]> = {
  next_turn: [
    { freq: 440, duration: 0.08, gain: 0.12, type: 'triangle' },
    { freq: 554, duration: 0.1, gain: 0.1, type: 'triangle' },
  ],
  season_change: [
    { freq: 330, duration: 0.11, gain: 0.13, type: 'sine' },
    { freq: 392, duration: 0.11, gain: 0.11, type: 'sine' },
    { freq: 523, duration: 0.14, gain: 0.1, type: 'sine' },
  ],
  event: [
    { freq: 220, duration: 0.08, gain: 0.14, type: 'sawtooth' },
    { freq: 180, duration: 0.1, gain: 0.1, type: 'sawtooth' },
  ],
  build: [
    { freq: 280, duration: 0.06, gain: 0.1, type: 'square' },
    { freq: 220, duration: 0.07, gain: 0.09, type: 'square' },
  ],
  combat: [
    { freq: 130, duration: 0.07, gain: 0.15, type: 'sawtooth' },
    { freq: 98, duration: 0.08, gain: 0.12, type: 'sawtooth' },
  ],
  dice: [
    { freq: 620, duration: 0.05, gain: 0.08, type: 'triangle' },
    { freq: 680, duration: 0.05, gain: 0.07, type: 'triangle' },
    { freq: 740, duration: 0.05, gain: 0.06, type: 'triangle' },
  ],
  victory: [
    { freq: 392, duration: 0.12, gain: 0.14, type: 'triangle' },
    { freq: 523, duration: 0.14, gain: 0.14, type: 'triangle' },
    { freq: 659, duration: 0.16, gain: 0.12, type: 'triangle' },
  ],
  trade: [
    { freq: 360, duration: 0.07, gain: 0.1, type: 'sine' },
    { freq: 480, duration: 0.08, gain: 0.09, type: 'sine' },
  ],
  robber: [
    { freq: 170, duration: 0.09, gain: 0.13, type: 'sawtooth' },
    { freq: 120, duration: 0.1, gain: 0.11, type: 'sawtooth' },
  ],
  discard: [
    { freq: 240, duration: 0.06, gain: 0.1, type: 'triangle' },
    { freq: 190, duration: 0.07, gain: 0.08, type: 'triangle' },
  ],
  collect: [
    { freq: 520, duration: 0.05, gain: 0.07, type: 'sine' },
    { freq: 660, duration: 0.06, gain: 0.06, type: 'sine' },
  ],
  ck_knight: [
    { freq: 300, duration: 0.06, gain: 0.11, type: 'square' },
    { freq: 380, duration: 0.08, gain: 0.09, type: 'triangle' },
  ],
  ck_progress: [
    { freq: 494, duration: 0.07, gain: 0.1, type: 'sine' },
    { freq: 587, duration: 0.09, gain: 0.09, type: 'sine' },
  ],
  ck_urban: [
    { freq: 262, duration: 0.07, gain: 0.1, type: 'triangle' },
    { freq: 330, duration: 0.08, gain: 0.09, type: 'triangle' },
    { freq: 392, duration: 0.1, gain: 0.08, type: 'triangle' },
  ],
  ck_invasion: [
    { freq: 110, duration: 0.1, gain: 0.16, type: 'sawtooth' },
    { freq: 90, duration: 0.12, gain: 0.14, type: 'sawtooth' },
    { freq: 70, duration: 0.14, gain: 0.12, type: 'sawtooth' },
  ],
  ck_ship: [
    { freq: 185, duration: 0.08, gain: 0.12, type: 'sine' },
    { freq: 165, duration: 0.1, gain: 0.1, type: 'sine' },
  ],
};

export class SoundManager {
  private context: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private unlocked = false;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;

  setVolumes(musicVolume: number, sfxVolume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.musicGain?.gain.setValueAtTime(this.musicVolume, this.context?.currentTime ?? 0);
    this.sfxGain?.gain.setValueAtTime(this.sfxVolume, this.context?.currentTime ?? 0);
  }

  playSfx(id: string): void {
    const sfxId = id as SfxId;
    const steps = SFX_LIBRARY[sfxId];
    if (!steps) return;
    if (!this.ensureContext()) return;
    if (!this.context || !this.sfxGain) return;
    if (!this.unlocked) return;

    const texture = SFX_TEXTURES[sfxId];
    if (texture) this.playTexture(texture);

    let startAt = this.context.currentTime;
    for (const step of steps) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freq, startAt);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, startAt);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        step.type === 'sine' ? 5200 : step.type === 'triangle' ? 4200 : 2400,
        startAt,
      );
      filter.Q.setValueAtTime(0.65, startAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, step.gain), startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startAt);
      osc.stop(startAt + step.duration + 0.02);

      startAt += step.duration;
    }
  }

  private playTexture(step: TextureStep): void {
    if (!this.context || !this.sfxGain) return;
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * step.duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let smooth = 0;
    for (let index = 0; index < frameCount; index++) {
      smooth = smooth * 0.68 + (Math.random() * 2 - 1) * 0.32;
      const envelope = Math.pow(1 - index / frameCount, 2.4);
      data[index] = smooth * envelope;
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(step.filterHz, now);
    filter.Q.setValueAtTime(0.8, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(step.gain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + step.duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
    source.stop(now + step.duration + 0.02);
  }

  unlock(): void {
    if (!this.ensureContext()) return;
    if (!this.context) return;
    if (this.context.state === 'suspended') {
      void this.context
        .resume()
        .then(() => {
          this.unlocked = true;
        })
        .catch(() => {
          this.unlocked = false;
        });
      return;
    }
    this.unlocked = true;
  }

  private ensureContext(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.context) return true;

    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;

    this.context = new Ctor();
    this.sfxGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.musicGain.gain.value = this.musicVolume;
    this.sfxGain.connect(this.context.destination);
    this.musicGain.connect(this.context.destination);
    return true;
  }
}
