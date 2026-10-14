---
id: 052
title: Make a round's food restaurant optional in the DB and API
status: approved
depends_on: []
parallelizable_with: []
epic: optional-food-restaurant
tdd: required
test_command: "pnpm test -- apps/api/src/routes/rounds.test.ts"
created: 2026-10-14
---

## Goal

Let a round have no food restaurant, as long as it has a drink restaurant (at least one of the two is required), so drink-only rounds can be created, opened, and submitted to. Backend only; the UIs follow in 053 and 054.

## Acceptance Criteria

- [ ] `rounds.food_restaurant_id` is nullable (schema + new migration `0006_*`); `docs/architecture.md`'s Round row says so and states the at-least-one rule.
- [ ] `POST /api/rounds` and `PATCH /api/rounds/:id` accept a missing/null `foodRestaurantId` when `drinkRestaurantId` is present; 400 with a new `ERROR_MESSAGES` entry when both are absent. Invalid-type / nonexistent food ids still 400/404 as today.
- [ ] Food curation (`insertActiveMenuItems`, `purgeStaleItems`, `clearAffectedSubmissions("food", …)`) is skipped for a null food side on create and update, including food -> none and none -> food changes.
- [ ] `GET /api/rounds/public` lists drink-only rounds (`foodRestaurantName: null`).
- [ ] `GET /api/rounds/:id/public` omits `foodItems`/`foodRestaurant` when the round has no food, like drink today.
- [ ] Opening a round requires at least one curated item on each side that exists (drink-only round opens with only drink items); error message reworded accordingly.
- [ ] Public submit and admin submission PATCH: food item is required only if the round has a food restaurant, rejected if it has none; a drink item is required when the round has no food. Food+drink rounds behave as before (food required, drink optional).
- [ ] Existing tests that asserted food-required are rewritten; new drink-only cases cover create, update, open, public views, and submissions.

## Plan

**Approach:** mirror the existing drink-optional handling at every food call site in `apps/api/src/routes/rounds.ts`; no new helpers beyond what's needed to share the at-least-one check between POST and PATCH.

**First, verify:** how `packages/db/src/vitest-global-setup.ts` builds the test schema (applies migrations vs. pushes the schema) so the new migration is actually exercised by tests.

**DB (`packages/db`)**
- `src/schema.ts:46`: drop `.notNull()` on `foodRestaurantId`.
- Generate the migration with `pnpm --filter db generate` (expect `ALTER TABLE "rounds" ALTER COLUMN "food_restaurant_id" DROP NOT NULL;`; precedent `0005_windy_revanche.sql`).
- `src/testing.ts:75` `seedRound`: `foodRestaurantId` optional / `number | null`.

**API (`apps/api/src`)**
- `lib/errors.ts`: replace `foodRestaurantIdRequired` with a new "a round needs a food or drink restaurant" entry (per `.claude/rules/api-error-handling.md`); reword `roundOpenNoFoodItems`; add a food twin of `submissionNoDrinkRestaurant`; rename/split `foodRoundMenuItemIdRequired` as needed.
- `routes/rounds.ts` (line refs from exploration, may have shifted):
  - POST (~42-110) and PATCH (~374-503): parse food like drink (~58-69); skip food lookup/type check when null; at-least-one check; guard `insertActiveMenuItems` (109, 490), `clearAffectedSubmissions` / `purgeStaleItems` (475-478) with `!== null`. `foodChanged` (434) already works with null.
  - `GET /public` (~147-151): `innerJoin` -> `leftJoin` on the food alias; `foodRestaurantName: string | null`.
  - `GET /:id/public` (~219-234): make food items/restaurant conditional, mirroring the drink spread.
  - Status open (~562-575): `eq(menuItems.restaurantId, null)` generates `= NULL` and counts 0, so a drink-only round could never open. Count per existing side instead.
  - `parseSubmissionFields` (~610-670): return `foodRoundMenuItemId: number | null`; apply the rules from Acceptance Criteria. Callers (public POST, admin PATCH) already write the field into a nullable column (task 029).
- Other routes (`restaurants`, `menu-items`, `employees`, `admin`) don't touch a round's food restaurant. No CSV endpoint exists in the API.

**Tests (`routes/rounds.test.ts`, one big `describe`, `truncateAll` in `beforeEach`)**
- Rewrite: ~233 (POST without food), ~1477 (PATCH non-integer food), ~2196 and ~2756 (submission without food item), ~761 and ~889 (open with zero food items). Keep the wrong-type / nonexistent-id food cases (~247, 265, 1494, 1514).
- Add: create/update drink-only, both-absent 400, food -> none and none -> food on update, open drink-only, public list + public detail for drink-only, submission rules on drink-only and food+drink rounds.

**Open item for the implementer:** a submission with neither item can't happen under these rules (food required when food exists; drink required when only drink exists), so no extra check is needed.

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
