import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { TWEET_FIELDS, TWEET_EXPANSIONS, USER_FIELDS, MEDIA_FIELDS } from '../lib/fields.js';
import { mergeIncludes, runCommand } from '../lib/output.js';
import { getLastId, updateLastSynced } from '../lib/sync-state.js';
import { parseRequestedFields, summarizeTweet } from '../lib/presenters.js';
import { runtimeError, usageError } from '../lib/errors.js';

export function makeBookmarksCommand(): Command {
  const bookmarks = new Command('bookmarks')
    .description('Fetch your bookmarked tweets (only new ones since last sync)')
    .option('--limit <number>', 'max bookmarks to fetch', '20')
    .option('--all', 'fetch all bookmarks, ignoring sync state')
    .option('--fields <fields>', 'comma-separated additional fields to include')
    .option('--full', 'include the full default bookmark detail set')
    .action(runCommand(async (options) => {
      const client = await getClient();
      const requestedFields = parseRequestedFields(options.fields, options.full, ['id', 'author', 'created_at', 'text']);
      const parsedLimit = parseInt(options.limit, 10);

      if (!options.all && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        throw usageError('`--limit` must be a positive integer.', {
          code: 'INVALID_LIMIT',
          help: ['Run `x-cli bookmarks --limit 20`.'],
        });
      }

      try {
        const me = await client.v2.me();
        const limit = options.all ? 800 : parsedLimit;
        const perPage = Math.min(limit, 100);

        let lastSeenId: string | null = null;
        if (!options.all) {
          lastSeenId = await getLastId('bookmarks');
        }

        const syncTimestamp = new Date().toISOString();
        const allData: any[] = [];
        let includes: any = {};
        let nextToken: string | undefined;
        let hitOldBookmarks = false;

        while (allData.length < limit && !hitOldBookmarks) {
          const result = await client.v2.bookmarks({
            max_results: Math.min(perPage, limit - allData.length),
            pagination_token: nextToken,
            'tweet.fields': TWEET_FIELDS,
            expansions: TWEET_EXPANSIONS,
            'user.fields': USER_FIELDS,
            'media.fields': MEDIA_FIELDS,
          });

          if (!result.data?.data || result.data.data.length === 0) {
            break;
          }

          for (const tweet of result.data.data) {
            if (lastSeenId && tweet.id === lastSeenId) {
              hitOldBookmarks = true;
              break;
            }
            allData.push(tweet);
          }

          if (result.data.includes) {
            includes = mergeIncludes(includes, result.data.includes as any);
          }

          nextToken = result.data.meta?.next_token;
          if (!nextToken) {
            break;
          }
        }

        const usersById = new Map<string, string>((includes.users ?? []).map((user: any) => [String(user.id), String(user.username)]));
        const items = allData.map((tweet) => summarizeTweet(tweet, {
          requestedFields,
          author: usersById.get(tweet.author_id),
        }));

        if (!options.all && allData.length > 0) {
          await updateLastSynced('bookmarks', syncTimestamp, allData[0].id);
        }

        return {
          user_id: me.data.id,
          count: items.length,
          bookmarks: items,
          sync: {
            mode: options.all ? 'full' : 'incremental',
            previous_last_id: lastSeenId ?? 'none',
            updated_at: !options.all && allData.length > 0 ? syncTimestamp : 'unchanged',
          },
          help: items.length === 0
            ? ['Run `x-cli bookmarks --all` to inspect the full bookmark archive.']
            : ['Run `x-cli bookmarks --all --full` to inspect the full bookmark archive with expanded fields.'],
        };
      } catch (err) {
        throw runtimeError('Failed to fetch bookmarks.', {
          code: 'BOOKMARKS_FETCH_FAILED',
          diagnostic: err instanceof Error ? err.message : String(err),
          help: [
            'Run `x-cli auth status` to confirm your credentials are still valid.',
            'Run `x-cli bookmarks --all` to force a full bookmark sync.',
          ],
        });
      }
    }));
  bookmarks.addHelpText('after', `
Examples:
  $ x-cli bookmarks
  $ x-cli bookmarks --limit 50
  $ x-cli bookmarks --all --full
`);

  return bookmarks;
}
