---
id: 008
title: Public round view (employee-facing read)
status: in_review
depends_on: [007]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-02
---

## Goal

The read side of the employee-facing link the admin will share: shows the round's curated food/drink items so an employee can see what's on offer before submitting (submission itself is task 009). A `draft` round must not leak its existence or contents through this endpoint — the admin controls when it becomes visible by opening it (task 007).

## Acceptance Criteria

- [ ] `GET /api/rounds/:id/public` returns round `label`, `deadline`, curated food items, curated drink items — **only** when `drinkRestaurantId` is set (omitted entirely otherwise, not an empty array); no `price` in the response
- [ ] A `draft` round returns 404/403 from this endpoint (not partial/empty data — full non-existence signal)
- [ ] `/r/:roundId` route renders the round info and a read-only view of available items, plus "not open yet" / "deadline passed" / "closed" messaging as appropriate for non-open states reachable after a round transitions

## Plan

1. Add `GET /api/rounds/:id/public` to `apps/api/src/routes/rounds.ts`, selecting only the columns needed (explicit column selection, not `select *`, per the no-price rule).
2. TDD units: `draft` round -> 404/403; `open` round with no `drinkRestaurantId` -> response has no drink section at all; `open` round with a drink restaurant -> drink items included; response never contains a `price` field.
3. UI: `apps/web/src/routes/public/Round.tsx` mounted at `/r/:roundId`, read-only rendering only (submission form lands in task 009).

## Implementation Log

- red commit: 1c6f9b6 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 4 failing (API: open/drink/closed cases) + 1 web suite failing to resolve `./Round`. The two 404-only API tests (draft round, nonexistent round) already passed at red — a missing route falls through to Hono's default 404, which happens to match the expected status without any of this task's code existing yet. Confirmed this was the only "free" pass by checking the two tests that assert response *bodies* (`drinkItems` omission, no `price`, identical draft-vs-nonexistent body) still failed for the right reason.
- green commit: afe9469 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (132 tests). This sha is after two review-driven amends (see Plan Deviations and Review Notes) — the original green landed at e45bac4 with 131 tests; a first-pass code review found a real bug and a second pass caught a test-naming nitpick, both folded into this same not-yet-pushed commit rather than left as separate fixup commits.

