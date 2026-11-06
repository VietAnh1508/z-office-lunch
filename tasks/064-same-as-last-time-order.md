---
id: 064
title: "Same as last time" one-tap reorder on the public round page
status: proposed
depends_on: [062]
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

After an employee picks their name on the public round page, offer "Order the same as last time?" so a repeat order is one tap instead of walking every step again.

## Acceptance Criteria

- [ ] The API can return an employee's most recent submission from a **previous** round (food item, food note, drink item, drink note, and drink size once 062 lands), without exposing other employees' data. Decide the endpoint shape in the red phase (e.g. an `employeeId` lookup on the public routes).
- [ ] Items are matched to the current round by the underlying menu item, not the round-menu-item id (ids differ per round). If an item is not on this round's menu, it is left out rather than failing.
- [ ] After picking a name on step 1, if a usable previous order exists, show a card ("Same as last time: Pho Bo + Tra Da") with a one-tap action that pre-fills the selections and jumps to the Review step. Ignoring the card continues the normal step flow.
- [ ] If only part of the previous order still exists (e.g. food is gone, drink remains), pre-fill what matches and land on the first step that still needs a choice.
- [ ] No card when there is no previous order or nothing on it matches this round.
- [ ] Existing "Welcome back / replaces your order" banner and overwrite dialog keep working for same-round resubmission.
- [ ] Tests: API lookup (latest previous round only, other employees excluded, nothing found), item matching across rounds, component tests for the card shown / hidden / partial match, and the e2e flow.

## Plan

- Frontend lives in `apps/web/src/routes/public/Round/SubmissionForm.tsx` (stepper from the "premium UI" change): step 1 `onSelect` → fetch previous order → render the card; the card's action sets food/drink state and `setStepIndex` to the review step.
- Depends on 062 because that task adds size pickers to the same form; the previous order should carry the drink size too. 062 was written against the old combobox form, so it needs a pass against the stepper (`PickerList`) before it's implemented.
- Open question for the user: how far back to look (last round only vs. most recent round the employee ordered in)? Default to the most recent round they ordered in.

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
