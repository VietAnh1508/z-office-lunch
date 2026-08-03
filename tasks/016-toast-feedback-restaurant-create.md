---
id: 016
title: Add Sonner toast + wire success/error feedback into restaurant create
status: in_review
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-03
---

## Goal

Right now, a successful mutation just silently refetches — no positive feedback — and a failed one (where handled at all) shows a local inline error string per form. This task adds Sonner as the app's toast mechanism and retrofits `useCreateRestaurant`/`Restaurants.tsx` onto it (success + error), establishing the convention (`.claude/rules/mutation-feedback.md`) that task 017 and later tasks (005, 006, 007, 009, 010) copy for their own mutations.

## Acceptance Criteria

- [x] `sonner` is installed via `pnpm dlx shadcn@latest add sonner`; the generated `apps/web/src/components/ui/sonner.tsx` wrapper has its `next-themes` import/`useTheme()` call removed and passes no `theme` prop (this app has no theme-provider infrastructure, and avoiding `theme="system"` sidesteps `window.matchMedia`, which jsdom doesn't implement by default)
- [x] `<Toaster position="top-center" />` is mounted once in `apps/web/src/main.tsx` (global) and once in `apps/web/src/test/render.tsx`'s `renderWithProviders` (so component-test toast assertions can find it — Sonner renders via portal)
- [x] `apps/web/src/lib/toast.ts` exports `toastApiError(error: unknown, fallback: string)`, calling `toast.error(error instanceof ApiError ? error.message : fallback)`
- [x] `useCreateRestaurant` (`apps/web/src/routes/admin/useRestaurants.ts`): `onSuccess` calls `toast.success("Restaurant added")` in addition to the existing `invalidateQueries`; `onError` calls `toastApiError(error, "Could not create restaurant.")`
- [x] `Restaurants.tsx`'s local top-level `error` state and its inline `<p>` are removed; `handleSubmit` switches from `await mutateAsync(...)` + try/catch to `mutate(input, { onSuccess: () => { name.reset(); setType("food"); setContactInfo(""); } })` (dropping the try/catch here is required — leaving it would swallow rejections silently, but more importantly the point of moving to `mutate` is that the hook's own `onError` now owns the failure toast, so no local catch is needed)
- [x] Toast text is static and never interpolates the restaurant's name — `<Toaster />` is now mounted in every component test's render tree, and existing assertions like `getByText("Sushi Spot")` would collide with an interpolated toast like `Restaurant "Sushi Spot" added`
- [x] A toast fired in one test does not leak into the next (Sonner's toast store is module-level, outside React, so unmounting `<Toaster />` between tests via `cleanup()` doesn't guarantee this) — verified by a test and, if leakage is observed, fixed with whatever isolation mechanism that test reveals is needed (e.g. `toast.dismiss()` in an `afterEach`)
- [x] `.claude/rules/form-validation.md` is edited (not deleted) to hand off the top-level-error case: field-level validation errors stay inline via `useRequiredField` (unchanged); API/network failure on submit is now a toast — see `.claude/rules/mutation-feedback.md`
- [x] New `.claude/rules/mutation-feedback.md` (with `paths: apps/web/src/**/*.tsx` — broad, not narrowed to `routes/admin/**`, since tasks 009/010 add mutations on the public submission side later) documents: success toast on every mutation, `ApiError` → error toast via `toastApiError`, static/name-free message wording, and that these calls live in the mutation hook's `onSuccess`/`onError` (not at component call sites)
- [x] `e2e/admin-restaurants.spec.ts` gains one assertion that the "Restaurant added" toast appears after a successful create
- [x] Out of scope, unchanged: query-error UI (`Could not refresh restaurants.` at `Restaurants.tsx:93`) and all loading strings stay exactly as they are today

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

- red commit: `12a932b` — `pnpm --filter web exec vitest run src/routes/admin/Restaurants.test.tsx` -> 2 failing (5 pre-existing tests passed; the 2 new assertions on "Restaurant added" and "Could not create restaurant." failed as expected, no config/syntax errors)
- green commit: `1a4a7b4` — full `test_command` all passing: `pnpm -r typecheck` (3/3 packages), `pnpm --filter web build` (vite build succeeded), `pnpm test` (12 files, 47 tests passed), `pnpm exec playwright test` (7/7 e2e tests passed, including the new "Restaurant added" toast assertion)
- follow-up commit: `29ef444` — `pnpm test` -> 12 files, 48 tests passed (added the ApiError-message-branch test the code-reviewer flagged as missing; see Review Notes)

## Plan Deviations

