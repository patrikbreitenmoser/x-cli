import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR, ensureConfigDir } from './config.js';

const FOLLOWS_FILE = join(CONFIG_DIR, 'follows.json');

export interface FollowsMutationResult {
  changed: string[];
  unchanged: string[];
  follows: string[];
}

export async function loadFollows(): Promise<string[]> {
  try {
    const raw = await readFile(FOLLOWS_FILE, 'utf-8');
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveFollows(follows: string[]): Promise<void> {
  await ensureConfigDir();
  await writeFile(FOLLOWS_FILE, JSON.stringify(follows, null, 2), { mode: 0o600 });
}

export async function addFollows(usernames: string[]): Promise<FollowsMutationResult> {
  const existing = await loadFollows();
  const existingSet = new Set(existing);
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const raw of usernames) {
    const lower = raw.replace(/^@/, '').toLowerCase();
    if (!existingSet.has(lower)) {
      existingSet.add(lower);
      existing.push(lower);
      changed.push(lower);
    } else {
      unchanged.push(lower);
    }
  }

  await saveFollows(existing);
  return { changed, unchanged, follows: existing };
}

export async function removeFollows(usernames: string[]): Promise<FollowsMutationResult> {
  const existing = await loadFollows();
  const toRemove = new Set(usernames.map(n => n.replace(/^@/, '').toLowerCase()));
  const filtered = existing.filter(n => !toRemove.has(n));
  const changed = existing.filter(n => toRemove.has(n));
  const unchanged = [...toRemove].filter(n => !existing.includes(n));

  await saveFollows(filtered);
  return { changed, unchanged, follows: filtered };
}
