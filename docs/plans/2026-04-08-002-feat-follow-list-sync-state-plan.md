---
title: "feat: Add follow list and sync state for incremental collection"
type: feat
status: active
date: 2026-04-08
---

# feat: Add follow list and sync state for incremental collection

## Overview

Add a managed list of X accounts ("follows") and global sync state so that `x-cli tweets` without arguments fetches only new tweets for all followed accounts since the last tweet sync, and `x-cli bookmarks` without `--since` fetches only new bookmarks since the last bookmark sync.

## Problem Frame

Currently, every fetch requires explicitly naming users and date ranges. For a regular workflow of tracking a group of accounts and bookmarks, this is tedious. The user wants to define a follow list once, then run single commands to get new content since last time.

## Requirements Trace

- R1. Store a list of X accounts to follow in `~/.x-cli/follows.json`
- R2. Manage the list via `x-cli follows add/remove/list` subcommands
- R3. Store global sync timestamps (one for tweets, one for bookmarks) in `~/.x-cli/sync-state.json`
- R4. When `x-cli tweets` is called with no targets, use the follows list and tweets sync date
- R5. When `x-cli bookmarks` is called, use bookmarks sync date to stop pagination at already-seen tweets
- R6. After successful fetches, update the relevant sync timestamp
- R7. Existing explicit usage (`x-cli tweets alice --since ...`) continues to work unchanged

## Scope Boundaries

- No scheduling or cron — pull-based
- No per-account sync dates — single global date per command type
- Bookmarks API has no server-side date filter — client-side cutoff during pagination

## Key Technical Decisions

- **Two global sync dates:** `tweets.lastSyncedAt` and `bookmarks.lastSyncedAt`. They're independent operations with different schedules — syncing tweets daily but bookmarks weekly is natural.
- **follows.json format:** Array of strings (usernames). Simple to hand-edit. Example: `["elonmusk", "naval", "paulg"]`
- **sync-state.json format:**
  ```json
  {
    "tweets": { "lastSyncedAt": "2026-04-08T18:00:00Z" },
    "bookmarks": { "lastSyncedAt": "2026-04-07T12:00:00Z" }
  }
  ```
- **Bookmarks sync:** Since the API doesn't support date filtering, paginate and stop when we hit a tweet with `created_at` older than `bookmarks.lastSyncedAt`.
- **Sync timestamp source:** Use current time at fetch start (not tweet timestamps) — simpler, avoids edge cases with tweet ordering.

## Implementation Units

- [ ] **Unit 1: Follows store and commands**

  **Goal:** Create `follows.json` management — store module and CLI commands.

  **Requirements:** R1, R2

  **Dependencies:** None

  **Files:**
  - Create: `src/lib/follows-store.ts`
  - Create: `src/commands/follows.ts`
  - Modify: `src/index.ts` (register follows command)

  **Approach:**
  - `follows-store.ts`: `loadFollows()`, `saveFollows()`, `addFollows()`, `removeFollows()` on a string array
  - `addFollows` deduplicates (case-insensitive), stores lowercase
  - `follows.ts`: command group with `add <usernames...>`, `remove <usernames...>`, `list`

  **Patterns to follow:** `src/lib/token-store.ts` — same config dir and read/write pattern

  **Test scenarios:**
  - Happy path: `follows add alice bob` → creates follows.json with `["alice", "bob"]`
  - Happy path: `follows list` → prints current list as JSON
  - Happy path: `follows remove alice` → removes from list
  - Edge case: `follows add Alice ALICE alice` → stores only one `"alice"`
  - Edge case: `follows list` with no file → prints empty array

  **Verification:** `~/.x-cli/follows.json` is created and updated correctly

- [ ] **Unit 2: Sync state store**

  **Goal:** Create module to read/write global sync timestamps.

  **Requirements:** R3, R6

  **Dependencies:** None

  **Files:**
  - Create: `src/lib/sync-state.ts`

  **Approach:**
  - `loadSyncState()`, `getLastSynced(type: 'tweets' | 'bookmarks')`, `updateLastSynced(type, isoTimestamp)`
  - Writes immediately on update

  **Patterns to follow:** `src/lib/token-store.ts`

  **Test scenarios:**
  - Happy path: `getLastSynced("tweets")` returns null when no state exists
  - Happy path: `updateLastSynced("tweets", timestamp)` persists, subsequent read returns it
  - Edge case: file doesn't exist → created on first write

  **Verification:** `~/.x-cli/sync-state.json` reflects correct timestamps

- [ ] **Unit 3: Integrate sync into tweets command**

  **Goal:** `x-cli tweets` with no args uses follows list + tweets sync date.

  **Requirements:** R4, R6, R7

  **Dependencies:** Units 1, 2

  **Files:**
  - Modify: `src/commands/tweets.ts`

  **Approach:**
  - Make `<targets...>` optional in commander
  - No targets → load follows; if empty, error
  - Use `tweets.lastSyncedAt` as `--since` default when no explicit `--since` given and using follows list
  - After successful fetch, update `tweets.lastSyncedAt`
  - Explicit targets → unchanged behavior, no sync state interaction

  **Patterns to follow:** Existing multi-user fetch loop in `src/commands/tweets.ts`

  **Test scenarios:**
  - Happy path: `x-cli tweets` with follows fetches all, updates sync date
  - Happy path: second run uses stored date as start_time
  - Happy path: `x-cli tweets charlie` (explicit) ignores follows/sync
  - Edge case: first run (no sync state) → fetches without start_time
  - Edge case: empty follows list → clear error message
  - Error path: fetch fails → sync date not updated

  **Verification:** Subsequent `x-cli tweets` runs only return newer tweets

- [ ] **Unit 4: Integrate sync into bookmarks command**

  **Goal:** `x-cli bookmarks` uses bookmarks sync date to stop at already-seen content.

  **Requirements:** R5, R6

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/commands/bookmarks.ts`

  **Approach:**
  - Load `bookmarks.lastSyncedAt` before fetching
  - During pagination, check each tweet's `created_at` — stop when hitting one older than last sync
  - After successful fetch, update `bookmarks.lastSyncedAt`
  - If `--all` flag is passed, ignore sync date (fetch everything)

  **Patterns to follow:** Existing pagination loop in `src/commands/bookmarks.ts`

  **Test scenarios:**
  - Happy path: first `x-cli bookmarks` fetches all (no sync state), updates date
  - Happy path: second run stops pagination at already-seen tweets
  - Happy path: `x-cli bookmarks --all` ignores sync date
  - Edge case: all bookmarks are newer than sync date → full pagination as normal

  **Verification:** Subsequent `x-cli bookmarks` runs return only newer bookmarks

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Bookmarks client-side cutoff may fetch extra pages before hitting old tweets | Acceptable — bookmarks API returns reverse chronological, so cutoff is fast |
| sync-state.json corruption if killed mid-write | Acceptable for personal CLI — small file, easily regenerated |

## Sources & References

- Related code: `src/lib/token-store.ts` (config dir pattern)
- Related code: `src/commands/tweets.ts` (multi-user fetch loop)
- Related code: `src/commands/bookmarks.ts` (pagination loop)
