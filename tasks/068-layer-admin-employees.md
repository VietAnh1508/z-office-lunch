---
id: 068
title: Layer the admin and employees modules
status: approved
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

## Plan Deviations

## Review Notes
