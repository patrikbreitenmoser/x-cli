import { Command, Option } from 'commander';
import { input, password } from '@inquirer/prompts';
import { loadTokens, deleteTokens } from '../lib/token-store.js';
import { runAuthFlow } from '../lib/auth-flow.js';

export function makeAuthCommand(): Command {
  const auth = new Command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Authenticate with X via OAuth 2.0 PKCE')
    .addOption(
      new Option('--client-id <id>', 'X app client ID').env('X_CLIENT_ID')
    )
    .addOption(
      new Option('--client-secret <secret>', 'X app client secret').env('X_CLIENT_SECRET')
    )
    .action(async (options) => {
      let { clientId, clientSecret } = options;

      // Interactive setup if credentials not provided
      if (!clientId || !clientSecret) {
        console.error('X API credentials not found. Let\'s set them up.');
        console.error('Get your credentials from https://developer.x.com/en/portal/dashboard\n');
      }

      if (!clientId) {
        clientId = await input({
          message: 'Client ID:',
          validate: (v) => v.trim().length > 0 || 'Client ID is required',
        });
      }

      if (!clientSecret) {
        clientSecret = await password({
          message: 'Client Secret:',
          validate: (v) => v.trim().length > 0 || 'Client Secret is required',
        });
      }

      try {
        const tokens = await runAuthFlow(clientId, clientSecret);
        console.error('\nSuccessfully authenticated!');
        console.error(`Access token expires at: ${new Date(tokens.expiresAt).toLocaleString()}`);
      } catch (err: any) {
        console.error(`\nAuthentication failed: ${err.message}`);
        process.exit(1);
      }
    });

  auth
    .command('status')
    .description('Check current authentication status')
    .action(async () => {
      const tokens = await loadTokens();
      if (!tokens) {
        console.log(JSON.stringify({ status: 'not_logged_in' }, null, 2));
        return;
      }

      const expiresAt = new Date(tokens.expiresAt);
      const isExpired = Date.now() >= tokens.expiresAt;

      console.log(JSON.stringify({
        status: isExpired ? 'expired' : 'active',
        clientId: tokens.clientId,
        expiresAt: expiresAt.toISOString(),
        hasRefreshToken: !!tokens.refreshToken,
      }, null, 2));
    });

  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(async () => {
      await deleteTokens();
      console.error('Logged out. Credentials removed.');
    });

  return auth;
}
