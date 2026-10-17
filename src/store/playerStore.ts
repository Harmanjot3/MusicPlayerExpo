import { create } from 'zustand';
import { AudioEngine, TrackInfo, PlayerState, RepeatType, ShuffleType } from '../engine/AudioEngine';
import { EQBand, DEFAULT_BANDS, EQ_PRESETS } from '../engine/DSPManager';
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
  // Surround / Panner
  pan: number;
  surroundStrength: number;
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
  setSurroundStrength: (s: number) => void;
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
      surroundStrength: state.surroundStrength,
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
    selectedPreset: 'Flat',
    pan: 0,
    surroundStrength: 0,
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
      const boundedGain = Math.max(-12, Math.min(12, gain));
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
      const gains = EQ_PRESETS[name];
      if (!gains) return;
      engine.applyDSPSettings();
      const bands = get().eqBands.map((b, i) => ({ ...b, gain: gains[i] ?? 0 }));
      set({ eqBands: bands, selectedPreset: name });
      schedulePreferenceSave(get);
    },

    setPan: async (pan) => {
      const boundedPan = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : get().pan;
      set({ pan: boundedPan });
      await engine.setPan(boundedPan);
      schedulePreferenceSave(get);
    },

    setSurroundStrength: (s) => {
      const strength = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : get().surroundStrength;
      set({ surroundStrength: strength });
      engine.setSurroundStrength(strength);
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
        surroundStrength: preferences.surroundStrength,
      });
      engine.setRepeat(preferences.repeat);
      engine.setShuffle(preferences.shuffle);
      eqBands.forEach((band, index) => engine.getDSP().setGain(index, band.gain));
      engine.getDSP().setEnabledAll(preferences.eqEnabled);
      engine.applyDSPSettings();
      await engine.setVolume(preferences.volume);
      await engine.setPan(preferences.pan);
      engine.setSurroundStrength(preferences.surroundStrength);
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
