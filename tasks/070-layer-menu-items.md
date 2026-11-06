---
id: 070
title: Layer the menu-items module
status: approved
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

## Plan Deviations

## Review Notes
