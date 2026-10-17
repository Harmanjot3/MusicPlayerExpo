import React, { useEffect, useState } from 'react';
import { StyleSheet, Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LibraryScreen from './src/screens/LibraryScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import EQScreen from './src/screens/EQScreen';
import AudioPlaybackHost from './src/engine/AudioPlaybackHost';
import { usePlayerStore } from './src/store/playerStore';
import { Colors } from './src/theme/colors';

export default function App() {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showEQ, setShowEQ] = useState(false);
  const hydratePreferences = usePlayerStore(state => state.hydratePreferences);

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AudioPlaybackHost />

        {/* Main: Library */}
        <LibraryScreen onOpenPlayer={() => setShowPlayer(true)} />

        {/* Now Playing — slide-up modal */}
        <Modal
          visible={showPlayer}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowPlayer(false)}
        >
          <PlayerScreen
            onClose={() => setShowPlayer(false)}
            onOpenEQ={() => { setShowPlayer(false); setShowEQ(true); }}
          />
        </Modal>

        {/* EQ / Sound Effects — slide-up modal */}
        <Modal
          visible={showEQ}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowEQ(false)}
        >
          <EQScreen onClose={() => { setShowEQ(false); setShowPlayer(true); }} />
        </Modal>

      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
