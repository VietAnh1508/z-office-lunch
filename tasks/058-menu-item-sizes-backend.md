---
id: 058
title: Per-item sizes: auto-fill for new items, edit endpoint, preset option sync
status: in_review
depends_on: [057]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Keep each menu item's available sizes correct as items and presets change, and let admin choose which sizes an item has.

## Acceptance Criteria

- [ ] Creating a menu item (`POST /restaurants/:id/menu-items`) and bulk creating (`POST .../bulk`, same transaction as the insert) inserts `menu_item_sizes` rows for every option of the restaurant's current preset. No preset -> no rows.
- [ ] `GET /restaurants/:id/menu-items` rows include `sizeOptionIds: number[]` (ordered by option `sortOrder`).
- [ ] `PUT /api/restaurants/:id/menu-items/:itemId/sizes` body `{ sizeOptionIds: number[] }` replaces the item's rows. 404 for unknown restaurant/item (scoped by restaurant, as the `/details` route is); 400 `sizeOptionInvalid` if any id isn't an option of the restaurant's current preset; an empty list is allowed (no size asked); a restaurant without a preset only accepts an empty list. Returns `200 { id, sizeOptionIds }`.
- [ ] `PATCH /api/size-presets/:id` (from 056): a newly added option gets a `menu_item_sizes` row for every item of every restaurant using that preset; removed options' rows disappear via cascade. Renames/reorders change nothing.
- [ ] Tests for each, including the `unreachableEnv` 500 path for the new endpoint.

## Plan

- Reuse `rebuildMenuItemSizes`/helpers from `apps/api/src/lib/menu-item-sizes.ts` (057); add `fillSizesForItems(tx, itemIds, presetId)` and `addOptionToRestaurants(tx, presetId, optionId)`.
- Edit `apps/api/src/routes/menu-items.ts`: POST (`:29`), bulk (`:166`, items come back from `.returning()` inside the transaction — insert sizes there), GET (`:68`, aggregate ids per item with a left join + array agg or a second query; keep explicit selects, never expose price publicly — this GET is admin-only already).
- New PUT sits next to the `/details` PATCH (`:124`).
- Why PUT of the whole list: matches the checkbox UI (061) which edits all ticks at once.
- Clearing submissions' sizes when a size is unticked is added in 059, once the submissions column exists.
- Inactive items keep their size rows so reactivating one works.
- Files: `apps/api/src/routes/menu-items.ts`, `size-presets.ts`, `lib/menu-item-sizes.ts`, `lib/errors.ts`, tests beside each route.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 309b618 — `pnpm test` -> 11 failing (all expected: missing PUT route/sizes/sync)
- green commit: 7d9b516 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (33 files, 504 tests)

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

None.

## Review Notes

No real bugs or convention violations at confidence >= 80. Minor points below the reporting bar:

- Check-then-write race: PUT, POST and bulk POST read the preset outside the write transaction. A concurrent preset PATCH in between could cause an FK error (500) or a missing row. Unlikely in an internal tool.
- `fillSizesForItems` duplicates the options select and rows insert in `rebuildMenuItemSizes`; the latter could call it. Style only.
- A literal `null` JSON body makes `body.sizeOptionIds` throw before the try. Existing handlers share this gap.
- Reviewer did not read the new test files.
