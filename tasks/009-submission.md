---
id: 009
title: Employee submission
status: in_review
depends_on: [008]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

The core employee action: pick your name, pick food (+ optional note) and optionally drink (+ optional note), submit. No edit-after-submit in v1 (project-idea.md item 6 is explicitly deferred) — a duplicate submission for the same round+employee is a hard rejection, not an upsert.

## Acceptance Criteria

- [x] `POST /api/rounds/:id/submissions` (`employeeId`, `foodRoundMenuItemId`, `foodNote?`, `drinkRoundMenuItemId?`, `drinkNote?`)
- [x] Rejected if the round's `status !== "open"`
- [x] Rejected if `now > deadline`, checked independently of `status` (both conditions matter even though in practice closing should happen first)
- [x] Rejected (409) on a duplicate `(roundId, employeeId)` — matches the schema's unique constraint, no upsert behavior
- [x] Rejected if `drinkRoundMenuItemId` is provided but the round has no `drinkRestaurantId`
- [x] `/r/:roundId` gets the actual submission form: employee searchable dropdown (from active employees), food pick + note, drink pick + note (rendered only if the round has a drink restaurant), submit button, success state after submitting

## Plan

1. Extend `apps/api/src/routes/rounds.ts` (or a sibling `submissions.ts`) with `POST /api/rounds/:id/submissions`.
2. TDD units: happy path persists a row; closed/draft round rejected; deadline-passed rejected even if `status` is still `open`; duplicate employee+round is 409; drink fields on a food-only round rejected.
3. UI: extend `apps/web/src/routes/public/Round.tsx` (task 008) with the actual form — employee picker sourced from `GET /api/employees?active=true`, item pickers sourced from the public round data.

## Implementation Log

- red commit: `62332fa` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 13 failing (new `describe("submissions", ...)` block in `apps/api/src/routes/rounds.test.ts`; everything else in the suite still passing at 191)
- green commit: `f9ad8d3` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing, 210/210 (13 backend submission tests + 6 new/updated frontend `Round.test.tsx` cases, one of which is the review-fix regression test below). Also ran `pnpm lint` (clean, aside from two pre-existing warnings in untouched `components/ui/*.tsx` files) and `pnpm test:e2e` (see Plan Deviations).

Backend: added `POST /:id/submissions` to `apps/api/src/routes/rounds.ts` (kept in the same file rather than a sibling `submissions.ts`, matching how `/:id/menu-items` is already nested there). Validation order: round exists (404) → status is `open` (400) → deadline hasn't passed (400, checked as an independent `if` after the status check, not an `else`) → employee exists (404) → food round-menu-item exists for this round (404) and belongs to the round's food restaurant (400) → drink round-menu-item, if provided, requires `drinkRestaurantId` (400), then the same exists/belongs-to-drink-side pair of checks → duplicate `(roundId, employeeId)` pre-check (409, select-then-insert, matching the existing `roundMenuItemAlreadyCurated` convention rather than catching the Postgres unique-violation code) → insert.

Frontend: `Round.tsx`'s two read-only item-list `Card`s are replaced by a `SubmissionForm` (food/drink `<select>`s sourced from the round's own curated items, matching `RoundDetail.tsx`'s existing native-select convention; notes are plain optional `Input`s; validation follows `.claude/rules/form-validation.md`'s hand-rolled pattern for non-`useRequiredField` fields, as `RoundDetail.tsx`'s `EditRoundForm` already does for its restaurant selects). New `EmployeeCombobox.tsx` (typeahead `Input` + filtered listbox, `onMouseDown preventDefault` on options so a click registers before the input's blur closes the list) and `useSubmission.ts` (`useActiveEmployees` against the already-existing `GET /employees?active=true`, `useCreateSubmission` following `.claude/rules/mutation-feedback.md`).

## Plan Deviations

