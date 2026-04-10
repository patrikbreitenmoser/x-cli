import { Command } from 'commander';
import { deleteTokens, loadTokens, isExpired } from '../lib/token-store.js';
import { runAuthFlow } from '../lib/auth-flow.js';
import { runCommand } from '../lib/output.js';
import { runtimeError, usageError } from '../lib/errors.js';

export function makeAuthCommand(): Command {
  const auth = new Command('auth').description('Manage authentication');
  auth.addHelpText('after', `
Examples:
  $ x-cli auth login
  $ x-cli auth login --client-secret YOUR_CLIENT_SECRET
  $ x-cli auth status
`);

  const login = auth
    .command('login')
    .description('Authenticate with X via OAuth 2.0 PKCE')
    .option('--client-secret <secret>', 'X app client secret')
    .action(runCommand(async (options) => {
      const savedTokens = await loadTokens();
      const clientId = savedTokens?.clientId;
      const clientSecret = options.clientSecret ?? process.env.X_CLI_CLIENT_SECRET ?? savedTokens?.clientSecret;

      if (!clientId) {
        throw usageError('`auth login` requires `clientId` in `~/.x-cli/credentials.json`.', {
          code: 'CLIENT_ID_REQUIRED',
          help: [
            'Add `clientId` to `~/.x-cli/credentials.json`, then run `x-cli auth login` again.',
            'You can keep `clientSecret` in the same file, or pass it with `--client-secret <secret>`.',
          ],
        });
      }

      try {
        const tokens = await runAuthFlow(clientId, clientSecret);

        return {
          status: 'authenticated',
          client_id: clientId,
          used_saved_client_id: savedTokens?.clientId === clientId,
          used_saved_client_secret: !options.clientSecret && !process.env.X_CLI_CLIENT_SECRET && savedTokens?.clientSecret === clientSecret,
          expires_at: new Date(tokens.expiresAt).toISOString(),
          has_refresh_token: Boolean(tokens.refreshToken),
        };
      } catch (error) {
        throw mapAuthLoginError(error, { hasClientSecret: Boolean(clientSecret) });
      }
    }));
  login.addHelpText('after', `
Examples:
  $ x-cli auth login
  $ x-cli auth login --client-secret YOUR_CLIENT_SECRET
  $ X_CLI_CLIENT_SECRET=YOUR_CLIENT_SECRET x-cli auth login
`);

  const status = auth
    .command('status')
    .description('Check current authentication status')
    .action(runCommand(async () => {
      const tokens = await loadTokens();
      if (!tokens) {
        return {
          status: 'not_logged_in',
          help: [
            'Set `clientId` in `~/.x-cli/credentials.json`, then run `x-cli auth login`.',
          ],
        };
      }

      return {
        status: isExpired(tokens) ? 'expired' : 'active',
        client_id: tokens.clientId,
        expires_at: new Date(tokens.expiresAt).toISOString(),
        has_refresh_token: Boolean(tokens.refreshToken),
      };
    }));
  status.addHelpText('after', `
Examples:
  $ x-cli auth status
  $ x-cli --format json auth status
`);

  const logout = auth
    .command('logout')
    .description('Remove stored credentials')
    .action(runCommand(async () => {
      await deleteTokens();
      return {
        status: 'logged_out',
        help: [
          'Run `x-cli auth login` to authenticate again using credentials from `~/.x-cli/credentials.json`.',
        ],
      };
    }));
  logout.addHelpText('after', `
Examples:
  $ x-cli auth logout
  $ x-cli auth login
`);

  return auth;
}

function mapAuthLoginError(error: unknown, context: { hasClientSecret: boolean }) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('unauthorized_client') && message.includes('Missing valid authorization header')) {
    return runtimeError('OAuth token exchange was rejected by X.', {
      code: 'AUTH_UNAUTHORIZED_CLIENT',
      diagnostic: message,
      help: context.hasClientSecret
        ? [
            'Verify that the client ID and client secret belong to the same X app.',
            'Verify that OAuth 2.0 and the configured callback URL are enabled for that app.',
          ]
        : [
            'This app likely requires client authentication on the token exchange. Re-run `x-cli auth login --client-secret <secret>`.',
            'Or save `clientSecret` in `~/.x-cli/credentials.json`, or set `X_CLI_CLIENT_SECRET` before login.',
          ],
    });
  }

  return runtimeError('Authentication failed.', {
    code: 'AUTH_LOGIN_FAILED',
    diagnostic: message,
    help: [
      'Verify that OAuth 2.0 is enabled for your X app and that the callback URL matches `http://localhost:3000/callback`.',
      'Verify that your app has the required scopes: `bookmark.read`, `tweet.read`, `users.read`, `offline.access`.',
    ],
  });
}
