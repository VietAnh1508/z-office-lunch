---
id: 017
title: Retrofit menu item create + toggle-active onto toast feedback
status: in_review
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

- red commit: `ef8e98d` — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> 4 failing (the 4 new/extended toast assertions in `RestaurantDetail.test.tsx`; all other tests and typecheck/build passed)
- green commit: `c319627` — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing (50/50 unit tests, 7/7 e2e tests, typecheck and build clean)
- review-fix commit: `e98db81` — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing (52/52 unit tests, 7/7 e2e tests) — addresses the two "Important" review findings plus the e2e-wait simplification, see Review Notes below

## Plan Deviations

- The Plan's error tests said "mock a 500 on POST/PATCH ... assert `Could not create/update menu item.`" — I first wrote those as `HttpResponse.json({ error: "internal error" }, { status: 500 })`, matching the create-restaurant *known-error* test in task 016. That's wrong for this assertion: a 500 with a JSON `{ error }` body parses into an `ApiError` whose `.message` is `"internal error"`, so `toastApiError` renders `"internal error"`, not the fallback string. The fallback string only appears when the request isn't a well-formed `ApiError` at all (e.g. a network failure). Fixed by switching both new tests to `HttpResponse.error()`, matching the existing *network-error* fallback test pattern in `Restaurants.test.tsx` — this was caught during the green phase (tests still failed after wiring the toasts) and required editing the two red-commit tests before they'd pass, so those edits landed in the green commit alongside the implementation instead of the red commit.
- The Plan's e2e step called for waiting for the "Menu item added" toast to become hidden before clicking "Deactivate", to avoid toast overlap. The code-reviewer agent flagged this as unnecessary (no shared/colliding toast text between the two mutations in this spec, and it hard-couples the test to Sonner's unpinned default duration) — removed per that finding; see Review Notes.
- Everything else (hook wiring, `RestaurantDetail.tsx` retrofit) matched the Plan as written.
- Nothing required user correction or redirect mid-task.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against `.claude/rules/mutation-feedback.md` and `.claude/rules/form-validation.md`, cross-checked with the API route and the prior task's (016) test patterns.

Confirmed correct (no action needed):
- `useToggleMenuItemActive`'s `onSuccess: (item) => ...` reads `item.active` from the mutation response, which is the API's post-update state (`apps/api/src/routes/menu-items.ts` returns the updated row) — the toast announces the correct new state, not the pre-click one.
- No dead code left in `RestaurantDetail.tsx` after removing the `error` state and `ApiError` import.
- `useCreateMenuItem`/`useToggleMenuItemActive` onSuccess/onError shape mirrors the established `useCreateRestaurant` convention; toast messages stay static; call site uses `mutate(input, { onSuccess: ... })` not `mutateAsync`/try-catch.

Findings (both addressed in commit `e98db81`):
- **Important** — Missing test for the `ApiError`-message branch of `toastApiError` for both new call sites: only the network-error fallback branch was covered; task 016 established a separate known-error-message test (`Restaurants.test.tsx`) that this task hadn't mirrored. Fixed: added a known-error (409/404 with JSON `{ error }` body) test for both `useCreateMenuItem` and `useToggleMenuItemActive`.
- **Important** — Form reset after successful create was untested: `name.reset()`/`setPrice("")` moved into `mutate`'s `onSuccess` callback but nothing asserted the inputs actually clear. Fixed: added `toHaveValue("")` assertions for both Name and Price after a successful submit.
- **Minor** — `e2e/admin-restaurant-detail.spec.ts`'s `toBeHidden()` wait for the "Menu item added" toast didn't guard against anything real (no text collision with "Menu item deactivated") and hard-coupled to Sonner's default duration. Fixed: removed.
