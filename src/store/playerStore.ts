import { create } from 'zustand';
import { AudioEngine, TrackInfo, PlayerState, RepeatType, ShuffleType } from '../engine/AudioEngine';
import { EQBand, DEFAULT_BANDS, EQ_PRESETS, EQ_MIN_VALUE, EQ_MAX_VALUE } from '../engine/DSPManager';
import { loadPlayerPreferences, savePlayerPreferences } from './playerPreferences';

interface PlayerStore {
  // Playback
  state: PlayerState;
  currentTrack: TrackInfo | null;
  playbackRequestId: number;
  playbackError: string | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  // Modes
  repeat: RepeatType;
  shuffle: ShuffleType;
  // EQ
  eqEnabled: boolean;
  eqBands: EQBand[];
  selectedPreset: string;
  // Android DSP controls / Panner
  pan: number;
  masterGainDb: number;
  bassBoostDb: number;
  trebleBoostDb: number;
  virtual3dEnabled: boolean;
  virtual3dGapMs: number;
  surround71Enabled: boolean;
  surround71Level: number;
  surround71Spread: number;
  // Sleep timer
  sleepTimerMs: number | null;
  // Ambient
  ambientUri: string | null;
  ambientVolume: number;
  // Actions
  setPlaylist: (tracks: TrackInfo[], index?: number) => Promise<void>;
  playIndex: (index: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  seekFraction: (f: number) => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  setRepeat: (r: RepeatType) => void;
  setShuffle: (s: ShuffleType) => void;
  setEQBandGain: (id: number, gain: number) => void;
  setEQEnabled: (enabled: boolean) => void;
  loadPreset: (name: string) => void;
  setPan: (pan: number) => Promise<void>;
  setMasterGain: (db: number) => void;
  setBassBoost: (db: number) => void;
  setTrebleBoost: (db: number) => void;
  setVirtual3DEnabled: (enabled: boolean) => void;
  setVirtual3DGap: (ms: number) => void;
  setSurround71Enabled: (enabled: boolean) => void;
  setSurround71Level: (level: number) => void;
  setSurround71Spread: (spread: number) => void;
  setSleepTimer: (ms: number | null) => void;
  playAmbient: (uri: string) => Promise<void>;
  stopAmbient: () => Promise<void>;
  setAmbientVolume: (v: number) => Promise<void>;
  hydratePreferences: () => Promise<void>;
  // Internal (called by engine listener)
  _setState: (s: PlayerState) => void;
  _setTrack: (t: TrackInfo | null, requestId: number) => void;
  _setPosition: (pos: number, dur: number) => void;
  _setSleepTimer: (ms: number | null) => void;
}

const engine = AudioEngine.getInstance();
let preferenceSaveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePreferenceSave(getState: () => PlayerStore) {
  if (preferenceSaveTimer) clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(() => {
    const state = getState();
    void savePlayerPreferences({
      volume: state.volume,
      repeat: state.repeat,
      shuffle: state.shuffle,
      eqEnabled: state.eqEnabled,
      eqGains: state.eqBands.map(band => band.gain),
      selectedPreset: state.selectedPreset,
      pan: state.pan,
      masterGainDb: state.masterGainDb,
      bassBoostDb: state.bassBoostDb,
      trebleBoostDb: state.trebleBoostDb,
      virtual3dEnabled: state.virtual3dEnabled,
      virtual3dGapMs: state.virtual3dGapMs,
      surround71Enabled: state.surround71Enabled,
      surround71Level: state.surround71Level,
      surround71Spread: state.surround71Spread,
    }).catch(() => undefined);
  }, 350);
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  // Wire engine listener
  engine.setListener({
    onStateChange: (s) => get()._setState(s),
    onTrackChange: (t, requestId) => get()._setTrack(t, requestId),
    onPositionChange: (p, d) => get()._setPosition(p, d),
    onError: (playbackError) => set({ playbackError }),
    onSleepTimerChange: (sleepTimerMs) => get()._setSleepTimer(sleepTimerMs),
  });

  return {
    state: 'idle',
    currentTrack: null,
    playbackRequestId: 0,
    playbackError: null,
    positionMs: 0,
    durationMs: 0,
    volume: 1,
    repeat: 'none',
    shuffle: 'off',
    eqEnabled: true,
    eqBands: DEFAULT_BANDS.map(b => ({ ...b })),
    selectedPreset: 'Flat 3D',
    pan: 0,
    masterGainDb: 0,
    bassBoostDb: 0,
    trebleBoostDb: 0,
    virtual3dEnabled: true,
    virtual3dGapMs: 30,
    surround71Enabled: true,
    surround71Level: 0.22,
    surround71Spread: 0.7,
    sleepTimerMs: null,
    ambientUri: null,
    ambientVolume: 0.3,

    setPlaylist: async (tracks, index = 0) => {
      engine.setPlaylist(tracks, index);
      if (tracks.length === 0) {
        await engine.release();
        set({ currentTrack: null, positionMs: 0, durationMs: 0 });
        return;
      }
      await engine.openIndex(engine.getCurrentIndex());
    },

    playIndex: async (index) => {
      await engine.openIndex(index);
    },

    togglePlayPause: async () => { await engine.togglePlayPause(); },
    next: async () => { await engine.next(); },
    previous: async () => { await engine.previous(); },
    seekTo: async (ms) => { await engine.seekTo(ms); },
    seekFraction: async (f) => { await engine.seekToFraction(f); },

    setVolume: async (v) => {
      const volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : get().volume;
      set({ volume });
      await engine.setVolume(volume);
      schedulePreferenceSave(get);
    },

    setRepeat: (r) => { set({ repeat: r }); engine.setRepeat(r); schedulePreferenceSave(get); },
    setShuffle: (s) => { set({ shuffle: s }); engine.setShuffle(s); schedulePreferenceSave(get); },

    setEQBandGain: (id, gain) => {
      if (!Number.isInteger(id) || !get().eqBands[id] || !Number.isFinite(gain)) return;
      const boundedGain = Math.max(EQ_MIN_VALUE, Math.min(EQ_MAX_VALUE, gain));
      engine.getDSP().setGain(id, boundedGain);
      engine.applyDSPSettings();
      const bands = [...get().eqBands];
      bands[id] = { ...bands[id], gain: boundedGain };
      set({ eqBands: bands, selectedPreset: 'Custom' });
      schedulePreferenceSave(get);
    },

    setEQEnabled: (enabled) => {
      engine.getDSP().setEnabledAll(enabled);
      engine.applyDSPSettings();
      set({ eqEnabled: enabled });
      schedulePreferenceSave(get);
    },

    loadPreset: (name) => {
      engine.getDSP().loadPreset(name);
      const preset = EQ_PRESETS[name];
      if (!preset) return;
      engine.applyDSPSettings();
      const bands = get().eqBands.map((b, i) => ({ ...b, gain: preset.bands[i] ?? 0 }));
      set({
        eqBands: bands,
        selectedPreset: name,
        masterGainDb: preset.masterGainDb,
        bassBoostDb: preset.bassBoostDb,
        trebleBoostDb: preset.trebleBoostDb,
        virtual3dEnabled: preset.virtual3dEnabled,
        virtual3dGapMs: preset.virtual3dGapMs,
        surround71Enabled: preset.surround71Enabled,
        surround71Level: preset.surround71Level,
        surround71Spread: preset.surround71Spread,
      });
      engine.setMasterGain(preset.masterGainDb);
      engine.setBassBoost(preset.bassBoostDb);
      engine.setTrebleBoost(preset.trebleBoostDb);
      engine.setVirtual3DEnabled(preset.virtual3dEnabled);
      engine.setVirtual3DGap(preset.virtual3dGapMs);
      engine.setSurround71Enabled(preset.surround71Enabled);
      engine.setSurround71(preset.surround71Level, preset.surround71Spread);
      schedulePreferenceSave(get);
    },

    setPan: async (pan) => {
      const boundedPan = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : get().pan;
      set({ pan: boundedPan });
      await engine.setPan(boundedPan);
      schedulePreferenceSave(get);
    },

    setMasterGain: (db) => {
      const value = Number.isFinite(db) ? Math.max(-20, Math.min(20, db)) : get().masterGainDb;
      set({ masterGainDb: value, selectedPreset: 'Custom' });
      engine.setMasterGain(value);
      schedulePreferenceSave(get);
    },
    setBassBoost: (db) => {
      const value = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : get().bassBoostDb;
      set({ bassBoostDb: value, selectedPreset: 'Custom' });
      engine.setBassBoost(value);
      schedulePreferenceSave(get);
    },
    setTrebleBoost: (db) => {
      const value = Number.isFinite(db) ? Math.max(0, Math.min(30, db)) : get().trebleBoostDb;
      set({ trebleBoostDb: value, selectedPreset: 'Custom' });
      engine.setTrebleBoost(value);
      schedulePreferenceSave(get);
    },
    setVirtual3DEnabled: (enabled) => {
      set({ virtual3dEnabled: enabled, selectedPreset: 'Custom' });
      engine.setVirtual3DEnabled(enabled);
      schedulePreferenceSave(get);
    },
    setVirtual3DGap: (ms) => {
      const value = Number.isFinite(ms) ? Math.round(Math.max(1, Math.min(40, ms))) : get().virtual3dGapMs;
      set({ virtual3dGapMs: value, selectedPreset: 'Custom' });
      engine.setVirtual3DGap(value);
      schedulePreferenceSave(get);
    },
    setSurround71Enabled: (enabled) => {
      set({ surround71Enabled: enabled, selectedPreset: 'Custom' });
      engine.setSurround71Enabled(enabled);
      schedulePreferenceSave(get);
    },
    setSurround71Level: (level) => {
      const value = Number.isFinite(level) ? Math.max(0.15, Math.min(0.45, level)) : get().surround71Level;
      set({ surround71Level: value, selectedPreset: 'Custom' });
      engine.setSurround71(value, get().surround71Spread);
      schedulePreferenceSave(get);
    },
    setSurround71Spread: (spread) => {
      const value = Number.isFinite(spread) ? Math.max(0.05, Math.min(0.7, spread)) : get().surround71Spread;
      set({ surround71Spread: value, selectedPreset: 'Custom' });
      engine.setSurround71(get().surround71Level, value);
      schedulePreferenceSave(get);
    },

    setSleepTimer: (ms) => {
      set({ sleepTimerMs: ms });
      engine.setSleepTimer(ms);
    },

    playAmbient: async (uri) => {
      set({ ambientUri: uri });
      await engine.playAmbient(uri, get().ambientVolume);
    },

    stopAmbient: async () => {
      set({ ambientUri: null });
      await engine.stopAmbient();
    },

    setAmbientVolume: async (v) => {
      set({ ambientVolume: v });
      await engine.setAmbientVolume(v);
    },

    hydratePreferences: async () => {
      const preferences = await loadPlayerPreferences();
      if (!preferences) return;
      const eqBands = get().eqBands.map((band, index) => ({
        ...band,
        gain: preferences.eqGains[index] ?? 0,
      }));
      set({
        volume: preferences.volume,
        repeat: preferences.repeat,
        shuffle: preferences.shuffle,
        eqEnabled: preferences.eqEnabled,
        eqBands,
        selectedPreset: preferences.selectedPreset,
        pan: preferences.pan,
        masterGainDb: preferences.masterGainDb,
        bassBoostDb: preferences.bassBoostDb,
        trebleBoostDb: preferences.trebleBoostDb,
        virtual3dEnabled: preferences.virtual3dEnabled,
        virtual3dGapMs: preferences.virtual3dGapMs,
        surround71Enabled: preferences.surround71Enabled,
        surround71Level: preferences.surround71Level,
        surround71Spread: preferences.surround71Spread,
      });
      engine.setRepeat(preferences.repeat);
      engine.setShuffle(preferences.shuffle);
      eqBands.forEach((band, index) => engine.getDSP().setGain(index, band.gain));
      engine.getDSP().setEnabledAll(preferences.eqEnabled);
      engine.applyDSPSettings();
      await engine.setVolume(preferences.volume);
      await engine.setPan(preferences.pan);
      engine.setMasterGain(preferences.masterGainDb);
      engine.setBassBoost(preferences.bassBoostDb);
      engine.setTrebleBoost(preferences.trebleBoostDb);
      engine.setVirtual3DEnabled(preferences.virtual3dEnabled);
      engine.setVirtual3DGap(preferences.virtual3dGapMs);
      engine.setSurround71Enabled(preferences.surround71Enabled);
      engine.setSurround71(preferences.surround71Level, preferences.surround71Spread);
    },

    _setState: (state) => set({ state }),
    _setTrack: (currentTrack, playbackRequestId) => set({
      currentTrack,
      playbackRequestId,
      playbackError: null,
      positionMs: 0,
      durationMs: currentTrack?.duration ?? 0,
    }),
    _setPosition: (positionMs, durationMs) => set(state => ({
      positionMs,
      durationMs,
      currentTrack: state.currentTrack && durationMs > 0 && state.currentTrack.duration !== durationMs
        ? { ...state.currentTrack, duration: durationMs }
        : state.currentTrack,
    })),
    _setSleepTimer: (sleepTimerMs) => set({ sleepTimerMs }),
  };
});
