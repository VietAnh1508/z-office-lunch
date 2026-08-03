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
