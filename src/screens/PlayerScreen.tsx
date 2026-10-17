import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  Platform, StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../store/playerStore';
import { Colors } from '../theme/colors';

const { width } = Dimensions.get('window');
const ALBUM_SIZE = width * 0.72;

function msToTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── Animated Album Art ───────────────────────────────────────────────────────
function AlbumArt({ isPlaying }: { isPlaying: boolean }) {
  const [rotation] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));
  const rotAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      rotAnim.current = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 18000,
          useNativeDriver: true,
        })
      );
      rotAnim.current.start();
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    } else {
      rotAnim.current?.stop();
      Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
    }
  }, [isPlaying, rotation, scale]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.albumOuter, { transform: [{ scale }] }]}>
      <Animated.View style={[styles.albumContainer, { transform: [{ rotate: spin }] }]}>
        {/* Vinyl rings */}
        <LinearGradient
          colors={['#1a1a3e', '#0d0d20', '#1a1a3e', '#0d0d20']}
          style={styles.album}
        >
          {[0.85, 0.7, 0.55, 0.4].map((r, i) => (
            <View key={i} style={[styles.vinylRing, {
              width: ALBUM_SIZE * r,
              height: ALBUM_SIZE * r,
              borderRadius: ALBUM_SIZE * r / 2,
              borderColor: `rgba(139,92,246,${0.1 + i * 0.05})`,
            }]} />
          ))}
          {/* Center label */}
          <LinearGradient
            colors={[Colors.primary, Colors.accent]}
            style={styles.albumCenter}
          >
            <Ionicons name="musical-note" size={28} color="white" />
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
      {/* Glow */}
      {isPlaying && (
        <View style={styles.albumGlow} />
      )}
    </Animated.View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar() {
  const { positionMs, durationMs, seekFraction } = usePlayerStore();
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <View style={styles.progressArea}>
      <TouchableOpacity
        style={styles.progressTrack}
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          seekFraction(x / (width - 48));
        }}
        activeOpacity={1}
      >
        <LinearGradient
          colors={[Colors.primary, Colors.accent]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${progress * 100}%` }]}
        />
        <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
      </TouchableOpacity>
      <View style={styles.progressLabels}>
        <Text style={styles.progressTime}>{msToTime(positionMs)}</Text>
        <Text style={styles.progressTime}>{durationMs > 0 ? msToTime(durationMs) : '--:--'}</Text>
      </View>
    </View>
  );
}

// ─── Waveform Visualizer ──────────────────────────────────────────────────────
function WaveformVisualizer({ isPlaying }: { isPlaying: boolean }) {
  const bars = 40;
  const [animVals] = useState(() =>
    Array.from({ length: bars }, () => new Animated.Value(0.1))
  );
  const animations = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (isPlaying) {
      animations.current.forEach(a => a.stop());
      animations.current = animVals.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 40),
            Animated.timing(v, {
              toValue: 0.2 + Math.random() * 0.8,
              duration: 300 + Math.random() * 400,
              useNativeDriver: false,
            }),
            Animated.timing(v, {
              toValue: 0.05 + Math.random() * 0.3,
              duration: 300 + Math.random() * 400,
              useNativeDriver: false,
            }),
          ])
        )
      );
      animations.current.forEach(a => a.start());
    } else {
      animations.current.forEach(a => a.stop());
      animVals.forEach(v =>
        Animated.spring(v, { toValue: 0.1, useNativeDriver: false }).start()
      );
    }
  }, [isPlaying, animVals]);

  const W = width - 48;
  const BAR_W = (W / bars) - 2;

  return (
    <View style={styles.waveformContainer}>
      {animVals.map((v, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          width: BAR_W,
          height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 48] }),
          backgroundColor: i % 2 === 0 ? Colors.primary : Colors.accent,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        }]} />
      ))}
    </View>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────
function Controls() {
  const {
    state, togglePlayPause, next, previous,
    repeat, setRepeat, shuffle, setShuffle,
  } = usePlayerStore();
  const isPlaying = state === 'playing';

  const cycleRepeat = () => {
    const next: Record<string, any> = { none: 'all', all: 'one', one: 'none' };
    setRepeat(next[repeat]);
  };

  return (
    <View style={styles.controls}>
      {/* Shuffle */}
      <TouchableOpacity onPress={() => setShuffle(shuffle === 'on' ? 'off' : 'on')} style={styles.sideBtn}>
        <Ionicons
          name="shuffle"
          size={22}
          color={shuffle === 'on' ? Colors.primary : Colors.textMuted}
        />
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity onPress={previous} style={styles.skipBtn}>
        <Ionicons name="play-skip-back" size={28} color={Colors.textPrimary} />
      </TouchableOpacity>

      {/* Play/Pause */}
      <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn}>
        <LinearGradient
          colors={[Colors.primary, Colors.accent]}
          style={styles.playBtnInner}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="white" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Next */}
      <TouchableOpacity onPress={next} style={styles.skipBtn}>
        <Ionicons name="play-skip-forward" size={28} color={Colors.textPrimary} />
      </TouchableOpacity>

      {/* Repeat */}
      <TouchableOpacity onPress={cycleRepeat} style={styles.sideBtn}>
        <Ionicons
          name={repeat === 'one' ? 'repeat-outline' : 'repeat'}
          size={22}
          color={repeat !== 'none' ? Colors.primary : Colors.textMuted}
        />
        {repeat === 'one' && (
          <Text style={styles.repeatOne}>1</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Player Screen ───────────────────────────────────────────────────────────
export default function PlayerScreen({
  onClose,
  onOpenEQ,
}: {
  onClose: () => void;
  onOpenEQ: () => void;
}) {
  const { currentTrack, playbackError, state } = usePlayerStore();
  const isPlaying = state === 'playing';

  return (
    <LinearGradient colors={['#1a0533', '#080d18', Colors.bg]} style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <Ionicons name="chevron-down" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>NOW PLAYING</Text>
        </View>
        <TouchableOpacity onPress={onOpenEQ} style={styles.headerBtn}>
          <Ionicons name="options" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Album Art */}
      <View style={styles.albumSection}>
        <AlbumArt isPlaying={isPlaying} />
      </View>

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {currentTrack?.title ?? 'No Track Selected'}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {currentTrack?.artist ?? 'Unknown Artist'}
        </Text>
        {playbackError && <Text accessibilityRole="alert" style={styles.playbackError}>{playbackError}</Text>}
      </View>

      {/* Waveform */}
      <WaveformVisualizer isPlaying={isPlaying} />

      {/* Progress */}
      <ProgressBar />

      {/* Controls */}
      <Controls />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerBtn: { padding: 8 },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
  },

  albumSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  albumOuter: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumContainer: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: ALBUM_SIZE / 2,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
  },
  album: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: ALBUM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  albumCenter: {
    width: ALBUM_SIZE * 0.28,
    height: ALBUM_SIZE * 0.28,
    borderRadius: ALBUM_SIZE * 0.14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumGlow: {
    position: 'absolute',
    width: ALBUM_SIZE * 0.6,
    height: ALBUM_SIZE * 0.6,
    borderRadius: ALBUM_SIZE * 0.3,
    backgroundColor: Colors.primary,
    opacity: 0.15,
    top: '20%',
    left: '20%',
  },

  trackInfo: {
    paddingHorizontal: 28,
    marginTop: 22,
    marginBottom: 10,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  playbackError: { color: '#FDA4AF', fontSize: 13, marginTop: 8 },

  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 24,
    marginBottom: 12,
    gap: 2,
  },
  waveBar: {
    borderRadius: 4,
  },

  progressArea: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: 2,
    overflow: 'visible',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    marginLeft: -7,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressTime: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  sideBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  playBtnInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOne: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    fontSize: 8,
    fontWeight: '800',
    color: Colors.primary,
  },
});
