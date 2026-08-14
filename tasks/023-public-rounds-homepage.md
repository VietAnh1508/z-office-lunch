---
id: 023
title: Public rounds-list homepage (Open/Closed sections)
status: in_review
depends_on: [022]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-14
---

## Goal

Replace the placeholder `Home` component (`apps/web/src/App.tsx`) with a real public homepage: every employee visiting `/` sees lunch rounds grouped into "Open" and "Closed" sections, sorted by deadline. No auth, no admin nav change — `/admin` stays reachable only by typing the URL, as it already is.

## Acceptance Criteria

- [ ] Visiting `/` renders two section headings, "Open" and "Closed", **always**, even when a section has zero rounds — an empty section shows "No rounds" rather than being omitted (this is the detail most likely to get shortcut-broken with a `{rounds.length > 0 && ...}` guard)
- [ ] Rounds are grouped into their matching section by `status` and appear in the order returned by the API (ascending deadline) — no client-side re-sort
- [ ] Each round row shows: its label (as a link to `/r/:id`), a status badge (reusing `RoundStatusBadge` from `@/routes/admin/RoundStatusBadge` as-is), the food restaurant name, the drink restaurant name appended (`" + "`-joined) only when present, and a formatted deadline
- [ ] A round with no drink restaurant renders cleanly — no stray "+ null"/"+ undefined" text
- [ ] Loading state shows `"Loading rounds…"`; a request failure shows `"Something went wrong loading rounds. Please try again."` (no special 404 handling needed — the list endpoint never 404s)
- [ ] `Home` and its now-unused imports (`UtensilsCrossed`, `Button`, `useNavigate`) are removed from `App.tsx`; the index route renders the new component instead
- [ ] `/admin/rounds` and the rest of `/admin/*` are unchanged

## Plan

### `apps/web/src/routes/public/usePublicRound.ts` (modify — extend existing file, don't fork a new one)

- Add `export type PublicRoundListItem = { id: number; label: string; status: "open" | "closed"; deadline: string; foodRestaurantName: string; drinkRestaurantName: string | null }` matching task 022's response verbatim.
- Extend `publicRoundKeys` with `list: () => ["public-rounds", "list"] as const`.
- Add `export function usePublicRounds()` — `useQuery({ queryKey: publicRoundKeys.list(), queryFn: () => api.get<PublicRoundListItem[]>("/rounds/public") })`. Read-only; no mutation/toast wiring per `.claude/rules/mutation-feedback.md` (that rule scopes to `useMutation` only).

### `apps/web/src/routes/public/BrowseRounds.tsx` (new)

