---
id: 075
title: Layer the submissions module and remove routes/
status: approved
depends_on: [074]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/submissions"
created: 2026-11-06
---

## Goal

Move the submissions endpoints out of `routes/rounds.ts` into a controller/service/repository module, split their tests, and finish by deleting `routes/` and `rounds.test.ts`.

## Acceptance Criteria

- [ ] `modules/submissions/{controller,service,repository}.ts` own `POST /api/rounds/:id/submissions` (upsert), `PATCH /api/rounds/:id/submissions/:submissionId` (admin edit), `GET /api/rounds/:id/submissions?employeeId=`.
- [ ] `parseSubmissionFields` (`:705-822`) is split: body parsing in the controller/validate file; a service function (e.g. `validateSubmissionPicks(round, fields)`) does the DB-backed checks (round menu item ownership, size availability) via repositories.
- [ ] POST enforces open status and deadline (`:848`); admin PATCH skips those gates (two service entry points or an option). Upsert behavior (select then insert/update, no transaction) unchanged.
- [ ] The GET list's 7-alias join stays in the repository and never selects `price` (`:983-1014`); empty result for a bad id is `[]` (`:968`).
- [ ] Remaining submissions tests and `submission-drink-size.test.ts` (469 lines) are moved/split per layer; `routes/` directory and `rounds.test.ts` no longer exist; all former `rounds.test.ts` tests are accounted for in module test files, each under ~400 lines. Full `pnpm test` and `pnpm test:e2e` pass.

## Plan

Gotcha: this is the last task touching `routes/rounds.ts`, so before deleting it confirm nothing else imports from it and that `index.ts` mounts every controller (rounds, round-menu-items, round-public, submissions) on `/api/rounds` in an order that keeps `/public` ahead of `/:id`.

`modules/submissions/repository.ts` already exists from 072 (`clearSubmissionRefs`); grow it rather than creating a new one.

Docs touch: add one short line to `CLAUDE.md`'s "Where things live" pointing at `apps/api/src/modules/<feature>/{controller,service,repository}.ts` and at `.claude/rules/api-layers.md` (created in 067) for the layer rules. Keep it minimal.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing HTTP tests for this feature word for word into controller test files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` from `rounds.test.ts` and `submission-drink-size.test.ts` in the Implementation Log before deleting them.

Files: `modules/submissions/*`, `index.ts`, `CLAUDE.md` (one line); delete `routes/` and its tests.

## Implementation Log

## Plan Deviations

## Review Notes
