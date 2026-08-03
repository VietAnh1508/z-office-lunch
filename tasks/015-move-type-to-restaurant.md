---
id: 015
title: Move type field from MenuItem to Restaurant
status: done
depends_on: [004]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-03
---

## Goal

A restaurant only ever serves food OR drink, so `type` (`food`|`drink`) moves from `MenuItem` to `Restaurant` — set once at creation, no longer per item. Deferred from task 004 per the human reviewer's note on that PR.

## Acceptance Criteria

- [ ] `restaurants` table has a `type` (`food`|`drink`) column, required (`NOT NULL`); `menu_items.type` is removed
- [ ] `POST /api/restaurants` requires `type` to be `food` or `drink`, 400 otherwise; `GET /api/restaurants` returns it
- [ ] `POST /api/restaurants/:id/menu-items` no longer accepts or requires `type`
- [ ] Restaurants create form (`Restaurants.tsx`) has a food/drink selector; the list shows each restaurant's type as `(food)`/`(drink)` next to its name, outside the `<Link>` so the link's accessible name is unchanged
- [ ] RestaurantDetail (`RestaurantDetail.tsx`) header shows the restaurant's `(food)`/`(drink)` label next to (not inside) the `<h1>` name; the add-item form no longer has a type selector; the item list no longer shows per-item type
- [ ] A local dev Postgres with existing restaurant rows migrates cleanly (no `NOT NULL` constraint failure) — there's no `db:reset` script, so the migration must handle already-populated tables, not just the always-truncated test DB

## Plan

### 1. `packages/db/src/schema.ts` + migration

