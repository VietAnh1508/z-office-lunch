---
id: 010
title: Admin submissions view + CSV export
status: in_review
depends_on: [007, 009]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

Closes the loop: admin sees who's submitted what for a round and can export it as a CSV (project-idea.md item 7) — names + dish/drink, `price` excluded, opening cleanly in Excel including with Vietnamese names. Grouped/counted tallies are explicitly deferred (nice-to-have).

## Acceptance Criteria

- [x] `GET /api/rounds/:id/submissions` returns already-resolved rows (`employeeName`, `foodName`, `foodNote`, `drinkName | null`, `drinkNote | null`) via a join — no raw FKs, no `price`, so the client never does its own joining or has to remember to drop a field
- [x] Admin round-detail screen shows a submissions table and an "Export CSV" button
- [x] `apps/web/src/lib/csv.ts` exports a pure `toCsv()` function: properly escapes commas/quotes/newlines in free-text notes, prepends a UTF-8 BOM
- [x] `toCsv()` has its own Vitest unit test (no DB, no jsdom) — a note containing a comma, a quote, and a newline round-trips correctly; output starts with the BOM byte sequence

## Plan

0. The admin nav/routing shell (`AdminLayout`, `/admin/rounds`) already exists as of task 014 — this task only extends the round-detail screen (added in task 007) with a submissions table and export button, it doesn't need new top-level admin routing.
1. Add `GET /api/rounds/:id/submissions` to `apps/api/src/routes/rounds.ts` — a join across `Submission` → `Employee`, `RoundMenuItem` → `MenuItem` (food and drink), explicit column selection (never `price`).
2. TDD unit: response shape has resolved names, never a `price` field, never raw `*RoundMenuItemId` FKs.
3. `apps/web/src/lib/csv.ts` — `toCsv(rows)` pure function; TDD unit exercises the escaping + BOM cases directly, no DB/network involved.
4. UI: extend the admin round-detail screen with a submissions table and an "Export CSV" button that builds the blob client-side via `toCsv()` and triggers a download.

## Implementation Log

