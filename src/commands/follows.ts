import { Command } from 'commander';
import { loadFollows, addFollows, removeFollows } from '../lib/follows-store.js';
import { printJson } from '../lib/output.js';

export function makeFollowsCommand(): Command {
  const follows = new Command('follows').description('Manage your follow list');

  follows
    .command('add')
    .description('Add accounts to follow list')
    .argument('<usernames...>', 'usernames to add')
    .action(async (usernames: string[]) => {
      const added = await addFollows(usernames);
      const all = await loadFollows();
      printJson({ added, follows: all, count: all.length });
    });

  follows
    .command('remove')
    .description('Remove accounts from follow list')
    .argument('<usernames...>', 'usernames to remove')
    .action(async (usernames: string[]) => {
      const removed = await removeFollows(usernames);
      const all = await loadFollows();
      printJson({ removed, follows: all, count: all.length });
    });

  follows
    .command('list')
    .description('Show current follow list')
    .action(async () => {
      const all = await loadFollows();
      if (all.length === 0) {
        console.error('No accounts in follow list. Add some with: x-cli follows add <usernames...>');
        return;
      }
      printJson({ follows: all, count: all.length });
    });

  return follows;
}
