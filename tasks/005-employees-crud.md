---
id: 005
title: Employees CRUD (create, list, deactivate)
status: approved
depends_on: [002, 013]
parallelizable_with: [004]
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin maintains the employee list the submission form's name-picker (task 009) draws from. Independent of restaurants/menu items — only needs the test harness from task 002.

## Acceptance Criteria

- [ ] `POST /api/employees` (`fullName` required) — defaults `active: true`
- [ ] `GET /api/employees?active=true` filters to active; omitting the param returns all
- [ ] `PATCH /api/employees/:id` toggles `active`
- [ ] A deactivated employee is excluded from `?active=true` lists but still resolvable by id (needed later so historical submissions keep resolving a name even after someone leaves)
- [ ] `/admin/employees` screen: list + add form + active/inactive toggle

## Plan

0. `/admin/employees` and its placeholder file (`apps/web/src/routes/admin/Employees.tsx`) already exist as of task 014 — this task replaces the placeholder's body, it doesn't create the route or file fresh.
1. `apps/api/src/routes/employees.ts`, mounted at `/api/employees`.
2. TDD units: valid POST persists; POST missing `fullName` is 400; `?active=true` excludes deactivated; deactivated employee still fetchable by id (`GET /api/employees/:id`).
3. UI: `apps/web/src/routes/admin/Employees.tsx`, same list/create/toggle shape as the restaurant screen — reuse shadcn components already generated in task 003/004, no new UI primitives expected.
4. Use `useRequiredField` (task 011, `apps/web/src/hooks/useRequiredField.ts`) for the add-employee form's required `fullName` field instead of the native `required` attribute — see `.claude/rules/form-validation.md`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
