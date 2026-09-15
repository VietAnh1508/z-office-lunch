---
id: 042
title: Admin can edit an employee's submission
status: in_review
depends_on: []
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-15
---

## Goal

Admin can edit an employee's submission on a round — food item, food note, drink item, drink
note — to correct a mistaken order, regardless of the round's status (draft/open/closed). Unlike
resubmission (task 033, open rounds only, self-service), this is an admin data-correction action
with no status restriction and no deadline check. The employee a submission belongs to is not
editable here — only what they ordered.

## Acceptance Criteria

- [ ] `PATCH /api/rounds/:id/submissions/:submissionId`: updates `foodRoundMenuItemId`,
      `foodNote`, `drinkRoundMenuItemId`, `drinkNote` (200 + updated row) when the submission
      exists and belongs to round `:id`, on a round in any status and regardless of deadline; 404
      when the submission doesn't exist or belongs to a different round; 404 for a non-integer
      `id` or `submissionId`
- [ ] Same field validation as `POST /:id/submissions`: `foodRoundMenuItemId` required and must be
      a round menu item belonging to the round's food restaurant; `drinkRoundMenuItemId` optional
      (omitting/nulling it clears the drink), and when present must belong to the round's drink
      restaurant; notes trimmed, empty string stored as `null`
- [ ] Admin round detail page (`RoundDetail.tsx`): each submissions-table row gets an Edit action
      that opens a dialog pre-filled with that submission's current food item, food note, drink
      item, and drink note; submitting calls the endpoint, closes the dialog, and the row reflects
      the new values (list refetches) with a success toast; a server error shows an error toast
      and leaves the dialog open; the food/drink item choices offered are the round's own curated
      items (same set the round was built from), not the full restaurant menu
- [ ] Public round page (`public/Round.tsx`): submissions table renders unchanged — no Edit column
      or button, since that page has no admin/edit affordance
