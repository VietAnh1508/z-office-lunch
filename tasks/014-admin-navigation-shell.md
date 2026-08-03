---
id: 014
title: Admin navigation shell with placeholder pages
status: in_review
depends_on: [003]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-03
---

## Goal

Give the admin UI a navigable shell — a nav bar linking Restaurants/Employees/Rounds, and a placeholder page for each — so the app's overall shape is visible ahead of tasks 004-010 filling in real content one at a time. `/admin` currently renders `Restaurants.tsx` directly with no layout or navigation.

## Acceptance Criteria

- [x] `/admin` renders an `AdminLayout` with a `<nav>` linking Restaurants, Employees, Rounds; the currently active section is marked via `NavLink`'s built-in `aria-current="page"`
- [x] `/admin` index route (nothing more specific) renders a placeholder "Admin" overview heading
- [x] `/admin/restaurants` renders the existing `Restaurants.tsx` screen unchanged (moved from directly under `/admin`), reachable via the nav
- [x] `/admin/employees` and `/admin/rounds` render trivial placeholder pages (a heading matching the nav label + short "coming soon"-style text), reachable via the nav
- [x] `e2e/admin-restaurants.spec.ts` updated to `page.goto("/admin/restaurants")` (its target moved)
- [x] Plan sections of tasks 004, 005, 006, 010 each get a one-line note that their placeholder route/file already exists as of task 014 and their job is to replace its body, not create it fresh

## Plan

1. New files under `apps/web/src/routes/admin/`:
   - `AdminLayout.tsx` — layout route: `<nav>` of three `NavLink`s (Restaurants/Employees/Rounds) + `<Outlet/>`. No `end` prop needed (no nav link targets `/admin` itself).
   - `AdminOverview.tsx` — placeholder for the `/admin` index route (`<h1>Admin</h1>`).
   - `Employees.tsx`, `Rounds.tsx` — placeholders (`<h1>{Section}</h1>` + "Coming soon" text). No shared `PlaceholderPage` abstraction — each gets replaced outright by tasks 005/006 later, nothing to reuse once deleted.
2. Rewrite `apps/web/src/App.tsx`'s route tree to nest under the layout:
   ```
   <Route index element={<Home/>}/>
   <Route path="admin" element={<AdminLayout/>}>
     <Route index element={<AdminOverview/>}/>
     <Route path="restaurants" element={<Restaurants/>}/>
     <Route path="employees" element={<Employees/>}/>
     <Route path="rounds" element={<Rounds/>}/>
   </Route>
   ```
   `Restaurants.tsx` itself needs no changes — it uses no router APIs, so it renders identically at its new nested path. `Restaurants.test.tsx` also needs no changes.
3. TDD unit: new `apps/web/src/routes/admin/AdminLayout.test.tsx`, exercising the real `App` route tree via `MemoryRouter` + the existing `renderWithProviders` helper (`apps/web/src/test/render.tsx`), matching `Restaurants.test.tsx`'s style — `/admin` shows the "Admin" heading; clicking each nav link renders the right page; clicking "Restaurants" renders the real `Restaurants` screen (mock `GET /api/restaurants` via `server.use`, same pattern `Restaurants.test.tsx` already uses, needed because `test/setup.ts`'s `onUnhandledRequest: "error"` fails on an unmocked fetch); the active link carries `aria-current="page"`.
4. Update `e2e/admin-restaurants.spec.ts`'s `page.goto("/admin")` to `page.goto("/admin/restaurants")`.
5. Add `e2e/admin-nav.spec.ts`: real-browser check that clicking through the nav from `/admin` reaches each section, plus a direct `page.goto("/admin/employees")` deep link to confirm the Worker's SPA fallback (`not_found_handling: "single-page-application"` in `apps/api/wrangler.jsonc`) still serves nested admin paths after this routing change.
6. One-line edits to tasks `004`, `005`, `006`, `010`'s Plan sections noting their placeholder route/file already exists as of this task.

## Implementation Log

