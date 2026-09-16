---
id: 051
title: Move /admin password check to the backend
status: done
depends_on: []
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm test -- apps/api/src/routes/admin.test.ts apps/web/src/routes/admin/AdminLayout.test.tsx"
created: 2026-09-16
---

## Goal

Move the `/admin` password check (task 043) off the client, where it's currently a `VITE_ADMIN_PASSWORD` build-time constant baked into the shipped JS bundle, onto the backend via a new `POST /api/admin/verify-password` endpoint that checks against a Worker secret never sent to the client.

## Acceptance Criteria

- [ ] `apps/api/src/bindings.ts`'s `Bindings` gains `ADMIN_PASSWORD: string`.
- [ ] `POST /api/admin/verify-password` exists (new `apps/api/src/routes/admin.ts`, registered in `apps/api/src/index.ts`): `{ password: string }` in; `{ ok: true }` / 200 on match; `{ error }` / 401 on mismatch; `{ error }` / 400 on missing/non-string password or malformed JSON; `{ error }` / 500 if `ADMIN_PASSWORD` itself is unset (never logs the submitted password).
- [ ] `apps/web/src/hooks/useAdminGate.ts` calls the new endpoint instead of comparing against `import.meta.env.VITE_ADMIN_PASSWORD`; `sessionStorage["admin-unlocked"]` gate behavior is otherwise unchanged.
- [ ] `AdminPasswordGate` (`apps/web/src/routes/admin/AdminLayout.tsx`) disables its Unlock button while the check is in flight, and still shows `toast.error("Incorrect password.")` on a wrong password.
- [ ] `VITE_ADMIN_PASSWORD` is removed from `apps/web/.env.example` and `playwright.config.ts`'s `webServer.env`; no password material remains anywhere in the frontend build.
- [ ] `apps/api/.env.example` and `apps/api/.env.test` document `ADMIN_PASSWORD`; production sets it via `wrangler secret put ADMIN_PASSWORD` (documented in `docs/deployment.md`).
- [ ] `apps/api/src/routes/admin.test.ts` covers all four response cases above.
- [ ] `AdminLayout.test.tsx` no longer stubs `VITE_ADMIN_PASSWORD`; mocks the new endpoint via MSW instead; adds a test for the disabled-while-pending button state.
- [ ] `e2e/admin-gate.spec.ts` still passes end-to-end with the real endpoint.

## Plan

### Context

Task 043 made this trade-off deliberately and documented it in `docs/architecture.md`: client-side check, deterrent only, not real access control, because the password was shipped in the JS bundle regardless. This task closes that specific gap — the real password becomes a Worker secret, verified server-side. Everything else about the gate (a `sessionStorage` boolean, no session/cookie, no rate limiting, admin API endpoints still otherwise unauthenticated) is unchanged and explicitly out of scope — those are documented follow-ups, not oversights.

