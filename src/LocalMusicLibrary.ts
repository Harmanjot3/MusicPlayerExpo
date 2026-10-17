import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import type { TrackInfo } from './engine/AudioEngine';

const musicDirectory = new Directory(Paths.document, 'Music');
const libraryIndex = new File(Paths.document, 'music-library.json');
let indexWriteQueue = Promise.resolve();

function withIndexLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = indexWriteQueue.then(operation);
  indexWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

function ensureMusicDirectory() {
  musicDirectory.create({ intermediates: true, idempotent: true });
}

function isTrack(value: unknown): value is TrackInfo {
  if (typeof value !== 'object' || value === null) return false;
  const track = value as Partial<TrackInfo>;
  return typeof track.id === 'string'
    && typeof track.uri === 'string'
    && typeof track.title === 'string'
    && typeof track.artist === 'string'
    && typeof track.album === 'string'
    && typeof track.duration === 'number';
}

export async function loadLocalTracks(): Promise<TrackInfo[]> {
  ensureMusicDirectory();
  if (!libraryIndex.exists) return [];

  const parsed: unknown = JSON.parse(await libraryIndex.text());
  if (!Array.isArray(parsed) || !parsed.every(isTrack)) {
    throw new Error('The saved music library index is invalid. Your saved files were left untouched.');
  }
  return parsed.filter(track => new File(track.uri).exists);
}

async function readSavedIndex(fallback: TrackInfo[]): Promise<TrackInfo[]> {
  if (!libraryIndex.exists) return fallback;
  const parsed: unknown = JSON.parse(await libraryIndex.text());
  if (!Array.isArray(parsed) || !parsed.every(isTrack)) {
    throw new Error('The saved music library index is invalid. Your saved files were left untouched.');
  }
  return parsed;
}

async function writeSavedIndex(tracks: TrackInfo[]) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temporary = new File(Paths.document, `music-library-${suffix}.tmp`);
  try {
    await temporary.write(JSON.stringify(tracks));
    await temporary.move(libraryIndex, { overwrite: true });
  } catch (error) {
    if (temporary.exists) temporary.delete();
    throw error;
  }
}

export async function updateTrackDuration(trackId: string, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  await withIndexLock(async () => {
    const tracks = await readSavedIndex([]);
    const index = tracks.findIndex(track => track.id === trackId);
    if (index < 0 || tracks[index].duration > 0) return;
    const updated = [...tracks];
    updated[index] = { ...updated[index], duration: durationMs };
    await writeSavedIndex(updated);
  });
}

export async function importAudioFiles(existing: TrackInfo[]): Promise<TrackInfo[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  ensureMusicDirectory();
  const added: TrackInfo[] = [];
  const copiedFiles: File[] = [];
  try {
    for (const [index, asset] of result.assets.entries()) {
      const source = new File(asset.uri);
      if (!source.exists) continue;

      const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const extension = asset.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
      const destination = new File(musicDirectory, `${id}${extension}`);
      await source.copy(destination);
      copiedFiles.push(destination);

      const baseName = asset.name.replace(/\.[^.]+$/, '');
      const [first, ...rest] = baseName.split(' - ');
      const hasArtist = rest.length > 0;
      added.push({
        id,
        uri: destination.uri,
        title: hasArtist ? rest.join(' - ').trim() : baseName || asset.name,
        artist: hasArtist ? first.trim() || 'Unknown Artist' : 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
      });
    }

    return await withIndexLock(async () => {
      const latestTracks = await readSavedIndex(existing);
      const mergedTracks = [...latestTracks, ...added];
      await writeSavedIndex(mergedTracks);
      return mergedTracks;
    });
  } catch (error) {
    for (const file of copiedFiles) {
      if (file.exists) file.delete();
    }
    throw error;
  }
}
