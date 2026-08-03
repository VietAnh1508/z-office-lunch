---
id: 016
title: Add Sonner toast + wire success/error feedback into restaurant create
status: approved
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-03
---

## Goal

Right now, a successful mutation just silently refetches — no positive feedback — and a failed one (where handled at all) shows a local inline error string per form. This task adds Sonner as the app's toast mechanism and retrofits `useCreateRestaurant`/`Restaurants.tsx` onto it (success + error), establishing the convention (`.claude/rules/mutation-feedback.md`) that task 017 and later tasks (005, 006, 007, 009, 010) copy for their own mutations.

## Acceptance Criteria

- [ ] `sonner` is installed via `pnpm dlx shadcn@latest add sonner`; the generated `apps/web/src/components/ui/sonner.tsx` wrapper has its `next-themes` import/`useTheme()` call removed and passes no `theme` prop (this app has no theme-provider infrastructure, and avoiding `theme="system"` sidesteps `window.matchMedia`, which jsdom doesn't implement by default)
- [ ] `<Toaster position="top-center" />` is mounted once in `apps/web/src/main.tsx` (global) and once in `apps/web/src/test/render.tsx`'s `renderWithProviders` (so component-test toast assertions can find it — Sonner renders via portal)
- [ ] `apps/web/src/lib/toast.ts` exports `toastApiError(error: unknown, fallback: string)`, calling `toast.error(error instanceof ApiError ? error.message : fallback)`
- [ ] `useCreateRestaurant` (`apps/web/src/routes/admin/useRestaurants.ts`): `onSuccess` calls `toast.success("Restaurant added")` in addition to the existing `invalidateQueries`; `onError` calls `toastApiError(error, "Could not create restaurant.")`
- [ ] `Restaurants.tsx`'s local top-level `error` state and its inline `<p>` are removed; `handleSubmit` switches from `await mutateAsync(...)` + try/catch to `mutate(input, { onSuccess: () => { name.reset(); setType("food"); setContactInfo(""); } })` (dropping the try/catch here is required — leaving it would swallow rejections silently, but more importantly the point of moving to `mutate` is that the hook's own `onError` now owns the failure toast, so no local catch is needed)
- [ ] Toast text is static and never interpolates the restaurant's name — `<Toaster />` is now mounted in every component test's render tree, and existing assertions like `getByText("Sushi Spot")` would collide with an interpolated toast like `Restaurant "Sushi Spot" added`
- [ ] A toast fired in one test does not leak into the next (Sonner's toast store is module-level, outside React, so unmounting `<Toaster />` between tests via `cleanup()` doesn't guarantee this) — verified by a test and, if leakage is observed, fixed with whatever isolation mechanism that test reveals is needed (e.g. `toast.dismiss()` in an `afterEach`)
- [ ] `.claude/rules/form-validation.md` is edited (not deleted) to hand off the top-level-error case: field-level validation errors stay inline via `useRequiredField` (unchanged); API/network failure on submit is now a toast — see `.claude/rules/mutation-feedback.md`
- [ ] New `.claude/rules/mutation-feedback.md` (with `paths: apps/web/src/**/*.tsx` — broad, not narrowed to `routes/admin/**`, since tasks 009/010 add mutations on the public submission side later) documents: success toast on every mutation, `ApiError` → error toast via `toastApiError`, static/name-free message wording, and that these calls live in the mutation hook's `onSuccess`/`onError` (not at component call sites)
- [ ] `e2e/admin-restaurants.spec.ts` gains one assertion that the "Restaurant added" toast appears after a successful create
- [ ] Out of scope, unchanged: query-error UI (`Could not refresh restaurants.` at `Restaurants.tsx:93`) and all loading strings stay exactly as they are today

## Plan

### 1. Install and trim Sonner

- `pnpm dlx shadcn@latest add sonner` from `apps/web/`.
- Open the generated `apps/web/src/components/ui/sonner.tsx`; remove `import { useTheme } from "next-themes"` and the `const { theme = "system" } = useTheme()` line; drop the `theme={theme as ToasterProps["theme"]}` prop from the returned `<Sonner>` element. Keep the lucide icon overrides and the `--normal-*` CSS variable `style` block as-is.
- Do not add `next-themes` as a dependency.

### 2. Mount the Toaster

- `apps/web/src/main.tsx`: import `{ Toaster }` from `@/components/ui/sonner`; render `<Toaster position="top-center" />` as a sibling inside `<QueryClientProvider>`, alongside `<BrowserRouter>`.
- `apps/web/src/test/render.tsx`: `renderWithProviders` wraps `ui` in `<QueryClientProvider>` then also renders `<Toaster position="top-center" />` alongside it in the same `render(...)` call, so toast assertions in component tests can find the portal content.

