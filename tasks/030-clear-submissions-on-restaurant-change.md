---
id: 030
title: Null affected submissions when a draft round's restaurant change purges stale curated items
status: in_review
depends_on: [029]
parallelizable_with: [031]
epic: open-round-editing
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-21
---

## Goal

`PATCH /api/rounds/:id` already purges a round's stale `round_menu_items` when the admin changes its food or drink restaurant (task 019), but that purge was written when a `draft` round could never have submissions. Once task 032 lets an admin revert an already-`open` round back to `draft` to fix it, that assumption no longer holds — the round may already have live submissions referencing the very `round_menu_items` rows about to be purged. Task 029's `onDelete: "set null"` will null the FK column itself, but not the paired free-text note column, so this task adds the explicit clear for both, scoped to whichever side actually changed.

## Acceptance Criteria

- [ ] `PATCH /api/rounds/:id`, when `foodRestaurantId` changes: any submission whose `foodRoundMenuItemId` pointed at a now-purged item has both `foodRoundMenuItemId` and `foodNote` set to `null`; `drinkRoundMenuItemId`/`drinkNote` and all other submission fields are untouched
- [ ] Same for `drinkRoundMenuItemId` changing (including clearing it to `null`): affected submissions' `drinkRoundMenuItemId`/`drinkNote` cleared, food side untouched
- [ ] A `PATCH` that changes only `deadline` (no restaurant change) leaves every existing submission completely untouched
- [ ] The clear runs inside the same `db.transaction` as the existing purge, before the purge's `DELETE`, keyed on the round-menu-item ids about to be removed (not on the FK's post-delete null state)
- [ ] No change to the route's guard — it remains `draft`-only, and a `PATCH` on a non-draft round still 400s `roundEditNotDraft` exactly as before
- [ ] `pnpm -r typecheck && pnpm --filter web build && pnpm test` passes

## Plan

### API (`apps/api/src/routes/rounds.ts`)

