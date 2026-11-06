---
id: 057
title: Assign a size preset to a drink restaurant (backend) with item size auto-fill
status: in_review
depends_on: [056]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

A drink restaurant can point at a size preset. Assigning, changing or removing it rebuilds every one of that restaurant's menu items' available sizes (all options ticked by default).

## Acceptance Criteria

- [ ] Schema: `restaurants.sizePresetId` (nullable FK -> `sizePresets.id`, `onDelete: "set null"`); new `menuItemSizes` table (`menuItemId` FK -> `menuItems.id` cascade, `sizeOptionId` FK -> `sizeOptions.id` cascade, unique `(menuItemId, sizeOptionId)`). Migration `0008_*`.
- [ ] `POST /api/restaurants` and `PATCH /api/restaurants/:id` accept optional `sizePresetId` (number or null). 400 `sizePresetIdInvalid` if not an integer/null; 400 `sizePresetFoodRestaurant` if the restaurant is `food` and a non-null id is sent; 404 `sizePresetNotFound` if the preset doesn't exist.
- [ ] PATCH is a full replace today: an omitted `sizePresetId` must **leave it unchanged** (only an explicit `null` clears it), so existing clients that don't send it don't wipe it. Test both.
- [ ] When PATCH changes `sizePresetId` (value differs from stored): in one transaction delete all `menu_item_sizes` for that restaurant's items, then (if the new id is non-null) insert one row per item (active and inactive) per option of the new preset. Unchanged id -> no rebuild.
- [ ] On POST with a preset: nothing to rebuild (no items yet).
- [ ] `GET /api/restaurants` includes `sizePresetId` (automatic via raw select).
- [ ] `DELETE /api/size-presets/:id` now returns 409 `sizePresetInUse` while a restaurant references it (the check deferred from 056), with a test.
- [ ] `truncateAll` includes `menu_item_sizes`; `seedMenuItemSize` helper if useful. Tests for each rule above plus the `unreachableEnv` 500 path.

## Plan

- Edit `apps/api/src/routes/restaurants.ts` (POST at `:88`, PATCH at `:120`) and `size-presets.ts` DELETE. Reuse the not-found-then-update structure already in PATCH; wrap the rebuild in `db.transaction` (pattern: `menu-items.ts` bulk, `rounds.ts:105`).
- Shared helper `rebuildMenuItemSizes(tx, restaurantId, presetId | null)` in a new `apps/api/src/lib/menu-item-sizes.ts`; 058 reuses it for new items and option sync. Guard empty inserts (`.values([])` throws in Drizzle — see `insertActiveMenuItems` in `rounds.ts:25`).
- Type check is on the restaurant row (`type === "drink"`), the only precedent for type validation is `rounds.ts` (`drinkRestaurantTypeInvalid`).
- Why unchanged-omitted semantics: PATCH is a full replace for the other fields, but the web client (task 061) and old clients shouldn't have to resend the preset on every edit.
- Submission clearing for open rounds is added in 059, once the column exists; leave a note in the code path.
- Files: `packages/db/src/schema.ts`, `migrations/0008_*`, `packages/db/src/testing.ts`, `apps/api/src/routes/restaurants.ts` (+ test), `apps/api/src/routes/size-presets.ts` (+ test), `apps/api/src/lib/menu-item-sizes.ts`, `apps/api/src/lib/errors.ts`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 4b3ba7b — `pnpm test -- apps/api/src/routes/restaurants-size-preset.test.ts` -> 12 failing (6 new tests passed already, e.g. omitted-id-unchanged)
- green commit: 27bc89b — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (489 tests, 31 files); `pnpm lint` clean for touched files

## Plan Deviations

- Schema, migration `0008_busy_paibok.sql` and `db/testing.ts` helpers went into the red commit (not just test files), so the tests fail on behavior instead of a missing table/column.
- Moved `sizePresets`/`sizeOptions` above `restaurants` in `schema.ts` so the new FK can reference `sizePresets`.
- Mistake caught mid-task: I ran prettier on `restaurants.ts` (repo has no prettier config), which reformatted the whole file. Redid the edits without it and amended the unpushed green commit.
- Added a small `presetExists` helper in `restaurants.ts`, not in the Plan.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

feature-dev:code-reviewer: no issues at confidence >= 80. Compliant with api-error-handling rules; PATCH omit/null semantics and transaction use correct.
Below the reporting bar (optional, not fixed):
- Race: a preset deleted between `presetExists` and the update hits the FK and returns 500 instead of 404 (tiny window).
- `Number.isInteger` accepts negatives and values like 1e21; these fail at the Postgres int cast and return 500 instead of 400/404.