### 3. Shared error-toast helper

- New `apps/web/src/lib/toast.ts`:
  ```ts
  import { toast } from "sonner";
  import { ApiError } from "@/lib/api";

  export function toastApiError(error: unknown, fallback: string) {
    toast.error(error instanceof ApiError ? error.message : fallback);
  }
  ```

### 4. Wire `useCreateRestaurant`

- `apps/web/src/routes/admin/useRestaurants.ts`: import `toast` from `sonner` and `toastApiError` from `@/lib/toast`. In `useCreateRestaurant`'s `useMutation` config, keep the existing `onSuccess`'s `invalidateQueries` call and add `toast.success("Restaurant added")`; add `onError: (error) => toastApiError(error, "Could not create restaurant.")`.

### 5. Retrofit `Restaurants.tsx`

- Remove the `const [error, setError] = useState<string | null>(null);` line and the `{error && <p ...>}` block.
- Rewrite `handleSubmit`:
  ```tsx
  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    createRestaurant.mutate(
      { name: name.value, type, contactInfo: contactInfo || undefined },
      {
        onSuccess: () => {
          name.reset();
          setType("food");
          setContactInfo("");
        },
      },
    );
  }
  ```
- Drop the now-unused `ApiError` import if nothing else in the file references it.

### 6. Tests (red first)

- `Restaurants.test.tsx`: add a test asserting `await screen.findByText("Restaurant added")` after a successful create (extend the existing "adds a restaurant via the create form" test or add a new one). Add a test mocking a `500` on `POST /api/restaurants` and asserting the error toast text (`await screen.findByText("Could not create restaurant.")`) appears, replacing the removed inline-error path — confirmed via `grep` that no existing test currently asserts the literal strings `Could not create restaurant.` or `Could not refresh restaurants.`, so nothing existing breaks.
- Add a small test (or extend one of the above with a second `it`) that fires a toast in one test and asserts it's absent when a fresh `renderWithProviders` mounts in the next `it` — if this fails, add the isolation fix (e.g. `toast.dismiss()`) directly next to it, don't defer.
- Confirm the existing "shows an inline error and does not submit when Name is empty" test (field-level validation, `useRequiredField`) still passes unmodified — it's untouched by this change.
- If mounting `<Toaster />` throws in jsdom on `window.matchMedia`, add a minimal stub for it in `apps/web/src/test/setup.ts` (only if actually needed — verify empirically rather than adding pre-emptively).

### 7. e2e

- `e2e/admin-restaurants.spec.ts`: in the "admin can create a drink restaurant" test (or a new one), add `await expect(page.getByText("Restaurant added")).toBeVisible();` after the "Add restaurant" click.

### 8. Docs

- `.claude/rules/form-validation.md`: replace the sentence about the top-level `error` state being "reserved for API/network failures" with a one-line pointer: that case now goes through the mutation-feedback toast convention, see `.claude/rules/mutation-feedback.md`.
- New `.claude/rules/mutation-feedback.md`:
  ```markdown
  ---
  paths:
    - "apps/web/src/**/*.tsx"
  ---

  # Mutation success/error feedback

  Every `useMutation` gives the user feedback via a Sonner toast, wired into the hook's own
  `onSuccess`/`onError` — not at the component call site:

  - `onSuccess`: `toast.success("<Static message>")` (in addition to any `invalidateQueries` call).
  - `onError`: `toastApiError(error, "<fallback message>")` (`apps/web/src/lib/toast.ts`), which
    surfaces `ApiError.message` when available and falls back to a static string otherwise.

  Toast messages are static and never interpolate entity names or other request data — `<Toaster />`
  is mounted globally (`main.tsx`) and in every component test's render tree (`renderWithProviders`),
  and an interpolated message risks colliding with unrelated `getByText` assertions elsewhere on the
  page (e.g. the created entity's own name rendered in a list).

  Field-level validation errors (`useRequiredField`) are a separate concern and stay inline under the
  field — see `.claude/rules/form-validation.md`. Toasts are for the outcome of the request itself
  (success, or an API/network failure), not for pre-submit validation.

  Component-level call sites use `mutate(input, { onSuccess: () => { /* local side effect, e.g. reset a form */ } })`
  rather than `mutateAsync` + try/catch — the hook's `onError` already owns the failure toast, so a
  local catch would either duplicate it or swallow the rejection silently.

  Established in `apps/web/src/routes/admin/useRestaurants.ts`'s `useCreateRestaurant` — see
  `tasks/016-toast-feedback-restaurant-create.md`.
  ```

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
