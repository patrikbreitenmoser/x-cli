# AXI Agent-First Upgrade Plan For `x-cli`

## Requirements Summary

Upgrade `x-cli` so agents can use it with fewer round trips, lower token cost, clearer failure handling, and no interactive blocking.

This plan uses the repo-local AXI skill as the primary design lens:

- TOON or another token-efficient structured stdout format should replace pretty JSON as the default output boundary.
- Commands should default to compact, action-driving responses rather than full API payload dumps.
- Errors, empty states, and no-op mutations should be explicit and machine-readable.
- The CLI should expose useful live state at startup and through hook-driven ambient context.
- Help should remain available, but live content should become the default experience.

## Current State Findings

1. The top-level CLI is help-first, not content-first. The entrypoint only configures Commander help/version and then parses subcommands; there is no live dashboard or default state view when no subcommand is provided. See [src/index.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/index.ts#L11) through [src/index.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/index.ts#L42).
2. Structured output is currently raw pretty JSON only. The entire output abstraction is `printJson(JSON.stringify(..., null, 2))`, which prevents compact schemas, TOON formatting, truncation, and consistent help/error envelopes. See [src/lib/output.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/output.ts#L22).
3. `auth login` is interactive and therefore violates AXI's "no prompts" rule. It prompts for `clientId` and `clientSecret` via Inquirer when flags are missing. See [src/commands/auth.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/auth.ts#L17) through [src/commands/auth.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/auth.ts#L35).
4. Error handling is inconsistent and mostly unstructured. Commands emit plain stderr strings and terminate with `process.exit(1)` directly instead of using a shared error contract and exit-code mapping. See [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L19) through [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L47), [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts#L126) through [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts#L212), and [src/lib/client.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/client.ts#L7) through [src/lib/client.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/client.ts#L40).
5. Default payloads are much larger than an agent usually needs. The CLI requests broad tweet/user/media field sets and prints the upstream API response shape directly, including `includes`, media variants, and descriptions by default. See [src/lib/fields.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/fields.ts#L3) through [src/lib/fields.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/fields.ts#L36), [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L15) through [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L43), and [src/commands/bookmarks.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/bookmarks.ts#L68) through [src/commands/bookmarks.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/bookmarks.ts#L72).
6. Empty states and partial-success states are ambiguous. `follows list` writes an instructional stderr line and exits successfully without a structured zero-result payload, while multi-user lookup/tweets emit warnings on stderr for missing names but still return raw mixed results. See [src/commands/follows.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/follows.ts#L31) through [src/commands/follows.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/follows.ts#L37), [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L35) through [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts#L43), and [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts#L42) through [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts#L47).
7. The CLI already has local state that could support an excellent ambient dashboard, but it is not surfaced automatically. Tokens, follow lists, and sync markers are persisted under `~/.x-cli/`, yet the tool does not expose a compact session summary or install hooks. See [src/lib/config.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/config.ts#L5), [src/lib/token-store.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/token-store.ts#L11), [src/lib/sync-state.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/sync-state.ts#L14), and [src/lib/follows-store.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/follows-store.ts#L4).

## Recommended Direction

Adopt AXI in three passes instead of trying to rewrite every command at once.

### Option A: Narrow compatibility pass

Keep the current command set and X API integration, but add:

- a shared output formatter
- structured errors
- non-interactive auth flags
- compact default schemas
- definitive empty states

Pros:

- Smallest diff
- Lowest delivery risk
- Preserves current user-visible surface

Cons:

- Still leaves the top-level CLI mostly command-first
- Delays hook-based ambient context and content-first UX

### Option B: Full agent-first surface

Do Option A, and also:

- make bare `x-cli` print a compact dashboard
- install Codex/Claude session hooks automatically
- add richer summaries and suggestions after list/mutation commands
- split detail output from list output with truncation and `--full`/`--fields`

Pros:

- Matches AXI much more closely
- Reduces agent round trips substantially
- Makes the tool self-discovering in session context

Cons:

- Requires new top-level behavior and hook management
- More acceptance surface to verify across platforms

### Recommendation

Choose Option B, but ship it in phases so the first release stabilizes the output contract before adding hook automation.

## Acceptance Criteria

1. Every command writes a machine-readable success or error envelope to stdout and reserves stderr for diagnostics only.
2. Default stdout format is TOON, with JSON available as an explicit compatibility flag such as `--format json`.
3. `auth login` can be completed entirely with flags or environment variables; missing required values return a structured usage error with exit code `2` instead of prompting.
4. List-style commands return compact default fields and support explicit expansion through flags such as `--fields` and `--full`.
5. Empty results are explicit zero-result payloads, not silent success or human-only stderr hints.
6. Multi-target commands report partial failures in-band, without forcing the caller to scrape stderr warnings.
7. Running `x-cli` with no subcommand prints a compact home view with executable path, one-line description, auth status, follows count, and sync summary.
8. The CLI provides contextual next-step hints only when the output naturally leads to follow-up actions.
9. Hook installation for Codex and Claude is idempotent, path-repairing, and scoped to the current executable path.
10. The repo has automated tests for output envelopes, exit codes, empty states, and the home view.

## Implementation Steps

### 1. Build a shared AXI output contract

Target files:

- [src/lib/output.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/output.ts)
- [src/index.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/index.ts)

Changes:

- Replace `printJson` with a formatter layer that can emit TOON and JSON.
- Introduce typed helpers for `printData`, `printError`, `printHelpHints`, and `printEmpty`.
- Centralize exit-code semantics: `0` success and no-op, `1` runtime failure, `2` usage error.
- Add an explicit global `--format <toon|json>` flag.

Why first:

- Every later AXI improvement depends on owning the stdout contract.

### 2. Eliminate interactive auth and normalize auth responses

Target files:

- [src/commands/auth.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/auth.ts)
- [src/lib/auth-flow.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/auth-flow.ts)
- [src/lib/token-store.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/token-store.ts)

Changes:

- Remove Inquirer-based prompts from `auth login`.
- Require `--client-id` and, if still needed by the X SDK path, `--client-secret` or matching env vars.
- Return structured success for login/logout/status instead of mixed stderr prose.
- Make auth failures actionable with CLI-native remediation hints.

Notes:

- The browser-open flow in [src/lib/auth-flow.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/auth-flow.ts#L72) through [src/lib/auth-flow.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/auth-flow.ts#L92) is acceptable as a side effect, but the command must still be fully flag-driven and non-prompting.

### 3. Separate list schemas from detail schemas

Target files:

- [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts)
- [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts)
- [src/commands/bookmarks.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/bookmarks.ts)
- [src/commands/follows.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/follows.ts)
- [src/lib/fields.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/fields.ts)

Changes:

- Define compact default schemas for each command:
  - `user`: `id`, `username`, maybe `name` if requested from API
  - `tweets`: `id`, `author`, `created_at`, truncated text
  - `bookmarks`: same compact tweet summary plus `count` and sync context
  - `follows list`: username rows plus total count
- Add `--fields` to opt into expanded fields.
- Add `--full` for detail outputs where long text should not be truncated.
- Stop returning raw X API envelopes by default; map them into stable CLI-owned shapes.

### 4. Make empty states, partial matches, and no-op mutations definitive

Target files:

- [src/commands/user.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/user.ts)
- [src/commands/tweets.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/tweets.ts)
- [src/commands/bookmarks.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/bookmarks.ts)
- [src/commands/follows.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/commands/follows.ts)

Changes:

- Return explicit `count: 0` / `results[0]` style payloads for empty lookups and empty follow lists.
- Report unmatched usernames inside the structured response instead of stderr warnings.
- Treat idempotent follow mutations as no-ops with exit code `0`, including already-present additions and already-absent removals.
- Carry suggestions in-band only when the next action is genuinely useful.

### 5. Add a content-first home view

Target files:

- [src/index.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/index.ts)
- [src/lib/config.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/config.ts)
- [src/lib/token-store.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/token-store.ts)
- [src/lib/follows-store.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/follows-store.ts)
- [src/lib/sync-state.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/lib/sync-state.ts)

Changes:

- Make bare `x-cli` print:
  - executable path
  - one-sentence description
  - auth status
  - follows count
  - last tweet sync
  - last bookmark sync
  - 2-3 relevant next-step commands
- Keep `--help` as the explicit reference surface.

### 6. Add hook installation and ambient session context

Target files:

- new module for hook management, likely under `src/lib/hooks.ts`
- [src/index.ts](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/src/index.ts)

Changes:

- On first invocation, install or repair Codex and Claude session-start hooks.
- Emit the same compact home/dashboard view through the hook entrypoint.
- Use absolute executable paths and make installs idempotent.

### 7. Add automated verification before widening the surface

Target files:

- new tests under a `test/` or `src/**/*.test.ts` layout
- [package.json](/Volumes/Daten/Developer/tries/2026-04-08-x-cli/package.json)

Changes:

- Add a test script and baseline coverage for:
  - formatter output in TOON and JSON
  - usage errors vs runtime errors
  - empty-state payloads
  - home view rendering
  - auth login validation without prompts
- Prefer built-in Node test tooling to avoid adding dependencies unless a stronger harness is clearly needed.

## Backlog Candidates

These are worthwhile, but should follow the core output-contract work:

1. Add `x-cli view tweet <id>` and `x-cli view user <id|username>` detail commands so list commands can stay compact.
2. Add pagination disclosure hints such as "showing 20 of 147 total" when totals are available cheaply.
3. Add stable machine-readable codes on errors, for example `AUTH_REQUIRED`, `INVALID_DATE`, `USER_NOT_FOUND`.
4. Add `--quiet-diagnostics` or `DEBUG=x-cli` support so debug logging remains available without contaminating stdout.
5. Add command aliases that match agent phrasing if usage data shows that helps discovery.

## Risks And Mitigations

1. Risk: TOON adoption could break existing JSON consumers.
   Mitigation: keep `--format json`, document the default change clearly, and consider a short transition window if external users already depend on JSON-by-default.
2. Risk: Mapping upstream X API responses into CLI-owned schemas can hide fields users still need.
   Mitigation: add `--fields` and `--full` escape hatches before removing raw payload defaults.
3. Risk: Hook installation may feel too magical or fail differently across platforms.
   Mitigation: keep installs idempotent, expose `x-cli hooks status/install/repair`, and log diagnostics to stderr only.
4. Risk: Browser-based auth remains fragile in headless environments.
   Mitigation: keep the printed authorization URL, make the callback-port failure structured, and consider a future device-code or copy/paste fallback if X supports it.

## Verification Steps

1. Run the test suite for formatter, error-envelope, and home-view coverage.
2. Manually verify `x-cli`, `x-cli --help`, `x-cli auth status`, `x-cli follows list`, `x-cli user <missing>`, and `x-cli tweets` with both success and empty-state scenarios.
3. Verify stdout contains only structured output and stderr contains only diagnostics.
4. Verify `auth login` with missing flags exits with code `2` and prints a structured usage error.
5. Verify hook installation is idempotent and rewrites stale executable paths correctly.
6. Verify `--format json` and default TOON outputs represent the same underlying data.

## Suggested Delivery Order

1. Output contract and exit-code layer
2. Non-interactive auth
3. Compact schemas and empty-state cleanup
4. Content-first home view
5. Hook installation
6. Detail commands and additional ergonomics

## Remaining Evidence Gaps

I could not run `node`, `npm`, or the compiled CLI in this shell because those binaries are not installed in the current environment. The plan is therefore grounded in source inspection and the published TOON spec rather than live command execution.
