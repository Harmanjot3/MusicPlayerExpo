import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, TextInput, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors } from '../theme/colors';
import type { TrackInfo } from '../engine/AudioEngine';
import { usePlayerStore } from '../store/playerStore';
import { Ionicons } from '@expo/vector-icons';
import { importAudioFiles, loadLocalTracks, updateTrackDuration } from '../LocalMusicLibrary';

function msToTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Mini Player Bar ─────────────────────────────────────────────────────────
export function MiniPlayer({ onPress }: { onPress: () => void }) {
  const { currentTrack, state, togglePlayPause, next } = usePlayerStore();
  if (!currentTrack) return null;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.miniPlayer}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(139,92,246,0.3)', 'rgba(6,182,212,0.15)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />
      <View style={styles.miniLeft}>
        <View style={styles.miniAlbumArt}>
          <Ionicons name="musical-notes" size={20} color={Colors.primary} />
        </View>
        <View style={styles.miniInfo}>
          <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
        </View>
      </View>
      <View style={styles.miniControls}>
        <TouchableOpacity onPress={togglePlayPause} style={styles.miniBtn}>
          <Ionicons name={state === 'playing' ? 'pause' : 'play'} size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={next} style={styles.miniBtn}>
          <Ionicons name="play-skip-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Library Screen ──────────────────────────────────────────────────────────
export default function LibraryScreen({ onOpenPlayer }: { onOpenPlayer: () => void }) {
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [libraryReady, setLibraryReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const { setPlaylist, currentTrack, durationMs, state } = usePlayerStore();

  useEffect(() => {
    let mounted = true;
    loadLocalTracks()
      .then(savedTracks => {
        if (mounted) {
          setTracks(savedTracks);
          setLibraryReady(true);
        }
      })
      .catch(error => {
        if (mounted) setLibraryError(error instanceof Error ? error.message : 'Could not load saved music.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!currentTrack || durationMs <= 0) return;
    const libraryTrack = tracks.find(track => track.id === currentTrack.id);
    if (!libraryTrack || libraryTrack.duration > 0) return;
    void updateTrackDuration(currentTrack.id, durationMs).catch(error => {
      setLibraryError(error instanceof Error ? error.message : 'Could not save the track duration.');
    });
  }, [currentTrack, durationMs, tracks]);

  const addMusic = useCallback(async () => {
    if (!libraryReady) return;
    setImporting(true);
    setLibraryError(null);
    try {
      const imported = await importAudioFiles(tracks);
      if (imported) setTracks(imported);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Could not import the selected audio files.');
    } finally {
      setImporting(false);
    }
  }, [libraryReady, tracks]);

  const displayTracks = tracks.map(track => track.id === currentTrack?.id && track.duration <= 0 && durationMs > 0
    ? { ...track, duration: durationMs }
    : track);

  const filtered = query.trim()
    ? displayTracks.filter(track => {
        const q = query.trim().toLocaleLowerCase();
        return track.title.toLocaleLowerCase().includes(q)
          || track.artist.toLocaleLowerCase().includes(q)
          || track.album.toLocaleLowerCase().includes(q);
      })
    : displayTracks;

  const play = useCallback(async (index: number) => {
    await setPlaylist(filtered, index);
    onOpenPlayer();
  }, [filtered, onOpenPlayer, setPlaylist]);

  return (
    <LinearGradient colors={['#0d0d1a', Colors.bg]} style={styles.screen}>
      <View style={styles.libraryHeader}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.libraryTitle}>Music Library</Text>
          <Text style={styles.libraryCount}>{tracks.length} songs</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Import audio files"
          disabled={importing || !libraryReady}
          onPress={addMusic}
          style={[styles.importButton, importing && styles.importButtonDisabled]}
        >
          <Ionicons name="add" size={22} color={Colors.textPrimary} />
          <Text style={styles.importButtonText}>{importing ? 'Importing' : 'Add music'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs, artists..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {libraryError && <Text accessibilityRole="alert" style={styles.errorText}>{libraryError}</Text>}
      {loading ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes" size={48} color={Colors.primary} />
          <Text style={styles.emptyText}>Loading your music…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={tracks.length === 0 ? 'musical-notes' : 'sad-outline'} size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{tracks.length === 0 ? 'Add songs from Files to get started' : 'No songs match your search'}</Text>
          {tracks.length === 0 && (
            <TouchableOpacity onPress={addMusic} disabled={importing || !libraryReady} style={styles.emptyImportButton}>
              <Text style={styles.emptyImportText}>{importing ? 'Importing…' : 'Choose audio files'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              index={index}
              isActive={currentTrack?.id === item.id}
              isPlaying={currentTrack?.id === item.id && state === 'playing'}
              onPress={() => play(index)}
            />
          )}
        />
      )}

      <MiniPlayer onPress={onOpenPlayer} />
    </LinearGradient>
  );
}

// ─── Track Row ────────────────────────────────────────────────────────────────
function TrackRow({
  track, index, isActive, isPlaying, onPress
}: {
  track: TrackInfo; index: number;
  isActive: boolean; isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.trackRow, isActive && styles.trackRowActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.trackIndex, isActive && { backgroundColor: Colors.primary + '33' }]}>
        {isPlaying
          ? <Ionicons name="musical-note" size={14} color={Colors.primary} />
          : <Text style={[styles.trackIndexText, isActive && { color: Colors.primary }]}>
              {index + 1}
            </Text>
        }
      </View>
      <View style={styles.trackMeta}>
        <Text
          style={[styles.trackTitle, isActive && { color: Colors.primaryLight }]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
      <Text style={styles.trackDuration}>{msToTime(track.duration)}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  libraryHeader: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: { flex: 1 },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: Colors.primaryDark,
  },
  importButtonDisabled: { opacity: 0.6 },
  importButtonText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  emptyImportButton: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.primaryDark },
  emptyImportText: { color: Colors.textPrimary, fontWeight: '700' },
  errorText: { color: '#FDA4AF', marginHorizontal: 24, marginBottom: 8 },
  libraryTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  libraryCount: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgGlass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgGlassBorder,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  trackRowActive: {
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  trackIndex: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    marginRight: 14,
  },
  trackIndexText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  trackMeta: { flex: 1 },
  trackTitle: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  trackArtist: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trackDuration: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 16,
  },

  // Mini Player
  miniPlayer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 85 : 60,
    left: 16,
    right: 16,
    height: 68,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.bgGlassBorder,
  },
  miniLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  miniAlbumArt: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  miniInfo: { flex: 1 },
  miniTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  miniArtist: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  miniControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBtn: { padding: 8 },
});
