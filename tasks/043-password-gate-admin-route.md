---
id: 043
title: Password-gate the /admin route
status: in_review
depends_on: []
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm test -- apps/web/src/routes/admin/AdminLayout.test.tsx"
created: 2026-09-15
---

## Goal

Put a password prompt in front of `/admin` (and every nested admin route) so casual visitors
can't wander in via the URL. Client-side only, no backend enforcement — a deterrent, not real
access control.

## Acceptance Criteria

- [ ] Visiting `/admin` (or any nested admin route directly, e.g. `/admin/restaurants`) with no
      prior unlock shows a password prompt instead of admin content.
- [ ] Submitting the correct password (matching build-time `VITE_ADMIN_PASSWORD`) reveals the
      admin UI and persists the unlocked state in `sessionStorage` for the rest of the tab
      session (survives client-side navigation and page reload, clears on tab/browser close).
- [ ] Submitting an empty password shows an inline field error (via `useRequiredField`); a
      wrong non-empty password shows a `toast.error` and the gate stays locked.
- [ ] Admin API endpoints are unaffected — this task adds no backend auth.
- [ ] Existing e2e specs that reach `/admin` still pass after adding an unlock step; a new e2e
      spec covers the gate itself (wrong password, correct password, locked deep-link).
- [ ] `pnpm dev` / `pnpm dev:hot` still start cleanly on a clean checkout (`scripts/dev-setup.sh`
      scaffolds `apps/web/.env` the same way it already does `apps/api/.env`).

## Plan

### Context

`/admin` is currently reachable by anyone with the URL — `docs/deployment.md` already flags this
as a known, deliberate gap. This task adds a lightweight speed bump, not real access control
(Cloudflare Access is the documented follow-up for that).

Decisions made with the user during planning:
- **UI-only gate.** No backend enforcement — admin API endpoints stay reachable directly
  (curl/devtools) without the password, unchanged from today.
- **Password lives in a Vite build-time env var** (`VITE_ADMIN_PASSWORD`, `apps/web`), not a
  Worker secret. This bakes the password into the shipped JS bundle, readable via
  devtools/view-source by anyone — a known, accepted trade-off (deterrent, not a secret), and
  it's what makes this a pure frontend change with no new API endpoint.
- **sessionStorage** persistence — unlocked state clears when the tab/browser closes.

### Where the gate lives

`apps/web/src/routes/admin/AdminLayout.tsx` is the one shared shell every admin route nests
under (`App.tsx`: `<Route path="admin" element={<AdminLayout />}>` wraps all admin children via
`<Outlet />`). Gating here covers the whole `/admin` subtree for free, including direct
navigation to a nested route — no changes needed to `App.tsx` or any individual page component.

### New hook: `apps/web/src/hooks/useAdminGate.ts`

Encapsulates the unlock state so it's unit-testable apart from the router/layout:

```ts
const STORAGE_KEY = "admin-unlocked";

export function useAdminGate() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "true",
  );

  function tryUnlock(password: string): boolean {
    if (password === import.meta.env.VITE_ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setUnlocked(true);
      return true;
    }
    return false;
  }

  return { unlocked, tryUnlock };
}
```

`AdminLayout.tsx` change:

```tsx
export function AdminLayout() {
  const { unlocked, tryUnlock } = useAdminGate();
  if (!unlocked) return <AdminPasswordGate onSubmit={tryUnlock} />;
  return ( /* existing AppHeader + <Outlet /> */ );
}
```

`AdminPasswordGate` (new, small — colocate in `AdminLayout.tsx` or its own file, whichever reads
cleaner once written): a centered form, one password `Input`. Field-level empty-check via the
existing `useRequiredField` hook (`.claude/rules/form-validation.md`). Wrong-password feedback is
a plain `toast.error("Incorrect password.")` at the call site — **not** `toastApiError`/
`useMutation`, since there's no request here; `.claude/rules/mutation-feedback.md`'s
hook-owns-the-toast rule is specifically about `useMutation` call sites, which don't apply to a
synchronous local check.

