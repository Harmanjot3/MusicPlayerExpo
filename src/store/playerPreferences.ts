import { File, Paths } from 'expo-file-system';

export interface PlayerPreferences {
  volume: number;
  repeat: 'none' | 'one' | 'all';
  shuffle: 'off' | 'on';
  eqEnabled: boolean;
  eqGains: number[];
  selectedPreset: string;
  pan: number;
  surroundStrength: number;
}

const preferencesFile = new File(Paths.document, 'player-preferences.json');

function finiteRange(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function parsePreferences(value: unknown): PlayerPreferences | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const repeat = record.repeat === 'one' || record.repeat === 'all' ? record.repeat : 'none';
  const shuffle = record.shuffle === 'on' ? 'on' : 'off';
  const sourceGains = Array.isArray(record.eqGains) ? record.eqGains : [];
  const gains = Array.from({ length: 7 }, (_, index) => finiteRange(sourceGains[index], -12, 12, 0));
  return {
    volume: finiteRange(record.volume, 0, 1, 1),
    repeat,
    shuffle,
    eqEnabled: typeof record.eqEnabled === 'boolean' ? record.eqEnabled : true,
    eqGains: gains,
    selectedPreset: typeof record.selectedPreset === 'string' ? record.selectedPreset : 'Flat',
    pan: finiteRange(record.pan, -1, 1, 0),
    surroundStrength: finiteRange(record.surroundStrength, 0, 1, 0),
  };
}

export async function loadPlayerPreferences(): Promise<PlayerPreferences | null> {
  if (!preferencesFile.exists) return null;
  try {
    return parsePreferences(JSON.parse(await preferencesFile.text()));
  } catch {
    return null;
  }
}

export async function savePlayerPreferences(preferences: PlayerPreferences) {
  const temporary = new File(Paths.document, `player-preferences-${Date.now()}.tmp`);
  try {
    await temporary.write(JSON.stringify(preferences));
    await temporary.move(preferencesFile, { overwrite: true });
  } catch (error) {
    if (temporary.exists) temporary.delete();
    throw error;
  }
}
