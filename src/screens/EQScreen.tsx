import React from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  ScrollView, Platform, type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Path, Line, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { usePlayerStore } from '../store/playerStore';
import { Colors } from '../theme/colors';
import { EQ_PRESETS, EQ_MIN_VALUE, EQ_MAX_VALUE } from '../engine/DSPManager';

const { width } = Dimensions.get('window');
const BAND_W = (width - 48) / 7;

// ─── EQ Band Slider ───────────────────────────────────────────────────────────
function EQBandSlider({
  bandId, label, gain, color, enabled, onGainChange,
}: {
  bandId: number; label: string; gain: number;
  color: string; enabled: boolean;
  onGainChange: (id: number, gain: number) => void;
}) {
  const RANGE = EQ_MAX_VALUE - EQ_MIN_VALUE; // 24
  const TRACK_H = 120;
  // position: 0 = bottom (min), TRACK_H = top (max)
  const yPos = ((EQ_MAX_VALUE - gain) / RANGE) * TRACK_H;
  const updateGain = (event: GestureResponderEvent) => {
    if (!enabled) return;
    const y = Math.max(0, Math.min(TRACK_H, event.nativeEvent.locationY));
    const nextGain = EQ_MAX_VALUE - (y / TRACK_H) * RANGE;
    onGainChange(bandId, Math.round(nextGain * 10) / 10);
  };
  const fillHeight = TRACK_H - yPos;
  const isPositive = gain >= 0;

  return (
    <View style={[styles.bandSlider, !enabled && styles.bandSliderDisabled]}>
      {/* Track */}
      <View
        style={styles.bandTrack}
        onStartShouldSetResponder={() => enabled}
        onMoveShouldSetResponder={() => enabled}
        onResponderGrant={updateGain}
        onResponderMove={updateGain}
      >
        {/* Center line */}
        <View style={styles.bandCenter} />
        {/* Fill */}
        {isPositive ? (
          <View style={[styles.bandFillPositive, {
            bottom: TRACK_H / 2,
            height: fillHeight - TRACK_H / 2,
            backgroundColor: color + 'cc',
          }]} />
        ) : (
          <View style={[styles.bandFillNegative, {
            top: TRACK_H / 2,
            height: TRACK_H / 2 - fillHeight,
            backgroundColor: color + '88',
          }]} />
        )}
        {/* Thumb */}
        <View style={[styles.bandThumb, { top: yPos - 12, backgroundColor: color }]} />
      </View>
      {/* Labels */}
      <Text style={[styles.bandGain, { color }]}>
        {gain > 0 ? '+' : ''}{gain.toFixed(0)}
      </Text>
      <Text style={styles.bandLabel}>{label}</Text>
    </View>
  );
}

// ─── EQ Frequency Response Curve ─────────────────────────────────────────────
function EQCurve({ gains }: { gains: number[] }) {
  const W = width - 48;
  const H = 80;
  const yCenter = H / 2;
  const RANGE = EQ_MAX_VALUE;

  const points = gains.map((g, i) => ({
    x: (i / (gains.length - 1)) * W,
    y: yCenter - (g / RANGE) * yCenter,
  }));

  // Catmull-Rom to cubic bezier path
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const fillPath = d + ` L ${W} ${yCenter} L 0 ${yCenter} Z`;

  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.primary} stopOpacity="0.85" />
          <Stop offset="1" stopColor={Colors.accent} stopOpacity="0.1" />
        </SvgGradient>
      </Defs>
      <Path d={fillPath} fill="url(#eqGrad)" opacity={0.3} />
      <Path d={d} stroke={Colors.primary} strokeWidth={2} fill="none" />
      <Line x1={0} y1={yCenter} x2={W} y2={yCenter}
        stroke={Colors.divider} strokeWidth={1} strokeDasharray="4 4" />
    </Svg>
  );
}

