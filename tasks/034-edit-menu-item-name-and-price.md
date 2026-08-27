---
id: 034
title: Edit a menu item's name and price
status: done
depends_on: [004]
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-27
---

## Goal

Let the admin fix a menu item's name or price without deleting and recreating it (which would orphan `RoundMenuItem`/`Submission` rows that reference it by id). Editing is allowed regardless of the item's/restaurant's active state or round curation — items are referenced by id, so edits don't affect past submissions.

## Acceptance Criteria

- [x] `PATCH /api/restaurants/:id/menu-items/:itemId/details` with `{ name, price }` — a new route, separate from the existing bodyless `PATCH /api/restaurants/:id/menu-items/:itemId` toggle-active endpoint (which is untouched):
  - non-integer `:id`/`:itemId` → 404 `menuItemNotFound`
  - missing/blank (untrimmed) `name` → 400 `nameRequired`, checked before the existence lookup (same order as `POST /:id/menu-items`)
  - invalid `price` (via the existing `parsePrice` helper) → 400 `priceInvalid`
  - `price` omitted, `null`, or `""` → clears to `null` (reuses `parsePrice`'s existing normalization — no new logic needed)
  - missing item (scoped by both `restaurantId` and `itemId`) → 404 `menuItemNotFound`
  - success → 200, returns the updated row with trimmed `name`; `active` untouched
  - works the same regardless of the item's/restaurant's `active` state
- [x] Admin UI: each menu item row in a restaurant's "Menu items" list gets an inline "edit" control (pencil icon) next to the existing activate/deactivate toggle, available regardless of active state
  - clicking it swaps name + price to editable, pre-filled inputs (name via `useRequiredField`, price via local state) with Save/Cancel actions
  - Save validates both first; a blank name or an invalid price shows its inline error and sends no request
  - Save on success updates the displayed name/price, shows a success toast, and returns the row to display mode
  - Save on failure shows an error toast and stays in edit mode with the entered values
  - Cancel discards both edits and returns to display mode without any request — including reverting a price to the just-saved value (not the original) if re-opened after a prior successful save
  - price can be cleared back to empty and saved as such

## Plan

### API (`apps/api/src/routes/menu-items.ts`)

Add `PATCH /:id/menu-items/:itemId/details`, placed directly after the existing bodyless `PATCH /:id/menu-items/:itemId` toggle (grouping the two menu-item mutations together, same convention as `employees.ts`). Deliberately a separate route rather than extending the toggle — that handler is a bodyless boolean flip (`active: !existing.active`); overloading it with `name`/`price` fields would conflate two unrelated mutations in one handler. Mirrors task 020's `PATCH /:id/name` on `employees.ts` (kept separate from that route's own bodyless `PATCH /:id` toggle).

Full replace of `{name, price}` — omitting `price` clears it to `null`, reusing the existing `parsePrice` helper (`menu-items.ts:8-21`), which already normalizes `undefined`/`null`/`""` all to `{ok:true, price:null}` (confirmed by reading it — no changes needed to `parsePrice` itself).

