#!/usr/bin/env node
import { Command } from 'commander';
import { makeAuthCommand } from './commands/auth.js';
import { makeUserCommand } from './commands/user.js';
import { makeBookmarksCommand } from './commands/bookmarks.js';
import { makeTweetsCommand } from './commands/tweets.js';
import { makeFollowsCommand } from './commands/follows.js';

const program = new Command();

program
  .name('x-cli')
  .description('CLI tool for querying the X (Twitter) API v2')
  .version('1.0.0')
  .showSuggestionAfterError()
  .configureHelp({ showGlobalOptions: true });

program.addHelpText('after', `
Examples:
  $ x-cli auth login --client-id YOUR_CLIENT_ID
  $ x-cli auth status
  $ x-cli user elonmusk
  $ x-cli user alice bob charlie
  $ x-cli bookmarks --limit 50
  $ x-cli bookmarks --all
  $ x-cli tweets elonmusk --limit 10
  $ x-cli tweets alice bob --since 2026-01-01
  $ x-cli tweets elonmusk --no-replies --no-retweets
  $ x-cli follows add alice bob naval
  $ x-cli follows list
  $ x-cli tweets                        # fetches new tweets for all follows

Credentials are stored in ~/.x-cli/credentials.json after login.
`);

program.addCommand(makeAuthCommand());
program.addCommand(makeFollowsCommand());
program.addCommand(makeUserCommand());
program.addCommand(makeBookmarksCommand());
program.addCommand(makeTweetsCommand());

await program.parseAsync(process.argv);
