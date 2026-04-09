import { collapseHomeDir, getExecutablePath } from './config.js';
import { loadFollows } from './follows-store.js';
import { getSyncState } from './sync-state.js';
import { isExpired, loadTokens } from './token-store.js';

interface HomeOutputOptions {
  executablePath?: string;
  app?: 'cli' | 'codex' | 'claude';
}

export async function buildHomeOutput(options: HomeOutputOptions = {}): Promise<Record<string, unknown>> {
  const executablePath = collapseHomeDir(options.executablePath ?? getExecutablePath());
  const [tokens, follows, syncState] = await Promise.all([
    loadTokens(),
    loadFollows(),
    getSyncState(),
  ]);

  const auth = tokens
    ? {
        status: isExpired(tokens) ? 'expired' : 'active',
        expires_at: new Date(tokens.expiresAt).toISOString(),
        has_refresh_token: Boolean(tokens.refreshToken),
      }
    : {
        status: 'not_logged_in',
      };

  const help = buildHomeHelp({
    authStatus: String(auth.status),
    followsCount: follows.length,
  });

  return buildHomePayload({
    executablePath,
    app: options.app ?? 'cli',
    auth,
    followsCount: follows.length,
    tweetSync: syncState.tweets?.lastSyncedAt ?? 'never',
    bookmarkSync: syncState.bookmarks?.lastSyncedAt ?? 'never',
    help,
  });
}

export function buildHomePayload(input: {
  executablePath: string;
  app: 'cli' | 'codex' | 'claude';
  auth: Record<string, unknown>;
  followsCount: number;
  tweetSync: string;
  bookmarkSync: string;
  help: string[];
}): Record<string, unknown> {
  return {
    bin: input.executablePath,
    description: 'Query X users, tweets, bookmarks, and follow-list state with agent-friendly output.',
    app: input.app,
    auth: input.auth,
    follows: {
      count: input.followsCount,
    },
    sync: {
      tweets: input.tweetSync,
      bookmarks: input.bookmarkSync,
    },
    ...(input.help.length > 0 ? { help: input.help } : {}),
  };
}

export function buildHomeHelp(input: { authStatus: string; followsCount: number }): string[] {
  if (input.authStatus !== 'active') {
    return [
      'Set `clientId` in `~/.x-cli/credentials.json`, then run `x-cli auth login`.',
      'Run `x-cli auth status` to inspect stored credentials.',
    ];
  }

  if (input.followsCount === 0) {
    return [
      'Run `x-cli follows add <username...>` to seed your follow list.',
      'Run `x-cli bookmarks --limit 20` to fetch recent bookmarks.',
    ];
  }

  return [
    'Run `x-cli tweets` to fetch new tweets for the current follow list.',
    'Run `x-cli follows list` to inspect tracked accounts.',
    'Run `x-cli bookmarks --limit 20` to sync recent bookmarks.',
  ];
}
