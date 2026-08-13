---
id: 019
title: Edit a draft round (deadline, food restaurant, drink restaurant)
status: in_review
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

- red commit: 1090a7f — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 18 failing (11 API, 7 frontend)
- green commit: 73bcb43 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (165/165)

## Plan Deviations

- Plan step 4 said to add an optional `initialValue` param to `useRequiredField`. That param already exists — task 020 (edit an employee's full name), merged after this task was planned, added it first for its own edit form. No change needed here; `EditRoundForm`'s deadline field just consumes the existing param.
- The initial red-commit frontend tests used `screen.findByRole("heading", { name: "Edit round" })` and `screen.getByLabelText("Food restaurant")` (exact match), copying the pattern from the plain `<h1>` round title. `CardTitle` renders a `<div>` (no heading role), and the required-field label text includes the `*` marker, so both queries were wrong against this codebase's actual conventions — not a business-logic gap. Fixed to `findByText("Edit round")` and `getByLabelText(..., { exact: false })` (matching `Rounds.test.tsx`'s established pattern) before green; the underlying feature behavior these tests assert didn't change.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

### Review scope

Reviewed the task 019 diff (red commit `1090a7f` → green `73bcb43`) adding `PATCH /api/rounds/:id` and the admin "Edit round" form. Note: the diff text handed to the agent only covered `apps/api/src/lib/errors.ts`, `apps/api/src/routes/rounds.ts`, `apps/web/src/routes/admin/RoundDetail.tsx(.test.tsx)`, and `apps/web/src/routes/admin/useRounds.ts` — it did not include a diff hunk for `apps/api/src/routes/rounds.test.ts`. The agent checked the actual file on disk directly and confirmed a full `describe("round update", ...)` block already exists there (deadline-only update, purge-only-changed-side for food and drink independently, clearing drink, non-draft 400 with row left unchanged, 404s, and all the restaurant-type/id validation branches), so the backend logic is in fact well covered.

Files inspected directly: `apps/api/src/routes/rounds.ts`, `apps/api/src/routes/rounds.test.ts`, `apps/api/src/lib/errors.ts`, `apps/web/src/routes/admin/RoundDetail.tsx`, `apps/web/src/routes/admin/RoundDetail.test.tsx`, `apps/web/src/routes/admin/useRounds.ts`, `apps/web/src/routes/admin/useRoundMenuItems.ts`, `apps/web/src/components/ui/card.tsx`, `packages/db/src/index.ts`.

### Findings

No issues at confidence ≥ 80. Specifically checked and ruled out as either correct or pre-existing/non-issues:

- **Purge logic correctness**: `purgeStaleItems` correctly scopes the DELETE by `roundId` and the *old* restaurant's menu-item ids, only runs per side when that side actually changed, and correctly handles drink going from a value → `null` (purges) and `null` → a value (nothing to purge). Confirmed by the existing backend tests (`PATCH changing foodRestaurantId purges only that side's stale curated items`, etc. in `rounds.test.ts:635-770`).
- **Transaction atomicity**: `db.transaction` is on `drizzle-orm/node-postgres` (`packages/db/src/index.ts:1`), which supports real interactive transactions (unlike `neon-http`), so this isn't the common Drizzle/Neon transaction footgun.
- **Status-guard ordering**: the draft-only check happens before the transaction is opened, and there's a test asserting the row is left unchanged on a non-draft round.
- **Frontend query invalidation**: `useUpdateRound`'s `invalidateQueries({ queryKey: roundKeys.all })` (`useRounds.ts:81`) also invalidates `roundMenuItemKeys` because TanStack Query does prefix matching by default (`["rounds"]` is a prefix of `["rounds", roundId, "menu-items", "list"]`), so the curated-items checkboxes correctly refresh after a restaurant-changing edit — this matches the existing `useDeleteRound`/`useUpdateRoundStatus` pattern.
- **Mutation feedback / form validation rules**: `useUpdateRound` follows `.claude/rules/mutation-feedback.md` exactly (static `toast.success`, `toastApiError` fallback, no interpolation). The deadline field follows `.claude/rules/form-validation.md` via `useRequiredField`; the food-restaurant `<select>` (which can't use that hook) reimplements the same inline-error pattern consistently.
- `CardTitle` renders a `<div>`, not a semantic heading, everywhere in this codebase (`components/ui/card.tsx`) — the test's switch from `getByRole("heading", ...)` to `getByText(...)` just corrects a wrong assumption in the test, matching how every other `CardTitle` in this file is already tested. Not a regression.
- `SubmitEvent<HTMLFormElement>` is an established convention already used in `Employees.tsx`, `Rounds.tsx`, `Restaurants.tsx`, `RestaurantDetail.tsx` — not something new/wrong introduced here.
- The `Number(body.foodRestaurantId)` treating `""` as `0` (passing `Number.isInteger` and yielding a confusing 404 instead of a "required" 400) is copied verbatim from the existing `POST /` route — a pre-existing pattern, not something newly introduced by this diff, and the frontend already blocks submitting an empty food restaurant client-side.

One sub-threshold (confidence ~65-70, not reported as a blocking issue) observation: `ERROR_MESSAGES.roundEditNotDraft` (`apps/api/src/lib/errors.ts:26`) duplicates the exact same string as `roundDeleteNotDraft` (`:25`) under a new key, rather than reusing the existing entry. This was per the task's own Acceptance Criteria (a distinct `roundEditNotDraft` key), so left as-is; harmless functionally, just a minor DRY nit noted for awareness.

### Conclusion

This diff meets the project's standards. The purge-on-restaurant-change logic, transaction scoping, draft-only guard, and validation ordering are correct and backed by a thorough backend test suite; the frontend form correctly follows the mutation-feedback and form-validation conventions and correctly derives the local-time `datetime-local` value from the UTC `deadline`. No changes requested.
