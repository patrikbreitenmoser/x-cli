import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

export const CONFIG_DIR = join(homedir(), '.x-cli');

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}
