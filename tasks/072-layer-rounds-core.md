---
id: 072
title: Layer the rounds core module
status: approved
depends_on: [071]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/rounds"
created: 2026-11-06
---

## Goal

Move the rounds CRUD and lifecycle endpoints out of `routes/rounds.ts` (1024 lines) into controller/service/repository, and start splitting `rounds.test.ts` (3199 lines) by feature.

## Acceptance Criteria

- [ ] `modules/rounds/{controller,service,repository}.ts` own `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/status`. The remaining rounds endpoints still work from `routes/rounds.ts` (mounted on the same `/api/rounds` path) until tasks 073-075.
- [ ] The deadline parse and the restaurant existence/type check, duplicated between POST (`:74`, `:99-123`) and PATCH (`:445`, `:475-499`), exist once.
- [ ] Service owns: draft-only edit/delete, status state machine (open preconditions, close and revert require open), "another round is open" 409, auto-curation on create and on restaurant change. The PATCH transaction (`:504-578`) is one service method that calls repository functions with a `tx`.
- [ ] A minimal `modules/submissions/repository.ts` is created with `clearSubmissionRefs` (nulls submission food/drink refs for given round menu items; it writes `submissions`, so that repository owns it). It replaces the inline copy in the PATCH path; task 073 reuses it and 075 grows the file.
- [ ] Error-check order preserved: label -> food parse -> deadline -> drink parse -> "needs a restaurant".
- [ ] Mount order in `index.ts`: the old `routes/rounds.ts` router is mounted BEFORE the new rounds controller, so `GET /public` (still in the old file) is not swallowed by the new `GET /:id`. A test (or existing public-route test) proves `GET /api/rounds/public` still works. Do not use a `:id{[0-9]+}` regex constraint - it would swap the handler's JSON 404 for Hono's default not-found.
- [ ] Tests for create+curation, status transitions, delete+update (including auto-curation on restaurant change) moved out of `rounds.test.ts` into per-layer files under `modules/rounds/`, none over ~400 lines. Full `pnpm test` and `pnpm test:e2e` pass.

## Plan

Gotchas from exploration: `inserted!.id` (`:138`) non-null assertions; both POST and PATCH do multi-step transactions - a rollback throws and must still fall into the controller's 500 path; the open-round check is a check-then-set race (leave as is). Cross-domain reads (restaurants, menu items) go through those modules' repositories, not services.

Mounting: both the new `modules/rounds` controller and the old `routes/rounds.ts` are mounted under `/api/rounds` in this interim, old router first (see criteria). Run the full rounds suite after wiring, before deleting anything.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing HTTP tests for this feature word for word into `modules/rounds/*controller*.test.ts` files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

Files: `modules/rounds/*`, `modules/submissions/repository.ts`, trimmed `routes/rounds.ts`, `index.ts`, split tests.

## Implementation Log

## Plan Deviations

## Review Notes
