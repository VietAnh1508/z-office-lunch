# Layered API refactor

## Context

`apps/api/src/routes/*.ts` mix HTTP routing, business rules and Drizzle queries in one handler. `rounds.ts` is 1024 lines and `rounds.test.ts` is 3199. Every test goes through `app.request()` against a real Postgres, so nothing tests rules or queries on their own. The goal is a pure refactor (no behavior change) into three layers (controller / service / repository), with tests split to match so no file stays huge.

Decisions: services return the existing `Result` (`lib/result.ts`), no thrown error classes; feature folders `apps/api/src/modules/<feature>/{controller,service,repository}.ts` with tests beside each file; tests split per layer, all against the real test DB.

The layer rules and test-move protocol live in `.claude/rules/api-layers.md`, created by task 067.

## Tasks

- 067 Shared groundwork for the layered API (types, controller helper, test helpers)
- 068 Layer the admin and employees modules
- 069 Layer the menu-item-sizes and size-presets modules
- 070 Layer the menu-items module
- 071 Layer the restaurants module
- 072 Layer the rounds core module
- 073 Layer the round-menu-items module
- 074 Layer the round-public module
- 075 Layer the submissions module and remove routes/