- red commit: 6afe0a7 — `pnpm test` -> 3 failing (`AdminLayout.test.tsx`'s three tests; all other suites passing)
- green commit: 801b48d — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing (25 unit tests, 5 e2e tests)

## Plan Deviations

Two of the new `AdminLayout.test.tsx`/`admin-nav.spec.ts` assertions initially checked for a `heading` role named "Add restaurant" after navigating to `/admin/restaurants`, assuming the existing `Restaurants.tsx` screen used a semantic `<h1>`/`<h2>`. It actually uses shadcn's `CardTitle`, which renders a plain `<div>` (`apps/web/src/components/ui/card.tsx`), so `getByRole("heading", ...)` never matched — a wrong assumption about existing code, not a bug in the new `AdminLayout`/routing. Fixed during the Green step by asserting on the "No restaurants yet." text (which does load, since the mocked `GET /api/restaurants` handler returns `[]`) instead of a heading role. This was a same-session test-quality fix (test was still red for the right underlying feature-not-implemented reason before this fix, and after the fix it correctly turns green with the real implementation), not a deviation in the actual routing/layout implementation, which matches the Plan as written.

The `feature-dev:code-reviewer` pass (see Review Notes) found a real coverage gap: no test asserted the layout's `<nav>` was an actual semantic landmark — swapping it for a `<div>` would have left all tests green. Added one more unit test (`"renders the section links inside a nav landmark"`, asserting `getByRole("navigation")` contains the three links) and amended it into the green commit before opening the PR, since the commit hadn't been pushed yet. `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` re-verified all passing (25 unit / 5 e2e) after the amend.

## Review Notes

Output of the `feature-dev:code-reviewer` agent (run against the red→green diff):

### Important

**Confidence 80 — Acceptance criterion "a `<nav>`" isn't actually tested; the semantic element could regress silently.**
`apps/web/src/routes/admin/AdminLayout.tsx:12` uses `<nav>`, satisfying AC #1 as written. But none of the three tests in `AdminLayout.test.tsx`, nor either test in `admin-nav.spec.ts`, ever query `role="navigation"`. Swapping `<nav>` for a plain `<div>` in `AdminLayout.tsx` would leave all five tests (3 unit + 2 e2e) green. Since the task explicitly calls out `<nav>` as the accessibility-relevant landmark (not just the `aria-current` behavior), this is a real coverage gap on the one guideline this task is centered on.

**Fixed before opening the PR** — see Plan Deviations: added a `"renders the section links inside a nav landmark"` test asserting `getByRole("navigation")` contains all three links, amended into the green commit.

### Worth a quick check (not blocking, not ≥80 on its own)

`e2e/admin-nav.spec.ts`'s first test asserts `page.getByText("No restaurants yet.")` to confirm the Restaurants page loaded. Currently safe (no other e2e spec creates a restaurant, so the shared test DB stays empty), but it's an assertion on incidental app state rather than the route itself, and `playwright.config.ts` doesn't pin `workers: 1`/`fullyParallel: false` — once a later task's e2e spec creates a restaurant, this could become order/worker-dependent and flake. Left as-is per reviewer's own assessment that it's not blocking; flagging here in case a later task wants to swap it for `getByRole("button", { name: "Add restaurant" })` instead.

### Everything else checked out

- Routing correctly resolves `/admin`, `/admin/restaurants`, `/admin/employees`, `/admin/rounds`; `Restaurants.tsx` content is untouched, just re-parented.
- No `end` prop needed on the `NavLink`s — no nav target is a prefix of another, and it'll stay correct once task 004 adds `/admin/restaurants/:id`.
- No shared `PlaceholderPage` abstraction was introduced, matching the Plan's explicit call-out.
- `aria-current="page"` relies on `NavLink`'s built-in behavior; the test checks both the active link's attribute and a sibling's absence of it.
- Tasks 004, 005, 006, 010 all got the required one-line Plan notes.
- No stale `/admin`-as-restaurants-page references outside task 003's own historical (and correctly `status: done`) Implementation Log.