### Env var plumbing

- New `apps/web/.env.example` (first one for `apps/web` — today only `apps/api` has one):
  ```
  # Copy to .env for local dev. Gates /admin behind this password — baked into the
  # built JS bundle, so treat it as a deterrent, not a secret (see docs/architecture.md).
  VITE_ADMIN_PASSWORD=
  ```
- `apps/web/.env` is already covered by the root `.gitignore`'s `.env.*` pattern — no gitignore
  change needed.
- `scripts/dev-setup.sh` currently only scaffolds `apps/api/.env` from its example; extend it to
  do the same for `apps/web/.env`, mirroring the existing block:
  ```bash
  if [ ! -f apps/web/.env ]; then
    echo "==> Creating apps/web/.env from .env.example..."
    cp apps/web/.env.example apps/web/.env
  fi
  ```
  Without this, a fresh checkout has `VITE_ADMIN_PASSWORD` undefined and the gate can never be
  unlocked locally, breaking "safe to run from a cold machine."
- **Verify first, can't be confirmed without running it:** whether `apps/web/tsconfig.app.json`'s
  existing `"types": ["vite/client"]` gives `import.meta.env.VITE_ADMIN_PASSWORD` a usable type
  without a custom `vite-env.d.ts`. If TS complains, add one augmenting `ImportMetaEnv`.

### Tests

- Extend `apps/web/src/routes/admin/AdminLayout.test.tsx` (existing file, same
  `MemoryRouter`/`renderWithProviders` pattern already used there): locked state shows the
  password prompt instead of admin content; empty submit shows the inline field error and stays
  locked; wrong password shows the toast and stays locked; correct password unlocks and renders
  admin content. Clear `sessionStorage` in `beforeEach`/`afterEach` so tests don't leak state.
- Use Vitest's `vi.stubEnv("VITE_ADMIN_PASSWORD", "<test password>")` (`vi.unstubAllEnvs()` in
  cleanup) to control `import.meta.env` per-test — no `.env.test` file convention exists in this
  repo, and `vi.stubEnv` is the built-in way to do this.

### e2e impact

Every spec that currently does `page.goto("/admin...")` now hits the gate first:
`e2e/admin-nav.spec.ts`, `e2e/admin-restaurants.spec.ts`, `e2e/admin-restaurant-detail.spec.ts`,
`e2e/round-lifecycle.spec.ts`.

- `playwright.config.ts`: add `webServer.env: { VITE_ADMIN_PASSWORD: "<e2e test password>" }` so
  the build step (`pnpm --filter web build`) embeds a known password in the e2e build. **Verify
  first:** confirm the built bundle actually picks up a `VITE_`-prefixed process env var passed
  this way (standard, documented Vite behavior — but worth a real build check, e.g. grep the
  built `dist/assets/*.js` for the password string, rather than trusting it blind).
- Pre-unlock the existing 4 specs via
  `page.addInitScript(() => sessionStorage.setItem("admin-unlocked", "true"))` before
  `page.goto(...)` — or a small shared `e2e/helpers.ts` export if duplicating it 4x feels wrong.
  Keeps those specs testing what they already test, not re-proving the gate each time.
- New `e2e/admin-gate.spec.ts`: wrong password stays on the gate and shows an error; correct
  password unlocks and reaches admin content; a fresh browser context (no sessionStorage) is
  locked again on a deep link (`/admin/restaurants`), not just `/admin`.

### Docs

- `docs/deployment.md`: revise the "No auth in front of it" note — still true for the API, but
  the UI itself is now gated; add the one-time step of setting `VITE_ADMIN_PASSWORD` as a
  Cloudflare Workers Builds environment variable (dashboard → Settings → Build → Environment
  variables) so production builds embed a real password, not an empty string.
