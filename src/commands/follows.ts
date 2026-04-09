import { Command } from 'commander';
import { loadFollows, addFollows, removeFollows } from '../lib/follows-store.js';
import { runCommand } from '../lib/output.js';

export function makeFollowsCommand(): Command {
  const follows = new Command('follows').description('Manage your follow list');

  follows
    .command('add')
    .description('Add accounts to follow list')
    .argument('<usernames...>', 'usernames to add')
    .action(runCommand(async (usernames: string[]) => {
      const result = await addFollows(usernames);
      return {
        added: result.changed,
        unchanged: result.unchanged,
        count: result.follows.length,
        follows: result.follows,
        help: [
          'Run `x-cli follows list` to inspect the current follow list.',
          'Run `x-cli tweets` to fetch new tweets for the saved accounts.',
        ],
      };
    }));

  follows
    .command('remove')
    .description('Remove accounts from follow list')
    .argument('<usernames...>', 'usernames to remove')
    .action(runCommand(async (usernames: string[]) => {
      const result = await removeFollows(usernames);
      return {
        removed: result.changed,
        unchanged: result.unchanged,
        count: result.follows.length,
        follows: result.follows,
        help: [
          'Run `x-cli follows list` to inspect the current follow list.',
        ],
      };
    }));

  follows
    .command('list')
    .description('Show current follow list')
    .action(runCommand(async () => {
      const all = await loadFollows();
      return {
        count: all.length,
        follows: all,
        help: all.length === 0
          ? ['Run `x-cli follows add <username...>` to seed your follow list.']
          : ['Run `x-cli tweets` to fetch new tweets for the current follow list.'],
      };
    }));

  return follows;
}
