---
id: 024
title: Show all submitted orders on the public round page
status: in_review
depends_on: [010]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-15
---

## Goal

Employees have no login and nothing persists client-side after they submit, so today they have no way to see what they (or anyone else) ordered for a round — the only view of that data is the admin-only `RoundDetail.tsx` (task 010). Bring the same submissions list to the public round page (`/r/:roundId`), always visible alongside the submission form, so anyone can find their own row by scanning it.

## Acceptance Criteria

- [x] A shared `apps/web/src/routes/shared/useRoundSubmissions.ts` hook (relocated from `apps/web/src/routes/admin/useRoundSubmissions.ts`, same `RoundSubmission` type / `roundSubmissionKeys` / `useRoundSubmissions(roundId)`, no behavior change) is importable by both `routes/admin/` and `routes/public/`.
- [x] A shared `apps/web/src/routes/shared/SubmissionsTable.tsx` (exporting `SUBMISSION_COLUMNS` and `SubmissionsTable({ submissions })`) renders the existing admin table markup (Employee, Food, Food note, Drink, Drink note; "No submissions yet." when empty) — extracted, not duplicated.
- [x] `RoundDetail.tsx` (admin) uses the shared hook and `SubmissionsTable` in place of its former local copies; its Export CSV button and CSV shape are unchanged.
- [x] The public round page's open-and-before-deadline view renders the submissions list (via the shared `SubmissionsTable`) as a sibling of the submission form — visible whether or not the current visitor has submitted yet, and still visible after the form flips to its post-submit "Thanks!" state.
- [x] All other `Round.tsx` branches (draft/404, 500, closed, deadline-passed) are unchanged — no submissions fetch fires there.
- [x] After a successful submit, the list reflects the new row without a page reload (`useCreateSubmission`'s `onSuccess` invalidates `roundSubmissionKeys.list(roundId)` before its existing success toast, per `.claude/rules/mutation-feedback.md`'s invalidate-then-toast convention).
- [x] No edit/delete affordance on the public list — read-only, matching task 009's existing "no edit-after-submit in v1" decision.

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

- Red commit: `4649147` — `test: add failing coverage for public round submissions list`.
  `pnpm -r typecheck && pnpm --filter web build && pnpm test` → 3 failing (the 3 new
  `Round.test.tsx` cases in the new "submissions list" describe block; all 224
  pre-existing tests stayed green, including the 8 open/before-deadline
  `Round.test.tsx` cases updated with the new `.../submissions` mock).
- Green commit: `fb2d79e` — `feat: show submitted orders on the public round page`.
  `pnpm -r typecheck && pnpm --filter web build && pnpm test` → all passing (227/227).
  Also ran `pnpm test:e2e round-lifecycle.spec.ts` directly (not part of `test_command`,
  but the task's e2e assertion lives there) → 3/3 passing, including the new
  "employee's name now visible in the submissions list" assertion.
- `pnpm lint` → clean except one pre-existing-pattern warning in the new
  `SubmissionsTable.tsx` (`react(only-export-components)`, same warning already
  present on `button.tsx`/`badge.tsx` for the same reason: a UI file exporting a
  constant alongside a component). Not fixed — the acceptance criteria explicitly
  requires `SUBMISSION_COLUMNS` and `SubmissionsTable` to be exported from the same
  file, and splitting them would contradict that and diverge from the established
  pattern.

## Plan Deviations

- The plan's step-1 and step-2 refactor commits (move `useRoundSubmissions.ts`,
  extract `SubmissionsTable.tsx`) ended up staged into the red and green commits
  instead of being their own intermediate commits — `git mv` auto-stages both
  sides of a rename, and it was already staged by the time the red commit was
  made. Net effect on the two required commits (one red/one green) is unchanged;
  no separate commits were promised for the intermediate refactor steps, but the
  plan's own step-by-step commit framing implied a cleaner isolation than what
  actually landed.
- Two of the three new component tests initially asserted
  `screen.getByRole("heading", { name: "Place your order" })` — wrong assumption
  that `CardTitle` renders as a heading role; it's a plain `<div>`
  (`apps/web/src/components/ui/card.tsx`), not a semantic heading. Caught by the
  test itself failing for the wrong reason (`getByRole` finding nothing) during
  the green run, fixed to `screen.getByText(...)` before re-running. Not caught
  during the initial red run because both new tests happened to fail on the
  submissions-list assertion first (short-circuiting before the heading line
  ran) rather than surfacing this second, independent problem.
