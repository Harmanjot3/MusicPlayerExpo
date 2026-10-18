import {
  AudioContext,
  AudioManager,
  type AudioNode,
  type AudioParam,
  type AudioTagHandle,
  type BiquadFilterNode,
  type GainNode,
  type MediaElementAudioSourceNode,
  type StereoPannerNode,
  type WorkletProcessingNode,
} from 'react-native-audio-api';
import { Platform } from 'react-native';
import { createSynchronizable } from 'react-native-worklets';
import { DEFAULT_BANDS, type EQBand } from './DSPManager';

type SharedBoolean = { getDirty(): boolean; setDirty(value: boolean): void };
type SharedNumber = { getDirty(): number; setDirty(value: number): void };

/** Owns the native processing graph used by the main music player. */
export class AudioGraphController {
  private static instance: AudioGraphController;
  readonly context: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private sourceHandle: AudioTagHandle | null = null;
  private readonly filters: BiquadFilterNode[];
  private readonly preGain: GainNode;
  private readonly bassBoost: BiquadFilterNode;
  private readonly trebleBoost: BiquadFilterNode;
  private readonly virtual3dProcessor: WorkletProcessingNode | null;
  private readonly virtual3dEnabledParameter: SharedBoolean | null;
  private readonly virtual3dGapParameter: SharedNumber | null;
  private readonly virtual3dResetParameter: SharedNumber | null;
  private readonly webVirtualDelay: ReturnType<AudioContext['createDelay']> | null;
  private readonly webVirtualDelayGain: GainNode | null;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly sumGain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly masterGain: GainNode;
  private convolver: ReturnType<AudioContext['createConvolver']>;
  private spatialRoomImpulse: ReturnType<AudioContext['createBuffer']>;
  private volume = 1;
  private pan = 0;
  private masterGainDb = 0;
  private bassBoostDb = 0;
  private trebleBoostDb = 0;
  private virtual3dEnabled = false;
  private virtual3dGapMs = 30;
  private virtual3dResetGeneration = 0;
  private surround71Enabled = false;
  private surround71Level = 0.22;
  private surround71Spread = 0.7;
  private impulseUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private bands: EQBand[] = DEFAULT_BANDS.map(band => ({ ...band }));
  private eqEnabled = true;

