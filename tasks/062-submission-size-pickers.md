---
id: 062
title: Size picker on the public order form and admin submission edit dialog
status: approved
depends_on: ["061"]
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
