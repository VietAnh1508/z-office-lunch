---
id: 001
title: Scaffold project structure per docs/architecture.md
status: done
depends_on: []
parallelizable_with: []
tdd: exempt  # one-time scaffolding, done outside the /plan-task -> /implement-task loop
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-01
---

## Goal

Stand up the pnpm workspace, apps, and packages described in `docs/architecture.md` (empty but runnable), so the first real `/plan-task` feature work has somewhere to land.

## Acceptance Criteria

- [x] pnpm workspace root with `apps/web`, `apps/api`, `packages/db`
- [x] `packages/db` has a Drizzle schema for all six entities from `docs/architecture.md`'s data model, plus config and an initial generated migration
- [x] `apps/api` is a Hono Worker with one `/api/health` route, `wrangler.jsonc` configured with `nodejs_compat`, an `assets` binding serving `apps/web`'s build with SPA fallback, and placeholder Hyperdrive + R2 bindings
- [x] `apps/web` is a Vite React TS app with Tailwind v4 and shadcn/ui initialized, rendering one placeholder component
- [x] Local Postgres via `docker-compose.yml`, wired to `wrangler dev` and test runs via `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>`
- [x] Vitest configured with one trivial passing test; Playwright configured with one smoke test against `wrangler dev`
- [x] `CLAUDE.md`'s "App" section and `docs/architecture.md`'s stale "not yet decided" language are filled in / removed
- [x] Clean `pnpm install`, workspace typecheck, `apps/web` build, `wrangler dev` serving both `/api/health` and the SPA shell, migration applying against local Postgres, and both test suites all pass

## Plan

See build order agreed in conversation: root config -> packages/db -> apps/api -> apps/web -> docker-compose + Hyperdrive local wiring -> test configs -> docs updates -> full verification pass.

## Implementation Log

No red/green commits — tdd: exempt. Verification performed (not just "files exist"):

- Clean `pnpm install` from scratch, `pnpm typecheck` (now covers root `e2e/`+configs too, not just the 3 workspace packages — confirmed by deliberately breaking a type and seeing it fail), `pnpm build`, `pnpm test`, `pnpm test:e2e` all pass.
- `packages/db`: generated migration against local Postgres, inspected the actual table/constraint DDL — both `unique(round_id, menu_item_id)` and `unique(round_id, employee_id)` landed correctly.
- Hyperdrive local wiring: `/api/health` does a real `SELECT 1` through `env.HYPERDRIVE`. Negative control — `wrangler dev` with no `apps/api/.env` — hard-fails with Wrangler's own "set CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE" error, proving the override is load-bearing, not just present. With `.env` copied from `.env.example`, health check returns `{status: "ok", db: "ok"}`.
- SPA fallback: confirmed `/rounds/1` (a non-existent client route) returns 200 with the SPA shell, not a 404, and `/api/health` still reaches the Worker.

Machine-level changes made outside the repo (disclosed to user): installed `docker` + `docker-compose` via Homebrew, added `cliPluginsExtraDirs` to `~/.docker/config.json`, started `colima`. A Postgres container is left running (`pnpm db:down` / `colima stop` to tear down).

Not exercised: nothing yet imports `packages/db` from `apps/api` (the Hono Worker uses a direct `pg` client for the health check, not Drizzle) — first real feature task will be the first test of that import path.

## Review Notes

(none — scaffolding is exempt from the per-task code-reviewer pass; normal review applies to the first real feature task built on top of this.)
