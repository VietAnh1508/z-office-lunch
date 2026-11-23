---
id: 070
title: Layer the menu-items module
status: done
depends_on: [069]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/menu-items"
created: 2026-11-06
---

## Goal

Split `routes/menu-items.ts` (336 lines) into controller/service/repository and split `menu-items.test.ts` (505 lines) per layer.

## Acceptance Criteria

- [ ] `modules/menu-items/{controller,service,repository}.ts` replace `routes/menu-items.ts`; still mounted on `/api/restaurants` in `index.ts`.
- [ ] Endpoints unchanged: `POST/GET /:id/menu-items`, `PATCH /:id/menu-items/:itemId` (toggle active), `PATCH .../details`, `PUT .../sizes`, `POST /:id/menu-items/bulk`.
- [ ] Service owns: new items start with all preset sizes ticked (`fillSizesForItems`), override mode deactivates all active items first, allowed sizes limited to the restaurant's preset, removing a size clears submissions that picked it (`clearRemovedItemSizes`). Transactions (create, sizes PUT, bulk) are owned by the service.
- [ ] Repository holds the shared queries: menu item belongs to restaurant (menu-items.ts:134, :177, :220), size options ordered by `sortOrder, id` (also in rounds and size-presets), restaurant-by-id.
- [ ] Error order preserved (name and price validated before restaurant id parse, `:41-48`); `GET /:id/menu-items` still returns `[]` (not 404) for a bad restaurant id (`:82`); response shaping (`sizeOptionIds` merged into each row, `:110-115`) unchanged.
- [ ] Tests split per layer, no coverage loss, full `pnpm test` passes.

## Plan

Body parsing (`parsePrice` etc.) stays in the controller or a small `validate.ts`; the bulk payload loop (`:280-291`) and sizes array validation (`:209-216`) are body validation. Note PUT re-selects outside the transaction today (`:252`) - keep as is.

Files: `modules/menu-items/*` (+ tests), `index.ts`; delete `routes/menu-items.ts` and `routes/menu-items.test.ts`.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing `menu-items.test.ts` HTTP tests word for word into `modules/menu-items/*controller*.test.ts` files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

## Implementation Log

- Red: `f48743f` — relocated `routes/menu-items.test.ts` (23 `it`) to `modules/menu-items/controller.test.ts` and `routes/menu-item-sizes.test.ts` (12 `it`) to `modules/menu-items/controller-sizes.test.ts` word for word (import paths only); added throwing stubs for `modules/menu-items/{repository,service}.ts` plus 20 new layer tests (`repository.test.ts`: 10, `service.test.ts`: 10). `pnpm test apps/api/src/modules/menu-items` -> 20 failing, 35 passing.
- Green: `ad7de6c` — implemented `modules/menu-items/{repository,service,controller}.ts`, updated `index.ts` to mount `./modules/menu-items/controller`, and deleted `routes/menu-items.ts`. `pnpm test apps/api/src/modules/menu-items` -> 4 files, 55 tests passing; `pnpm typecheck` and `pnpm lint` clean (0 errors).
- Result: full `pnpm test` -> 45 files, 654 tests passing.
- Old `it` accounting: all 23 `it` from `routes/menu-items.test.ts` moved to `modules/menu-items/controller.test.ts`; all 12 `it` from `routes/menu-item-sizes.test.ts` moved to `modules/menu-items/controller-sizes.test.ts`.

## Plan Deviations

- Also relocated `routes/menu-item-sizes.test.ts` (12 `it`) into `modules/menu-items/controller-sizes.test.ts` and deleted the `routes/` file, picking up the move deferred from task 069.
- Kept request parsing/validation (`parseName`, `parsePrice`, `parseSizeOptionIds`, `parseBulkBody`) inside `controller.ts` rather than a separate `validate.ts`.
- `bulkCreateMenuItems` returns `Result<{ items: MenuItemRow[] }>` and the controller unwraps `result.items` directly via `c.json(result.items, 201)` on success because `respond()` spreads object results.
- `status: in_progress` was set locally before the red commit and is committed together with `status: in_review` in the `chore:` commit.

## Review Notes

Self-review of `git diff main...HEAD`: no bugs, regressions, or layer-rule violations found. Error-check order (`name`/`price` before `restaurantId` on `POST`, `[]` for non-integer `restaurantId` on `GET`, `404` before body validation on `PATCH`/`PUT`, bulk payload validation before `restaurantId` on `POST .../bulk`), transactions (create, `PUT .../sizes`, bulk), and `PUT .../sizes` re-selecting outside the transaction all match `routes/menu-items.ts`.
