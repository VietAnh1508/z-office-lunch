---
id: 063
title: Require drink size when the item has sizes; show Size in table and CSV
status: in_review
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

- [x] `parseSubmissionFields`: when the chosen drink item has any `menu_item_sizes`, a missing size is a 400 `drinkSizeRequired`. Items with no sizes still reject any size sent (059's `drinkSizeNotAvailable`). Applies to POST and the admin PATCH.
- [x] Existing tests that submit a drink for items that now have sizes are updated (seed items with no sizes, or send one).
- [x] Submissions table (`SubmissionsTable.tsx`, `submissionColumns.ts`) shows a "Size" column after "Drink" when the round has a drink restaurant; the cell is blank for items without sizes and shows a visible "Size missing" marker when the item has sizes but the submission has none (e.g. after a preset reset). Header and body cells, and last-column padding logic, stay in sync.
- [x] CSV export includes the Size column (blank when none; a clear "size missing" text is not needed in the file). Headers and rows both come from the same column list.
- [x] Tests: API (required when the item has sizes; rejected when it has none), `SubmissionsTable` rendering incl. the missing marker, CSV rows, e2e assertions on the table (check `getByRole("cell",{name})` queries aren't made ambiguous by new cells, e.g. `round-lifecycle.spec.ts:211`).
- [x] `docs/architecture.md` updated: data model rows for `SizePreset`, `SizeOption`, `MenuItemSize`, `Restaurant.size_preset_id`, `Submission.drink_size_option_id`, and a "Decisions worth recording" entry (named presets, per-item join with auto-fill, reset on preset change, no snapshot). Task 038's "listed once, not split per size" note now points to the size model.

## Plan

- "Size missing" needs to know whether the item has sizes: the submissions list (059) returns `drinkSize`/`drinkSizeOptionId`; add a boolean `drinkItemHasSizes` (or derive from the sizes already exposed to the admin) — decide in the red phase.
- `SubmissionsTable.tsx:60-66` cells are hard-coded in column order; `RoundDetail.tsx:456-467` builds CSV rows by hand — update both together. `toCsv` is TAB-delimited with a BOM (`lib/csv.ts`); keep as is.
- Files: `apps/api/src/routes/rounds.ts` (+ tests), `lib/errors.ts`, `SubmissionsTable.tsx`, `submissionColumns.ts`, `RoundDetail.tsx`, related tests, `e2e/round-lifecycle.spec.ts`, `docs/architecture.md`.

## Implementation Log

- red commit: 68599bf — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 7 failing (3 API: size required on POST/PATCH, `drinkItemHasSizes` in list; 4 web: Size column in table/CSV headers and cells). Scaffolding: `ERROR_MESSAGES.drinkSizeRequired`, `drinkItemHasSizes` on the web `RoundSubmission` type. e2e sized-drink test extended to check the admin table shows the size (`exact: true` cell match so "M" doesn't hit "Milk Tea").
- green commit: 095e1d0 — API: `parseSubmissionFields` loads the drink item's `menu_item_sizes` once and returns `drinkSizeRequired` (no size, item has sizes) or `drinkSizeNotAvailable` (size not in the list). Submissions list gains `drinkItemHasSizes` (an `exists` subquery).
- green commit: cd96fd3 — web: `submissionColumns` returns column definitions (header, value, optional `missing`) that drive the table header, body and the CSV. Size column after Drink; "Size missing" marker in the table only.
- docs commit: 0958819 — `docs/architecture.md`: `SizePreset`/`SizeOption`/`MenuItemSize` rows, `Restaurant.size_preset_id`, `Submission.drink_size_option_id`, a drink-size decision entry; task 038's note points to it.
- `test_command` -> all passing (565 tests). `pnpm test:e2e` -> 19 passed. `pnpm lint` -> only 3 pre-existing warnings in untouched files.

## Plan Deviations

- Picked `drinkItemHasSizes` computed server-side (as the Plan suggested first) over deriving it from the item sizes the admin page already loads, so `SubmissionsTable` stays self-contained.
- Went a bit further than "update both together": `submissionColumns` now returns column definitions instead of header strings, so the table body and CSV rows can't drift from the headers. This also fixed an existing padding mismatch (in a food-only round the last body cell, Food note, still had `pr-4`).
- Environment: the first test run failed with a Postgres auth error because another project's container (`staffing-postgres`) held port 5432, so this project's container started with no published port. The user stopped the other container; nothing in the repo changed. `pnpm db:up` doesn't warn about this. Worth a check in `scripts/dev-setup.sh` / docs.
- No existing tests needed changes beyond the planned ones: only `submission-drink-size.test.ts` posted a drink for a sized item without a size (the "not required yet" test, now flipped to expect 400).

## Review Notes

feature-dev:code-reviewer: no issues at confidence 80 or above. It checked:
- `parseSubmissionFields`: one query covers required and not-available; empty/null become null; POST and PATCH share it; error string in `ERROR_MESSAGES`.
- `drinkItemHasSizes` subquery: false when there's no drink (alias null); the marker also checks `drinkRoundMenuItemId !== null`.
- Admin edit dialog and public form already require/send a size for sized items, so the stricter API doesn't break either flow.
- Single column list drives header, body and CSV; keys unique; other `RoundSubmission` consumers unaffected.
- Architecture doc rows and decision entry match the spec.

Nothing to fix.
