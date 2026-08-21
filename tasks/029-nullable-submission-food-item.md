---
id: 029
title: Make submissions.food_round_menu_item_id nullable and null-safe to read
status: in_review
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

- Red: `5f91508` — new tests: two FK-cascade tests (delete a curated `round_menu_items` row, assert the referencing submission's `foodRoundMenuItemId`/`drinkRoundMenuItemId` nulls out), one `GET /:id/submissions` test asserting a nulled-food submission still appears with `foodName: null`, plus a `RoundDetail.test.tsx` case asserting a null `foodName` renders without crashing. `pnpm -r typecheck` failed as expected: `apps/api` line setting `foodRoundMenuItemId: null` didn't typecheck against the still-`NOT NULL` schema.
- Green: `2347350` — `schema.ts`: dropped `.notNull()` from `foodRoundMenuItemId`, added `{ onDelete: "set null" }` to both FKs. Generated migration `0005_windy_revanche.sql` via `pnpm --filter db generate` (inspected: 2 `DROP CONSTRAINT`/`ADD CONSTRAINT ... ON DELETE set null` pairs + 1 `DROP NOT NULL`, matches acceptance criteria exactly) and applied it to the local dev db via `pnpm --filter db migrate` (test db picks it up automatically via `vitest-global-setup.ts`). `rounds.ts`: food joins in `GET /:id/submissions` switched `innerJoin` → `leftJoin`. `useRoundSubmissions.ts`: `foodName: string` → `string | null`. `testing.ts`: `seedSubmission`'s required-fields type widened to `foodRoundMenuItemId: number | null`.
- `pnpm -r typecheck && pnpm --filter web build && pnpm test` → all passing (289/289 tests, no new lint findings — `pnpm lint`'s 3 pre-existing `only-export-components` warnings are in files this task didn't touch).

## Plan Deviations

None — implementation followed the Plan section as written.

## Review Notes

`feature-dev:code-reviewer` (reviewed the red→green diff directly):

> ## Review Scope
>
> Reviewed the diff for task 029, spanning `apps/api/src/routes/rounds.ts`, `apps/api/src/routes/rounds.test.ts`, `apps/web/src/routes/shared/useRoundSubmissions.ts`, `packages/db/src/schema.ts`, `packages/db/src/testing.ts`, and the generated migration `packages/db/migrations/0005_windy_revanche.sql`.
>
> ## Verification performed
>
> - **Join fix correctness**: `GET /:id/submissions` (`apps/api/src/routes/rounds.ts:702-713`) now uses `leftJoin` for *both* hops on the food side (`foodRoundMenuItemAlias` and `foodMenuItemAlias`), matching the drink side's existing pattern. Both hops needed changing — leaving the second hop as `innerJoin` would still have dropped the row, since `foodRoundMenuItemAlias.menuItemId` is null-producing once the first join misses. This is done correctly.
> - **Other queries touching `submissions`**: grepped the whole `apps/api/src` tree for `from(submissions)` — the only other query is the duplicate-submission check in the POST handler (`rounds.ts:656`), which doesn't join to `roundMenuItems`/`menuItems` at all. No other inner-join-on-food-side bug exists elsewhere.
> - **Contract type consistency**: grepped the whole repo for `foodName` — only `apps/web/src/routes/shared/useRoundSubmissions.ts` (updated), its consumers/tests, and the API route (which never declares an explicit response type, relying on inference) reference it. No stale `foodName: string` contract elsewhere.
> - **Migration/snapshot consistency**: `packages/db/migrations/meta/0005_snapshot.json` correctly shows `food_round_menu_item_id` as `"notNull": false` and both FKs as `"onDelete": "set null"` — matching `schema.ts`. No drift between schema, migration SQL, and snapshot.
> - **API error-handling convention**: the modified `GET /:id/submissions` handler already had (and retains) the required `try/catch/finally` with structured `console.error` and `await db.$client.end()` — unaffected by this diff, still compliant.
> - **POST /submissions route**: still requires `foodRoundMenuItemId` and resolves it via `selectRoundMenuItem`, rejecting with 404/400 if missing or invalid. This is correct and intentional — task 029 only widens the column for the *delete-cascade* case; no route yet lets a client submit without a food pick. Not a bug.
> - **Frontend rendering**: `SubmissionsTable.tsx` and `RoundDetail.tsx`'s CSV export render `foodName`/`foodNote` the same way they already render the nullable `drinkName`/`drinkNote` — consistent with the pre-existing pattern, not a new gap introduced here.
>
> ## Findings
>
> No issues at or above the 80-confidence bar. The diff is precisely scoped to the stated task goal, and each piece checks out against the schema, the generated migration, and the rest of the codebase.
>
> ## Worth flagging to the parent as a design question (not a defect in this diff)
>
> When the cascade eventually nulls `foodRoundMenuItemId` (via tasks 030/031, not yet wired to any route), `foodNote` will survive untouched — so a submission could render a blank Food cell next to a leftover note that no longer refers to anything. The codebase already encodes the opposite invariant on the drink side: `rounds.ts:600-603` nulls `drinkNote` whenever `drinkRoundMenuItemId` is null. Task 029 only owns the schema widening and the read-path join fix, and no route can trigger this cascade yet, so this isn't something to fix in this diff — but tasks 030/031 (whichever adds the delete path) should decide whether `foodNote` gets cleared alongside `foodRoundMenuItemId` when the underlying round menu item is deleted, for consistency with the drink side.