- `docs/architecture.md`: one entry under "Decisions worth recording" — client-side-only gate,
  password visible in the bundle by design, chosen over a Worker-secret + API-enforced approach
  for simplicity; real access control is still the documented Cloudflare Access follow-up.

### Files touched

- `apps/web/src/hooks/useAdminGate.ts` (new)
- `apps/web/src/routes/admin/AdminLayout.tsx`
- `apps/web/src/routes/admin/AdminLayout.test.tsx`
- `apps/web/.env.example` (new)
- `scripts/dev-setup.sh`
- `playwright.config.ts`
- `e2e/admin-nav.spec.ts`, `e2e/admin-restaurants.spec.ts`, `e2e/admin-restaurant-detail.spec.ts`,
  `e2e/round-lifecycle.spec.ts` (add unlock step)
- `e2e/admin-gate.spec.ts` (new)
- `docs/deployment.md`, `docs/architecture.md`

### Verification

- `pnpm test -- apps/web/src/routes/admin/AdminLayout.test.tsx` — new gate tests green, plus the
  rest of the file's existing tests still pass.
- `pnpm test:e2e` — all specs (including the new `admin-gate.spec.ts`) green, confirming the
  build-time env var actually reaches the bundle and existing specs still reach admin content
  after the unlock step.
- Manual: `pnpm dev:hot` on a clean checkout with `apps/web/.env` deleted, confirm
  `scripts/dev-setup.sh` recreates it from `.env.example` and the app still starts.

## Implementation Log

- red commit: `0b28172` — `pnpm test -- apps/web/src/routes/admin/AdminLayout.test.tsx` -> 5 failing
- green commit: `265c432` — `pnpm test -- apps/web/src/routes/admin/AdminLayout.test.tsx` -> all passing (394/394 in the full `pnpm test` run)
- `pnpm lint` clean on all touched files (3 pre-existing `only-export-components` warnings elsewhere, untouched by this task).
- `pnpm test:e2e` — new `e2e/admin-gate.spec.ts` (3 tests) and the 4 retrofitted specs' gate-unlock steps all pass. 4 pre-existing failures in `admin-restaurant-detail.spec.ts`/`round-lifecycle.spec.ts` (an "Add menu item" role-name collision with the "Bulk-add menu items" button from task 041) reproduce identically on plain `main` with none of this task's changes applied — confirmed by re-running against a stashed working tree — so left alone as out of scope.
- Manually confirmed the build-time env var actually reaches the bundle: `VITE_ADMIN_PASSWORD=<value> pnpm --filter web build` then `grep` the built `dist/assets/*.js` for the value — found.

## Plan Deviations

- No `vite-env.d.ts` was needed — the Plan flagged this as "verify first, can't be confirmed
  without running it." `pnpm --filter web exec tsc --noEmit` came back clean with no changes:
  `apps/web/tsconfig.app.json`'s existing `"types": ["vite/client"]` alone is enough for
  `import.meta.env.VITE_ADMIN_PASSWORD` to typecheck (an unknown `VITE_`-prefixed key on
  `ImportMetaEnv` falls back to `string | undefined`, which is fine here since it's compared
  against another string).
- Discovered mid-task, unrelated to this task: 4 e2e specs (`admin-restaurant-detail.spec.ts`,
  3 of the 3 tests in `round-lifecycle.spec.ts`) already fail on plain `main` — a pre-existing
  `getByRole("button", { name: "Add menu item" })` ambiguity against the newer "Bulk-add menu
  items" button (task 041) resolving two elements. Confirmed pre-existing by stashing this
  task's tracked-file changes and re-running the same spec against effectively-`main` state; the
  identical failure reproduced. Left alone — out of scope for a password-gate task, and not
  something this task's changes caused or could plausibly fix.
