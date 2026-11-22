/**
 * DSPManager — mirrors com.tamalbasak.musicplayer.DSPManager
 * Mirrors the Android player's equalizer and effect parameter ranges.
 */

export interface EQBand {
  id: number;
  label: string;
  frequency: number;  // Hz
  gain: number;       // dB, range [-20, +20]
  q: number;          // Q factor
  enabled: boolean;
  // biquad coefficients (recomputed on param change)
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
  // delay lines
  x1: number; x2: number;
  y1: number; y2: number;
}

export const EQ_MIN_VALUE = -20;
export const EQ_MAX_VALUE = 20;

export interface EQPreset {
  bands: number[];
  masterGainDb: number;
  bassBoostDb: number;
  trebleBoostDb: number;
  virtual3dEnabled: boolean;
  virtual3dGapMs: number;
  surround71Enabled: boolean;
  surround71Level: number;
  surround71Spread: number;
}

export const DEFAULT_BANDS: EQBand[] = [
  { id: 0, label: '32', frequency: 32, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 1, label: '64', frequency: 64, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 2, label: '125', frequency: 125, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 3, label: '250', frequency: 250, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 4, label: '500', frequency: 500, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 5, label: '1K', frequency: 1000, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 6, label: '2K', frequency: 2000, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 7, label: '4K', frequency: 4000, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 8, label: '8K', frequency: 8000, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
  { id: 9, label: '16K', frequency: 16000, gain: 0, q: 0.5, enabled: true, b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0 },
];

const preset = (
  bands: number[], masterGainDb: number, bassBoostDb: number, trebleBoostDb: number,
  virtual3dEnabled: boolean, virtual3dGapMs: number, surround71Enabled: boolean,
  surround71Level: number, surround71Spread: number,
): EQPreset => ({ bands, masterGainDb, bassBoostDb, trebleBoostDb, virtual3dEnabled, virtual3dGapMs, surround71Enabled, surround71Level, surround71Spread });

/** System presets recovered from the Android app's bundled preset files. */
export const EQ_PRESETS: Record<string, EQPreset> = {
  'Acoustic 3D': preset([5,5,4,1,2,2,3,4,3,2], -3, 7.5, 0, true, 33, true, .22031, .7),
  'Acoustic': preset([5,5,4,1,2,2,3,4,3,2], -3, 7.5, 0, false, 30, false, .22031, .7),
  'Classical 3D': preset([4,3,2,1,-2,-2,0,2,3,4], -3, 7.5, 0, true, 33, true, .22031, .7),
  'Classical': preset([4,3,2,1,-2,-2,0,2,3,4], -3, 7.5, 0, false, 30, false, .22031, .7),
  'Dance 3D': preset([3,6,4,0,1,3,5,4,3,0], -5, 7.5, 0, true, 33, true, .22031, .6805),
  'Dance': preset([3,6,4,0,1,3,5,4,3,0], -5, 7.5, 0, false, 30, false, .22031, .6805),
  'Extreme BASS 3D': preset([20,15,9,0,2,-1,-6,-2,0,14], -8, 22.5, 0, true, 30, true, .22031, .7),
  'Extreme BASS': preset([20,15,9,0,2,-1,-6,-2,0,14], -8, 22.5, 0, false, 30, false, .22031, .7),
  'Flat 3D': preset([0,0,0,0,0,0,0,0,0,0], 0, 0, 0, true, 30, true, .22031, .7),
  'Flat': preset([0,0,0,0,0,0,0,0,0,0], 0, 0, 0, false, 30, false, .22031, .7),
  'Hip-Hop 3D': preset([5,4,1,2,-2,-2,1,-1,2,3], -5, 0, 0, true, 30, true, .22031, .7),
  'Hip-Hop': preset([5,4,1,2,-2,-2,1,-1,2,3], -5, 0, 0, false, 30, false, .22031, .7),
  'Pop 3D': preset([-2,-1,0,2,4,3,2,0,-1,-2], -5, 0, 0, true, 30, true, .22031, .7),
  'Pop': preset([-2,-1,0,2,4,3,2,0,-1,-2], -5, 0, 0, false, 30, false, .22031, .7),
  'Rock 3D': preset([5,4,2,2,1,-1,-1,2,3,5], -5, 8.7, 0, true, 30, true, .22031, .7),
  'Rock': preset([5,4,2,2,1,-1,-1,2,3,5], -5, 8.7, 0, false, 30, false, .22031, .7),
  'Speaker': preset([0,0,0,0,0,-3,-2,1,2,3], -3, 0, 9.45, false, 26, false, .24981, .6285),
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
    const preset = EQ_PRESETS[name];
    if (!preset) return false;
    preset.bands.forEach((g, i) => this.setGain(i, g));
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
