---
id: 017
title: Retrofit menu item create + toggle-active onto toast feedback
status: approved
depends_on: [016]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-03
---

## Goal

Apply the toast-feedback convention established in task 016 to the two remaining mutations: `useCreateMenuItem` (which today has the same silent-success/inline-error pattern as restaurant create) and `useToggleMenuItemActive` (which today has *no* feedback of any kind — a failed deactivate/activate is silently swallowed).

## Acceptance Criteria

- [ ] `useCreateMenuItem` (`apps/web/src/routes/admin/useMenuItems.ts`): `onSuccess` calls `toast.success("Menu item added")` in addition to the existing `invalidateQueries`; `onError` calls `toastApiError(error, "Could not create menu item.")`
- [ ] `useToggleMenuItemActive`: `onSuccess` reads the mutation's response (the updated item), not the pre-click row, and calls `toast.success(item.active ? "Menu item activated" : "Menu item deactivated")`; `onError` calls `toastApiError(error, "Could not update menu item.")` — this is the gap-closer, since today this mutation has zero feedback at the call site
- [ ] `RestaurantDetail.tsx`'s local top-level `error` state and its inline `<p>` (for the add-item form) are removed; `handleSubmit` switches from `await mutateAsync(...)` + try/catch to `mutate(input, { onSuccess: () => { name.reset(); setPrice(""); } })`, same shape as task 016's `Restaurants.tsx` change
- [ ] `toggleActive.mutate(item.id)` at the button's `onClick` stays a fire-and-forget call — no local `onSuccess`/`onError` needed there now that the hook handles both outcomes
- [ ] Toast text is static, never interpolates the menu item's name (same reasoning as task 016 — avoids collisions with `getByText(itemName)` assertions)
- [ ] `RestaurantDetail.test.tsx` gains coverage for both the create-item success/error toast and the toggle-active success/error toast (today's toggle test at lines 94-120 only asserts the DOM state change, not any feedback — this is new coverage, not a rewrite)
- [ ] `e2e/admin-restaurant-detail.spec.ts` asserts the "Menu item added" toast after adding an item and the "Menu item activated"/"Menu item deactivated" toast after the toggle click, waiting for the first toast to clear before the next click (this spec performs three mutations back-to-back on a short, centered page — `position="top-center"` from task 016 plus explicitly waiting avoids the toast overlapping the next actionable button)
- [ ] Out of scope, unchanged: `Could not load menu items.` (`RestaurantDetail.tsx:98`) and all loading strings stay exactly as they are today

## Plan

### 1. Wire `useMenuItems.ts`

- Import `toast` from `sonner` and `toastApiError` from `@/lib/toast`.
- `useCreateMenuItem`: add `toast.success("Menu item added")` alongside the existing `invalidateQueries` in `onSuccess`; add `onError: (error) => toastApiError(error, "Could not create menu item.")`.
- `useToggleMenuItemActive`: change `onSuccess` to `onSuccess: (item) => { queryClient.invalidateQueries(...); toast.success(item.active ? "Menu item activated" : "Menu item deactivated"); }`; add `onError: (error) => toastApiError(error, "Could not update menu item.")`.

### 2. Retrofit `RestaurantDetail.tsx`

- Remove the `const [error, setError] = useState<string | null>(null);` line and the `{error && <p ...>}` block for the add-item form.
- Rewrite `handleSubmit`:
  ```tsx
  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    createMenuItem.mutate(
      { name: name.value, price: price || undefined },
      { onSuccess: () => { name.reset(); setPrice(""); } },
    );
  }
  ```
- Drop the now-unused `ApiError` import if nothing else in the file references it.
- Leave `toggleActive.mutate(item.id)` at line 116 exactly as a bare call — the hook's own `onSuccess`/`onError` now cover both outcomes.

### 3. Tests (red first)

- `RestaurantDetail.test.tsx`:
  - Extend or add to "adds a menu item via the form without a page reload": assert `await screen.findByText("Menu item added")`.
  - New test: mock a `500` on `POST /api/restaurants/1/menu-items`, assert `await screen.findByText("Could not create menu item.")`.
  - Extend "toggles a menu item's active state": assert `await screen.findByText("Menu item deactivated")` after the first click, and `await screen.findByText("Menu item activated")` after clicking "Activate" again.
  - New test: mock a `500` on `PATCH /api/restaurants/1/menu-items/10`, assert `await screen.findByText("Could not update menu item.")`.

### 4. e2e

- `e2e/admin-restaurant-detail.spec.ts`: after the "Add menu item" click, assert `await expect(page.getByText("Menu item added")).toBeVisible();` and wait for it to become hidden (`await expect(page.getByText("Menu item added")).toBeHidden();`, or an equivalent wait) before clicking "Deactivate". After the "Deactivate" click, assert `await expect(page.getByText("Menu item deactivated")).toBeVisible();`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
