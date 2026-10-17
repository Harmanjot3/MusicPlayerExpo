import {
  AudioContext,
  AudioManager,
  type AudioTagHandle,
  type BiquadFilterNode,
  type GainNode,
  type MediaElementAudioSourceNode,
  type StereoPannerNode,
  type DelayNode,
} from 'react-native-audio-api';
import { DEFAULT_BANDS, type EQBand } from './DSPManager';

/** Owns the native processing graph used by the main music player. */
export class AudioGraphController {
  private static instance: AudioGraphController;
  readonly context: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private readonly filters: BiquadFilterNode[];
  private readonly preGain: GainNode;
  private readonly bassBoost: BiquadFilterNode;
  private readonly trebleBoost: BiquadFilterNode;
  private readonly virtualDelay: DelayNode;
  private readonly virtualDelayGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly sumGain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly masterGain: GainNode;
  private readonly convolver: ReturnType<AudioContext['createConvolver']>;
  private volume = 1;
  private pan = 0;
  private masterGainDb = 0;
  private bassBoostDb = 0;
  private trebleBoostDb = 0;
  private virtual3dEnabled = false;
  private virtual3dGapMs = 30;
  private surround71Enabled = false;
  private surround71Level = 0.22;
  private surround71Spread = 0.7;
  private impulseUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private bands: EQBand[] = DEFAULT_BANDS.map(band => ({ ...band }));
  private eqEnabled = true;

