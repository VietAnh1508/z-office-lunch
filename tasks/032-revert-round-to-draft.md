---
id: 032
title: Add an open-to-draft revert transition, so admins can fix a live round
status: in_review
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

- Red commit `b062bf0`: added 2 API tests (open→draft revert 200; revert+reopen still enforcing `roundOpenNoFoodItems`) and 4 frontend tests (Revert button visibility for open/closed, confirm-and-revert, cancel-sends-no-request) to `apps/api/src/routes/rounds.test.ts` and `apps/web/src/routes/admin/RoundDetail.test.tsx`. Also added 2 API tests for draft/closed rounds rejecting the revert with 400 — these passed immediately since the pre-existing `roundStatusInvalid` check already rejected `"draft"` as an unrecognized status value, but are kept as explicit coverage of the final `roundRevertNotOpen` behavior once `"draft"` becomes a recognized target. `pnpm test -- apps/api/src/routes/rounds.test.ts apps/web/src/routes/admin/RoundDetail.test.tsx` → 4 failing (the 2 API 400-rejection tests and 2 of the frontend visibility tests passed trivially pre-implementation as noted; the genuinely new-behavior tests — open→draft 200, revert+reopen composition, confirm-dialog revert, cancel-dialog — failed as expected).
- Green commit `5559d06`: widened `PATCH /:id/status`'s valid-status check to include `"draft"`, added a `roundRevertNotOpen` branch requiring `round.status === "open"`, added `ERROR_MESSAGES.roundRevertNotOpen`. Widened `useUpdateRoundStatus`'s mutation type and success toast to a third `"draft"` case. Added a "Revert to draft" destructive button + `AlertDialog` on `RoundDetail.tsx`'s Status card, shown only for `round.status === "open"`, following the existing Delete-round dialog pattern. Also updated `ERROR_MESSAGES.roundStatusInvalid`'s text to mention `draft` (flagged by the code-reviewer agent — see Review Notes — and folded into this commit before pushing). `pnpm -r typecheck && pnpm --filter web build && pnpm test` → all 304 tests passing.
- `pnpm lint` → clean (3 pre-existing `react(only-export-components)` warnings in files this task didn't touch).

## Plan Deviations

None — implementation followed the Plan section as written.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the red→green diff.

**Important — fixed**: `ERROR_MESSAGES.roundStatusInvalid` still read `"status must be open or closed"` even though the same diff widened the validation to accept `"draft"` too, so an invalid-status client error would have understated the valid options. Fixed by changing the message to `"status must be open, closed, or draft"` and folding the fix into the green commit before pushing.

Not flagged as issues (reviewer checked, judged non-issues or below the confidence bar):
- `roundRevertNotOpen` duplicates `roundCloseNotOpen`'s exact string (`"round is not open"`) — consistent with existing precedent in the same file (e.g. `roundNotOpenForSubmission`, `roundDeleteNotDraft`/`roundEditNotDraft`).
- Close and Revert-to-draft render as two sibling `variant="destructive"` buttons — minor UX overlap, not covered by any project guideline.
- The new `round.status === "open"` JSX block is a separate conditional from the existing Close button's block rather than merged — cosmetic only.

Reviewer also explicitly checked whether the new `open → draft → edit` path could resurrect the task-031 submission-nulling bug; it can't, since `PATCH /rounds/:id`'s `clearAffectedSubmissions` logic already runs on any restaurant change regardless of prior status.
