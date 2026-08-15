---
id: 025
title: Auto-curate active menu items on round create/restaurant-change
status: in_review
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-15
---

## Goal

Creating a draft round leaves its food/drink menu-item checkboxes all unchecked in
`RoundDetail`, even when the chosen restaurant already has active menu items — nothing hints
this manual step is required, and the round can't even be opened until at least one food item is
checked. Flip curation from opt-in to opt-out: when a draft round is created, or when its food or
drink restaurant is changed while still draft, auto-curate all of that restaurant's currently
active menu items into `round_menu_items` by default. The admin can still opt individual items out
(or back in) via the existing per-item checkbox in `RoundDetail` — that UI and its underlying
add/remove endpoints are unchanged.

Scope, confirmed during planning:

- Auto-curation fires at exactly two trigger points: round creation, and a restaurant change on a
  draft round's edit (`PATCH /:id`). It does **not** fire when a new menu item is later added to a
  restaurant a draft round already references — that stays manual, same as today.
- "Active items" means `menu_items.active = true` for the given restaurant — the same universe
  `RoundDetail` already restricts its checkbox list to.

## Acceptance Criteria

- [x] A new module-level `insertActiveMenuItems(tx, roundId, restaurantId)` helper in
      `apps/api/src/routes/rounds.ts`: selects the restaurant's active menu item ids, then (if any
      exist) inserts one `round_menu_items` row per id with `.onConflictDoNothing()` against the
      existing `unique(roundId, menuItemId)` constraint. A restaurant with zero active items is a
      no-op (not an error) — `db.insert(...).values([])` throws in Drizzle, so the empty-array case
      is guarded explicitly before calling `.insert()`.
- [x] `POST /` (round create) wraps its round insert in a `db.transaction()` and, after inserting
      the round row, calls `insertActiveMenuItems` for `foodRestaurantId` and (if provided) for
      `drinkRestaurantId`. A round created for a restaurant with no active menu items still
      succeeds, with zero curated rows (existing `roundOpenNoFoodItems` check at *open* time,
      unchanged, remains the safety net for that case).
- [x] `PATCH /:id` (round edit) calls `insertActiveMenuItems` inside its existing transaction,
      right after each side's existing `purgeStaleItems` call:
      - Food: gated on `foodChanged` (food restaurant is `NOT NULL`, so this alone gates both
        purge and insert).
      - Drink: purge and insert are gated **independently** — purge on
        `drinkChanged && round.drinkRestaurantId !== null` (nothing to purge if there wasn't a
        previous drink restaurant), insert on `drinkChanged && drinkRestaurantId !== null`
        (nothing to insert if the drink restaurant is being cleared to `null`). Kept as two
        separate `if` blocks, not merged — collapsing them would silently break the `null→value`
        or `value→null` transitions.
      - A deadline-only PATCH (no restaurant change on either side) triggers neither purge nor
        insert on either side.
- [x] Documented (in this file's Plan/Implementation Log, and as a code comment at the call site if
      it's non-obvious from reading the diff alone): two sequential restaurant-change PATCHes on
      the same side (A→B, then B→A) re-triggers full auto-curation on the second PATCH, including
      re-inserting an item the admin had previously unchecked from A. This is intended per this
      task's scope (restaurant change re-triggers auto-curation), not a regression.
- [x] No new `apps/api/src/lib/errors.ts` entries — this task introduces no new client-facing
      failure mode. `PATCH /:id/status`'s `roundOpenNoFoodItems` check stays exactly as-is, as the
      existing safety net for a restaurant with zero active items.
- [x] `apps/web` is unchanged — `RoundDetail.tsx`'s checkbox `checked` state already derives purely
      from "row exists in `round_menu_items`," so it reflects auto-curation correctly with no
      frontend changes. `Rounds.tsx`'s create form never touches menu items today and still
      doesn't.
- [x] `e2e/round-lifecycle.spec.ts`: update all three specs, which currently do
      `await page.getByLabel("Pho Bo").click()` (and, in the third spec, `"Tra Da"`) immediately
      after entering a round to manually curate it, then assert `"Menu item added to round"` +
      `.toBeChecked()`. Replace with an assertion that the checkbox is already checked on load
      (`await expect(page.getByLabel("Pho Bo")).toBeChecked()`). In the first spec, add an explicit
      uncheck-then-recheck sequence against the now-already-checked box, to preserve e2e coverage
      of the manual opt-out/opt-in path the removed click used to exercise incidentally.

## Plan

1. Add `insertActiveMenuItems(tx, roundId, restaurantId)` as a module-level async function in
   `apps/api/src/routes/rounds.ts` (near the top, alongside the existing alias declarations), per
   the Acceptance Criteria shape above.
2. Wrap `POST /`'s round insert in `db.transaction()`, calling the helper for
   `foodRestaurantId` and (if non-null) `drinkRestaurantId`. All existing validation stays outside
   the transaction, unchanged.
3. In `PATCH /:id`'s existing transaction (task 019's `purgeStaleItems` closure), add the two
   `insertActiveMenuItems` calls with the independent gating described above.