- red commit: `d3b0431` — `pnpm test -- apps/web/src/lib/csv.test.ts apps/web/src/routes/admin/RoundDetail.test.tsx apps/api/src/routes/rounds.test.ts` -> 5 failing on the actual assertions (`rounds.test.ts` GET returning 404 instead of 200/500 — endpoint doesn't exist yet) plus 2 test files failing to resolve not-yet-created modules (`./csv`, `@/lib/download`). The full chained `test_command` would have stopped at the `pnpm -r typecheck` stage instead (missing-module type errors), which is the "config error, not the assertion" case — ran the test stage directly to get a real red signal.
- green commit: `49ce133` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (223/223 tests). Also ran `pnpm test:e2e -- e2e/public-round-submission.spec.ts` directly to confirm the extended e2e coverage passes.

## Plan Deviations

- The e2e spec extension (submissions table + CSV download assertions in `e2e/public-round-submission.spec.ts`) was written and verified *after* the green commit, not as an upfront red test, then folded into the green commit by amendment (confirmed with the user first, since amending isn't itself pre-authorized). The Plan's step 4 didn't call out e2e coverage explicitly, and by the time it became clear this user-facing flow warranted it, red/green for the unit/API/component layer was already committed; re-doing red/green from scratch for one added spec wasn't worth reordering history for.
- Split the download side effect into its own `apps/web/src/lib/download.ts` (`downloadCsv(filename, content)`) rather than folding it into `csv.ts`, so `csv.ts` stays a pure, DOM-free function per the Acceptance Criteria and is trivially unit-testable; the component test mocks `downloadCsv` directly instead of touching `Blob`/`URL.createObjectURL`/anchor-click APIs, which jsdom doesn't fully implement. Not called out in the Plan but a natural consequence of "toCsv() has its own Vitest unit test (no DB, no jsdom)".
- The GET route deliberately does *not* 404 on a nonexistent/draft round — it mirrors the existing sibling `GET /:id/menu-items` route's shape (empty array for a bad/nonexistent id, no round-existence check) rather than inventing a new error path the Acceptance Criteria didn't ask for.
- While running the full e2e suite for verification, two unrelated pre-existing tests (`admin-restaurants.spec.ts`'s duplicate `getByLabel('Type')` strict-mode violation, and flaky "Round opened" visibility depending on run order/worker count) failed. Reproduced identically with this task's changes stashed out, confirming they're pre-existing issues, not a regression from this task — left unfixed as out of scope.
- Discovered mid-task that adding any new query to `RoundDetail` breaks every existing test in `RoundDetail.test.tsx` (MSW's `onUnhandledRequest: "error"` plus each test enumerating its own handlers) — added the new `/api/rounds/1/submissions` handler to all 21 existing `server.use()` blocks in that file, matching the file's established per-test full-control convention rather than introducing a new default-handler pattern that doesn't otherwise exist in this codebase.

## Review Notes

Reviewed by `feature-dev:code-reviewer` against the diff between the red and green commits (d3b0431..49ce133).

**No issues at or above the 80-confidence threshold.** Summary of what was checked and confirmed clean:

- **Drizzle query correctness**: `employeeId` and `foodRoundMenuItemId` are `.notNull()` in the schema, so the inner joins on `employees` and `foodRoundMenuItemAlias`/`foodMenuItemAlias` can't silently drop submission rows. `drinkRoundMenuItemId` is nullable and is correctly `leftJoin`ed on both hops (round-menu-item → menu-item), so a food-only submission yields `drinkName`/`drinkNote` as `null` rather than dropping the row. Every join key is a primary key, so there's no row multiplication. The explicit column list never exposes `price` or raw FK columns, matching the doc comment. `orderBy(submissions.id)` gives a stable, deterministic order.
- **Route shape vs. sibling `GET /:id/menu-items`**: non-integer/missing id returns `c.json([])` before `getDb(c)` is even called (no leaked connection), and a DB-unreachable case returns a structured `{ error }` 500 via the standard try/catch/finally with `await db.$client.end()` — this is a byte-for-byte match of the established pattern in `GET /:id/menu-items` and is exactly what the committed tests assert.
- **CSV logic**: escaping and BOM prepending round-trip correctly per the tests in `csv.test.ts`, including commas/quotes/newlines and non-ASCII text; the BOM is a real `U+FEFF` character in the source, not an escape sequence, so it serializes as `EF BB BF` in the Blob.
- **`downloadCsv`**: the synchronous `URL.revokeObjectURL` right after `link.click()` is a real footgun in general (WebKit can revoke before the download starts), but `playwright.config.ts` defines no `projects` array, so the e2e suite only runs Chromium, where this is safe. Not worth flagging given the actual test matrix.
- **e2e extension**: drink note "Less ice" is genuinely set earlier in the same spec before submission, and `employeeName` is a `Date.now()`-suffixed unique string that only appears in the new submissions table on that admin page — no strict-mode `getByRole("cell", ...)` collision risk.
- **React/TanStack Query wiring**: `useRoundSubmissions` follows the exact same key/query pattern as the sibling `useRoundMenuItems` hook; correctly a plain `useQuery` with no mutation, so the mutation-toast rule doesn't apply. No stale-closure or missing-key issues in the table render (`key={submission.id}`).
- **Convention checks confirmed not applicable**: no `useMutation` here (no toast rule violation), no new required text input (no `useRequiredField` needed), `CardAction` does exist in `apps/web/src/components/ui/card.tsx` so the import is valid.
- **Test coverage**: there is direct component-level coverage of the Export CSV button wiring (`RoundDetail.test.tsx`, mocking `downloadCsv` and asserting on the generated CSV content/filename) in addition to the e2e assertion.

Two sub-threshold observations worth surfacing but not blocking:
- `escapeCsvField` doesn't neutralize formula-injection-prone leading characters (`=`, `+`, `-`, `@`) before free-text notes hit a spreadsheet. Confidence ~50 — real but minor, and the doc comment's "RFC 4180" claim is accurate since RFC 4180 doesn't cover this.
- `RoundDetail.tsx`'s `submissions` query has no `isError` branch, so a failed fetch would render "No submissions yet." instead of an error state. Confidence ~40 — this is a pre-existing pattern already present in `useRoundMenuItems`'s usage in the same file, not a regression introduced by this diff.
