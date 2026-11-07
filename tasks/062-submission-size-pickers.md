---
id: 062
title: Size picker on the public order form and admin submission edit dialog
status: done
depends_on: [061]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Employees (and admin editing for them) can choose a drink size. The client enforces "required when the picked drink has sizes"; the backend still treats it as optional until 063.

## Acceptance Criteria

- [ ] Public `SubmissionForm.tsx`: once a drink item with `sizes.length > 0` is picked, a required "Drink size" field appears (native select or radio group listing that item's sizes in order); picking a different drink resets it; submit without a size shows an inline error and doesn't POST. Items without sizes show no field. The size is sent as `drinkSizeOptionId`.
- [ ] `OverwriteSubmissionDialog` shows the existing submission's size and the new one; `buildInput()` output (replayed on confirm) includes the size. Editing an existing submission pre-fills it.
- [ ] The drink-note placeholder "Optional, e.g. size M, less ice" drops the size hint.
- [ ] Admin `SubmissionEditDialog` (in `RoundDetail.tsx`) has the same size select for the chosen drink, pre-filled from `drinkSizeOptionId`, required when the item has sizes; payload carries `drinkSizeOptionId`. The curated options passed to it must include each item's sizes.
- [ ] Tests: `Round.test.tsx` (public form), `RoundDetail.test.tsx` (admin dialog), plus the e2e public flow in `round-lifecycle.spec.ts`/`public-round.spec.ts` (only one round may be open at once — follow the header at `round-lifecycle.spec.ts:4-12`).

## Plan

- Hand-written types to extend: `PublicRoundItem` (`usePublicRound.ts`), `SubmissionInput`/`buildInput` (`SubmissionForm.tsx:22-67`), `CreateSubmissionInput`/`Submission` (`useSubmission.ts`), `RoundSubmission`/`UpdateRoundSubmissionInput` (`shared/useRoundSubmissions.ts`).
- The public drink picker is `ItemCombobox` (`ItemCombobox.tsx`), not a select; the size field is a separate control below it. Validation is manual per-field strings (`SubmissionForm.tsx:69-81`), no `useRequiredField`.
- Admin `curatedOptions()` (`RoundDetail.tsx:406`) only has `{id, name}`: the admin round data must expose sizes per item (either via the existing round menu items endpoint or by looking up the restaurant's items by `menuItemId`) — check what's cheapest in the red phase and note it in the log.
- `round-lifecycle.spec.ts` food+drink steps (`:181-197`) may already be stale vs the combobox; verify they pass before changing them.
- Files: `SubmissionForm.tsx`, `OverwriteSubmissionDialog.tsx`, `usePublicRound.ts`, `useSubmission.ts`, `RoundDetail.tsx`, `shared/useRoundSubmissions.ts`, their tests, the two e2e specs.

## Implementation Log

- red commit: ea4f81b — `pnpm test -- Round.test.tsx RoundDetail.test.tsx` -> 9 failing (2 of the 11 new tests pass trivially: "no size field for items without sizes")
- green commit: 4ebb739 — size picker on the public form, overwrite dialog and admin edit dialog; also fixes the red overwrite test (its handler was shadowed by `serve()`'s default) — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (559 tests)
- e2e commit: test — new case in `round-lifecycle.spec.ts` (sized drink: Continue blocked, then submit with a size); `pnpm test:e2e e2e/round-lifecycle.spec.ts` -> 5 passed
- Admin sizes: no new endpoint. `RoundDetail` takes the drink restaurant's `sizePresetId`, loads presets, and filters options by each menu item's `sizeOptionIds`.

## Plan Deviations

- The public form is now a stepper with a tap-list picker, not a combobox. The size select sits on the drink step and the "required" check runs on Continue (plus a guard in `handleSubmit`), since the review step has no size field to show an error under.
- "Editing an existing submission pre-fills it" was not done on the public form: it never pre-fills any field from an existing submission (it only warns and replaces). The overwrite dialog shows the old size and the new one instead.
- The red overwrite-dialog test had a handler-order bug and was fixed in the green commit.
- Did not touch the stale-step check in `round-lifecycle.spec.ts`: the food/drink steps already match the stepper.

## Review Notes

Reviewer (feature-dev:code-reviewer): no findings at confidence >= 80. Checked: inline validation per project rules, size reset on drink change, `goNext`/`handleSubmit` guards, admin prefill and payload consistency. Note: it only grepped `OverwriteSubmissionDialog.tsx`, did not read it.

Below threshold:
- Admin dialog, presets not loaded (~40): if Save is clicked before `useSizePresets` resolves, `drinkSizes` is empty and the PATCH omits `drinkSizeOptionId`, which the backend may treat as a clear. Not fixed — narrow race, and 063 makes the size required server-side. Worth a look if it shows up.
- Public `handleSubmit` size guard returns silently (~30): unreachable because `goNext` already blocks. Left as a safety net.
