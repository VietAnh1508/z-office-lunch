---
id: 007
title: Curate round menu items + open/close status transitions
status: in_review
depends_on: [006]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin picks which of a restaurant's active menu items are actually offered for this round, then explicitly opens it for submissions (and can close it early). This is where the two invariants `docs/architecture.md` calls out as app-layer (not DB constraints) get enforced: only one round open at a time, and a round can't open with nothing to order.

## Acceptance Criteria

- [x] `POST /api/rounds/:id/menu-items` (`menuItemId`) adds a `RoundMenuItem`; rejects if the item's `restaurantId` doesn't match the round's `foodRestaurantId`/`drinkRestaurantId`
- [x] `DELETE /api/rounds/:id/menu-items/:id` removes a curated item
- [x] `PATCH /api/rounds/:id/status` with `{ status: "open" | "closed" }`:
  - opening rejects (400) if zero curated food items exist
  - opening rejects (409) if another round is already `status: "open"`
  - closing an `open` round succeeds; closing a `draft` round is rejected (nothing to close)
- [x] Round detail screen: checkbox-style curation UI over the restaurant's active menu items, Open/Close buttons reflecting current status

## Plan

1. Extend `apps/api/src/routes/rounds.ts` with the curation and status-transition routes.
2. TDD units (this task carries the most business logic — keep each rule its own test): mismatched-restaurant item rejected; open-with-zero-food-items rejected; open-while-another-round-open returns 409; close-a-draft rejected; close-an-open succeeds.
3. UI: extend `apps/web/src/routes/admin/Rounds.tsx` (or a new `RoundDetail.tsx`) with curation checkboxes and status buttons.

## Implementation Log

