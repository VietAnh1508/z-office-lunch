---
id: 003
title: Restaurants CRUD (create + list) with first admin screen
status: approved
depends_on: [002]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

First real vertical slice: admin can register a restaurant (the entity everything else — menu items, rounds — hangs off). Also establishes patterns every later task reuses: a route-module split in `apps/api`, real Drizzle usage via a `getDb(c)` helper (replacing the raw `pg` client the health check uses), `react-router` in `apps/web`, and a shared fetch wrapper.

## Acceptance Criteria

- [ ] `apps/api/src/lib/get-db.ts`: a small helper wrapping `createDb` from `packages/db`, given `c.env.HYPERDRIVE.connectionString`
- [ ] `apps/api/src/routes/restaurants.ts`: `POST /api/restaurants` (`name` required, `contactInfo` / `menuSourceNote` optional) and `GET /api/restaurants`, mounted in `apps/api/src/index.ts` via `app.route(...)`
- [ ] `POST` without `name` returns 400; valid `POST` persists a row and is retrievable via `GET`
- [ ] `react-router` (v7, declarative mode) added to `apps/web`; `/admin` route renders a restaurant list + create form (shadcn `Input`/`Button`, generate `Form`/`Card` if needed)
- [ ] `apps/web/src/lib/api.ts`: a small fetch wrapper (base path, JSON parsing, error handling) used by the restaurant screen and reused by every later UI task
- [ ] New API routes use `await client.end()` directly (not `c.executionCtx.waitUntil`) since tests exercise the app via `app.request()` outside a real Worker's lifecycle

## Plan

1. `apps/api/src/lib/get-db.ts` — `getDb(c)` returns `createDb(c.env.HYPERDRIVE.connectionString)`.
2. `apps/api/src/routes/restaurants.ts` — Hono sub-router with `POST`/`GET`, mounted at `/api/restaurants` in `index.ts`.
3. TDD unit (Vitest + `app.request()` against the test DB from task 002): valid POST persists and GET returns it; POST missing `name` is 400.
4. `apps/web`: install `react-router`, wrap `main.tsx` in `<BrowserRouter>`, add `/admin` route rendering a new `apps/web/src/routes/admin/Restaurants.tsx` (list + create form) using the new `lib/api.ts` wrapper.
5. Manual/e2e smoke: creating a restaurant through the UI shows it in the list without a page reload.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
