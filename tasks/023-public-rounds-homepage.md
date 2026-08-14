---
id: 023
title: Public rounds-list homepage (Open/Closed sections)
status: approved
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

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
