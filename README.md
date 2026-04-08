# x-cli

A command-line tool for the X (Twitter) API v2. Look up users, fetch tweets, sync bookmarks, and manage a follow list -- all from the terminal with JSON output.

## Setup

```sh
npm install
npm run build
```

You need an X developer app with OAuth 2.0 enabled. Create one at [developer.x.com](https://developer.x.com/en/portal/dashboard).

Required scopes: `bookmark.read`, `tweet.read`, `users.read`, `offline.access`

## Authentication

```sh
x-cli auth login
```

You'll be prompted for your Client ID and Client Secret, then a browser window opens for OAuth authorization. Credentials are stored in `~/.x-cli/credentials.json` (owner-only permissions). Tokens refresh automatically.

```sh
x-cli auth status    # check login state
x-cli auth logout    # remove stored credentials
```

## Commands

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
```

### Bookmarks

```sh
x-cli bookmarks              # new bookmarks since last sync
x-cli bookmarks --limit 50
x-cli bookmarks --all        # all bookmarks, ignore sync state
```

Incremental sync tracks the last bookmark ID. Running `bookmarks` again returns only new bookmarks added since the last run.

### Follow list

Manage a local follow list. When you run `tweets` with no arguments, it fetches tweets for everyone on the list.

```sh
x-cli follows add alice bob naval
x-cli follows remove bob
x-cli follows list
x-cli tweets                  # fetches new tweets for all follows
```

## Output

All commands output JSON to stdout. Status messages go to stderr. This makes piping and scripting straightforward:

```sh
x-cli tweets elonmusk | jq '.data[].text'
x-cli bookmarks --all > bookmarks.json
```

## Development

```sh
npm run dev -- auth login     # run without building
npx tsx src/index.ts tweets elonmusk
```

## Data storage

All data is stored in `~/.x-cli/`:

| File | Contents |
|------|----------|
| `credentials.json` | OAuth tokens and client credentials (mode 0600) |
| `sync-state.json` | Last sync timestamps and bookmark cursor |
| `follows.json` | Local follow list |

The directory is created with mode 0700. All files are written with mode 0600 (owner-only read/write).

## License

MIT
