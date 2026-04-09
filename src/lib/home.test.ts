import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHomeHelp, buildHomePayload } from './home.js';

describe('buildHomeHelp', () => {
  it('prioritizes auth guidance when not logged in', () => {
    assert.deepEqual(
      buildHomeHelp({ authStatus: 'not_logged_in', followsCount: 0 }),
      [
        'Set `clientId` in `~/.x-cli/credentials.json`, then run `x-cli auth login`.',
        'Run `x-cli auth status` to inspect stored credentials.',
      ],
    );
  });

  it('suggests follow-list setup for active sessions with no follows', () => {
    assert.deepEqual(
      buildHomeHelp({ authStatus: 'active', followsCount: 0 }),
      [
        'Run `x-cli follows add <username...>` to seed your follow list.',
        'Run `x-cli bookmarks --limit 20` to fetch recent bookmarks.',
      ],
    );
  });
});

describe('buildHomePayload', () => {
  it('builds the compact dashboard payload', () => {
    assert.deepEqual(
      buildHomePayload({
        executablePath: '~/bin/x-cli',
        app: 'cli',
        auth: { status: 'active' },
        followsCount: 2,
        tweetSync: 'never',
        bookmarkSync: '2026-04-09T00:00:00.000Z',
        help: ['Run `x-cli tweets`'],
      }),
      {
        bin: '~/bin/x-cli',
        description: 'Query X users, tweets, bookmarks, and follow-list state with agent-friendly output.',
        app: 'cli',
        auth: { status: 'active' },
        follows: { count: 2 },
        sync: {
          tweets: 'never',
          bookmarks: '2026-04-09T00:00:00.000Z',
        },
        help: ['Run `x-cli tweets`'],
      },
    );
  });
});
