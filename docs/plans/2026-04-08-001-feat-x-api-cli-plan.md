---
title: "feat: Build X API v2 CLI tool"
type: feat
status: active
date: 2026-04-08
---

# feat: Build X API v2 CLI tool

## Overview

Build a Node.js/TypeScript CLI tool that queries the X (Twitter) API v2 to: retrieve personal bookmarks, look up users by username, and fetch a user's tweets with full metadata. Uses OAuth 2.0 PKCE for authentication and outputs JSON.

## Problem Frame

There is no simple CLI to interact with the X API v2 for common read operations. The user wants a local tool to quickly fetch bookmarks, resolve usernames to IDs, and pull tweet timelines with full metadata (conversations, attachments, referenced tweets) — filterable by count or date range.

## Requirements Trace

- R1. Authenticate via OAuth 2.0 Authorization Code with PKCE (one-time browser login, token storage, auto-refresh)
- R2. Fetch the authenticated user's bookmarks with pagination support
- R3. Look up one or more users by username and return their profile data including user IDs
- R4. Fetch tweets for one or more users by username or user ID, including all metadata (conversation_id, attachments, referenced_tweets, public_metrics)
- R5. Support filtering tweets by count (`--limit`) or date range (`--since`)
- R6. Output all results as JSON to stdout
- R7. Support pagination to retrieve more than one page of results

## Scope Boundaries

- No tweet creation, deletion, or any write operations
- No streaming endpoints
- No table/CSV output formatting — JSON only
- No OAuth 1.0a or Bearer Token auth paths
- No GUI or web interface for the OAuth flow (uses localhost redirect)

## Context & Research

### Technology Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript with ESM modules
- **CLI Framework:** Commander.js v14 with `@commander-js/extra-typings`
- **X API Client:** `twitter-api-v2` npm package (v1.28+, zero deps, full TypeScript support, built-in OAuth 2.0 PKCE and pagination)
- **Dev tooling:** `tsx` for development, `tsc` for build

### Relevant Patterns

- Commander.js factory function pattern: each command group in its own file, exports a `makeXCommand()` returning a `Command`, registered via `addCommand()`
- `parseAsync()` required for async action handlers
- `optsWithGlobals()` to access root-level options from subcommand handlers
- `new Option().env()` for environment variable integration with auto help text
- `twitter-api-v2` provides `TwitterApi` client with `.v2` accessor for v2 endpoints, built-in pagination via `.fetchNext()` or async iterators

### X API v2 Key Details

**Endpoints used:**
| Endpoint | Auth | Rate Limit |
|---|---|---|
| `GET /2/users/{id}/bookmarks` | OAuth 2.0 PKCE only | 180/15min per user |
| `GET /2/users/by/username/{username}` | Any | 300/15min per app |
| `GET /2/users/{id}/tweets` | Any | 1500/15min per app |

**OAuth 2.0 Scopes needed:** `bookmark.read`, `tweet.read`, `users.read`, `offline.access`

**Tweet fields for full metadata:** `author_id`, `created_at`, `conversation_id`, `attachments`, `referenced_tweets`, `public_metrics`, `entities`, `in_reply_to_user_id`, `lang`, `source`, `note_tweet`, `edit_controls`

**Expansions for full metadata:** `author_id`, `attachments.media_keys`, `attachments.poll_ids`, `referenced_tweets.id`, `referenced_tweets.id.author_id`, `in_reply_to_user_id`

**Additional fields:** `media.fields=type,url,preview_image_url,alt_text,variants,width,height`, `user.fields=created_at,description,profile_image_url,public_metrics,verified_type,username`

**Pagination:** Response `meta.next_token` used as `pagination_token` on next request. `twitter-api-v2` handles this automatically.

**Date filtering:** `start_time` and `end_time` params in ISO 8601 format on the tweets timeline endpoint.

### External References

- X API v2 docs: https://docs.x.com/x-api/overview
- Commander.js: https://github.com/tj/commander.js/
- twitter-api-v2: https://github.com/PLhery/node-twitter-api-v2

## Key Technical Decisions

