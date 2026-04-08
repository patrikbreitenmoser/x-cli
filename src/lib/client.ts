import { TwitterApi } from 'twitter-api-v2';
import { OAuth2 } from '@xdevplatform/xdk';
import { loadTokens, saveTokens, isExpired, type StoredTokens } from './token-store.js';

export async function getClient(): Promise<TwitterApi> {
  const tokens = await loadTokens();
  if (!tokens) {
    console.error('Error: Not logged in. Run `x-cli auth login` first.');
    process.exit(1);
  }

  if (!isExpired(tokens)) {
    return new TwitterApi(tokens.accessToken);
  }

  // Refresh the token using the official X SDK
  try {
    const oauth2 = new OAuth2({
      clientId: tokens.clientId,
      clientSecret: tokens.clientSecret,
      redirectUri: 'http://localhost:3000/callback',
      scope: ['bookmark.read', 'tweet.read', 'users.read', 'offline.access'],
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
  } catch {
    console.error('Error: Session expired. Run `x-cli auth login` to re-authenticate.');
    process.exit(1);
  }
}
