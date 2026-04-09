import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR, ensureConfigDir } from './config.js';

export interface SyncEntry {
  lastSyncedAt: string;
  lastId?: string;
}

export interface SyncState {
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

export async function getSyncState(): Promise<SyncState> {
  return loadSyncState();
}

async function saveSyncState(state: SyncState): Promise<void> {
  await ensureConfigDir();
  await writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export async function getLastSynced(type: 'tweets' | 'bookmarks'): Promise<string | null> {
  const state = await loadSyncState();
  return state[type]?.lastSyncedAt ?? null;
}

export async function updateLastSynced(type: 'tweets' | 'bookmarks', isoTimestamp: string, lastId?: string): Promise<void> {
  const state = await loadSyncState();
  state[type] = { lastSyncedAt: isoTimestamp, ...(lastId ? { lastId } : {}) };
  await saveSyncState(state);
}

export async function getLastId(type: 'tweets' | 'bookmarks'): Promise<string | null> {
  const state = await loadSyncState();
  return state[type]?.lastId ?? null;
}