// ─── EQ Screen ───────────────────────────────────────────────────────────────
export default function EQScreen({ onClose }: { onClose: () => void }) {
  const {
    eqBands, eqEnabled, selectedPreset,
    setEQBandGain, setEQEnabled, loadPreset,
    pan, setPan, surroundStrength, setSurroundStrength,
    sleepTimerMs, setSleepTimer,
    ambientVolume, setAmbientVolume, ambientUri, playAmbient, stopAmbient,
  } = usePlayerStore();

  const presetNames = Object.keys(EQ_PRESETS);
  const gains = eqBands.map(b => b.gain);

  const SLEEP_OPTIONS = [
    { label: 'Off', ms: null },
    { label: '5 min', ms: 5 * 60_000 },
    { label: '15 min', ms: 15 * 60_000 },
    { label: '30 min', ms: 30 * 60_000 },
    { label: '1 hr', ms: 60 * 60_000 },
  ];

  const AMBIENT_SOUNDS = [
    { label: 'Rain', uri: 'https://www.soundjay.com/nature/rain-01.mp3' },
    { label: 'Forest', uri: 'https://www.soundjay.com/nature/forest-03.mp3' },
    { label: 'Ocean', uri: 'https://www.soundjay.com/nature/ocean-wave-2.mp3' },
    { label: 'Cafe', uri: 'https://www.soundjay.com/people/crowd-in-room-1.mp3' },
  ];

  return (
    <LinearGradient colors={['#051520', Colors.bg]} style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <Ionicons name="chevron-down" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sound Effects</Text>
        <TouchableOpacity
          onPress={() => setEQEnabled(!eqEnabled)}
          style={[styles.headerBtn, styles.enableBtn, eqEnabled && styles.enableBtnOn]}
        >
          <Text style={[styles.enableText, eqEnabled && styles.enableTextOn]}>
            {eqEnabled ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.engineNotice}>
          Shape the stereo image and room depth while you listen. Spatial surround adds stereo reflections and a soft room tail; it is a speaker-style effect, not personalized binaural headphone audio.
        </Text>

        {/* EQ Curve */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Equalizer</Text>
          <View style={styles.curveContainer}>
            <EQCurve gains={gains} />
          </View>

          {/* Bands */}
          <View style={[styles.bandsRow, !eqEnabled && { opacity: 0.4 }]}>
            {eqBands.map((band, i) => (
              <EQBandSlider
                key={band.id}
                bandId={band.id}
                label={band.label}
                gain={band.gain}
                color={Colors.eqBands[i]}
                enabled={eqEnabled}
                onGainChange={setEQBandGain}
              />
            ))}
          </View>
        </View>

        {/* Presets */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Presets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {presetNames.map(name => (
              <TouchableOpacity
                key={name}
                onPress={() => loadPreset(name)}
                style={[styles.presetChip, selectedPreset === name && styles.presetChipActive]}
              >
                <Text style={[styles.presetText, selectedPreset === name && styles.presetTextActive]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 3D Surround */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.sectionTitle}>3D Surround</Text>
              <Text style={styles.sectionSub}>Stereo room depth · dry signal preserved</Text>
            </View>
            <Text style={[styles.valueLabel, { color: Colors.accent }]}>
              {Math.round(surroundStrength * 100)}%
            </Text>
          </View>
          <SliderRow
            value={surroundStrength} min={0} max={1}
            color={Colors.accent}
            onChange={setSurroundStrength}
          />
        </View>

        {/* Stereo Panner */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.sectionTitle}>Stereo Panner</Text>
              <Text style={styles.sectionSub}>
                {pan < -0.05 ? `← ${Math.abs(Math.round(pan * 100))}% L`
                  : pan > 0.05 ? `${Math.round(pan * 100)}% R →`
                  : 'Center'}
              </Text>
            </View>
          </View>
          <SliderRow
            value={(pan + 1) / 2} min={0} max={1}
            color={Colors.pink}
            onChange={(v) => setPan(v * 2 - 1)}
          />
          <View style={styles.panLabels}>
            <Text style={styles.panLabel}>L</Text>
            <Text style={styles.panLabel}>C</Text>
            <Text style={styles.panLabel}>R</Text>
          </View>
        </View>

        {/* Ambient Sound */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ambient Sound</Text>
          <View style={styles.ambientRow}>
            {AMBIENT_SOUNDS.map(s => (
              <TouchableOpacity
                key={s.label}
                onPress={() => ambientUri === s.uri ? stopAmbient() : playAmbient(s.uri)}
                style={[styles.ambientChip, ambientUri === s.uri && styles.ambientChipActive]}
              >
                <Text style={[styles.ambientText, ambientUri === s.uri && styles.ambientTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {ambientUri && (
            <>
              <Text style={[styles.sectionSub, { marginTop: 12 }]}>Volume</Text>
              <SliderRow
                value={ambientVolume} min={0} max={1}
                color={Colors.green}
                onChange={setAmbientVolume}
              />
            </>
          )}
        </View>

        {/* Sleep Timer */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sleep Timer</Text>
          <View style={styles.sleepRow}>
            {SLEEP_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.label}
                onPress={() => setSleepTimer(o.ms)}
                style={[styles.sleepChip, sleepTimerMs === o.ms && styles.sleepChipActive]}
              >
                <Text style={[styles.sleepText, sleepTimerMs === o.ms && styles.sleepTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

// ─── Simple horizontal slider ─────────────────────────────────────────────────
function SliderRow({
  value, min, max, color, onChange,
}: {
  value: number; min: number; max: number; color: string;
  onChange: (v: number) => void;
}) {
  const W = width - 96;
  const progress = (value - min) / (max - min);

  const updateFromEvent = (event: GestureResponderEvent) => {
    const x = Math.max(0, Math.min(W, event.nativeEvent.locationX));
    onChange(min + (x / W) * (max - min));
  };

  return (
    <View
      style={styles.sliderTrack}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={updateFromEvent}
      onResponderMove={updateFromEvent}
    >
      <LinearGradient
        colors={[color + '80', color]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.sliderFill, { width: `${progress * 100}%` }]}
      />
      <View style={[styles.sliderThumb, { left: `${progress * 100}%`, backgroundColor: color }]} />
    </View>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  enableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.textMuted,
  },
  enableBtnOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
  enableText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  enableTextOn: { color: Colors.primary },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  engineNotice: { color: Colors.amber, fontSize: 12, lineHeight: 18 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.bgGlassBorder,
  },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  sectionSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  curveContainer: { marginVertical: 12, alignItems: 'center' },

  bandsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  bandSlider: { alignItems: 'center', width: BAND_W },
  bandSliderDisabled: { opacity: 0.4 },
  bandTrack: {
    width: 8,
    height: 120,
    backgroundColor: Colors.bgElevated,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  bandCenter: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.divider,
  },
  bandFillPositive: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 4,
  },
  bandFillNegative: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 4,
  },
  bandThumb: {
    position: 'absolute',
    left: -6,
    width: 20,
    height: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  bandGain: { fontSize: 10, fontWeight: '700', marginTop: 8 },
  bandLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  presetChipActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  presetText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  presetTextActive: { color: Colors.primary },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  valueLabel: { fontSize: 18, fontWeight: '800' },

  sliderTrack: {
    height: 6,
    backgroundColor: Colors.bgElevated,
    borderRadius: 3,
    marginTop: 14,
    overflow: 'visible',
  },
  sliderFill: { height: '100%', borderRadius: 3 },
  sliderThumb: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
  },

  panLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  panLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  ambientRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ambientChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  ambientChipActive: { backgroundColor: Colors.green + '22', borderColor: Colors.green },
  ambientText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  ambientTextActive: { color: Colors.green },

  sleepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sleepChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  sleepChipActive: { backgroundColor: Colors.amber + '22', borderColor: Colors.amber },
  sleepText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  sleepTextActive: { color: Colors.amber },
});
