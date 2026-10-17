import React, { useEffect, useRef } from 'react';
import { Audio, useAudioTagContext, type AudioTagHandle } from 'react-native-audio-api';
import { AudioEngine } from './AudioEngine';
import { AudioGraphController } from './AudioGraphController';
import { usePlayerStore } from '../store/playerStore';

/** Keeps the native audio element mounted at app scope so playback survives screen changes. */
export default function AudioPlaybackHost() {
  const track = usePlayerStore(state => state.currentTrack);
  const requestId = usePlayerStore(state => state.playbackRequestId);
  const playerRef = useRef<AudioTagHandle>(null);
  const engine = AudioEngine.getInstance();
  const graph = AudioGraphController.getInstance();

  if (!track) return null;

  return (
    <Audio
      key={`${track.id}:${requestId}`}
      ref={playerRef}
      source={track.uri}
      context={graph.context}
      autoPlay={false}
      onLoad={() => {
        if (playerRef.current) void engine.attachNativePlayer(track.id, requestId, playerRef.current);
      }}
      onEnded={() => engine.notifyNativeTrackEnded(requestId)}
      onError={error => engine.notifyNativePlaybackError(requestId, error)}
    >
      <PlaybackProgressBridge trackId={track.id} requestId={requestId} />
    </Audio>
  );
}

function PlaybackProgressBridge({ trackId, requestId }: { trackId: string; requestId: number }) {
  const { currentTime, duration, playbackState } = useAudioTagContext();

  useEffect(() => {
    AudioEngine.getInstance().reportNativeStatus(
      trackId,
      requestId,
      currentTime,
      duration,
      playbackState,
    );
  }, [currentTime, duration, playbackState, requestId, trackId]);

  return null;
}
