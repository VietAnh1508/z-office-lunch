---
id: 006
title: Rounds - create, list, get
status: approved
depends_on: [003, 005]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin creates a round tying together a required food restaurant, an optional drink restaurant, and a deadline. Always starts life as `draft` — opening it for submissions is a separate, explicit action (task 007), not implied by creation.

## Acceptance Criteria

- [ ] `POST /api/rounds` (`label`, `foodRestaurantId` required, `drinkRestaurantId` optional, `deadline`) — `status` is always `draft` on creation regardless of `deadline` value
- [ ] `foodRestaurantId` referencing a nonexistent restaurant returns 400/404; `drinkRestaurantId` omitted is valid
- [ ] `GET /api/rounds` and `GET /api/rounds/:id`
- [ ] `/admin/rounds` screen: list + create form, restaurant pickers backed by the `GET /api/restaurants` list from task 003

## Plan

1. `apps/api/src/routes/rounds.ts`, mounted at `/api/rounds`.
2. TDD units: valid POST creates a `draft` round; missing/invalid `foodRestaurantId` rejected; `drinkRestaurantId` optional; `GET` list/detail return created rounds.
3. UI: `apps/web/src/routes/admin/Rounds.tsx` (list + create form with restaurant `<select>`s and a deadline datetime input).

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
