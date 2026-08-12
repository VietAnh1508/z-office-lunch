---
id: 019
title: Edit a draft round (deadline, food restaurant, drink restaurant)
status: approved
depends_on: [018]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-12
---

## Goal

Let the admin fix a draft round's `deadline`, `foodRestaurantId`, or `drinkRestaurantId` (including clearing the drink restaurant entirely) without deleting and recreating the round. Restricted to `status: draft`, before the restaurant assignment becomes load-bearing for curation/submissions. Since `round_menu_items` is only derived by joining `menuItems.restaurantId` against the round's restaurant ids (no direct FK), changing a restaurant on either side must purge that side's now-stale curated items as part of the same edit — otherwise they'd silently stop showing up rather than being cleanly removed.

## Acceptance Criteria

- [ ] `PATCH /api/rounds/:id` with `{ deadline, foodRestaurantId, drinkRestaurantId? }` (full-replacement body, same shape/validation as `POST /`):
  - non-integer `:id` → 404 `roundNotFound`; missing round → 404 `roundNotFound`
  - `round.status !== "draft"` → 400 new `ERROR_MESSAGES.roundEditNotDraft`, checked right after the existence check, before any restaurant lookups
  - invalid/missing `deadline` → 400 `deadlineInvalid`; non-integer `foodRestaurantId` → 400 `foodRestaurantIdRequired`; non-integer `drinkRestaurantId` (when present) → 400 `drinkRestaurantIdInvalid`
  - `foodRestaurantId` referencing a missing restaurant → 404 `restaurantNotFound`; wrong `type` → 400 `foodRestaurantTypeInvalid`. Same for `drinkRestaurantId` against `drinkRestaurantTypeInvalid`
  - on success: updates the row (200, returns it) inside a `db.transaction`; for each side (food/drink) whose restaurant id actually changed, purges that side's stale `round_menu_items` via a single join-based `DELETE ... WHERE menu_item_id IN (SELECT ...)` statement (not a select-then-delete round trip) before/alongside the update, atomically
  - clearing `drinkRestaurantId` (omitted/null) sets it to `null` and purges its curated items the same way
- [ ] Admin UI: an "Edit round" form on the round detail screen, visible only when `status === "draft"`, pre-filled with the round's current deadline/food restaurant/drink restaurant
  - saving a deadline-only change submits immediately, no confirmation
  - changing the food and/or drink restaurant shows a confirmation dialog (curated items for the changed side will be removed) before submitting
  - cancelling the dialog sends no request and leaves the round unchanged

## Plan

### API (`apps/api/src/routes/rounds.ts`, `apps/api/src/lib/errors.ts`)

