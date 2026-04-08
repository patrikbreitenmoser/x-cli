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
      if (added.length > 0) {
        console.error(`Added: ${added.join(', ')}`);
      } else {
        console.error('All usernames already in follow list.');
      }
      const all = await loadFollows();
      console.error(`Follow list: ${all.length} accounts`);
    });

  follows
    .command('remove')
    .description('Remove accounts from follow list')
    .argument('<usernames...>', 'usernames to remove')
    .action(async (usernames: string[]) => {
      const removed = await removeFollows(usernames);
      if (removed.length > 0) {
        console.error(`Removed: ${removed.join(', ')}`);
      } else {
        console.error('None of those usernames were in the follow list.');
      }
      const all = await loadFollows();
      console.error(`Follow list: ${all.length} accounts`);
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
