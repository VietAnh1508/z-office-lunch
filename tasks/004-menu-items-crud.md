---
id: 004
title: Menu items under a restaurant (create, list, deactivate)
status: in_review
depends_on: [003, 013]
parallelizable_with: [005]
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin can add food/drink items to a restaurant and retire ones no longer offered, without losing history (`active` flag, never delete) — the pool a round's curated menu (task 007) gets picked from.

## Acceptance Criteria

- [x] `POST /api/restaurants/:id/menu-items` (`type`: `food`|`drink`, `name`, optional `price`) — defaults `active: true`
- [x] `GET /api/restaurants/:id/menu-items?active=true` filters to active items; omitting the query param returns all
- [x] `PATCH /api/restaurants/:id/menu-items/:itemId` toggles `active`
- [x] Creating a menu item under a nonexistent `restaurantId` returns 404
- [x] Restaurant detail screen (`/admin/restaurants/:id`) lists items, add form, and an active/inactive toggle
- [x] `price` is stored and shown in the admin UI only — never a concern yet for other surfaces since none exist until later tasks, but keep the column selection habit in mind for those

## Plan

0. `/admin/restaurants` and its route already exist as of task 014 (`apps/web/src/routes/admin/Restaurants.tsx`, wired in `App.tsx`) — this task's job is a new `/admin/restaurants/:id` route/file, not the existing list screen.
1. Extend `apps/api/src/routes/restaurants.ts` (or a sibling `menu-items.ts` mounted under the same path) with the three routes above.
2. TDD units: created item defaults `active: true`; `?active=true` excludes inactive; item creation under a missing restaurant is 404; `PATCH` flips `active` and is reflected in a subsequent `GET`.
3. UI: `apps/web/src/routes/admin/RestaurantDetail.tsx` — item list (with active toggle), add-item form (type select, name, optional price).
4. Reuse `lib/api.ts` from task 003; no new frontend infra needed.
5. Use `useRequiredField` (task 011, `apps/web/src/hooks/useRequiredField.ts`) for the add-item form's required `name` field instead of the native `required` attribute — see `.claude/rules/form-validation.md`.

## Implementation Log

- red commit: f945aaf — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 3 failing (typecheck fails on missing `RestaurantDetail` module; 3 vitest assertions fail against unimplemented menu-items routes)
- green commit: 07bc93f — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (11 test files, 34 tests); `pnpm exec playwright test` -> all passing (6/6)
- Follow-up (post-review): the `feature-dev:code-reviewer` pass below found three real bugs (unvalidated `price` reaching the numeric column and 500ing on non-numeric input; a JSON numeric `price` silently dropped to `null`; non-numeric `restaurantId`/`itemId` route params reaching Drizzle as `NaN` and 500ing). Added failing tests for all three (red commit 357da58, `pnpm test` -> 4 failing), then fixed (green commit cf59292, `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (11 test files, 38 tests); `pnpm exec playwright test` -> all passing (6/6)).
- Also fixed as part of the same pass: `e2e/admin-restaurant-detail.spec.ts` initially asserted the stored price as `"3.50"`, but the price-validation fix originally re-serialized any valid price through `Number(...).toString()`, which collapses to `"3.5"` — dropping the trailing zero the admin typed. Changed `parsePrice` to keep the original (trimmed) string for string input instead of round-tripping through `Number`, so what the admin types is what gets stored and shown.
- Follow-up (human PR review): reviewer left three notes on the open PR. (1) In practice a restaurant only ever serves food OR drink, so `type` should live on the restaurant, not the menu item — explicitly deferred to a separate task per the reviewer's own instruction, not implemented here (needs its own `/plan-task` pass: schema change, migration, and knock-on effects on the not-yet-built rounds-curation tasks 006-010). (2) Menu item prices should render with Vietnamese thousands separators (`11000` -> `11.000`) instead of the raw numeric string. (3) There was no visual difference between active and inactive items besides small trailing "— inactive" text on an already-small card. Added a new `apps/web/src/lib/format-price.ts` (`Intl.NumberFormat("vi-VN")`, its own unit test) and replaced the text Deactivate/Activate button with an icon-only toggle (`CircleCheck`/`CircleX` from `lucide-react`, emerald for active, muted gray for inactive) plus a strikethrough on inactive item names. Red commit 4eb1c6c (`pnpm test` -> 2 failing: new `format-price.test.ts` module missing, `RestaurantDetail.test.tsx`'s formatted-price and `line-through` assertions failing against the old plain implementation), green commit bbb3c51 (`pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (12 test files, 41 tests); `pnpm exec playwright test` -> all passing (6/6)).
- While verifying the icon-button colors in a real browser (via a throwaway Playwright script, not part of the test suite), `getComputedStyle` sampled immediately after a toggle click read as an unrelated hue (matching `--destructive`/`--foreground` almost exactly) instead of the intended color. Traced this to `transition-all` on the shared `Button` component: the color was mid-CSS-transition at the moment of sampling, not a real bug — a settled read (after the transition completes) confirmed the correct emerald/muted-gray colors. Switched the hover interaction from `hover:text-emerald-700`/`hover:text-destructive` to `hover:opacity-80` anyway, since a resting-color override on a `hover:text-*` class needing to coexist with an animated `transition-all` is exactly the kind of thing that's easy to misjudge from a quick glance — opacity avoids the whole class of ambiguity for a purely decorative hover cue.

