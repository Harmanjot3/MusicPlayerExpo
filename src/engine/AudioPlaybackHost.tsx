import React, { useEffect, useRef, useState } from 'react';
import { Audio, useAudioTagContext, type AudioTagHandle } from 'react-native-audio-api';
import { AudioEngine } from './AudioEngine';
import { AudioGraphController } from './AudioGraphController';
import { usePlayerStore } from '../store/playerStore';

/** Keeps the native audio element mounted at app scope so playback survives screen changes. */
export default function AudioPlaybackHost() {
  const track = usePlayerStore(state => state.currentTrack);
  const requestId = usePlayerStore(state => state.playbackRequestId);
  if (!track) return null;

  return (
    <TrackAudioPlaybackHost
      key={`${track.id}:${requestId}`}
      track={track}
      requestId={requestId}
    />
  );
}

function TrackAudioPlaybackHost({
  track,
  requestId,
}: {
  track: NonNullable<ReturnType<typeof usePlayerStore.getState>['currentTrack']>;
  requestId: number;
}) {
  const playerRef = useRef<AudioTagHandle>(null);
  const engine = AudioEngine.getInstance();
  const [graph, setGraph] = useState<AudioGraphController | null>(null);

  useEffect(() => {
    try {
      let active = true;
      void Promise.resolve().then(() => {
        try {
          const audioGraph = AudioGraphController.getInstance();
          if (active) setGraph(audioGraph);
        } catch (error) {
          if (active) {
            engine.notifyNativePlaybackError(
              requestId,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      });
      return () => { active = false; };
    } catch (error) {
      engine.notifyNativePlaybackError(
        requestId,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, [engine, requestId, track]);

  if (!graph) return null;

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
