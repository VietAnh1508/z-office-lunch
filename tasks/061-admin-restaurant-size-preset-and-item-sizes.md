---
id: 061
title: Admin UI: assign preset to a restaurant and tick sizes per menu item
status: done
depends_on: [059, 060]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

On a drink restaurant, admin picks a size preset (with a warning before changing one that's in use) and unticks sizes on individual menu items.

## Acceptance Criteria

- [ ] `RestaurantDetailsForm` (drink restaurants only) has a "Size preset" native select: "None" plus all presets (labelled "Name (S / M / L)"). Hidden for food restaurants. The create form on `Restaurants.tsx` gets the same select for type `drink`.
- [ ] Saving a changed preset first calls `GET /restaurants/:id/size-reset-impact`. If `affectedSubmissions > 0`, an `AlertDialog` states how many open-round orders will lose their size and that admin must ask people to resubmit; confirm proceeds, cancel aborts. If 0, saves without a dialog.
- [ ] Each menu item row shows a checkbox per option of the restaurant's preset (all ticked by default from the API); changing them calls `PUT .../menu-items/:itemId/sizes`. In `MenuItemRow` edit mode, saved with Save/Cancel along with name/price. The add-item form needs no size input (new items auto-get all).
- [ ] After a preset change, menu-item and public-round caches are invalidated (`useUpdateRestaurant` currently only invalidates `restaurantKeys.list()`).
- [ ] Component tests (`Restaurants.test.tsx`, `RestaurantDetail.test.tsx`) cover: select shown only for drink, impact dialog appears/doesn't, checkbox toggle sends the PUT; e2e updated in `admin-restaurants.spec.ts`/`admin-restaurant-detail.spec.ts`.

## Plan

- Types are hand-written per hook: add `sizePresetId` to `Restaurant`/`CreateRestaurantInput`/`UpdateRestaurantInput` (`useRestaurants.ts`), `sizeOptionIds` to `MenuItem` (`useMenuItems.ts`); new `useSizeResetImpact` and `useUpdateMenuItemSizes` hooks. Presets list comes from `useSizePresets` (060).
- Radix `Checkbox` (`components/ui/checkbox.tsx`) with `<Label htmlFor>`, as in `BulkAddMenuItems.tsx`.
- Controlled confirm dialog: copy the `confirmOpen` pattern at `RoundDetail.tsx:317-337`.
- `RestaurantDetailsForm` initialises state once (`key={restaurant.id}`); a refetch won't reset fields — sync deliberately.
- Don't send `sizePresetId` unless it changed, though 057 already treats omitted as unchanged.
- Files: `apps/web/src/routes/admin/Restaurants.tsx`, `RestaurantDetail.tsx`, `useRestaurants.ts`, `useMenuItems.ts`, tests beside them, `e2e/admin-restaurants.spec.ts`, `e2e/admin-restaurant-detail.spec.ts`.

## Implementation Log

- red commit: abcc18f — `pnpm test -- Restaurants/RestaurantDetail` -> 7 failing
- green commit: 7e9d8e5 — size preset select (create + details), impact dialog, per-item size checkboxes, `api.put`, cache invalidation; `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (547 tests)
- e2e commit: 5d858da — `admin-restaurants.spec.ts` and `admin-restaurant-detail.spec.ts` updated; 5 e2e tests pass

## Plan Deviations

- Added `api.put` to `apps/web/src/lib/api.ts` (only get/post/patch existed) and a `publicRoundKeys.all` key in `usePublicRound.ts`; neither was listed in the Plan's files.
- Extracted a shared `SizePresetSelect.tsx` used by both forms instead of duplicating the select.
- `useSizePresets` got an `enabled` option so the detail page doesn't fetch presets for restaurants without one (existing tests have no default MSW handler for `/api/size-presets`).
- `useSizeResetImpact` is a mutation (called imperatively on Save), not a query.
- Existing `RestaurantDetail.test.tsx` menu-item fixtures needed `sizeOptionIds: []`.
- Review was run on a diff saved to a file rather than pasted into the prompt, since it was ~1000 lines.

## Review Notes

feature-dev:code-reviewer: no issues at confidence >= 80. Checked acceptance criteria, save order, cache invalidation, stale checkbox state. Minor items below threshold, left as is:

- If PATCH /details succeeds and PUT /sizes then fails, the user sees "Menu item updated" then an error toast; the row stays in edit mode with name/price already saved.
- Briefly after a preset change, `sizeOptions` can come from the new preset while menu items are still the old ones, until the refetch finishes.
- A row already in edit mode when the preset changes keeps its old `sizeIds` until cancel and reopen.
