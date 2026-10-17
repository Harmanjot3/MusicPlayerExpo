import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { PlaybackNotificationManager, type AudioTagHandle, type AudioTagPlaybackState } from 'react-native-audio-api';
import { DSPManager } from './DSPManager';
import { AudioGraphController } from './AudioGraphController';

export type RepeatType = 'none' | 'one' | 'all';
export type ShuffleType = 'off' | 'on';
export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';

export interface TrackInfo {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  albumArtUri?: string;
}

export interface EngineInterface {
  onStateChange: (state: PlayerState) => void;
  onTrackChange: (track: TrackInfo | null, requestId: number) => void;
  onPositionChange: (positionMs: number, durationMs: number) => void;
  onError: (msg: string) => void;
  onSleepTimerChange: (ms: number | null) => void;
}

export class AudioEngine {
  private static instance: AudioEngine;
  private sound: AudioTagHandle | null = null;
  private ambientSound: AudioPlayer | null = null;
  private dspManager: DSPManager;
  private audioGraph: AudioGraphController;
  private listener: EngineInterface | null = null;

  private currentState: PlayerState = 'idle';
  private currentTrack: TrackInfo | null = null;
  private playlist: TrackInfo[] = [];
  private currentIndex = 0;
  private repeatType: RepeatType = 'none';
  private shuffleType: ShuffleType = 'off';
  private shuffledOrder: number[] = [];
  private volume = 1;
  private pan = 0;
  private autoPauseMs: number | null = null;
  private sleepDeadlineMs: number | null = null;
  private autoPauseTimer: ReturnType<typeof setTimeout> | null = null;
  private surroundStrength = 0;
  private loadGeneration = 0;
  private handlingTrackEnd = false;
  private shouldAutoplay = true;
  private positionSeconds = 0;
  private durationSeconds = 0;
  private lastNotificationUpdateMs = 0;

  private constructor() {
    this.dspManager = new DSPManager(44100);
    this.audioGraph = AudioGraphController.getInstance();
    PlaybackNotificationManager.addEventListener('playbackNotificationPlay', () => { void this.play(); });
    PlaybackNotificationManager.addEventListener('playbackNotificationPause', () => { void this.pause(); });
    PlaybackNotificationManager.addEventListener('playbackNotificationNextTrack', () => { void this.next(); });
    PlaybackNotificationManager.addEventListener('playbackNotificationPreviousTrack', () => { void this.previous(); });
    PlaybackNotificationManager.addEventListener('playbackNotificationSkipForward', event => {
      void this.seekTo((this.positionSeconds + event.value) * 1000);
    });
    PlaybackNotificationManager.addEventListener('playbackNotificationSkipBackward', event => {
      void this.seekTo((this.positionSeconds - event.value) * 1000);
    });
    PlaybackNotificationManager.addEventListener('playbackNotificationSeekTo', event => {
      void this.seekTo(event.value * 1000);
    });
    PlaybackNotificationManager.addEventListener('playbackNotificationStop', () => {
      void this.pause();
      void this.seekTo(0);
    });
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
    return AudioEngine.instance;
  }

  setListener(listener: EngineInterface) { this.listener = listener; }
  getDSP(): DSPManager { return this.dspManager; }
  getLoadGeneration(): number { return this.loadGeneration; }

  setPlaylist(tracks: TrackInfo[], startIndex = 0) {
    this.playlist = [...tracks];
    const selectedIndex = this.playlist.length === 0
      ? 0
      : Math.max(0, Math.min(this.playlist.length - 1, Math.trunc(startIndex)));
    this.rebuildShuffleOrder();
    if (this.shuffleType === 'on' && this.playlist.length > 0) {
      this.shuffledOrder = [selectedIndex, ...this.shuffledOrder.filter(index => index !== selectedIndex)];
      this.currentIndex = 0;
    } else {
      this.currentIndex = selectedIndex;
    }
  }

