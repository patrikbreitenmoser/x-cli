import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DIST_ENTRY = join(process.cwd(), 'dist', 'index.js');

function runCli(args: string[]): { stdout: string; status: number } {
  const home = mkdtempSync(join(tmpdir(), 'x-cli-test-'));

  try {
    const stdout = execFileSync(process.execPath, [DIST_ENTRY, ...args], {
      env: {
        ...process.env,
        HOME: home,
        X_CLI_DISABLE_AUTO_HOOKS: '1',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, status: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      status: error.status ?? 1,
    };
  }
}

describe('invalid CLI usage', () => {
  it('reports unknown top-level commands as structured usage errors with a hint', () => {
    const result = runCli(['bokmarks']);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /error: "unknown command 'bokmarks'"/);
    assert.match(result.stdout, /code: "UNKNOWN_COMMAND"/);
    assert.match(result.stdout, /Run `x-cli bookmarks`\./);
  });

  it('reports unknown options as structured usage errors with command help hints', () => {
    const result = runCli(['auth', 'login', '--bogus']);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /error: "unknown option '--bogus'/);
    assert.match(result.stdout, /code: "UNKNOWN_OPTION"/);
    assert.match(result.stdout, /Run `x-cli auth login --help` to inspect valid options\./);
  });
});
