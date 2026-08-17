---
id: 026
title: Editable restaurant details (name, contact info, note, menu link)
status: approved
depends_on: []
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-17
---

## Goal

Let admins edit a restaurant after creation — today every restaurant field is create-only, with no `PATCH` endpoint at all. Add one: `name` and `contactInfo` become editable (fixing typos or changed phone numbers/Zalo handles without deleting and recreating the restaurant), and two brand-new fields join them — free-text `note` and an external `menuUrl` link to the restaurant's menu website. `type` stays create-only and out of scope: it's load-bearing for round validation (a round's `foodRestaurantId`/`drinkRestaurantId` must reference a restaurant of the matching `type`), so changing it on a restaurant already used by a round risks breaking that invariant — a bigger, separate design question if ever needed.

## Acceptance Criteria

- [ ] `restaurants` table: the existing, never-surfaced `menu_source_note` column is renamed to `note` (general free-text notes; supersedes its narrower original intent now that `menu_url` exists as a dedicated field below); a new nullable `menu_url` column is added. Applied via a `pnpm db:generate`-generated migration (not hand-written SQL), then `pnpm db:migrate`.
- [ ] `docs/architecture.md`'s `Restaurant` row describes `note` and `menu_url` instead of `menu_source_note`.
- [ ] `POST /api/restaurants` accepts optional `note`/`menuUrl` (renamed from `menuSourceNote`); a missing field, non-string, or blank/whitespace-only string all persist as `null`.
- [ ] New `PATCH /api/restaurants/:id` with body `{ name: string, contactInfo: string | null, note: string | null, menuUrl: string | null }`:
  - non-integer `:id` → 404 `restaurantNotFound`
  - missing/blank/whitespace-only `name` → 400 `nameRequired` (checked before any DB query)
  - `contactInfo`/`note`/`menuUrl`: blank/whitespace-only or non-string → `null`; a real string persists as-is
  - nonexistent restaurant → 404 `restaurantNotFound`
  - on success: 200 with the updated row, `type` untouched (not accepted in the body at all)
- [ ] Admin UI:
  - "Add restaurant" form (`Restaurants.tsx`) gains optional `Note` (multi-line) and `Menu website` fields, included in the create request, reset on success. (`name`/`contactInfo`/`type` already exist there, unchanged.)
  - Restaurant detail page (`RestaurantDetail.tsx`) gains a "Details" card with a form pre-filled from the restaurant's current `name`/`contactInfo`/`note`/`menuUrl`, and a "Save" button that calls the new `PATCH` endpoint. `Name` is required with the same inline-error treatment as every other required field (`.claude/rules/form-validation.md`); clearing it and saving shows the error and sends no request. When `menuUrl` is set, an "Open menu ↗" link (opens in a new tab) appears next to the field and updates after a save. The page header (`<h1>{restaurant.name}</h1>`) reflects a saved name change once the query refetches.
  - Success/error feedback via toast per `.claude/rules/mutation-feedback.md`; no confirmation dialog (no destructive side effects — unlike rounds' restaurant-reassignment, nothing else in the app derives from `name`/`contactInfo`/`note`/`menuUrl`).

## Plan

### DB (`packages/db/src/schema.ts`)

1. Rename `menuSourceNote: text("menu_source_note")` to `note: text("note")`. Add `menuUrl: text("menu_url")` right after it.
2. Run `pnpm db:generate` (produces `packages/db/migrations/0003_*.sql` — expect an `ALTER TABLE "restaurants" RENAME COLUMN "menu_source_note" TO "note"` plus an `ADD COLUMN "menu_url" text`; drizzle-kit may prompt to confirm the rename vs. drop+add — confirm rename, don't let it drop data). Review the generated SQL before committing it. Then `pnpm db:migrate`.
3. Update `docs/architecture.md`'s `Restaurant` row: replace `menu_source_note` with `note`, `menu_url` in the Fields column, and reword the Notes column (no longer specifically "where the menu image/link came from" — now general admin notes, with the menu link itself living in its own field).

### API (`apps/api/src/routes/restaurants.ts`)

4. Small local helper near the top of the file: `function optionalText(value: unknown): string | null { return typeof value === "string" && value.trim() !== "" ? value : null; }` — used for `contactInfo`/`note`/`menuUrl` in both routes below.
5. `POST /`: replace the `menuSourceNote` line with `note: optionalText(body.note)`, add `menuUrl: optionalText(body.menuUrl)`. Leave the existing `contactInfo: typeof body.contactInfo === "string" ? body.contactInfo : null` on `POST` exactly as-is (out of scope to change create's long-standing behavior here) — only the new `PATCH` route below uses `optionalText` for `contactInfo`.
6. Add `PATCH /:id`, placed directly after `GET /`:
   ```ts
   restaurantsRoute.patch("/:id", async (c) => {
     const id = Number(c.req.param("id"));
     if (!Number.isInteger(id)) {
       return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
     }
     const body = await c.req.json().catch(() => ({}));
     const name = typeof body.name === "string" ? body.name.trim() : "";
     if (!name) {
       return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
     }
     const contactInfo = optionalText(body.contactInfo);
     const note = optionalText(body.note);
     const menuUrl = optionalText(body.menuUrl);

     const db = getDb(c);
     try {
       const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id));
       if (!existing) {
         return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
       }
       const [row] = await db
         .update(restaurants)
         .set({ name, contactInfo, note, menuUrl })
         .where(eq(restaurants.id, id))
         .returning();
       return c.json(row);
     } catch (e) {
       console.error(JSON.stringify({ message: "failed to update restaurant", error: String(e) }));
       return c.json({ error: ERROR_MESSAGES.internal }, 500);
     } finally {
       await db.$client.end();
     }
   });
   ```
   (Needs `eq` imported from `drizzle-orm` — not currently imported in this file, check and add.) Note `type` is never read from `body` here — even if a client sends it, it's silently ignored, not rejected; that's consistent with how `POST /` already ignores unexpected fields.

### Frontend

7. `apps/web/src/components/ui/textarea.tsx`: new shadcn-style `Textarea`, mirroring `input.tsx`'s structure (`data-slot="textarea"`, same focus/disabled/aria-invalid class treatment, swap `h-8` for a multi-row default like `min-h-16`).
8. `apps/web/src/routes/admin/useRestaurants.ts`:
   - `Restaurant` type: rename `menuSourceNote` → `note`, add `menuUrl: string | null`.
   - `CreateRestaurantInput`: add `note?: string`, `menuUrl?: string`.
   - Add `useUpdateRestaurant(id: number)`, mirroring `useUpdateRound` in `apps/web/src/routes/admin/useRounds.ts`:
     ```ts
     type UpdateRestaurantInput = {
       name: string;
       contactInfo: string | null;
       note: string | null;
       menuUrl: string | null;
     };

     export function useUpdateRestaurant(id: number) {
       const queryClient = useQueryClient();
       return useMutation({
         mutationFn: (input: UpdateRestaurantInput) => api.patch<Restaurant>(`/restaurants/${id}`, input),
         onSuccess: () => {
           queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
           toast.success("Restaurant updated");
         },
         onError: (error) => toastApiError(error, "Could not update restaurant."),
       });
     }
     ```
9. `apps/web/src/routes/admin/Restaurants.tsx`: add `note`/`menuUrl` `useState`s, a `Textarea` field for note and an `Input` for menu website in the "Add restaurant" form (after Contact info), included in `createRestaurant.mutate({ ..., note: note || undefined, menuUrl: menuUrl || undefined })`, reset alongside the other fields on success.
10. `apps/web/src/routes/admin/RestaurantDetail.tsx`: add a `RestaurantDetailsForm` component (non-exported, same file — same reasoning as `RoundDetail`'s `EditRoundForm`: `RestaurantDetail`'s early loading/not-found returns happen before any new `useState` could be added directly), mounted as `<RestaurantDetailsForm key={restaurant.id} restaurant={restaurant} />` in a new "Details" `Card` placed between the header `div` and the existing `lg:grid-cols-[20rem_1fr]` grid.
    - `name`: `useRequiredField("Name is required.", restaurant.name)` (the `initialValue` param already exists on this hook, added by task 020) — same inline-error pattern as the create form.
    - `contactInfo`/`note`/`menuUrl`: plain `useState`s seeded from `restaurant.contactInfo ?? ""` / `restaurant.note ?? ""` / `restaurant.menuUrl ?? ""`.
    - On submit: `name.validate()` first, bail out (no request) if it fails, matching `.claude/rules/form-validation.md`; otherwise `useUpdateRestaurant(restaurant.id).mutate({ name: name.value, contactInfo: contactInfo || null, note: note || null, menuUrl: menuUrl || null })`.
    - When `restaurant.menuUrl` is truthy, render `<a href={restaurant.menuUrl} target="_blank" rel="noopener noreferrer">Open menu ↗</a>` next to the field (reads from the saved `restaurant` prop, not local state, so it only updates after a successful save + refetch).

### Tests

11. API (`apps/api/src/routes/restaurants.test.ts`):
    - `POST /` with `note`/`menuUrl` persists both; omitting them, or sending `""`/whitespace, stores `null` for each independently.
    - New `describe("PATCH /:id")`:
      - updates `name`, `contactInfo`, `note`, `menuUrl` together on an existing restaurant and returns the updated row.
      - clearing `contactInfo`/`note`/`menuUrl` (sending `""` or omitting them — both must map to `null`, since this is a full replace not a partial merge) sets them to `null`.
      - blank/whitespace-only/missing `name` → 400 `nameRequired`, row left unchanged.
      - `type` is never modified even if included in the request body.
      - nonexistent id → 404 `restaurantNotFound`; non-integer id → 404 `restaurantNotFound`.
      - DB-unreachable → 500 via `unreachableEnv`.
12. Frontend:
    - `Restaurants.test.tsx`: create form includes Note/Menu website inputs; submitting with values sends them in the POST body; submitting without them omits/sends `undefined` for both.
    - `RestaurantDetail.test.tsx`: "Details" form renders pre-filled with the restaurant's existing `name`/`contactInfo`/`note`/`menuUrl` (blank inputs when `contactInfo`/`note`/`menuUrl` are `null`); saving calls the PATCH mutation and shows a success toast; clearing the required `Name` field shows the inline error and sends no request; a failed save shows the error toast; when `menuUrl` is set, an "Open menu" link with the correct `href` is rendered, absent when `menuUrl` is `null`; after a successful name change, the page header (`<h1>`) reflects the new name.

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