- **Use `twitter-api-v2` library instead of raw HTTP:** Provides typed responses, automatic pagination, OAuth 2.0 PKCE helpers, and rate limit awareness. Zero dependencies.
- **OAuth 2.0 PKCE with localhost callback:** The CLI starts a temporary local HTTP server to receive the OAuth callback. This avoids manual copy-paste of auth codes. Tokens stored in `~/.x-cli/credentials.json`.
- **Single auth method (OAuth 2.0 PKCE):** Simplifies config and works for all endpoints including bookmarks. Bearer Token would be simpler but can't access bookmarks.
- **Username-to-ID resolution built into tweets command:** When usernames are provided, the CLI resolves them to user IDs automatically before fetching tweets, so the user doesn't need to manually look up IDs.
- **Variadic arguments for user and tweets commands:** Both commands accept multiple usernames/IDs (`x-cli user alice bob`, `x-cli tweets alice bob`). The X API v2 supports batch user lookup via `GET /2/users/by` with up to 100 usernames. For tweets, each user's timeline is fetched sequentially and results are combined.
- **JSON-only output:** Keeps the tool simple and composable with `jq`. No formatting dependencies needed.

## Open Questions

### Resolved During Planning

- **Auth method:** OAuth 2.0 PKCE only — covers all endpoints, tokens auto-refresh via `offline.access` scope
- **Output format:** JSON only — pipe to `jq` for filtering
- **API client library:** `twitter-api-v2` — actively maintained, TypeScript, zero deps, handles pagination and OAuth

### Deferred to Implementation

- **Exact token refresh error handling:** Behavior when refresh token is revoked or expired needs to be discovered at runtime. Plan: prompt re-login.
- **Rate limit behavior:** Whether to surface rate limit headers to the user or silently retry. Start with surfacing errors, iterate if needed.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
x-cli auth login    → starts OAuth PKCE flow → stores tokens in ~/.x-cli/credentials.json
x-cli bookmarks     → reads tokens → GET /2/users/{me}/bookmarks → JSON output
x-cli user <names...>   → GET /2/users/by (batch) → JSON output
x-cli tweets <targets...> [--limit N] [--since DATE] → resolve usernames if needed → GET /2/users/{id}/tweets per user → paginate → combined JSON output
```

```
src/
  index.ts                 # Entry: assembles program, parseAsync
  commands/
    auth.ts                # login, logout, status subcommands
    bookmarks.ts           # fetch bookmarks with pagination
    user.ts                # user lookup by username
    tweets.ts              # fetch user tweets with filters
  lib/
    client.ts              # Creates authenticated TwitterApi instance from stored tokens
    auth-flow.ts           # OAuth 2.0 PKCE flow: local server, browser open, token exchange
    token-store.ts         # Read/write/refresh tokens in ~/.x-cli/credentials.json
    fields.ts              # Shared tweet.fields, expansions, media.fields constants
    output.ts              # JSON formatting helper (pretty print, pagination merge)
```

## Implementation Units

- [ ] **Unit 1: Project scaffolding and config**

  **Goal:** Initialize the TypeScript + ESM project with all dependencies and build tooling.

  **Requirements:** Foundation for all other units

  **Dependencies:** None

  **Files:**
  - Create: `package.json`
  - Create: `tsconfig.json`
  - Create: `src/index.ts` (minimal commander program skeleton)
  - Create: `.gitignore`

  **Approach:**
  - `"type": "module"` in package.json for ESM
  - `"bin": { "x-cli": "./dist/index.js" }` for CLI entry point
  - Dependencies: `commander@^14`, `twitter-api-v2@^1.28`
  - Dev dependencies: `@commander-js/extra-typings@^14`, `typescript@^5.5`, `tsx@^4`
  - tsconfig targets ES2022, module NodeNext, outDir `dist/`
  - Entry point has shebang `#!/usr/bin/env node`, registers empty command groups, calls `parseAsync()`

  **Patterns to follow:**
  - Commander factory function pattern: `makeXCommand()` per command file, `addCommand()` in index

  **Test expectation:** none -- scaffolding only, verified by `npx tsx src/index.ts --help` producing help output

  **Verification:**
  - `npm install` succeeds
  - `npx tsx src/index.ts --help` prints help with command groups listed

