---
id: 068
title: Layer the admin and employees modules
status: in_review
depends_on: [067]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/admin apps/api/src/modules/employees"
created: 2026-11-06
---

## Goal

Move `routes/admin.ts` and `routes/employees.ts` into controller/service/repository modules, and split their tests per layer. These are the smallest routes, so this task proves the pattern before the bigger moves.

## Acceptance Criteria

- [ ] `apps/api/src/modules/admin/{controller,service}.ts` and `modules/employees/{controller,service,repository}.ts` exist; `routes/admin.ts` and `routes/employees.ts` are deleted; `index.ts` imports the controllers (same `*Route` export names, same paths).
- [ ] Controllers hold only routing, param/body parsing and `Result` -> response mapping, via the 067 helpers. Services hold the rules (admin password compare; employee active toggle). Repository holds the Drizzle queries.
- [ ] Tests split into controller (status/validation/structured 500), service and repository files beside the code; old `routes/admin.test.ts` and `routes/employees.test.ts` are removed with no loss of coverage.
- [ ] No behavior change: same statuses, bodies and error messages. Full `pnpm test` passes.

## Plan

Source notes (from exploration): admin has one endpoint `POST /api/admin/verify-password` (400/401/500, no DB, no try/finally); service signature like `verifyPassword(submitted: unknown, adminPassword: string): Result`. Employees: `POST /`, `GET /?active=true`, `GET /:id`, `PATCH /:id` (toggle), `PATCH /:id/name`; inline `parseFullName` and non-integer id -> 404; find-then-update repeated at employees.ts:84 and :117; toggle rule `!existing.active` at :91.

Shapes: repository `findById`, `list({activeOnly})`, `insert`, `setActive`, `setName`; service `createEmployee`, `listEmployees`, `getEmployee`, `toggleActive`, `renameEmployee` returning `Result`.

Tests: use `useTestDb` / `request` from 067. Repository tests call functions with `seedEmployee` directly (no HTTP); service tests use the db and check rules; controller tests only check HTTP contract.

Files: `apps/api/src/modules/{admin,employees}/*`, `apps/api/src/index.ts`; delete the four old `routes/{admin,employees}*.ts` files.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing `admin`/`employees` HTTP tests word for word into `modules/*/controller.test.ts` (using the 067 helpers; still passing) and adds the new service/repository tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

## Implementation Log

- Red `4508e1f`: relocated old HTTP tests into `modules/*/controller.test.ts`, added service/repository tests, throwing stubs. `pnpm test -- apps/api/src/modules/admin apps/api/src/modules/employees` -> 20 failing (only the new service/repository tests).
- Green `35c202f`: moved code into admin `{controller,service}` and employees `{controller,service,repository}`, deleted `routes/admin.ts` / `routes/employees.ts`, re-pointed `index.ts`. Full `pnpm test` 598 passing, typecheck and lint clean.
- Test `4ed98a8`: two extra controller tests from review (rename check order, unparseable body). 600 passing.
- Old `it` accounting: `routes/admin.test.ts` 5/5 moved to `modules/admin/controller.test.ts`. `routes/employees.test.ts` 13/13 moved to `modules/employees/controller.test.ts` (8 top-level + 5 in `PATCH /:id/name`), assertions unchanged, only the request plumbing swapped for the 067 helpers. Admin malformed-JSON test keeps a raw `app.request` because the helpers always JSON-encode.
- New tests: non-integer id 404 (GET/PATCH), structured 500 on all five employee routes, rename check order, unparseable rename body; admin service (5 cases); employees service (6) and repository (5).

## Plan Deviations

- `listEmployees` returns a plain array, not a `Result`: listing has no rule that can fail, and `respond` only maps objects.
- Admin controller returns `c.json({ ok: true })` directly, since `respond` strips `ok`.
- Red commit deleted the old `routes/*.test.ts` files (moved, not copied), so the protocol's "relocate" holds.

## Review Notes

Reviewer (`feature-dev:code-reviewer`) had no shell, so it could not diff against the originals; it reviewed the new files only. I checked its points against the old code:

- Admin `null` JSON body throws on `body.password`: same as the original (`body.password`), so no change. Left as is, out of scope for a pure refactor.
- Employees check order (id 404, name 400, then DB): matches the original.
- find-then-update in toggle/rename: matches the original. The extra "update returned no row -> 404" branch is a race-only path, not tested.
- `parseId` (`Number.isInteger`) and `orderBy(fullName)`: same as the original.
- Gaps: no test for rename check order or unparseable rename body -> fixed in `4ed98a8`. No admin `null`-body test -> skipped (would pin a crash).
