---
id: 013
title: TanStack Query integration + Restaurants retrofit
status: done
depends_on: [012]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

`apps/web`'s only shipped feature (task 003, restaurants admin screen) hand-rolls data fetching: a `useEffect` fetch-on-mount, manual `restaurants`/`error`/`submitting` `useState`, and no distinction between "still loading" and "loaded and empty." This task adds TanStack Query, mounts a `QueryClientProvider` at the app root, and retrofits the restaurants screen onto `useQuery`/`useMutation` — establishing the query-key/hook convention that tasks 004+ (menu items, employees, rounds, etc.) can copy for their own screens. Not in scope: editing tasks 004-010's plan text, or building any new CRUD screens.

## Acceptance Criteria

- [x] `@tanstack/react-query` and `@tanstack/react-query-devtools` added to `apps/web/package.json` `dependencies` (both — `main.tsx` statically imports the devtools component, so it must resolve at build time even though it's only rendered when `import.meta.env.DEV` is true)
- [x] `apps/web/src/lib/query-client.ts` (new): single `QueryClient` instance for the app
- [x] `apps/web/src/routes/admin/useRestaurants.ts` (new): `restaurantKeys`, `useRestaurants()` (list `useQuery`), `useCreateRestaurant()` (create `useMutation`, invalidating the list query via `queryClient.invalidateQueries` on success) — both wrapping the existing `api.get`/`api.post` from `apps/web/src/lib/api.ts` as `queryFn`/`mutationFn`
- [x] `apps/web/src/test/render.tsx` (new): `renderWithProviders` helper wrapping RTL's `render` in a `QueryClientProvider` backed by a fresh `QueryClient` per test with `retry: false` on queries and mutations
- [x] `apps/web/src/main.tsx`: wraps the app in `QueryClientProvider`; mounts `ReactQueryDevtools` gated behind `import.meta.env.DEV`
- [x] `apps/web/src/routes/admin/Restaurants.tsx`: uses `useRestaurants()`/`useCreateRestaurant()` exclusively — no leftover manual fetch/submitting state; loading and error states render distinctly from the empty state
- [x] `apps/web/src/routes/admin/Restaurants.test.tsx` (new, MSW-backed via task 012's infra): list renders restaurants from a mocked `GET /api/restaurants`; submitting the create form shows the new restaurant in the list without a page reload, via a mocked `POST` + updated `GET`
- [x] `e2e/smoke.spec.ts` confirmed unaffected (it only asserts against `/`, not `/admin`) — verify, don't assume
- [x] The hand-written `Restaurant` type stays in the web app — no import of Drizzle's inferred types from `packages/db` into the SPA
- [x] Note in this file (not as an edit to tasks 004-010): 004+ should copy the `useRestaurants.ts` convention when built — editing those approved task files is out of scope here

**Note for 004+:** menu items, employees, rounds, etc. should each add their own `use<Resource>.ts` next to their route component, following `apps/web/src/routes/admin/useRestaurants.ts`'s shape — a `<resource>Keys` object, a list `useQuery`, and mutation hooks that invalidate the list key on success. This is a convention note only; tasks 004-010's own files are not edited here.

## Plan

1. Resolve current major version of `@tanstack/react-query` (and matching `-devtools`) via Context7 before installing.
2. Red commit: add `apps/web/src/routes/admin/Restaurants.test.tsx` covering list-render and create-then-appears via MSW handlers on `/api/restaurants`. Fails because no hooks/provider exist yet.
3. Green commit:
   - Add dependencies to `apps/web/package.json`.
   - Add `apps/web/src/lib/query-client.ts`.
   - Add `apps/web/src/routes/admin/useRestaurants.ts` (query-key object + the two hooks).
   - Add `apps/web/src/test/render.tsx` (`renderWithProviders`, no-retry `QueryClient`).
   - Update `apps/web/src/main.tsx`: mount `QueryClientProvider`, dev-gated `ReactQueryDevtools`.
   - Update `apps/web/src/routes/admin/Restaurants.tsx`: replace hand-rolled fetch/submit state with the two hooks; add a distinct loading state.
   - Confirm `Restaurants.test.tsx` passes.
4. Manual smoke: `pnpm dev`, exercise `/admin` in a real browser — confirm create still updates the list with no reload, and confirm a loading state is visible on first paint.
5. Verify `e2e/smoke.spec.ts` still passes unmodified.

## Implementation Log

- red commit: d16adc3 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 1 failing (`Restaurants.test.tsx` fails to resolve `@/test/render`, which doesn't exist yet — expected failure)
- green commit: f730fc6 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (6 test files, 9 tests)
- Manually verified via browser at `/admin`: existing restaurants load, submitting the create form adds a new restaurant to the list with no page reload and clears the form
- Confirmed `e2e/smoke.spec.ts` still passes unmodified (`pnpm test:e2e` — 2 passed)

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the diff `d16adc3..f730fc6` (excluding `pnpm-lock.yaml`).

### Review: Task 013 — TanStack Query integration + Restaurants retrofit

Reviewed the diff from red commit `d16adc3` to green commit `f730fc6` against `apps/web/src/lib/api.ts`'s existing conventions, the prior hand-rolled `Restaurants.tsx`, and task 013's acceptance criteria.

#### High-confidence issues (≥80)

None found. This is a clean, small, well-scoped diff that satisfies all of task 013's acceptance criteria.

#### Notes below the reporting threshold (worth knowing, not blocking)

1. **Default `QueryClient()` retries mean a slower error state (~confidence 65).** `apps/web/src/lib/query-client.ts` instantiates `new QueryClient()` with no `defaultOptions`. TanStack Query v5's default is 3 retries with exponential backoff for queries, so a genuinely failing `GET /api/restaurants` now takes several seconds to surface "Could not load restaurants." instead of failing immediately as the old hand-rolled `useEffect` did. `apps/web/src/test/render.tsx` already sets `retry: false` for tests — the author clearly knows about this default, it just wasn't carried into the real `queryClient`. Since 004+ is meant to copy this file's shape, it's worth deciding the retry/staleTime policy here rather than per-screen later. Not a hard blocker since nothing in the task or CLAUDE.md mandates a specific retry policy.

2. **A failed post-create refetch blanks the list instead of showing stale data (~confidence 60).** In `Restaurants.tsx`, `isError` is true for `QueryObserverRefetchErrorResult`, which still carries the previous `data`. Because the ternary checks `isError` before falling back to `restaurants.length === 0`/the list, if the invalidation-triggered refetch after a successful create fails, the whole card switches to the error message and the just-created restaurant appears to vanish (even though the form already cleared, implying success). Rendering the stale list with an inline error banner (e.g. `isError && !restaurants ? ... : ...`) would be more correct, but this is an edge case, not exercised by the current tests.

3. **New error paths are untested (~confidence 55).** Neither `Restaurants.test.tsx` nor the manual browser pass exercises the query-error or mutation-error branch. This doesn't violate the acceptance criteria (which only ask for list-render and create-then-appears coverage), so it's a fair follow-up rather than a gap in this task.

4. **Minor: exact-pinned versions.** `@tanstack/react-query` and `@tanstack/react-query-devtools` are pinned to `5.101.4` (no `^`) while every other dependency in `apps/web/package.json` uses `^`. Likely intentional/incidental from the install command used, not worth blocking on.

#### What was checked and confirmed fine

- `useRestaurants.ts`'s `queryKey` (`restaurantKeys.list()`) matches exactly what `useCreateRestaurant`'s `onSuccess` invalidates.
- Both hooks correctly wrap the existing `api.get`/`api.post` from `apps/web/src/lib/api.ts` — no reimplementation of fetch logic, `ApiError` handling in the component's `catch` still works since `mutateAsync` rejects with the same error `api.post` throws.
- The `isPending`/`isError` ternary in `Restaurants.tsx` type-narrows correctly so `restaurants.length` is legal in the final branch (confirmed via `pnpm -r typecheck` passing per the task log, and consistent with `UseQueryResult`'s discriminated-union typing in v5).
- `Restaurant` type is hand-written in the web app (`useRestaurants.ts`), not imported from `packages/db`'s Drizzle inference — matches the explicit acceptance criterion.
- `main.tsx`'s devtools gating (`import.meta.env.DEV && <ReactQueryDevtools .../>`) is the standard pattern and is fine with a static import per the task's own note (build-time resolution required); production tree-shaking of the unreferenced-when-false branch is Vite/Rollup's normal behavior here, not a bug.
- `test/render.tsx`'s per-test fresh `QueryClient` with `retry: false` avoids cross-test cache leakage and slow retries in tests.
- `Restaurants.test.tsx`'s second test can't pass spuriously off the input's own value — it asserts via `getByText`, not `getByDisplayValue`, so it's genuinely checking the list updated.
- `e2e/smoke.spec.ts` scope (`/` only) means it's correctly unaffected by this `/admin`-only change, consistent with the task log's manual re-run.

#### Aside (not scored, pre-existing / repo-wide, not introduced by this diff)

`apps/web/package.json` has a `"lint": "oxlint"` script, but neither the root `package.json` nor task 013's `test_command` (`pnpm -r typecheck && pnpm --filter web build && pnpm test`) runs it, and there's no CI workflow (`.github/workflows/` is empty) that would either. The three new files in this diff (`useRestaurants.ts`, `query-client.ts`, `test/render.tsx`) have therefore never been linted by anything in the automated loop. This predates task 013 and applies to every task's diff, not just this one — flagging as harness friction per CLAUDE.md's "gaps in the harness are fair game," not as a defect in this specific change.
