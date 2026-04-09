import { TwitterApi } from 'twitter-api-v2';
import { OAuth2 } from '@xdevplatform/xdk';
import { loadTokens, saveTokens, isExpired, type StoredTokens } from './token-store.js';
import { CALLBACK_URL, SCOPES } from './auth-flow.js';
import { runtimeError } from './errors.js';

export async function getClient(): Promise<TwitterApi> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw runtimeError('Not logged in.', {
      code: 'AUTH_REQUIRED',
      help: [
        'Run `x-cli auth login` to authenticate using credentials from `~/.x-cli/credentials.json`.',
        'Run `x-cli auth status` to inspect stored credentials.',
      ],
    });
  }

  if (!isExpired(tokens)) {
    return new TwitterApi(tokens.accessToken);
  }

  // Refresh the token using the official X SDK
  try {
    const oauth2 = new OAuth2({
      clientId: tokens.clientId,
      clientSecret: tokens.clientSecret,
      redirectUri: CALLBACK_URL,
      scope: SCOPES,
    });

    const newToken = await oauth2.refreshToken(tokens.refreshToken);

    const updated: StoredTokens = {
      clientId: tokens.clientId,
      ...(tokens.clientSecret ? { clientSecret: tokens.clientSecret } : {}),
      accessToken: newToken.access_token,
      refreshToken: newToken.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (newToken.expires_in * 1000),
    };
    await saveTokens(updated);
    return new TwitterApi(newToken.access_token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw runtimeError('Token refresh failed.', {
      code: 'AUTH_REFRESH_FAILED',
      diagnostic: `Token refresh failed (${msg}).`,
      help: [
        'Run `x-cli auth login` to re-authenticate using credentials from `~/.x-cli/credentials.json`.',
      ],
    });
  }
}
