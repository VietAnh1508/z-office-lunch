---
id: 031
title: Null affected submission when removing a single curated menu item from a draft round
status: done
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

- Red: `17e75d8` — 3 new tests added to the `round menu items` describe block in `apps/api/src/routes/rounds.test.ts` (food-referencing, drink-referencing, no-referencing regression). `pnpm test -- apps/api/src/routes/rounds.test.ts` -> 2 failing (the food/drink note+id tests; the no-referencing regression test passed immediately since it exercised no new behavior), 294 passing.
- Green: `addcb4b` — wrapped the `DELETE /:id/menu-items/:itemId` delete in `db.transaction`, adding the two `submissions` `UPDATE`s per the Plan, exactly as specified. `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (296/296).
- Lint: `pnpm lint` clean except 3 pre-existing `react(only-export-components)` warnings in files this task doesn't touch.

## Plan Deviations

None — implementation matches the Plan section exactly (same transaction shape, same two unconditional `UPDATE`s, same guard left untouched). Test placement: added the 3 new cases inline in the existing `round menu items` describe block (next to the other `DELETE` tests) rather than a new nested describe, since the Plan's own wording just says "alongside the existing `DELETE /:id/menu-items/:itemId` describe block" and there wasn't a separate nested block to add to.

## Review Notes

`feature-dev:code-reviewer` findings (no confirmation confidence ≥ 80):

No issues found. Verified: the UPDATE-before-DELETE ordering is correct and necessary (the `roundMenuItems`→`submissions` FK is `onDelete: "set null"`, so deleting first would already null the id columns and make the subsequent `WHERE eq(..., itemId)` UPDATEs match nothing, leaving `foodNote`/`drinkNote` stale) — same ordering rationale as the precedent `clearAffectedSubmissions` in the PATCH `/:id` restaurant-change route; each UPDATE only touches its own food/drink column pair, matching the three new tests; both updates and the delete run on `tx` so they're atomic; existing guards (draft-only, 404, `roundEditNotDraft`) are untouched; try/catch/finally error handling per `.claude/rules/api-error-handling.md` is unchanged and still wraps the new transaction; no lint/format rule is violated by the longer one-line delete statement (no biome/prettier/eslint config enforces a line-length in this repo/package).

Noted, not a defect: since this route requires `draft` status and there's currently no live-API path back to `draft` once a round is `open`/`closed` (no revert transition exists yet — that's task 032), the new submission-clearing logic is only reachable in tests today via `seedSubmission` seeded directly into the DB, not through a real request flow. Same situation already accepted for task 030's analogous PATCH change; this is forward-looking, defensive code for the task-032 draft-revert path.

Considered and dismissed as below-bar: duplicating the two inline UPDATEs here instead of factoring a shared `clearAffectedSubmissions`-style helper (the file already has a precedent for a shared tx-taking helper, `insertActiveMenuItems`) — legitimate minor duplication, not a functional issue, not required by any project guideline. Also noted `submissions.updatedAt` isn't bumped by these UPDATEs (no `$onUpdate` on that column) — pre-existing, identical to the task-030 PATCH code, not new here.