- [ ] **Unit 2: Token store and OAuth 2.0 PKCE auth flow**

  **Goal:** Implement the `auth login` command that performs OAuth 2.0 PKCE, stores tokens, and `auth status` to check login state.

  **Requirements:** R1

  **Dependencies:** Unit 1

  **Files:**
  - Create: `src/lib/token-store.ts`
  - Create: `src/lib/auth-flow.ts`
  - Create: `src/commands/auth.ts`
  - Modify: `src/index.ts` (register auth command)

  **Approach:**
  - `token-store.ts`: Read/write `~/.x-cli/credentials.json` containing `{ accessToken, refreshToken, expiresAt, clientId }`. Create directory if missing. File permissions 600.
  - `auth-flow.ts`: Generate PKCE code verifier + challenge. Open browser to X auth URL. Start temporary HTTP server on `localhost:3000` (or configurable port) to receive callback. Exchange code for tokens. Store via token-store. Shut down server.
  - `auth.ts` command group with subcommands:
    - `auth login` — runs the PKCE flow. Requires `--client-id` option (or `X_CLIENT_ID` env var).
    - `auth status` — reads token store, shows login state and expiry.
    - `auth logout` — deletes stored credentials.
  - Use `twitter-api-v2`'s built-in OAuth 2.0 helpers: `TwitterApi.generateOAuth2AuthLink()` and `loginWithOAuth2()`
  - Use Node.js built-in `open` or `child_process.exec` to open browser

  **Patterns to follow:**
  - Commander `.env()` for `X_CLIENT_ID` environment variable
  - `optsWithGlobals()` not needed here since auth is self-contained

  **Test scenarios:**
  - Happy path: `auth login` opens browser, receives callback, stores tokens, prints success
  - Happy path: `auth status` with valid stored tokens shows "logged in" and expiry time
  - Happy path: `auth logout` deletes credentials file
  - Edge case: `auth login` when already logged in — should re-authenticate (overwrite tokens)
  - Error path: `auth login` without `--client-id` and no `X_CLIENT_ID` env var — clear error message
  - Error path: `auth status` with no stored credentials — shows "not logged in"
  - Edge case: `~/.x-cli/` directory doesn't exist — auto-created on first login

  **Verification:**
  - `x-cli auth login --client-id <id>` opens browser, completes OAuth flow, stores credentials
  - `x-cli auth status` reports login state
  - Credentials file exists at `~/.x-cli/credentials.json` with restricted permissions

- [ ] **Unit 3: Authenticated API client factory**

  **Goal:** Create a shared module that produces an authenticated `TwitterApi` client from stored tokens, with auto-refresh.

  **Requirements:** R1 (token refresh), foundation for R2/R3/R4

  **Dependencies:** Unit 2

  **Files:**
  - Create: `src/lib/client.ts`
  - Create: `src/lib/fields.ts`

  **Approach:**
  - `client.ts`: Load tokens from store. If expired, refresh using `twitter-api-v2`'s refresh flow. Update stored tokens. Return authenticated `TwitterApi` instance. If refresh fails, print error suggesting `auth login` and exit.
  - `fields.ts`: Export constants for the shared tweet.fields, user.fields, media.fields, poll.fields, and expansions arrays used across bookmarks and tweets commands. Single source of truth.
  - Export a single `getClient()` async function used by all commands.

  **Patterns to follow:**
  - Centralized client creation avoids duplicating auth logic in each command

  **Test scenarios:**
  - Happy path: `getClient()` with valid tokens returns authenticated client
  - Happy path: `getClient()` with expired access token auto-refreshes and returns client
  - Error path: `getClient()` with no stored credentials exits with "not logged in, run auth login"
  - Error path: `getClient()` with invalid/revoked refresh token exits with "session expired, run auth login"

  **Verification:**
  - Client can make an authenticated API call (tested implicitly by Unit 4+)
  - Token refresh updates stored credentials file

- [ ] **Unit 4: User lookup command**

  **Goal:** Implement `x-cli user <usernames...>` to look up one or more users by username and output their profiles as JSON.

  **Requirements:** R3, R6

  **Dependencies:** Unit 3

  **Files:**
  - Create: `src/commands/user.ts`
  - Modify: `src/index.ts` (register user command)

  **Approach:**
  - Command: `x-cli user <usernames...>` (variadic — one or more usernames)
  - Single username: calls `client.v2.userByUsername()`
  - Multiple usernames: calls `client.v2.usersByUsernames()` (batch lookup, up to 100)
  - Requests user.fields: `created_at`, `description`, `profile_image_url`, `public_metrics`, `verified_type`, `location`, `url`, `protected`
  - Outputs full response JSON (data array + any includes) to stdout

  **Patterns to follow:**
  - Factory function: `makeUserCommand()` returning a `Command`
  - Use `getClient()` from `lib/client.ts`

  **Test scenarios:**
  - Happy path: `x-cli user elonmusk` returns single user profile JSON with id, name, username, public_metrics
  - Happy path: `x-cli user alice bob charlie` returns array of user profiles
  - Error path: `x-cli user nonexistentuser12345` — API returns no data, CLI prints clear "user not found" error
  - Edge case: mix of valid and invalid usernames — returns found users, reports not-found ones to stderr
  - Edge case: `x-cli user` with no argument — commander shows usage help

  **Verification:**
  - Running `x-cli user <username>` outputs valid JSON containing the user's ID and profile data
  - Running `x-cli user <u1> <u2>` outputs JSON array with both users' data

