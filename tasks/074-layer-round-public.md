---
id: 074
title: Layer the round-public module
status: approved
depends_on: [073]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/round-public"
created: 2026-11-06
---

## Goal

Move the unauthenticated round endpoints (`GET /api/rounds/public`, `GET /api/rounds/:id/public`) out of `routes/rounds.ts` into a controller/service/repository module and split their tests out of `rounds.test.ts`.

## Acceptance Criteria

- [ ] `modules/round-public/{controller,service,repository}.ts` own both endpoints; old route code removed.
- [ ] Repository holds the reads (open/closed rounds list, restaurants, curated items, size options ordered by `sortOrder, id`); service assembles the response: draft round -> 404, food-less round has no `drinkItems` key (and no food keys), conditional keys unchanged, `price` never exposed.
- [ ] Mount order in `index.ts` is flipped: round-public is mounted BEFORE the rounds controller (and before anything with `GET /:id`), so `GET /public` is matched first. Drop the "old router first" arrangement from 072.
- [ ] "public round view" (~1811-1992), "public rounds list" (~1993-2102) and the drink-only public-view tests (~2947+) moved to per-layer files. Full `pnpm test` passes.

## Plan

Pure read path; repository tests use `seed*` helpers directly, service tests check assembly and 404 rules, controller tests check HTTP contract only. Shape of the response must not change - compare against existing test assertions before moving them.

Files: `modules/round-public/*`, `routes/rounds.ts` (shrinks), `index.ts` if needed, tests.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing HTTP tests for this feature word for word into controller test files (still passing) and adds the new layer tests (failing). Green commit moves the code. Account for every old `it` in the Implementation Log.

## Implementation Log

## Plan Deviations

## Review Notes
