import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

export const HOME_DIR = homedir();
export const CONFIG_DIR = join(homedir(), '.x-cli');
export const CODEX_DIR = join(homedir(), '.codex');
export const CLAUDE_DIR = join(homedir(), '.claude');

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function collapseHomeDir(path: string): string {
  if (path === HOME_DIR) {
    return '~';
  }
  if (path.startsWith(`${HOME_DIR}/`)) {
    return `~${path.slice(HOME_DIR.length)}`;
  }
  return path;
}

export function getExecutablePath(argv1: string | undefined = process.argv[1]): string {
  if (argv1 && argv1.length > 0 && !isTypeScriptEntry(argv1)) {
    return resolve(argv1);
  }
  return resolve(process.cwd(), 'dist/index.js');
}

function isTypeScriptEntry(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}
