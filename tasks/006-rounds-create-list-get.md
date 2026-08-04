---
id: 006
title: Rounds - create, list, get
status: done
depends_on: [003, 005]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin creates a round tying together a required food restaurant, an optional drink restaurant, and a deadline. Always starts life as `draft` — opening it for submissions is a separate, explicit action (task 007), not implied by creation.

## Acceptance Criteria

- [x] `POST /api/rounds` (`label`, `foodRestaurantId` required, `drinkRestaurantId` optional, `deadline`) — `status` is always `draft` on creation regardless of `deadline` value
- [x] `foodRestaurantId` referencing a nonexistent restaurant returns 400/404; `drinkRestaurantId` omitted is valid
- [x] `GET /api/rounds` and `GET /api/rounds/:id`
- [x] `/admin/rounds` screen: list + create form, restaurant pickers backed by the `GET /api/restaurants` list from task 003

## Plan

0. `/admin/rounds` and its placeholder file (`apps/web/src/routes/admin/Rounds.tsx`) already exist as of task 014 — this task replaces the placeholder's body, it doesn't create the route or file fresh.
1. `apps/api/src/routes/rounds.ts`, mounted at `/api/rounds`.
2. TDD units: valid POST creates a `draft` round; missing/invalid `foodRestaurantId` rejected; `drinkRestaurantId` optional; `GET` list/detail return created rounds.
3. UI: `apps/web/src/routes/admin/Rounds.tsx` (list + create form with restaurant `<select>`s and a deadline datetime input).

## Implementation Log

- red commit: `3c1bb1c` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 14 failing (9 API rounds tests + 5 web Rounds tests; all other suites green)
- green commit: `e29c15d` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (83/83)

Implementation:
- `apps/api/src/routes/rounds.ts`: `POST /`, `GET /`, `GET /:id`, mounted at `/api/rounds` in `apps/api/src/index.ts`. `POST` validates `label`/`foodRestaurantId`/`deadline` required, looks up `foodRestaurantId` (404 if missing, 400 if not `type: "food"`), validates optional `drinkRestaurantId` the same way against `type: "drink"`, and always inserts with `status: "draft"` regardless of any `status` sent in the body.
- New `ERROR_MESSAGES` entries in `apps/api/src/lib/errors.ts` for the new validation cases; reused the existing `restaurantNotFound` message for both food/drink FK lookups.
- `apps/web/src/routes/admin/useRounds.ts`: `useRounds`/`useCreateRound`, mirroring `useRestaurants.ts`'s shape (query keys, toast-on-mutation convention).
- `apps/web/src/routes/admin/Rounds.tsx`: replaced the task-014 placeholder body with a create form (label input, food/drink restaurant `<select>`s sourced from `useRestaurants()`, `datetime-local` deadline input) plus a list card showing label/status/restaurant names/deadline.

## Plan Deviations

- The architecture doc (`docs/architecture.md`'s `Round` row) explicitly flagged that `food_restaurant_id` should be validated against `Restaurant.type === "food"` and `drink_restaurant_id` against `"drink"`, noting "task 006 should pick this up." This wasn't spelled out in this task file's own Acceptance Criteria, but I implemented it (400 on a type mismatch) since the architecture doc calls it out by task number as this task's responsibility.
- Kept the pre-existing `<h1 className="text-2xl font-semibold">Rounds</h1>` heading from the task-014 placeholder at the top of the new `Rounds.tsx` body — `AdminLayout.test.tsx` (written for the placeholder) asserts `getByRole("heading", { name: "Rounds" })`, and shadcn's `CardTitle` renders a `<div>`, not a heading, so dropping the `<h1>` in favor of relying on the "Rounds" list `CardTitle` would have silently broken that pre-existing test.
- No abandoned approaches or user corrections mid-task; the plan (route file, TDD units, UI with selects + datetime input) was followed as written.
- The code-reviewer pass (see Review Notes below) caught that the deadline field had hand-rolled its own required-field state instead of using `useRequiredField` per `.claude/rules/form-validation.md`. Fixed by switching it to the hook (same as `label`) and folded the fix into the green commit before recording this review, since the deadline field never had passing behavior to preserve separately.

## Review Notes

Output of the `feature-dev:code-reviewer` agent (run against the `red-commit..green-commit` diff, before the fix below was folded in):

> Reviewed the task 006 implementation: `apps/api/src/routes/rounds.ts`, `apps/api/src/lib/errors.ts`, `apps/api/src/index.ts`, `apps/web/src/routes/admin/Rounds.tsx`, `apps/web/src/routes/admin/useRounds.ts`.
>
> The API route (validation ordering, type-mismatch checks per `docs/architecture.md`, try/catch/finally + `db.$client.end()`, `ERROR_MESSAGES` reuse, `GET /:id` non-integer → 404 matching the `employees.ts` precedent) and the mutation/list-rendering conventions in `Rounds.tsx`/`useRounds.ts` (static toasts, `mutate(input, { onSuccess })` for form reset, `isPending`/`isError && !data` pattern matching `Restaurants.tsx`) all match established project conventions. No bugs found in the backend route logic.
>
> ### Important
>
> **Deadline field bypasses `useRequiredField`, violating `.claude/rules/form-validation.md` — confidence 80**
>
> `apps/web/src/routes/admin/Rounds.tsx` (the `deadline`/`deadlineError` state and the `round-deadline` `<Input>`) hand-rolled exactly what `useRequiredField` already does (empty-string check on submit, error message, clear-on-change, `aria-invalid`), rather than using the hook, despite being marked as a required field (`Deadline *`). `useRequiredField`'s `inputProps` is fully compatible with a `datetime-local` `<Input>`.
>
> Fix: replace the manual state with the hook, same as `label`, and use `deadline.validate()` / `deadline.value` / `deadline.reset()` in `handleSubmit`.
>
> Note: the two `<select>` fields (`foodRestaurantId`, `drinkRestaurantId`) correctly keep manual state — `useRequiredField`'s `onChange` is typed for `HTMLInputElement`, not `HTMLSelectElement`, so it doesn't apply there. That's not a violation.
>
> ### Not flagged (below confidence threshold)
>
> Considered whether `Number(body.foodRestaurantId)` in `rounds.ts`'s POST handler mishandles an explicit empty-string or `null` value (`Number("") === 0`, `Number.isInteger(0) === true`, leading to a 404 "restaurant not found" instead of the intended 400 "foodRestaurantId is required"), noting the drink-restaurant branch explicitly excludes `""`/`null` but the food-restaurant branch does not. Confidence ~50: the only client (`Rounds.tsx`) validates `foodRestaurantId !== ""` before ever calling `mutate`, so this is unreachable through the UI, and no project rule covers body-value numeric coercion — not reported per the confidence bar.

**Resolution:** the "Important" finding was fixed (deadline field now uses `useRequiredField`, folded into the green commit). The unflagged `Number("")` edge case in `foodRestaurantId` parsing was left as-is per the reviewer's own confidence call — it's unreachable through the UI and not covered by a project convention.