Also ran, outside `test_command` (per this repo's established pattern from task 007): `pnpm lint` clean on touched files, and a new Playwright e2e spec (`e2e/public-round.spec.ts`) covering the curate → open → view-public-page → close → view-public-page-again flow through the real UI, plus a direct `/r/999999999` check for the generic not-open-yet message.

## Plan Deviations

- **Response shape grew one field beyond the AC's literal list.** AC-1 enumerates `label`, `deadline`, food items, drink items. Added a `status` field (`"open" | "closed"`) too — AC-3 requires the UI to tell "closed" apart from "open, deadline passed," and the endpoint can't leak `"draft"` (that 404s), so `status` only ever has two possible values in a successful response. Not optional: without it the frontend has no way to distinguish the two non-open UI states.
- **Chose the UI→message mapping the AC only implies.** AC-3 lists three messages ("not open yet" / "deadline passed" / "closed") but doesn't map them to states explicitly. Landed on: any fetch failure (404, which is the only error status this endpoint returns for a real client) → "This round isn't open yet." (deliberately reused for both draft and truly-nonexistent rounds, matching the API's own non-existence signal); `status === "closed"` → "This round is closed."; `status === "open"` with `deadline` in the past → "The deadline for this round has passed."; otherwise → the normal read-only item list. Added a test asserting the draft-round and nonexistent-round messages are byte-identical, since that's the guarantee most likely to silently break later (e.g. someone adding 403-vs-404 branching).
- **`id` field on each item is the `RoundMenuItem` id, not the underlying `MenuItem` id.** Picked deliberately because `submissions.foodRoundMenuItemId`/`drinkRoundMenuItemId` reference `roundMenuItems.id` (see `docs/architecture.md`), so task 009's submission form can post this id straight through without a second lookup. Left a comment on the type since the field name alone doesn't make this obvious.
- **Curated items aren't filtered by `menuItems.active`.** Matches the existing `GET /:id/menu-items` admin endpoint, which also doesn't filter. Consequence carried over from task 007, not introduced here: if an item is deactivated after being curated into an open round, it still appears on this public page, and the admin has no way to un-curate it from `RoundDetail` (which only lists *active* items as curation checkboxes). Flagging since nothing else records it.
- **Confirmed, rather than assumed, the known e2e cross-file conflict from task 007's notes.** `e2e/admin-round-detail.spec.ts` and this task's new `e2e/public-round.spec.ts` each open a round, and opening 409s if another round is already open. Ran both together (`pnpm exec playwright test e2e/public-round.spec.ts e2e/admin-round-detail.spec.ts`) and reproduced the failure — `admin-round-detail.spec.ts`'s "Round opened" assertion times out when `public-round.spec.ts`'s round is still open on another worker. Confirmed each spec is green in isolation. Not fixed (out of scope, same as `admin-nav.spec.ts`'s pre-existing failure noted in task 007) — `test_command` doesn't run `test:e2e`, so this doesn't gate anything, but recording it here since it's now reproduced rather than theoretical.
- **Local dev environment blocker, unrelated to app code:** `pnpm db:up` initially failed — port 5432 was already bound by an unrelated project's container (`staffing-postgres`, healthy, 7 days old). Asked the user before touching it; they confirmed stopping it. Noting here since a future session hitting the same port conflict shouldn't assume it's safe to stop another container without asking first.
- Also had to switch the `origin` remote from SSH to HTTPS (`gh auth setup-git`) mid-task — the sandboxed environment had no SSH key loaded for `git@github.com`, only a working `gh` HTTPS token. Needed before `git pull`/`git push` would work at all.
- **First code-review pass was run with a literal unfilled placeholder instead of the actual diff text** — a copy-paste mistake in the reviewer prompt, not a process issue with the step itself. The agent noticed the diff was missing and recovered by reading the touched files directly instead of failing outright, and still surfaced a real, correctly-scoped finding (see Review Notes below) — but re-ran the review properly with the actual diff embedded once the bug it found was fixed, per this command's own instruction to paste the diff directly (the reviewer agent has no `Bash`/`git diff` access of its own). Flagging in case a future session sees a review that "read files directly" and wonders why — this is why, and it's now fixed for the two later passes.

## Review Notes

**First pass** (run against files read directly, not the diff — see Plan Deviations; still valid):

- What's correct: try/catch/finally + structured `console.error` + `ERROR_MESSAGES.roundNotFound` convention followed exactly; draft/nonexistent 404 bodies verified byte-identical; explicit column selection confirmed to exclude `price`; `drinkItems` omitted (not `[]`) when no drink restaurant, and tested; `/r/:roundId` correctly registered outside `AdminLayout`; no toast/mutation convention needed since read-only.
- **Important finding (confidence 80): a 5xx/network failure was indistinguishable from "round doesn't exist yet" in the UI.** `Round.tsx` branched on `isError` alone with no status check. Since the global TanStack retry policy (`query-client.ts`) retries non-4xx errors twice before settling into `isError`, a real backend outage would render the exact same "This round isn't open yet." message as a draft/nonexistent round — actively misleading an employee into thinking the round simply isn't open rather than that something is broken. Suggested fix: branch on `error instanceof ApiError && error.status === 404` for the not-open-yet message, and show a distinct message otherwise, while keeping the draft-vs-nonexistent indistinguishability intact.
  - **Fixed.** Added the `ApiError`/`status === 404` check in `Round.tsx`, plus a new unit test (`Round.test.tsx`: "shows a distinct error message for a real backend failure, not the not-open-yet message") asserting the two messages are mutually exclusive. Folded into the still-unpushed green commit.
- Noted but not flagged (below threshold, both pre-existing/out-of-scope): curated items not filtered by `menuItems.active` (matches `GET /:id/menu-items`'s existing behavior, already called out in Plan Deviations); a same-restaurant-for-food-and-drink edge case that isn't reachable in practice because `POST /:id/menu-items`'s restaurant-match guard prevents it.

**Second pass** (run with the actual diff pasted in, after the fix above):

- Verified the fix directly: `ApiError.status` is set from the real HTTP status in `api.ts`'s `request()`, the two branches (`error instanceof ApiError && status === 404` vs. everything else) are mutually exclusive and jointly exhaustive over `isError`, confirmed against both the existing draft/missing body-equality test and the new 500-path test.
- Security/leak audit: no issues — response shape is exactly `{label, deadline, status, foodItems[, drinkItems]}`, both item queries filter by the round's own restaurant ids (never user input), draft/nonexistent 404s stay identical.
- Convention adherence: no deviation from the established route-handler pattern.
- No other high-confidence (≥80) issues found.
- **Minor note (confidence ~60, below reporting threshold):** the e2e spec's second test was titled `"a draft round's public link shows the same generic message as an unknown one"` but its body only ever visited a nonexistent round, not an actual draft one — the comparison implied by the name wasn't actually exercised there (already covered at the API/unit level, so not a coverage gap, just a misleading title).
  - **Fixed.** Renamed to `"an unknown round's public link shows the generic not-open-yet message"` with a comment pointing at where the draft-round case is actually covered. Folded into the same green commit.

No unresolved findings from either pass.