  private rebuildShuffleOrder() {
    this.shuffledOrder = [...Array(this.playlist.length).keys()];
    for (let i = this.shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledOrder[i], this.shuffledOrder[j]] = [this.shuffledOrder[j], this.shuffledOrder[i]];
    }
  }

  private resolvedIndex(index: number): number {
    return this.shuffleType === 'on' ? (this.shuffledOrder[index] ?? index) : index;
  }

  async openAndPlay(track: TrackInfo) {
    const generation = ++this.loadGeneration;
    this.handlingTrackEnd = false;
    this.shouldAutoplay = true;
    this.positionSeconds = 0;
    this.durationSeconds = track.duration / 1000;
    this.setState('loading');
    try {
      await this.releaseSound();
      if (generation !== this.loadGeneration) return;

      this.currentTrack = track;
      this.listener?.onTrackChange(track, generation);
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.listener?.onError(error instanceof Error ? error.message : 'Playback error');
      this.setState('idle');
    }
  }

  async attachNativePlayer(trackId: string, requestId: number, handle: AudioTagHandle) {
    if (requestId !== this.loadGeneration || trackId !== this.currentTrack?.id) return;
    try {
      await this.audioGraph.connect(handle);
      if (requestId !== this.loadGeneration) {
        this.audioGraph.disconnectSource();
        return;
      }
      this.sound = handle;
      this.audioGraph.setVolume(this.volume);
      this.audioGraph.setPan(this.pan);
      this.audioGraph.setSurroundStrength(this.surroundStrength);
      this.audioGraph.setBands(this.dspManager.getBands(), this.dspManager.isEnabledAll());
      if (this.shouldAutoplay) {
        handle.play();
        this.setState('playing');
        this.scheduleAutoPause();
      } else {
        this.setState('paused');
      }
      void this.updatePlaybackNotification();
    } catch (error) {
      this.notifyNativePlaybackError(requestId, error instanceof Error ? error : new Error(String(error)));
    }
  }

  reportNativeStatus(
    trackId: string,
    requestId: number,
    currentTime: number,
    duration: number,
    playbackState: AudioTagPlaybackState,
  ) {
    if (requestId !== this.loadGeneration || trackId !== this.currentTrack?.id) return;
    if (Number.isFinite(currentTime)) this.positionSeconds = Math.max(0, currentTime);
    if (Number.isFinite(duration) && duration > 0) this.durationSeconds = duration;
    this.listener?.onPositionChange(this.positionSeconds * 1000, this.durationSeconds * 1000);
    if (Date.now() - this.lastNotificationUpdateMs >= 1000) void this.updatePlaybackNotification();
    if (playbackState === 'playing' || playbackState === 'buffering') this.setState('playing');
    else if (playbackState === 'paused' && this.currentState === 'playing') this.setState('paused');
  }

  notifyNativeTrackEnded(requestId: number) {
    void this.handleTrackEnd(requestId);
  }

  notifyNativePlaybackError(requestId: number, error: Error) {
    if (requestId !== this.loadGeneration) return;
    this.listener?.onError(error.message || 'Playback error');
    this.sound = null;
    this.audioGraph.disconnectSource();
    this.clearAutoPause();
    this.setState('idle');
  }

  private async updatePlaybackNotification() {
    const track = this.currentTrack;
    if (!track) return;
    try {
      this.lastNotificationUpdateMs = Date.now();
      await PlaybackNotificationManager.show({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.albumArtUri ? { uri: track.albumArtUri } : undefined,
        duration: this.durationSeconds,
        elapsedTime: this.positionSeconds,
        state: this.currentState === 'playing' ? 'playing' : 'paused',
      });
    } catch (error) {
      this.listener?.onError(error instanceof Error ? error.message : 'Could not update playback controls');
    }
  }

  async openIndex(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    const track = this.playlist[this.resolvedIndex(index)];
    if (track) await this.openAndPlay(track);
  }

  private async handleTrackEnd(generation: number) {
    if (generation !== this.loadGeneration || this.handlingTrackEnd) return;
    this.handlingTrackEnd = true;
    try {
      if (this.repeatType === 'one') {
        await this.seekTo(0);
        if (generation === this.loadGeneration) await this.play();
        return;
      }
      if (this.currentIndex < this.playlist.length - 1) {
        await this.next();
      } else if (this.repeatType === 'all' && this.playlist.length > 0) {
        this.currentIndex = 0;
        await this.openIndex(0);
      } else {
        this.clearAutoPause();
        this.autoPauseMs = null;
        this.sleepDeadlineMs = null;
        this.listener?.onSleepTimerChange(null);
        this.setState('stopped');
      }
    } finally {
      this.handlingTrackEnd = false;
    }
  }

  async play() {
    this.shouldAutoplay = true;
    if (!this.sound) {
      if (this.currentTrack) this.setState('loading');
      return;
    }
    if (this.durationSeconds > 0 && this.positionSeconds >= this.durationSeconds) await this.seekTo(0);
    await this.audioGraph.context.resume();
    this.sound.play();
    this.setState('playing');
    this.scheduleAutoPause();
    void this.updatePlaybackNotification();
  }

  async pause() {
    this.shouldAutoplay = false;
    if (!this.sound) {
      if (this.currentTrack) this.setState('paused');
      this.clearAutoPause();
      return;
    }
    this.sound.pause();
    this.setState('paused');
    this.clearAutoPause();
    void this.updatePlaybackNotification();
  }

  async togglePlayPause() {
    if (this.currentState === 'playing') await this.pause();
    else await this.play();
  }

  async next() {
    if (this.playlist.length === 0) return;
    if (this.currentIndex >= this.playlist.length - 1) {
      if (this.repeatType !== 'all') return;
      this.currentIndex = 0;
    } else {
      this.currentIndex += 1;
    }
    await this.openIndex(this.currentIndex);
  }

  async previous() {
    if (!this.sound) return;
    if (this.positionSeconds > 3) {
      await this.seekTo(0);
      return;
    }
    if (this.currentIndex === 0 && this.repeatType === 'all' && this.playlist.length > 0) {
      this.currentIndex = this.playlist.length - 1;
    } else {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
    await this.openIndex(this.currentIndex);
  }

  async seekTo(ms: number) {
    if (!Number.isFinite(ms) || !this.sound) return;
    const duration = this.durationSeconds * 1000;
    const target = Math.max(0, Math.min(ms, duration > 0 ? duration : ms));
    this.positionSeconds = target / 1000;
    this.sound.seekToTime(target / 1000);
    this.listener?.onPositionChange(target, duration);
    void this.updatePlaybackNotification();
  }

  async seekToFraction(fraction: number) {
    if (!Number.isFinite(fraction) || !this.sound || this.durationSeconds <= 0) return;
    await this.seekTo(Math.max(0, Math.min(1, fraction)) * this.durationSeconds * 1000);
  }

  async setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.volume;
    this.audioGraph.setVolume(this.volume);
  }

  getVolume(): number { return this.volume; }

  async setPan(value: number) {
    this.pan = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : this.pan;
    this.audioGraph.setPan(this.pan);
  }

  getPan(): number { return this.pan; }

  setSurroundStrength(value: number) {
    this.surroundStrength = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.surroundStrength;
    this.audioGraph.setSurroundStrength(this.surroundStrength);
  }

  applyDSPSettings() {
    this.audioGraph.setBands(this.dspManager.getBands(), this.dspManager.isEnabledAll());
  }

  getSurroundStrength(): number { return this.surroundStrength; }

  setRepeat(type: RepeatType) { this.repeatType = type; }
  getRepeat(): RepeatType { return this.repeatType; }

  setShuffle(type: ShuffleType) {
    const currentTrack = this.currentTrack;
    this.shuffleType = type;
    if (type === 'on') {
      this.rebuildShuffleOrder();
      const selectedIndex = currentTrack
        ? this.playlist.findIndex(track => track.id === currentTrack.id)
        : -1;
      if (selectedIndex >= 0) {
        this.shuffledOrder = [selectedIndex, ...this.shuffledOrder.filter(index => index !== selectedIndex)];
        this.currentIndex = 0;
      }
    } else {
      if (currentTrack) {
        const selectedIndex = this.playlist.findIndex(track => track.id === currentTrack.id);
        if (selectedIndex >= 0) this.currentIndex = selectedIndex;
      }
      this.shuffledOrder = [...Array(this.playlist.length).keys()];
    }
  }

  getShuffle(): ShuffleType { return this.shuffleType; }

  setSleepTimer(ms: number | null) {
    this.autoPauseMs = ms == null ? null : Math.max(0, ms);
    this.sleepDeadlineMs = this.autoPauseMs == null ? null : Date.now() + this.autoPauseMs;
    this.clearAutoPause();
    this.scheduleAutoPause();
  }

  getSleepTimer(): number | null { return this.autoPauseMs; }

  private scheduleAutoPause() {
    if (this.sleepDeadlineMs == null || this.currentState !== 'playing') return;
    this.autoPauseTimer = setTimeout(() => {
      this.autoPauseMs = null;
      this.sleepDeadlineMs = null;
      this.listener?.onSleepTimerChange(null);
      void this.pause();
    }, Math.max(0, this.sleepDeadlineMs - Date.now()));
  }

  private clearAutoPause() {
    if (this.autoPauseTimer) {
      clearTimeout(this.autoPauseTimer);
      this.autoPauseTimer = null;
    }
  }

  async playAmbient(uri: string, volume = 0.3) {
    await this.stopAmbient();
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    const player = createAudioPlayer(uri, { updateInterval: 1000 });
    player.loop = true;
    player.volume = Math.max(0, Math.min(1, volume));
    this.ambientSound = player;
    player.play();
  }

  async stopAmbient() {
    const player = this.ambientSound;
    this.ambientSound = null;
    if (!player) return;
    player.pause();
    player.remove();
  }

  async setAmbientVolume(value: number) {
    if (this.ambientSound) this.ambientSound.volume = Math.max(0, Math.min(1, value));
  }

  private setState(state: PlayerState) {
    if (this.currentState === state) return;
    this.currentState = state;
    this.listener?.onStateChange(state);
    if (this.currentTrack && this.sound) void this.updatePlaybackNotification();
  }

  getState(): PlayerState { return this.currentState; }
  getCurrentTrack(): TrackInfo | null { return this.currentTrack; }
  getCurrentIndex(): number { return this.currentIndex; }
  getPlaylist(): TrackInfo[] { return this.playlist; }

  private async releaseSound() {
    this.clearAutoPause();
    const player = this.sound;
    this.sound = null;
    if (player) {
      player.pause();
    }
    this.audioGraph.disconnectSource();
  }

  async release() {
    this.loadGeneration += 1;
    this.sleepDeadlineMs = null;
    this.autoPauseMs = null;
    await this.releaseSound();
    await this.stopAmbient();
    await Promise.allSettled([
      this.audioGraph.context.suspend(),
      PlaybackNotificationManager.hide(),
    ]);
    this.listener?.onSleepTimerChange(null);
    this.playlist = [];
    this.shuffledOrder = [];
    this.currentIndex = 0;
    this.currentTrack = null;
    this.positionSeconds = 0;
    this.durationSeconds = 0;
    this.listener?.onTrackChange(null, this.loadGeneration);
    this.listener?.onPositionChange(0, 0);
    this.setState('idle');
  }
}
