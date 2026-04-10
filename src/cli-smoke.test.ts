import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DIST_ENTRY = join(process.cwd(), 'dist', 'index.js');

interface RunCliOptions {
  home?: string;
  disableAutoHooks?: boolean;
}

function createHome(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function buildEnv(options: RunCliOptions = {}): NodeJS.ProcessEnv {
  const home = options.home ?? createHome('x-cli-smoke-');
  return {
    ...process.env,
    HOME: home,
    X_CLI_DISABLE_AUTO_HOOKS: options.disableAutoHooks === false ? '0' : '1',
  };
}

function runCliText(args: string[], options: RunCliOptions = {}): { stdout: string; status: number; home: string } {
  const env = buildEnv(options);
  const home = env.HOME!;

  try {
    const stdout = execFileSync(process.execPath, [DIST_ENTRY, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, status: 0, home };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      status: error.status ?? 1,
      home,
    };
  }
}

function runCliJson(args: string[], options: RunCliOptions = {}): { data: any; status: number; home: string } {
  const result = runCliText(['--format', 'json', ...args], options);
  return {
    data: JSON.parse(result.stdout),
    status: result.status,
    home: result.home,
  };
}

describe('CLI endpoint smoke coverage', () => {
  it('serves the root home endpoint', () => {
    const result = runCliJson([]);

    assert.equal(result.status, 0);
    assert.equal(typeof result.data.bin, 'string');
    assert.equal(typeof result.data.description, 'string');
    assert.equal(result.data.auth.status, 'not_logged_in');
    assert.equal(result.data.follows.count, 0);
    assert.equal(result.data.sync.tweets, 'never');
    assert.equal(result.data.sync.bookmarks, 'never');
    assert.equal(Array.isArray(result.data.help), true);
  });

  it('serves the root help endpoint', () => {
    const result = runCliText(['--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: x-cli \[options] \[command\]/);
    assert.match(result.stdout, /Commands:/);
    assert.match(result.stdout, /auth/);
    assert.match(result.stdout, /hooks/);
  });

  it('serves auth status, logout, and login validation endpoints', () => {
    const home = createHome('x-cli-auth-');

    const statusResult = runCliJson(['auth', 'status'], { home });
    assert.equal(statusResult.status, 0);
    assert.equal(statusResult.data.status, 'not_logged_in');

    const logoutResult = runCliJson(['auth', 'logout'], { home });
    assert.equal(logoutResult.status, 0);
    assert.equal(logoutResult.data.status, 'logged_out');

    const loginResult = runCliJson(['auth', 'login'], { home });
    assert.equal(loginResult.status, 2);
    assert.equal(loginResult.data.code, 'CLIENT_ID_REQUIRED');
  });

  it('serves follow-list add, list, and remove endpoints', () => {
    const home = createHome('x-cli-follows-');

    const addResult = runCliJson(['follows', 'add', 'alice', 'bob'], { home });
    assert.equal(addResult.status, 0);
    assert.deepEqual(addResult.data.added, ['alice', 'bob']);
    assert.equal(addResult.data.count, 2);

    const listResult = runCliJson(['follows', 'list'], { home });
    assert.equal(listResult.status, 0);
    assert.equal(listResult.data.count, 2);
    assert.deepEqual(listResult.data.follows, ['alice', 'bob']);

    const removeResult = runCliJson(['follows', 'remove', 'bob'], { home });
    assert.equal(removeResult.status, 0);
    assert.deepEqual(removeResult.data.removed, ['bob']);
    assert.equal(removeResult.data.count, 1);

    const finalList = runCliJson(['follows', 'list'], { home });
    assert.deepEqual(finalList.data.follows, ['alice']);
  });

  it('serves user lookup endpoint with structured auth errors when offline', () => {
    const result = runCliJson(['user', 'elonmusk']);

    assert.equal(result.status, 1);
    assert.equal(result.data.code, 'AUTH_REQUIRED');
    assert.match(result.data.error, /Not logged in/);
  });

  it('serves tweets endpoint with structured auth errors when offline', () => {
    const result = runCliJson(['tweets', 'elonmusk']);

    assert.equal(result.status, 1);
    assert.equal(result.data.code, 'AUTH_REQUIRED');
    assert.match(result.data.error, /Not logged in/);
  });

  it('serves bookmarks endpoint with structured auth errors when offline', () => {
    const result = runCliJson(['bookmarks']);

    assert.equal(result.status, 1);
    assert.equal(result.data.code, 'AUTH_REQUIRED');
    assert.match(result.data.error, /Not logged in/);
  });

  it('serves hooks install, status, emit-session-start, and uninstall endpoints', () => {
    const home = createHome('x-cli-hooks-smoke-');

    const installResult = runCliJson(['hooks', 'install'], { home });
    assert.equal(installResult.status, 0);
    assert.equal(installResult.data.codex.installed, true);
    assert.equal(installResult.data.claude.installed, true);

    const statusAfterInstall = runCliJson(['hooks', 'status'], { home });
    assert.equal(statusAfterInstall.status, 0);
    assert.equal(statusAfterInstall.data.codex.has_session_start_hook, true);
    assert.equal(statusAfterInstall.data.codex.codex_hooks_enabled, true);
    assert.equal(statusAfterInstall.data.claude.has_session_start_hook, true);

    const emitResult = runCliJson(['hooks', 'emit-session-start', '--app', 'codex'], { home });
    assert.equal(emitResult.status, 0);
    assert.equal(emitResult.data.app, 'codex');
    assert.equal(typeof emitResult.data.bin, 'string');

    const uninstallResult = runCliJson(['hooks', 'uninstall'], { home });
    assert.equal(uninstallResult.status, 0);
    assert.equal(uninstallResult.data.codex.installed, false);
    assert.equal(uninstallResult.data.claude.installed, false);

    const statusAfterUninstall = runCliJson(['hooks', 'status'], { home });
    assert.equal(statusAfterUninstall.status, 0);
    assert.equal(statusAfterUninstall.data.codex.has_session_start_hook, false);
    assert.equal(statusAfterUninstall.data.codex.codex_hooks_enabled, false);
    assert.equal(statusAfterUninstall.data.claude.has_session_start_hook, false);

    assert.equal(existsSync(join(home, '.codex', 'hooks.json')), true);
    assert.equal(existsSync(join(home, '.claude', 'settings.json')), true);
  });
});
