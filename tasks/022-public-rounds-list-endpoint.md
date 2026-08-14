---
id: 022
title: Public rounds-list API endpoint (open/closed only)
status: approved
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

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
