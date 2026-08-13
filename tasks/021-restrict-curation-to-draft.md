---
id: 021
title: Restrict round menu-item curation to draft rounds
status: approved
depends_on: [019]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-13
---

## Goal

`POST /api/rounds/:id/menu-items` and `DELETE /api/rounds/:id/menu-items/:itemId` never check `round.status`, so an admin can currently add or remove curated menu items on an `open` or `closed` round, not just `draft` — silently changing what employees ordered against after a round has closed. Gate both routes (and the admin UI) to `draft` rounds only, matching the guard `PATCH /api/rounds/:id` (task 019) and `DELETE /api/rounds/:id` (task 018) already have. Flagged as a known gap in task 007's review notes; never fixed until now.

## Acceptance Criteria

- [ ] `POST /api/rounds/:id/menu-items` on a round whose `status !== "draft"` → 400 `ERROR_MESSAGES.roundEditNotDraft`, checked right after the round-existence check, before the `menuItem` lookup/mismatch check (same position as `PATCH /:id`'s and `DELETE /:id`'s guards)
  - a mismatched-restaurant `menuItemId` on a closed round still returns `roundEditNotDraft` (not `roundMenuItemMismatch`) — proves the guard runs first
- [ ] `DELETE /api/rounds/:id/menu-items/:itemId` on a round whose `status !== "draft"` → 400 `ERROR_MESSAGES.roundEditNotDraft`, checked right after the existing `roundMenuItems` lookup (so a nonexistent item/round still 404s `roundMenuItemNotFound` exactly as today, unchanged)
- [ ] `GET /api/rounds/:id/menu-items` is unchanged — no status gate (read-only; also backs the public round view for `open`/`closed` rounds)
- [ ] Admin UI (`RoundDetail.tsx`): curated-item checkboxes are `disabled` when `round.status !== "draft"` (visible, but not interactive) — no separate request-side guard needed since a disabled `<input>` doesn't fire `onChange`

## Plan

### API (`apps/api/src/routes/rounds.ts`)

1. `POST /:id/menu-items`: right after the existing `round` fetch, add:
   ```ts
   if (round.status !== "draft") {
     return c.json({ error: ERROR_MESSAGES.roundEditNotDraft }, 400);
   }
   ```
   Reuses `roundEditNotDraft` (not a new key) — identical message text ("round is not draft"), identical underlying rule, per `.claude/rules/api-error-handling.md`'s guidance against re-typing a string a second route also needs.

2. `DELETE /:id/menu-items/:itemId`: this route currently has no round fetch, only the `roundMenuItems` existence check (`existing`, keyed by `id` + `roundId`). After that check confirms `existing` (so a nonexistent item/round still 404s `roundMenuItemNotFound` exactly as today — deliberately not reordered ahead of it, which would change that route's error to `roundNotFound` for a nonexistent round, out of scope here), fetch the round and gate:
   ```ts
   const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
   if (round!.status !== "draft") {
     return c.json({ error: ERROR_MESSAGES.roundEditNotDraft }, 400);
   }
   ```
   The non-null assertion is safe and intentional: `roundMenuItems.roundId` is a non-null FK to `rounds.id`, so once `existing` is found the round is guaranteed to exist — a defensive `round &&` would instead let a (impossible) missing round silently skip the guard.

No change to `GET /:id/menu-items`.

### Frontend (`apps/web/src/routes/admin/RoundDetail.tsx`)

3. `renderMenuItemList` passes `disabled={round.status !== "draft"}` to each curated-item checkbox `<input>`. Checkboxes stay visible for `open`/`closed` rounds (so the admin can see exactly what was curated) but can't be toggled.

### Tests

4. API (`apps/api/src/routes/rounds.test.ts`, extend `describe("round menu items", ...)`):
   - `POST` on an `open` round → 400 `roundEditNotDraft`; same for `closed`.
   - `POST` on a `closed` round with a `menuItemId` from a mismatched restaurant → 400 `roundEditNotDraft` (not `roundMenuItemMismatch`).
   - `DELETE` on an `open` round → 400 `roundEditNotDraft`; same for `closed`; a follow-up `GET` confirms the item is still curated.
   - `DELETE` on a `closed` round with a nonexistent `itemId` → 404 `roundMenuItemNotFound` (not 400).
5. Frontend (`apps/web/src/routes/admin/RoundDetail.test.tsx`):
   - a curated item's checkbox is `disabled` when the round is `open`; same for `closed`.
   - existing draft-round checkbox tests are unaffected (already exercise successful toggling).

Confirmed while planning: `e2e/admin-round-detail.spec.ts` only clicks the curation checkbox while the round is still `draft` (curates, then opens, then closes), so this change doesn't touch that flow — no e2e spec update needed.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
