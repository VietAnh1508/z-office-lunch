---
id: 073
title: Layer the round-menu-items module
status: approved
depends_on: [072]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/round-menu-items"
created: 2026-11-06
---

## Goal

Move the round menu-item curation endpoints (`POST/GET/DELETE /api/rounds/:id/menu-items`) out of `routes/rounds.ts` into their own controller/service/repository module and split their tests out of `rounds.test.ts`.

## Acceptance Criteria

- [ ] `modules/round-menu-items/{controller,service,repository}.ts` own the three endpoints; the old route code is removed.
- [ ] Service owns draft-only curation (`:330`, `:404`) and the DELETE rule that nulls submissions referencing the item (uses `clearSubmissionRefs` from `modules/submissions/repository.ts`, created in 072) in one transaction.
- [ ] `GET` still returns `[]` for a bad id (`:366`), not 404.
- [ ] The "round menu item deletion nulls a referencing submission" tests (`rounds.test.ts` ~2149-2484) and the "round menu items" block (~372-759) move to layer test files under the new module. Full `pnpm test` passes.

## Plan

Fix the `round!.status` non-null assertion (`:404`) only if it can be done without a behavior change visible to tests; otherwise leave and note it. Repository functions take `db | tx`.

Files: `modules/round-menu-items/*`, `routes/rounds.ts` (shrinks), `index.ts` if needed, tests.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing HTTP tests for this feature word for word into controller test files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

## Implementation Log

## Plan Deviations

## Review Notes