1. Inside `PATCH /:id`'s transaction, alongside the existing `purgeStaleItems` closure (~line 431), add a sibling closure:
   ```ts
   const clearAffectedSubmissions = (side: "food" | "drink", restaurantId: number) => {
     const column = side === "food" ? submissions.foodRoundMenuItemId : submissions.drinkRoundMenuItemId;
     const noteColumn = side === "food" ? submissions.foodNote : submissions.drinkNote;
     return tx
       .update(submissions)
       .set({ [side === "food" ? "foodRoundMenuItemId" : "drinkRoundMenuItemId"]: null, [side === "food" ? "foodNote" : "drinkNote"]: null })
       .where(
         inArray(
           column,
           tx
             .select({ id: roundMenuItems.id })
             .from(roundMenuItems)
             .innerJoin(menuItems, eq(roundMenuItems.menuItemId, menuItems.id))
             .where(and(eq(roundMenuItems.roundId, id), eq(menuItems.restaurantId, restaurantId))),
         ),
       );
   };
   ```
   (Adjust the `.set()` shape to whatever reads cleanest with Drizzle's typed column keys — the key point is a single `UPDATE` per side, not a select-then-update round trip.)
2. Call `await clearAffectedSubmissions("food", round.foodRestaurantId)` immediately before `await purgeStaleItems(round.foodRestaurantId)` when `foodChanged`.
3. Call `await clearAffectedSubmissions("drink", round.drinkRestaurantId)` immediately before the drink-side `purgeStaleItems` call when `drinkChanged && round.drinkRestaurantId !== null`.
4. No other lines in the route change — the `round.status !== "draft"` guard stays exactly as-is.

### Tests (`apps/api/src/routes/rounds.test.ts`)

5. New tests in the existing `describe("round update", ...)` block:
   - Seed a draft round with a curated food item and a submission (via `seedSubmission`) referencing it. `PATCH` with a new `foodRestaurantId`. Assert `200`, then read the submission back and assert `foodRoundMenuItemId`/`foodNote` are `null`, `drinkRoundMenuItemId`/`drinkNote` unchanged.
   - Same shape for the drink side, including the "clear `drinkRestaurantId`" case.
   - A deadline-only `PATCH` on a draft round with an existing submission: submission completely unchanged after the request.
   - Existing purge tests (`"PATCH changing foodRestaurantId purges only that side's stale curated items"` etc.) continue to pass unmodified — this task only adds behavior, it doesn't change the purge itself.

## Implementation Log

- Red: `52c907b` — `test: cover clearing submissions when a draft round's restaurant change purges stale items`. `pnpm test -- apps/api/src/routes/rounds.test.ts -t "nulls|untouched"` -> 3 failing (the two `...Note` fields stayed at their pre-PATCH values; `...RoundMenuItemId` was already nulled by task 029's FK cascade, as expected).
- Green: `63358a1` — `fix: null submissions' round-menu-item FK and note when a draft round's restaurant change purges their curated item`. `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (293/293).

## Plan Deviations

- The Plan's sketch selected stale ids by joining `roundMenuItems` to `menuItems` inline inside `clearAffectedSubmissions`'s `.where()`. Implemented instead as a separate `staleItemIds(restaurantId)` closure returning that same subquery, reused by `clearAffectedSubmissions`, so the join lives in one place rather than being written out per call — same query shape and behavior, just factored differently from the literal snippet in the Plan.
- Otherwise implemented as planned: `clearAffectedSubmissions` is called immediately before each side's `purgeStaleItems`, gated on the same `foodChanged`/`drinkChanged && round.drinkRestaurantId !== null` conditions already guarding the purge calls.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the red→green diff plus the new tests in `apps/api/src/routes/rounds.test.ts`.

**Correctness — confirmed sound, no bugs found:**
- `inArray(column, subquery)` correctly excludes submissions whose FK is already `NULL` (SQL NULL semantics: `NULL IN (...)` evaluates to `NULL`, not `TRUE`), so no false-positive nulling.
- Ordering requirement satisfied: `clearAffectedSubmissions` is `await`ed and completes before `purgeStaleItems` runs, and `staleItemIds` queries `round_menu_items` fresh as a subquery baked into the `UPDATE` — keyed on pre-delete ids, not the FK's post-delete `set null` state.
- `round.foodRestaurantId`/`round.drinkRestaurantId` (pre-update values) are correctly used as the "old restaurant" key for both clearing and purging.
- Food/drink clear+purge pairs can't cross-contaminate — each `staleItemIds` call filters on a specific `restaurantId`.
- Draft-only guard untouched; subquery-in-`inArray` pattern mirrors the pre-existing `purgeStaleItems` style in this file.

**Important (confidence ~85) — test coverage gap, no code change needed:** the `*RoundMenuItemId` assertions in the three restaurant-change tests are tautological given the schema's `onDelete: "set null"` on `submissions.foodRoundMenuItemId`/`drinkRoundMenuItemId` — those would pass even if `clearAffectedSubmissions` were deleted and only the DB-level cascade ran. The `foodNote`/`drinkNote` assertions in those same tests are the ones actually exercising the new code (notes have no DB-level cascade). Noted for awareness; not treated as a required fix since testing the pre-purge clear in isolation isn't practical through the route's black-box behavior.

**Lower-confidence, below reporting bar (not actioned):**
- `staleItemIds` (join-based) and `purgeStaleItems`'s `inArray(menuItemId, subselect)` express "which round_menu_items are stale" two different ways; they agree today but could diverge if edited separately later. Optional follow-up: rewrite `purgeStaleItems` to consume `staleItemIds` directly.
- Each new test seeds exactly one submission per round, so "drink side untouched" / "every submission untouched" assertions are only incidentally scoped-correct rather than proven against a second, differently-shaped submission in the same round.

Bottom line: implementation correct as written; no changes made in response to this review.
