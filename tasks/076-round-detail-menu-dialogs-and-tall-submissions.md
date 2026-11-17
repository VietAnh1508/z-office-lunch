---
id: 076
title: Round detail — menu items in dialogs, submissions table fills the viewport
status: done
depends_on: []           # ids that must be status: done before this can start
parallelizable_with: []  # informational only; no command consumes this today — execution is always sequential
epic:                    # optional slug -> tasks/epics/<slug>.md; blank for a standalone task
tdd: required            # required | exempt (exempt is only for one-time scaffolding done outside the /plan-task -> /implement-task loop)
test_command: "pnpm test -- apps/web/src/routes/admin/RoundDetail.test.tsx"
created: 2026-11-17
---

## Goal

On the admin round detail page, replace the two collapsible Food/Drink item cards with two buttons that open the item checklist in a dialog, and let the Submissions table take the available viewport height instead of the fixed 384px box. The table was cramped (`max-h-96`) while the page above it grew tall.

## Acceptance Criteria

- [ ] No collapsible Food/Drink cards on the round detail page. Instead, a "Food items" button and a "Drink items" button, each shown only when the round has that restaurant.
- [ ] Clicking a button opens a dialog titled `Food items — <restaurant>` / `Drink items — <restaurant>` with the same checkbox list as before (toggle adds/removes the curated item; checkboxes disabled when the round is not a draft; loading and empty states kept).
- [ ] A long checklist scrolls inside the dialog, not the page.
- [ ] Submissions card stays in its current position (bottom of the page, not moved up).
- [ ] The submissions table's scroll box is sized to the viewport (not `max-h-96`); the sticky header still works.
- [ ] `RoundDetail.test.tsx` and `e2e/round-lifecycle.spec.ts` updated for the new button names; drink-only round has no Food items button.

## Plan

**Decisions**
- Dialog over collapsible: the expanded lists made the page very tall; a dialog keeps the layout fixed. Reuse the existing `@/components/ui/dialog` (already used for `SubmissionEditDialog`).
- Submissions card is **not** moved up (user decision). With the menu cards reduced to a button row, the content above the table is short, so a viewport-based table height fills the screen once scrolled to.
- Change `SubmissionsTable` itself — `RoundDetail` is its only caller (checked with grep).

**Files touched**
- `apps/web/src/routes/admin/RoundDetail.tsx` — remove `CollapseToggle`, `foodItemsOpen`/`drinkItemsOpen`, the `Collapsible*`/`ChevronDown`/`cn` imports if now unused, and the two collapsible `Card`s in the `sm:grid-cols-2` grid. Add a small component (e.g. `MenuItemsDialog({ title, trigger label, children })`) that renders a `Button` trigger and a `DialogContent` with a scrollable body (`max-h-[60svh] overflow-auto`). Keep `renderMenuItemList` and its checkbox ids/labels. Place the buttons in a simple row (a Card or plain flex row — implementer's call).
- `apps/web/src/routes/admin/SubmissionsTable.tsx` — replace `max-h-96` on the scroll wrapper (line 40) with a viewport-based height, e.g. `max-h-[calc(100svh-<offset>)]`. Offset covers the app header, page padding and card header; pick it by looking at `pnpm dev:hot` (`:5173`), not by guessing. Keep `overflow-auto` and the sticky `thead`.
- `apps/web/src/routes/admin/RoundDetail.test.tsx` — helper at line 46 (`Expand ${label}`) and lines 406, 813–815 move to the new buttons/dialog.
- `e2e/round-lifecycle.spec.ts` — lines 53, 105, 186–187 click the new buttons, then act inside the dialog.

**Gotchas**
- Tests find the checklist by label text. Radix dialog content only mounts when open, so the tests must click the button first (same as the old Expand step). Existing assertions on checkbox state should still work once the dialog is open.
- Dialog title keeps the `Food items — <restaurant>` text; line 406's `findByText("Drink items", { exact: false })` may now match both the button and the title — tighten that query to a role query.
- jsdom can't check layout, so the table height is verified by hand in the browser; record that in the Implementation Log.

**TDD**: first commit changes the tests to expect the new buttons/dialog (fails against the collapsibles), then implement.

## Implementation Log

(Filled in by /implement-task.)

- red commit: e72766f — `pnpm test -- apps/web/src/routes/admin/RoundDetail.test.tsx` -> 7 failing
- green commit: 336d0f4 — same command -> all passing (600 tests); swapped the collapsibles for `MenuItemsDialog` buttons, table box `max-h-[calc(100svh-14rem)]`
- fix commit: b6a7a6c — e2e: keep the dialog open through the manual curate steps; `pnpm test:e2e` -> all passing
- Not verified in a browser: the `14rem` offset for the table height (jsdom can't check layout). Eyeball it in `pnpm dev:hot` and tune if the card runs past the bottom of the screen.

## Plan Deviations

- The Submissions card position was changed from the first draft of the plan: the user said not to move it up, so it stays at the bottom (already reflected in the Plan above).
- First e2e edit pressed Escape right after opening the food dialog, which closed it before the manual opt-out/opt-in steps; found by the reviewer and the e2e run, fixed in the fix commit.

## Review Notes

Reviewer (feature-dev:code-reviewer):
- Important (~90%): the e2e test "admin curates a round's menu items…" would fail because Escape closed the dialog before the checkbox steps. Fixed (fix commit). Reviewer also said to close the dialog before clicking "Open" — already done.
- Checked and fine: `components/ui/collapsible.tsx` still used by `BrowseRounds.tsx`; no unused imports; no `.claude/rules` conflicts.
- Not acted on: missing `DialogDescription` on the new dialog (reviewer unsure it matters; the existing edit-submission dialog has none either).
