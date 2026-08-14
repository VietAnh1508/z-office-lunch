---
id: 022
title: Public rounds-list API endpoint (open/closed only)
status: in_review
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-14
---

## Goal

Add `GET /api/rounds/public`, a purpose-built public endpoint listing rounds for a future homepage browse view. Returns only `open`/`closed` rounds (drafts never leak), sorted by deadline ascending, with restaurant names already joined so the frontend doesn't need a second request or raw FK ids.

## Acceptance Criteria

- [ ] `GET /api/rounds/public` returns `200` with an array of `{ id, label, status, deadline, foodRestaurantName, drinkRestaurantName }`, `drinkRestaurantName` is `null` (present, not omitted) when the round has no drink restaurant
- [ ] Draft rounds are never included in the response, even when open/closed rounds also exist (allow-list the status via `inArray(rounds.status, ["open", "closed"])`, not a `ne(..., "draft")` deny-list)
- [ ] Route registered between the existing `GET /` and `GET /:id` handlers in `apps/api/src/routes/rounds.ts` — a route added after `/:id` risks Hono matching `/:id` first with `id="public"`; a test asserts `GET /api/rounds/public` returns `200` + an array (not the 404 a shadowing regression would produce)
- [ ] Response array is sorted by `deadline` ascending (server-side `orderBy`, the only sort logic — the frontend consuming this later must not need to re-sort)
- [ ] `foodRestaurantName`/`drinkRestaurantName` come from a join against `restaurants` (two aliases via `alias()` from `drizzle-orm/pg-core`, since both FKs point at the same table) — not raw restaurant ids
- [ ] Food-restaurant join is `innerJoin` (`foodRestaurantId` is `notNull`); drink-restaurant join is `leftJoin` (`drinkRestaurantId` is nullable — must not drop rows without a drink restaurant)
- [ ] No rounds match (e.g. only a draft exists, or table is empty) → `200`, `[]`
- [ ] Unreachable DB → `500` with structured `{ error: ERROR_MESSAGES.internal }` body, following the existing try/catch/finally convention (`.claude/rules/api-error-handling.md`)

## Plan

### `apps/api/src/routes/rounds.ts`

1. Import `alias` from `drizzle-orm/pg-core`.
2. Define two aliases near the top of the file (after imports): `const foodRestaurantAlias = alias(restaurants, "food_restaurant")`, `const drinkRestaurantAlias = alias(restaurants, "drink_restaurant")`.
3. Insert a new `roundsRoute.get("/public", ...)` handler immediately after the existing `roundsRoute.get("/", ...)` (ends around line 98) and before `roundsRoute.get("/:id", ...)` (starts around line 100). Placement is load-bearing — see acceptance criteria.
4. Handler body, wrapped in the standard try/catch/finally:
   ```ts
   const rows = await db
     .select({
       id: rounds.id,
       label: rounds.label,
       status: rounds.status,
       deadline: rounds.deadline,
       foodRestaurantName: foodRestaurantAlias.name,
       drinkRestaurantName: drinkRestaurantAlias.name,
     })
     .from(rounds)
     .innerJoin(foodRestaurantAlias, eq(rounds.foodRestaurantId, foodRestaurantAlias.id))
     .leftJoin(drinkRestaurantAlias, eq(rounds.drinkRestaurantId, drinkRestaurantAlias.id))
     .where(inArray(rounds.status, ["open", "closed"]))
     .orderBy(rounds.deadline);
   return c.json(rows);
   ```
   Log message on failure: `"failed to list public rounds"`.

### `apps/api/src/routes/rounds.test.ts`

Add a new `describe("public rounds list", ...)` block near the existing `describe("public round view", ...)`. Cases (using existing `seedRestaurant`/`seedRound`/`truncateAll` helpers):

1. Seed one draft, one open, one closed round (distinct labels) → `GET /api/rounds/public` returns exactly the open+closed labels, draft's label absent.
2. Seed one open round → assert `res.status === 200` and body is an array (regression guard against `/:id` shadowing).
3. Seed two rounds (open/closed mix) with deadlines in reverse chronological order → assert response array order matches ascending deadline.
4. Seed distinct food/drink restaurants with recognizable names on one round → assert `foodRestaurantName`/`drinkRestaurantName` match names, not ids.
5. Seed a round with `drinkRestaurantId: null` → assert `drinkRestaurantName === null` in the response.
6. No rounds seeded (or only a draft) → `200`, `[]`.
7. Unreachable DB (mirror the existing pattern near `rounds.test.ts:243`) → `500` with `{ error }` body.

## Implementation Log

(Filled in by /implement-task.)

- red commit: `1731aef` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 7 failing (new `public rounds list` tests; all pre-existing tests passing)
- green commit: `cde6a80` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 7 new tests passing, 67/67 in `rounds.test.ts`; 1 pre-existing failure in `apps/web/src/routes/admin/Restaurants.test.tsx` unrelated to this task (see Plan Deviations)

## Plan Deviations

- No e2e spec was added. Step 4 of `/implement-task` calls for one "if the task is user-facing and the project has e2e tooling" — 022 is a backend-only endpoint with no UI surface yet (023, which depends on this task, is where the user-facing homepage and its e2e coverage land), so unit/integration tests via `app.request()` are the full test surface here.
- Added three assertions (`id` is a number, `status`, `deadline` truthy) to the "joins restaurant names" test that weren't spelled out as separate cases in the Plan's test list, to actually pin the full response shape the first acceptance-criteria bullet describes (`{ id, label, status, deadline, foodRestaurantName, drinkRestaurantName }`) rather than only its two name fields.
- While running the full `test_command`, found `apps/web/src/routes/admin/Restaurants.test.tsx:152` already failing on `main` (confirmed via `git stash` + rerun) — the type-filter-dropdown feature from `76a91b4` added a second element labelled "Type", so `getByLabelText("Type", { exact: false })` in the restaurant-create test now matches two elements. Unrelated to this task's files; left untouched here per user decision (asked via `AskUserQuestion`) to track it as a separate follow-up task rather than fold a fix into this PR.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the red→green diff, the full `rounds.ts` file for convention consistency, `.claude/rules/api-error-handling.md`, and `packages/db/src/schema.ts` (confirmed `restaurants` has no soft-delete column and `rounds.deadline` is `notNull`, so the `innerJoin`/ordering choices are safe).

No issues at or above the 80 confidence threshold. Confirmed:
- `GET /public` is registered between `GET /` and `GET /:id`, avoiding `/:id` shadowing.
- `alias()` from `drizzle-orm/pg-core` used for two separate joins against `restaurants`, hoisted to module scope — safe since Drizzle aliases are immutable metadata, not per-request state.
- `innerJoin` on food restaurant, `leftJoin` on drink restaurant, matching FK nullability; `drinkRestaurantName` correctly surfaces as `null` rather than being omitted.
- Status filter is an allow-list (`inArray(rounds.status, ["open", "closed"])`) as required.
- Sorted by `rounds.deadline` ascending.
- Follows the try/catch/finally convention exactly (structured `console.error`, `ERROR_MESSAGES.internal` on 500, `await db.$client.end()` in `finally`).

Sub-threshold note (not a blocking issue): the green commit also strengthens an existing test's assertions (adds `typeof id`, `status`, `deadline` checks to the "joins restaurant names" test) rather than being purely implementation, a minor deviation from a clean red/green split — already called out in Plan Deviations above.
