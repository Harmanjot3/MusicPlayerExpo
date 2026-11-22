import { File, Paths } from 'expo-file-system';

export interface PlayerPreferences {
  volume: number;
  repeat: 'none' | 'one' | 'all';
  shuffle: 'off' | 'on';
  eqEnabled: boolean;
  eqGains: number[];
  selectedPreset: string;
  pan: number;
  masterGainDb: number;
  bassBoostDb: number;
  trebleBoostDb: number;
  virtual3dEnabled: boolean;
  virtual3dGapMs: number;
  surround71Enabled: boolean;
  surround71Level: number;
  surround71Spread: number;
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
  const gains = Array.from({ length: 10 }, (_, index) => finiteRange(sourceGains[index], -20, 20, 0));
  const oldMode = record.surroundMode;
  const oldStrength = finiteRange(record.surroundStrength, 0, 1, 0.22 / 0.45);
  const oldSpread = finiteRange(record.surroundSpread, 0, 1, 0.7);
  return {
    volume: finiteRange(record.volume, 0, 1, 1),
    repeat,
    shuffle,
    eqEnabled: typeof record.eqEnabled === 'boolean' ? record.eqEnabled : true,
    eqGains: gains,
    selectedPreset: typeof record.selectedPreset === 'string' ? record.selectedPreset : 'Flat 3D',
    pan: finiteRange(record.pan, -1, 1, 0),
    masterGainDb: finiteRange(record.masterGainDb, -20, 20, 0),
    bassBoostDb: finiteRange(record.bassBoostDb, 0, 30, 0),
    trebleBoostDb: finiteRange(record.trebleBoostDb, 0, 30, 0),
    virtual3dEnabled: typeof record.virtual3dEnabled === 'boolean' ? record.virtual3dEnabled : oldMode === 'virtual3d',
    virtual3dGapMs: finiteRange(record.virtual3dGapMs, 1, 40, 30),
    surround71Enabled: typeof record.surround71Enabled === 'boolean' ? record.surround71Enabled : oldMode === 'surround71',
    surround71Level: finiteRange(record.surround71Level, 0.15, 0.45, 0.15 + oldStrength * 0.3),
    surround71Spread: finiteRange(record.surround71Spread, 0.05, 0.7, 0.05 + oldSpread * 0.65),
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
