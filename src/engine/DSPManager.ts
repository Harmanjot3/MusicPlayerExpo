/**
 * DSPManager — mirrors com.tamalbasak.musicplayer.DSPManager
 * Pure-JS biquad-filter EQ chain. Each band is a second-order IIR filter.
 * Provides coefficient and sample-processing logic; the current Expo Audio
 * playback path does not yet route PCM through this manager.
 */

export interface EQBand {
  id: number;
  label: string;
  frequency: number;  // Hz
  gain: number;       // dB, range [-12, +12]
  q: number;          // Q factor
  enabled: boolean;
  // biquad coefficients (recomputed on param change)
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
  // delay lines
  x1: number; x2: number;
  y1: number; y2: number;
}

export const EQ_MIN_VALUE = -12;
export const EQ_MAX_VALUE = 12;

export const DEFAULT_BANDS: EQBand[] = [
  { id: 0, label: '60',   frequency: 60,    gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 1, label: '170',  frequency: 170,   gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 2, label: '310',  frequency: 310,   gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 3, label: '600',  frequency: 600,   gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 4, label: '1K',   frequency: 1000,  gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 5, label: '3K',   frequency: 3000,  gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 6, label: '14K',  frequency: 14000, gain: 0, q: 1.0, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
];

/** Presets — mirrors EqPresetFileController */
export const EQ_PRESETS: Record<string, number[]> = {
  'Flat':       [ 0,  0,  0,  0,  0,  0,  0],
  'Bass Boost': [ 8,  6,  4,  0,  0,  0,  0],
  'Treble':     [ 0,  0,  0,  0,  2,  5,  8],
  'Pop':        [-1,  3,  5,  3, -1, -2, -3],
  'Rock':       [ 5,  3, -2, -2,  1,  4,  5],
  'Jazz':       [ 4,  3,  1,  2, -1, -1,  2],
  'Classical':  [ 5,  4,  3,  2,  0, -2, -4],
  'Electronic': [ 5,  3,  0, -2,  2,  5,  5],
  'Vocal':      [-3, -2,  4,  5,  4,  2, -2],
  'Bass+Treble':[ 6,  4,  0,  0,  0,  4,  6],
};

/** Compute biquad peaking EQ coefficients (Audio EQ Cookbook) */
function computePeakEQ(band: EQBand, sampleRate: number): EQBand {
  const A = Math.pow(10, band.gain / 40);
  const w0 = 2 * Math.PI * band.frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * band.q);

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1n = -2 * cosW0;
  const a2 = 1 - alpha / A;

  return {
    ...band,
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1n / a0,
    a2: a2 / a0,
  };
}

export class DSPManager {
  private bands: EQBand[];
  private sampleRate: number;
  private enabled: boolean = true;
  private leftDelay: { x1: number; x2: number; y1: number; y2: number }[];
  private rightDelay: { x1: number; x2: number; y1: number; y2: number }[];

  constructor(sampleRate = 44100) {
    this.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
    this.bands = DEFAULT_BANDS.map(b => computePeakEQ({
      ...b,
      frequency: Math.min(b.frequency, this.sampleRate / 2),
    }, this.sampleRate));
    this.leftDelay = this.createDelayLines();
    this.rightDelay = this.createDelayLines();
  }

  private createDelayLines() {
    return this.bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  }

  setGain(bandId: number, gain: number) {
    if (!Number.isInteger(bandId) || !this.bands[bandId] || !Number.isFinite(gain)) return;
    const g = Math.max(EQ_MIN_VALUE, Math.min(EQ_MAX_VALUE, gain));
    this.bands[bandId] = computePeakEQ({ ...this.bands[bandId], gain: g }, this.sampleRate);
  }

  setFrequency(bandId: number, freq: number) {
    if (!Number.isInteger(bandId) || !this.bands[bandId] || !Number.isFinite(freq)) return;
    const frequency = Math.max(1, Math.min(this.sampleRate / 2, freq));
    this.bands[bandId] = computePeakEQ({ ...this.bands[bandId], frequency }, this.sampleRate);
  }

  setQ(bandId: number, q: number) {
    if (!Number.isInteger(bandId) || !this.bands[bandId] || !Number.isFinite(q)) return;
    this.bands[bandId] = computePeakEQ({ ...this.bands[bandId], q: Math.max(0.1, Math.min(18, q)) }, this.sampleRate);
  }

  setEnabled(bandId: number, enabled: boolean) {
    if (!Number.isInteger(bandId) || !this.bands[bandId]) return;
    this.bands[bandId] = { ...this.bands[bandId], enabled };
  }

  getGain(bandId: number): number { return this.bands[bandId].gain; }
  getFrequency(bandId: number): number { return this.bands[bandId].frequency; }
  getQ(bandId: number): number { return this.bands[bandId].q; }
  isEnabled(bandId: number): boolean { return this.bands[bandId].enabled; }
  getBands(): EQBand[] { return [...this.bands]; }

  setEnabledAll(enabled: boolean) { this.enabled = enabled; }
  isEnabledAll(): boolean { return this.enabled; }

  loadPreset(name: string): boolean {
    const gains = EQ_PRESETS[name];
    if (!gains) return false;
    gains.forEach((g, i) => this.setGain(i, g));
    return true;
  }

  loadDefaultValues() {
    this.bands = DEFAULT_BANDS.map(b => computePeakEQ({ ...b, gain: 0 }, this.sampleRate));
    this.leftDelay = this.createDelayLines();
    this.rightDelay = this.createDelayLines();
    this.enabled = true;
  }

  /** Process a single stereo sample pair through all enabled biquad filters */
  processSample(left: number, right: number): [number, number] {
    if (!this.enabled) return [left, right];
    let l = left, r = right;
    for (let index = 0; index < this.bands.length; index++) {
      const band = this.bands[index];
      if (!band.enabled) continue;
      const leftState = this.leftDelay[index];
      const rightState = this.rightDelay[index];
      const nextLeft = band.b0 * l + band.b1 * leftState.x1 + band.b2 * leftState.x2
                     - band.a1 * leftState.y1 - band.a2 * leftState.y2;
      const nextRight = band.b0 * r + band.b1 * rightState.x1 + band.b2 * rightState.x2
                      - band.a1 * rightState.y1 - band.a2 * rightState.y2;
      leftState.x2 = leftState.x1; leftState.x1 = l;
      leftState.y2 = leftState.y1; leftState.y1 = nextLeft;
      rightState.x2 = rightState.x1; rightState.x1 = r;
      rightState.y2 = rightState.y1; rightState.y1 = nextRight;
      l = nextLeft;
      r = nextRight;
    }
    return [l, r];
  }

  release() {
    this.loadDefaultValues();
  }
}
