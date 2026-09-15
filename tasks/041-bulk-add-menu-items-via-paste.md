---
id: 041
title: Bulk-add menu items via pasted text
status: in_review
depends_on: [039, 040]
parallelizable_with: []
epic: bulk-paste-menu-items
tdd: required
test_command: "pnpm test -- apps/web/src/routes/admin/BulkAddMenuItems.test.tsx"
created: 2026-09-15
---

## Goal

Give the admin a way to bulk-add menu items by pasting a newline-separated list of names into a dialog, with a checkbox to choose whether it overwrites or appends to the restaurant's current menu — reusing the existing bulk-create endpoint, review UI, and (from tasks 039/040) the parsing utility, `Checkbox` primitive, and shared candidate-state hook.

## Acceptance Criteria

- [ ] A new button on `RestaurantDetail.tsx`'s "Add menu item" card (header, alongside the card title) opens the new dialog. Rendered unconditionally — not gated on an existing menu image or on the restaurant already having items.
- [ ] Dialog paste step: a `Textarea` for pasting item names (one per line), a `Checkbox` + `Label` reading "Overwrite current menu items" (unchecked by default), and a "Parse" button (always enabled, not disabled on empty input).
- [ ] Clicking Parse with only blank/whitespace-only text shows an inline error under the textarea (e.g. "Enter at least one item name.") and stays on the paste step — no dialog transition, no toast.
- [ ] Clicking Parse with valid text runs `parseMenuItemNames` (task 039) and advances to a review step listing one `MenuCandidateRow` per parsed name (price defaults to empty, editable), reusing `useMenuCandidates` (task 040) for row state.
- [ ] Review step lets the admin edit a row's name/price or remove a row, identically to the existing `GenerateMenuFromImage` review step.
- [ ] Review step has a single "Save" button (no override/append branching here — that choice was already made by the checkbox on the paste step, and there is no confirmation step before an overwrite save, per explicit product decision). Save is blocked (mirroring the image flow) if any row has an invalid price.
- [ ] Save calls `useBulkCreateMenuItems(restaurantId).mutate({ mode: override ? "override" : "append", items })` where `items` is `candidates.map(c => ({ name: c.name, price: c.price.trim() }))`.
- [ ] On successful save: dialog closes, and all local state resets (textarea content, checkbox, error, step, candidates) so reopening the dialog starts fresh on the paste step with an empty textarea.
- [ ] Toasts and query invalidation come entirely from the existing `useBulkCreateMenuItems` hook (task 040 already renamed its success toast to be flow-neutral) — no additional toast logic in this component.

## Plan

