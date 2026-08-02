---
id: 002
title: Test database and seeding/reset harness
status: done
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm test"
created: 2026-08-02
---

## Goal

Every feature task from here on needs to seed fixture rows and reset state between tests, and nothing in the repo does that yet (no test DB, no truncate/seed helpers, no migration step wired into local dev). Build that harness once so it doesn't get reinvented per task.

## Acceptance Criteria

- [ ] A second Postgres database (`office_lunch_test`) exists in `docker-compose.yml`'s existing Postgres service (not a second container)
- [ ] `packages/db/src/testing.ts` exports `truncateAll(db)` plus seed-factory functions for each entity needed by later tasks (`seedRestaurant`, `seedMenuItem`, `seedEmployee`, `seedRound`, `seedRoundMenuItem`), each returning the inserted row — plain functions, not Vitest hooks, so Playwright can reuse them too
- [ ] Vitest `globalSetup` migrates `office_lunch_test` once per run (reuses `packages/db/src/migrate.ts`); `vitest.config.ts` sets `fileParallelism: false` so truncate-between-tests doesn't race across parallel files
- [ ] Playwright's `webServer.env` in `playwright.config.ts` points the Hyperdrive local-override var at `office_lunch_test` instead of the dev DB, and its own `globalSetup` calls the same `truncateAll`/seed functions — `pnpm test:e2e` must stop mutating dev data
- [ ] `scripts/dev.sh` runs `db:migrate` after `docker compose up -d --wait` (currently missing entirely — a fresh machine never gets its schema applied automatically)
- [ ] Running the full test suite twice back-to-back is green both times (proves the reset is idempotent, not just "passes once")

## Plan