  private constructor() {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
    });
    AudioManager.observeAudioInterruptions(true);
    const sampleRate = AudioManager.getDevicePreferredSampleRate();
    this.context = new AudioContext({
      sampleRate: sampleRate > 0 ? Math.max(8000, Math.min(sampleRate, 96000)) : 44100,
    });

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

    if (Platform.OS === 'web') {
      this.virtual3dProcessor = null;
      this.virtual3dEnabledParameter = null;
      this.virtual3dGapParameter = null;
      this.virtual3dResetParameter = null;
      this.webVirtualDelay = this.context.createDelay(0.04);
      this.webVirtualDelayGain = this.context.createGain();
      this.webVirtualDelayGain.gain.value = 0;
    } else {
      this.virtual3dEnabledParameter = createSynchronizable(false, { fixedType: true }) as SharedBoolean;
      this.virtual3dGapParameter = createSynchronizable(30, { fixedType: true }) as SharedNumber;
      this.virtual3dResetParameter = createSynchronizable(0, { fixedType: true }) as SharedNumber;
      this.virtual3dProcessor = this.createVirtual3DProcessor(
        this.virtual3dEnabledParameter,
        this.virtual3dGapParameter,
        this.virtual3dResetParameter,
      );
      this.webVirtualDelay = null;
      this.webVirtualDelayGain = null;
    }

    this.filters.slice(0, -1).forEach((filter, index) => filter.connect(this.filters[index + 1]));
    this.filters[this.filters.length - 1].connect(this.preGain);
    this.preGain.connect(this.bassBoost);
    this.bassBoost.connect(this.trebleBoost);
    this.convolver = this.context.createConvolver();
    this.convolver.normalize = false;
    this.spatialRoomImpulse = this.createSpatialRoomImpulse(this.surround71Spread);
    this.convolver.buffer = this.spatialRoomImpulse;
    const spatialInput: AudioNode = this.virtual3dProcessor ?? this.trebleBoost;
    spatialInput.connect(this.dryGain);
    spatialInput.connect(this.convolver);
    if (this.webVirtualDelay && this.webVirtualDelayGain) {
      this.trebleBoost.connect(this.webVirtualDelay);
      this.webVirtualDelay.connect(this.webVirtualDelayGain);
      this.webVirtualDelayGain.connect(this.sumGain);
    }
    this.dryGain.connect(this.sumGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.sumGain);
    this.sumGain.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
    if (this.webVirtualDelay) this.webVirtualDelay.delayTime.value = this.virtual3dGapMs / 1000;
    this.masterGain.gain.value = this.volume;
  }

  static getInstance(): AudioGraphController {
    if (!this.instance) this.instance = new AudioGraphController();
    return this.instance;
  }

  /** Port the Android sample-delay effect as a right-channel delay, without a parallel echo. */
  private createVirtual3DProcessor(
    enabled: SharedBoolean,
    gapMs: SharedNumber,
    resetGeneration: SharedNumber,
  ) {
    const sampleRate = this.context.sampleRate;
    const delayBuffer = new Float32Array(Math.max(1, Math.ceil(sampleRate * 0.04)));
    let writeIndex = 0;
    let currentDelayFrames = -1;
    let previousEnabled = false;
    let previousResetGeneration = 0;

    return this.context.createWorkletProcessingNode((inputData, outputData, framesToProcess) => {
      'worklet';
      const leftInput = inputData[0];
      const leftOutput = outputData[0];
      if (!leftInput || !leftOutput) return;

      const isEnabled = enabled.getDirty();
      const delayFrames = Math.trunc(Math.max(1, Math.min(40, gapMs.getDirty())) * sampleRate / 1000);
      const nextResetGeneration = resetGeneration.getDirty();
      if (
        delayFrames !== currentDelayFrames
        || isEnabled !== previousEnabled
        || nextResetGeneration !== previousResetGeneration
      ) {
        delayBuffer.fill(0);
        writeIndex = 0;
        currentDelayFrames = delayFrames;
        previousEnabled = isEnabled;
        previousResetGeneration = nextResetGeneration;
      }

      for (let frame = 0; frame < framesToProcess; frame++) {
        leftOutput[frame] = leftInput[frame];
      }

      const rightInput = inputData[1];
      const rightOutput = outputData[1];
      if (!rightInput || !rightOutput) {
        for (let channel = 1; channel < outputData.length; channel++) {
          const input = inputData[channel];
          const output = outputData[channel];
          if (!input || !output) continue;
          for (let frame = 0; frame < framesToProcess; frame++) output[frame] = input[frame];
        }
        return;
      }

      if (isEnabled) {
        for (let frame = 0; frame < framesToProcess; frame++) {
          const delayed = delayBuffer[writeIndex];
          delayBuffer[writeIndex] = rightInput[frame];
          rightOutput[frame] = delayed;
          writeIndex = writeIndex + 1 === delayFrames ? 0 : writeIndex + 1;
        }
      } else {
        for (let frame = 0; frame < framesToProcess; frame++) rightOutput[frame] = rightInput[frame];
      }

      for (let channel = 2; channel < outputData.length; channel++) {
        const input = inputData[channel];
        const output = outputData[channel];
        if (!input || !output) continue;
        for (let frame = 0; frame < framesToProcess; frame++) output[frame] = input[frame];
      }
    }, 'AudioRuntime');
  }

  /** Build the original stereo Freeverb network as a four-channel convolution IR. */
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
    // libdsp.so resets room size to 0.9 and damping to 0.02; Freeverb maps
    // those values to comb feedback 0.9 * 0.28 + 0.7 and damping 0.02 * 0.4.
    // The native wet setting is applied by wetGain; Freeverb's internal wet
    // scale of 3 is represented in this impulse response.
    const feedback = 0.9 * 0.28 + 0.7;
    const damp = 0.02 * 0.4;
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

    // Android filters each reverb return with BandPassFilter(center=1000 Hz,
    // Q=0.25). These are its Biquad coefficients, applied independently to
    // every input/output path in the convolution matrix.
    const angularFrequency = 2 * Math.PI * 1000 / sampleRate;
    const alpha = Math.sin(angularFrequency) / (2 * 0.25);
    const denominator = 1 + alpha;
    const b1 = alpha / denominator;
    const b2 = -alpha / denominator;
    const a1 = 2 * Math.cos(angularFrequency) / denominator;
    const a2 = (alpha - 1) / denominator;
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const response = impulse.getChannelData(channel);
      let input1 = 0;
      let input2 = 0;
      let output1 = 0;
      let output2 = 0;
      for (let frame = 0; frame < length; frame++) {
        const input = response[frame];
        const output = b1 * input1 + b2 * input2 + a1 * output1 + a2 * output2;
        response[frame] = output;
        input2 = input1;
        input1 = input;
        output2 = output1;
        output1 = output;
      }
    }
    return impulse;
  }

  async connect(handle: AudioTagHandle): Promise<boolean> {
    if (this.sourceHandle === handle && this.source) {
      await this.context.resume();
      return this.sourceHandle === handle && this.source !== null;
    }
    this.disconnectSource();
    const source = this.context.createMediaElementSource(handle);
    this.source = source;
    this.sourceHandle = handle;
    try {
      source.connect(this.filters[0]);
      await this.context.resume();
      return this.source === source && this.sourceHandle === handle;
    } catch (error) {
      this.disconnectSource(handle);
      throw error;
    }
  }

  disconnectSource(handle?: AudioTagHandle) {
    if (handle && this.sourceHandle !== handle) return;
    this.source?.disconnect();
    this.source = null;
    this.sourceHandle = null;
  }

  setBands(bands: EQBand[], enabled: boolean) {
    this.bands = bands.map(band => ({ ...band }));
    this.eqEnabled = enabled;
    this.filters.forEach((filter, index) => {
      const band = this.bands[index];
      if (!band) return;
      filter.frequency.value = band.frequency;
      filter.Q.value = band.q;
      this.setParamSmoothly(filter.gain, enabled && band.enabled ? band.gain : 0, 0.018);
    });
  }

  setMasterGain(db: number) {
    this.masterGainDb = Number.isFinite(db) ? Math.max(-20, Math.min(20, db)) : this.masterGainDb;
    this.setParamSmoothly(this.preGain.gain, 10 ** (this.masterGainDb / 20));
  }

  setBassBoost(db: number) {
    this.bassBoostDb = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : this.bassBoostDb;
    this.setParamSmoothly(this.bassBoost.gain, this.bassBoostDb);
  }

  setTrebleBoost(db: number) {
    this.trebleBoostDb = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : this.trebleBoostDb;
    this.setParamSmoothly(this.trebleBoost.gain, this.trebleBoostDb);
  }

  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.volume;
    this.setParamSmoothly(this.masterGain.gain, this.volume);
  }

  setPan(value: number) {
    this.pan = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : this.pan;
    this.setParamSmoothly(this.panner.pan, this.pan);
  }

  setVirtual3DEnabled(enabled: boolean) {
    this.virtual3dEnabled = enabled;
    if (this.virtual3dEnabledParameter) this.virtual3dEnabledParameter.setDirty(enabled);
    if (this.webVirtualDelayGain) this.webVirtualDelayGain.gain.value = enabled ? 0.24 : 0;
  }

  setVirtual3DGap(gapMs: number) {
    this.virtual3dGapMs = Number.isFinite(gapMs) ? Math.max(1, Math.min(40, gapMs)) : this.virtual3dGapMs;
    if (this.virtual3dGapParameter) this.virtual3dGapParameter.setDirty(this.virtual3dGapMs);
    if (this.webVirtualDelay) this.webVirtualDelay.delayTime.value = this.virtual3dGapMs / 1000;
  }

  setSurround71Enabled(enabled: boolean) {
    this.surround71Enabled = enabled;
    this.dryGain.gain.value = 1;
    this.setGainSmoothly(this.wetGain, enabled ? this.surround71Level : 0);
  }

  private setGainSmoothly(node: GainNode, value: number) {
    this.setParamSmoothly(node.gain, value, 0.025);
  }

  private setParamSmoothly(param: AudioParam, value: number, timeConstant = 0.015) {
    const now = this.context.currentTime;
    param.cancelAndHoldAtTime(now);
    param.setTargetAtTime(value, now, timeConstant);
  }

  /** Clear per-track delay history and replace the convolver to discard its old tail. */
  resetTrackEffects() {
    if (this.virtual3dResetParameter) {
      this.virtual3dResetGeneration += 1;
      this.virtual3dResetParameter.setDirty(this.virtual3dResetGeneration);
    }
    (this.virtual3dProcessor ?? this.trebleBoost).disconnect(this.convolver);
    this.convolver.disconnect();
    this.convolver = this.context.createConvolver();
    this.convolver.normalize = false;
    this.convolver.buffer = this.spatialRoomImpulse;
    (this.virtual3dProcessor ?? this.trebleBoost).connect(this.convolver);
    this.convolver.connect(this.wetGain);
  }

  setSurround71(level: number, spread: number) {
    const nextLevel = Number.isFinite(level) ? Math.max(0.15, Math.min(0.45, level)) : this.surround71Level;
    const nextSpread = Number.isFinite(spread) ? Math.max(0.05, Math.min(0.7, spread)) : this.surround71Spread;
    if (Math.abs(nextLevel - this.surround71Level) < 0.005 && Math.abs(nextSpread - this.surround71Spread) < 0.005) return;
    const spreadChanged = Math.abs(nextSpread - this.surround71Spread) >= 0.005;
    this.surround71Level = nextLevel;
    this.surround71Spread = nextSpread;
    this.setGainSmoothly(this.wetGain, this.surround71Enabled ? nextLevel : 0);
    if (!spreadChanged) return;
    if (this.impulseUpdateTimer) clearTimeout(this.impulseUpdateTimer);
    this.impulseUpdateTimer = setTimeout(() => {
      this.impulseUpdateTimer = null;
      this.spatialRoomImpulse = this.createSpatialRoomImpulse(this.surround71Spread);
      this.convolver.buffer = this.spatialRoomImpulse;
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