## Plan Deviations

- Plan step 1 said "extend `restaurants.ts` (or a sibling `menu-items.ts`)" — went with the sibling file (`apps/api/src/routes/menu-items.ts`), mounted at the same `/api/restaurants` prefix as `restaurantsRoute` via a second `app.route(...)` call in `index.ts`. Confirmed via a real request during the red step that Hono dispatches both mounted sub-apps correctly with no path collision.
- `apps/api/package.json` didn't have `drizzle-orm` as a direct dependency (only transitively via the `db` workspace package), so `import { and, eq } from "drizzle-orm"` failed to resolve under pnpm's strict workspace linking. Added `"drizzle-orm": "^0.45.2"` to `apps/api/package.json` (same version range as `packages/db`) — not called out in the Plan, but a necessary consequence of writing route logic that needs Drizzle's query builder operators directly (the existing `restaurants.ts` route never needed `and`/`eq`, so this dependency gap hadn't surfaced before).
- `PATCH` was implemented as a pure server-side toggle (select current `active`, flip it, update) with no request body, matching the AC's literal wording ("PATCH ... toggles active") and the Plan's "PATCH flips active" — confirmed this reading with the advisor before implementing rather than assuming a `{ active: boolean }` body.
- Used a native `<select>` for the food/drink type field instead of pulling in a shadcn Select component — the repo has no Select component yet, and a two-option field didn't justify introducing Radix's popover-based Select just for this.
- Restaurant name on the detail screen is read from the existing `useRestaurants()` list query (`.find(r => r.id === restaurantId)`) rather than adding a new `GET /api/restaurants/:id` endpoint — avoids a new endpoint for data already cached from the list screen, at the cost of a "not found" state depending on the list query rather than a dedicated lookup.
- Added a link from each restaurant name on `Restaurants.tsx` to its `/admin/restaurants/:id` detail page — not explicit in the AC, but the detail screen is otherwise unreachable through the UI. This required wrapping `Restaurants.test.tsx`'s renders in a `MemoryRouter` (via a new `renderRestaurants()` helper), since `Restaurants.tsx` now uses react-router's `Link` and throws without a router context.
- Also changed `e2e/admin-nav.spec.ts`'s assertion after navigating to Restaurants from `getByText("No restaurants yet.")` to `getByRole("button", { name: "Add restaurant" })` — task 014's reviewer had already flagged that assertion as depending on incidental shared-test-DB state that would flake once a later task's e2e spec created a restaurant, which this task's new `admin-restaurant-detail.spec.ts` now does. Fixed proactively per that reviewer's own suggested fix, rather than letting `admin-nav.spec.ts` go red for an unrelated reason.
- Post-review, briefly considered gating the `useMenuItems` query on the restaurant having been found (`enabled: restaurant !== undefined`) to avoid firing a request for a `NaN` restaurant id at all. Reverted: the backend fix (rejecting non-integer ids before querying) already eliminates the 500, and gating the query made menu items load sequentially after the restaurant lookup instead of in parallel — a real UX regression for the common case (a valid id) to guard against a case that no longer causes an error.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the diff between red commit f945aaf and green commit 07bc93f (the initial implementation, before the post-review fix below).

