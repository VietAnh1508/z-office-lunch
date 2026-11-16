---
id: 067
title: Shared groundwork for the layered API (types, controller helper, test helpers)
status: in_review
depends_on: []
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src"
created: 2026-11-06
---

## Goal

Add the shared pieces every later layering task needs, so each feature move is mostly mechanical and the per-file test boilerplate stops being copy-pasted.

## Acceptance Criteria

- [ ] One shared `Db` / `Tx` / `DbOrTx` type exists in `apps/api/src/lib/` and replaces the local copies in `lib/menu-item-sizes.ts`, `routes/rounds.ts` and `routes/size-presets.ts`.
- [ ] A controller helper owns the DB lifecycle (`getDb(c)`, `try/catch` -> logged structured 500, `finally await db.$client.end()`) and a `respond(c, result, okStatus)` helper maps a `Result` to `c.json`. Both have unit tests.
- [ ] Test helpers in `apps/api/src/test/`: `useTestDb()` (creates db, `truncateAll` in `beforeEach`, `end` in `afterAll`), `request(method, path, body?, env?)` with `get/post/patch/put/del` shortcuts plus a multipart variant, and `expectStructured500(res)`.
- [ ] `.claude/rules/api-layers.md` (frontmatter `paths: apps/api/**/*.ts`) records the layer rules so every later task session sees them: controllers own routing, parsing, the DB lifecycle and `Result` -> response mapping; services hold rules and transactions, never take `c`, return `Result`; repositories hold Drizzle queries only, take `db | tx`, and each repository owns its own tables; cross-domain reads go through the other module's repository, never its service; error-check order and `[]`-vs-404 policies are preserved; the test-move protocol below.
- [ ] That rules file also states the test-move protocol: red commit relocates the existing HTTP tests word for word into the module's controller test files (still passing) and adds the new layer tests (failing); green commit moves the code without touching the relocated assertions; every old `it` is accounted for (kept, moved, or named as merged in the Implementation Log).
- [ ] All existing API tests still pass with no behavior change.
- [ ] Handler behavior is unchanged; `.claude/rules/api-error-handling.md` still holds (awaited `end()`, no `waitUntil`).

## Plan

Why: the explorers found the same setup block in 10 DB test files (`createDb(TEST_DATABASE_URL)`, `beforeEach(truncateAll)`, `afterAll(end)`), 5 divergent local `send/post/patch` helpers, and 247 inline `app.request(` calls. Three local `Db`/`Tx` type aliases exist (`lib/menu-item-sizes.ts:13-15`, `rounds.ts:29`, `size-presets.ts:10`).

Shapes (names are suggestions):
- `lib/db-types.ts`: `Db = ReturnType<typeof createDb>`, `Tx`, `DbOrTx`.
- `lib/controller.ts`: `withDb(c, label, fn: (db: Db) => Promise<Response>)` - gets db, runs `fn` in try/catch (log `label`, return `{error: ERROR_MESSAGES...}` 500), awaits `db.$client.end()` in `finally`. `respond(c, result, okStatus = 200)`: `!result.ok` -> `c.json({error}, status)`; else `c.json(result data, okStatus)`. Check `lib/result.ts` and `lib/errors.ts` for the exact `Result` shape and the existing 500 message first.
- `test/db.ts` (`useTestDb`), `test/request.ts`, `test/assertions.ts`.

Do not move any route or touch existing route tests in this task (068 adopts the helpers when it relocates `admin`/`employees` tests). Do not run Prettier by hand (pre-commit hook does it).

Rules file: the layer rules are not in any other durable place, so write them into `.claude/rules/api-layers.md` (see existing `api-error-handling.md` for the frontmatter format) and keep it short.

Verify first: whether `useTestDb()` registering hooks from a helper works with vitest in this repo (hooks registered at call time inside `describe` or file scope) - it should; confirm with the red test.

Files: `apps/api/src/lib/{db-types,controller}.ts` (+ tests), `apps/api/src/test/{db,request,assertions}.ts`, small edits to `lib/menu-item-sizes.ts`, `routes/rounds.ts`, `routes/size-presets.ts` (type import only), `.claude/rules/api-layers.md`.

## Implementation Log

- Red: `bad87ab` - controller tests against stubs (7 failing); also the test helpers (`test/{db,request,assertions}.ts`) with their own passing `test/helpers.test.ts`, and `lib/db-types.ts`.
- Green: `f61c182` - `withDb`/`respond` implemented, local `Db`/`Tx` aliases in `menu-item-sizes.ts`, `rounds.ts`, `size-presets.ts` replaced by `lib/db-types`.
- Docs: `7f2749e` - `.claude/rules/api-layers.md`.
- `pnpm test -- apps/api/src` -> 37 files, 576 tests passing; `tsc --noEmit -p apps/api` clean; `pnpm lint` no errors.

## Plan Deviations

- Test helpers went into the red commit (not green) because they are test scaffolding; the red failures come only from the controller stubs.
- The red and green commits lack the `Co-Authored-By` trailer (the attribution reminder arrived mid-session); not amended, per the no-rewrite rule.
- `postgres` on :5432 was held by another project's container, so the repo's container was recreated after the user stopped it. Not a repo change.
- `respond`'s `okStatus` is typed `ContentfulStatusCode` rather than `number`.

## Review Notes

`feature-dev:code-reviewer`: no issues at confidence >= 80. Points checked and judged fine: `respond` stripping `ok` and the status cast; `getDb` outside the `try` (matches `api-error-handling.md`); `request` with undefined body; `useTestDb` hook registration. Low-confidence note: `useTestDb` in several files against one shared DB could race if files run in parallel (same as the existing per-file setup). No changes made.
