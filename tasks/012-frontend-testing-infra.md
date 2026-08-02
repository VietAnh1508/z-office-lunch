---
id: 012
title: Frontend component-testing infrastructure (jsdom + RTL + MSW)
status: approved
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

`apps/web` has zero frontend component-testing infrastructure today — no jsdom/happy-dom, no `@testing-library/react`, no fetch-mocking library. Every later frontend task (starting with 013, TanStack Query) needs to be TDD-able against React components, so this task adds the missing test environment: jsdom, React Testing Library, and MSW (Mock Service Worker) for network-level API mocking. Root Vitest 4 config only runs Node-environment tests today (`environmentMatchGlobs`, the old way to mix environments, was removed in Vitest 4), so this also restructures the root config to run jsdom and Node tests side by side via Vitest's `projects` feature.

## Acceptance Criteria

- [ ] `apps/web/src/test/api-smoke.test.ts` calls the existing `apps/web/src/lib/api.ts`'s `api.get` against a relative URL and passes under the new jsdom project + MSW mock (this is the load-bearing proof that relative-URL `fetch()` through jsdom, intercepted by MSW, via the real `api.ts` wrapper, actually works end to end)
- [ ] `apps/web/src/test/smoke.test.tsx` (trivial RTL render) passes, proving jsdom + React Testing Library wiring
- [ ] `apps/web/vitest.config.ts` (new): a Vitest project config, `mergeConfig`'d over `apps/web/vite.config.ts` (inherits the `@` alias and React plugin), `environment: "jsdom"`, with explicit `environmentOptions: { jsdom: { url: "http://localhost:3000" } }`
- [ ] Root `vitest.config.ts` split into `test.projects`: `"apps/web/vitest.config.ts"` plus an inline Node project scoped to `include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts"]` (explicit, not the old catch-all `apps/**/*.test.ts`, which would double-match a `.test.ts` file under `apps/web`)
- [ ] `globalSetup` (the Postgres bootstrap in `packages/db/src/vitest-global-setup.ts`) moved into the Node project only
- [ ] `apps/web/src/test/mocks/handlers.ts`, `apps/web/src/test/mocks/server.ts`, `apps/web/src/test/setup.ts` — MSW-node + RTL setup; `server.listen({ onUnhandledRequest: "error" })` so an unmocked request fails loudly; `afterEach` resets handlers and calls RTL's `cleanup()`
- [ ] `pnpm test` runs both existing Node-environment tests (api/db) and the new jsdom-environment tests from one root command, all green
- [ ] `vitest run --project web` succeeds with Postgres/Docker not running
- [ ] `pnpm -r typecheck` and `pnpm --filter web build` unaffected

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

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
