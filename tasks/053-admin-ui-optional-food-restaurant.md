---
id: 053
title: Admin UI for rounds without a food restaurant
status: approved
depends_on: [052]
parallelizable_with: []
epic: optional-food-restaurant
tdd: required
test_command: "pnpm test -- apps/web/src/routes/admin"
created: 2026-10-14
---

## Goal

Let admins create and edit rounds with only a food or only a drink restaurant (at least one required), and make every admin screen that shows a round cope with a missing food restaurant.

## Acceptance Criteria

- [ ] `Rounds.tsx` create form and the `RoundDetail.tsx` edit form: food select has no required `*`, placeholder reads "None"; submitting with both selects empty sends no request and shows an inline error under **both** selects, cleared when either select changes.
- [ ] Food only, drink only, and both are all accepted; an empty food select sends no `foodRestaurantId` (not `0`).
- [ ] Editing a round whose food is null shows an empty food select (not `"null"`), and the "restaurants changed" confirm logic treats null/empty correctly (no false change, and food -> none / none -> food both count as changes).
- [ ] `RoundList.tsx` shows the non-null restaurant names joined by " + " (a drink-only round never renders a leading "+").
- [ ] `RoundDetail.tsx` hides the "Food items" card when there's no food restaurant and the drink card takes full width; the reverse case is unchanged.
- [ ] `SubmissionEditDialog` hides the food fields when the round has no food, requires a drink there, and sends `foodRoundMenuItemId` only when food exists.
- [ ] Admin submissions table and CSV export omit the Food columns for a drink-only round (and Drink columns when there's no drink restaurant).
- [ ] Existing "Food restaurant is required." tests are rewritten; new tests cover food-only, drink-only, and both-empty on create and edit.

## Plan

**Approach:** mirror the drink-optional pattern already in these files (`x ? Number(x) : undefined`, `!= null &&` guards, `drinkRestaurantId != null ? String(...) : ""` state init). Keep the label text "Food restaurant" so the many `getByLabelText("Food restaurant", { exact: false })` tests and e2e selectors keep working.

**Files**
- `apps/web/src/routes/admin/useRounds.ts`: `Round.foodRestaurantId: number | null` (line 9); `CreateRoundInput` / `UpdateRoundInput` `foodRestaurantId?: number` (18, 25).
- `Rounds.tsx` (17-50, 69-93): drop the required check and `foodRestaurantError`; shared at-least-one error state shown under both selects; reset on success as today. `.claude/rules/form-validation.md` still applies: `noValidate`, inline `text-destructive` paragraphs, no toast for validation.
- `RoundDetail.tsx`:
  - Edit form (~217-290): state init for null, `buildInput`, `restaurantsChanged` (`Number("") !== null` is a bug today), required check -> at-least-one error.
  - `SubmissionEditDialog` (~55-197): gate food select on `round.foodRestaurantId != null`; food-required check conditional; drink required on drink-only.
  - Cards (~587-602): wrap "Food items" in `round.foodRestaurantId != null`; give the drink card `sm:col-span-2` when food is null.
  - CSV (~454): pass column set based on which sides exist. Check `apps/web/src/lib/csv.ts` for null handling.
  - `restaurantName(id: number)` (~399): callers must not pass null.
  - `useMenuItems(round?.foodRestaurantId ?? 0, …)` (~377, 387): queries restaurant 0 when null. Check `useMenuItems.ts` for an `enabled` flag; add one if missing (the same issue already exists for drink).
- `RoundList.tsx:100-104`: join non-null names.
- `SubmissionsTable.tsx:5,57-60`: `SUBMISSION_COLUMNS` becomes per-round (accepts which sides exist).
- `apps/web/src/routes/shared/useRoundSubmissions.ts:17-23`: `UpdateRoundSubmissionInput.foodRoundMenuItemId?: number`.

**Tests**
- Rewrite `Rounds.test.tsx:94-116` and `RoundDetail.test.tsx:623-646`.
- Add food-only / drink-only / both-empty cases for create and edit; a drink-only detail page (no Food card, no Food column, CSV header); a null-food list row; the edit-submission dialog on a drink-only round.
- Component tests use `renderWithProviders` and per-test `server.use(http.…)` MSW handlers (`handlers.ts` is empty); `draftRound(...)` fixture builder in `RoundDetail.test.tsx`.

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
