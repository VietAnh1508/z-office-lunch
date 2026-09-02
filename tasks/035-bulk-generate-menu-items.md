---
id: 035
title: Bulk menu-item generation endpoint (override/append)
status: approved
depends_on: [004]
parallelizable_with: []
epic: ocr-menu-generation
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-02
---

## Goal

Add a backend endpoint that lets the admin save a batch of extracted menu items for a restaurant in one request, either appending them to the existing active menu or replacing it. "Replacing" must never hard-delete existing rows — `round_menu_items.menu_item_id` references `menu_items.id` with no `onDelete: cascade`, so deleting an item ever curated into any round (past or present) would violate that FK. Replacing means: deactivate the restaurant's currently-active items, then insert the new ones, matching the existing `active` soft-delete convention used by the single-item toggle route.

## Acceptance Criteria

- [ ] `POST /api/restaurants/:id/menu-items/bulk` with body `{ mode: "append" | "override", items: { name: string; price?: string | number | null }[] }`:
  - `mode` missing or not `"override"`/`"append"` → `400 { error: "mode must be override or append" }` (new `ERROR_MESSAGES.bulkModeInvalid`), checked before anything else.
  - `items` missing, not an array, or `[]` → `400 { error: "items must be a non-empty array" }` (new `ERROR_MESSAGES.bulkItemsRequired`) — rejected for both `mode`s, including `override` (an empty-items override must never be allowed to silently wipe the active menu).
  - Every item validated before any DB write: a blank/whitespace-only `name` → `400 nameRequired` (existing key); an invalid `price` (via the existing `parsePrice` helper) → `400 priceInvalid` (existing key). The first invalid item in the array short-circuits the whole request — nothing is written even if items before or after it are valid.
  - Non-integer or nonexistent `:id` → `404 restaurantNotFound` (existing key), checked only after body validation passes (400 wins over 404, same ordering as the other routes in this file).
  - `mode: "append"`: all items are inserted as new active (`active: true`) rows; any existing menu items (active or not) are untouched. Returns `201` with the array of newly-inserted rows.
  - `mode: "override"`, run inside a single `db.transaction()`: all of the restaurant's currently-*active* menu items are set `active: false` (not deleted — same rows, same ids), then the new items are inserted as fresh active rows. Returns `201` with only the newly-inserted rows (not the deactivated ones).
  - Override is FK-safe: seed a restaurant → menu item → a round that curates that item into `round_menu_items` → call override → the old menu item row still exists (`active: false`, same id), the `round_menu_items` row is untouched, no FK error.
  - Both deactivation and insertion happen as one transaction (not two independent awaits) — stated for clarity even if a dedicated forced-rollback test isn't written.

## Plan

### `apps/api/src/lib/errors.ts`

Add two new keys to `ERROR_MESSAGES`: `bulkModeInvalid: "mode must be override or append"`, `bulkItemsRequired: "items must be a non-empty array"`.

### `apps/api/src/routes/menu-items.ts`

Add `POST "/:id/menu-items/bulk"`, placed directly after the existing `PATCH /:id/menu-items/:itemId/details` (groups all menu-item mutations together, same file convention as task 034 followed for the details route relative to the toggle route).

Handler order:
1. Parse body (`.json().catch(() => ({}))`).
2. `mode !== "override" && mode !== "append"` → 400 `bulkModeInvalid`.
3. `!Array.isArray(items) || items.length === 0` → 400 `bulkItemsRequired`.
4. For each item: `name = item.name?.trim()`, blank → 400 `nameRequired`; `parsePrice(item.price)` invalid → 400 `priceInvalid` (reuse the existing module-private `parsePrice` — do not duplicate or extract it). Collect the parsed `{name, price}` list only after every item passes.
5. `Number.isInteger(restaurantId)` check and DB restaurant lookup → 404 `restaurantNotFound` if missing (same convention as the other routes: bad `:id` format and a missing restaurant both 404 the same way).
6. `getDb(c)`, then:
   ```ts
   const inserted = await db.transaction(async (tx) => {
     if (mode === "override") {
       await tx
         .update(menuItems)
         .set({ active: false })
         .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true)));
     }
     return tx
       .insert(menuItems)
       .values(parsedItems.map((i) => ({ restaurantId, name: i.name, price: i.price })))
       .returning();
   });
   return c.json(inserted, 201);
   ```
7. Standard try/catch/finally per `.claude/rules/api-error-handling.md` (structured `console.error`, 500 `internal` on catch, `await db.$client.end()` in `finally`).

This is the first use of `db.transaction()` in the repo — supported because `packages/db` builds its client via `drizzle-orm/node-postgres` over a real `pg` connection (not the neon-http driver, which lacks transaction support).

### Tests (`apps/api/src/routes/menu-items.test.ts`)

New `describe("POST /:id/menu-items/bulk")`, using existing `seedRestaurant`/`seedMenuItem` helpers from `packages/db/src/testing.ts` and `truncateAll` in `beforeEach`:
- append: inserts all items as active rows, 201, existing items untouched.
- override: deactivates existing active items and inserts new ones, 201 with only the new rows.
- override FK-safety: seed restaurant → menu item → round → `round_menu_items` row referencing that item; call override; assert 201, the old item row still exists with `active: false` and unchanged id, and the round's curated row is untouched.
- `mode` missing/invalid → 400 `bulkModeInvalid`.
- `items` missing/not-an-array/`[]` (for both `mode`s) → 400 `bulkItemsRequired`.
- one item with blank name → 400 `nameRequired`, verify via a follow-up GET that no items were written.
- one item with invalid price → 400 `priceInvalid`, verify nothing written.
- nonexistent/non-integer `:id` → 404 `restaurantNotFound`.

Run `pnpm test -- apps/api/src/routes/menu-items.test.ts`, then the full `test_command`, confirm all green.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
