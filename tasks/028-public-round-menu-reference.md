---
id: 028
title: Show restaurant menu link/image on the public round page
status: in_progress
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

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
