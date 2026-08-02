---
id: 009
title: Employee submission
status: approved
depends_on: [008]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

The core employee action: pick your name, pick food (+ optional note) and optionally drink (+ optional note), submit. No edit-after-submit in v1 (project-idea.md item 6 is explicitly deferred) — a duplicate submission for the same round+employee is a hard rejection, not an upsert.

## Acceptance Criteria

- [ ] `POST /api/rounds/:id/submissions` (`employeeId`, `foodRoundMenuItemId`, `foodNote?`, `drinkRoundMenuItemId?`, `drinkNote?`)
- [ ] Rejected if the round's `status !== "open"`
- [ ] Rejected if `now > deadline`, checked independently of `status` (both conditions matter even though in practice closing should happen first)
- [ ] Rejected (409) on a duplicate `(roundId, employeeId)` — matches the schema's unique constraint, no upsert behavior
- [ ] Rejected if `drinkRoundMenuItemId` is provided but the round has no `drinkRestaurantId`
- [ ] `/r/:roundId` gets the actual submission form: employee searchable dropdown (from active employees), food pick + note, drink pick + note (rendered only if the round has a drink restaurant), submit button, success state after submitting

## Plan

1. Extend `apps/api/src/routes/rounds.ts` (or a sibling `submissions.ts`) with `POST /api/rounds/:id/submissions`.
2. TDD units: happy path persists a row; closed/draft round rejected; deadline-passed rejected even if `status` is still `open`; duplicate employee+round is 409; drink fields on a food-only round rejected.
3. UI: extend `apps/web/src/routes/public/Round.tsx` (task 008) with the actual form — employee picker sourced from `GET /api/employees?active=true`, item pickers sourced from the public round data.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