**Component structure** (`apps/web/src/routes/admin/BulkAddMenuItems.tsx`, props `{ restaurantId: number }`):
- One `Dialog` (not two, unlike `GenerateMenuFromImage`'s `Dialog` + `AlertDialog` pair — that second dialog exists there only for a destructive *confirmation*, which this feature explicitly doesn't have). Content switches on local `step: "paste" | "review"` state.
- Local state: `open` (dialog visibility), `step`, `text` (raw textarea value), `textError: string | null`, `override: boolean`. Plus whatever `useMenuCandidates` (task 040) exposes for the review step.
- `textError` is plain local state with an inline `<p className="text-sm text-destructive">`, **not** `useRequiredField` — that hook's `inputProps.onChange` is typed for `HTMLInputElement`, not `HTMLTextAreaElement`, so it can't be spread onto a `Textarea`. Follow the same local-state pattern `GenerateMenuFromImage.tsx`'s own Price-field validation already uses.
- Parse handler: `const names = parseMenuItemNames(text)`; if `names.length === 0`, set `textError` and return; otherwise clear `textError`, call the candidates hook's seed function with `names`, set `step: "review"`.
- Save handler: run the hook's `validateAllPrices()`; if invalid, stop (errors now shown per-row via `priceErrors`, same as image flow); otherwise call `bulkCreate.mutate({ mode: override ? "override" : "append", items: candidates.map(c => ({ name: c.name, price: c.price.trim() })) }, { onSuccess: () => { setOpen(false); /* reset all local state + hook's reset() */ } })`.
- Dialog `onOpenChange`: closing (via Cancel/overlay/Escape) also resets local state, so a cancelled dialog doesn't leak stale text into the next open.

**Trigger wiring** (`RestaurantDetail.tsx`): import `BulkAddMenuItems`, render `<BulkAddMenuItems restaurantId={restaurant.id} />` in the "Add menu item" `Card`'s `CardHeader`, next to its `CardTitle` — read the current header markup first to match its existing layout (flex/spacing) rather than guessing.

**Test file** (`apps/web/src/routes/admin/BulkAddMenuItems.test.tsx`), same `renderWithProviders` + MSW pattern as `GenerateMenuFromImage.test.tsx`. Only needs a `POST /api/restaurants/1/menu-items/bulk` MSW handler (no GET mock needed — this component never calls `useMenuItems`, since it has no `hasExistingItems` branching). Use `userEvent.setup({ pointerEventsCheck: 0 })` and `user.paste(...)` (not `user.type`) for the textarea, matching the sibling test file's paste-simulation convention. Cover:
- Pasting text with blank lines and CRLF endings → review step shows the correct rows/names.
- Checkbox unchecked → captured request body has `mode: "append"`.
- Checkbox checked → captured request body has `mode: "override"`.
- Blank/whitespace-only paste → inline error shown, stays on paste step.
- Editing a name or removing a row on the review step → reflected in the saved request body.
- An invalid price on a row blocks save (mirror the equivalent test in `GenerateMenuFromImage.test.tsx`).
- Successful save → dialog closes; toast text is whatever task 040 renamed it to (`"Menu items saved"`) — read `useMenuItems.ts` at implementation time to confirm the exact final string rather than assuming.

**Files touched:**
- `apps/web/src/routes/admin/BulkAddMenuItems.tsx` (new)
- `apps/web/src/routes/admin/BulkAddMenuItems.test.tsx` (new)
- `apps/web/src/routes/admin/RestaurantDetail.tsx` (modified — add trigger button)

**No backend/DB changes** — reuses `POST /restaurants/:id/menu-items/bulk` and `useBulkCreateMenuItems` unchanged.

## Implementation Log

- Red: `bfe93cb` — `pnpm test -- apps/web/src/routes/admin/BulkAddMenuItems.test.tsx` → 1 failing suite (module `./BulkAddMenuItems` not found; the expected kind of failure since the component didn't exist yet).
- Green: `76551dd` — `pnpm test -- apps/web/src/routes/admin/BulkAddMenuItems.test.tsx` → 7 passing. Full suite (`pnpm test`) → 368 passing. `pnpm lint` → clean except 3 pre-existing `only-export-components` warnings in unrelated files (`button.tsx`, `badge.tsx`, `SubmissionsTable.tsx`), not touched by this task.

## Plan Deviations

- Trigger placement: used the existing `CardAction` primitive (already established in `Restaurants.tsx`, `RoundList.tsx`, `RoundDetail.tsx` for header-action buttons) inside the "Add menu item" card's `CardHeader`, rather than hand-rolling a flex wrapper as the Plan's phrasing ("read the current header markup first to match its existing layout") suggested might be needed. `CardHeader`'s CSS already switches to a two-column grid when it contains a `CardAction`, so this was a closer fit to the codebase's own convention than improvising spacing classes.
- Used the already-in-scope `restaurantId` (a plain `number`, from `RestaurantDetail`'s route param) as the prop passed to `BulkAddMenuItems`, rather than `restaurant.id` as `GenerateMenuFromImage`'s usage elsewhere in the same file might suggest — `restaurant` is a `Restaurant | undefined` at that point in `RestaurantDetail`'s scope, and `restaurantId` was already used the same way for the sibling `MenuItemRow` in that render. Not a deviation from any acceptance criterion, just an implementation choice the Plan didn't pin down.

## Review Notes

Output of the `feature-dev:code-reviewer` agent, reviewing the red→green diff (`bfe93cb`..`76551dd`):

> Reviewed the diff for task 041 (BulkAddMenuItems.tsx new file + RestaurantDetail.tsx trigger wiring), cross-checked against reused hooks/components, the GenerateMenuFromImage.tsx sibling pattern, the task's acceptance criteria, and the already-committed test file (bfe93cb) to rule out a red/green mismatch.
>
> Result: no issues at or above the 80-confidence bar. This is a clean, low-risk implementation.
>
> Convention compliance:
> - mutation-feedback.md: satisfied. No toast import/call in BulkAddMenuItems.tsx; all success/error feedback comes from useBulkCreateMenuItems' own onSuccess/onError.
> - form-validation.md: satisfied. textError is local state (not useRequiredField, which can't be spread onto a Textarea), matching the precedent in GenerateMenuFromImage.tsx's price-field validation, as called for in the task plan.
>
> Acceptance criteria: all nine bullets in tasks/041-bulk-add-menu-items-via-paste.md are met — unconditional trigger button in CardHeader/CardAction; Parse always enabled; blank/whitespace paste shows inline error and stays on paste step with no toast/transition; valid parse seeds useMenuCandidates and advances to review; review step reuses MenuCandidateRow identically to the image flow; single Save button with no override/append branching there (per the explicit "no confirmation before overwrite" product decision in the plan); Save payload shape matches spec; success path closes dialog and resets all local state including the hook's reset(); no component-level toast/invalidation logic.
>
> Verified the test file's queries (aria-label "Paste menu item names", button names "Bulk-add menu items"/"Parse"/"Save", checkbox name "Overwrite current menu items") match what the component actually renders — no red/green mismatch between the test and feature commits.
>
> Sub-80 items noted but not reported as findings, since they're either pre-existing patterns copied verbatim from the unchanged GenerateMenuFromImage.tsx or explicitly out of scope per the task plan:
> - MenuCandidateRow has no non-empty-name validation before Save (same gap exists in the untouched image-generation flow).
> - Empty price sent as "" rather than omitted (same price.trim() shape already used by the existing bulk-create call site).
> - Brief step-flash back to "paste" during the dialog's close animation (cosmetic; sibling component does the same).
> - No Back/Cancel button on review step and no overwrite confirmation dialog — both explicitly excluded by the acceptance criteria ("no confirmation step before an overwrite save, per explicit product decision").
>
> Recommendation: approve as-is.
