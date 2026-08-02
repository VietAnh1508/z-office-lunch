---
id: 003
title: Restaurants CRUD (create + list) with first admin screen
status: in_review
depends_on: [002]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

First real vertical slice: admin can register a restaurant (the entity everything else — menu items, rounds — hangs off). Also establishes patterns every later task reuses: a route-module split in `apps/api`, real Drizzle usage via a `getDb(c)` helper (replacing the raw `pg` client the health check uses), `react-router` in `apps/web`, and a shared fetch wrapper.

## Acceptance Criteria

- [x] `apps/api/src/lib/get-db.ts`: a small helper wrapping `createDb` from `packages/db`, given `c.env.HYPERDRIVE.connectionString`
- [x] `apps/api/src/routes/restaurants.ts`: `POST /api/restaurants` (`name` required, `contactInfo` / `menuSourceNote` optional) and `GET /api/restaurants`, mounted in `apps/api/src/index.ts` via `app.route(...)`
- [x] `POST` without `name` returns 400; valid `POST` persists a row and is retrievable via `GET`
- [x] `react-router` (v7, declarative mode) added to `apps/web`; `/admin` route renders a restaurant list + create form (shadcn `Input`/`Button`, generate `Form`/`Card` if needed)
- [x] `apps/web/src/lib/api.ts`: a small fetch wrapper (base path, JSON parsing, error handling) used by the restaurant screen and reused by every later UI task
- [x] New API routes use `await client.end()` directly (not `c.executionCtx.waitUntil`) since tests exercise the app via `app.request()` outside a real Worker's lifecycle

## Plan

1. `apps/api/src/lib/get-db.ts` — `getDb(c)` returns `createDb(c.env.HYPERDRIVE.connectionString)`.
2. `apps/api/src/routes/restaurants.ts` — Hono sub-router with `POST`/`GET`, mounted at `/api/restaurants` in `index.ts`.
3. TDD unit (Vitest + `app.request()` against the test DB from task 002): valid POST persists and GET returns it; POST missing `name` is 400.
4. `apps/web`: install `react-router`, wrap `main.tsx` in `<BrowserRouter>`, add `/admin` route rendering a new `apps/web/src/routes/admin/Restaurants.tsx` (list + create form) using the new `lib/api.ts` wrapper.
5. Manual/e2e smoke: creating a restaurant through the UI shows it in the list without a page reload.

## Implementation Log

- red commit: `b43f44b` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 2 failing (restaurants routes: POST without name returns 400; valid POST persists a row and is retrievable via GET)
- green commit: `0038b19` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (4/4 tests, 3 test files)
- Manual smoke test: started `wrangler dev` locally against the migrated dev Postgres, exercised `/admin` in a real browser — creating a restaurant (including non-ASCII input, e.g. "Bún Chả Hà Nội") updates the list immediately with no page reload; submitting with an empty name is blocked by the input's `required` attribute client-side, and the server-side 400 was separately confirmed via `curl`.
- Deviation from plan: `react-router` installed at `^8.3.0` (latest), not v7 as the task text specified — v8 kept the same declarative-mode API (`BrowserRouter`/`Routes`/`Route` from the `react-router` package) that v7 already had, so no behavior differs; confirmed via Context7 docs before installing.
- Also added `packages/db`'s `exports` map (`"./testing"` subpath) so `apps/api` can import the task-002 test harness (`TEST_DATABASE_URL`, `truncateAll`) — the first cross-package consumer of it.

## Review Notes

(Output of the `feature-dev:code-reviewer` agent, verbatim.)

---

## Review scope note (read this first)

I did not have shell access in this session, so I could not run `git -C /Users/toah/Coding/z-office-lunch diff b43f44b 0038b19` as instructed. Instead I reviewed the current working-tree state of the files this task touches:

