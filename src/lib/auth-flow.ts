import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { OAuth2, generateCodeVerifier, generateCodeChallenge } from '@xdevplatform/xdk';
import { saveTokens, type StoredTokens } from './token-store.js';

export const CALLBACK_PORT = 3000;
export const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;
export const SCOPES = ['bookmark.read', 'tweet.read', 'users.read', 'offline.access'];

export async function runAuthFlow(clientId: string, clientSecret?: string): Promise<StoredTokens> {
  const oauth2 = new OAuth2({
    clientId,
    clientSecret,
    redirectUri: CALLBACK_URL,
    scope: SCOPES,
  });

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  await oauth2.setPkceParameters(codeVerifier, codeChallenge);

  const state = crypto.randomUUID();
  const authUrl = await oauth2.getAuthorizationUrl(state);

  // Wait for the callback
  const code = await new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const error = reqUrl.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Authorization failed. Check the terminal for details.');
        server.close();
        console.error(`Authorization error from X: ${error}`);
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      if (returnedState !== state) {
        res.writeHead(400);
        res.end('State mismatch');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }

      const authCode = reqUrl.searchParams.get('code');
      if (!authCode) {
        res.writeHead(400);
        res.end('No authorization code received');
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authorization successful!</h2><p>You can close this window.</p></body></html>');
      clearTimeout(timer);
      server.close();
      resolve(authCode);
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      console.error(`\nOpen this URL in your browser to authorize:\n\n  ${authUrl}\n`);
      console.error(`Waiting for authorization on http://localhost:${CALLBACK_PORT}/callback ...\n`);

      // Try to open browser automatically
      import('node:child_process').then(({ execFile }) => {
        if (process.platform === 'win32') {
          execFile('cmd', ['/c', 'start', '', authUrl]);
        } else {
          const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
          execFile(cmd, [authUrl]);
        }
      }).catch(() => {
        // Browser open failed, user can copy URL manually
      });

      // Timeout after 5 minutes
      timer = setTimeout(() => {
        server.close();
        reject(new Error('Authorization timed out after 5 minutes'));
      }, 5 * 60 * 1000);
      timer.unref();
    });

    server.on('error', (err: Error) => {
      reject(new Error(`Failed to start callback server on port ${CALLBACK_PORT}: ${err.message}`));
    });
  });

  // Exchange code for tokens using the official SDK
  const tokenData = await oauth2.exchangeCode(code, codeVerifier);

  if (!tokenData.refresh_token) {
    throw new Error('No refresh token returned. Ensure your X app has the offline.access scope enabled.');
  }

  const tokens: StoredTokens = {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
  };

  await saveTokens(tokens);
  return tokens;
}
