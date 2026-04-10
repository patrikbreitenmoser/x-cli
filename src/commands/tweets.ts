import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { TWEET_FIELDS, TWEET_EXPANSIONS, USER_FIELDS, MEDIA_FIELDS } from '../lib/fields.js';
import { mergeIncludes, runCommand } from '../lib/output.js';
import { loadFollows } from '../lib/follows-store.js';
import { getLastSynced, updateLastSynced } from '../lib/sync-state.js';
import { parseRequestedFields, summarizeTweet } from '../lib/presenters.js';
import { CliError, runtimeError, usageError } from '../lib/errors.js';

async function resolveUserIds(
  client: any,
  targets: string[],
): Promise<{ users: Array<{ id: string; username: string }>; missing: string[] }> {
  const ids: Array<{ id: string; username: string }> = [];
  const usernamesToResolve: string[] = [];

  for (const target of targets) {
    if (/^\d+$/.test(target)) {
      ids.push({ id: target, username: target });
    } else {
      usernamesToResolve.push(target);
    }
  }

  if (usernamesToResolve.length === 1) {
    const result = await client.v2.userByUsername(usernamesToResolve[0], { 'user.fields': ['id'] });
    if (result.data) {
      ids.push({ id: result.data.id, username: result.data.username });
      return { users: ids, missing: [] };
    }
    return { users: ids, missing: usernamesToResolve };
  }

  if (usernamesToResolve.length > 1) {
    const result = await client.v2.usersByUsernames(usernamesToResolve, { 'user.fields': ['id'] });
    if (result.data) {
      for (const user of result.data) {
        ids.push({ id: user.id, username: user.username });
      }
    }
    const foundNames = new Set(result.data?.map((user: any) => user.username.toLowerCase()) ?? []);
    const missing = usernamesToResolve.filter((name) => !foundNames.has(name.toLowerCase()));
    return { users: ids, missing };
  }

  return { users: ids, missing: [] };
}

async function fetchUserTweets(
  client: any,
  userId: string,
  options: { limit: number; since?: string; until?: string; exclude?: string[] },
): Promise<{ data: any[]; includes: any }> {
  const allData: any[] = [];
  let includes: any = {};
  let nextToken: string | undefined;

  const params: any = {
    max_results: Math.min(options.limit, 100),
    'tweet.fields': TWEET_FIELDS,
    expansions: TWEET_EXPANSIONS,
    'user.fields': USER_FIELDS,
    'media.fields': MEDIA_FIELDS,
  };

  if (options.since) {
    params.start_time = new Date(options.since).toISOString();
  }
  if (options.until) {
    params.end_time = new Date(options.until).toISOString();
  }
  if (options.exclude && options.exclude.length > 0) {
    params.exclude = options.exclude;
  }

  while (allData.length < options.limit) {
    if (nextToken) {
      params.pagination_token = nextToken;
    }
    params.max_results = Math.min(100, options.limit - allData.length);
    if (params.max_results < 5) {
      params.max_results = 5;
    }

    const result = await client.v2.userTimeline(userId, params);
    if (!result.data?.data || result.data.data.length === 0) {
      break;
    }

    allData.push(...result.data.data);
    if (result.data.includes) {
      includes = mergeIncludes(includes, result.data.includes as any);
    }

    nextToken = result.data.meta?.next_token;
    if (!nextToken) {
      break;
    }
  }

  return {
    data: allData.slice(0, options.limit),
    includes,
  };
}

