---
id: 033
title: Allow resubmission - overwrite an employee's existing submission instead of rejecting it
status: approved
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

## Plan Deviations

## Review Notes
