---
id: 069
title: Layer the menu-item-sizes and size-presets modules
status: approved
depends_on: [068]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/menu-item-sizes apps/api/src/modules/size-presets"
created: 2026-11-06
---

## Goal

Move `lib/menu-item-sizes.ts` into a shared repository module and layer `routes/size-presets.ts`. The sizes repository is used by restaurants, menu-items and size-presets, so it has to land before those two are moved.

## Acceptance Criteria

- [ ] `modules/menu-item-sizes/repository.ts` holds everything from `lib/menu-item-sizes.ts` (`clearRestaurantDrinkSizes`, `countRestaurantDrinkSizes`, `rebuildMenuItemSizes`, `fillSizesForItems`, `clearRemovedItemSizes`, `addOptionToRestaurants`), with the duplicated options-to-rows logic (`:38-43` and `:55-60`) merged. `routes/restaurants.ts` and `routes/menu-items.ts` import from the new location; `lib/menu-item-sizes.ts` is deleted.
- [ ] `modules/size-presets/{controller,service,repository}.ts` replace `routes/size-presets.ts`; `index.ts` updated.
- [ ] The duplicated `parseName`/`parseLabel` (menu-items.ts, size-presets.ts, and `parseFullName`, which 068 already moved into `modules/employees/`) become one shared trim helper in `lib/` only if their error messages are identical; otherwise leave them separate and note it in the Plan Deviations.
- [ ] Rules in the service: name uniqueness 409, options unique and owned by the preset, in-use delete 409, the PATCH transaction (update name, delete removed options, park kept options on `__tmp__<id>` labels, re-insert/update, `addOptionToRestaurants` for new options).
- [ ] Error order preserved: PATCH returns 404 before 400 (`size-presets.ts:141-146`).
- [ ] Tests split per layer; `size-presets.test.ts`, `size-presets-sync.test.ts`, `menu-item-sizes.test.ts` moved/split with no coverage loss. Full `pnpm test` passes.

## Plan

`lib/menu-item-sizes.ts` already mixes queries with rules and touches `menuItemSizes`, `menuItems`, `restaurants`, `roundMenuItems`, `rounds`, `sizeOptions`, `submissions`. Keep it query-focused as a repository; any rule found inside (e.g. "only when the preset changed") stays in the calling service. Use the `Db`/`Tx` types from 067.

`loadPreset` (`size-presets.ts:51`) is already repository-style; move it. `validatePreset` (`:25-49`) returns a `Result` - keep in the service or a small `validate.ts` in the module.

Files: `modules/menu-item-sizes/repository.ts` (+ test), `modules/size-presets/*`, `lib/` trim helper, import updates in `routes/restaurants.ts` and `routes/menu-items.ts`, `index.ts`.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing HTTP tests (`size-presets.test.ts`, `size-presets-sync.test.ts`, `menu-item-sizes.test.ts`) word for word into the module's controller test files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

## Implementation Log

## Plan Deviations

## Review Notes