- `tasks/024-public-submissions-list.md` itself (this file) landed inside the
  `feat` green commit rather than staying uncommitted until the dedicated chore
  step — a `git add -A` swept it in along with the implementation. It's finalized
  again in the chore commit, so no content is lost, but it means the file's
  history has one extra intermediate commit beyond what the loop's docs describe.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the red→green diff (`4649147`..`fb2d79e`,
code files only). No issues at confidence ≥ 80. Full output:

> ## Review scope
>
> Reviewed the diff for task 024 ("Show all submitted orders on the public round page"), red commit `4649147` → green commit `fb2d79e`, covering:
> - `apps/web/src/routes/admin/RoundDetail.tsx`
> - `apps/web/src/routes/public/Round.tsx`, `Round.test.tsx`, `useSubmission.ts`
> - new `apps/web/src/routes/shared/SubmissionsTable.tsx` (and the already-moved `apps/web/src/routes/shared/useRoundSubmissions.ts`)
>
> I also read the current `apps/api/src/routes/rounds.ts` GET `/rounds/:id/submissions` handler, `docs/architecture.md`, `apps/web/src/components/ui/card.tsx`, `apps/web/src/routes/admin/useRestaurants.ts` (the cited mutation-invalidation precedent), and `tasks/024-public-submissions-list.md`'s Implementation Log/Plan Deviations to check a couple of things that looked suspicious at first glance.
>
> ## Findings
>
> No issues at confidence ≥ 80. Specifically ruled out, in order of how alarming they first looked:
>
> 1. **Public page hitting an admin-only endpoint** — the public `SubmissionsCard` calls the same `GET /rounds/:id/submissions` the admin page uses. Checked `apps/api/src/routes/rounds.ts`: no auth middleware wraps this route (or any route in the file), and `docs/architecture.md` states explicitly the app "has no authorization by design." Not an issue.
>
> 2. **`Round.test.tsx` assertion weakened from `getByRole("heading", ...)` to `getByText(...)`** — this looked like a red test edited to fit broken code rather than a real fix. Confirmed `CardTitle` (`apps/web/src/components/ui/card.tsx`) renders a plain `<div>` with no heading role, so the original `getByRole("heading")` assertion in the red commit was simply wrong from the start (a bad assumption in the newly-written test, not a regression in production code). This is already called out transparently in the task file's own Plan Deviations section, so it's disclosed, not masked. Not an issue.
>
> 3. **`onSuccess` invalidation not awaited/returned in `useSubmission.ts`** — compared against the cited convention precedent, `useRestaurants.ts`'s `useCreateRestaurant`, which does the identical fire-and-forget `invalidateQueries(...)` then `toast.success(...)` without awaiting. Matches convention exactly. Not an issue.
>
> 4. Verified independently and all correct: query key shape (`roundSubmissionKeys.list(roundId)`, `roundId` as `number` on both the hook and the invalidation call), `SUBMISSION_COLUMNS` still drives `RoundDetail.tsx`'s CSV export (`toCsv(SUBMISSION_COLUMNS, rows)`) so CSV shape is unchanged, `SubmissionsCard` is a sibling of `SubmissionForm` (survives the post-submit `submitted` state flip), it's mounted only in `Round.tsx`'s final open/before-deadline return block (no fetch in draft/404/500/closed/deadline-passed branches), and the old `admin/useRoundSubmissions.ts` is gone with no orphaned duplicate.
>
> One pre-existing, inherited (not introduced) behavior worth a one-line mention rather than a finding: while the submissions query is pending or if it errors, `data` is `undefined` and `SubmissionsTable` renders "No submissions yet." — a brief flash of the empty-state message, and a silently-wrong message on fetch failure. This is exactly the extracted admin behavior (AC explicitly requires "no behavior change" in the extraction), just now also visible on the public page. Not flagging as an issue since it's inherited scope, not new.
>
> ## Summary
>
> The diff matches all stated acceptance criteria: the hook and table are genuinely shared (not duplicated), the admin CSV export path is untouched, the public page shows the list as a sibling of the form in the correct single branch, the mutation follows the project's invalidate-then-toast convention using the established pattern, and the list is read-only on the public side. Nothing here rises to a reportable issue at the required confidence bar.
