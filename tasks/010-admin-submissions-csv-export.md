---
id: 010
title: Admin submissions view + CSV export
status: approved
depends_on: [007, 009]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Closes the loop: admin sees who's submitted what for a round and can export it as a CSV (project-idea.md item 7) — names + dish/drink, `price` excluded, opening cleanly in Excel including with Vietnamese names. Grouped/counted tallies are explicitly deferred (nice-to-have).

## Acceptance Criteria

- [ ] `GET /api/rounds/:id/submissions` returns already-resolved rows (`employeeName`, `foodName`, `foodNote`, `drinkName | null`, `drinkNote | null`) via a join — no raw FKs, no `price`, so the client never does its own joining or has to remember to drop a field
- [ ] Admin round-detail screen shows a submissions table and an "Export CSV" button
- [ ] `apps/web/src/lib/csv.ts` exports a pure `toCsv()` function: properly escapes commas/quotes/newlines in free-text notes, prepends a UTF-8 BOM
- [ ] `toCsv()` has its own Vitest unit test (no DB, no jsdom) — a note containing a comma, a quote, and a newline round-trips correctly; output starts with the BOM byte sequence

## Plan

0. The admin nav/routing shell (`AdminLayout`, `/admin/rounds`) already exists as of task 014 — this task only extends the round-detail screen (added in task 007) with a submissions table and export button, it doesn't need new top-level admin routing.
1. Add `GET /api/rounds/:id/submissions` to `apps/api/src/routes/rounds.ts` — a join across `Submission` → `Employee`, `RoundMenuItem` → `MenuItem` (food and drink), explicit column selection (never `price`).
2. TDD unit: response shape has resolved names, never a `price` field, never raw `*RoundMenuItemId` FKs.
3. `apps/web/src/lib/csv.ts` — `toCsv(rows)` pure function; TDD unit exercises the escaping + BOM cases directly, no DB/network involved.
4. UI: extend the admin round-detail screen with a submissions table and an "Export CSV" button that builds the blob client-side via `toCsv()` and triggers a download.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
