import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { USER_FIELDS } from '../lib/fields.js';
import { runCommand } from '../lib/output.js';
import { parseRequestedFields, summarizeUser } from '../lib/presenters.js';
import { runtimeError } from '../lib/errors.js';

export function makeUserCommand(): Command {
  const user = new Command('user')
    .description('Look up one or more users by username')
    .argument('<usernames...>', 'one or more X usernames')
    .option('--fields <fields>', 'comma-separated additional fields to include')
    .option('--full', 'include the full default user detail set')
    .action(runCommand(async (usernames: string[], options) => {
      const client = await getClient();
      const requestedFields = parseRequestedFields(options.fields, options.full, ['id', 'username']);

      try {
        if (usernames.length === 1) {
          const result = await client.v2.userByUsername(usernames[0], {
            'user.fields': USER_FIELDS,
          });

          if (!result.data) {
            return {
              count: 0,
              users: [] as unknown[],
              missing: [usernames[0]],
              help: [
                'Run `x-cli user <username>` with an existing X handle.',
              ],
            };
          }

          return {
            user: summarizeUser(result.data, { requestedFields }),
          };
        }

        const result = await client.v2.usersByUsernames(usernames, {
          'user.fields': USER_FIELDS,
        });

        const users = result.data?.map((entry) => summarizeUser(entry, { requestedFields })) ?? [];
        const foundUsernames = new Set((result.data ?? []).map((entry) => entry.username.toLowerCase()));
        const missing = usernames.filter((name) => !foundUsernames.has(name.toLowerCase()));

        return {
          count: users.length,
          users,
          ...(missing.length > 0 ? { missing } : {}),
          ...(users.length > 0 ? {
            help: ['Run `x-cli user <username> --full` to inspect a single account in more detail.'],
          } : {
            help: ['Run `x-cli user <username>` with one or more existing X handles.'],
          }),
        };
      } catch (err) {
        throw runtimeError('Failed to look up users.', {
          code: 'USER_LOOKUP_FAILED',
          diagnostic: err instanceof Error ? err.message : String(err),
          help: [
            'Run `x-cli auth status` to confirm your credentials are still valid.',
            'Run `x-cli user <username>` with valid X handles.',
          ],
        });
      }
    }));
  user.addHelpText('after', `
Examples:
  $ x-cli user elonmusk
  $ x-cli user alice bob
  $ x-cli user alice --full
`);

  return user;
}
