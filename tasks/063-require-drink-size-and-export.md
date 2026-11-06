---
id: 063
title: Require drink size when the item has sizes; show Size in table and CSV
status: approved
depends_on: [062]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Make the size mandatory on the backend now that both submission UIs send it, and surface it where admin reads orders.

## Acceptance Criteria

- [ ] `parseSubmissionFields`: when the chosen drink item has any `menu_item_sizes`, a missing size is a 400 `drinkSizeRequired`. Items with no sizes still reject any size sent (059's `drinkSizeNotAvailable`). Applies to POST and the admin PATCH.
- [ ] Existing tests that submit a drink for items that now have sizes are updated (seed items with no sizes, or send one).
- [ ] Submissions table (`SubmissionsTable.tsx`, `submissionColumns.ts`) shows a "Size" column after "Drink" when the round has a drink restaurant; the cell is blank for items without sizes and shows a visible "Size missing" marker when the item has sizes but the submission has none (e.g. after a preset reset). Header and body cells, and last-column padding logic, stay in sync.
- [ ] CSV export includes the Size column (blank when none; a clear "size missing" text is not needed in the file). Headers and rows both come from the same column list.
- [ ] Tests: API (required when the item has sizes; rejected when it has none), `SubmissionsTable` rendering incl. the missing marker, CSV rows, e2e assertions on the table (check `getByRole("cell",{name})` queries aren't made ambiguous by new cells, e.g. `round-lifecycle.spec.ts:211`).
- [ ] `docs/architecture.md` updated: data model rows for `SizePreset`, `SizeOption`, `MenuItemSize`, `Restaurant.size_preset_id`, `Submission.drink_size_option_id`, and a "Decisions worth recording" entry (named presets, per-item join with auto-fill, reset on preset change, no snapshot). Task 038's "listed once, not split per size" note now points to the size model.

## Plan

- "Size missing" needs to know whether the item has sizes: the submissions list (059) returns `drinkSize`/`drinkSizeOptionId`; add a boolean `drinkItemHasSizes` (or derive from the sizes already exposed to the admin) — decide in the red phase.
- `SubmissionsTable.tsx:60-66` cells are hard-coded in column order; `RoundDetail.tsx:456-467` builds CSV rows by hand — update both together. `toCsv` is TAB-delimited with a BOM (`lib/csv.ts`); keep as is.
- Files: `apps/api/src/routes/rounds.ts` (+ tests), `lib/errors.ts`, `SubmissionsTable.tsx`, `submissionColumns.ts`, `RoundDetail.tsx`, related tests, `e2e/round-lifecycle.spec.ts`, `docs/architecture.md`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
