---
id: 018
title: Delete a Round (draft only)
status: in_review
depends_on: [007]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-04
---

## Goal

Admin can delete a round they created by mistake, or a stale draft that's no longer needed — but only while it's still `draft`. Once a round moves past `draft` it can accumulate real consequences (curated menu items, submissions), so delete stays restricted to the one status where nothing downstream depends on it yet.

## Acceptance Criteria

- [ ] `roundMenuItems.roundId`'s FK gets `ON DELETE CASCADE` (schema change + generated migration) — `submissions.roundId` and its FKs to `roundMenuItems` stay `NO ACTION`, relying on the existing invariant that a `draft` round never has submissions
- [ ] `DELETE /api/rounds/:id`: deletes a `draft` round (200 + deleted row); rejects with 400 if status isn't `draft`; 404 for a missing or non-integer id
- [ ] Deleting a round with curated menu items also removes those `round_menu_items` rows (via the cascade, not an app-level pre-delete)
- [ ] Rounds list (`/admin/rounds`): a delete action, gated behind a confirmation step, is available on each `draft` round's row only — no trigger rendered for non-draft rows
- [ ] Round detail page: the same delete action (confirmation-gated) is available only when the round is `draft`, and navigates back to the rounds list on success

## Plan

1. **DB** (`packages/db/src/schema.ts`): add `{ onDelete: "cascade" }` to `roundMenuItems.roundId`'s `.references(() => rounds.id, ...)`. Generate the migration with `pnpm db:generate` (diffs against `migrations/meta/`, no DB connection needed — `vitest-global-setup.ts` applies it automatically for tests).
2. **API** (`apps/api/src/routes/rounds.ts`): add `DELETE /:id` after the existing `PATCH /:id/status` handler, same validation order as that route (id shape → 404 via `ERROR_MESSAGES.roundNotFound`, existence → 404, `status !== "draft"` → 400 via a new `ERROR_MESSAGES.roundDeleteNotDraft`, then `db.delete(rounds)...returning()`), wrapped in the standard try/catch/finally (`.claude/rules/api-error-handling.md`). Returns 200 with the deleted row (not 204 — `apps/web/src/lib/api.ts`'s `request()` always calls `res.json()` on an ok response).
3. **Frontend primitive**: add shadcn's `AlertDialog` via `pnpm --filter web exec shadcn add alert-dialog` (none exists yet in `apps/web/src/components/ui/`); revert any incidental changes outside the new component file.
4. **Frontend hook** (`apps/web/src/routes/admin/useRounds.ts`): `useDeleteRound()`, parameterless (id passed at `mutate(id)` time since the list reuses one hook instance across rows) — mirrors `useRemoveRoundMenuItem`'s shape: `onSuccess` invalidates `roundKeys.all` + `toast.success("Round deleted")`, `onError` → `toastApiError(error, "Could not delete round.")`.
5. **Frontend wiring**:
   - `Rounds.tsx`: per row, only when `status === "draft"`, a `Delete` trigger (`Button variant="destructive"`) wrapped in the `AlertDialog` ("Delete this round?" / Cancel / "Delete round"); confirm calls `deleteRound.mutate(round.id)`; per-row pending state via `deleteRound.isPending && deleteRound.variables === round.id`.
   - `RoundDetail.tsx`: same trigger + dialog next to the status buttons, shown only when `status === "draft"`; confirm calls `deleteRound.mutate(round.id, { onSuccess: () => navigate("/admin/rounds") })` (navigation is a local side effect at the call site, not inside the hook, per `.claude/rules/mutation-feedback.md`).
6. **Tests**:
   - API (`rounds.test.ts`, new `describe("round deletion")`): draft round deletes (200, gone from `GET /`); draft round with curated items — cascade removes them, no orphaned `round_menu_items` row; `open`/`closed` round → 400; nonexistent id → 404; non-integer id → 404.
   - Frontend (`Rounds.test.tsx`): draft row shows the trigger, non-draft row doesn't; confirm removes the row + toasts; cancel issues no request; server error shows the error toast.
   - Frontend (`RoundDetail.test.tsx`): trigger present only for `draft`; confirming navigates to `/admin/rounds` + toasts.
   - Note: Radix sets `pointer-events: none` on `<body>` while the dialog is open, which can make `userEvent`'s click-eligibility check reject the confirm click — use `userEvent.setup({ pointerEventsCheck: 0 })` for these tests if that surfaces.

## Implementation Log

- red commit: `2ec6dc8` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 9 failing (4 API round-deletion tests + 5 web tests across `Rounds.test.tsx`/`RoundDetail.test.tsx`; 2 more new API tests and 1 new web test passed incidentally, same pattern task 007 noted for unmatched-route/absent-element assertions)
- green commit: `4097fdd` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (120/120), `pnpm lint` clean on touched files

Implementation:
- `packages/db/src/schema.ts`: added `{ onDelete: "cascade" }` to `roundMenuItems.roundId`'s FK; generated migration `0002_green_imperial_guard.sql` via `pnpm db:generate`.
- `apps/api/src/routes/rounds.ts`: `DELETE /:id` — 404 for bad/missing id, 400 (`ERROR_MESSAGES.roundDeleteNotDraft`) if status isn't `draft`, otherwise deletes and returns the row (200), same try/catch/finally shape as the rest of the file.
- `apps/web/src/components/ui/alert-dialog.tsx`: added via `shadcn add alert-dialog` (first dialog primitive in the repo); CLI touched no other files.
- `apps/web/src/routes/admin/useRounds.ts`: `useDeleteRound()`, mirroring `useRemoveRoundMenuItem`'s shape.
- `apps/web/src/routes/admin/Rounds.tsx` and `RoundDetail.tsx`: `Delete` trigger + `AlertDialog` confirmation, rendered only for `draft` rounds; `RoundDetail`'s confirm navigates to `/admin/rounds` on success.

## Plan Deviations

- Hit and fixed a pre-existing bug in the migration tooling, not part of this task's own scope but blocking it: `drizzle-kit generate` stamped the new migration's journal `when` timestamp with the actual current time, which landed *earlier* than migration `0001`'s `when` (a hardcoded, seemingly-future value). `drizzle-orm`'s Postgres migrator only applies a migration when its `folderMillis` is greater than the last-applied migration's `created_at`, so the new migration silently never ran — `pnpm db:migrate` printed "Migrations applied." on both the dev and test databases with no error, but the FK stayed `NO ACTION` and the cascade test failed with a 500 (FK violation) instead of the expected 200. Found by inspecting `packages/db/migrations/meta/_journal.json`'s `when` values directly and tracing `drizzle-orm`'s `pg-core/dialect.js` migrate logic. Fixed by bumping `packages/db/migrations/meta/_journal.json`'s new entry to `1785855600001` (one ms after `0001`'s value) so it's always treated as newer; re-ran `pnpm db:migrate` and confirmed via `psql \d round_menu_items` that the cascade constraint landed on both databases before re-running the test suite. Nothing in this task's own Plan or Acceptance Criteria needed to change — this was purely an infrastructure gap in how migrations get timestamped, worth a `/retrospective` mention.
- Otherwise the implementation followed the Plan as written; no other deviations, dead ends, or user corrections mid-task.

## Review Notes

Output of the `feature-dev:code-reviewer` agent (run against the red-commit..green-commit diff):

> No submissions route exists yet in `apps/api/src` — confirmed with a grep across the whole directory (no matches at all, not even the schema import). So the "draft round never has submissions" invariant holds trivially today: there is no write path that could attach a submission to any round, draft or otherwise. This isn't a live risk introduced by this diff.
>
> I reviewed `tasks/018-delete-draft-round.md`, `docs/architecture.md`, the three rule files (`api-error-handling.md`, `mutation-feedback.md`, `form-validation.md`), the full `apps/api/src/routes/rounds.ts`, `packages/db/src/schema.ts`, `apps/web/src/routes/admin/useRounds.ts`, `apps/web/src/routes/admin/Rounds.tsx`, `apps/web/src/routes/admin/RoundDetail.tsx`, `apps/web/src/components/ui/alert-dialog.tsx`, and `apps/web/src/lib/api.ts`.
>
> ### Findings
>
> No high-confidence (≥80) issues found. The implementation matches the task's Plan closely and follows established conventions:
>
> - `DELETE /:id` in `apps/api/src/routes/rounds.ts` (lines 227-251) follows the exact validation order and try/catch/finally shape (`db.$client.end()` in `finally`, structured `console.error` on failure) required by `.claude/rules/api-error-handling.md`, matching the pattern in the adjacent `PATCH /:id/status` and `DELETE /:id/menu-items/:itemId` handlers.
> - `ERROR_MESSAGES.roundDeleteNotDraft` added to `apps/api/src/lib/errors.ts` rather than inlined, per convention.
> - `useDeleteRound()` (`apps/web/src/routes/admin/useRounds.ts:56-67`) matches `.claude/rules/mutation-feedback.md`: static `toast.success`/`toastApiError` inside the hook, `invalidateQueries` on success, no interpolated entity names.
> - `RoundDetail.tsx`'s `navigate("/admin/rounds")` on success is correctly a local side effect passed at the `mutate()` call site, not baked into the shared hook — matches the rule's guidance for hooks reused across multiple call sites.
> - The FK cascade (`packages/db/src/schema.ts` `roundMenuItems.roundId` → `onDelete: "cascade"`) and its migration (`0002_green_imperial_guard.sql`) correctly scope the cascade to `round_menu_items` only, leaving `submissions`' FKs at `NO ACTION` as the Acceptance Criteria specifies. There is no submissions write path in the codebase yet, so the "draft round never has submissions" invariant this relies on holds trivially — not a live risk.
> - Delete triggers in `Rounds.tsx` and `RoundDetail.tsx` are gated on `round.status === "draft"` in both places, matching Acceptance Criteria.
> - `AlertDialogAction`/`AlertDialogCancel` in the generated `alert-dialog.tsx` correctly forward `variant`/`size` to the underlying `Button`, so `variant="destructive"` on the confirm action works as used.
>
> ### One informational note (not a finding, confidence too low to score)
>
> The `packages/db/migrations/meta/_journal.json` hand-fix (bumping the new migration's `when` to `1785855600001`, 1ms after `0001`'s hardcoded value) correctly resolves this migration's skip bug, but that base timestamp works out to roughly today's date. The next `drizzle-kit generate` run could plausibly stamp a `when` earlier than that value again and silently reproduce the same skipped-migration bug. This is already flagged in the task's own Plan Deviations as worth a `/retrospective` mention, so it's not a gap in this diff — just worth keeping on the radar for task 019+.
>
> Summary: this passes review. No Critical or Important issues to fix before merge.

**Resolution:** no changes required — the review found no Critical/Important issues.