### Blocking (confidence >= 80)

**1. Unvalidated `price` reaches a `numeric` column — user-facing 500 on the admin form.** (confidence 90)
`price` was accepted as any non-empty string and inserted directly into the Postgres `numeric` column with no format check, on either the API or the `<Input>` in `RestaurantDetail.tsx`. A non-numeric value (`"5,50"`, `"$5.50"`) would hit `invalid input syntax for type numeric` in Postgres, caught by the generic `catch` and surfaced as a 500 `{error: "internal error"}` — a client-input problem masquerading as a server failure, reachable through this task's own UI form.
**Fixed** — see Implementation Log / Plan Deviations: `parsePrice` now validates the value is a finite, non-negative number before insert and returns 400 (`ERROR_MESSAGES.priceInvalid`) otherwise.

**2. Numeric JSON `price` is silently dropped, not stored.** (confidence 80)
Only `typeof body.price === "string"` was accepted; a JSON body with `{"price": 5.5}` (a plausible non-browser caller) fell through to `null` with no error and a `201` response — silent data loss.
**Fixed** — `parsePrice` now accepts both `string` and `number` inputs.

**3. Non-numeric `restaurantId`/`itemId` route params reach the query unvalidated, and this path is hit on every visit to an unknown restaurant.** (confidence 85)
`Number(c.req.param("id"))` produces `NaN` for a non-numeric id, which flowed into `eq(restaurants.id, NaN)` etc. Reviewer noted this is not hypothetical: `RestaurantDetail.tsx` fires `useMenuItems(restaurantId)` before the restaurant-found check resolves, so navigating to `/admin/restaurants/abc` triggered a logged 500 on `GET .../NaN/menu-items` every time (masked from the user only because the "Restaurant not found." branch also renders correctly).
**Fixed** — POST/PATCH now short-circuit to 404 (`restaurantNotFound`/`menuItemNotFound`) and GET returns an empty list, all before any non-integer id reaches a query.

### Notes (below blocking threshold, not acted on)

- `RestaurantDetail.tsx` doesn't distinguish a failed restaurants-list fetch from a genuinely missing restaurant — both render "Restaurant not found." (confidence ~55). Not fixed; out of scope for this task's AC, which only asks for a detail screen, not a fetch-error/not-found distinction.
- PATCH's select-then-update is non-atomic, a theoretical lost-update race under concurrent requests; the toggle button disables during `isPending` so it's not reachable through the UI in practice (confidence ~30). Not fixed.
- `?active=false` isn't distinguished from omitting the param (both return all items) — matches the AC as written, just noting the query string isn't fully self-descriptive (confidence ~20). Not fixed.
- `menuItemKeys.all` is defined but only used via `.list()`, matching the shape of the existing `restaurantKeys` convention (confidence ~10). Not fixed, not actually an issue.

### What passed

Error-handling convention (`try`/`catch`/`finally`, structured `console.error`, `await db.$client.end()` in `finally`) matched `.claude/rules/api-error-handling.md` and the sibling `restaurants.ts` exactly. New error strings were added to `ERROR_MESSAGES` rather than inlined. The frontend name field used `useRequiredField` + `noValidate` + inline error per `.claude/rules/form-validation.md`. `useMenuItems.ts` followed the hooks-per-resource convention (`menuItemKeys`, list `useQuery`, mutations invalidating the list key) matching `useRestaurants.ts`. `price` was hand-typed `string | null` in the frontend rather than importing a Drizzle-inferred type. All queries went through Drizzle's parameterized query builder — no SQL injection surface. The 404 semantics for POST-under-nonexistent-restaurant and PATCH-on-nonexistent-item, and the `?active=true` filter semantics, all matched the AC and the accompanying tests.
