---
id: 024
title: Show all submitted orders on the public round page
status: in_progress
depends_on: [010]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-15
---

## Goal

Employees have no login and nothing persists client-side after they submit, so today they have no way to see what they (or anyone else) ordered for a round — the only view of that data is the admin-only `RoundDetail.tsx` (task 010). Bring the same submissions list to the public round page (`/r/:roundId`), always visible alongside the submission form, so anyone can find their own row by scanning it.

## Acceptance Criteria

- [ ] A shared `apps/web/src/routes/shared/useRoundSubmissions.ts` hook (relocated from `apps/web/src/routes/admin/useRoundSubmissions.ts`, same `RoundSubmission` type / `roundSubmissionKeys` / `useRoundSubmissions(roundId)`, no behavior change) is importable by both `routes/admin/` and `routes/public/`.
- [ ] A shared `apps/web/src/routes/shared/SubmissionsTable.tsx` (exporting `SUBMISSION_COLUMNS` and `SubmissionsTable({ submissions })`) renders the existing admin table markup (Employee, Food, Food note, Drink, Drink note; "No submissions yet." when empty) — extracted, not duplicated.
- [ ] `RoundDetail.tsx` (admin) uses the shared hook and `SubmissionsTable` in place of its former local copies; its Export CSV button and CSV shape are unchanged.
- [ ] The public round page's open-and-before-deadline view renders the submissions list (via the shared `SubmissionsTable`) as a sibling of the submission form — visible whether or not the current visitor has submitted yet, and still visible after the form flips to its post-submit "Thanks!" state.
- [ ] All other `Round.tsx` branches (draft/404, 500, closed, deadline-passed) are unchanged — no submissions fetch fires there.
- [ ] After a successful submit, the list reflects the new row without a page reload (`useCreateSubmission`'s `onSuccess` invalidates `roundSubmissionKeys.list(roundId)` before its existing success toast, per `.claude/rules/mutation-feedback.md`'s invalidate-then-toast convention).
- [ ] No edit/delete affordance on the public list — read-only, matching task 009's existing "no edit-after-submit in v1" decision.

## Plan

1. Move `apps/web/src/routes/admin/useRoundSubmissions.ts` → `apps/web/src/routes/shared/useRoundSubmissions.ts` unchanged; update `RoundDetail.tsx`'s import. Run tests — stays green (`RoundDetail.test.tsx` mocks the HTTP route, not the module path).
2. Extract `apps/web/src/routes/shared/SubmissionsTable.tsx` (`SUBMISSION_COLUMNS` + `SubmissionsTable`) from `RoundDetail.tsx`'s existing inline table; update `RoundDetail.tsx` to use it, deleting its local copies. `handleExportCsv` keeps using the (now imported) `SUBMISSION_COLUMNS`. Run tests — admin stays green.
3. Add an `http.get(".../submissions", ...)` handler returning `[]` to every existing `Round.test.tsx` case that reaches the open/before-deadline branch, so the suite stays green once that branch starts fetching submissions (pure setup, no new assertions yet).
4. Write the new failing tests (component + e2e, below) — red commit.
5. Implement: a `SubmissionsCard` (own file or inlined in `Round.tsx`, mirroring `SubmissionForm` already being a sibling function there) fetching via the shared `useRoundSubmissions(roundId)` and rendering `SubmissionsTable`, mounted only in `Round.tsx`'s open/before-deadline branch as a sibling to `SubmissionForm`; add the `queryClient.invalidateQueries({ queryKey: roundSubmissionKeys.list(roundId) })` call to `useCreateSubmission`'s `onSuccess` in `apps/web/src/routes/public/useSubmission.ts`. Run full suite — green, commit.
6. Bookkeeping commit (status/review-notes) per the usual task convention.

**Tests:**
- `Round.test.tsx`: renders existing submissions in a table alongside the form (one-row case + zero-submissions "No submissions yet." case, both with the form still present); list refetches after a successful submit (mock the submissions GET to return `[]` on its first call and the new row on its second — a call-counter/stateful resolver, not an unconditional return, so the test actually proves the invalidation is wired up, not just that the mock returns a fixed value).
- `e2e/round-lifecycle.spec.ts`: extend the existing "employee submits food and drink picks, then a second submission is rejected" test — right after the first successful submit's "Thanks!" assertion and before the later second-submission attempt, assert the employee's name is now visible in the submissions list. Don't add a new spec file (only one round can be `open` app-wide at a time).

**Non-goal:** closed/draft/deadline-passed round pages do not gain a submissions list in this task — only the open+before-deadline branch does. Showing final orders after a round closes is a plausible follow-up, not part of this task.

## Implementation Log

(Filled in by /implement-task.)

## Plan Deviations

(Filled in by /implement-task.)

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