4. Write failing tests first (red commit) in `apps/api/src/routes/rounds.test.ts`:
   - New cases in the top-level `POST /` block: creating a round auto-curates all active food
     items; inactive items are skipped; a `drinkRestaurantId` also gets its active items curated;
     a restaurant with zero active items still creates the round successfully with zero curated
     rows.
   - New cases extending `describe("round update")` (task 019's block): changing
     `foodRestaurantId` purges the old side and inserts the new side's active items; same for
     `drinkRestaurantId`; clearing `drinkRestaurantId` (value→null) purges and inserts nothing;
     setting it for the first time (null→value) inserts and purges nothing; a deadline-only PATCH
     touches neither side.
   - Use the existing `db/testing` seed helpers (`seedRestaurant`, `seedMenuItem`, `seedRound`,
     `seedRoundMenuItem`) and real-Postgres pattern already established in this test file.
5. Implement the changes from steps 1-3 (green commit). Run
   `pnpm -r typecheck && pnpm --filter web build && pnpm test` — all green.
6. Update `e2e/round-lifecycle.spec.ts` per the Acceptance Criteria above. Run
   `pnpm test:e2e round-lifecycle.spec.ts` directly (not part of `test_command`, but this task's
   e2e assertions live there, same convention as task 024) — all green.
7. Bookkeeping commit (status/review-notes) per the usual task convention.

**Explicitly unchanged / out of scope** (call this out in review so it isn't mistaken for a
missed spot): `apps/web/src/routes/admin/RoundDetail.tsx`, `apps/web/src/routes/admin/Rounds.tsx`,
`POST /:id/menu-items` and `DELETE /:id/menu-items/:itemId` (manual per-item curation, untouched),
`PATCH /:id/status`'s `roundOpenNoFoodItems` check, `apps/api/src/lib/errors.ts`.

## Implementation Log

- Red: `95208f6` — `test: add auto-curation coverage for round create/restaurant-change`
  (amended once after the fact — see Plan Deviations). At red time,
  `pnpm test -- apps/api/src/routes/rounds.test.ts` → 7 failing: 6 were the
  intended assertion failures, the 7th (the A→B→A re-trigger test) was a
  `TypeError` from a test-setup bug, not the missing feature — see Plan
  Deviations for how/when that was caught.
- Green: `6b13fc2` — `feat: auto-curate active menu items on round create/restaurant-change`.
  `pnpm -r typecheck && pnpm --filter web build && pnpm test` → all passing
  (238/238 in `apps/api`/`apps/web`). Also bundles the `e2e/round-lifecycle.spec.ts`
  update from Plan step 6 into this commit (not part of `test_command`, run
  separately): `pnpm test:e2e round-lifecycle.spec.ts` → 3/3 passing, and the
  full `pnpm test:e2e` → 11/11 passing.
- Per-AC documentation of the A→B→A re-trigger caveat: two sequential
  restaurant-change PATCHes on the same side (e.g. A→B, then B→A) re-run
  `insertActiveMenuItems` in full on the second PATCH, re-inserting any item
  the admin had previously opted out of curating on side A. This is intended
  per this task's scope (a restaurant change re-triggers auto-curation from
  scratch), not a regression. Covered by the
  `"PATCH A→B then B→A re-triggers full auto-curation..."` test and now also
  called out as a code comment directly above the `insertActiveMenuItems`
  call in `PATCH /:id` (`apps/api/src/routes/rounds.ts`) — added after the
  code-reviewer flagged that the AC's documentation requirement wasn't
  actually satisfied by the initial green commit (see Review Notes).

## Plan Deviations

- One authored test (`PATCH A→B then B→A re-triggers full auto-curation...`)
  originally seeded its round via `seedRound` (a direct DB insert) and then
  tried to read back the round-menu-item row that auto-curation on *create*
  would have produced — but `seedRound` bypasses the route handler entirely,
  so that row never existed and the test threw a `TypeError` on `undefined.id`
  regardless of whether the feature was implemented. This should have been
  caught and fixed *before* the red commit per step 4 (confirm the failure is
  the expected assertion failure, not a setup bug) — it wasn't; it wasn't
  noticed until after the green implementation landed and this was still the
  one test failing. Fixed by seeding the "already auto-curated, admin opted
  one item out" state directly with `seedRoundMenuItem` instead of relying on
  the create endpoint's behavior as setup for a test of the *update* endpoint,
  then folded back into the red commit via amend so the landed history still
  shows a clean red→green split.
- Everything else — the `insertActiveMenuItems` helper shape, the
  transaction wrapping on `POST /`, the independent food/drink gating on
  `PATCH /:id`, and the e2e spec updates — went in as the Plan described.

