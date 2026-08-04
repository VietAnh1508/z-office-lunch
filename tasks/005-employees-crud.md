---
id: 005
title: Employees CRUD (create, list, deactivate)
status: in_review
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

- red commit: `62bc6de` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 12 failing (7 in `apps/web/src/routes/admin/Employees.test.tsx`, 5 in `apps/api/src/routes/employees.test.ts`; 2 of the API tests asserting a 404 already passed trivially since every route 404s before `employeesRoute` exists)
- green commit: `6563f9a` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (66/66 tests, 14/14 files)

## Plan Deviations

- The Plan didn't call out `GET /api/employees/:id` as a distinct route, but the "deactivated employee still resolvable by id" acceptance criterion requires it, and the Plan's own step 2 says exactly that ("deactivated employee still fetchable by id (`GET /api/employees/:id`)") — added as its own handler alongside `POST /`, `GET /`, and `PATCH /:id`, following the same try/catch/finally shape as the other routes.
- Discovered mid-implementation that `apps/web/src/routes/admin/AdminLayout.test.tsx`'s "navigates to each admin section via the nav links" test asserted an `h1` heading "Employees" that only existed because of the placeholder screen. Replacing the placeholder with the real screen (Card-based UI, no page-level `h1`, matching `Restaurants.tsx`'s shape) broke that pre-existing test. Fixed it in the same green commit by mocking `GET /api/employees` and asserting on `"No employees yet."` instead, mirroring how the same test already asserts on `"No restaurants yet."` for the Restaurants tab — this is a one-line adjustment to reflect the real screen, not a change in scope.
- Everything else matched the Plan: reused `useRequiredField` for the required `fullName` field, mirrored `Restaurants.tsx`/`RestaurantDetail.tsx`'s list+add+toggle shape and `useMenuItems.ts`'s toggle-mutation pattern, and added no new shadcn primitives.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against `.claude/rules/api-error-handling.md`, `.claude/rules/form-validation.md`, `.claude/rules/mutation-feedback.md`, and this task's acceptance criteria (diff: `62bc6de..6563f9a`).

> Reviewed the diff implementing task 005 (Employees CRUD) against `.claude/rules/api-error-handling.md`, `.claude/rules/form-validation.md`, `.claude/rules/mutation-feedback.md`, and the task's acceptance criteria.
>
> **Checks performed:**
>
> 1. **API error handling** — all four route handlers (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`) correctly wrap DB access in try/catch/finally, log structured JSON, return `{error}`/500, and `await db.$client.end()` in `finally`. Matches `restaurants.ts`/`menu-items.ts` pattern exactly.
> 2. **Toggle-active select-then-update pattern** (potential TOCTOU race, and shared `toggleActive.isPending` disabling every row's button rather than per-item) — initially flagged both as possible issues, but confirmed both are byte-for-byte the same pattern already used in `menu-items.ts` (select-then-update) and `RestaurantDetail.tsx` (single shared mutation disabling all rows). Pre-existing precedent, not regressions introduced by this diff, so not reportable per the confidence rubric.
> 3. **Toast messages** — `useToggleEmployeeActive`'s conditional `toast.success(employee.active ? "Employee activated" : "Employee deactivated")` is verbatim the same pattern as `useMenuItems.ts`'s `useToggleMenuItemActive`. Static-string choice based on state, not entity-data interpolation — consistent with `mutation-feedback.md` and precedent.
> 4. **Form validation** — `useRequiredField` + `noValidate` + inline error usage matches `Restaurants.tsx`/`RestaurantDetail.tsx` exactly, including the `SubmitEvent` type import.
> 5. **Line length / formatting** — no Biome/Prettier/dprint config in this repo, only `oxlint` (doesn't enforce line width) — no formatting gate this would trip.
> 6. **Route logic vs. acceptance criteria** — POST defaults `active: true` (schema default), GET filters correctly on `active=true` vs. omitted, PATCH toggles and 404s on missing id, GET `/:id` returns a deactivated employee (not just active ones) — all verified against `employees.test.ts`, which covers every AC explicitly.
> 7. **Icon button `size="icon-sm"` variant** — confirmed it's a real defined variant in `components/ui/button.tsx`.
>
> **Findings:** No high-confidence (≥80) issues found. The implementation is a faithful, consistent extension of the existing restaurants/menu-items patterns (error handling, form validation, mutation feedback, and list/toggle UI), and the accompanying tests (`employees.test.ts`, `Employees.test.tsx`) directly exercise every acceptance criterion in `tasks/005-employees-crud.md`. This diff meets the project's established conventions.