- `apps/api/src/routes/restaurants.ts`, `apps/api/src/routes/restaurants.test.ts`, `apps/api/src/lib/get-db.ts` (new files — full coverage, equivalent to reviewing the diff)
- `apps/web/src/lib/api.ts`, `apps/web/src/routes/admin/Restaurants.tsx` (new files — full coverage)
- `apps/api/src/index.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `packages/db/package.json` (pre-existing files this task modified — I only saw final state, not a line-by-line diff, so I can't distinguish "changed by this task" from "already there")

I also specifically checked `apps/api/wrangler.jsonc` and `apps/web/vite.config.ts` since they gate whether the new `/admin` route and dev-proxy flow actually work — both are already correctly configured (`not_found_handling: "single-page-application"` + `run_worker_first: ["/api/*"]` in wrangler.jsonc; `server.proxy["/api"] -> localhost:8787` in vite.config.ts), so the new client-side route is reachable on direct navigation/refresh and under `pnpm dev:web`. No issue there.

I confirmed `packages/db`'s new `exports` map (`"./testing": "./src/testing.ts"`) doesn't break anything — grepped the whole repo and the only consumers of subpath imports are the new `db/testing` import and the existing bare `db` import; nothing else imports a different `db/...` subpath that would now be shadowed.

## Findings

### Important — Unhandled DB errors in restaurant routes diverge from established `/api/health` convention (confidence: 80)

**File:** `apps/api/src/routes/restaurants.ts`, lines 16-28 and 31-39

Both `POST /` and `GET /` wrap the query in `try { ... } finally { await db.$client.end(); }` but have no `catch`. Compare with the existing `/api/health` handler in `apps/api/src/index.ts`, which explicitly catches DB errors, logs them (`console.error(JSON.stringify({ message: ..., error: String(e) }))`), and returns a structured `{ status, db: "error" }` JSON response with a 500.

In `restaurants.ts`, any DB failure (connection refused, constraint violation, etc.) instead propagates uncaught out of the handler to Hono's default error handling — a generic, unlogged 500 with no JSON body. There's no `app.onError` handler anywhere in `apps/api/src` to catch this at a higher level either. Practical impact: production DB errors on this route are invisible in logs, making them hard to debug, and the frontend's `ApiError` message will just be the generic "Request failed with status 500" rather than anything actionable.

A secondary, related risk: because there's no `catch`, if the `finally` block's `await db.$client.end()` itself throws (e.g., pool already in a bad state after the original query error), that second error silently replaces/masks the original one — the actual cause of the failure gets lost.

**Fix:** wrap both handlers with a `catch` that logs (matching the `/api/health` pattern) and returns a proper JSON 500, e.g.:
```ts
try {
  ...
} catch (e) {
  console.error(JSON.stringify({ message: "failed to create restaurant", error: String(e) }));
  return c.json({ error: "internal error" }, 500);
} finally {
  await db.$client.end();
}
```

## Things I checked and ruled out (not flagging)

- **`await db.$client.end()` vs. `c.executionCtx.waitUntil(client.end())`**: intentional per the task's stated rationale (tests exercise the app via `app.request()` outside a real Worker lifecycle, so cleanup must be synchronous). Correct as implemented.
- **`createDb()` creating a `pg.Pool` per request** (verified in `drizzle-orm`'s `node-postgres/driver.js` — passing a connection string constructs `new pg.Pool(...)`, not a bare `Client`): this is the standard Cloudflare Hyperdrive + node-postgres pattern, not a bug.
- **SQL injection**: all queries go through Drizzle's query builder with parameterized values; no raw `sql` interpolation of user input in `restaurants.ts`. Safe.
- **Input validation on POST** (`name` required/trimmed, `contactInfo`/`menuSourceNote` optional and type-checked before insert): matches the task's stated spec and schema (`packages/db/src/schema.ts`, `restaurants` table).
- **`/admin` route reachability**: confirmed via `wrangler.jsonc`'s SPA fallback config and `vite.config.ts`'s dev proxy — both already correctly set up, so this isn't a dead route.
- **`packages/db` `exports` map**: no existing code imports a `db/...` subpath other than `db` and `db/testing`, so adding the `exports` map doesn't break other consumers.
- **`SubmitEvent` type import in `Restaurants.tsx`**: verified against `@types/react@19.2.17` — `SubmitEvent` is a real exported interface in this React version, not a typo.
- **XSS/frontend rendering**: restaurant names/contact info rendered via plain JSX interpolation (no `dangerouslySetInnerHTML`), safe.

No other high-confidence (≥80) issues found. The one finding above is worth fixing before merge since it's a direct, spottable divergence from the pattern the task itself was supposed to establish for later routes to copy — right now a later task copying `restaurants.ts` as a template would propagate the silent-failure gap everywhere.