- The Plan's error-toast test (step 6) assumed mocking a `500` response would exercise `toastApiError`'s fallback string ("Could not create restaurant."). In practice `apps/api`'s error responses are JSON bodies with an `error` field, so `api.ts`'s `request()` always constructs an `ApiError` with a real message from that body (or a default `Request failed with status N`) — `toastApiError` then shows `error.message`, not the fallback, since the thrown error *is* an `ApiError` instance. The fallback string is only reached for a genuinely non-`ApiError` failure (e.g. a network-level error where `fetch` itself rejects). Fixed by changing the test's MSW handler from `HttpResponse.json({ error: ... }, { status: 500 })` to `HttpResponse.error()` (simulates a network failure), which correctly exercises the fallback path the acceptance criteria describes.
- `pnpm dlx shadcn@latest add sonner` added `next-themes` as a real dependency in `apps/web/package.json` (needed to run the generated wrapper as-is), not just an import to delete from the wrapper file as the Plan implied. Removed it afterward with `pnpm remove next-themes` once the `useTheme()` call and import were stripped from `sonner.tsx`, so it doesn't linger as an unused dependency.
- No `window.matchMedia` stub was needed in `apps/web/src/test/setup.ts` — removing the `theme="system"` prop (per the Plan) meant Sonner never touches `matchMedia` in the test environment, confirmed empirically by the full suite passing without one.
- The toast-leak isolation test (Plan step 6, third bullet) passed on the first try with no isolation fix — Testing Library's `cleanup()` between tests, combined with each test mounting a fresh `<Toaster />` via `renderWithProviders`, was sufficient. No `toast.dismiss()` `afterEach` was needed; the test stays as a regression guard.
- Everything else matched the Plan as written.

## Review Notes

Output of `feature-dev:code-reviewer`, reviewing the diff between the red commit (`12a932b`) and the first green commit (`1a4a7b4`):

### Findings

**Important (confidence 80): Test coverage gap — the ApiError message-surfacing branch of `toastApiError` is now untested**

`apps/web/src/routes/admin/Restaurants.test.tsx:76-89` ("shows an error toast when creating a restaurant fails") was changed from mocking a `500` JSON response (`HttpResponse.json({ error: "internal error" }, { status: 500 })`) to a raw network failure (`HttpResponse.error()`). That's a legitimate addition — it now correctly exercises `toastApiError`'s fallback branch, since `request()` in `apps/web/src/lib/api.ts` has no try/catch around `fetch()`, so a network failure propagates as a plain (non-`ApiError`) rejection, and `toastApiError` falls back to `"Could not create restaurant."` as expected.

The problem is the old test wasn't kept alongside the new one — it was replaced. That old test was the only place exercising `toastApiError`'s *other* branch: surfacing `error.message` from a real `ApiError` (e.g. a 409 name conflict). Nothing else covers it, and it's exactly what `.claude/rules/mutation-feedback.md` documents as the contract ("surfaces `ApiError.message` when available"). Shipping this rule with zero coverage of its distinguishing behavior is a real gap in a TDD repo.

Fix: add a separate `it` using a 4xx/5xx JSON error response and assert that message (not the fallback) appears as the toast text. Keep both tests — they cover different branches, not duplicates.

**Fixed** — see commit `29ef444`, added directly after the review (before opening the PR): restored a dedicated test ("shows the API's error message as a toast when creating a restaurant fails with a known error", 409 + `{ error: "Name already exists" }`) alongside the network-error test, and extended the leak-isolation test to also assert the API-message toast text doesn't leak.

### Checked and found correct (no issue)

- `HttpResponse.error()` → `fetch()` rejection → non-`ApiError` → `toastApiError` fallback: correctly wired, verified against `api.ts`'s `request()` (no internal try/catch).
- Removing the local `error` state / try-catch in `Restaurants.tsx`'s `handleSubmit`: does not swallow errors. `useCreateRestaurant`'s hook-level `onError` still fires regardless of the `mutate(input, { onSuccess })` call-site option — TanStack Query v5 calls both hook-level and call-level callbacks, it doesn't let one override the other.
- Sonner wrapper trim (dropping `next-themes`/`useTheme()`): correct — no theme provider or dark-mode toggle anywhere in the app, so defaulting Sonner to its built-in light theme matches reality. `React.CSSProperties` referenced without an explicit `import React` also compiles fine (`@types/react` declares `export as namespace React`).
- `useCreateRestaurant`: no TanStack Query anti-patterns. Matches `.claude/rules/mutation-feedback.md` exactly.
- Mutations don't retry by default in this app, so a real network failure surfaces the error toast immediately, not after retries.
- No collision risk from `<Toaster />` now being mounted in every component test via `renderWithProviders` — every existing `getByRole`/`getByLabelText` query across `apps/web/src/**/*.test.tsx` uses a specific filter that doesn't overlap with Sonner's landmark region or list.
- `toastOptions.classNames.toast: "cn-toast"` in `sonner.tsx` has no matching CSS rule, but it's inert, not broken.
- `sonner.tsx`'s semicolon-free style matches every other shadcn-CLI-generated file in `apps/web/src/components/ui/`.

### Minor note (below reporting threshold, confidence ~50, mentioned for completeness)

The "does not leak a toast from one test into the next" test doesn't actually verify what its name claims. Reading Sonner's source: `Toaster`'s internal `useEffect` calls `ToastState.subscribe`, which only registers for *future* `publish()` calls and never replays the existing `toasts` array to a new subscriber. So a freshly-mounted `<Toaster />` always starts empty regardless of prior tests — this test would pass whether it ran first, last, or if `cleanup()` were removed entirely. It's a weaker regression guard than its name suggests, but not important enough to require a fix. Left as-is; the acceptance criterion ("verified by a test") is satisfied and no isolation mechanism (e.g. `toast.dismiss()`) was actually needed.
