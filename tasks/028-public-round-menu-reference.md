---
id: 028
title: Show restaurant menu link/image on the public round page
status: done
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm test -- apps/api/src/routes/rounds.test.ts apps/web/src/lib/menu-url.test.ts apps/web/src/routes/public/Round.test.tsx"
created: 2026-08-20
---

## Goal

Admins can already set a menu website link (`menuUrl`) and/or upload a menu image (`menuImage`) per restaurant. The public round page (where an employee picks a Food item / Drink item to order) currently shows neither — the employee has to already know the menu. Surface both, per restaurant, right where the employee is choosing.

## Acceptance Criteria

**API — `GET /rounds/:id/public` (`apps/api/src/routes/rounds.ts`)**

- [ ] Response includes `foodRestaurant: { id, name, menuUrl, menuImage }` for the round's food restaurant, always present.
- [ ] Response includes `drinkRestaurant: { id, name, menuUrl, menuImage }` when the round has a drink restaurant; the key is entirely absent (not `null`) when it doesn't — mirrors the existing `drinkItems` convention.
- [ ] Inside `foodRestaurant`/`drinkRestaurant`, `menuUrl`/`menuImage` are `null` when unset on the restaurant (the object itself is still present).
- [ ] The response never contains `type`, `contactInfo`, `note`, or `createdAt` anywhere in the JSON, for any of the above cases — extend the existing allow-list discipline (the handler already asserts it never leaks `price`).
- [ ] A closed round's response still includes `foodRestaurant`/`drinkRestaurant` (the data is always returned; it's the *page* that chooses not to show it once closed — see below).

**Web util — `apps/web/src/lib/menu-url.ts` (new)**

- [ ] `normalizeMenuUrl("example.com/menu")` → `"https://example.com/menu"`.
- [ ] `normalizeMenuUrl("http://example.com")` → unchanged.
- [ ] `normalizeMenuUrl("https://example.com")` → unchanged.
- [ ] `normalizeMenuUrl("HTTPS://Example.com")` → unchanged (case-insensitive scheme detection, no double-prefixing).
- [ ] `normalizeMenuUrl("  example.com  ")` → `"https://example.com"` (trimmed, then prefixed).

**Web page — `apps/web/src/routes/public/Round.tsx`**

