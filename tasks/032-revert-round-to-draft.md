---
id: 032
title: Add an open-to-draft revert transition, so admins can fix a live round
status: approved
depends_on: [030, 031]
parallelizable_with: []
epic: open-round-editing
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-21
---

## Goal

Give the admin a way to fix an `open` round's restaurant or curated menu items (e.g. the restaurant reports a mistake, or a dish becomes unavailable) by reverting it to `draft`, editing it with the existing draft-only edit routes (now safe for live submissions per tasks 029-031), and reopening it. Reopening reuses the existing `roundOpenNoFoodItems` check for free, so no separate "don't leave an open round foodless" guard is needed. Accepted trade-off (confirmed with the user): while reverted, the round disappears from the public rounds page and can't accept new submissions, exactly like any other draft round.

## Acceptance Criteria

- [ ] `PATCH /api/rounds/:id/status` accepts `{ status: "draft" }` as a third valid target, alongside the existing `"open"`/`"closed"`
- [ ] Reverting to `draft` requires the round's current status to be `open`; otherwise 400 new `ERROR_MESSAGES.roundRevertNotOpen`. Reverting an already-`draft` round → 400 `roundRevertNotOpen`. Reverting a `closed` round → 400 `roundRevertNotOpen` (closed stays terminal)
- [ ] A successful revert sets `status` to `draft` and returns the updated row, 200 — no other side effects (existing `round_menu_items` and `submissions` rows are untouched by the revert itself; only a subsequent edit, per tasks 030/031, clears anything)
- [ ] The existing `roundOpenNoFoodItems` and `roundOpenAnotherOpen` checks are unchanged and still apply only when the target is `"open"`
- [ ] Admin UI (`RoundDetail.tsx`): a "Revert to draft" button on the Status card, shown only when `round.status === "open"` (alongside the existing "Close" button), behind a confirm dialog whose copy warns that the round will disappear from the public page and stop accepting submissions until reopened
- [ ] Confirming the dialog calls the status-update mutation with `"draft"`; cancelling sends no request
- [ ] `pnpm -r typecheck && pnpm --filter web build && pnpm test` passes

## Plan

### API (`apps/api/src/lib/errors.ts`, `apps/api/src/routes/rounds.ts`)

1. `errors.ts`: add `roundRevertNotOpen: "round is not open"` (reuses the same message text as `roundCloseNotOpen`, which already exists for the same underlying condition on the closing path — not the same key, since it's a different route/action, but consistent language).
2. `rounds.ts`, `PATCH /:id/status`:
   - Widen the initial validation: `status !== "open" && status !== "closed" && status !== "draft"` → 400 `roundStatusInvalid` (unchanged key, now covering a third case).
   - Restructure the `if (status === "open") { ... } else { ... }` branch into three: `"open"` (unchanged body), `"closed"` (unchanged body, still requires `round.status === "open"` → `roundCloseNotOpen`), `"draft"` (new: requires `round.status === "open"` → else 400 `roundRevertNotOpen`).
   - The final `db.update(rounds).set({ status })...` is unchanged — it already just writes whatever `status` was validated.

### Frontend

3. `apps/web/src/routes/admin/useRounds.ts`: widen `useUpdateRoundStatus`'s `mutationFn` parameter type from `"open" | "closed"` to `"open" | "closed" | "draft"`. Its `onSuccess` toast is already conditional on `round.status === "open" ? "Round opened" : "Round closed"` — add a third branch, e.g. `round.status === "draft" ? "Round reverted to draft" : ...`.
4. `apps/web/src/routes/admin/RoundDetail.tsx`: in the Status card's `round.status === "open"` block (~line 301), add a destructive "Revert to draft" button next to "Close", using the same uncontrolled trigger-based `AlertDialog` pattern as the existing Delete-round dialog (~lines 314-341) — title e.g. "Revert to draft?", description warning it will disappear from the public page and block new submissions until reopened. `AlertDialogAction`'s `onClick` calls `updateRoundStatus.mutate("draft")`.

### Tests

5. API (`apps/api/src/routes/rounds.test.ts`, extend the round-status describe block):
   - `PATCH /:id/status` with `{ status: "draft" }` on an `open` round → 200, row's `status` is `"draft"`.
   - Same on a `draft` round → 400 `roundRevertNotOpen`.
   - Same on a `closed` round → 400 `roundRevertNotOpen`.
   - A revert followed by re-opening the same round still enforces `roundOpenNoFoodItems` if curation was emptied out in between (proves the existing open-time guard composes with the new transition with no extra code).
6. Frontend (`apps/web/src/routes/admin/RoundDetail.test.tsx`):
   - "Revert to draft" button renders only for an `open` round, absent for `draft`/`closed`.
   - Clicking it opens the confirm dialog; confirming fires the status-update mutation with `"draft"` and shows the success toast.
   - Cancelling the dialog sends no request.

## Implementation Log

## Plan Deviations

## Review Notes
