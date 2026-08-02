---
id: 004
title: Menu items under a restaurant (create, list, deactivate)
status: approved
depends_on: [003]
parallelizable_with: [005]
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Admin can add food/drink items to a restaurant and retire ones no longer offered, without losing history (`active` flag, never delete) — the pool a round's curated menu (task 007) gets picked from.

## Acceptance Criteria

- [ ] `POST /api/restaurants/:id/menu-items` (`type`: `food`|`drink`, `name`, optional `price`) — defaults `active: true`
- [ ] `GET /api/restaurants/:id/menu-items?active=true` filters to active items; omitting the query param returns all
- [ ] `PATCH /api/restaurants/:id/menu-items/:itemId` toggles `active`
- [ ] Creating a menu item under a nonexistent `restaurantId` returns 404
- [ ] Restaurant detail screen (`/admin/restaurants/:id`) lists items, add form, and an active/inactive toggle
- [ ] `price` is stored and shown in the admin UI only — never a concern yet for other surfaces since none exist until later tasks, but keep the column selection habit in mind for those

## Plan

1. Extend `apps/api/src/routes/restaurants.ts` (or a sibling `menu-items.ts` mounted under the same path) with the three routes above.
2. TDD units: created item defaults `active: true`; `?active=true` excludes inactive; item creation under a missing restaurant is 404; `PATCH` flips `active` and is reflected in a subsequent `GET`.
3. UI: `apps/web/src/routes/admin/RestaurantDetail.tsx` — item list (with active toggle), add-item form (type select, name, optional price).
4. Reuse `lib/api.ts` from task 003; no new frontend infra needed.
5. Use `useRequiredField` (task 011, `apps/web/src/hooks/useRequiredField.ts`) for the add-item form's required `name` field instead of the native `required` attribute — see `.claude/rules/form-validation.md`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