- My own first draft of the "locked, no admin content" unit test used `screen.getByRole(...)`
  inside `expect(...).not.toBeInTheDocument()`, which throws immediately on no match rather than
  returning null (RTL's `getBy*` vs `queryBy*` distinction) — caught by the red→green run
  producing the wrong kind of failure (a thrown error, not a false assertion), fixed to
  `queryByRole` before re-running.
- Otherwise implemented as planned: same hook shape, same gate placement in `AdminLayout`, same
  env var plumbing, same e2e pre-unlock-via-`addInitScript` approach (via a small shared
  `e2e/helpers.ts`, one of the two options the Plan left open).
- Code review (below) caught a real gap not in the Plan: `apps/web/.env.example` originally
  shipped `VITE_ADMIN_PASSWORD=` (empty), so `scripts/dev-setup.sh`'s new copy-on-first-run step
  would silently lock a fresh `pnpm dev`/`dev:hot` checkout's `/admin` out forever (no error, the
  form just keeps rejecting an empty required field). Fixed post-review by giving the example
  file a real local-dev default (`dev-password`) instead of an empty string, matching how
  `apps/api/.env.example` already ships a real usable local default rather than a blank.

## Review Notes

Output of the `feature-dev:code-reviewer` agent, reviewing the red→green diff
(`git diff 0b28172 265c432`):

### Important

**A fresh cold-machine `pnpm dev` permanently locks `/admin` locally, with no signpost anywhere
that this is expected.** (`apps/web/.env.example`, `scripts/dev-setup.sh` — confidence 80)

`scripts/dev-setup.sh`'s new block copies `apps/web/.env.example` → `apps/web/.env` on first
run, same as it already does for `apps/api/.env`. But unlike the API's example file (which
presumably has working defaults), `apps/web/.env.example` shipped `VITE_ADMIN_PASSWORD=` —
empty. After this change, any dev running `pnpm dev`/`dev:hot` on a clean checkout gets an
`apps/web/.env` with an empty password, and since `tryUnlock` compares against that empty string
exactly while `useRequiredField` rejects empty submissions outright, `/admin` becomes unopenable
until someone manually edits the file. Nothing documented this. **Fixed post-review**: gave
`apps/web/.env.example` a real usable default (`VITE_ADMIN_PASSWORD=dev-password`) instead of an
empty string — see Plan Deviations above.

### Checked and clear (no findings)

- **Gate logic** (`useAdminGate.ts`, `AdminLayout.tsx`): sessionStorage read/write, `tryUnlock`
  comparison, and the `if (!unlocked) return <AdminPasswordGate />` short-circuit are all
  correct. No stale-closure or re-render bugs.
- **`form-validation.md` compliance**: `useRequiredField`, `noValidate` on the form, inline
  `<p className="text-sm text-destructive">` error — matches the established pattern exactly.
- **`mutation-feedback.md` tension is expected, not a bug**: `toast.error("Incorrect
  password.")` for a synchronous, non-`useMutation` check reads like a literal violation of
  "toasts are for mutation outcomes," but the task file explicitly carves this out as
  intentional (a plain client-side check, not a request).
- **`SubmitEvent` import from `"react"`**: the established repo-wide pattern, not a typo.
- **`getByRole` → `queryByRole` fix** in `AdminLayout.test.tsx`: correct fix, already explained
  in Plan Deviations above.
- **`playwright.config.ts`'s `webServer.env`**: confirmed `process.env` values (from this)
  take precedence over `.env`-file values in Vite's `loadEnv` by default — so even a stale local
  `apps/web/.env` doesn't risk e2e flakiness.
- **`.gitignore`**: `apps/web/.env` is covered by the existing `.env.*` pattern (with
  `!.env.example` carving out the example file) — the new `.env` won't get committed.
- **e2e coverage**: every spec touching `/admin` either is the gate spec itself or calls
  `unlockAdmin(page)` before its first `page.goto("/admin...")`. Nothing missed.
- **Docs accuracy**: `docs/deployment.md` and `docs/architecture.md` both accurately describe
  the client-side-only trade-off and match what's implemented.
