import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { USER_FIELDS } from '../lib/fields.js';
import { printJson } from '../lib/output.js';

export function makeUserCommand(): Command {
  const user = new Command('user')
    .description('Look up one or more users by username')
    .argument('<usernames...>', 'one or more X usernames')
    .action(async (usernames: string[]) => {
      const client = await getClient();

      try {
        if (usernames.length === 1) {
          const result = await client.v2.userByUsername(usernames[0], {
            'user.fields': USER_FIELDS,
          });

          if (!result.data) {
            console.error(`User not found: ${usernames[0]}`);
            process.exit(1);
          }

          printJson(result);
        } else {
          const result = await client.v2.usersByUsernames(usernames, {
            'user.fields': USER_FIELDS,
          });

          if (!result.data || result.data.length === 0) {
            console.error('No users found.');
            process.exit(1);
          }

          // Report any usernames not found
          const foundUsernames = new Set(result.data.map(u => u.username.toLowerCase()));
          for (const name of usernames) {
            if (!foundUsernames.has(name.toLowerCase())) {
              console.error(`Warning: User not found: ${name}`);
            }
          }

          printJson(result);
        }
      } catch (err: any) {
        console.error(`Error looking up users: ${err.message}`);
        process.exit(1);
      }
    });

  return user;
}
