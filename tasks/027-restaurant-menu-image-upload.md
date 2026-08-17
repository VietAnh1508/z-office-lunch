---
id: 027
title: Restaurant menu image upload
status: approved
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