1. `apps/api/src/lib/errors.ts`: add `roundEditNotDraft: "round is not draft"` next to `roundDeleteNotDraft`.
2. `apps/api/src/routes/rounds.ts`: add `PATCH /:id`, placed before `DELETE /:id` (grouping the round-row-level mutations together). Validation order:
   - Non-integer `:id` → 404 `roundNotFound` (before touching the body, matching every other `:id` route).
   - `foodRestaurantId` not an integer → 400 `foodRestaurantIdRequired`; `deadline` missing/invalid → 400 `deadlineInvalid`; `drinkRestaurantId` present but not an integer → 400 `drinkRestaurantIdInvalid`.
   - Fetch the round → 404 `roundNotFound` if missing.
   - `round.status !== "draft"` → 400 `roundEditNotDraft` (checked right after existence, before any restaurant lookups — same position as `DELETE /:id`'s guard).
   - Fetch `foodRestaurantId` → 404 `restaurantNotFound`; wrong `type` → 400 `foodRestaurantTypeInvalid`. Same for `drinkRestaurantId` if provided, against `drinkRestaurantTypeInvalid`.
   - Diff `foodRestaurantId`/`drinkRestaurantId` against the current row to see which side(s) changed.
   - Inside `db.transaction(async (tx) => { ... })` (first use of `.transaction()` in this codebase — `packages/db`'s `createDb` already returns a `NodePgDatabase`, which supports it): for each changed side, purge stale `round_menu_items` in a single join-based SQL statement, e.g.:
     ```ts
     await tx.delete(roundMenuItems).where(
       and(
         eq(roundMenuItems.roundId, id),
         inArray(
           roundMenuItems.menuItemId,
           tx.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.restaurantId, oldRestaurantId)),
         ),
       ),
     );
     ```
     Run once for the old `foodRestaurantId` if that side changed, and once for the old `drinkRestaurantId` if that side changed (and was non-null). Then `update(rounds)...returning()`. Both the purge(s) and the update run against `tx`, not `db`, so they're atomic.
   - Note: plain FK `ON DELETE CASCADE` (as used for `round_menu_items.round_id` in task 018) can't express this — it only fires when the *referenced row itself* is deleted, not when a sibling table's column (`rounds.food_restaurant_id`) is reassigned, and `round_menu_items` isn't even directly FK'd to `restaurants` (only two hops away via `menu_items.restaurant_id`). A DB trigger was considered and rejected in favor of this single-statement app-level `DELETE` — no precedent for stored procedures/triggers in this codebase.
   - Return `c.json(row)` — 200, just the updated round row (no purge count in the response; the frontend already knows what changed from its own form state).
   - Wrapped in the standard try/catch/finally (`getDb(c)`, `db.$client.end()` in `finally`, structured `console.error` on catch, 500 `ERROR_MESSAGES.internal`) per `.claude/rules/api-error-handling.md`.

### Frontend

3. `apps/web/src/routes/admin/useRounds.ts`: add `useUpdateRound(roundId)`, mirroring `useUpdateRoundStatus`'s shape — `mutationFn` calls `api.patch(\`/rounds/${roundId}\`, input)`, `onSuccess` invalidates `roundKeys.all` + `toast.success("Round updated")`, `onError` → `toastApiError(error, "Could not update round.")`, per `.claude/rules/mutation-feedback.md`.
4. `apps/web/src/hooks/useRequiredField.ts`: add an optional `initialValue = ""` param (backward compatible — existing create-form callers pass none and still default/reset to `""`). This is the first *edit* form in the codebase, so the hook needs a way to seed and reset to a non-blank value.
5. `apps/web/src/routes/admin/RoundDetail.tsx`: add an `EditRoundForm` component (non-exported, same file — not reused elsewhere), mounted as `<EditRoundForm key={round.id} round={round} restaurants={restaurants} />` inside a new "Edit round" `Card`, shown only when `round.status === "draft"`, placed after the existing Status card. It must be its own component (not inline state in `RoundDetail`) because `RoundDetail`'s early loading/not-found returns happen before any new `useState` could be added without breaking the rules of hooks.
   - `deadline`: `useRequiredField("Deadline is required.", toDatetimeLocalValue(round.deadline))` — a small local helper converts the round's UTC ISO `deadline` to the local-time string a `datetime-local` input needs (naive UTC slicing would show the wrong local time).
   - `foodRestaurantId`/`drinkRestaurantId`: plain `useState` selects seeded from `round.foodRestaurantId`/`round.drinkRestaurantId`, same pattern as `Rounds.tsx`'s create form (drink has a `"None"` option at `value=""`).
   - On submit: validate deadline + food-restaurant-required inline (no request if invalid). If the submitted food/drink restaurant differs from `round`'s current values, open a controlled `AlertDialog` (no `Trigger`, `open`/`onOpenChange` state) warning that curated items for the changed side will be removed; confirming calls the mutation. If neither restaurant changed, call the mutation directly, no dialog.

### Tests

6. API (`apps/api/src/routes/rounds.test.ts`, new `describe("round update")`):
   - deadline-only change on a draft round succeeds; existing curated food item untouched.
   - changing `foodRestaurantId` purges only that side's stale `round_menu_items`; row updated.
   - changing `drinkRestaurantId` purges only that side's stale items; food items untouched.
   - clearing `drinkRestaurantId` (omitted) sets it to `null` and purges its curated items.
   - `open` round → 400 `roundEditNotDraft`, row unchanged; same for `closed`.
   - nonexistent id → 404; non-integer id → 404.
   - invalid `deadline` → 400 `deadlineInvalid`.
   - non-integer `foodRestaurantId` → 400 `foodRestaurantIdRequired`; missing restaurant → 404 `restaurantNotFound`; wrong type → 400 `foodRestaurantTypeInvalid`.
   - non-integer `drinkRestaurantId` → 400 `drinkRestaurantIdInvalid`; wrong type → 400 `drinkRestaurantTypeInvalid`.
7. Frontend (`apps/web/src/routes/admin/RoundDetail.test.tsx`):
   - edit form renders pre-filled with the round's current values, only for a `draft` round (absent for `open`/`closed`).
   - saving a deadline-only change fires the PATCH immediately, no dialog, success toast.
   - changing the food restaurant shows a confirm dialog; confirming fires the PATCH and toasts.
   - changing the drink restaurant (including clearing to "None") shows the confirm dialog.
   - cancelling the dialog issues no request and leaves values unchanged.
   - a failed save shows the error toast.
   - clearing the required food-restaurant select shows the inline validation error, sends no request.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
