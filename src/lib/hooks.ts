import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CLAUDE_DIR, CODEX_DIR, getExecutablePath } from './config.js';
import { runtimeError } from './errors.js';

export type ManagedApp = 'codex' | 'claude';

interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
  statusMessage?: string;
  once?: boolean;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

interface HooksFile {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

export interface HookInstallStatus {
  app: ManagedApp;
  config_path: string;
  installed: boolean;
  updated: boolean;
}

export async function ensureManagedHooksInstalled(executablePath: string = getExecutablePath()): Promise<{
  codex: HookInstallStatus;
  claude: HookInstallStatus;
}> {
  const [codex, claude] = await Promise.all([
    installCodexHooks(executablePath),
    installClaudeHooks(executablePath),
  ]);

  return { codex, claude };
}

export async function getManagedHookStatus(executablePath: string = getExecutablePath()): Promise<Record<string, unknown>> {
  const codexPath = join(CODEX_DIR, 'hooks.json');
  const claudePath = join(CLAUDE_DIR, 'settings.json');

  const [codexHooks, claudeSettings, codexConfigToml] = await Promise.all([
    readJsonFile<HooksFile>(codexPath, {}),
    readJsonFile<Record<string, unknown>>(claudePath, {}),
    readTextFile(join(CODEX_DIR, 'config.toml')),
  ]);

  return {
    executable: executablePath,
    codex: {
      config_path: codexPath,
      has_session_start_hook: hasManagedHook(codexHooks.hooks?.SessionStart, 'codex'),
      codex_hooks_enabled: /^\s*codex_hooks\s*=\s*true\s*$/m.test(codexConfigToml),
    },
    claude: {
      config_path: claudePath,
      has_session_start_hook: hasManagedHook(readHooksArray(claudeSettings, 'SessionStart'), 'claude'),
    },
  };
}

async function installCodexHooks(executablePath: string): Promise<HookInstallStatus> {
  const hooksPath = join(CODEX_DIR, 'hooks.json');
  const configPath = join(CODEX_DIR, 'config.toml');

  const hooksFile = await readJsonFile<HooksFile>(hooksPath, {});
  const original = JSON.stringify(hooksFile);
  hooksFile.hooks = hooksFile.hooks ?? {};
  hooksFile.hooks.SessionStart = upsertSessionStartHook(hooksFile.hooks.SessionStart ?? [], 'codex', executablePath);
  await writeJsonIfChanged(hooksPath, hooksFile, original);

  const configText = await readTextFile(configPath);
  const nextConfig = enableCodexHooks(configText);
  if (nextConfig !== configText) {
    await writeText(configPath, nextConfig);
  }

  return {
    app: 'codex',
    config_path: hooksPath,
    installed: true,
    updated: JSON.stringify(hooksFile) !== original || nextConfig !== configText,
  };
}

async function installClaudeHooks(executablePath: string): Promise<HookInstallStatus> {
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  const settings = await readJsonFile<Record<string, unknown>>(settingsPath, {});
  const original = JSON.stringify(settings);
  const hooks = isRecord(settings.hooks) ? settings.hooks as Record<string, unknown> : {};

  hooks.SessionStart = upsertSessionStartHook(readHooksArray({ hooks }, 'SessionStart'), 'claude', executablePath);
  settings.hooks = hooks;

  await writeJsonIfChanged(settingsPath, settings, original);

  return {
    app: 'claude',
    config_path: settingsPath,
    installed: true,
    updated: JSON.stringify(settings) !== original,
  };
}

function upsertSessionStartHook(
  existingHooks: HookMatcher[],
  app: ManagedApp,
  executablePath: string,
): HookMatcher[] {
  const filtered = existingHooks.filter((entry) => !hasManagedHook([entry], app));
  const managed = buildManagedSessionStartHook(app, executablePath);
  return [...filtered, managed];
}

function buildManagedSessionStartHook(app: ManagedApp, executablePath: string): HookMatcher {
  const command = `node "${executablePath}" hooks emit-session-start --app ${app}`;
  const hook: HookCommand = {
    type: 'command',
    command,
    timeout: 10,
    ...(app === 'codex' ? { statusMessage: 'Loading x-cli session context' } : {}),
    ...(app === 'claude' ? { once: true } : {}),
  };

  return {
    ...(app === 'codex' ? { matcher: 'startup|resume' } : {}),
    hooks: [hook],
  };
}

function hasManagedHook(entries: HookMatcher[] | undefined, app: ManagedApp): boolean {
  if (!entries) {
    return false;
  }

  return entries.some((entry) =>
    entry.hooks.some((hook) => hook.command.includes('hooks emit-session-start') && hook.command.includes(`--app ${app}`)),
  );
}

function readHooksArray(settings: Record<string, unknown>, eventName: string): HookMatcher[] {
  const hooks = settings.hooks;
  if (!isRecord(hooks)) {
    return [];
  }
  const eventValue = hooks[eventName];
  if (!Array.isArray(eventValue)) {
    return [];
  }
  return eventValue.filter(isHookMatcher);
}

function isHookMatcher(value: unknown): value is HookMatcher {
  return isRecord(value) && Array.isArray(value.hooks) && value.hooks.every(isHookCommand);
}

function isHookCommand(value: unknown): value is HookCommand {
  return isRecord(value) && value.type === 'command' && typeof value.command === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function enableCodexHooks(configText: string): string {
  if (/^\s*codex_hooks\s*=\s*true\s*$/m.test(configText)) {
    return configText;
  }

  if (/^\s*codex_hooks\s*=\s*false\s*$/m.test(configText)) {
    const replaced = configText.replace(/^\s*codex_hooks\s*=\s*false\s*$/m, 'codex_hooks = true');
    return replaced.endsWith('\n') ? replaced : `${replaced}\n`;
  }

  const featuresMatch = configText.match(/^\[features\]\s*$/m);
  if (featuresMatch?.index !== undefined) {
    const insertAt = featuresMatch.index + featuresMatch[0].length;
    return `${configText.slice(0, insertAt)}\ncodex_hooks = true${configText.slice(insertAt)}`;
  }

  const trimmed = configText.trimEnd();
  return `${trimmed.length > 0 ? `${trimmed}\n\n` : ''}[features]\ncodex_hooks = true\n`;
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

async function writeJsonIfChanged(path: string, value: unknown, previousSerialized: string): Promise<void> {
  const nextSerialized = JSON.stringify(value);
  if (nextSerialized === previousSerialized) {
    return;
  }
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path: string, value: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value, 'utf-8');
  } catch (error) {
    throw runtimeError(`Failed to write hook config: ${path}`, {
      code: 'HOOK_WRITE_FAILED',
      cause: error,
    });
  }
}
