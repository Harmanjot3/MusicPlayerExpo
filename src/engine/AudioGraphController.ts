import {
  AudioContext,
  AudioManager,
  type AudioTagHandle,
  type BiquadFilterNode,
  type GainNode,
  type MediaElementAudioSourceNode,
  type StereoPannerNode,
} from 'react-native-audio-api';
import { DEFAULT_BANDS, type EQBand } from './DSPManager';

/** Owns the native processing graph used by the main music player. */
export class AudioGraphController {
  private static instance: AudioGraphController;
  readonly context: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private readonly filters: BiquadFilterNode[];
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly sumGain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly masterGain: GainNode;
  private readonly convolver: ReturnType<AudioContext['createConvolver']>;
  private volume = 1;
  private pan = 0;
  private surroundStrength = 0;
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
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.sumGain = this.context.createGain();
    this.panner = this.context.createStereoPanner();
    this.masterGain = this.context.createGain();

    this.filters.slice(0, -1).forEach((filter, index) => filter.connect(this.filters[index + 1]));
    this.convolver = this.context.createConvolver();
    this.convolver.normalize = false;
    this.convolver.buffer = this.createSpatialRoomImpulse();
    this.filters[this.filters.length - 1].connect(this.dryGain);
    this.filters[this.filters.length - 1].connect(this.convolver);
    this.dryGain.connect(this.sumGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.sumGain);
    this.sumGain.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
    this.masterGain.gain.value = this.volume;
  }

  static getInstance(): AudioGraphController {
    if (!this.instance) this.instance = new AudioGraphController();
    return this.instance;
  }

  /**
   * A compact stereo room response: asymmetric early reflections establish
   * width, followed by a quiet decorrelated tail for depth. This is a room
   * simulation, not a measured room response or binaural HRTF renderer.
   */
  private createSpatialRoomImpulse() {
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * 0.36));
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    const reflections = [
      [0.013, 0.20], [0.021, 0.15], [0.032, 0.12], [0.047, 0.09],
      [0.063, 0.075], [0.081, 0.06], [0.104, 0.048], [0.129, 0.038],
    ] as const;

    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      const channelOffset = channel === 0 ? 0 : 0.0037;

      // Keep a strong direct arrival; the wet path is mixed under the dry path.
      samples[0] = 0.72;
      reflections.forEach(([time, amplitude], index) => {
        const reflectedTime = time + channelOffset + (channel === 0 ? 0 : (index % 2) * 0.0021);
        const at = Math.min(length - 1, Math.round(reflectedTime * sampleRate));
        samples[at] += amplitude * (channel === 0 || index % 2 === 0 ? 1 : -0.82);
      });

      // Deterministic low-level diffuse tail, gently darkened over time.
      let seed = channel === 0 ? 0x1234567 : 0x7654321;
      for (let i = Math.round(sampleRate * 0.14); i < length; i++) {
        seed = (seed * 16807) % 2147483647;
        const noise = (seed / 1073741823.5) - 1;
        const time = i / sampleRate;
        const decay = Math.exp(-(time - 0.14) * 9.5);
        const highFrequencyDamping = Math.min(1, (length - i) / (sampleRate * 0.025));
        samples[i] += noise * decay * highFrequencyDamping * 0.018;
      }
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

  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.volume;
    this.masterGain.gain.value = this.volume;
  }

  setPan(value: number) {
    this.pan = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : this.pan;
    this.panner.pan.value = this.pan;
  }

  setSurroundStrength(value: number) {
    this.surroundStrength = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.surroundStrength;
    // Preserve direct sound while increasing early reflections and room tail.
    this.dryGain.gain.value = 1 - this.surroundStrength * 0.18;
    this.wetGain.gain.value = this.surroundStrength * 0.34;
  }

  getCurrentSettings() {
    return {
      volume: this.volume,
      pan: this.pan,
      surroundStrength: this.surroundStrength,
      bands: this.bands.map(band => ({ ...band })),
      eqEnabled: this.eqEnabled,
    };
  }
}
