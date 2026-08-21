---
id: 029
title: Make submissions.food_round_menu_item_id nullable and null-safe to read
status: approved
depends_on: []
parallelizable_with: []
epic: open-round-editing
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-21
---

## Goal

Foundational schema change, no new admin-facing behavior yet. Widen `submissions.foodRoundMenuItemId` from `NOT NULL` to nullable, and add `onDelete: "set null"` to both `foodRoundMenuItemId` and `drinkRoundMenuItemId`'s FK to `roundMenuItems.id`, so that a future admin edit that deletes a `round_menu_items` row a submission references can null that submission's matching column instead of failing on an FK violation or leaving an orphaned reference. Fix the one place this schema change would otherwise cause silent data loss: `GET /:id/submissions` currently `innerJoin`s the food side, so a nulled food selection would vanish from the result entirely rather than rendering blank (unlike the drink side, which already `leftJoin`s and already handles null).

## Acceptance Criteria

- [ ] `packages/db/src/schema.ts`: `submissions.foodRoundMenuItemId` drops `.notNull()`; both `foodRoundMenuItemId` and `drinkRoundMenuItemId`'s `.references(() => roundMenuItems.id, ...)` gain `{ onDelete: "set null" }` (precedent: `roundMenuItems.roundId` already uses `{ onDelete: "cascade" }`, `schema.ts:61`)
- [ ] A new migration exists under `packages/db/migrations/` (via `pnpm --filter db generate`) containing `ALTER COLUMN food_round_menu_item_id DROP NOT NULL` plus a `DROP CONSTRAINT` + `ADD CONSTRAINT ... ON DELETE set null` pair for each of the two FKs — inspect the generated SQL file directly, don't assume `generate` did the right thing from the diff alone
- [ ] Deleting a `round_menu_items` row that a submission's `foodRoundMenuItemId` (or `drinkRoundMenuItemId`) points at sets that submission's column to `null` automatically — proven by a test that deletes the row directly via the db client (no route can trigger this deletion yet; that's tasks 030/031)
- [ ] `GET /api/rounds/:id/submissions` (`apps/api/src/routes/rounds.ts`) joins the food alias/menu-item alias with `leftJoin` (was `innerJoin`), matching the drink side already at `leftJoin`
- [ ] A submission whose `foodRoundMenuItemId` is `null` still appears in `GET /:id/submissions`'s response array, with `foodName: null` (not silently dropped)
- [ ] `apps/web/src/routes/shared/useRoundSubmissions.ts`'s `RoundSubmission.foodName` type widens from `string` to `string | null`
- [ ] `apps/web/src/routes/shared/SubmissionsTable.tsx` renders a null `foodName` as a blank cell — verified by a test, no source change expected (React already renders `null` children as nothing, same as the existing null-`drinkName` case)
- [ ] `packages/db/src/testing.ts`'s `seedSubmission` helper's required-fields type accepts `foodRoundMenuItemId: number | null` (still required, just nullable)
- [ ] `pnpm -r typecheck` passes with no `any`/`as` casts introduced to paper over the widened type

## Plan

### Schema (`packages/db/src/schema.ts`)

1. `submissions.foodRoundMenuItemId` (currently ~line 79-81):
   ```ts
   foodRoundMenuItemId: integer("food_round_menu_item_id").references(
     () => roundMenuItems.id,
     { onDelete: "set null" },
   ),
   ```
2. `submissions.drinkRoundMenuItemId` (currently ~line 83-85): add `{ onDelete: "set null" }` to its existing `.references()` call (it's already nullable, only the FK action is new).
3. Run `pnpm --filter db generate`. Open the generated `packages/db/migrations/NNNN_*.sql` and confirm it contains the DROP NOT NULL and both constraint-swap statements. Run `pnpm --filter db migrate` against the local/test databases so `vitest-global-setup.ts` (which applies real migration files, not `drizzle-kit push`) picks it up.

### API (`apps/api/src/routes/rounds.ts`)

4. `GET /:id/submissions`: change `.innerJoin(foodRoundMenuItemAlias, ...)` and its following `.innerJoin(foodMenuItemAlias, ...)` to `.leftJoin(...)`, matching the drink side's existing `leftJoin`s immediately below.

### Frontend

5. `apps/web/src/routes/shared/useRoundSubmissions.ts`: `foodName: string` → `foodName: string | null`.
6. No change expected in `SubmissionsTable.tsx` or the CSV export in `RoundDetail.tsx` — both already handle a null field (mirroring the existing null-drink case); confirm via test rather than editing speculatively.

### Test helpers (`packages/db/src/testing.ts`)

7. `seedSubmission`'s parameter type: change `{ roundId: number; employeeId: number; foodRoundMenuItemId: number }` to `{ roundId: number; employeeId: number; foodRoundMenuItemId: number | null }`.

### Tests

8. `apps/api/src/routes/rounds.test.ts` (new tests, using the module-level `db` client already imported there):
   - Seed a round, a curated food round-menu-item, and a submission referencing it via `seedSubmission`. Delete the round-menu-item row directly: `await db.delete(roundMenuItems).where(eq(roundMenuItems.id, foodRoundMenuItem.id))`. Re-select the submission and assert `foodRoundMenuItemId` is now `null`. Repeat for the drink side.
   - In the `GET /:id/submissions` describe block: seed a submission, then `await db.update(submissions).set({ foodRoundMenuItemId: null }).where(eq(submissions.id, submission.id))` (simulating post-cascade state without needing a route that can produce it yet), call the endpoint, assert the row is present with `foodName: null` rather than missing from the array.
9. `apps/web/src/routes/shared/SubmissionsTable.test.tsx` (or wherever its existing tests live): a submission with `foodName: null` renders an empty food cell, same as an existing null-`drinkName` case already does.

## Implementation Log

## Plan Deviations

## Review Notes