export function makeTweetsCommand(): Command {
  const tweets = new Command('tweets')
    .description('Fetch tweets for one or more users (uses follow list if no targets given)')
    .argument('[targets...]', 'usernames or user IDs (optional — falls back to follow list)')
    .option('--limit <number>', 'max tweets per user', '20')
    .option('--since <date>', 'tweets since date (YYYY-MM-DD or ISO 8601)')
    .option('--until <date>', 'tweets until date (YYYY-MM-DD or ISO 8601)')
    .option('--no-replies', 'exclude replies')
    .option('--no-retweets', 'exclude retweets')
    .option('--fields <fields>', 'comma-separated additional fields to include')
    .option('--full', 'include the full default tweet detail set')
    .action(runCommand(async (targets: string[], options) => {
      const client = await getClient();
      const limit = parseInt(options.limit, 10);
      const requestedFields = parseRequestedFields(options.fields, options.full, ['id', 'author', 'created_at', 'text']);

      if (!Number.isInteger(limit) || limit <= 0) {
        throw usageError('`--limit` must be a positive integer.', {
          code: 'INVALID_LIMIT',
          help: ['Run `x-cli tweets <username> --limit 20`.'],
        });
      }

      if (options.since && isNaN(Date.parse(options.since))) {
        throw usageError('`--since` must be a valid date.', {
          code: 'INVALID_SINCE_DATE',
          help: ['Run `x-cli tweets <username> --since 2026-01-01`.'],
        });
      }
      if (options.until && isNaN(Date.parse(options.until))) {
        throw usageError('`--until` must be a valid date.', {
          code: 'INVALID_UNTIL_DATE',
          help: ['Run `x-cli tweets <username> --until 2026-01-31`.'],
        });
      }

      let useFollowsList = targets.length === 0;
      if (useFollowsList) {
        const follows = await loadFollows();
        if (follows.length === 0) {
          throw runtimeError('No targets were provided and the follow list is empty.', {
            code: 'EMPTY_FOLLOW_LIST',
            help: [
              'Run `x-cli follows add <username...>` to seed your follow list.',
              'Or run `x-cli tweets <username...>` with explicit targets.',
            ],
          });
        }
        targets = follows;
      }

      let sinceDate = options.since;
      if (useFollowsList && !sinceDate) {
        const lastSynced = await getLastSynced('tweets');
        if (lastSynced) {
          sinceDate = lastSynced;
        }
      }

      const exclude: string[] = [];
      if (options.replies === false) {
        exclude.push('replies');
      }
      if (options.retweets === false) {
        exclude.push('retweets');
      }

      const syncTimestamp = new Date().toISOString();

      try {
        const resolved = await resolveUserIds(client, targets);
        if (resolved.users.length === 0) {
          return {
            count: 0,
            targets: [] as unknown[],
            missing: resolved.missing,
            help: [
              'Run `x-cli tweets <username...>` with existing X handles.',
            ],
          };
        }

        const targetResults: Array<Record<string, unknown>> = [];

        for (const user of resolved.users) {
          const result = await fetchUserTweets(client, user.id, {
            limit,
            since: sinceDate,
            until: options.until,
            exclude,
          });
          const usersById = new Map<string, string>((result.includes.users ?? []).map((entry: any) => [String(entry.id), String(entry.username)]));
          const items = result.data.map((tweet) => summarizeTweet(tweet, {
            requestedFields,
            author: usersById.get(tweet.author_id) ?? user.username,
          }));

          targetResults.push({
            user: user.username,
            user_id: user.id,
            count: items.length,
            tweets: items,
          });
        }

        if (useFollowsList) {
          await updateLastSynced('tweets', syncTimestamp);
        }

        if (targetResults.length === 1) {
          return {
            user: targetResults[0].user,
            user_id: targetResults[0].user_id,
            count: targetResults[0].count,
            tweets: targetResults[0].tweets,
            ...(resolved.missing.length > 0 ? { missing: resolved.missing } : {}),
            sync: {
              source: useFollowsList ? 'follow_list' : 'explicit_targets',
              since: sinceDate ?? 'none',
              until: options.until ?? 'none',
              updated_at: useFollowsList ? syncTimestamp : 'unchanged',
            },
          };
        }

        return {
          count: targetResults.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0),
          targets: targetResults,
          ...(resolved.missing.length > 0 ? { missing: resolved.missing } : {}),
          sync: {
            source: useFollowsList ? 'follow_list' : 'explicit_targets',
            since: sinceDate ?? 'none',
            until: options.until ?? 'none',
            updated_at: useFollowsList ? syncTimestamp : 'unchanged',
          },
          help: targetResults.length > 0
            ? ['Run `x-cli tweets <username> --full` to inspect expanded tweet details for a single target.']
            : ['Run `x-cli follows add <username...>` to seed the follow list used by bare `x-cli tweets`.'],
        };
      } catch (err) {
        if (err instanceof CliError) {
          throw err;
        }
        throw runtimeError('Failed to fetch tweets.', {
          code: 'TWEETS_FETCH_FAILED',
          diagnostic: err instanceof Error ? err.message : String(err),
          help: [
            'Run `x-cli auth status` to confirm your credentials are still valid.',
            'Run `x-cli tweets <username> --limit 20` with existing X handles.',
          ],
        });
      }
    }));
  tweets.addHelpText('after', `
Examples:
  $ x-cli tweets elonmusk --limit 10
  $ x-cli tweets alice bob --since 2026-01-01
  $ x-cli tweets --no-replies --no-retweets
`);

  return tweets;
}