**Future improvement, not this task:** replace the `sessionStorage` boolean with a real session backed by a stateless signed cookie (Hono's `hono/cookie` + an HMAC-signed value carrying an expiry, verified against `ADMIN_PASSWORD` or a dedicated signing secret) — no new storage infra needed since the cookie carries the session state itself. This would also let admin API endpoints actually check the session instead of staying open. Worth its own task once this one ships.

### Local secret storage: `.env`, not `.dev.vars`

Wrangler stops reading `.env` entirely for `wrangler dev` once a `.dev.vars` file exists in the same directory. This repo already relies on `apps/api/.env` (auto-copied from `.env.example` by `scripts/dev-setup.sh`) for the Hyperdrive local-connection-string override, and a separate `apps/api/.env.test` loaded via `wrangler dev --env-file=.env.test` for `test:e2e`. Introducing `.dev.vars` here would silently break the Hyperdrive override for plain `wrangler dev`/`dev:hot`. Truly adopting `.dev.vars` would mean migrating the Hyperdrive override too and moving `test:e2e` from `--env-file` to Wrangler's named-environments feature — out of scope. So: use `.env`/`.env.test`, consistent with the one convention this repo has already committed to.

- `apps/api/.env.example`: add `ADMIN_PASSWORD=dev-password` with a one-line comment that the real value lives in gitignored `.env`.
- `apps/api/.env.test`: add `ADMIN_PASSWORD=e2e-test-password` (must match whatever `e2e/admin-gate.spec.ts` submits as the correct password).
- Production: `wrangler secret put ADMIN_PASSWORD`. No `wrangler.jsonc` change — secrets never get a `vars` entry there (that's reserved for plaintext non-secret constants).

### Backend

- `apps/api/src/bindings.ts`: add `ADMIN_PASSWORD: string` to `Bindings`.
- New `apps/api/src/routes/admin.ts`, exporting `adminRoute` (`Hono<{ Bindings: Bindings }>()`), registered in `apps/api/src/index.ts` via `app.route("/api/admin", adminRoute)` — same pattern as every other route file (see `apps/api/src/routes/restaurants.ts` for the shape).
  - `POST /api/admin/verify-password`
    - Parse body the same way `restaurants.ts` does: `const body = await c.req.json().catch(() => ({}))`.
    - If `typeof body.password !== "string"` (covers missing and malformed-JSON cases): `c.json({ error: ERROR_MESSAGES.passwordRequired }, 400)`.
    - If `!c.env.ADMIN_PASSWORD` (secret not provisioned): `console.error(JSON.stringify({ message: "ADMIN_PASSWORD is not configured" }))`, then `c.json({ error: ERROR_MESSAGES.internal }, 500)`.
    - If `body.password !== c.env.ADMIN_PASSWORD`: `c.json({ error: ERROR_MESSAGES.adminPasswordIncorrect }, 401)`.
    - Else: `c.json({ ok: true }, 200)` — must be a real JSON body, not a bodyless 204: `apps/web/src/lib/api.ts`'s `request()` unconditionally does `await res.json()` on any ok response, so 204 would throw client-side.
  - No DB access anywhere in this handler, so `.claude/rules/api-error-handling.md`'s try/catch/finally + `db.$client.end()` wrapper does not apply here — this is intentional, not a gap, since that rule is scoped to DB-touching handlers.
- `apps/api/src/lib/errors.ts`: add `passwordRequired: "password is required"` and `adminPasswordIncorrect: "incorrect password"` to `ERROR_MESSAGES`.
- `apps/api/src/test/env.ts`: add `ADMIN_PASSWORD: "test-admin-password"` to both `testEnv` and `unreachableEnv`.
- New `apps/api/src/routes/admin.test.ts`, using `app.request(path, init, testEnv)` (no `createDb`/`truncateAll`/`afterAll` — this route never touches Postgres):
  - correct password → 200 `{ ok: true }`
  - wrong password → 401 `{ error: "incorrect password" }`
  - missing/non-string `password` → 400
  - malformed JSON body → 400
  - `ADMIN_PASSWORD` unset (spread `testEnv` with `ADMIN_PASSWORD: ""` for this one test) → 500

### Frontend

- `apps/web/src/hooks/useAdminGate.ts`: rework as a TanStack Query mutation, mirroring `useCreateRestaurant` (`apps/web/src/routes/admin/useRestaurants.ts`), per `.claude/rules/mutation-feedback.md` (feedback wired inside the hook, not the call site). New shape:
  - Returns `{ unlocked, tryUnlock, isUnlocking }`.
  - `tryUnlock(password: string): void` calls `mutate({ password })` (not `mutateAsync` — no try/catch at the call site, per the same rule).
  - `mutationFn: (input: { password: string }) => api.post<{ ok: true }>("/admin/verify-password", input)`.
  - `onSuccess`: `sessionStorage.setItem(STORAGE_KEY, "true")`, `setUnlocked(true)`. Deliberately **no** success toast — unlocking swaps the whole screen from the password form to the admin nav/`Outlet`, which is itself the feedback. This is an intentional, named exception to the mutation-feedback rule, not an oversight — call it out as such in code review if asked.
  - `onError`: if `error instanceof ApiError && error.status === 401`, `toast.error("Incorrect password.")` (unchanged copy from today — no changes needed to the existing assertion in `AdminLayout.test.tsx` or `e2e/admin-gate.spec.ts`). Otherwise, `toastApiError(error, "Could not verify password.")`.
  - The mutation must be owned by this hook / by `AdminLayout` (which calls it), not inside `AdminPasswordGate` — on success `AdminPasswordGate` unmounts, so a mutation owned by it would settle against a dead component.
- `apps/web/src/routes/admin/AdminLayout.tsx`: `AdminPasswordGate`'s `onSubmit` prop changes from `(password: string) => boolean` to `(password: string) => void`, plus a new `pending: boolean` prop (from `isUnlocking`) used to `disabled` the Unlock button while in flight — same pattern as `Restaurants.tsx`'s `disabled={createRestaurant.isPending}`. Delete the existing `if (!onSubmit(...)) { toast.error(...) }` branch in `handleSubmit` — failure handling now lives entirely in the hook. The `useRequiredField` empty-field guard ahead of submit is unchanged.
- `apps/web/.env.example`: delete the `VITE_ADMIN_PASSWORD` line.
- `playwright.config.ts`: remove `webServer.env: { VITE_ADMIN_PASSWORD: ... }`.
- `e2e/admin-gate.spec.ts`: update the comment above `CORRECT_PASSWORD` to reference `apps/api/.env.test`'s `ADMIN_PASSWORD` instead of a Vite build var; the value itself must still match. `e2e/helpers.ts`'s `unlockAdmin` (direct `sessionStorage` write, bypasses the form) needs no change.

### Tests

- `AdminLayout.test.tsx`: drop `vi.stubEnv("VITE_ADMIN_PASSWORD", ...)` / `vi.unstubAllEnvs()`. Add per-test MSW `server.use(http.post("/api/admin/verify-password", ...))` handlers — 200 `{ ok: true }` for the correct-password test, 401 `{ error: "incorrect password" }` for the wrong-password test — scoped per test, matching how `/api/restaurants` is already mocked per-test elsewhere in this file. Add one new test asserting the Unlock button is `disabled` while the request is in flight, using MSW's `delay()` helper inside the handler to hold the response open long enough to observe the pending state.

### Docs

- `docs/deployment.md`: replace the note about setting `VITE_ADMIN_PASSWORD` as a Cloudflare Workers Builds env var with a `wrangler secret put ADMIN_PASSWORD` deployment step. Reword the surrounding paragraph: the gate is now a real server-side check (not baked into the JS bundle), but still isn't full access control — no rate limiting, the `sessionStorage` flag isn't re-verified against the server so an already-unlocked tab survives a password rotation until that tab session ends, and admin API endpoints remain otherwise unauthenticated regardless of this gate.
- `docs/architecture.md`: append a short amendment to the existing task-043 decision bullet noting task 051 moved the check server-side — don't rewrite the historical "why 043 chose client-side" paragraph itself.

## Implementation Log

- red commit: 372bb7b — `pnpm test -- apps/api/src/routes/admin.test.ts apps/web/src/routes/admin/AdminLayout.test.tsx` -> 7 failing (5 backend 404s from the missing route, 2 frontend assertions still exercising the old env-var gate)
- green commit: 1b506da — same command -> all 405 tests passing (full suite, not just the two targeted files)

Additional verification beyond `test_command`:
- `pnpm --filter api typecheck` and `pnpm --filter web typecheck`: clean.
- `pnpm lint`: only pre-existing warnings in files this task doesn't touch.
- `pnpm --filter web build` then `grep` the built bundle for the old password/env var: not present.
- Ran real `wrangler dev` (`pnpm dev` from `apps/api`) with `ADMIN_PASSWORD=dev-password` in `.env` and curled `/api/admin/verify-password` directly for the correct/wrong/missing-password cases — all matched the spec.
- `pnpm test:e2e` (full suite, since the `--` path filter didn't scope Playwright to a single file): all 3 `e2e/admin-gate.spec.ts` cases passed against the real endpoint. 4 unrelated tests failed in `admin-restaurant-detail.spec.ts`/`round-lifecycle.spec.ts` over a duplicate "Add menu item" button (bulk-add menu items feature) — reproduced identically via `git stash` back to the red commit, confirming it's pre-existing and unrelated to this task.

## Plan Deviations

None. Implementation followed the Plan section as written — schema, routes, error messages, hook rework, and doc updates all match what was specified there.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against `git diff <red> <green>` (the implementation diff only, test files from the red commit assumed present), cross-checked against this task's Plan.

**No issues at ≥80 confidence. No changes requested.**

What was actively checked and cleared:

- `c.req.json().catch(() => ({}))` + `typeof body.password !== "string"` ordering in `apps/api/src/routes/admin.ts` correctly produces 400 (missing/non-string/malformed JSON), 500 (unset `ADMIN_PASSWORD`, including empty string via `!c.env.ADMIN_PASSWORD`), 401 (mismatch), 200 `{ok:true}` (match). The 500 path logs only a static message, never the submitted password.
- `.env`/`.env.test`'s `ADMIN_PASSWORD` reaching `c.env` in local/e2e `wrangler dev` runs with no `wrangler.jsonc` change — confirmed as expected Wrangler behavior, and backed by this task's own real `wrangler dev` + curl smoke test in the Implementation Log.
- The 401-specific `toast.error("Incorrect password.")` branch in `useAdminGate.ts`'s `onError` (looks like a deviation from `.claude/rules/mutation-feedback.md` at first glance) is explicitly specified in the Plan as intentional, preserving existing copy.
- `AdminLayout.test.tsx`'s pending-button test genuinely exercises the new `disabled={pending}` wiring (asserts `toBeDisabled()` before the mocked response resolves), not just an end-state check.
- Route registration, `Bindings` typing, and full removal of `VITE_ADMIN_PASSWORD` from the frontend build (`.env.example`, `playwright.config.ts`) all correct — no remaining references outside historical task docs.

Two sub-threshold (<80) observations, not action items:

- `ERROR_MESSAGES.passwordRequired`/`adminPasswordIncorrect` are single-use (not actually "reused across routes"), but consistent with the plan and the file's existing convention — not worth changing.
- The password comparison (`!==`) isn't constant-time, but this gate is already documented as a deterrent with no rate limiting, so a timing side-channel isn't the weakest link — not worth raising against this task.

An earlier review agent launch was accidentally sent a placeholder instead of the diff; it recovered by reading the working tree directly and independently reached the same "no issues" conclusion. Both runs are consistent.