Handler order (validate body before fetching, matching `POST /:id/menu-items`'s order):
1. Non-integer `restaurantId` or `itemId` → 404 `ERROR_MESSAGES.menuItemNotFound`.
2. `body.name` missing/blank after `.trim()` → 400 `ERROR_MESSAGES.nameRequired`.
3. `parsePrice(body.price)` invalid → 400 `ERROR_MESSAGES.priceInvalid`.
4. Fetch the item scoped by both `restaurantId` and `itemId` (`and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId))`) → 404 `menuItemNotFound` if missing.
5. `db.update(menuItems).set({ name, price: parsedPrice.price }).where(eq(menuItems.id, itemId)).returning()` → `c.json(row)`, 200.
6. Standard try/catch/finally per `.claude/rules/api-error-handling.md` (structured `console.error`, 500 `internal` on catch, `await db.$client.end()` in finally).

No new `ERROR_MESSAGES` entries needed — reuses `nameRequired`, `priceInvalid`, `menuItemNotFound`.

### Frontend

1. `apps/web/src/routes/admin/useMenuItems.ts`: add `useUpdateMenuItem(restaurantId)`, mirroring `useUpdateEmployeeName` (`useEmployees.ts:54-66`):
   ```ts
   export function useUpdateMenuItem(restaurantId: number) {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (input: { id: number; name: string; price: string | null }) =>
         api.patch<MenuItem>(`/restaurants/${restaurantId}/menu-items/${input.id}/details`, {
           name: input.name,
           price: input.price,
         }),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) });
         toast.success("Menu item updated");
       },
       onError: (error) => toastApiError(error, "Could not update menu item."),
     });
   }
   ```
2. `apps/web/src/routes/admin/RestaurantDetail.tsx`: extract the menu-item `<li>` (currently flat markup in the "Menu items" `Card`, lines 263-309) into a `MenuItemRow` sub-component (non-exported, same file) — needed because `useRequiredField` must be called unconditionally per row, mirroring the `EmployeeRow` extraction from task 020.
   - Default state: unchanged today's row (name + price span, activate/deactivate icon button) plus a new pencil icon button (`Pencil` from `lucide-react`) with `aria-label="Edit menu item"`.
   - Editing state (local `isEditing` state):
     - Name: `Input` wired to `useRequiredField("Name is required.", item.name)`, `aria-label="Menu item name"` — distinct from the existing `"Name"` label used by both the add-item form (`id="menu-item-name"`) and the Details card (`id="restaurant-detail-name"`), avoiding the collision task 026 already had to disambiguate by CSS id.
     - Price: local `price`/`priceError` state seeded from `item.price ?? ""`, with a `validatePrice()` copied verbatim from the add-form's existing logic (`RestaurantDetail.tsx:174-182`) — not extracted into a shared hook (two call sites doesn't justify a new abstraction). New input gets its own id (e.g. `menu-item-edit-price`) and `aria-label="Menu item price"`, distinct from the add-form's `id="menu-item-price"`.
     - Save: validates both (`name.validate()` and `validatePrice()`) first, no request if either fails; on pass, `useUpdateMenuItem(restaurantId).mutate({ id: item.id, name: name.value, price: price.trim() || null }, { onSuccess: () => setIsEditing(false) })`. No local try/catch — the hook's `onError` already toasts.
     - Cancel: `name.reset()` plus an explicit `setPrice(item.price ?? "")` (re-reads the current prop rather than relying on a captured mount-time default, so a save→reopen→cancel sequence reverts to the just-saved value, not the pre-save one) and clears `priceError`; exits edit mode, no request.
     - Save button disabled while the mutation is pending, matching the existing `disabled={toggleActive.isPending}` convention.
3. Because both the add-form's price input and the new edit input now have accessible names containing "price", add `selector: "#menu-item-price"` to the 3 existing add-form Price assertions in `RestaurantDetail.test.tsx` (lines 87, 95, 120) and the 1 in `e2e/admin-restaurant-detail.spec.ts:14`, so they keep targeting the add-form input specifically — the same disambiguation task 026 already did for `"Name"`. Confirmed via grep: `e2e/round-lifecycle.spec.ts` has no Price locator — no change needed there.

### Tests

