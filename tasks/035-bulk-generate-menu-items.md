---
id: 035
title: Bulk menu-item generation endpoint (override/append)
status: in_review
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

- red commit: `8fb9f79` — `pnpm test -- apps/api/src/routes/menu-items.test.ts` -> 7 failing (route didn't exist yet, Hono's default 404 for all 7 new cases instead of the expected 201/400/404)
- green commit: `26b465b` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (325 tests)

## Plan Deviations

- The Plan's FK-safety test verification used `GET /api/rounds/:id` to check the curated `round_menu_items` row survived override — that route only returns the bare `rounds` row (no joined menu items), so it can't verify this. Switched to querying `round_menu_items` directly via the Drizzle client in the test instead. No production code affected.
- Everything else (route placement, validation order, transaction shape, error keys, seed-helper reuse) was implemented exactly as planned.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

Reviewed the diff for task 035 (`POST /:id/menu-items/bulk`) against this file's Acceptance Criteria/Plan and `.claude/rules/api-error-handling.md`.

Files reviewed:
- `apps/api/src/routes/menu-items.ts` (new route)
- `apps/api/src/lib/errors.ts` (new keys)
- `apps/api/src/routes/menu-items.test.ts` (new tests)
- `packages/db/src/schema.ts` (checked for constraints that could break override/append)

**No high-confidence (≥80) issues found.**

Checks performed and cleared:
- Error-handling convention: `try`/`catch`/`finally` matches the established pattern exactly — structured `console.error` with a descriptive message, `500 internal` on catch, `await db.$client.end()` in `finally`, nothing leaked when validation fails before `getDb(c)` is called.
- Validation order matches the AC precisely: mode → items array → per-item name/price (short-circuits on first invalid item, nothing written) → restaurant id format/existence (400 wins over 404, consistent with the rest of the file).
- Transaction correctness: deactivation and insert both happen inside the same `db.transaction()`, matching the FK-safety requirement (existing rows soft-deleted via `active: false`, never deleted, so `round_menu_items` references stay valid — verified by the dedicated FK-safety test).
- Reuses the existing module-private `parsePrice` helper and `ERROR_MESSAGES` constants rather than duplicating logic/strings, per project convention.
- Route placement/ordering: `POST /:id/menu-items/bulk` cannot be shadowed by the existing `:itemId` PATCH routes (different HTTP methods/segment counts).
- Schema check: no unique constraint on `menu_items(restaurant_id, name)`, so override's non-destructive deactivate-then-insert approach won't hit constraint violations when re-running with overlapping names (a real workflow concern for OCR re-extraction) — this was the one thing worth double-checking and it came back clean.
- `active` defaults to `true` at the schema level, so the insert correctly produces active rows without needing to set it explicitly.

Minor, below-threshold observations (not reported as findings):
- No upper bound on `items.length` — a large enough batch could theoretically approach Postgres's bind-parameter ceiling, but this is an internal admin tool for OCR-sized batches, so this is low-confidence/non-actionable.
- A literal JSON `null` body would throw before the `try` block — same pre-existing pattern as the other handlers in this file, not a new issue introduced by this diff.

The implementation is a faithful, correct match of the task's plan and acceptance criteria.