- [ ] **Unit 5: Bookmarks command**

  **Goal:** Implement `x-cli bookmarks` to fetch the authenticated user's bookmarks with full tweet metadata and pagination.

  **Requirements:** R2, R6, R7

  **Dependencies:** Unit 3

  **Files:**
  - Create: `src/commands/bookmarks.ts`
  - Modify: `src/index.ts` (register bookmarks command)

  **Approach:**
  - Command: `x-cli bookmarks [--limit <n>] [--all]`
  - `--limit <n>`: fetch up to N bookmarks (default 20). Handles pagination automatically if N > 100 (API max per page).
  - `--all`: fetch all bookmarks (up to API max of 800)
  - Uses `client.v2.bookmarks()` with tweet.fields, expansions, media.fields, user.fields from `fields.ts`
  - Needs the authenticated user's ID — get it via `client.v2.me()` first
  - Pagination: accumulate results across pages, output single merged JSON array
  - Output structure: `{ data: [...tweets], includes: { users: [...], media: [...], tweets: [...] } }`

  **Patterns to follow:**
  - Factory function pattern
  - Use shared field constants from `lib/fields.ts`
  - `twitter-api-v2` pagination: use `.fetchNext()` in a loop or async iterator

  **Test scenarios:**
  - Happy path: `x-cli bookmarks` returns up to 20 bookmarks as JSON with tweet metadata and includes
  - Happy path: `x-cli bookmarks --limit 50` returns up to 50 bookmarks
  - Happy path: `x-cli bookmarks --all` paginates through all bookmarks
  - Edge case: user has no bookmarks — outputs empty `{ data: [], includes: {} }`
  - Edge case: `--limit 150` requires 2 API pages (max 100/page) — results are merged correctly
  - Error path: not authenticated — clear error suggesting `auth login`
  - Integration: response includes expanded media and user objects in `includes`

  **Verification:**
  - `x-cli bookmarks` outputs valid JSON with tweet data and expanded includes
  - Pagination works correctly for limits exceeding single page size

- [ ] **Unit 6: Tweets command**

  **Goal:** Implement `x-cli tweets <targets...>` to fetch tweets for one or more users with full metadata, filterable by count or date.

  **Requirements:** R4, R5, R6, R7

  **Dependencies:** Unit 3, Unit 4 (for username resolution pattern)

  **Files:**
  - Create: `src/commands/tweets.ts`
  - Create: `src/lib/output.ts`
  - Modify: `src/index.ts` (register tweets command)

  **Approach:**
  - Command: `x-cli tweets <targets...> [--limit <n>] [--since <date>] [--until <date>] [--no-replies] [--no-retweets]`
  - `<targets...>`: variadic — one or more usernames or user IDs. If starts with a digit, treat as user ID; otherwise resolve as username via batch user lookup
  - `--limit <n>`: max tweets per user to fetch (default 20, handles pagination for N > 100)
  - `--since <date>`: ISO date string, mapped to `start_time` API param
  - `--until <date>`: ISO date string, mapped to `end_time` API param
  - `--no-replies` / `--no-retweets`: maps to `exclude` API param
  - For multiple targets: resolve all usernames in one batch call, then fetch each user's timeline sequentially. Output is a JSON object keyed by username/ID, each containing their tweets and includes.
  - Uses `client.v2.userTimeline()` with all tweet.fields, expansions, media.fields from `fields.ts`
  - `output.ts`: Helper to merge paginated responses into a single JSON object, combining `data` arrays and deduplicating `includes`
  - Pagination: accumulate until limit reached or no more pages

  **Patterns to follow:**
  - Factory function pattern
  - Reuse username resolution from user command approach
  - Use shared field constants from `lib/fields.ts`

  **Test scenarios:**
  - Happy path: `x-cli tweets elonmusk --limit 5` returns 5 tweets as JSON with full metadata
  - Happy path: `x-cli tweets alice bob --limit 10` fetches tweets for both users, output keyed by user
  - Happy path: `x-cli tweets 123456789 --limit 10` uses ID directly without username resolution
  - Happy path: `x-cli tweets elonmusk --since 2026-01-01` returns tweets from that date onward
  - Happy path: `x-cli tweets elonmusk --since 2026-01-01 --until 2026-03-01` returns tweets in date range
  - Happy path: `x-cli tweets elonmusk --no-replies --no-retweets` excludes replies and retweets
  - Edge case: mix of usernames and IDs (`x-cli tweets alice 123456789`) — resolves usernames, uses IDs directly
  - Edge case: `--limit 250` requires 3 pages — results merged correctly with deduplicated includes
  - Edge case: user has fewer tweets than `--limit` — returns all available, no error
  - Error path: invalid username among multiple targets — reports error for that user, continues with others
  - Error path: invalid date format for `--since` — clear validation error
  - Integration: response includes expanded referenced_tweets, media, and author objects in `includes`

  **Verification:**
  - `x-cli tweets <username> --limit 5` outputs valid JSON with tweets and expanded includes
  - `x-cli tweets <u1> <u2>` outputs combined results for both users
  - Date filtering produces tweets only within the specified range
  - Pagination merges results correctly