  private constructor() {
    const sampleRate = AudioManager.getDevicePreferredSampleRate();
    this.context = new AudioContext({
      sampleRate: sampleRate > 0 ? Math.max(8000, Math.min(sampleRate, 96000)) : 44100,
    });
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
    });
    AudioManager.observeAudioInterruptions(true);

    this.filters = this.bands.map(band => {
      const filter = this.context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.frequency;
      filter.Q.value = band.q;
      filter.gain.value = 0;
      return filter;
    });
    this.preGain = this.context.createGain();
    this.bassBoost = this.context.createBiquadFilter();
    this.bassBoost.type = 'peaking';
    this.bassBoost.frequency.value = 125;
    this.bassBoost.Q.value = 1;
    this.trebleBoost = this.context.createBiquadFilter();
    this.trebleBoost.type = 'peaking';
    this.trebleBoost.frequency.value = 7500;
    this.trebleBoost.Q.value = 1;
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.sumGain = this.context.createGain();
    this.panner = this.context.createStereoPanner();
    this.masterGain = this.context.createGain();
    this.virtualDelay = this.context.createDelay(0.05);
    this.virtualDelayGain = this.context.createGain();

    this.filters.slice(0, -1).forEach((filter, index) => filter.connect(this.filters[index + 1]));
    this.filters[this.filters.length - 1].connect(this.preGain);
    this.preGain.connect(this.bassBoost);
    this.bassBoost.connect(this.trebleBoost);
    this.convolver = this.context.createConvolver();
    this.convolver.normalize = false;
    this.convolver.buffer = this.createSpatialRoomImpulse(this.surround71Spread);
    this.trebleBoost.connect(this.dryGain);
    this.trebleBoost.connect(this.virtualDelay);
    this.virtualDelay.connect(this.virtualDelayGain);
    this.virtualDelayGain.connect(this.sumGain);
    this.trebleBoost.connect(this.convolver);
    this.dryGain.connect(this.sumGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.sumGain);
    this.sumGain.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
    this.virtualDelay.delayTime.value = this.virtual3dGapMs / 1000;
    this.virtualDelayGain.gain.value = 0;
    this.masterGain.gain.value = this.volume;
  }

  static getInstance(): AudioGraphController {
    if (!this.instance) this.instance = new AudioGraphController();
    return this.instance;
  }

  /** Build the Android player's Freeverb-style comb/allpass network as a true-stereo IR. */
  private createSpatialRoomImpulse(spread: number) {
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * 2.4));
    const impulse = this.context.createBuffer(4, length, sampleRate);
    const combLeft = [1674, 1782, 1915, 2034, 2133, 2236, 2335, 2425];
    const combRight = [1708, 1816, 1950, 2068, 2167, 2271, 2370, 2460];
    const allpassLeft = [834, 661, 511, 337];
    const allpassRight = [868, 696, 546, 372];
    const makeLines = (sizes: number[]) => sizes.map(size => ({
      buffer: new Float32Array(Math.max(1, Math.round(size * sampleRate / 44100))),
      index: 0,
      filter: 0,
    }));
    const leftLines = [...makeLines(combLeft), ...makeLines(allpassLeft)];
    const rightLines = [...makeLines(combRight), ...makeLines(allpassRight)];
    const feedback = 0.84;
    const damp = 0.08;
    const allpassFeedback = 0.5;
    const process = (input: number, lines: typeof leftLines) => {
      let output = 0;
      for (let i = 0; i < 8; i++) {
        const line = lines[i];
        const delayed = line.buffer[line.index];
        line.filter = delayed * (1 - damp) + line.filter * damp;
        line.buffer[line.index] = input + line.filter * feedback;
        line.index = (line.index + 1) % line.buffer.length;
        output += delayed;
      }
      for (let i = 8; i < 12; i++) {
        const line = lines[i];
        const delayed = line.buffer[line.index];
        const next = -output + delayed;
        line.buffer[line.index] = output + delayed * allpassFeedback;
        line.index = (line.index + 1) % line.buffer.length;
        output = next;
      }
      return output;
    };
    const wet = 3;
    const wet1 = wet * (spread * 0.5 + 0.5);
    const wet2 = wet * ((1 - spread) * 0.5);
    const leftFromLeft = impulse.getChannelData(0);
    const leftFromRight = impulse.getChannelData(1);
    const rightFromLeft = impulse.getChannelData(2);
    const rightFromRight = impulse.getChannelData(3);
    for (let frame = 0; frame < length; frame++) {
      const input = frame === 0 ? 0.015 : 0;
      const left = process(input, leftLines);
      const right = process(input, rightLines);
      leftFromLeft[frame] = wet1 * left + wet2 * right;
      leftFromRight[frame] = wet1 * left + wet2 * right;
      rightFromLeft[frame] = wet1 * right + wet2 * left;
      rightFromRight[frame] = wet1 * right + wet2 * left;
    }
    return impulse;
  }

  async connect(handle: AudioTagHandle) {
    this.disconnectSource();
    this.source = this.context.createMediaElementSource(handle);
    this.source.connect(this.filters[0]);
    await this.context.resume();
  }

  disconnectSource() {
    this.source?.disconnect();
    this.source = null;
  }

  setBands(bands: EQBand[], enabled: boolean) {
    this.bands = bands.map(band => ({ ...band }));
    this.eqEnabled = enabled;
    this.filters.forEach((filter, index) => {
      const band = this.bands[index];
      if (!band) return;
      filter.frequency.value = band.frequency;
      filter.Q.value = band.q;
      filter.gain.value = enabled && band.enabled ? band.gain : 0;
    });
  }

  setMasterGain(db: number) {
    this.masterGainDb = Number.isFinite(db) ? Math.max(-20, Math.min(20, db)) : this.masterGainDb;
    this.preGain.gain.value = 10 ** (this.masterGainDb / 20);
  }

  setBassBoost(db: number) {
    this.bassBoostDb = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : this.bassBoostDb;
    this.bassBoost.gain.value = this.bassBoostDb;
  }

  setTrebleBoost(db: number) {
    this.trebleBoostDb = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : this.trebleBoostDb;
    this.trebleBoost.gain.value = this.trebleBoostDb;
  }

  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.volume;
    this.masterGain.gain.value = this.volume;
  }

  setPan(value: number) {
    this.pan = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : this.pan;
    this.panner.pan.value = this.pan;
  }

  setVirtual3DEnabled(enabled: boolean) {
    this.virtual3dEnabled = enabled;
    this.virtualDelayGain.gain.value = enabled ? 0.24 : 0;
  }

  setVirtual3DGap(gapMs: number) {
    this.virtual3dGapMs = Number.isFinite(gapMs) ? Math.max(1, Math.min(40, gapMs)) : this.virtual3dGapMs;
    this.virtualDelay.delayTime.value = this.virtual3dGapMs / 1000;
  }

  setSurround71Enabled(enabled: boolean) {
    this.surround71Enabled = enabled;
    this.wetGain.gain.value = enabled ? this.surround71Level : 0;
  }

  setSurround71(level: number, spread: number) {
    const nextLevel = Number.isFinite(level) ? Math.max(0.15, Math.min(0.45, level)) : this.surround71Level;
    const nextSpread = Number.isFinite(spread) ? Math.max(0.05, Math.min(0.7, spread)) : this.surround71Spread;
    if (Math.abs(nextLevel - this.surround71Level) < 0.005 && Math.abs(nextSpread - this.surround71Spread) < 0.005) return;
    const spreadChanged = Math.abs(nextSpread - this.surround71Spread) >= 0.005;
    this.surround71Level = nextLevel;
    this.surround71Spread = nextSpread;
    this.wetGain.gain.value = this.surround71Enabled ? nextLevel : 0;
    if (!spreadChanged) return;
    if (this.impulseUpdateTimer) clearTimeout(this.impulseUpdateTimer);
    this.impulseUpdateTimer = setTimeout(() => {
      this.impulseUpdateTimer = null;
      this.convolver.buffer = this.createSpatialRoomImpulse(this.surround71Spread);
    }, 80);
  }

  getCurrentSettings() {
    return {
      volume: this.volume,
      pan: this.pan,
      masterGainDb: this.masterGainDb,
      bassBoostDb: this.bassBoostDb,
      trebleBoostDb: this.trebleBoostDb,
      virtual3dEnabled: this.virtual3dEnabled,
      virtual3dGapMs: this.virtual3dGapMs,
      surround71Enabled: this.surround71Enabled,
      surround71Level: this.surround71Level,
      surround71Spread: this.surround71Spread,
      bands: this.bands.map(band => ({ ...band })),
      eqEnabled: this.eqEnabled,
    };
  }
}
