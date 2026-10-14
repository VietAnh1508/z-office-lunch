---
id: 054
title: Public UI for rounds without a food restaurant
status: approved
depends_on: [052]
parallelizable_with: []
epic: optional-food-restaurant
tdd: required
test_command: "pnpm test -- apps/web/src/routes/public"
created: 2026-10-14
---

## Goal

Make the employee-facing pages (rounds list, round page, submission form) work for drink-only rounds, where the employee must pick a drink and no food fields are shown.

## Acceptance Criteria

- [ ] `BrowseRounds.tsx` shows the non-null restaurant names joined by " + " (no leading "+ " for drink-only rounds).
- [ ] `Round.tsx` doesn't throw when the round has no food restaurant (menu image/link for food is skipped).
- [ ] `SubmissionForm.tsx` on a drink-only round: no food combobox, note, or menu link; the drink combobox is required (inline error if empty); the request sends no food fields.
- [ ] Food+drink and food-only rounds behave exactly as before (food required, drink optional).
- [ ] The overwrite-confirm dialog and any other reader of `RoundSubmission` handle a null `foodName` (drink-only submissions).
- [ ] Component tests cover the drink-only list row, round page, and submission form; an e2e test creates a drink-only round, opens it, submits as an employee, and sees it in the admin submissions view.

## Plan

**Approach:** mirror how drink is already optional in these files (`drinkItems?`, `round.drinkItems &&` gating).

**Files**
- `apps/web/src/routes/public/usePublicRound.ts`: `foodItems?`, `foodRestaurant?` optional (22, 24); `foodRestaurantName: string | null` (33). Matches the API shape from task 052.
- `BrowseRounds.tsx:22-25`: join non-null names.
- `Round.tsx:58-60`: `round.foodRestaurant?.menuImage`. `Round/MenuPanel.tsx` is already null-safe.
- `Round/SubmissionForm.tsx`: gate the food combobox / `MenuLink` / `MenuImage` / note (~128-151) on `round.foodItems`; `foodValid` (~70-73) only when food is shown; drink required when food isn't; `buildInput` (~53-62) sends `undefined` for food when absent; drop the `!` assertions on `round.drinkRestaurant` where a guard is now possible.
- `useSubmission.ts:12-28` and `SubmissionInput`: `foodRoundMenuItemId?: number`.
- `Round/OverwriteSubmissionDialog.tsx`: not read during planning; check it handles a null `foodName`.

**Tests**
- Add a drink-only case next to the existing no-drink one in `BrowseRounds.test.tsx:95` and `Round.test.tsx:135`; a required-drink validation case near `Round.test.tsx:215`. Public round tests use `FOOD_RESTAURANT` constants (`Round.test.tsx:~19`) and per-test MSW handlers.
- `e2e/round-lifecycle.spec.ts`: new drink-only flow. Existing specs select `#round-drink-restaurant` and the food select by label, so the shape of the helpers is already there.

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