- [ ] **Unit 7: Global options, help text, and polish**

  **Goal:** Add global `--verbose` flag, custom help text with examples, version from package.json, and ensure consistent error handling across all commands.

  **Requirements:** R6 (consistent output), overall UX

  **Dependencies:** Units 1-6

  **Files:**
  - Modify: `src/index.ts` (global options, help text, version)
  - Modify: `src/commands/auth.ts`, `src/commands/bookmarks.ts`, `src/commands/user.ts`, `src/commands/tweets.ts` (consistent error handling)

  **Approach:**
  - Global `--verbose` flag: when set, log API request details to stderr (doesn't pollute JSON stdout)
  - `configureHelp({ showGlobalOptions: true })` so subcommand help shows global flags
  - `addHelpText('after', ...)` with usage examples
  - Version read from package.json
  - Consistent error pattern: API errors print message to stderr and exit with non-zero code
  - `showSuggestionAfterError()` for typo correction on unknown commands

  **Patterns to follow:**
  - Commander `preAction` hook for verbose logging
  - `configureOutput` for colored error output

  **Test scenarios:**
  - Happy path: `x-cli --help` shows all commands with descriptions and examples
  - Happy path: `x-cli --version` prints version
  - Happy path: `x-cli tweets elonmusk --verbose` prints request details to stderr, JSON to stdout
  - Edge case: `x-cli unknowncmd` suggests closest match
  - Error path: API rate limit error shows friendly message with retry guidance

  **Verification:**
  - Help output is clear and includes examples
  - Verbose mode logs to stderr without corrupting JSON stdout
  - All error paths produce helpful messages

## System-Wide Impact

- **Interaction graph:** OAuth flow requires a temporary localhost HTTP server and opening the system browser. Token refresh happens transparently in `getClient()`.
- **Error propagation:** API errors are caught in command handlers, printed to stderr as human-readable messages, and exit with non-zero codes. JSON output goes to stdout only on success.
- **State lifecycle risks:** Token file could become corrupted if write is interrupted. Mitigate by writing to a temp file and renaming atomically.
- **API surface parity:** All three data-fetching commands use the same field constants and output structure.
- **Unchanged invariants:** This is a greenfield project — no existing interfaces to preserve.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| X API rate limits (especially bookmarks at 180/15min) | Surface rate limit errors clearly; don't auto-retry to avoid wasting quota |
| OAuth PKCE localhost redirect may conflict with other services on port 3000 | Make callback port configurable via `--port` option or env var |
| X API free tier has very limited monthly post cap (may not suffice) | Document tier requirements; the CLI itself is tier-agnostic |
| `twitter-api-v2` library could become unmaintained | Library is zero-dep and the API surface we use is stable v2; easy to replace if needed |
| Token file stored as plaintext | Use file permissions 600; document this is not suitable for shared/multi-user systems |

## Sources & References

- X API v2 overview: https://docs.x.com/x-api/overview
- X API bookmarks: https://docs.x.com/x-api/users/get-bookmarks
- X API user lookup: https://docs.x.com/x-api/users/user-lookup-by-username
- X API user tweets: https://docs.x.com/x-api/users/get-posts
- X API OAuth 2.0 PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Commander.js: https://github.com/tj/commander.js/
- twitter-api-v2: https://github.com/PLhery/node-twitter-api-v2
