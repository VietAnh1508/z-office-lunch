---
id: 061
title: Admin UI: assign preset to a restaurant and tick sizes per menu item
status: approved
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

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
