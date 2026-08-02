---
id: 013
title: TanStack Query integration + Restaurants retrofit
status: approved
depends_on: [012]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

`apps/web`'s only shipped feature (task 003, restaurants admin screen) hand-rolls data fetching: a `useEffect` fetch-on-mount, manual `restaurants`/`error`/`submitting` `useState`, and no distinction between "still loading" and "loaded and empty." This task adds TanStack Query, mounts a `QueryClientProvider` at the app root, and retrofits the restaurants screen onto `useQuery`/`useMutation` — establishing the query-key/hook convention that tasks 004+ (menu items, employees, rounds, etc.) can copy for their own screens. Not in scope: editing tasks 004-010's plan text, or building any new CRUD screens.

## Acceptance Criteria

- [ ] `@tanstack/react-query` and `@tanstack/react-query-devtools` added to `apps/web/package.json` `dependencies` (both — `main.tsx` statically imports the devtools component, so it must resolve at build time even though it's only rendered when `import.meta.env.DEV` is true)
- [ ] `apps/web/src/lib/query-client.ts` (new): single `QueryClient` instance for the app
- [ ] `apps/web/src/routes/admin/useRestaurants.ts` (new): `restaurantKeys`, `useRestaurants()` (list `useQuery`), `useCreateRestaurant()` (create `useMutation`, invalidating the list query via `queryClient.invalidateQueries` on success) — both wrapping the existing `api.get`/`api.post` from `apps/web/src/lib/api.ts` as `queryFn`/`mutationFn`
- [ ] `apps/web/src/test/render.tsx` (new): `renderWithProviders` helper wrapping RTL's `render` in a `QueryClientProvider` backed by a fresh `QueryClient` per test with `retry: false` on queries and mutations
- [ ] `apps/web/src/main.tsx`: wraps the app in `QueryClientProvider`; mounts `ReactQueryDevtools` gated behind `import.meta.env.DEV`
- [ ] `apps/web/src/routes/admin/Restaurants.tsx`: uses `useRestaurants()`/`useCreateRestaurant()` exclusively — no leftover manual fetch/submitting state; loading and error states render distinctly from the empty state
- [ ] `apps/web/src/routes/admin/Restaurants.test.tsx` (new, MSW-backed via task 012's infra): list renders restaurants from a mocked `GET /api/restaurants`; submitting the create form shows the new restaurant in the list without a page reload, via a mocked `POST` + updated `GET`
- [ ] `e2e/smoke.spec.ts` confirmed unaffected (it only asserts against `/`, not `/admin`) — verify, don't assume
- [ ] The hand-written `Restaurant` type stays in the web app — no import of Drizzle's inferred types from `packages/db` into the SPA
- [ ] Note in this file (not as an edit to tasks 004-010): 004+ should copy the `useRestaurants.ts` convention when built — editing those approved task files is out of scope here

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

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
