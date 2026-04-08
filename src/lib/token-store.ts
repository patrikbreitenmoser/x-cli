import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';

export interface StoredTokens {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp ms
}

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function deleteTokens(): Promise<void> {
  try {
    await unlink(CREDENTIALS_FILE);
  } catch {
    // already gone
  }
}

export function isExpired(tokens: StoredTokens): boolean {
  return Date.now() >= tokens.expiresAt - 60_000; // 1 min buffer
}
