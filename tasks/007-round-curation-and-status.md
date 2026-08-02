---
id: 007
title: Curate round menu items + open/close status transitions
status: approved
depends_on: [006]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin picks which of a restaurant's active menu items are actually offered for this round, then explicitly opens it for submissions (and can close it early). This is where the two invariants `docs/architecture.md` calls out as app-layer (not DB constraints) get enforced: only one round open at a time, and a round can't open with nothing to order.

## Acceptance Criteria

- [ ] `POST /api/rounds/:id/menu-items` (`menuItemId`) adds a `RoundMenuItem`; rejects if the item's `restaurantId` doesn't match the round's `foodRestaurantId`/`drinkRestaurantId`
- [ ] `DELETE /api/rounds/:id/menu-items/:id` removes a curated item
- [ ] `PATCH /api/rounds/:id/status` with `{ status: "open" | "closed" }`:
  - opening rejects (400) if zero curated food items exist
  - opening rejects (409) if another round is already `status: "open"`
  - closing an `open` round succeeds; closing a `draft` round is rejected (nothing to close)
- [ ] Round detail screen: checkbox-style curation UI over the restaurant's active menu items, Open/Close buttons reflecting current status

## Plan

1. Extend `apps/api/src/routes/rounds.ts` with the curation and status-transition routes.
2. TDD units (this task carries the most business logic — keep each rule its own test): mismatched-restaurant item rejected; open-with-zero-food-items rejected; open-while-another-round-open returns 409; close-a-draft rejected; close-an-open succeeds.
3. UI: extend `apps/web/src/routes/admin/Rounds.tsx` (or a new `RoundDetail.tsx`) with curation checkboxes and status buttons.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
