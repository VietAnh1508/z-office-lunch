---
id: 008
title: Public round view (employee-facing read)
status: approved
depends_on: [007]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

The read side of the employee-facing link the admin will share: shows the round's curated food/drink items so an employee can see what's on offer before submitting (submission itself is task 009). A `draft` round must not leak its existence or contents through this endpoint — the admin controls when it becomes visible by opening it (task 007).

## Acceptance Criteria

- [ ] `GET /api/rounds/:id/public` returns round `label`, `deadline`, curated food items, curated drink items — **only** when `drinkRestaurantId` is set (omitted entirely otherwise, not an empty array); no `price` in the response
- [ ] A `draft` round returns 404/403 from this endpoint (not partial/empty data — full non-existence signal)
- [ ] `/r/:roundId` route renders the round info and a read-only view of available items, plus "not open yet" / "deadline passed" / "closed" messaging as appropriate for non-open states reachable after a round transitions

## Plan

1. Add `GET /api/rounds/:id/public` to `apps/api/src/routes/rounds.ts`, selecting only the columns needed (explicit column selection, not `select *`, per the no-price rule).
2. TDD units: `draft` round -> 404/403; `open` round with no `drinkRestaurantId` -> response has no drink section at all; `open` round with a drink restaurant -> drink items included; response never contains a `price` field.
3. UI: `apps/web/src/routes/public/Round.tsx` mounted at `/r/:roundId`, read-only rendering only (submission form lands in task 009).

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
