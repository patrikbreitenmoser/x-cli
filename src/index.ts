#!/usr/bin/env node
import { Command, CommanderError, Option } from 'commander';
import { makeAuthCommand } from './commands/auth.js';
import { makeUserCommand } from './commands/user.js';
import { makeBookmarksCommand } from './commands/bookmarks.js';
import { makeTweetsCommand } from './commands/tweets.js';
import { makeFollowsCommand } from './commands/follows.js';
import { ensureCliError, usageError } from './lib/errors.js';
import { buildHomeOutput } from './lib/home.js';
import { ensureManagedHooksInstalled, getManagedHookStatus } from './lib/hooks.js';
import { printError, runCommand, setOutputFormat } from './lib/output.js';

const program = new Command();

program
  .name('x-cli')
  .description('Query X users, tweets, bookmarks, and follow-list state with agent-friendly output.')
  .version('1.0.0')
  .showSuggestionAfterError()
  .configureOutput({
    outputError: () => {},
  })
  .configureHelp({ showGlobalOptions: true })
  .addOption(new Option('--format <format>', 'stdout format').choices(['toon', 'json']).default('toon'))
  .hook('preAction', (_command, actionCommand) => {
    const options = typeof actionCommand.optsWithGlobals === 'function'
      ? actionCommand.optsWithGlobals()
      : actionCommand.opts();
    setOutputFormat(options.format === 'json' ? 'json' : 'toon');
  })
  .action(runCommand(async () => buildHomeOutput()));

program.addHelpText('after', `
Examples:
  $ x-cli
  $ x-cli --format json
  $ x-cli auth login
  $ x-cli auth login --client-secret YOUR_CLIENT_SECRET
  $ x-cli auth status
  $ x-cli user elonmusk
  $ x-cli user alice bob --full
  $ x-cli bookmarks --limit 50
  $ x-cli tweets elonmusk --limit 10
  $ x-cli tweets alice bob --since 2026-01-01
  $ x-cli follows add alice bob naval
  $ x-cli hooks status

The default stdout format is TOON. Use --format json for compatibility with existing JSON consumers.
`);

program.addCommand(makeAuthCommand());
program.addCommand(makeFollowsCommand());
program.addCommand(makeUserCommand());
program.addCommand(makeBookmarksCommand());
program.addCommand(makeTweetsCommand());
program.addCommand(makeHooksCommand());
applyCommanderDefaults(program);

setOutputFormat(detectRequestedFormat(process.argv.slice(2)));

if (process.env.X_CLI_DISABLE_AUTO_HOOKS !== '1' && !isHookEmitterInvocation(process.argv.slice(2))) {
  await ensureManagedHooksInstalled().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`x-cli: failed to install managed hooks (${message})`);
  });
}

try {
  validateCliArgs(process.argv.slice(2));
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    if (
      error.code === 'commander.helpDisplayed'
      || error.code === 'commander.version'
      || error.code === 'commander.versionDisplayed'
    ) {
      process.exitCode = 0;
    } else {
      const usage = normalizeCommanderError(error, process.argv.slice(2));
      printError(usage);
      process.exitCode = usage.exitCode;
    }
  } else {
    const cliError = ensureCliError(error);
    printError(cliError);
    process.exitCode = cliError.exitCode;
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

function makeHooksCommand(): Command {
  const hooks = new Command('hooks').description('Manage ambient session hooks');

  hooks
    .command('install')
    .description('Install or repair Codex and Claude session-start hooks')
    .action(runCommand(async () => ensureManagedHooksInstalled()));

  hooks
    .command('status')
    .description('Show the current Codex and Claude hook status')
    .action(runCommand(async () => getManagedHookStatus()));

  hooks
    .command('emit-session-start')
    .description('Emit compact x-cli context for managed session-start hooks')
    .addOption(new Option('--app <app>', 'hook consumer').choices(['cli', 'codex', 'claude']).default('cli'))
    .action(runCommand(async (options: { app: 'cli' | 'codex' | 'claude' }) => buildHomeOutput({ app: options.app })));

  return hooks;
}

function detectRequestedFormat(args: string[]): 'toon' | 'json' {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--format') {
      return args[index + 1] === 'json' ? 'json' : 'toon';
    }
    if (args[index].startsWith('--format=')) {
      return args[index].slice('--format='.length) === 'json' ? 'json' : 'toon';
    }
  }
  return 'toon';
}

function isHookEmitterInvocation(args: string[]): boolean {
  return args[0] === 'hooks' && args[1] === 'emit-session-start';
}

function applyCommanderDefaults(command: Command): void {
  command.exitOverride();
  command.configureOutput({
    outputError: () => {},
  });

  for (const subcommand of command.commands) {
    applyCommanderDefaults(subcommand);
  }
}

function validateCliArgs(args: string[]): void {
  const resolution = resolveCommandPath(args);
  validateKnownOptionTokens(args, resolution.commandPath, resolution.currentCommand);
}

function getFirstPositionalToken(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') {
      return args[index + 1] ?? null;
    }
    if (token === '--format') {
      index += 1;
      continue;
    }
    if (token.startsWith('--format=')) {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    return token;
  }

  return null;
}

