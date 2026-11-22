import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AudioEngine } from '../engine/AudioEngine';
import { usePlayerStore } from '../store/playerStore';
import { Colors } from '../theme/colors';

export default function QueueScreen({ onClose }: { onClose: () => void }) {
  const { currentTrack, playIndex } = usePlayerStore();
  const tracks = AudioEngine.getInstance().getPlaylist();

  return (
    <LinearGradient colors={['#100b20', Colors.bg]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close queue">
          <Ionicons name="chevron-down" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Up Next</Text>
          <Text style={styles.subtitle}>{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</Text>
        </View>
        <View style={styles.closeButton} />
      </View>

      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={42} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Your queue is empty</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={track => track.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const active = item.id === currentTrack?.id;
            return (
              <TouchableOpacity
                style={[styles.row, active && styles.activeRow]}
                onPress={() => { void playIndex(index); onClose(); }}
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title} by ${item.artist}`}
              >
                <Ionicons
                  name={active ? 'volume-high' : 'musical-note'}
                  size={18}
                  color={active ? Colors.accent : Colors.textMuted}
                />
                <View style={styles.trackInfo}>
                  <Text style={[styles.trackTitle, active && styles.activeText]} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                </View>
                {active && <Text style={styles.nowPlaying}>PLAYING</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  closeButton: { width: 42, alignItems: 'flex-start', paddingVertical: 5 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 3, color: Colors.textMuted, fontSize: 12 },
  list: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 30 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  activeRow: { backgroundColor: 'rgba(139,92,246,0.12)' },
  trackInfo: { flex: 1 },
  trackTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  activeText: { color: Colors.accentLight },
  artist: { marginTop: 3, color: Colors.textMuted, fontSize: 12 },
  nowPlaying: { color: Colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
});
