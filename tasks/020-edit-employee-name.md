---
id: 020
title: Edit an employee's full name
status: done
depends_on: [005]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-13
---

## Goal

Let the admin fix a typo or name change on an existing employee without deleting and recreating them (which would orphan any submissions tied to that employee id). Editing is allowed regardless of the employee's active/inactive state, and reuses the same name validation as create (trim + required — no duplicate-name check exists for create either, so none is added here).

## Acceptance Criteria

- [x] `PATCH /api/employees/:id/name` with `{ fullName }` — a new route, separate from the existing bodyless `PATCH /api/employees/:id` toggle-active endpoint (which is untouched):
  - non-integer `:id` → 404 `employeeNotFound`
  - missing/blank (untrimmed) `fullName` → 400 `fullNameRequired`, checked before the existence lookup (same order as `POST /` and `rounds.ts`'s `PATCH /:id`)
  - missing employee → 404 `employeeNotFound`
  - success → 200, returns the updated employee row with the trimmed `fullName`; `active` untouched
  - works the same regardless of the employee's `active` state
- [x] Admin UI: each employee row in the Employees list gets an inline "edit name" control (pencil icon) next to the existing activate/deactivate toggle, available regardless of active state
  - clicking it swaps the name to an editable, pre-filled text input (`useRequiredField`) with Save/Cancel actions
  - Save validates first (required); a blank name shows the inline error and sends no request
  - Save on success updates the displayed name, shows a success toast, and returns the row to display mode
  - Save on failure shows an error toast and stays in edit mode with the entered value
  - Cancel discards the edit and returns to display mode without any request

## Plan

### API (`apps/api/src/routes/employees.ts`, `apps/api/src/lib/errors.ts`)

Add `PATCH /:id/name`, placed directly after the existing `PATCH /:id` (grouping the two employee mutations together). Deliberately a separate route rather than extending `PATCH /:id` — that handler is a bodyless boolean toggle (`active: !existing.active`, no request body read at all); overloading it with an optional `fullName` field would conflate two unrelated mutations in one handler. Mirrors `rounds.ts`'s existing precedent of keeping `PATCH /:id/status` separate from full-field edits.

Handler order (validate body before fetching, matching `POST /` and `rounds.ts`'s `PATCH /:id`):
1. Non-integer `:id` → 404 `ERROR_MESSAGES.employeeNotFound`.
2. `body.fullName` missing/blank after `.trim()` → 400 `ERROR_MESSAGES.fullNameRequired` (both keys already exist in `errors.ts` — no new error strings needed).
3. Fetch the employee → 404 `employeeNotFound` if missing.
4. `db.update(employees).set({ fullName }).where(eq(employees.id, id)).returning()` → `c.json(row)`, 200.
5. Standard try/catch/finally per `.claude/rules/api-error-handling.md` (structured `console.error`, 500 `internal` on catch, `await db.$client.end()` in finally).

### Frontend

1. `apps/web/src/routes/admin/useEmployees.ts`: add `useUpdateEmployeeName()`, mirroring `useToggleEmployeeActive`'s shape:
   ```ts
   export function useUpdateEmployeeName() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (input: { id: number; fullName: string }) =>
         api.patch<Employee>(`/employees/${input.id}/name`, { fullName: input.fullName }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: employeeKeys.list() });
         toast.success("Employee updated");
       },
       onError: (error) => toastApiError(error, "Could not update employee."),
     });
   }
   ```
2. `apps/web/src/hooks/useRequiredField.ts`: add an optional `initialValue = ""` param so the hook can seed a non-blank value (backward compatible — existing create-form callers pass none). **Check first whether task 019 already landed this same change** (it independently plans the identical addition, since either task could land first) — if so, reuse it as-is and skip this step.
3. `apps/web/src/routes/admin/Employees.tsx`: extract each `<li>` into a new `EmployeeRow` sub-component (non-exported, same file) — needed because `useRequiredField` must be called unconditionally per row, not once for the whole list.
   - Default state: unchanged today's row (name span + activate/deactivate icon button) plus a new pencil icon button (`Pencil` from `lucide-react`) with `aria-label="Edit name"`.
   - Editing state (local `isEditing` state in `EmployeeRow`): name span replaced by an `Input` wired to `useRequiredField("Full name is required.", employee.fullName)`, plus Save/Cancel buttons; toggle-active button stays visible/functional.
     - Save: `validate()` first, no request if it fails; on pass, `useUpdateEmployeeName().mutate({ id: employee.id, fullName: value }, { onSuccess: () => setIsEditing(false) })`. No local try/catch — the hook's `onError` already toasts.
     - Cancel: resets the field to `employee.fullName`, exits edit mode, no request.
     - Save button disabled while the mutation is pending, matching the existing `disabled={toggleActive.isPending}` convention.

### Tests

4. `apps/api/src/routes/employees.test.ts` — new `describe("PATCH /:id/name")` (mirrors the existing toggle tests' structure — `seedEmployee`, `truncateAll` in `beforeEach`):
   - success: updates `fullName`, leaves `active` unchanged, 200 with updated row.
   - blank / whitespace-only / missing `fullName` → 400 `fullNameRequired`, row unchanged.
   - nonexistent id → 404 `employeeNotFound`; non-integer id → 404 `employeeNotFound`.
5. `apps/web/src/routes/admin/Employees.test.tsx` — mirrors the existing toggle-active tests (MSW `http.patch` mocks, `renderWithProviders`):
   - clicking the edit icon shows an input pre-filled with the current name.
   - entering a new name and saving calls `PATCH /employees/:id/name`, shows the new name in the list, shows the success toast, returns to display mode.
   - saving a blank name shows the inline "Full name is required." error, sends no request.
   - cancelling reverts to display mode with the original name, sends no request.
   - a failed save (mocked error response) shows the error toast and stays in edit mode.

## Implementation Log

- red commit: `4c62b3e` (API tests) + `97f43df` (frontend tests) — `pnpm vitest run` -> 4 + 5 = 9 new tests failing (expected: route/UI didn't exist yet)
- green commit: `ea86751` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (143 tests)

## Plan Deviations

- `useRequiredField`'s `reset()` previously hardcoded resetting `value` to `""`. To satisfy the plan's "Cancel resets to `employee.fullName`" behavior without adding a separate method, `reset()` now resets to the hook's `initialValue` closure param instead (backward compatible: existing create-form callers omit `initialValue`, so it still defaults to `""`).

## Review Notes

Reviewed by `feature-dev:code-reviewer` against `.claude/rules/api-error-handling.md`, `.claude/rules/mutation-feedback.md`, `.claude/rules/form-validation.md`, and the acceptance criteria.

**Result: no issues at or above the 80-confidence threshold.**

Rule compliance confirmed:
- API error handling (`apps/api/src/routes/employees.ts`): matches the established pattern exactly — structured `console.error` on catch, `ERROR_MESSAGES.internal` + 500, `await db.$client.end()` in `finally`. Reuses existing `fullNameRequired`/`employeeNotFound` constants rather than inlining new strings.
- Validation ordering: non-integer id → 404, then blank/missing `fullName` → 400 (checked before the existence lookup), then 404 if the row doesn't exist — matches the acceptance criteria precisely and is covered by tests.
- Mutation feedback (`useUpdateEmployeeName`): static `toast.success("Employee updated")` / `toastApiError(error, "Could not update employee.")` live in the hook, not the component; call site uses `mutate(input, { onSuccess })`, not `mutateAsync` + try/catch.
- Form validation (`EmployeeRow.handleSave`): calls `fullName.validate()` first and bails before mutating; inline error renders under the field via the shared `useRequiredField` pattern.

The reviewer traced through a suspected stale-value bug in `handleCancel`'s `fullName.reset()` (worried it could revert to a mount-time-captured name after a prior successful save) but confirmed `reset` is a fresh closure each render capturing that render's `employee.fullName`, so it correctly reverts to the just-saved name — not a bug.

Below-threshold, non-blocking observations (not required fixes):
- If `employee.fullName` changes from a source other than this row's own save (e.g. a second admin tab), the local `useRequiredField` value can drift from the server value until the row is re-edited — no such other mutation exists today, so this doesn't currently reproduce.
- `onSuccess` fires `invalidateQueries` and `setIsEditing(false)` in the same tick, so display mode can briefly render the pre-refetch cached name rather than the row the mutation already returned (unlike `useToggleEmployeeActive`, which uses the mutation's response directly). Cosmetic, no observed test flakiness.