- `BrowseRounds` (exported page component): calls `usePublicRounds()`.
  - `isPending` → `<p className="p-6 text-sm text-muted-foreground">Loading rounds…</p>`
  - `isError` → `<p className="p-6 text-sm text-destructive">Something went wrong loading rounds. Please try again.</p>`
  - Otherwise: `const openRounds = rounds.filter(r => r.status === "open")`, `const closedRounds = rounds.filter(r => r.status === "closed")` (filter preserves the API's deadline-ascending order — no re-sort). Render both `<RoundSection title="Open" rounds={openRounds} />` and `<RoundSection title="Closed" rounds={closedRounds} />` unconditionally.
- `RoundSection` (local, unexported): `Card`/`CardHeader`/`CardTitle` for `title`, `CardContent` renders `"No rounds"` (`text-sm text-muted-foreground`) when `rounds.length === 0`, else a `<ul>` of `RoundRow`s — mirrors the Card-wrapping-a-`<ul>` shape in `apps/web/src/routes/admin/RoundList.tsx`.
- `RoundRow` (local, unexported): `<Link to={`/r/${round.id}`}>{round.label}</Link>`, `<RoundStatusBadge status={round.status} />`, restaurant line (`round.foodRestaurantName` + `` ` + ${round.drinkRestaurantName}` `` only when `drinkRestaurantName != null`, same null-check shape as `RoundList.tsx`), deadline via `new Date(round.deadline).toLocaleString()` (same formatting as `Round.tsx`/`RoundList.tsx`).

### `apps/web/src/App.tsx` (modify)

- Delete the `Home` function and its now-unused imports (`UtensilsCrossed`, `Button`, `useNavigate`).
- Import `BrowseRounds` from `@/routes/public/BrowseRounds`.
- Change `<Route index element={<Home />} />` to `<Route index element={<BrowseRounds />} />`. No other route changes.

### `apps/web/src/routes/public/BrowseRounds.test.tsx` (new)

RTL + MSW, mirroring `apps/web/src/routes/public/Round.test.tsx`'s setup (`renderWithProviders`, `MemoryRouter`, `server.use(http.get("/api/rounds/public", ...))` per test):

1. Mock returns `[]` → both "Open"/"Closed" headings present, and two separate "No rounds" texts present.
2. Mock returns one open + one closed round → each appears under its correct heading (scope assertions with `within()` per section).
3. Mock returns a round with both restaurant names set → label, both names, formatted deadline, and status badge text all render.
4. Mock returns a round with `drinkRestaurantName: null` → only the food name renders, no stray "+ null".
5. Round's label link has `href="/r/<id>"` (`screen.getByRole("link", { name: round.label })`).
6. Mock returns a 500 → error message renders.

## Verification

After tests pass, run `pnpm dev`, visit `/`, confirm real open/closed rounds render grouped correctly, and a round created as `draft` via `/admin/rounds` does not appear anywhere on `/`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 6345794 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 1 failing
- green commit: bee847a — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (188 tests, 19 files)

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- The Plan's test list called the "Open"/"Closed" labels "section headings," which read as `getByRole("heading", ...)`. `CardTitle` (`@/components/ui/card`) renders a plain `<div data-slot="card-title">`, not a semantic heading element — matches every other Card-based screen in the codebase (`Round.tsx`, `RoundList.tsx`), none of which use `getByRole("heading")` against it either. Switched the section-title assertions to `getByText`/`within` scoped by `[data-slot="card"]` instead of `getByRole("heading")`.
- First draft of the "renders label, both restaurant names, deadline, ... " test asserted the formatted deadline with a plain `getByText(formattedDeadline)`. That failed: `Deadline {new Date(...).toLocaleString()}` renders as two separate JSX text nodes ("Deadline " and the date) inside one `<p>`, so RTL's default text matcher (which matches per-node) couldn't find it. Fixed by matching on the `<p>`'s full `textContent` via a matcher function instead of changing the component (the split-node rendering itself is fine, it's just how JSX renders adjacent expressions).
- Discovered the deadline-matcher test bug only after the red commit was already made (running the full `test_command` for the first time surfaced it, not the initial "confirm expected failure" run, since that run failed on the missing module before ever reaching this assertion). Restructured the red/green split via `git reset --soft` + reflagging which files were staged, rather than leaving a test-only fix inside the green commit, so the red commit's test content matches what actually gets run at green.
- Not called for by the Plan, but the code-reviewer agent caught that `e2e/smoke.spec.ts`'s "SPA shell loads" test asserted `getByRole("button", { name: "Office Lunch" })`, which only existed on the deleted placeholder `Home` component — that e2e spec would have started failing the next time `pnpm test:e2e` ran, even though it's outside this task's own `test_command`. Updated it to assert the new "Open"/"Closed" section text instead and confirmed with `pnpm test:e2e` (Postgres brought up via `pnpm db:up` first) that this spec now passes; folded the one-line fix into the green commit since it hadn't been pushed yet. Two unrelated, pre-existing e2e failures (`admin-restaurants.spec.ts`'s Type-select strict-mode violation, and an apparently-flaky `admin-round-detail.spec.ts` run) are untouched by this task and out of scope.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

Reviewed the red→green diff (`apps/web/src/App.tsx`, `apps/web/src/routes/public/BrowseRounds.tsx`, `apps/web/src/routes/public/usePublicRound.ts`) against the task's Acceptance Criteria/Plan, the real `GET /rounds/public` handler (`apps/api/src/routes/rounds.ts:104-128`), and `RoundList.tsx`'s established conventions.

Verified against the real API contract (not just the MSW mock):
- Route path is `/rounds/public`, registered before `/:id` and `/:id/public` — no shadowing.
- Response is a bare array (`c.json(rows)`), matching `api.get<PublicRoundListItem[]>(...)` — no wrapper envelope.
- Field names match exactly: `id`, `label`, `status`, `deadline`, `foodRestaurantName`, `drinkRestaurantName` (nullable via `leftJoin`).
- `.where(inArray(rounds.status, ["open", "closed"]))` excludes drafts server-side, and `.orderBy(rounds.deadline)` gives ascending order — so the component's non-re-sorting `filter()` calls correctly preserve API order per AC #2.

Conclusion: the frontend implementation is correct and consistent with its backend contract, and matches `RoundList.tsx`'s established patterns (Card/ul/li shape, `!= null` restaurant-name guard, deadline formatting, `RoundStatusBadge` reuse).

### Critical

**Existing e2e smoke test now fails — `e2e/smoke.spec.ts:9-12`** (confidence 90)

The diff deletes the `Home` component (and its "Office Lunch" button) from `App.tsx` and replaces the index route with `BrowseRounds`, which renders no such button, so the "SPA shell loads" smoke test (`getByRole("button", { name: "Office Lunch" })`) would fail the next time `pnpm test:e2e` ran. Not caught by this task's own `test_command`, since that doesn't run e2e.

**Fixed**: updated `e2e/smoke.spec.ts` to assert the "Open"/"Closed" section text instead, and confirmed with a live `pnpm test:e2e` run (Postgres brought up first) that the spec now passes. Folded into the green commit.

### No other high-confidence issues

Everything else in the diff — the `usePublicRound.ts` type/hook additions, `BrowseRounds.tsx`'s loading/error/grouping logic, and the `App.tsx` cleanup — matches the task plan, the acceptance criteria, and existing codebase conventions with no bugs found. The `mutation-feedback.md`/`form-validation.md` rules don't apply here (no mutations or forms in this read-only page).