- [ ] CSV export (`RoundDetail.tsx`'s `toCsv(SUBMISSION_COLUMNS, rows)`) keeps its original 5
      columns — adding the Edit action must not add an "Actions" entry to the exported header

## Plan

**Context**: there is no admin auth in this app at all (no middleware, no login, `/admin` is a
plain unauthenticated SPA route tree) — this is a known, pre-existing gap, not something this task
should try to fix. Editing reuses the same validation `POST /:id/submissions` already does for
`foodRoundMenuItemId`/`drinkRoundMenuItemId` (round-menu-item existence + restaurant ownership) —
the only differences are: (a) no round-status/deadline gate, since this is an admin override, not
a self-service resubmission, and (b) the target row is found by `(id, roundId)` ownership lookup
instead of `(roundId, employeeId)`, since the admin is editing a specific row from the table, not
upserting for "the current employee".

**API** (`apps/api/src/routes/rounds.ts`):

1. Extract the shared validation out of the existing `POST /:id/submissions` handler (lines
   ~610–718) into a helper, e.g. `parseSubmissionFields(db, round, body)`, returning either
   `{ ok: true, foodRoundMenuItemId, foodNote, drinkRoundMenuItemId, drinkNote }` or
   `{ ok: false, error, status }`. It covers: parsing/validating `foodRoundMenuItemId` (required
   int) and `drinkRoundMenuItemId` (optional int or null), trimming notes to `null` when blank,
   and the two `selectRoundMenuItem` lookups confirming each id belongs to the round's
   food/drink restaurant (`ERROR_MESSAGES.roundMenuItemNotFound`,
   `foodRoundMenuItemInvalid`/`drinkRoundMenuItemInvalid`, `submissionNoDrinkRestaurant`). `POST`
   keeps its own `employeeId` parsing and round status/deadline checks around the call to this
   helper; those don't move.
2. Add `PATCH /:id/submissions/:submissionId` right after `GET /:id/submissions`. Parse
   `roundId`/`submissionId` from params; if either isn't an integer, 404 via a new
   `ERROR_MESSAGES.submissionNotFound` (`apps/api/src/lib/errors.ts`, next to the existing
   `submission*`-prefixed keys).
3. In the try block: `select` the round by `roundId` (404 `roundNotFound` if missing — defensive,
   matches `POST`'s convention, though the ownership lookup below would also 404 in practice).
   `select` the submission where `and(eq(submissions.id, submissionId), eq(submissions.roundId,
   roundId))` — no row means either the submission doesn't exist or belongs to a different round;
   either way 404 `submissionNotFound`. No status or deadline check — that's the deliberate
   admin-override difference from `POST`.
4. Call `parseSubmissionFields(db, round, body)`; on `{ ok: false }` return
   `c.json({ error }, status)`.
5. `db.update(submissions).set({ foodRoundMenuItemId, foodNote, drinkRoundMenuItemId, drinkNote,
   updatedAt: new Date() }).where(eq(submissions.id, submissionId)).returning()` → `c.json(row)`,
   200. Standard try/catch/finally per `.claude/rules/api-error-handling.md`.

Response is the raw updated `submissions` row (same convention as the other update routes in this
file) — the client discards the body and refetches via the `GET .../submissions` list instead.

6. `GET /:id/submissions` (~line 727): add `foodRoundMenuItemId: submissions.foodRoundMenuItemId`
   and `drinkRoundMenuItemId: submissions.drinkRoundMenuItemId` to the existing `select` alongside
   the already-resolved `foodName`/`drinkName`. The admin edit dialog needs the raw ids to
   pre-select the right `<option>`; the resolved names alone aren't enough to prefill a form.

**Frontend**:

- `apps/web/src/routes/shared/useRoundSubmissions.ts`: add `foodRoundMenuItemId: number | null`
  and `drinkRoundMenuItemId: number | null` to the `RoundSubmission` type (matching the new API
  fields). Add `useUpdateRoundSubmission(roundId)`: `mutate({ submissionId, foodRoundMenuItemId,
  foodNote, drinkRoundMenuItemId, drinkNote })`, one hook instance reused across every table row
  (same shape as `useRemoveRoundMenuItem`). `mutationFn` calls `api.patch(...)` untyped (response
  is the raw DB row, not the resolved `RoundSubmission` shape). On success, invalidate
  `roundSubmissionKeys.all(roundId)` and `toast.success("Submission updated")`; on error,
  `toastApiError(error, "Could not update submission.")` — per `.claude/rules/mutation-feedback.md`.
- `apps/web/src/routes/shared/SubmissionsTable.tsx`: add an optional
  `renderActions?: (submission: RoundSubmission) => ReactNode` prop. Render an extra `<th>`/`<td>`
  conditionally *after* mapping the existing `SUBMISSION_COLUMNS` array — do not push into that
  array, since it's also the literal CSV header `RoundDetail.tsx` passes to `toCsv(...)`. The
  current last-column styling (no `pr-4`) needs to become conditional on whether `renderActions`
  is present, since the actions cell becomes the new last column when it renders. `public/Round.tsx`
  passes nothing, so its rendering is unaffected — confirm with a `public/Round.test.tsx` assertion
  that no Edit button/column appears.
- `apps/web/src/routes/admin/RoundDetail.tsx`: pass `renderActions` to `SubmissionsTable`,
  rendering a per-row Edit `Button` that opens a shadcn `Dialog` (import from
  `@/components/ui/dialog`, alongside the existing `AlertDialog` import — this file has no `Dialog`
  form yet, so model the field markup on `public/Round.tsx`'s `SubmissionForm`: `Label` + native
  `<select>` reusing that file's `selectClassName` string, `Input` for notes) containing:
  - A disabled/read-only display of the employee name (not editable — confirms scope, doesn't
    invite editing).
  - Food item `<select>`, food note `Input`, drink item `<select>` (with a "None" option that
    clears the drink), drink note `Input` — local `useState` per field, initialized from the
    submission's `foodRoundMenuItemId`/`foodNote`/`drinkRoundMenuItemId`/`drinkNote` when the
    dialog opens (not `useRequiredField`, which is for plain text inputs, not selects — match
    `SubmissionForm`'s own local-state-plus-inline-error pattern for the required food-item field).
  - The item options are the round's *curated* food/drink items, not the full restaurant catalog:
    join `useMenuItems(round.foodRestaurantId)`/`useMenuItems(round.drinkRestaurantId)` (called
    with `activeOnly` left `false` here — a separate query-cache entry from the `activeOnly: true`
    fetch this file already does for the "add items to round" checklist — so a submission
    referencing a since-deactivated item still resolves to a name) against `curated` (from the
    already-present `useRoundMenuItems(roundId)`) via `curatedByMenuItemId`, same join this file
    already does at line ~219, to get `{ id: roundMenuItemId, name }` pairs.
  - Submitting calls `updateSubmission.mutate({ submissionId: submission.id, ... })`, closing the
    dialog `onSuccess`. A per-row `open` state (or a single `editingSubmissionId` state on the
    page) controls which dialog is open, since `SubmissionsTable` renders one row per submission.

**Files touched**: `apps/api/src/lib/errors.ts`, `apps/api/src/routes/rounds.ts`,
`apps/api/src/routes/rounds.test.ts`, `apps/web/src/routes/shared/SubmissionsTable.tsx`,
`apps/web/src/routes/shared/useRoundSubmissions.ts`, `apps/web/src/routes/admin/RoundDetail.tsx`,
`apps/web/src/routes/admin/RoundDetail.test.tsx`, `apps/web/src/routes/public/Round.test.tsx`
(regression assertion only).

**Tests (TDD, failing first)**:

- API (`rounds.test.ts`, new `describe`): edit succeeds on draft/open/**closed** rounds and past
  the deadline (the notable cases, since there's no status/deadline guard); edit can clear the
  drink by omitting `drinkRoundMenuItemId`; edit validates `foodRoundMenuItemId`/
  `drinkRoundMenuItemId` the same way `POST` does (belongs to the right restaurant, round menu
  item exists); 404 for a nonexistent `submissionId`; 404 when the submission exists but belongs
  to a different round (proves the ownership filter, not just existence); 404 for non-integer
  `id`/`submissionId`; `GET :id/submissions` now includes `foodRoundMenuItemId`/
  `drinkRoundMenuItemId` in each row.
- Frontend (`RoundDetail.test.tsx`): Edit button renders per submission row; opening it shows the
  dialog pre-filled with that row's current values; submitting calls the endpoint with the edited
  fields, closes the dialog, and the row reflects the new values after refetch, with a success
  toast; a server error shows the error toast and keeps the dialog open; CSV export's
  header/column count stays at the original 5 (`SUBMISSION_COLUMNS` unchanged). Scope queries per
  row (e.g. `within(screen.getByRole("row", { name: /Alice/ }))`) since "Edit" is ambiguous with
  more than one submission row — check for `userEvent.setup({ pointerEventsCheck: 0 })` if the
  Radix-dialog `pointer-events: none` issue from task 018 resurfaces.
- Frontend (`public/Round.test.tsx`): assert no Edit button/column renders.

Nothing here depends on unverified third-party behavior — confirm during implementation only that
`SubmissionsTable.tsx`'s existing conditional-className idiom (whether it already uses a `cn()`
helper nearby) is matched rather than introducing a new pattern, and that `api.patch` exists on
the shared API client (`apps/web/src/lib/api.ts`) with the same signature as `api.post`/`api.delete`.

## Implementation Log

- red commit: 79b52f5 — `pnpm test` -> 22 failing
- green commit: a7766fe — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (388 tests)

## Plan Deviations

- Before implementation started, the checked-out branch was `task/042-admin-delete-submission` and carried an uncommitted, unrelated diff re-adding a public-page submissions list that commit `b48a094` ("fix: hide submission list from the public round page") had deliberately removed for privacy reasons. That diff was discarded and the branch recreated as `task/042-admin-edit-submission` off a fresh `main` before any task work began — not a deviation in the implementation itself, but worth recording since it means AC #4 ("submissions table renders unchanged" on the public page) was tested against a page that already has no submissions table at all (there's nothing to leave unchanged), so the test was written as a straightforward regression guard (no table, no Edit button) rather than a "still renders, still no Edit column" assertion.
- Extracting `parseSubmissionFields` changed the GET `/:id/submissions` response to include the raw `foodRoundMenuItemId`/`drinkRoundMenuItemId` fields (per Plan step 6). This inverts a convention an existing test asserted and a comment documented ("never a raw `*RoundMenuItemId` FK") — that test assertion and the comment were both updated to explain why the admin edit dialog needs the raw ids, rather than just silently dropping the assertion.
- `POST /:id/submissions`'s field-order was preserved deliberately (food existence → food restaurant ownership → drink no-restaurant → drink existence → drink restaurant ownership) when extracting `parseSubmissionFields`, and the full existing `submissions` describe block was re-run before adding new PATCH tests to confirm no POST behavior changed.
- 404 vs 400 status/message symmetry for the new PATCH route: a non-integer or missing round id returns `roundNotFound` (matching POST's existing convention for a bad round id); a non-integer or missing/mismatched submission id returns the new `submissionNotFound`. Not stated explicitly in the Plan, decided during implementation for consistency with POST.
- Test-writing mistakes fixed before green (not implementation deviations, but the tests genuinely needed iteration): `getByLabelText("Food item")` needed `{ exact: false }` since the label text includes a `*` required-marker span; two assertions needed to scope into `within(screen.getByRole("table"))` because a draft round's curated-items checklist also renders a `Pho Ga` label, creating an ambiguous text match; and the CSV-header assertion was corrected to the project's actual tab-delimited/BOM-prefixed format (`toCsv` in `apps/web/src/lib/csv.ts`) instead of an assumed comma-delimited one.

## Review Notes

Reviewed the red-to-green implementation diff (`apps/api/src/routes/rounds.ts`, `apps/web/src/routes/admin/RoundDetail.tsx`, `apps/web/src/routes/shared/SubmissionsTable.tsx`, `apps/web/src/routes/shared/useRoundSubmissions.ts`, plus the `RoundDetail.test.tsx` assertion fixups) via `feature-dev:code-reviewer`.

**No issues at or above the 80-confidence bar.** The implementation adheres to all three cited conventions:

- `api-error-handling.md`: the new `PATCH /:id/submissions/:submissionId` wraps its DB work in try/catch/finally, logs structured JSON on catch, returns `{ error: ERROR_MESSAGES.internal }` with 500, and awaits `db.$client.end()` in `finally` — matches the established pattern exactly.
- `mutation-feedback.md`: `useUpdateRoundSubmission` wires `toast.success("Submission updated")` + query invalidation into the hook's own `onSuccess`, and `toastApiError(...)` into `onError`, both static strings; the call site only adds a local `onSuccess: () => setOpen(false)`, which the rule allows.
- `form-validation.md`: the form has `noValidate`; the required food-item `<select>` uses local state + inline error text, matching `EditRoundForm`'s existing pattern for its own required `<select>` field (`useRequiredField` is correctly not used, since it's reserved for text inputs).

Other things specifically checked and ruled out as non-issues:
- `parseSubmissionFields` preserves `POST`'s original validation order and error codes — no behavior change to the existing self-service submission path.
- Clearing the drink pick: the dialog sends `drinkRoundMenuItemId: undefined` when set to "None"; `JSON.stringify` drops `undefined` keys, so `parseSubmissionFields` treats the absent field the same as `null` and correctly nulls it server-side.
- `SubmissionsTable`'s `renderActions` adds the actions column after mapping `SUBMISSION_COLUMNS` (not by pushing into it), so the CSV export keeps its original 5-column header.
- `useMenuItems(round?.drinkRestaurantId ?? 0, false)` is safe with no drink restaurant — the hook's `enabled: restaurantId > 0` guard prevents a spurious fetch against id `0`.
- Per-row `SubmissionEditDialog` instances share the same DOM ids (`edit-submission-food-item`, etc.), but Radix's `Presence` unmounts a closed dialog's content and only one dialog is open at a time in practice — not a real collision.
- No separate summary/aggregate query over submissions exists that the edit's invalidation might leave stale.
- No admin-auth check on the new route is the pre-existing, already-documented app-wide gap (see this file's Plan), not a regression introduced here.
