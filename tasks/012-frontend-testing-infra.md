---
id: 012
title: Frontend component-testing infrastructure (jsdom + RTL + MSW)
status: in_review
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

`apps/web` has zero frontend component-testing infrastructure today — no jsdom/happy-dom, no `@testing-library/react`, no fetch-mocking library. Every later frontend task (starting with 013, TanStack Query) needs to be TDD-able against React components, so this task adds the missing test environment: jsdom, React Testing Library, and MSW (Mock Service Worker) for network-level API mocking. Root Vitest 4 config only runs Node-environment tests today (`environmentMatchGlobs`, the old way to mix environments, was removed in Vitest 4), so this also restructures the root config to run jsdom and Node tests side by side via Vitest's `projects` feature.

## Acceptance Criteria

- [x] `apps/web/src/test/api-smoke.test.ts` calls the existing `apps/web/src/lib/api.ts`'s `api.get` against a relative URL and passes under the new jsdom project + MSW mock (this is the load-bearing proof that relative-URL `fetch()` through jsdom, intercepted by MSW, via the real `api.ts` wrapper, actually works end to end)
- [x] `apps/web/src/test/smoke.test.tsx` (trivial RTL render) passes, proving jsdom + React Testing Library wiring
- [x] `apps/web/vitest.config.ts` (new): a Vitest project config, `mergeConfig`'d over `apps/web/vite.config.ts` (inherits the `@` alias and React plugin), `environment: "jsdom"`, with explicit `environmentOptions: { jsdom: { url: "http://localhost:3000" } }`
- [x] Root `vitest.config.ts` split into `test.projects`: `"apps/web/vitest.config.ts"` plus an inline Node project scoped to `include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts"]` (explicit, not the old catch-all `apps/**/*.test.ts`, which would double-match a `.test.ts` file under `apps/web`)
- [x] `globalSetup` (the Postgres bootstrap in `packages/db/src/vitest-global-setup.ts`) moved into the Node project only
- [x] `apps/web/src/test/mocks/handlers.ts`, `apps/web/src/test/mocks/server.ts`, `apps/web/src/test/setup.ts` — MSW-node + RTL setup; `server.listen({ onUnhandledRequest: "error" })` so an unmocked request fails loudly; `afterEach` resets handlers and calls RTL's `cleanup()`
- [x] `pnpm test` runs both existing Node-environment tests (api/db) and the new jsdom-environment tests from one root command, all green
- [x] `vitest run --project web` succeeds with Postgres/Docker not running
- [x] `pnpm -r typecheck` and `pnpm --filter web build` unaffected

## Plan

1. Resolve current major versions of `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw` via Context7/npm before installing — do not assume versions from prior research, confirm at implementation time (task 003's log shows installed versions can drift from what's written down).
2. Red commit: add `apps/web/src/test/api-smoke.test.ts` (plain `.ts`, no JSX) calling `api.get` against a relative path. Under the *current*, unmodified root `vitest.config.ts` (Node environment, no `globalThis.location`), this fails for a real reason — proving the gap exists before any config changes land.
3. Green commit:
   - Add the resolved devDependencies to `apps/web/package.json`.
   - Add `apps/web/vitest.config.ts` (jsdom project, `mergeConfig` over `vite.config.ts`, explicit jsdom `url`).
   - Restructure root `vitest.config.ts` into `test.projects` (web project by file reference, Node project inline with explicit `include` and `globalSetup`).
   - Add `apps/web/src/test/mocks/handlers.ts` (empty handlers array), `apps/web/src/test/mocks/server.ts` (`setupServer(...handlers)`), `apps/web/src/test/setup.ts` (`beforeAll`/`afterEach`/`afterAll` wiring `server.listen`/`resetHandlers`+`cleanup`/`server.close`).
   - Add `apps/web/src/test/smoke.test.tsx` (renders `<div>hello</div>`, asserts via `screen.getByText`).
   - Confirm `api-smoke.test.ts` now passes (MSW mock backing the relative-URL fetch).
4. **Bounded fallback** if `api-smoke.test.ts` still fails with the explicit jsdom `url` set: stop and report back rather than swapping to `happy-dom` or making `apps/web/src/lib/api.ts`'s base path env-overridable — both are unbounded changes that don't belong in this task without a fresh decision.
5. Verify: `pnpm -r typecheck && pnpm --filter web build && pnpm test` all green; separately confirm `vitest run --project web` works with Docker/Postgres stopped.

## Implementation Log

- red commit: a55f6db — `pnpm test` -> 1 failing (`api-smoke.test.ts`, `TypeError: Failed to parse URL from /api/smoke` under the unmodified Node-only root config, proving relative-URL `fetch()` has no base without jsdom)
- green commit: 78b1104 — `pnpm test` -> all passing (5 test files, 7 tests)
- fix commit: fb2f38b — `apps/web/vitest.config.ts` wasn't included in any `tsc` project (review finding below), added to `apps/web/tsconfig.node.json`'s `include`
- Full `test_command` (`pnpm -r typecheck && pnpm --filter web build && pnpm test`) green after the fix commit
- Separately confirmed `vitest run --project web` passes with `docker compose stop` (Postgres down)

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the diff `a55f6db..78b1104` (excluding `pnpm-lock.yaml`).

**Important (confidence 85, fixed in fb2f38b):** `apps/web/vitest.config.ts` wasn't covered by any TypeScript project/`include`, unlike the repo's existing convention of listing standalone config files by name (root `tsconfig.json` already does this for its own `vitest.config.ts`/`playwright.config.ts`). `apps/web/tsconfig.node.json` listed `vite.config.ts` but not the new `vitest.config.ts`, so `pnpm -r typecheck`/`pnpm --filter web build` passing said nothing about this file's correctness — type errors in it would only ever surface at Vitest runtime. Fixed by adding `"vitest.config.ts"` to `apps/web/tsconfig.node.json`'s `include`.

Checked and confirmed fine (no findings):
- `fileParallelism: false` correctly stays at the root `test` level (sibling to `projects`), not per-project — verified against installed `vitest@4.1.10` types that `fileParallelism` is excluded from per-project `ResolvedConfig` and is consumed once globally to compute `maxWorkers`, so Postgres test-isolation behavior is preserved post-split.
- Test-file partitioning across the two projects doesn't drop or double-match any file: `apps/api/**/*.test.ts` and `packages/**/*.test.ts` only match the `node` project; `apps/web/src/test/*.test.{ts,tsx}` only match the `web` project; `e2e/*.spec.ts` (Playwright) is outside both, as intended.
- `/smoke` → `/api/smoke` resolution via `api.ts`'s `BASE_PATH` matches the MSW handler exactly.
- The `@` alias resolves correctly in the `web` project via `mergeConfig(viteConfig, ...)`.
- `globalSetup` (Postgres) is scoped to the `node` project only; `setupFiles` (MSW + RTL cleanup) is scoped to the `web` project only — no cross-contamination.
- `jest-dom` matcher types are covered by `tsconfig.app.json`'s `include: ["src"]` (different from the `vitest.config.ts` gap, since `setup.ts` lives under `src/`).
- No issues found in MSW handler wiring, the jsdom `url` choice, or the `pnpm-workspace.yaml` `allowBuilds` addition for `msw`.