- [ ] When a restaurant's `menuUrl` is set, an "Open menu ↗" link (normalized via `normalizeMenuUrl`, `target="_blank" rel="noopener noreferrer"`) renders directly below its item select, on any screen size.
- [ ] When a restaurant's `menuImage` is set, its image renders both inline below the item select (mobile) and in a sticky right-hand panel (desktop) — same element rendered twice via responsive classes (`lg:hidden` / `hidden lg:block`), not duplicated logic.
- [ ] The desktop panel shows the food restaurant's image on top and the drink restaurant's below (when present), each labeled with the restaurant's name.
- [ ] Each image in the desktop side panel has a small expand button (accessible name e.g. "View full size") that opens the same image in a larger modal dialog; the dialog closes via a close button, clicking the overlay, or Escape. The mobile inline image copy does not get this button.
- [ ] The page is single-column (current `max-w-xl` layout) when neither restaurant has a `menuImage`; it only grows to the two-column grid + side panel when at least one does.
- [ ] A restaurant with neither `menuUrl` nor `menuImage` renders nothing for that side — no empty card, no broken `<a href="">`, no `<img>` with an empty `src`.
- [ ] On a closed round or a deadline-passed round, no menu link or image renders anywhere (these branches already return before the form mounts — don't accidentally wire the new markup into them).
- [ ] Existing fixture-driven tests in `Round.test.tsx` (food-only picker, drink picker, submission flow) keep passing once fixtures gain `foodRestaurant`/`drinkRestaurant`.

## Plan

**API (`apps/api/src/routes/rounds.ts`, `GET /:id/public`, ~lines 185-225):**
Add a local helper alongside the existing `selectCuratedItems`:
```ts
const selectRestaurantMenu = (restaurantId: number) =>
  db
    .select({ id: restaurants.id, name: restaurants.name, menuUrl: restaurants.menuUrl, menuImage: restaurants.menuImage })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId));
```
Fetch `foodRestaurant` unconditionally and `drinkRestaurant` gated on `round.drinkRestaurantId !== null`, and add both to the returned object using the same `...(x ? {x} : {})` spread convention already used for `drinkItems`. No schema/migration change — `menu_url`/`menu_image` columns already exist on `restaurants`.

**Web types (`usePublicRound.ts`):** add `PublicRoundRestaurant = { id, name, menuUrl: string | null, menuImage: string | null }`; extend `PublicRound` with `foodRestaurant: PublicRoundRestaurant` and `drinkRestaurant?: PublicRoundRestaurant`.

**Web util (`apps/web/src/lib/menu-url.ts` + `.test.ts`, new):** small pure function, same shape as `apps/web/src/lib/format-price.ts`/`.test.ts`.

**Web page (`Round.tsx`):**
- New file-local components `MenuLink({ restaurant })` and `MenuImage({ restaurant, className })`, styled to match `RestaurantDetail.tsx`'s existing admin rendering (`text-sm text-muted-foreground hover:text-foreground hover:underline`, `"Open menu ↗"`, `rounded-lg border border-border`) — no shared component with the admin page (that one is upload-form-coupled; this is pure read-only rendering).
- Under the food select (inside `SubmissionForm`): `<MenuLink restaurant={round.foodRestaurant} />` then `<MenuImage restaurant={round.foodRestaurant} className="lg:hidden" />`. Same pattern under the drink select, gated on the existing `round.drinkItems &&` block (drinkRestaurant is guaranteed present whenever drinkItems is).
- New `MenuPanel({ round })`: filters `[foodRestaurant, drinkRestaurant]` to those with a `menuImage`, returns `null` if empty, otherwise a `hidden lg:block lg:sticky lg:top-8 lg:self-start` `<aside>` with one `Card` per restaurant (name as `CardTitle`, image inside). Each image sits in a `relative` wrapper with a small `absolute top-2 right-2` expand button (lucide `Maximize2` icon, `Button variant="ghost" size="icon-sm"`) that opens a `Dialog` showing the same image larger (e.g. `max-h-[90vh] max-w-[90vw] object-contain`).
- New `apps/web/src/components/ui/dialog.tsx` (Root/Trigger/Portal/Overlay/Content/Title/Close), added following the exact structural pattern of the existing `alert-dialog.tsx` (built on the same `radix-ui` package's `Dialog` export, already a dependency — no new package needed). Generic/reusable, not menu-specific, so future features can use it too.
- `Round()`'s main return: compute `hasMenuPanel = foodRestaurant.menuImage !== null || drinkRestaurant?.menuImage != null`; wrap the existing content in a grid that only activates (`lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8`, wider `lg:max-w-5xl`) when `hasMenuPanel`, and render `<MenuPanel>` conditionally alongside it. `lg:self-start` on the aside is required for `position: sticky` to actually stick inside a grid item.
- Closed/deadline-passed branches (lines ~194-211) stay untouched.

**Explicitly out of scope:** normalizing `RestaurantDetail.tsx`'s admin-side menu link (same missing-scheme gap, but a separate concern from this task).

## Implementation Log

- red commit: 08b8edb — `pnpm test -- apps/api/src/routes/rounds.test.ts apps/web/src/lib/menu-url.test.ts apps/web/src/routes/public/Round.test.tsx` -> 9 failing (4 API: `foodRestaurant`/`drinkRestaurant` not yet in the public round response; 1 web util: module not yet created; 5 web page: menu link/image markup not yet wired into `Round.tsx`)
- green commit: edd4891 — same `test_command` -> all 285 passing (full `pnpm test` also 285/285); `pnpm lint` clean on touched files (3 pre-existing `only-export-components` warnings in untouched files); `tsc --noEmit` on `apps/web` clean. Amended in place after the code-reviewer pass to fold in its two findings (see Review Notes) — re-ran the full test/lint pass after amending, still green.

## Plan Deviations

- The task doc file itself (`tasks/028-...md`, `status: in_progress`) was committed together with the failing tests in the red commit, at the user's explicit direction, rather than left uncommitted until the bookkeeping commit in step 10. Everything else about the red/green split followed the Plan and the command's usual steps.
- Otherwise implemented as planned: same file list, same helper shape (`selectRestaurantMenu`), same component breakdown (`MenuLink`/`MenuImage`/`MenuPanel`/`dialog.tsx` following `alert-dialog.tsx`'s structural pattern), same grid-activation approach in `Round()`.

## Review Notes

Output of the `feature-dev:code-reviewer` agent (reviewed the red→green diff, `08b8edb..314bce0`):

### Important (both fixed, folded into the green commit)

- **Container lost its `max-w-xl` cap between `sm` and `lg` once a menu image exists.** `Round.tsx`'s `hasMenuPanel` branch only set a width cap at `lg:max-w-5xl`, so on tablets/small laptops (~577px–1023px) the page went full-bleed instead of staying at the pre-existing 576px cap. Fixed by keeping `max-w-xl` in both branches and letting `lg:` override it.
- **Import order broke the file's established convention.** `@/lib/menu-url` (alphabetically before `@/lib/utils`) was added after `cn`'s import instead of before it. Reordered.

### Not flagged (checked, below the confidence bar, left out)

- Non-null assertions on `round.drinkRestaurant!` — the invariant holds (both `drinkItems`/`drinkRestaurant` are fetched under the same `drinkRestaurantId !== null` guard on the API side), just a style smell.
- `dialog.tsx` omits `DialogDescription`/`DialogHeader`/`DialogFooter` — out of scope per the task's explicit export list; Radix's missing-description warning is non-blocking.
- Sequential (non-`Promise.all`) restaurant queries in `rounds.ts` — real but negligible on a low-traffic public route.
- `menuImageSrc`'s un-encoded `?v=${menuImage}` key and reliance on `normalizeMenuUrl` to neutralize a `javascript:` scheme — both match existing precedent in `RestaurantDetail.tsx`.
- No height cap on the mobile inline `MenuImage` (admin side caps at `max-w-xs`, this doesn't cap height at all) — a portrait phone photo could push the drink picker/Submit button below the fold. Flagged as a legitimate design question the acceptance criteria don't answer, not blocking.