## Review Notes

(Output of the `feature-dev:code-reviewer` agent, reviewing `git diff 95208f6 6b13fc2`, i.e. red commit -> green commit, verbatim.)

### Review: task 025 diff (`apps/api/src/routes/rounds.ts`, `e2e/round-lifecycle.spec.ts`)

Reviewed against `apps/api/src/routes/rounds.ts` (current full file), `apps/api/src/routes/rounds.test.ts`, `apps/api/src/lib/get-db.ts`, `.claude/rules/api-error-handling.md`, and `tasks/025-auto-curate-round-menu-items.md`.

#### Code correctness — clean

- **`POST /` transaction**: `db.transaction(async (tx) => {...; return [inserted];})` destructured as `const [row] = await db.transaction(...)` correctly passes through the callback's return value. The round insert and both `insertActiveMenuItems` calls are genuinely atomic — a throw from either rolls the round insert back too, and propagates to the existing `catch` → structured `console.error` + 500, matching `.claude/rules/api-error-handling.md`. No error-handling gap.
- **`insertActiveMenuItems` SQL**: filters correctly on `restaurantId` + `active = true`, guards the empty-array case before `.insert()` (correctly avoiding Drizzle's throw-on-empty-values behavior), and `.onConflictDoNothing()` against `unique(roundId, menuItemId)` is safe insurance (on create the round is new; on PATCH insert always follows purge for the same side, so no pre-existing conflict is actually possible in practice — but harmless either way).
- **`PATCH /:id` drink-side independent gating**: verified all four transitions (null→value, value→null, value→value, deadline-only) both by reasoning through the code and by the corresponding tests at `apps/api/src/routes/rounds.test.ts:1274-1368`, which pass and cover exactly these cases. Correct.
- **`Tx` type alias**: unusual-looking but valid derivation; not worth flagging.
- One informational note (not a bug, not new to this diff): the drink-side gating's correctness depends on the PATCH client always resubmitting the *current* `drinkRestaurantId` value even on a deadline-only edit (otherwise a missing field would be parsed as `null` and misread as a change). This was already true before task 025 (it gated `purgeStaleItems`); this diff just makes it load-bearing for insertion too. Confirmed from test bodies (e.g. `rounds.test.ts:850-861`) that the convention holds. Not a new regression — no action needed, just worth knowing if `RoundDetail.tsx`'s PATCH payload construction ever changes.
- **e2e spec changes**: correctly reflect the new auto-curation behavior (already-checked-on-load assertions, plus the added opt-out/opt-in round-trip in the first spec) and match the actual toast copy in `apps/web/src/routes/admin/useRoundMenuItems.ts` ("Menu item added to round" / "Menu item removed from round"). Test coverage on the API side is thorough — all four planned `POST /` cases exist (all-active-curated, inactive-skipped, drink-side, zero-active) plus all PATCH transition cases.

#### Findings

**1. Task-spec documentation requirement not satisfied (confidence: 82)**

`tasks/025-auto-curate-round-menu-items.md` AC explicitly requires: two sequential restaurant-change PATCHes on the same side (A→B, then B→A) re-triggers full auto-curation on the second PATCH, including re-inserting an item the admin had previously unchecked from A, documented in the Plan/Implementation Log and as a code comment at the call site if non-obvious.

This was never actually written down at review time. The `Implementation Log` only covered the red/green commits and a test-setup bug; it didn't restate the re-trigger caveat as an implementation note. The code comment at the `PATCH /:id` call site explained the independent null-gating rationale but said nothing about the A→B→A re-insertion behavior. The only place this caveat existed was a test name. A future reader hitting this behavior in production would have had no in-code or in-task-file explanation for why it's intentional rather than a regression.

**Status: fixed.** Added a code comment directly above the `insertActiveMenuItems(tx, id, foodRestaurantId)` call in `PATCH /:id` (`apps/api/src/routes/rounds.ts`) explaining the re-trigger/resurrection behavior, and added the equivalent explanation to this file's Implementation Log.

#### Not reported (below confidence threshold / non-issues)

- All Acceptance Criteria checkboxes were unticked at review time despite `status: in_review` — flagged as likely pending the bookkeeping commit rather than a real gap. Ticked as part of applying this review's fix, before the bookkeeping commit.
- The diff batches all `insertActiveMenuItems` calls after both `purgeStaleItems` calls rather than "right after each side's purge" as the AC literally words it — functionally identical since the food/drink item sets are disjoint, not a bug.

#### Summary

The application code (`apps/api/src/routes/rounds.ts`) is correct: transaction atomicity, gating logic across all four drink-side transitions, SQL filtering/empty-guard, and error handling all check out, and test coverage is thorough on both the API and e2e sides. The one real gap was procedural — the task's own acceptance criterion for documenting the A→B→A re-trigger caveat wasn't fulfilled at the time of review — and has been addressed above.
