---
id: 031
title: Null affected submission when removing a single curated menu item from a draft round
status: approved
depends_on: [029]
parallelizable_with: [030]
epic: open-round-editing
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-21
---

## Goal

Same underlying problem as task 030, for the other route that can delete a `round_menu_items` row: `DELETE /api/rounds/:id/menu-items/:itemId`. Once an admin can revert an already-`open` round to `draft` (task 032) and un-curate a single item that a submission already selected, that submission's matching side (and its note) needs to be cleared rather than left pointing at a deleted row or silently half-nulled by the FK alone.

## Acceptance Criteria

- [ ] `DELETE /api/rounds/:id/menu-items/:itemId`, when the deleted item is referenced by a submission's `foodRoundMenuItemId`: that submission's `foodRoundMenuItemId` and `foodNote` are set to `null`; every other field (including `drinkRoundMenuItemId`/`drinkNote`) is untouched
- [ ] Same when the deleted item is referenced via `drinkRoundMenuItemId`
- [ ] Deleting an item with no referencing submission behaves exactly as before — no `submissions` row touched, `200` with the deleted row returned
- [ ] The delete and the submission-clearing updates run inside one `db.transaction` (this route currently has none — it does a single bare `db.delete(...)`)
- [ ] No change to the route's guard — it remains `draft`-only, and a nonexistent item/round still 404s `roundMenuItemNotFound` exactly as today, and a non-draft round still 400s `roundEditNotDraft` exactly as today
- [ ] `pnpm -r typecheck && pnpm --filter web build && pnpm test` passes

## Plan

### API (`apps/api/src/routes/rounds.ts`)

1. `DELETE /:id/menu-items/:itemId`: after the existing `existing` (round-menu-item) lookup and the `round.status !== "draft"` guard, replace the current bare
   ```ts
   const [row] = await db
     .delete(roundMenuItems)
     .where(eq(roundMenuItems.id, itemId))
     .returning();
   ```
   with:
   ```ts
   const [row] = await db.transaction(async (tx) => {
     await tx
       .update(submissions)
       .set({ foodRoundMenuItemId: null, foodNote: null })
       .where(eq(submissions.foodRoundMenuItemId, itemId));
     await tx
       .update(submissions)
       .set({ drinkRoundMenuItemId: null, drinkNote: null })
       .where(eq(submissions.drinkRoundMenuItemId, itemId));
     return tx.delete(roundMenuItems).where(eq(roundMenuItems.id, itemId)).returning();
   });
   ```
   Both `UPDATE`s are cheap no-ops when nothing matches (a single item can only ever be referenced by one side across submissions in practice, but running both is simpler and harmless than branching on which side it belongs to).
2. Keep the existing `try`/`catch`/`finally` wrapper unchanged — only the body inside `try` gains the transaction, per `.claude/rules/api-error-handling.md`.

### Tests (`apps/api/src/routes/rounds.test.ts`)

3. New tests alongside the existing `DELETE /:id/menu-items/:itemId` describe block:
   - Draft round with a curated food item and a submission referencing it: `DELETE` that item → `200`; re-read the submission, assert `foodRoundMenuItemId`/`foodNote` are `null`, drink side untouched.
   - Same for a curated drink item referenced by a submission's `drinkRoundMenuItemId`.
   - Draft round with a curated item and NO referencing submission: `DELETE` → `200`, no `submissions` row exists to check, but assert the response shape is unchanged from before (regression guard against the new transaction accidentally touching unrelated rows).
   - Existing closed/open-round-blocked and nonexistent-item tests continue to pass unmodified.

## Implementation Log

## Plan Deviations

## Review Notes