1. Add `office_lunch_test` to `docker-compose.yml`'s Postgres init (a second `CREATE DATABASE` via the existing init mechanism, or a startup script — whichever `docker-compose.yml` already supports most simply).
2. Write `packages/db/src/testing.ts`: `truncateAll(db)` (TRUNCATE ... CASCADE across all six tables) and one seed factory per entity, each taking optional field overrides and returning the inserted row.
3. Add a Vitest `globalSetup` script that calls `migrate` against `office_lunch_test`'s connection string; set `fileParallelism: false` in `vitest.config.ts`.
4. Update `playwright.config.ts`: override `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in `webServer.env` to the test DB URL, add a `globalSetup` that truncates+seeds baseline state if needed.
5. Add `db:migrate` (or equivalent) as a step in `scripts/dev.sh` right after `docker compose up -d --wait`.
6. TDD unit: a round-trip test in `packages/db` — `truncateAll` then `seedRestaurant` then a plain select confirms one row — run twice consecutively to prove idempotence.

## Implementation Log

- red commit: `10f4809` — `pnpm test` -> 1 failing (packages/db/src/testing.test.ts couldn't resolve `./testing`, which didn't exist yet — the honest red for a brand-new module, not a config/typo error)
- green commit: `505284f` — `pnpm test` -> all passing, run twice back-to-back (2 passed / 2 passed both times, confirming truncate+seed is idempotent)
- `pnpm typecheck` — clean, including `db.$client.end()` and the `$inferInsert` intersection types on the seed factories
- `pnpm test:e2e` isolation, verified empirically (not just by reading config): inserted a marker row into the dev `office_lunch` DB, ran `pnpm test:e2e` (with the pre-existing `pnpm dev` wrangler process on :8787 stopped first — see caveat below), confirmed the marker survived untouched in `office_lunch` while `office_lunch_test` was truncated to 0 rows and the 2 e2e tests passed
- Discovered and worked around a real Wrangler gotcha: `wrangler dev`'s `.env` loading (`process.env = loadDotEnv(...)` in its CLI bootstrap) fully replaces `process.env`, so a plain Playwright `webServer.env` override of `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` would silently lose to `apps/api/.env`. Fixed by adding a committed `apps/api/.env.test` (non-secret, fixed localhost content — `.gitignore` carries an exception for it like `.env.example`) and an `api` package script `dev:e2e` that passes `--env-file=.env.test`, which makes Wrangler skip `.env` entirely. `playwright.config.ts`'s `webServer.command` now runs `dev:e2e` instead of `dev`.
- `ensureTestDatabase()` in `packages/db/src/testing.ts` creates `office_lunch_test` at runtime (via the Postgres maintenance DB) if it doesn't already exist, so the harness works on already-initialized dev volumes, not just fresh ones — the `docker-compose.yml`/`scripts/postgres-init` init script only takes effect on a brand-new volume, per Postgres's `docker-entrypoint-initdb.d` convention.

**Known caveat, not fixed by this task:** `playwright.config.ts`'s `webServer.reuseExistingServer: !process.env.CI` means that if a `pnpm dev`/`wrangler dev` is already running on :8787 locally, Playwright reuses it (pointed at the dev DB) instead of starting `dev:e2e` — silently reintroducing dev-DB mutation. Pre-existing behavior from task 001, out of scope here, but worth knowing before trusting `pnpm test:e2e` in a terminal that already has `pnpm dev` running elsewhere.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

### Review scope and a caveat up front

I do not have a Bash tool available in this session, so I could not run `git show 10f4809` / `git diff 10f4809 505284f` directly. Instead I reviewed the current working-tree state (repo is clean, HEAD = `d2f7b13`, several commits after `505284f`). Since `d2f7b13` and `0ed9f0b` are docs/planning commits that don't touch `packages/db`, `vitest.config.ts`, `playwright.config.ts`, or `e2e/`, I'm confident this reflects the `505284f` diff faithfully, but flagging the method so you can weight it accordingly.

One thing I could not verify without Bash: whether `apps/api/.env.test` is actually tracked by git. `.gitignore`'s `!apps/api/.env.test` negation is syntactically correct (no parent directory is excluded, so the re-include is valid), and a clean `git status` is consistent with it being committed — but it's equally consistent with it being untracked-and-ignored. If it's the latter, CI will fail on `--env-file=.env.test` while it works locally. Worth a quick `git ls-files apps/api/.env.test` to confirm.

Reviewed files: `packages/db/src/testing.ts`, `packages/db/src/testing.test.ts`, `packages/db/src/migrate.ts`, `packages/db/src/vitest-global-setup.ts`, `vitest.config.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/smoke.spec.ts`, `scripts/dev.sh`, `docker-compose.yml`, `scripts/postgres-init/01-create-test-db.sql`, `apps/api/.env.test`, `apps/api/.env.example`, `apps/api/package.json`, `apps/api/wrangler.jsonc`, `package.json`, `packages/db/package.json`, `packages/db/src/schema.ts`.

### Important

**1. `scripts/dev.sh`'s new `pnpm db:migrate` step can fail on a cold machine — the exact case the script is meant to handle (confidence: 80)**

`docker-compose.yml`'s healthcheck is `pg_isready -U postgres` with `interval: 2s` and no `start_period`, and `pnpm db:migrate` runs immediately after `docker compose up -d --wait` returns (`scripts/dev.sh:17-21`).

On a fresh `postgres-data` volume, the official Postgres entrypoint runs `initdb`, then starts a temporary server bound only to the Unix socket to execute `docker-entrypoint-initdb.d/01-create-test-db.sql`, then shuts it down and starts the real TCP listener. `pg_isready -U postgres` with no `-h` connects over the socket by default, so it can report `healthy` against that *temporary* init-time server — before TCP on `localhost:5432` (which `pnpm db:migrate`'s default connection string uses) is actually accepting connections. With `set -euo pipefail`, `pnpm db:migrate` then dies with `ECONNREFUSED` and kills the whole script — directly contradicting CLAUDE.md's "Safe to run from a fully cold machine" claim, and this is precisely the path where the new `01-create-test-db.sql` init script also needs to run.

Fix: make the healthcheck force TCP and give it time to stabilize, e.g. in `docker-compose.yml`:
```yaml
test: ["CMD-SHELL", "pg_isready -U postgres -d office_lunch -h 127.0.0.1"]
start_period: 30s
```

**2. CLAUDE.md's "non-obvious bits" list is now stale (confidence: 80)**

CLAUDE.md explicitly maintains a list titled "Non-obvious bits the scripts themselves don't tell you," which currently only calls out that `dev:api` and `test:e2e` need Postgres already up. This diff adds `globalSetup: ["./packages/db/src/vitest-global-setup.ts"]` to `vitest.config.ts`, so **`pnpm test` (plain Vitest) now also hard-requires a running Postgres** via `ensureTestDatabase()` — previously e.g. `schema.test.ts` was a pure unit test runnable anywhere. On a cold machine with no Postgres running, `pnpm test` now fails with a raw connection-refused error instead of running. Since this file is the project's designated single source for exactly this kind of gotcha (per CLAUDE.md's own documentation principles), it should be updated to mention that `pnpm test` now needs Postgres up too.

### Confirmed sound (no action needed)

- `truncateAll`'s explicit six-table `TRUNCATE ... RESTART IDENTITY CASCADE` list and the seed factory functions in `packages/db/src/testing.ts` correctly match `packages/db/src/schema.ts` (required override keys for FK columns are enforced by the TS types).
- `ensureTestDatabase()`'s `CREATE DATABASE "${testDbName}"` string interpolation is not a practical injection risk — `testDbName` comes from an env-configurable constant, not attacker input.
- `migrate.ts`'s `isMain` check via `fileURLToPath`/`path.resolve(process.argv[1])` is a correct, standard ESM CLI-entry guard, and `runMigrations()` properly closes its pool (`db.$client.end()`) — no leak from repeated calls across `vitest-global-setup.ts` and `e2e/global-setup.ts`.
- `vitest.config.ts`'s `fileParallelism: false` correctly prevents cross-file truncate races; no shared-connection race given the current single DB-touching test file.
- The `apps/api/.env.test` + `dev:e2e --env-file=.env.test` workaround for Wrangler's `.env`-replaces-`process.env` behavior is a deliberate, documented choice that was empirically verified in the task's Implementation Log (marker-row test showing dev DB untouched, test DB truncated) — sound as implemented, regardless of Wrangler's docs being ambiguous on the exact precedence rules.
- `reuseExistingServer: !process.env.CI` in `playwright.config.ts` is already documented as a known, out-of-scope caveat in the task file.

### Lower-confidence note (below reporting threshold, flagging anyway since it's cheap to fix)

`TEST_DATABASE_URL` in `packages/db/src/testing.ts` is env-overridable (`process.env.TEST_DATABASE_URL ?? "..."`), but `apps/api/.env.test` hardcodes the same connection string with no way to follow an override. If someone sets `TEST_DATABASE_URL` for a Vitest run, `e2e/global-setup.ts` would migrate/truncate a different database than the one the Worker under test actually connects to, silently. Given nothing currently overrides this var in practice, I'd put this around 60-65 confidence — not blocking, but consider just making it a plain constant (drop the env override) to remove the divergence entirely.

**Post-review verification:** confirmed `apps/api/.env.test` is tracked (`git ls-files apps/api/.env.test` returns it) — the reviewer's uncertainty on that point is resolved; it is committed.

### Fixes applied after review

Both "Important" findings addressed (uncommitted — for your review alongside the task's status flip):

1. **`docker-compose.yml` healthcheck race — fixed.** Changed `pg_isready -U postgres` to `pg_isready -U postgres -d office_lunch -h 127.0.0.1` (forces a real TCP check) and added `start_period: 30s`. Verified the race was real before fixing: ran two throwaway `docker run` containers (not the project's own volume/container, so nothing of yours was touched) — one confirmed the new TCP-based command reports healthy only once a real client connection succeeds; a second ran the old and new checks side-by-side from cold start and measured the old (socket-default) check going healthy ~0.33s before the new (TCP) check, i.e. exactly the window where `pnpm db:migrate` could have hit `ECONNREFUSED` on a cold machine.
2. **CLAUDE.md's "non-obvious bits" list — fixed.** Added a line noting plain `pnpm test` now also hard-requires Postgres to be up (via Vitest's new `globalSetup`), not just `test:e2e`.
