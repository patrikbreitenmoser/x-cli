import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';

interface SyncEntry {
  lastSyncedAt: string;
}

interface SyncState {
  tweets?: SyncEntry;
  bookmarks?: SyncEntry;
}

const SYNC_STATE_FILE = join(CONFIG_DIR, 'sync-state.json');

async function loadSyncState(): Promise<SyncState> {
  try {
    const raw = await readFile(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

async function saveSyncState(state: SyncState): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

export async function getLastSynced(type: 'tweets' | 'bookmarks'): Promise<string | null> {
  const state = await loadSyncState();
  return state[type]?.lastSyncedAt ?? null;
}

export async function updateLastSynced(type: 'tweets' | 'bookmarks', isoTimestamp: string): Promise<void> {
  const state = await loadSyncState();
  state[type] = { lastSyncedAt: isoTimestamp };
  await saveSyncState(state);
}