- Add `restaurantType = pgEnum("restaurant_type", ["food", "drink"])` — a new enum, not a reuse of `menuItemType`, since keeping the name `menu_item_type` for a field that no longer lives on `MenuItem` would be misleading.
- Remove `type` from `menuItems`; add `type: restaurantType("type").notNull()` to `restaurants`.
- Generate via `pnpm db:generate`, then hand-check/edit the resulting SQL to apply safely against a populated local dev DB, in this order (drop the old column before dropping its enum type; add the new column with a temporary default so `NOT NULL` doesn't fail against existing rows, then drop the default):
  1. `ALTER TABLE "menu_items" DROP COLUMN "type";`
  2. `DROP TYPE "public"."menu_item_type";`
  3. `CREATE TYPE "public"."restaurant_type" AS ENUM('food', 'drink');`
  4. `ALTER TABLE "restaurants" ADD COLUMN "type" "restaurant_type" DEFAULT 'food' NOT NULL;`
  5. `ALTER TABLE "restaurants" ALTER COLUMN "type" DROP DEFAULT;`
- `packages/db/src/testing.ts`: move the `type: "food"` default from `seedMenuItem` (drop entirely) to `seedRestaurant`.

### 2. `apps/api`

- `apps/api/src/routes/restaurants.ts` (`POST /`): read `body.type`, validate `"food"|"drink"` (reuse `ERROR_MESSAGES.typeInvalid`), insert it. `GET /` needs no code change — already returns full rows.
- `apps/api/src/routes/menu-items.ts` (`POST /:id/menu-items`): remove all reading/validation/insertion of `type`.

### 3. `apps/web`

- `apps/web/src/routes/admin/useRestaurants.ts`: add `type: "food" | "drink"` to `Restaurant` and `CreateRestaurantInput`.
- `apps/web/src/routes/admin/useMenuItems.ts`: remove `type` from `MenuItem` and `CreateMenuItemInput`.
- `apps/web/src/routes/admin/Restaurants.tsx`:
  - Add a native `<select>` (Food/Drink, defaulting "food") to the create form — same convention `RestaurantDetail.tsx` already used for the menu-item type field (task 004 deliberately skipped shadcn's Select for a two-option field).
  - In the list, render the type label as a sibling `<span>` next to, not inside, the `<Link>` — same pattern as the existing `contactInfo` span. Putting it inside the link would change the link's accessible name and break `getByRole("link", { name: restaurantName })` in `Restaurants.test.tsx` and `e2e/admin-restaurant-detail.spec.ts`.
- `apps/web/src/routes/admin/RestaurantDetail.tsx`:
  - Remove the add-item form's type `<select>`/state entirely.
  - Remove the per-item `(item.type)` display.
  - Add the restaurant's type label as a sibling span next to (not inside) the `<h1>` name — same reasoning, to avoid breaking `getByRole("heading", { name: restaurantName })`.

### 4. Tests

- `apps/api/src/routes/menu-items.test.ts`: strip all `type` fixtures/assertions.
- `apps/api/src/routes/restaurants.test.ts`: add — POST without `type` → 400; POST with an invalid `type` → 400; valid POST with `type: "drink"` persists and round-trips via GET.
- `apps/web/src/routes/admin/RestaurantDetail.test.tsx`: strip `type` from mock menu items and POST body typing; assert the restaurant's type label renders in the header.
- `apps/web/src/routes/admin/Restaurants.test.tsx`: add a test creating a restaurant with `type: "drink"` selected — assert both the captured POST request body includes `type: "drink"` (proves the value round-trips, not just that the UI re-renders a mock) and that the list shows the drink label.
- e2e (`e2e/admin-restaurant-detail.spec.ts`, `e2e/admin-restaurants.spec.ts`): existing specs keep passing unmodified since the native `<select>` always submits a valid default ("food"). Add one new e2e assertion in `admin-restaurants.spec.ts` that picks "Drink" explicitly and asserts the label round-trips, so the new field is exercised end-to-end at least once.
- Expect the red commit to fail on typecheck (removing `MenuItem.type` from the TS types breaks several test files before any test logic changes), same shape as task 004's own red commit — not solely on test assertions.

### 5. `docs/architecture.md`

Update the data model table: move `type` from the `MenuItem` row to the `Restaurant` row. Add a short note on the relationship between `Restaurant.type` and `Round.food_restaurant_id`/`drink_restaurant_id` (a round's food/drink restaurant should match the corresponding type), and note explicitly that enforcing this isn't done here since no `rounds` routes exist yet — pre-empts a reviewer asking why it isn't validated.

### 6. Follow-up note (not implemented here)

Once round creation exists (task 006), `POST /rounds` may want to validate `foodRestaurantId`/`drinkRestaurantId` point at restaurants of the matching `type`. Out of scope here — rounds aren't built yet — but task 006's implementer should pick this up.

## Implementation Log

- red commit: `b597bda1054391b1a96ed184a5a2fcd98efc33f0` — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> fails at typecheck (6 errors in `apps/api`: `restaurants.test.ts`/`menu-items.test.ts` reference `Restaurant.type` / omit `MenuItem.type` ahead of the schema change), as expected
- green commit: `7eab715` — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing (typecheck clean across all 3 packages, web build succeeds, 45/45 vitest tests pass, 7/7 playwright e2e tests pass)
- fix commit (from code review, see Review Notes): `3c06d2e` — same `test_command` -> all passing (45/45 vitest, 7/7 playwright)

Also manually verified the migration (`packages/db/migrations/0001_move_type_to_restaurant.sql`) against the populated local dev `office_lunch` database (2 pre-existing restaurants, 4 menu items) via `pnpm db:migrate` — applied cleanly with no `NOT NULL` failure, existing restaurants backfilled to `type: "food"` via the temporary default, default dropped afterward as planned.

## Plan Deviations

- `drizzle-kit generate` (`pnpm db:generate`) could not run non-interactively: it needs to ask whether `restaurant_type` is a rename of the dropped `menu_item_type` enum or a new enum, and that prompt requires a TTY (confirmed with both piped stdin and a `script`-wrapped pty — neither surfaced the prompt through this session's tool sandbox). Hand-authored `packages/db/migrations/0001_move_type_to_restaurant.sql`, `meta/_journal.json`'s new entry, and `meta/0001_snapshot.json` directly instead, using the exact DDL and ordering already specified in the Plan above. This is a tooling limitation, not a design change — the resulting migration is identical to what `drizzle-kit generate` + hand-editing would have produced.
- First `pnpm exec playwright test` run showed 2 failures (`admin-restaurant-detail.spec.ts`, and the new drink-restaurant e2e case) with the UI displaying "internal error" / "Could not load restaurants." Root cause: a `wrangler dev` process left running from an earlier, unrelated attempt to coax `drizzle-kit generate`'s TTY prompt (via `script -q /dev/null`) was still bound to port 8787 from before the schema/route changes. Playwright's `webServer.reuseExistingServer` (true outside CI) reused that stale process instead of restarting it, so it ran old code (still inserting `menu_items`/`restaurants` rows without a `type` value) against the already-migrated database, which now requires `type` `NOT NULL`. Killed the stale process; a clean rerun passed 7/7. Not a code defect — an artifact of interactive-tool debugging earlier in this session, not of the TDD implementation itself.

## Review Notes

Output of the `feature-dev:code-reviewer` agent, run against `git diff <red-sha> <green-sha>` (the implementation-only diff):

> ## Review Summary
>
> Reviewing the green-phase diff for task 015 (moving `type` from `MenuItem` to `Restaurant`) against `apps/api/src/routes/*.ts`, `apps/web/src/routes/admin/*.tsx`, `packages/db/src/schema.ts`, `packages/db/migrations/0001_move_type_to_restaurant.sql`, and the associated journal/snapshot files.
>
> I checked the API routes' try/catch/finally + `ERROR_MESSAGES` usage (both `restaurants.ts` and `menu-items.ts` fully conform — validation checks happen before the try block, catch logs structured JSON and returns `{ error }`/500, finally unconditionally calls `await db.$client.end()`). I also diffed the hand-authored migration SQL, `_journal.json`, and the full on-disk `0001_snapshot.json` against `0000_snapshot.json` — the snapshot correctly retains all seven tables and every foreign key, `prevId`/`id` chain correctly, and the enum drop/create ordering matches the column drop/add ordering. The `DEFAULT 'food'` backfill-then-drop-default approach was a pre-planned, human-reviewable part of the task plan, and there's no populated environment at risk (staging/prod Hyperdrive bindings are still placeholders, and the one populated local dev DB was already verified to backfill correctly) — not worth flagging.
>
> ### Important
>
> **RestaurantDetail header: type label renders on its own line, not "next to" the heading (confidence 80)**
>
> `apps/web/src/routes/admin/RestaurantDetail.tsx:55-61` — the wrapping `<div>` had no flex/inline-layout styling and `<h1>` is block-level, so the `<span>` sibling rendered on its own line below the heading rather than beside `{restaurant.name}` as the acceptance criterion calls for. Not caught by any test since `getByRole("heading", { name: restaurantName })`'s accessible name was unaffected, but a real layout miss against a written AC. Suggested wrapping the heading and label in a flex container.
>
> ### Everything else
>
> The rest of the diff — API validation/insertion changes, the `useRestaurants`/`useMenuItems` type migrations, `Restaurants.tsx`'s type `<select>` and list-label placement (correctly a sibling of `<Link>`, which is inline, so no equivalent layout issue there), `testing.ts` seed helper updates, `schema.ts`, the migration SQL, and `docs/architecture.md` — all meet the stated conventions and hold up on inspection.

**Fixed** — see commit `3c06d2e`: wrapped the `<h1>` and type-label `<span>` in a `flex items-baseline gap-1` container so the label renders beside the restaurant name instead of below it. Re-ran the full `test_command`; all 45 vitest tests and 7 playwright e2e tests still pass.