4. `apps/api/src/routes/menu-items.test.ts` — new `describe("PATCH /:id/menu-items/:itemId/details")` (mirrors the existing toggle/create tests' structure — `seedMenuItem`, `truncateAll` in `beforeEach`):
   - success: updates `name` and `price`, leaves `active` unchanged, 200 with updated row.
   - blank / whitespace-only / missing `name` → 400 `nameRequired`, row unchanged.
   - invalid `price` (negative, non-numeric) → 400 `priceInvalid`, row unchanged.
   - `price` omitted, `null`, and `""` (three separate wire values) → each clears the row's price to `null`.
   - nonexistent item id → 404 `menuItemNotFound`; non-integer `restaurantId`/`itemId` → 404 `menuItemNotFound`.
5. `apps/web/src/routes/admin/RestaurantDetail.test.tsx` — new `describe("Menu item edit")` (mirrors the existing toggle-active tests' MSW pattern, `http.patch` mock):
   - clicking the edit icon shows name/price inputs pre-filled with current values.
   - entering new values and saving calls `PATCH .../menu-items/:itemId/details`, shows updated values in the list, shows the success toast, returns to display mode.
   - saving a blank name shows the inline "Name is required." error, sends no request.
   - saving an invalid price shows the inline price error, sends no request.
   - cancelling reverts to display mode with the original values, sends no request.
   - a failed save (mocked error response) shows the error toast and stays in edit mode.
   - save → reopen edit → cancel reverts to the just-saved value, not the original.
   - the 3-line selector fix on the existing add-form Price assertions (lines 87, 95, 120).
6. `e2e/admin-restaurant-detail.spec.ts` — the 1-line selector fix on the existing Price locator (line 14).

## Implementation Log

- red commit: `f003892` — `pnpm test` -> 11 failing (4 API + 7 frontend, all for the expected reason: route/UI didn't exist yet)
- green commit: `00677f2` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (317 tests); e2e (`admin-restaurant-detail.spec.ts` and the rest of the suite) also passing (11/11)

## Plan Deviations

- The Plan didn't anticipate that the new `MenuItemRow`'s edit-mode "Save" button would collide (same accessible name "Save") with `RestaurantDetailsForm`'s own Save button, which is always rendered on the same page. 5 of the 7 new frontend tests failed after the green implementation for this reason — fixed by scoping those tests' `getByRole("button", { name: "Save" })` queries with `within(row)` rather than querying `screen` directly (the row's own "Cancel" button has no such collision, since `RestaurantDetailsForm` has no Cancel button). No production code changed for this — it's purely a test-scoping fix, landed as part of the green commit alongside the implementation.
- Everything else (API route shape/placement, `useUpdateMenuItem` hook, `MenuItemRow` extraction, aria-label choices, the 3+1 line selector fix for the pre-existing Price locator collision) was implemented exactly as planned.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

I reviewed the unstaged→green diff for task 034 (`PATCH /:id/menu-items/:itemId/details` route, `MenuItemRow` extraction, `useUpdateMenuItem` hook) in `apps/api/src/routes/menu-items.ts`, `apps/web/src/routes/admin/RestaurantDetail.tsx`, `apps/web/src/routes/admin/useMenuItems.ts`, and the updated test file.

I specifically traced the three areas flagged: the `price.trim() || null` clearing logic, the `useRequiredField`/local-price-state interaction (including the reset-closure semantics), and the new route's validation order/scoping. All three check out as correct — details below the findings.

### Findings

**Important — Duplicated price-validation logic instead of reusing/extracting it (confidence 85)**

`apps/web/src/routes/admin/RestaurantDetail.tsx` lines 173-181 (`MenuItemRow`'s `validatePrice`) is a byte-for-byte copy of the pre-existing `validatePrice` at lines 289-297 (the "Add menu item" form, in the same file) — same trim/parse/compare logic, same error string `"Price must be a valid non-negative number."`. This is now the third copy of the identical non-negative-price rule in the codebase (create form, edit row, and the API's `parsePrice` in `menu-items.ts`, which is a separate and appropriate case since it runs server-side).

This is a direct violation of the "search the codebase for existing utilities... before implementing new functionality" principle, and the codebase already has the right shape to fix it: `useRequiredField` (`apps/web/src/hooks/useRequiredField.ts`) is exactly this kind of extraction for the name field. The two copies will drift the next time one is touched (e.g. a decimal-places rule or a max-value check added to one and not the other).

Fix: extract a `usePriceField` hook (or a shared `validatePrice(price): string | null` function) alongside `useRequiredField`, and use it from both the create form and `MenuItemRow`.

**Response:** deliberate, documented tradeoff — not an oversight. The Plan section above explicitly considered and rejected this extraction ("not extracted into a shared hook — two call sites doesn't justify a new abstraction, and it'd be out-of-scope collateral to a working, already-tested form"), the same call the `feature-dev:code-architect` design agent made during `/plan-task`. Leaving unfixed; a `usePriceField` extraction is a reasonable standalone follow-up if a third call site appears.

### Not flagged (checked and correct)

- **`price.trim() || null` (RestaurantDetail.tsx line ~192):** correctly maps `""`/whitespace-only to `null` (clears price), and `"0"` to `"0"` (a valid non-negative price stays a string, not falsy-coerced to null). Matches `parsePrice`'s `null`/`undefined`/`""` → clear semantics on the API side.
- **`useRequiredField("Name is required.", item.name)` + `name.reset()` on cancel:** `reset()` is a fresh closure created every render, so it captures the *current* render's `initialValue` argument (i.e., the latest `item.name` prop), not a value frozen at mount. After a successful save, `invalidateQueries` refetches and re-renders `MenuItemRow` with the new `item.name` before the row can be reopened, so `reset()` on a second cancel correctly reverts to the just-saved value, not the original. Same reasoning applies to the local `price`/`setPrice(item.price ?? "")` in `handleCancel`, which reads the current `item.price` prop at call time. This matches the covered test ("reverts to the just-saved value, not the original, when reopened and cancelled").
- **New route's validation order and scoping** (`apps/api/src/routes/menu-items.ts` lines 120-160): id integer checks → 404, then body name/price validation → 400, then a DB existence check scoped by both `eq(menuItems.id, itemId)` and `eq(menuItems.restaurantId, restaurantId)` → 404, then update by `itemId` alone. This mirrors the existing bodyless `PATCH /:id/menu-items/:itemId` toggle route exactly (same scoping-then-narrow-update pattern) and the `POST` route's validate-then-existence-check ordering. Follows `.claude/rules/api-error-handling.md` fully: try/catch/finally, structured `console.error` JSON, `db.$client.end()` in `finally`, `ERROR_MESSAGES` reuse (no inlined strings).
- **`useUpdateMenuItem`** (`useMenuItems.ts`): static `toast.success("Menu item updated")` in `onSuccess`, `toastApiError` in `onError`, `invalidateQueries` on `menuItemKeys.all` — matches `.claude/rules/mutation-feedback.md` and the sibling `useToggleMenuItemActive`/`useCreateMenuItem` hooks exactly.
- **No `<form>`/`noValidate` wrapper in `MenuItemRow`:** confirmed this mirrors the established `EmployeeRow` pattern (`apps/web/src/routes/admin/Employees.tsx`) byte-for-byte in structure — inline row edits use bare `type="button"` + `onClick`, not a `<form onSubmit>`. Not a violation of `.claude/rules/form-validation.md`, which targets actual `<form>`-based submission flows.
- **Duplicate hardcoded `id="menu-item-edit-price"`** on the price input inside a per-row component: since multiple `MenuItemRow`s can independently enter edit mode, two simultaneously-open rows would render two DOM elements with the same `id`. Checked whether this `id` is load-bearing — it isn't; there's no `<Label htmlFor="menu-item-edit-price">` pairing it, the row uses `aria-label` directly, and `Input` is a plain passthrough with no internal use of `id`. Inert copy-paste residue from the create form's `id="menu-item-price"` + `<Label>` pattern. Real but cosmetic (invalid-HTML-adjacent, not functionally broken) — below the confidence bar to report as a bug, worth a one-line cleanup but not blocking.
