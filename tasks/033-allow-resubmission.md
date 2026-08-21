---
id: 033
title: Allow resubmission - overwrite an employee's existing submission instead of rejecting it
status: done
depends_on: []
parallelizable_with: []
epic: open-round-editing
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-21
---

## Goal

Once an admin's fix (tasks 030/031) clears part of an employee's submission, that employee has no way to complete it — `POST /api/rounds/:id/submissions` currently rejects any second submission for the same `(round, employee)` with a 409, a deliberate v1 deferral (task 009, project-idea.md item 6: "no edit-after-submit"). Close that gap the simplest way: submitting again for the same round with the same name overwrites the previous submission in place, matching `docs/architecture.md`'s original data-model intent ("resubmitting updates the row in place"). This also lets any employee freely change their mind, not just one whose selection was admin-cleared.

## Acceptance Criteria

- [ ] `POST /api/rounds/:id/submissions` for a `(roundId, employeeId)` pair with an existing submission updates that row's `foodRoundMenuItemId`, `foodNote`, `drinkRoundMenuItemId`, `drinkNote`, and `updatedAt`, instead of returning 409 — response is the updated row, 200
- [ ] All existing validation (round must be `open`, deadline not passed, employee exists, food/drink round-menu-item must exist and belong to the round's respective restaurant) is unchanged and still runs before the insert-or-update decision
- [ ] A brand-new `(roundId, employeeId)` pair still inserts and returns 201, unchanged from today
- [ ] `ERROR_MESSAGES.submissionDuplicate` and its 409 path are removed once nothing references them
- [ ] `apps/web/src/routes/public/Round.tsx`'s submission flow needs no change beyond what already exists — a second submit for the same name now succeeds instead of showing the duplicate-submission error toast
- [ ] `pnpm -r typecheck && pnpm --filter web build && pnpm test` passes

## Plan

### API (`apps/api/src/routes/rounds.ts`, `apps/api/src/lib/errors.ts`)

1. `rounds.ts`, `POST /:id/submissions`: replace the current
   ```ts
   const [existing] = await db
     .select()
     .from(submissions)
     .where(and(eq(submissions.roundId, roundId), eq(submissions.employeeId, employeeId)));
   if (existing) {
     return c.json({ error: ERROR_MESSAGES.submissionDuplicate }, 409);
   }

   const [row] = await db
     .insert(submissions)
     .values({ roundId, employeeId, foodRoundMenuItemId, foodNote, drinkRoundMenuItemId, drinkNote })
     .returning();
   return c.json(row, 201);
   ```
   with an insert-or-update branch:
   ```ts
   const [existing] = await db
     .select()
     .from(submissions)
     .where(and(eq(submissions.roundId, roundId), eq(submissions.employeeId, employeeId)));

   if (existing) {
     const [row] = await db
       .update(submissions)
       .set({ foodRoundMenuItemId, foodNote, drinkRoundMenuItemId, drinkNote, updatedAt: new Date() })
       .where(eq(submissions.id, existing.id))
       .returning();
     return c.json(row);
   }

   const [row] = await db
     .insert(submissions)
     .values({ roundId, employeeId, foodRoundMenuItemId, foodNote, drinkRoundMenuItemId, drinkNote })
     .returning();
   return c.json(row, 201);
   ```
   (Keep this as plain select-then-branch, matching the codebase's existing non-transactional style for this route — no new transaction introduced here.)
2. `errors.ts`: remove `submissionDuplicate` once its last reference (in `rounds.ts` and its test) is gone.

### Tests

3. `apps/api/src/routes/rounds.test.ts`: rewrite `"POST rejected with 409 on a duplicate (roundId, employeeId) submission"` (~line 1903) into `"POST for an existing (roundId, employeeId) submission overwrites it"` — submit once, submit again with different `foodRoundMenuItemId`/`drinkRoundMenuItemId`/notes, assert `200` and that a follow-up `GET /:id/submissions` shows exactly one row for that employee holding the second submission's values (not two rows, not the first submission's values).
4. `apps/web/src/routes/public/Round.test.tsx`: rewrite the test at line ~284-296 (currently mocks a 409 and asserts the "you have already submitted" toast) into a test that a second submission succeeds — mock a 200 response and assert the success state renders, matching the first-submission success path already covered elsewhere in this file.

## Implementation Log

- Red commit: `882feac` — `test: cover submission resubmission overwrite`
- Green commit: `1aa5011` — `feat: overwrite an existing submission on resubmit instead of rejecting` (amended after review to also fix `e2e/round-lifecycle.spec.ts`, see Plan Deviations)
- `pnpm -r typecheck && pnpm --filter web build && pnpm test` → all passing (22 test files, 304 tests)
- `pnpm test:e2e` → 10/11 passing; `smoke.spec.ts:9` ("SPA shell loads") fails both with and without this task's changes (verified via `git stash`), a pre-existing flake unrelated to this task

## Plan Deviations

- The web test rewrite (`apps/web/src/routes/public/Round.test.tsx`) turned out to require no red phase: mocking a `200` response for the second POST already passed against the unmodified frontend, since the submit handler only checks `response.ok` and doesn't distinguish `200` from `201`. This confirms the Acceptance Criteria's expectation that `Round.tsx` needs no change — noted here because it means that file's test never went red, unlike every other test in this task.
- The API test (`rounds.test.ts`) was written more thoroughly than the Plan's rewrite sketch: it changes `foodRoundMenuItemId` to a second, distinct round menu item (not just notes) and also exercises the drink fields, then asserts via a follow-up `GET .../submissions` that exactly one row exists for the employee with the overwritten values — matching the Plan's own guidance to check "not two rows, not the first submission's values" more literally than the one-line description suggested.
- Not anticipated by the Plan: `e2e/round-lifecycle.spec.ts` had its own test asserting the *old* 409-rejection behavior on a second submission (`"you have already submitted for this round"`), which the code-reviewer agent caught — it isn't covered by `test_command` (a separate suite, per `CLAUDE.md`) so it silently would have broken on the next `pnpm test:e2e` run. Fixed it to re-select the food/drink items and assert the overwrite succeeds instead, renamed the test, and verified both that it now passes and that it genuinely failed before the fix (via `git stash`).

## Review Notes

`feature-dev:code-reviewer` review of the red→green diff:

**Important — Stale e2e test asserted the exact behavior this task removes (`e2e/round-lifecycle.spec.ts:188-200`)** (confidence 90). The block wasn't touched by the task's own plan (only `rounds.test.ts`/`Round.test.tsx` were), but it directly exercised the resubmission flow: it asserted the removed "you have already submitted for this round" 409 message, and its second submission only reselected the food item (not drink), which would have wiped the drink note ("Less ice") that a later admin-view assertion in the same test depended on. Not caught by `test_command` since `pnpm test:e2e` is a separate suite. **Fixed**: reselected food+drink+note on the second submission, updated the assertion to expect the success message instead of the 409 error, and renamed the test from "...a second submission is rejected" to "...a second submission overwrites it". Verified both that the fix passes and that it fails without the fix (via `git stash`).

Verified, not flagged: `useCreateSubmission` invalidates queries rather than optimistically appending, so a resubmission doesn't risk a duplicate row rendering client-side (confirms "no frontend change needed" from the Acceptance Criteria). The `submissions` table's `unique(roundId, employeeId)` constraint means the pre-existing non-transactional select-then-branch race (already present in this route, per the task's own Plan) still only surfaces as the existing generic 500 path on a genuine race — not a new regression from this change.
