# Epic: Bulk-add menu items via pasted text

Member tasks: 039, 040, 041. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

## Context

Admins currently add menu items one at a time (single-item form on `RestaurantDetail.tsx`), or via the existing "Generate menu from image" flow (task 038) which extracts names from a photo through a vision model. Neither covers the common case of an admin who already has a text list of item names (copied from a supplier's message, an old spreadsheet, etc.) and wants to paste it in directly rather than re-type each name or take a photo.

This adds a third entry point: a "paste a list" dialog with a large textarea and an "Overwrite current menu items" checkbox, reusing the *existing* bulk-create backend endpoint (`POST /restaurants/:id/menu-items/bulk`, task 035) and review-list UI (`MenuCandidateRow`, task 037/038) that the image-generation flow already built — this is a frontend-only feature, no backend/DB changes.

`GenerateMenuFromImage.tsx`'s candidate-list state (~50 lines: candidates, price errors, add/remove/validate helpers) is needed identically by both flows, so it's extracted into a shared `useMenuCandidates` hook rather than duplicated. The bulk-save success toast (`"Menu items generated"`) is shared by both flows too, so it's renamed to a flow-neutral `"Menu items saved"`.

## Tasks

- **039** — `parseMenuItemNames` (pure line-splitting function: trim, drop blank/whitespace-only lines, CRLF-safe) + a new `Checkbox` UI primitive. No wiring, no dependency on the other two tasks.
- **040** — Extract `useMenuCandidates` from `GenerateMenuFromImage.tsx`'s inline candidate-state logic (existing test suite is the regression safety net) and rename the bulk-save success toast to the flow-neutral `"Menu items saved"`.
- **041** — Depends on 039 and 040: `BulkAddMenuItems.tsx`, the user-facing dialog — paste step (textarea + overwrite checkbox + parse) then review step (reusing `MenuCandidateRow` via the shared hook) — wired into `RestaurantDetail.tsx`'s "Add menu item" card.