- red commit: `18fc387` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 12 failing (4 of the 16 new tests passed incidentally, since they expect a 404 that Hono's unmatched-route default already produced)
- green commit: `2861e54` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (108/108 tests, typecheck and web build clean)

Also added, beyond the strict red/green diff: `pnpm lint` clean on touched files, and a new Playwright e2e spec (`e2e/admin-round-detail.spec.ts`, not gated by `test_command` but run manually) covering the full curate → open → close flow through the real UI.

## Plan Deviations

- Added a `GET /api/rounds/:id/menu-items` route and a `roundMenuItems.id`-keyed `DELETE` (rather than a `menuItemId`-keyed one). Neither is spelled out in the Acceptance Criteria, but the curation UI needs to know which items are already curated to render checkbox state, and the codebase's existing convention (`menu-items.ts`'s `PATCH /:id/menu-items/:itemId`) keys the trailing path segment on the entity's own id, not a foreign key — so `DELETE /:id/menu-items/:itemId` deletes by `round_menu_items.id`, matching that pattern.
- Added a 409 "already curated" check on `POST /:id/menu-items` (`ERROR_MESSAGES.roundMenuItemAlreadyCurated`) to avoid a bare unique-constraint 500 if the same item is curated twice — not in the AC, but cheap insurance given the checkbox UI could otherwise double-fire.
- `useMenuItems` (`apps/web/src/routes/admin/useMenuItems.ts`) needed an `activeOnly` param and an `enabled` guard added for this task's round-detail screen (only active items should be curatable, and a round without a drink restaurant must not fetch `/restaurants/0/menu-items`). Extended its query key and `invalidateQueries` calls to cover both the plain and active-only variants rather than duplicating the hook.
- `api.patch` (`apps/web/src/lib/api.ts`) only supported a bodyless PATCH before this task (used for the two existing toggle-active endpoints); extended it to take an optional body for the new `PATCH /rounds/:id/status` call, and added `api.delete` (didn't exist yet — no route had used DELETE before this task).
- Wrote a Playwright e2e spec since the round-detail screen is fully user-facing. While writing it, hit two of my own bugs the unit tests didn't catch: (1) I initially skipped waiting for the restaurant-detail page's heading before filling its form after a client-side nav, which raced the SPA's route transition and filled/lost the value before the click registered — fixed by adding the same `await expect(heading).toBeVisible()` wait the existing `admin-restaurant-detail.spec.ts` already uses; (2) I used Playwright's `.check()` on the curation checkbox, which clicks then immediately asserts checked with no retry — but this checkbox has no optimistic update, so it visually reverts to unchecked for the ~1 request round-trip before the query invalidation refetches and re-checks it, so `.check()` saw the click "not change its state." Switched to `.click()` + a separately-polling `expect(...).toBeChecked()`, which tolerates that latency. The revert-then-recheck flicker itself is still present for real users; didn't add optimistic updates since no other mutation in this codebase does either (see `useToggleMenuItemActive`/`useToggleEmployeeActive`) and the task didn't call for a UX change there.
- While confirming the above, found `e2e/admin-nav.spec.ts` already fails against a stock `main` checkout (unrelated to this task) — it asserts an `<h1>Employees</h1>` heading, but `Employees.tsx` currently renders "Employees" only as a `CardTitle` (a `<div>`), not a heading. Verified via a clean `git worktree` of `main` before touching anything on this branch. Left as-is — out of scope for this task, and `test_command` doesn't run `test:e2e` anyway — but flagging here since nothing else records it.

## Review Notes

### Review Scope

Reviewed the red→green diff for task 007 (`tasks/007-round-curation-and-status.md`), covering the four new round-menu-item/status routes in `apps/api/src/routes/rounds.ts`, the new `apps/web/src/routes/admin/RoundDetail.tsx` screen, `useRoundMenuItems.ts`, the additions to `useRounds.ts`/`useMenuItems.ts`, the `api.ts` extension, and `e2e/admin-round-detail.spec.ts`.

### Result: no high-confidence (≥80) issues found

I checked bug potential (TOCTOU race on the "only one round open" invariant, curation not gated on round status, FK-restrict risk on deleting a curated item referenced elsewhere, a curated-then-deactivated item silently still counting toward the open check) and none clear the bar — they're either the codebase's established select-then-write pattern elsewhere (not a regression introduced here), scope creep beyond the stated Acceptance Criteria, or reach into functionality (`submissions`, public round view) that doesn't exist yet in this repo.

### Convention adherence — verified compliant

- **DB error handling** (`.claude/rules/api-error-handling.md`): all four new handlers in `apps/api/src/routes/rounds.ts` — `POST /:id/menu-items`, `GET /:id/menu-items`, `DELETE /:id/menu-items/:itemId`, `PATCH /:id/status` — wrap their queries in try/catch/finally, log structured JSON via `console.error` on catch, return `{ error }` with 500, and call `await db.$client.end()` in `finally` (never `waitUntil`).
- **Error messages** (`apps/api/src/lib/errors.ts`): all eight new error strings (`menuItemIdRequired`, `roundMenuItemMismatch`, `roundMenuItemAlreadyCurated`, `roundMenuItemNotFound`, `roundStatusInvalid`, `roundOpenNoFoodItems`, `roundOpenAnotherOpen`, `roundCloseNotOpen`) were added to `ERROR_MESSAGES`; nothing is inlined in the new routes.
- **Mutation feedback** (`.claude/rules/mutation-feedback.md`): toasts are wired inside the hooks' own `onSuccess`/`onError` in `apps/web/src/routes/admin/useRoundMenuItems.ts` and `useRounds.ts`; `RoundDetail.tsx` call sites use bare `mutate(x)`, never `mutateAsync` or a call-site toast. Worth flagging explicitly since it's the one line that reads borderline: `useUpdateRoundStatus`'s `toast.success(round.status === "open" ? "Round opened" : "Round closed")` is a ternary between two static strings, not an interpolation of request/entity data — it can't collide with an unrelated `getByText` the way the rule's rationale warns about, and it mirrors the pre-existing `useToggleMenuItemActive` pattern (`item.active ? "Menu item activated" : "Menu item deactivated"`). Compliant.
- **Required-field validation** (`.claude/rules/form-validation.md`): not applicable — `RoundDetail.tsx` has no text inputs, only checkboxes and status buttons.

### Correctness spot-checks (non-obvious, verified sound)

- The `count(*)::int` aggregate in the `PATCH /:id/status` open-check (`rounds.ts`) has no `groupBy`, so it always returns exactly one row — `!foodItemCount || foodItemCount.count === 0` correctly handles the zero-items case without a missing-row edge case.
- `menuItem.restaurantId !== round.drinkRestaurantId` in the `POST /:id/menu-items` mismatch check is safe even when `drinkRestaurantId` is `null`, since `menuItem.restaurantId` is a non-null integer column and can never equal `null`.
- `menuItemKeys.all(restaurantId)` (`useMenuItems.ts`) is a strict prefix of both the `activeOnly: true` and `activeOnly: false` query-key variants, so the existing `invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) })` calls in `useCreateMenuItem`/`useToggleMenuItemActive` correctly cover the new active-only variant added for the round-detail screen, with no duplicated hook needed.
