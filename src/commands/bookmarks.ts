import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { TWEET_FIELDS, TWEET_EXPANSIONS, USER_FIELDS, MEDIA_FIELDS } from '../lib/fields.js';
import { mergeIncludes, printJson } from '../lib/output.js';
import { getLastSynced, updateLastSynced } from '../lib/sync-state.js';

export function makeBookmarksCommand(): Command {
  const bookmarks = new Command('bookmarks')
    .description('Fetch your bookmarked tweets (only new ones since last sync)')
    .option('--limit <number>', 'max bookmarks to fetch', '20')
    .option('--all', 'fetch all bookmarks, ignoring sync state')
    .action(async (options) => {
      const client = await getClient();

      try {
        const me = await client.v2.me();
        const userId = me.data.id;

        const limit = options.all ? 800 : parseInt(options.limit, 10);
        const perPage = Math.min(limit, 100);

        // Load sync cutoff (skip if --all)
        let syncCutoff: Date | null = null;
        if (!options.all) {
          const lastSynced = await getLastSynced('bookmarks');
          if (lastSynced) {
            syncCutoff = new Date(lastSynced);
            console.error(`Fetching bookmarks since last sync: ${lastSynced}`);
          }
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

          // Filter out tweets older than sync cutoff
          for (const tweet of result.data.data) {
            if (syncCutoff && tweet.created_at) {
              const tweetDate = new Date(tweet.created_at);
              if (tweetDate <= syncCutoff) {
                hitOldBookmarks = true;
                break;
              }
            }
            allData.push(tweet);
          }

          if (result.data.includes) {
            includes = mergeIncludes(includes, result.data.includes as any);
          }

          nextToken = result.data.meta?.next_token;
          if (!nextToken) break;
        }

        printJson({
          data: allData,
          includes,
          meta: { result_count: allData.length },
        });

        // Update sync state (skip when --all to preserve incremental cursor)
        if (!options.all) {
          await updateLastSynced('bookmarks', syncTimestamp);
          console.error(`Sync state updated: ${syncTimestamp}`);
        }
      } catch (err: any) {
        console.error(`Error fetching bookmarks: ${err.message}`);
        process.exit(1);
      }
    });

  return bookmarks;
}