function resolveCommandPath(args: string[]): { commandPath: string[]; currentCommand: Command } {
  const commandPath: string[] = [];
  let currentCommand = program;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') {
      break;
    }
    if (token === '--format') {
      index += 1;
      continue;
    }
    if (token.startsWith('--format=')) {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }

    const nextCommand = currentCommand.commands.find((command) => command.name() === token || command.alias() === token);
    if (nextCommand) {
      commandPath.push(nextCommand.name());
      currentCommand = nextCommand;
      continue;
    }

    if (currentCommand.commands.length > 0) {
      const suggestion = suggestClosest(token, currentCommand.commands.map((command) => command.name()));
      const prefix = commandPath.length > 0 ? `x-cli ${commandPath.join(' ')} ` : 'x-cli ';
      throw usageError(`unknown command '${token}'`, {
        code: 'UNKNOWN_COMMAND',
        help: suggestion
          ? [
              `Run \`${prefix}${suggestion}\`.`,
              `Run \`${buildHelpCommand(commandPath)} --help\` to inspect available commands.`,
            ]
          : [`Run \`${buildHelpCommand(commandPath)} --help\` to inspect available commands.`],
      });
    }

    break;
  }

  return { commandPath, currentCommand };
}

function validateKnownOptionTokens(args: string[], commandPath: string[], currentCommand: Command): void {
  const options = getKnownOptions(currentCommand);
  const consumedCommands = [...commandPath];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') {
      break;
    }

    if (consumedCommands.length > 0 && token === consumedCommands[0]) {
      consumedCommands.shift();
      continue;
    }

    if (!token.startsWith('-')) {
      continue;
    }

    const flag = token.startsWith('--') && token.includes('=')
      ? token.slice(0, token.indexOf('='))
      : token;
    const option = options.get(flag);
    if (!option) {
      throw usageError(`unknown option '${flag}'`, {
        code: 'UNKNOWN_OPTION',
        help: [`Run \`${buildHelpCommand(commandPath)} --help\` to inspect valid options.`],
      });
    }

    if (option.requiresValue && !token.includes('=')) {
      index += 1;
    }
  }
}

function getKnownOptions(command: Command): Map<string, { requiresValue: boolean }> {
  const known = new Map<string, { requiresValue: boolean }>();
  let current: Command | null = command;

  while (current) {
    current.options.forEach((option) => {
      const requiresValue = Boolean(option.required || option.optional);
      if (option.long) {
        known.set(option.long, { requiresValue });
      }
      if (option.short) {
        known.set(option.short, { requiresValue });
      }
    });
    current = current.parent ?? null;
  }

  known.set('--help', { requiresValue: false });
  known.set('-h', { requiresValue: false });
  known.set('--version', { requiresValue: false });
  known.set('-V', { requiresValue: false });

  return known;
}

function normalizeCommanderError(error: CommanderError, args: string[]) {
  if (error.code === 'commander.unknownOption') {
    return usageError(cleanCommanderMessage(error.message), {
      code: 'UNKNOWN_OPTION',
      help: [`Run \`${buildHelpCommand(args)} --help\` to inspect valid options.`],
    });
  }

  if (error.code === 'commander.unknownCommand') {
    const commandToken = getFirstPositionalToken(args);
    const knownCommands = program.commands.map((command) => command.name());
    const suggestion = commandToken ? suggestClosest(commandToken, knownCommands) : null;
    return usageError(cleanCommanderMessage(error.message), {
      code: 'UNKNOWN_COMMAND',
      help: suggestion
        ? [
            `Run \`x-cli ${suggestion}\`.`,
            'Run `x-cli --help` to inspect available commands.',
          ]
        : ['Run `x-cli --help` to inspect available commands.'],
    });
  }

  if (error.code === 'commander.excessArguments') {
    return usageError(cleanCommanderMessage(error.message), {
      code: 'TOO_MANY_ARGUMENTS',
      help: [`Run \`${buildHelpCommand(args)} --help\` to inspect the expected arguments.`],
    });
  }

  return usageError(cleanCommanderMessage(error.message), {
    code: 'USAGE_ERROR',
    help: [`Run \`${buildHelpCommand(args)} --help\` to inspect valid usage.`],
  });
}

function buildHelpCommand(commandPathOrArgs: string[] | string): string {
  if (typeof commandPathOrArgs === 'string') {
    return commandPathOrArgs;
  }
  return ['x-cli', ...commandPathOrArgs].join(' ').trim();
}

function cleanCommanderMessage(message: string): string {
  return message.replace(/^error:\s*/i, '');
}

function suggestClosest(input: string, candidates: string[]): string | null {
  let best: { candidate: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = levenshtein(input, candidate);
    if (!best || score < best.score) {
      best = { candidate, score };
    }
  }

  if (!best) {
    return null;
  }

  return best.score <= Math.max(2, Math.floor(best.candidate.length / 3)) ? best.candidate : null;
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    dp[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    dp[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}