- **No searchable-dropdown component existed to reuse.** The Plan didn't anticipate this — the codebase's only "pick one of a list" pattern is a native `<select>`, and nothing filterable existed. Built a minimal one (`EmployeeCombobox.tsx`: filtered `Input` + `listbox`) rather than pulling in a new dependency (`cmdk`, Radix `Popover`) for a single field.
- **Frontend tests weren't written red-first.** The backend followed TDD strictly (red commit `62332fa` has 13 failing API tests, green commit `e357d85` makes them pass). For the frontend, `Round.test.tsx`'s new/updated cases and the `SubmissionForm`/`EmployeeCombobox`/`useSubmission` implementation landed together in the green commit instead of a separate failing-frontend-tests-first step — there was no way to assert against the new form's DOM structure without first deciding what that structure was, and re-splitting it after the fact would have been performative rather than a real red/green cycle.
- **Two FK-integrity checks beyond the letter of the Acceptance Criteria**: (1) `employeeId` must reference a real employee (404 `employeeNotFound`) — the criteria don't mention this, but every other route in `rounds.ts` 404s on a dangling FK rather than letting the insert hit a Postgres constraint violation and surface as a raw 500; skipping it here would have been the actual inconsistency. (2) `foodRoundMenuItemId`/`drinkRoundMenuItemId` must belong to *this* round and to the correct side (food vs. drink) — the criteria only say "food pick from the round's own curated items" implicitly via the UI, but nothing in the wire contract stopped a fabricated request from referencing another round's item or a drink item in the food slot; added the same belongs-to-restaurant check `/:id/menu-items` already does for curation.
- **Found and fixed a pre-existing e2e assertion that this task's UI change broke**: `public-round.spec.ts` (task 008) asserted `getByText("Pho Bo")).toBeVisible()` on the public round page; that text is now inside a `<select>`'s `<option>`, which Playwright doesn't treat as "visible". Changed the assertion to check the food-item select's `textContent` instead.
- **Found and fixed a bug in my own new e2e spec before it was ever committed clean**: the first draft of `public-round-submission.spec.ts` opened a round to submit against but never closed it afterward, unlike every other round-opening spec. Only one round can be open app-wide, so that leaked an open round for the rest of the same `playwright test` run and made *other* specs' own "Open" step fail nondeterministically depending on run order/parallelism. Added a closing step at the end; also merged what was originally two separate tests (happy path, duplicate rejection) into one so the spec only opens a round once instead of twice.
- **Pre-existing, unrelated e2e flakiness noticed while debugging the above** (not fixed — out of scope for this task, flagged for the user/a retrospective pass instead): `admin-restaurants.spec.ts`'s drink-restaurant test does `getByLabel("Type", { exact: false })`, which now matches both the create form's `#restaurant-type` and the list's `#restaurant-type-filter` (both labeled "Type") and throws a Playwright strict-mode violation; `smoke.spec.ts`'s "SPA shell loads" test does `getByText("Open")` / `getByText("Closed")`, which collides with the homepage's `RoundStatusBadge` text once any round exists in the test DB from an earlier spec in the same run. Neither is caused by task 009's changes — both reproduce identically on this same test DB regardless of task 009's diff, and are pre-existing gaps in already-`done` tasks' own specs.

## Review Notes

`feature-dev:code-reviewer` reviewed the red→green diff (excluding test-file diffs, per its own scope note). One finding, fixed before the commit below:

- **Important — `EmployeeCombobox` never closed its dropdown on blur/click-away.** Once focused and typed into, the listbox stayed mounted indefinitely (no `onBlur`/outside-click handler ever set `open` back to `false`). Since the listbox is `absolute`, it would sit on top of whatever field came next in the form (the food-item select) rather than being pushed out of the way, so a user who typed a name, got distracted, then clicked where the food select visually was could land on a stale employee option instead — silently submitting under the wrong name. Fixed by adding an `onBlur` on the combobox's wrapper `div` that closes the dropdown unless the new focus target is still inside the wrapper (`e.currentTarget.contains(e.relatedTarget)`), so a click on one of its own options doesn't count as leaving. Added a regression test ("closes the employee dropdown when focus moves away without a selection") and folded the fix into the green commit rather than a separate one, since it's fixing a bug in code that was never pushed/reviewed independently.

Everything else the reviewer checked came back clear: FK-integrity checks correctly reject both cross-round and cross-restaurant (food/drink swap) references; the independent status/deadline checks are intentional and covered; the duplicate select-then-insert 409 matches the file's existing convention (the inherent TOCTOU race is an accepted tradeoff of that pattern, not new here); the draft-round 400 (rather than the public GET's info-hiding 404) is a deliberate, tested design choice, not an inconsistency; `employees.active` not being re-checked at submission time matches the rest of the codebase treating `active` as a display filter, not access control.
