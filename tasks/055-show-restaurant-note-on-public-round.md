---
id: 055
title: Show restaurant note on the public round page
status: done
depends_on: []
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm test -- apps/api/src/routes/rounds.test.ts apps/web/src/routes/public/Round.test.tsx"
created: 2026-10-14
---

## Goal

Admins already store a free-text `note` per restaurant (e.g. "Cash only"), but employees never see it on the public round page. Show it under each item select so employees know about it before ordering. The note can contain URLs, so those render as clickable links.

## Acceptance Criteria

**API — `GET /rounds/:id/public` (`apps/api/src/routes/rounds.ts`)**

- [ ] `foodRestaurant` / `drinkRestaurant` objects gain `note: string | null` (`null` when unset on the restaurant). Presence rules unchanged (food only when the round has a food restaurant; `drinkRestaurant` key absent when none).
- [ ] The existing "never leaks `note`" assertion in `rounds.test.ts` (~line 1853-1856) is updated: `note` is now allowed inside the restaurant objects; `contactInfo`, `type`, `createdAt` must still never appear.

**Web page (`apps/web/src/routes/public/Round/`)**

- [ ] The note renders under each item select (below `MenuLink`) for food and drink, labeled so it reads as a restaurant note, preserving line breaks (`whitespace-pre-wrap`). Nothing renders when the note is `null` or blank.
- [ ] URLs in the note (`http(s)://…` and `www.…`) render as clickable links with `target="_blank" rel="noopener noreferrer"`; `www.x.com` links get an `https://` href. Non-http schemes (e.g. `javascript:`) never become links. The rest of the note stays plain text.
- [ ] Rounds without a food restaurant (task 054) show only the drink restaurant's note.
- [ ] Closed and deadline-passed views render no note.

**Admin + docs**

- [ ] The admin "Note" field in `Restaurants.tsx` and `RestaurantDetail.tsx` gets a hint that it's visible to employees on the order page.
- [ ] `docs/architecture.md`'s `Restaurant` row says `note` is shown on the public round page (replacing "general free-text admin notes").

## Plan

**Decisions (from clarifying):** reuse the existing `note` field (no schema change/migration) rather than adding a separate public field; show it under each item select next to the "Open menu ↗" link rather than as a top banner; open form only, same as menu link/image.

**API (`apps/api/src/routes/rounds.ts`):** add `note: restaurants.note` to the select inside `selectRestaurantMenu` (~line 220). The spread/presence logic stays as is.

**Web types (`usePublicRound.ts`):** add `note: string | null` to `PublicRoundRestaurant`.

**New `Round/RestaurantNote.tsx`:** mirrors `MenuLink.tsx` — takes `{ restaurant: PublicRoundRestaurant }`, returns `null` when `!restaurant.note?.trim()`. Renders the text with `linkify-react` (mature wrapper over `linkifyjs`; add with `pnpm --filter web add linkify-react linkifyjs` — check the workspace package name first, and note `pnpm --filter <pkg> test` no-ops but `add` is fine). Link options: `target="_blank"`, `rel="noopener noreferrer"`, and the same classes as `MenuLink` for link styling. Don't hand-roll a regex and never use `dangerouslySetInnerHTML`. To verify first: linkifyjs's default handling of `www.` (should produce an `https://` href) and that it ignores `javascript:` — name these in the red tests rather than assuming.

**`Round/SubmissionForm.tsx`:** render `<RestaurantNote>` right after the two existing `MenuLink` usages (~lines 150, 179), same guards as task 054 (food block only when `round.foodItems`; drink block only when `round.drinkItems`).

**Admin:** add a short helper text under the Note label in `admin/Restaurants.tsx` and `admin/RestaurantDetail.tsx` (e.g. "Shown to employees on the order page.").

**Tests first:** `rounds.test.ts` — `note` value and `null` in the public response, other private fields still absent. `Round.test.tsx` — fixtures gain `note`; cases for shown, hidden when null/blank, drink-only round, closed round, `https://` link, `www.` link, plain text with no link, `javascript:` not linked. Admin tests only if an existing test asserts on the Note label markup.

**Files touched:** `apps/api/src/routes/rounds.ts`, `rounds.test.ts`, `apps/web/package.json` (+ lockfile), `apps/web/src/routes/public/usePublicRound.ts`, `Round/RestaurantNote.tsx` (new), `Round/SubmissionForm.tsx`, `Round.test.tsx`, `admin/Restaurants.tsx`, `admin/RestaurantDetail.tsx`, `docs/architecture.md`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 6d60824 — `pnpm test -- apps/api/src/routes/rounds.test.ts apps/web/src/routes/public/Round.test.tsx` -> 8 failing (2 API: `note` missing from the public response; 6 web: note not rendered/linkified)
- green commit: 16495d1 — same `test_command` -> all passing; full `pnpm test` 444/444; `pnpm lint` clean on touched files (3 pre-existing `only-export-components` warnings in untouched files); `tsc --noEmit` on `apps/web` clean.

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- `linkifyjs` defaults bare `www.` links to `http://`, not `https://` as the Plan assumed. Fixed by setting `defaultProtocol: "https"` in the Linkify options (caught by the red test).
- The first green run also needed `note: null` added to an existing drink-restaurant `toEqual` in `rounds.test.ts` (an older test, made stale by the new field); that edit landed in the green commit rather than the red one.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

No high-confidence issues found. The reviewer checked: link safety (React escaping, `javascript:` not linkified, `rel="noopener noreferrer"`, no `dangerouslySetInnerHTML`); the public API only gains `restaurants.note` (no admin-only fields leak); null/blank notes render nothing and `whitespace-pre-wrap` keeps line breaks; placement matches `MenuLink` for food and drink. Caveats from the reviewer: it judged the web side from the diff alone, and didn't verify closed/deadline views (covered by the "shows no note on a closed round" test, which passes). `linkify-react` + `linkifyjs` both as direct deps is correct (peer dependency).
