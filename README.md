# x-cli

A command-line tool for the X (Twitter) API v2. Look up users, fetch tweets, sync bookmarks, and manage a follow list from the terminal with agent-friendly output.

Install globally:

```sh
npm install -g @patrikbreitenmoser/x-cli
```

## Requirements

- Node.js 18 or newer
- An X developer app with OAuth 2.0 enabled

Create your app at [developer.x.com](https://developer.x.com/en/portal/dashboard).

Required scopes:

- `bookmark.read`
- `tweet.read`
- `users.read`
- `offline.access`

## Install

The package name is `@patrikbreitenmoser/x-cli`, but the command you run is always `x-cli`.

### Run without installing globally

```sh
npx @patrikbreitenmoser/x-cli --help
```

### Install globally

```sh
npm install -g @patrikbreitenmoser/x-cli
x-cli --help
```

### Install in a project

```sh
npm install @patrikbreitenmoser/x-cli
npx x-cli --help
```

## Quick Start

1. Authenticate with your X app credentials:

   ```sh
   x-cli auth login
   ```

2. Complete the browser-based OAuth authorization flow.

3. Start using the CLI:

   ```sh
   x-cli auth status
   x-cli user elonmusk
   x-cli tweets elonmusk --limit 10
   ```

Before login, make sure `~/.x-cli/credentials.json` contains your X app client ID:

```json
{
  "clientId": "YOUR_CLIENT_ID"
}
```

## Authentication

`x-cli auth login` opens a browser window for OAuth authorization. It reads `clientId` from `~/.x-cli/credentials.json`. If your app also requires a client secret for token exchange, keep `clientSecret` in the same file or pass `--client-secret`. After a successful login, credentials and tokens are stored in `~/.x-cli/credentials.json` with owner-only permissions. Access tokens refresh automatically.

Useful auth commands:

```sh
x-cli auth status
x-cli auth logout
```

## Common Commands

### Home view

```sh
x-cli
x-cli --format json
```

Running `x-cli` with no subcommand prints a compact dashboard with auth status, follow-list count, sync state, and suggested next steps.

### User lookup

```sh
x-cli user elonmusk
x-cli user alice bob charlie
```

### Tweets

```sh
x-cli tweets elonmusk --limit 10
x-cli tweets alice bob --since 2026-01-01
x-cli tweets elonmusk --no-replies --no-retweets
x-cli tweets alice --fields url,attachments
x-cli tweets alice --full
```

### Bookmarks

```sh
x-cli bookmarks
x-cli bookmarks --limit 50
x-cli bookmarks --all
x-cli bookmarks --all --full
```

`bookmarks` uses incremental sync by default. After the first run, it only returns bookmarks newer than the last saved bookmark ID.

### Follow list

Manage a local follow list. When you run `tweets` with no targets, `x-cli` uses this list automatically.

```sh
x-cli follows add alice bob naval
x-cli follows remove bob
x-cli follows list
x-cli tweets
```

When `x-cli tweets` runs against the follow list, it also tracks the last sync timestamp and fetches only newer tweets on later runs unless you pass `--since`.

## Output

All command results are written as structured data to stdout. The default format is TOON for lower token usage; use `--format json` for compatibility with JSON consumers. Status and diagnostic messages go to stderr.

```sh
x-cli tweets elonmusk
x-cli tweets elonmusk --format json | jq '.tweets[].text'
x-cli bookmarks --all --format json > bookmarks.json
```

Most list commands now default to compact fields. Use `--fields <name,...>` or `--full` to request expanded output.

## Hooks

`x-cli` can install managed Codex and Claude session-start hooks if you want agents to start with a compact dashboard. Hook changes are explicit:

```sh
x-cli hooks status
x-cli hooks install
x-cli hooks uninstall
```

## Data Storage

All local state is stored in `~/.x-cli/`:

| File | Contents |
|------|----------|
| `credentials.json` | OAuth tokens and client credentials |
| `sync-state.json` | Last sync timestamps and bookmark cursor |
| `follows.json` | Local follow list |

The directory is created with mode `0700`. Files are written with mode `0600`.

## Developer Setup

If you want to work on the CLI itself instead of consuming the npm package:

```sh
npm install
npm run build
```

Useful development commands:

```sh
npm run dev -- --help
npm run dev -- auth login
npm run dev -- tweets elonmusk --limit 10
node dist/index.js --help
npm test
```

Notes:

- `npm run build` compiles TypeScript to `dist/` and makes `dist/index.js` executable.
- `npm run dev -- ...` runs the TypeScript entrypoint directly with `tsx`.
- `prepublishOnly` runs `npm run build` before publishing.

## License

MIT
