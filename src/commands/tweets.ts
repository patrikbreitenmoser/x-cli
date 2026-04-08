import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { TWEET_FIELDS, TWEET_EXPANSIONS, USER_FIELDS, MEDIA_FIELDS } from '../lib/fields.js';
import { mergeIncludes, printJson } from '../lib/output.js';
import { loadFollows } from '../lib/follows-store.js';
import { getLastSynced, updateLastSynced } from '../lib/sync-state.js';

async function resolveUserId(client: any, target: string): Promise<{ id: string; username: string }> {
  if (/^\d+$/.test(target)) {
    return { id: target, username: target };
  }

  const result = await client.v2.userByUsername(target, { 'user.fields': ['id'] });
  if (!result.data) {
    throw new Error(`User not found: ${target}`);
  }
  return { id: result.data.id, username: result.data.username };
}

async function resolveUserIds(client: any, targets: string[]): Promise<Array<{ id: string; username: string }>> {
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
    const resolved = await resolveUserId(client, usernamesToResolve[0]);
    ids.push(resolved);
  } else if (usernamesToResolve.length > 1) {
    const result = await client.v2.usersByUsernames(usernamesToResolve, { 'user.fields': ['id'] });
    if (result.data) {
      for (const user of result.data) {
        ids.push({ id: user.id, username: user.username });
      }
    }
    const foundNames = new Set(result.data?.map((u: any) => u.username.toLowerCase()) ?? []);
    for (const name of usernamesToResolve) {
      if (!foundNames.has(name.toLowerCase())) {
        console.error(`Warning: User not found: ${name}`);
      }
    }
  }

  return ids;
}

async function fetchUserTweets(
  client: any,
  userId: string,
  options: { limit: number; since?: string; until?: string; exclude?: string[] }
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
    if (params.max_results < 5) params.max_results = 5;

    const result = await client.v2.userTimeline(userId, params);

    if (!result.data?.data || result.data.data.length === 0) {
      break;
    }

    allData.push(...result.data.data);

    if (result.data.includes) {
      includes = mergeIncludes(includes, result.data.includes as any);
    }

    nextToken = result.data.meta?.next_token;
    if (!nextToken) break;
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
    .action(async (targets: string[], options) => {
      const client = await getClient();
      const limit = parseInt(options.limit, 10);

      // Determine if we're using the follows list
      let useFollowsList = targets.length === 0;
      if (useFollowsList) {
        const follows = await loadFollows();
        if (follows.length === 0) {
          console.error('Error: No targets given and follow list is empty.');
          console.error('Add accounts with: x-cli follows add <usernames...>');
          process.exit(1);
        }
        targets = follows;
        console.error(`Using follow list: ${follows.join(', ')}`);
      }

      // Validate dates
      if (options.since && isNaN(Date.parse(options.since))) {
        console.error(`Error: Invalid date for --since: ${options.since}`);
        process.exit(1);
      }
      if (options.until && isNaN(Date.parse(options.until))) {
        console.error(`Error: Invalid date for --until: ${options.until}`);
        process.exit(1);
      }

      // For follows list: use sync state as --since default
      let sinceDate = options.since;
      if (useFollowsList && !sinceDate) {
        const lastSynced = await getLastSynced('tweets');
        if (lastSynced) {
          sinceDate = lastSynced;
          console.error(`Fetching tweets since last sync: ${lastSynced}`);
        }
      }

      const exclude: string[] = [];
      if (options.replies === false) exclude.push('replies');
      if (options.retweets === false) exclude.push('retweets');

      // Record sync time before fetching
      const syncTimestamp = new Date().toISOString();

      try {
        const users = await resolveUserIds(client, targets);

        if (users.length === 0) {
          console.error('Error: No valid users found.');
          process.exit(1);
        }

        if (users.length === 1) {
          const result = await fetchUserTweets(client, users[0].id, {
            limit,
            since: sinceDate,
            until: options.until,
            exclude,
          });

          printJson({
            user: users[0].username,
            ...result,
            meta: { result_count: result.data.length },
          });
        } else {
          const results: Record<string, any> = {};

          for (const user of users) {
            console.error(`Fetching tweets for @${user.username} ...`);
            const result = await fetchUserTweets(client, user.id, {
              limit,
              since: sinceDate,
              until: options.until,
              exclude,
            });

            results[user.username] = {
              userId: user.id,
              ...result,
              meta: { result_count: result.data.length },
            };
          }

          printJson(results);
        }

        // Update sync state after successful fetch
        if (useFollowsList) {
          await updateLastSynced('tweets', syncTimestamp);
          console.error(`Sync state updated: ${syncTimestamp}`);
        }
      } catch (err: any) {
        console.error(`Error fetching tweets: ${err.message}`);
        process.exit(1);
      }
    });

  return tweets;
}
