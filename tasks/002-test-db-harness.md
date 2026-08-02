---
id: 002
title: Test database and seeding/reset harness
status: approved
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

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm test` -> N failing
- green commit: <sha> — `pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
