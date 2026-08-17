---
id: 027
title: Restaurant menu image upload
status: in_review
depends_on: [026]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-08-17
---

## Goal

Let admins upload a photo of a restaurant's physical menu, stored in the already-declared but never-used `MENU_IMAGES` bucket (Cloudflare R2, per `docs/architecture.md`), and view/replace/remove it from the restaurant detail page's "Details" card (added in task 026). This is the first binary-file-upload feature in the app — no upload/serve code exists anywhere yet, despite `restaurants`/`menuItems` having dormant storage-key columns and bindings. The stored value is just called `menuImage` throughout the schema/API/UI — the fact that it's backed by R2 stays an implementation detail confined to where the binding is actually called, not baked into field/column names (a future storage-backend swap shouldn't require a rename).

## Acceptance Criteria

- [ ] `restaurants` table gets a new nullable `menu_image` column, applied via `pnpm db:generate`/`pnpm db:migrate`.
- [ ] `POST /api/restaurants/:id/menu-image` — `multipart/form-data` with a `menuImage` file field:
  - request body over 10MB → 413 (before the handler runs, via `hono/body-limit`'s `bodyLimit`)
  - non-integer `:id` → 404 `restaurantNotFound` (checked before parsing the body)
  - missing/non-file `menuImage` field → 400 `menuImageRequired`
  - `file.type` not one of `image/jpeg`, `image/png`, `image/webp` → 400 `menuImageTypeInvalid`
  - nonexistent restaurant → 404 `restaurantNotFound` (checked only after the file itself validates — a bad file against a nonexistent id is 400, not 404)
  - on success: stores the file, sets `menuImage` on the restaurant row to a fresh unique key, deletes the previously stored image if one existed (best-effort; failure to delete the old one doesn't fail the request), returns the updated row (200)
  - a re-upload replaces the existing image (old one no longer retrievable)
- [ ] `GET /api/restaurants/:id/menu-image`:
  - nonexistent restaurant, or a restaurant with no `menuImage` → 404 `menuImageNotFound` (pick one consistent error body shape for both cases, see Plan)
  - otherwise streams the stored image bytes with the `Content-Type` recorded at upload time, plus `Cache-Control: no-cache` and an `ETag`
- [ ] `DELETE /api/restaurants/:id/menu-image`:
  - nonexistent restaurant or no image set → 404
  - otherwise clears `menuImage` on the row, best-effort deletes the stored image, returns the updated row (200)
- [ ] Admin UI: the "Details" card on `RestaurantDetail.tsx` (from task 026) gains a file picker, an image preview when `menuImage` is set, and a "Remove image" button; uploading a new file replaces any existing preview; toasts on success/failure per `.claude/rules/mutation-feedback.md`.

## Plan

### DB (`packages/db/src/schema.ts`)

1. Add `menuImage: text("menu_image")` to the `restaurants` table (after `menuUrl`). `pnpm db:generate` (review the generated SQL — expect a single `ADD COLUMN`), then `pnpm db:migrate`.

### API

2. `apps/api/src/lib/errors.ts`: add
   ```ts
   menuImageRequired: "menuImage file is required",
   menuImageTypeInvalid: "menuImage must be a JPEG, PNG, or WebP image",
   menuImageTooLarge: "menuImage must be 10MB or smaller",
   menuImageNotFound: "this restaurant has no menu image",
   ```
3. `apps/api/src/test/fake-menu-images-bucket.ts` (new file) — an in-memory fake matching the `MENU_IMAGES` binding's real shape (`R2Bucket`) closely enough for route code to run unmodified against it:
   ```ts
   export function createFakeMenuImagesBucket() {
     const objects = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string }; httpEtag: string }>();
     let etagCounter = 0;
     return {
       objects, // exposed for tests to assert exact contents/count directly
       async put(key: string, value: File | Blob | ArrayBuffer | ArrayBufferView | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }) {
         const bytes = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
         const httpEtag = `"fake-etag-${etagCounter++}"`;
         objects.set(key, { bytes, httpMetadata: options?.httpMetadata, httpEtag });
         return { key, httpEtag };
       },
       async get(key: string) {
         const object = objects.get(key);
         if (!object) return null;
         return { ...object, body: new Response(object.bytes).body };
       },
       async delete(keys: string | string[]) {
         for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
       },
     };
   }
   ```
   Used per-test as `{ ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() }` (a fresh instance each time — never shared via `testEnv` itself, so state can't leak across tests in the same file).
4. `apps/api/src/routes/restaurants.ts`:
   ```ts
   import { bodyLimit } from "hono/body-limit";

   const MENU_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // phone photos of a physical menu
   const MENU_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
   // HEIC/HEIF deliberately excluded — iPhones can produce it, but it won't render
   // in an <img> outside Safari, so accepting it would store an unviewable file.

   function menuImageKey(restaurantId: number) {
     return `restaurants/${restaurantId}/${crypto.randomUUID()}`;
   }
   ```
   - `POST /:id/menu-image`, with `bodyLimit({ maxSize: MENU_IMAGE_MAX_BYTES, onError: (c) => c.json({ error: ERROR_MESSAGES.menuImageTooLarge }, 413) })` as route middleware:
     - `id` parse → 404 `restaurantNotFound` (before touching the body — matches every other `:id` route in this file).
     - `const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)`; `const file = body.menuImage`; not `instanceof File` → 400 `menuImageRequired`; `!MENU_IMAGE_ALLOWED_TYPES.has(file.type)` → 400 `menuImageTypeInvalid`. Both checks before `getDb(c)`.
     - `getDb(c)` → fetch existing row → 404 `restaurantNotFound` if missing.
     - `const key = menuImageKey(id); await c.env.MENU_IMAGES.put(key, file, { httpMetadata: { contentType: file.type } });`
     - Update the row inside a nested `try`; if it throws, best-effort `await c.env.MENU_IMAGES.delete(key).catch(() => {})` before rethrowing to the outer `catch` (don't orphan the just-uploaded file on a DB failure).
     - If `existing.menuImage` was set, best-effort `await c.env.MENU_IMAGES.delete(existing.menuImage)` after the row update succeeds (log-and-ignore on failure — the new upload already succeeded and is what the row points at).
     - Return `c.json(row)` (200).
     - Standard try/catch/finally around the DB-touching parts (`getDb(c)` at the top, `db.$client.end()` in `finally`), per `.claude/rules/api-error-handling.md`.
   - `GET /:id/menu-image`:
     - `id` parse → 404 `restaurantNotFound`.
     - `getDb(c)` → fetch restaurant → 404 `restaurantNotFound` if missing → 404 `menuImageNotFound` if `menuImage` is null.
     - `const object = await c.env.MENU_IMAGES.get(restaurant.menuImage)`; if `null` (DB/storage drift), log a `console.error` and return 404 `menuImageNotFound`.
     - `c.header("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream")`, `c.header("Cache-Control", "no-cache")`, `c.header("ETag", object.httpEtag)`, `return c.body(object.body as ReadableStream)`.
     - Still wrapped in try/catch/finally — it queries the DB even though the response body streams from storage; `db.$client.end()` in `finally` runs before the stream is consumed by the client, which is fine (the two are independent).
   - `DELETE /:id/menu-image`:
     - `id` parse → 404 `restaurantNotFound`.
     - `getDb(c)` → fetch restaurant → 404 `restaurantNotFound` if missing → 404 `menuImageNotFound` if no image set.
     - `update(restaurants).set({ menuImage: null }).where(eq(id)).returning()`, then best-effort `c.env.MENU_IMAGES.delete(existing.menuImage)` (log-and-ignore on failure).
     - Return `c.json(row)` (200).

### Frontend

5. `apps/web/src/lib/api.ts`:
   - `request()`: only set `Content-Type: application/json` when the body isn't `FormData` — `...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" })`.
   - Add `upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData })`.
6. `apps/web/src/routes/admin/useRestaurants.ts`:
   - Add `menuImage: string | null` to `Restaurant`.
   - `useUploadRestaurantMenuImage(id: number)`: `mutationFn: (file: File) => { const formData = new FormData(); formData.append("menuImage", file); return api.upload<Restaurant>(\`/restaurants/${id}/menu-image\`, formData); }`, `onSuccess` invalidates `restaurantKeys.list()` + `toast.success("Menu image uploaded")`, `onError` → `toastApiError(error, "Could not upload menu image.")`.
   - `useDeleteRestaurantMenuImage(id: number)`: `mutationFn: () => api.delete<Restaurant>(\`/restaurants/${id}/menu-image\`)`, same invalidate, `toast.success("Menu image removed")`, `toastApiError(error, "Could not remove menu image.")`.
7. `apps/web/src/routes/admin/RestaurantDetail.tsx`'s `RestaurantDetailsForm` (from task 026): add a hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` behind a visible "Upload menu image" button, wired to `useUploadRestaurantMenuImage(restaurant.id)`; when `restaurant.menuImage` is set, render `<img src={`/api/restaurants/${restaurant.id}/menu-image?v=${restaurant.menuImage}`} alt="Menu" />` plus a "Remove image" button wired to `useDeleteRestaurantMenuImage(restaurant.id)`. The `?v=<key>` query param busts the browser's image cache after a replace (the `<img>` tag fetches independently of TanStack Query's cache).

### Tests

8. API (`apps/api/src/routes/restaurants.test.ts`, using `createFakeMenuImagesBucket()` per test):
   - upload success: row's `menuImage` is set, fake bucket has exactly one object with the right bytes/content-type.
   - re-upload replaces: old key no longer in `objects`, new key present, row updated.
   - missing file → 400 `menuImageRequired`; wrong type (e.g. `text/plain`) → 400 `menuImageTypeInvalid`; both checked before any DB query (assert via a nonexistent restaurant id still returning 400, not 404).
   - oversized file → 413 (build a `File` bigger than `MENU_IMAGE_MAX_BYTES`).
   - nonexistent restaurant with a *valid* file → 404 `restaurantNotFound`.
   - DB-unreachable → 500 via `unreachableEnv` (with a valid file, so the failure is attributable to the DB step, not validation).
   - serve: success returns the right bytes/content-type; 404 when no image set; 404 for a nonexistent restaurant.
   - delete: success clears the key and removes the fake bucket object; 404 when no image was set.
9. Frontend (`RestaurantDetail.test.tsx`): upload control renders; selecting a file triggers the upload mutation and shows a preview + success toast; "Remove image" clears the preview and shows a success toast; a failed upload shows the error toast without a preview appearing.

## Implementation Log

- red commit: `71d9108` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 14 failing (all 404s from the not-yet-implemented menu-image routes, plus 3 frontend failures from the not-yet-added upload/preview/remove UI)
- green commit: `12af190` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (typecheck clean across all 3 packages, web build succeeds, 272/272 vitest tests pass); also ran `pnpm test:e2e` (11/11 passing, confirming the shared `RestaurantDetailsForm` change didn't break the existing menu-item/restaurant-detail e2e flows) and `pnpm lint` (clean; the 3 pre-existing `only-export-components` warnings are in files this task doesn't touch)

## Plan Deviations

- DB schema/migration (`packages/db/src/schema.ts`, the migration files) and the `errors.ts` constant additions were committed in the green commit rather than the red one, even though the Plan lists them ahead of the Tests section. This matches the precedent set by task 026's red/green split (schema changes land in green): the test files don't import `errors.ts` (they assert on literal `error` strings in response bodies) and the schema/migration were only needed so the DB column existed for the route implementation to touch, not for the tests to fail correctly — with only the route implementation missing, every new test already failed with the expected 404 regardless of whether the schema change was staged.
- The code-reviewer flagged that the initial upload trigger — a `<label htmlFor>` styled via `buttonVariants` to look like a button, sitting behind a `sr-only` `<Label>` for the same input — was keyboard-inaccessible (labels aren't part of the tab order and don't respond to keyboard activation) and had two knock-on issues (duplicate `htmlFor`/`id` producing a doubled accessible name, and `disabled` having no effect on a `<label>` so `uploadMenuImage.isPending` wasn't gating it like the other two mutations' buttons do). Fixed by switching to a real `<Button onClick={() => inputRef.current?.click()}>` behind a `useRef`, dropping the button-styled label and keeping only the `sr-only` `<Label>` on the input — confirmed this didn't require any test changes (`getByLabelText` still resolves via the remaining label).

## Review Notes

Output of the `feature-dev:code-reviewer` agent (run against the red→green diff, before the accessibility fix above was applied — the fix addresses the first "Important" finding):

> ## Review: Task 027 — Restaurant menu image upload
>
> Reviewing the diff described (API routes in `apps/api/src/routes/restaurants.ts`, `apps/api/src/lib/errors.ts`, frontend in `apps/web/src/routes/admin/RestaurantDetail.tsx`, `apps/web/src/routes/admin/useRestaurants.ts`, `apps/web/src/lib/api.ts`, schema in `packages/db/src/schema.ts`). I cross-checked this against `tasks/027-restaurant-menu-image-upload.md`'s detailed Plan (the implementation follows it almost line-for-line), `.claude/rules/api-error-handling.md`, and `.claude/rules/mutation-feedback.md`.
>
> **`api-error-handling.md` and `mutation-feedback.md` compliance: clean.** Every DB-touching handler has the standard try/catch/finally with `db.$client.end()`, structured `console.error` logging, and `ERROR_MESSAGES`-sourced strings. Both new mutations follow the toast pattern exactly (`onSuccess` → invalidate + static `toast.success`, `onError` → `toastApiError` with a fallback, local `onSuccess` at the call site only for the preview side effect).
>
> ### Important
>
> **Keyboard-inaccessible upload trigger** — `apps/web/src/routes/admin/RestaurantDetail.tsx:112-132`. Confidence: 85.
>
> The actual `<input type="file">` is `className="hidden"` (`display: none`), and the visible "Upload menu image" control is a plain `<label htmlFor="restaurant-detail-menu-image">` styled via `buttonVariants` to look like a button.
>
> A `<label>` has no implicit `tabindex` and is never part of the keyboard tab order. The browser's native "clicking a label forwards the click to its associated control" behavior only fires on an actual mouse/touch click event — it doesn't fire from a keydown on a focused element, because the label never receives focus to begin with. Net effect: a keyboard-only or screen-reader user cannot open the file picker at all; the control is visually present but operable only by mouse.
>
> This also explains two secondary symptoms with the same root cause, worth fixing together rather than separately:
> - Two elements target the same id via `htmlFor`/`id` (the `sr-only` `<Label>` and this button-styled `<label>`) — accessible-name computation will concatenate them into something like "Upload menu image Upload menu image".
> - `disabled` has no effect on a `<label>`, so `uploadMenuImage.isPending` is never used to gate the trigger — inconsistent with `updateRestaurant.isPending` and `deleteMenuImage.isPending`, which do gate their buttons.
>
> Fix: use a real `<Button type="button" disabled={uploadMenuImage.isPending} onClick={() => inputRef.current?.click()}>`, keep the input hidden behind a `useRef`, and drop the button-styled `<label>` — leave the `sr-only` `<Label>` as the input's only label. This keeps the current tests green: `getByLabelText("Upload menu image", { exact: false })` still resolves to the input via the remaining `sr-only` label, so no test changes are needed.
>
> **`apps/api/wrangler.jsonc`'s R2 binding still has a placeholder bucket name** — `bucket_name: "replace-me"` (not touched by this diff). Confidence: 80.
>
> This is the first task to actually call the `MENU_IMAGES` binding — it's been declared-but-dormant until now. CLAUDE.md's instruction to ignore `REPLACE_ME`/`replace-me` placeholders is scoped to local dev (`wrangler dev` simulates R2 locally regardless of the configured name), but nothing in this task's `test_command` exercises the real binding — unit tests inject `createFakeMenuImagesBucket()` and typecheck only checks the `R2Bucket` interface shape. If this is still a placeholder at deploy time, upload/serve/delete will all fail against a real R2 bucket with a fully green test suite and no local-dev signal. Worth confirming/filling in before this ships to production, even though it's outside this diff's file list.
>
> ### Not flagged (considered, below the 80 bar)
>
> - Client-declared `file.type` is trusted without magic-byte sniffing — but `image/svg+xml` isn't in the allowlist (removing the main stored-XSS vector), the GET route echoes back the recorded content type rather than letting the browser sniff, and this is exactly what the approved task plan specified.
> - No auth on any route — pre-existing across the entire app, not introduced here.
> - Best-effort R2 delete failures leaving orphaned objects — explicitly spec'd as best-effort/acceptable in the plan.
> - `menuImage` local state (`useState(restaurant.menuImage)`) not resyncing after a background refetch — identical to the pre-existing `contactInfo`/`note`/`menuUrl` pattern from task 026, not new.
> - `ETag` header set but `If-None-Match` never checked (always 200, never 304) — plan only asked for the header to be present.
>
> Migration files (`packages/db/migrations/0004_smooth_deathbird.sql` + matching `meta/0004_snapshot.json` + `_journal.json` entry) are all present and consistent, so no drizzle drift concern there.

**Follow-up:** the keyboard-inaccessible upload trigger was fixed (see Plan Deviations) before opening the PR. The R2 bucket placeholder name is a pre-existing, deployment-time concern outside this diff's scope — flagged here for whoever handles the next production deploy, not actioned as part of this task.
