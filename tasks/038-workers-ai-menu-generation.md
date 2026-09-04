---
id: 038
title: Generate menu items via server-side Workers AI vision model
status: approved
depends_on: [037]
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-04
---

## Planning-approach note

This task's Plan section was written under `plan-task.md`'s revised guidance (2026-09-04):
decisions/findings/interface shapes only, no full implementation bodies (route handlers, component
internals). `tasks/experiment-038-full-code-plan-reference.md` is the original code-heavy Plan for
this same task, kept solely so that once this task reaches `status: done`, its Implementation Log
and Plan Deviations can be compared against what that fuller Plan would have carried — see that
file's "Comparison protocol" section for the exact steps and where to record the verdict. Do that
comparison before deleting the reference file; it's otherwise excluded from `pnpm tasks:status` and
safe to ignore for normal task-loop purposes.

## Goal

Replace the client-side `tesseract.js` OCR + `parseMenuText` heuristic pipeline (task 037) with a
single server-side call to a Cloudflare Workers AI vision model
(`@cf/meta/llama-3.2-11b-vision-instruct`) that reads the restaurant's already-uploaded menu image
directly and returns structured `{name, price}` candidate items via JSON-schema-constrained output.
This fixes the multi-column, multi-price, two-line-per-item failures this task originally documented
(see git history of this file for the prior "column-aware parsing" scope) by having a model that
actually understands layout do the reading, instead of patching a line-based text heuristic that
structurally can't represent columns or multi-price rows.

## Context

Supersedes this task's original 2026-09-02 scope after a 2026-09-04 research pass found the premise
of that day's "do nothing further" decision no longer holds:

- `docs/architecture.md`'s stated reason for choosing client-side `tesseract.js` over a server-side
  vision-model call (task 037) was "no new Worker binding or secret needed." A Workers AI `ai`
  binding needs **no secret** — it's `env.AI`, declared in `wrangler.jsonc`, billed to the Cloudflare
  account like any other binding. That objection doesn't hold.
- Every Workers AI plan (Free and Paid) includes **10,000 neurons/day at no charge**. This app's
  actual volume — an admin generating a menu once per restaurant onboarding, not a high-frequency
  operation — sits comfortably inside that free allowance; realistic cost is $0/month.
- `@cf/meta/llama-3.2-11b-vision-instruct` supports Workers AI's JSON mode
  (`response_format: {type: "json_schema", ...}`), so the model can be constrained to return exactly
  the `{name, price}[]` shape the existing bulk-create endpoint (task 035) already expects — no
  heuristic text parsing needed at all.

## Decision (recorded 2026-09-04, supersedes 2026-09-02's "do nothing further")

Do the server-side vision-model integration, replacing the client-side pipeline entirely rather than
keeping it as a fallback — the admin review-before-save safety net already covers bad output either
way, so running two parsers in parallel would only double the maintenance surface for marginal
benefit.

**Model:** `@cf/meta/llama-3.2-11b-vision-instruct`, not `@cf/moondream/moondream3.1-9B-A2B`.
Moondream is OCR-specialized and likely more accurate on dense text, but Cloudflare's JSON-mode docs
don't list it as a supported model — using it would mean prompting for JSON manually and writing our
own parse/validate/retry-on-malformed-output logic. Llama 3.2 11B Vision's confirmed JSON-schema
support means the output shape is enforced by Workers AI itself, which matters more than raw OCR
accuracy for an admin-review-gated feature.

**Multi-price items** (S/M/L sizes — the dominant real-world case that broke the old heuristic): the
model emits one candidate item per size, with the size folded into the name (e.g. "Cà Phê Đen (S)" /
"(M)" / "(L)"), each with its own single price. Fits the existing one-price-per-item data model
exactly — no schema changes needed to `menu-items.bulk`.

**New local-dev caveat, accepted:** Workers AI has no local emulation — `wrangler dev` always hits
the real Cloudflare account for `env.AI.run()` calls, even in local dev (per Cloudflare's own docs).
This means manually clicking "Generate menu from image" under `pnpm dev`/`dev:hot` calls the real
API — covered by the free tier for this app's volume, but a real network call, unlike Hyperdrive/R2
which both have local-friendly test doubles already. Automated tests stay network-free via a fake
`AI` binding double (see Plan) — this caveat affects manual local testing only, not
`pnpm test`/`pnpm test:e2e`.

## Acceptance Criteria

- [ ] `apps/api/wrangler.jsonc` declares an `ai` binding (`"ai": { "binding": "AI" }`);
      `apps/api/src/bindings.ts`'s `Bindings` type adds `AI: Ai;`.
- [ ] `POST /api/restaurants/:id/generate-menu` (new): validates the restaurant exists (404
      `restaurantNotFound`) and has a `menuImage` set (404 `menuImageNotFound`), reads the image
      bytes from `MENU_IMAGES` itself (the client does not re-send image bytes it already
      uploaded), calls the vision model with `response_format: json_schema` constraining the output
      to `{ items: { name: string; price: string }[] }`, and returns that shape with `200`.
- [ ] The endpoint returns `500 { error: ERROR_MESSAGES.internal }` (structured `console.error`,
      matching `.claude/rules/api-error-handling.md`) when: the R2 object is missing despite
      `menuImage` being set on the row; the model call throws/rejects; or the model's output doesn't
      validate against the expected shape at runtime (JSON mode narrows the *format* but Workers
      AI's docs don't guarantee schema compliance). Nothing partially-valid is ever returned to the
      client.
- [ ] A fake `AI` binding test double (`apps/api/src/test/fake-ai-binding.ts`) lets route tests
      exercise success, malformed-output, and rejected-call paths without any real network call —
      `pnpm test`/`pnpm test:e2e` remain fully network-free, matching the existing invariant for
      this app's other bindings.
- [ ] `apps/web/src/routes/admin/GenerateMenuFromImage.tsx`'s `handleGenerate` calls the new
      endpoint instead of fetching the image blob + running `recognizeMenuImage` + `parseMenuText`.
      Same UX otherwise: button disables and relabels while pending (`"Generating menu…"`),
      zero-items response shows `"No menu items found in the image."` via `toast.error`, a request
      failure shows `"Could not generate menu items from the image."` via `toast.error`, success
      seeds `candidates` (each tagged with a locally-minted `rowId`) and opens the review dialog.
      Everything downstream of `candidates` (editing, removing, override/append confirm, save) is
      unchanged.
- [ ] `apps/web/src/lib/ocr.ts`, `apps/web/src/lib/parse-menu-text.ts` and its test file, the
      `tesseract.js` dependency (`apps/web/package.json`), and its `pnpm-workspace.yaml`
      `allowBuilds` entry are all removed. No dead code, no dead dependency.
- [ ] `docs/architecture.md`'s OCR decision entry is rewritten to record the server-side Workers AI
      approach, why it now beats the client-side one, and the local-dev caveat above.
- [ ] `CLAUDE.md`'s App → "Non-obvious bits" list gets a bullet noting `pnpm dev`/`dev:hot` calls the
      real Cloudflare account for "Generate menu from image" (no local AI emulation), while
      `pnpm test`/`pnpm test:e2e` use a fake binding and stay network-free.

## Plan

### Files touched

- `apps/api/wrangler.jsonc` — add an `ai` binding block.
- `apps/api/src/bindings.ts` — add `AI: Ai` to `Bindings` (type ships from
  `@cloudflare/workers-types@^5.20260731.1`, already a devDependency — no new package needed).
- `apps/api/src/routes/restaurants.ts` — new route, alongside the existing `/menu-image` routes.
- `apps/api/src/test/fake-ai-binding.ts` (new) — test double.
- `apps/api/src/routes/restaurants.test.ts` — new `describe("POST /:id/generate-menu")`.
- `apps/web/src/routes/admin/GenerateMenuFromImage.tsx` — replace `handleGenerate`; drop the
  `menuImageSrc` prop (only ever used for the removed blob fetch), shrinking the component's props
  to `{ restaurantId: number }`.
- `apps/web/src/routes/admin/RestaurantDetail.tsx` — update the call site for the dropped prop.
- `apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx` — replace OCR mocking with an MSW
  handler for the new endpoint.
- `apps/web/src/routes/admin/RestaurantDetail.test.tsx` — drop the now-unnecessary `vi.mock("@/lib/ocr")`.
- Removed: `apps/web/src/lib/ocr.ts`, `apps/web/src/lib/parse-menu-text.ts` (+ its test), the
  `tesseract.js` dependency and its `pnpm-workspace.yaml` `allowBuilds` entry (both added in task 037).
- `docs/architecture.md`, `CLAUDE.md` — doc updates per the Acceptance Criteria above.

### Endpoint contract: `POST /api/restaurants/:id/generate-menu`

- `404 { error: ERROR_MESSAGES.restaurantNotFound }` — id not an integer, or no matching row.
- `404 { error: ERROR_MESSAGES.menuImageNotFound }` — row exists but `menuImage` is unset.
- `200 { items: { name: string; price: string }[] }` — success.
- `500 { error: ERROR_MESSAGES.internal }` (structured `console.error`, per
  `.claude/rules/api-error-handling.md`) — R2 object missing despite `menuImage` set; the model
  call throws/rejects; or the model's output fails a runtime shape check (JSON mode narrows
  *format*, not guaranteed compliance — validate before returning).

### Model call

- Model: `@cf/meta/llama-3.2-11b-vision-instruct`; `response_format: json_schema` constrained to
  `{ items: { name: string; price: string }[] }`.
- Prompt: list every distinct menu item; for a multi-price item (e.g. S/M/L), emit one entry per
  size with the size folded into the name (`"Cà Phê Đen (S)"`); ignore decorative images and
  non-item text; price as the plain printed number, no currency symbol.
- Read the image bytes from `MENU_IMAGES` server-side (the client doesn't re-send bytes it already
  uploaded).

**Unresolved, resolve first during implementation, before writing the fake binding or any test:**
the exact shape of the vision `image` content-part (byte array vs. `Uint8Array`/`ArrayBuffer` vs.
base64 string) and the exact response envelope (e.g. `result.response.items` vs. `result.items`)
for *this specific combination* — image input plus `response_format: json_schema` — aren't
confirmed; Cloudflare's own docs are incomplete/inconsistent on this combination. Do one real
`wrangler dev` call against a real menu image and a real Cloudflare account first, and let that
confirm both shapes rather than assuming one up front.

### Test double

`apps/api/src/test/fake-ai-binding.ts` — mirror `fake-menu-images-bucket.ts`'s pattern: a factory
tests configure per scenario, exposing a `run` function tests can make resolve with valid items,
resolve with a malformed shape, or reject.

### Frontend

`GenerateMenuFromImage`'s `handleGenerate` calls the new endpoint instead of
fetch-blob + `recognizeMenuImage` + `parseMenuText`, preserving the existing UX contract exactly
(disable+relabel button while pending, empty-result and failure toasts, success seeds `candidates`
with a minted `rowId` per item and opens the review dialog). Everything downstream of `candidates`
is unchanged. `RestaurantDetail` updates its call site for the dropped `menuImageSrc` prop.

Test changes: `GenerateMenuFromImage.test.tsx` swaps OCR mocking for an MSW handler on
`POST /api/restaurants/:id/generate-menu`; every existing assertion (dialog opening, edit/remove
correctness, invalid-price blocks Save, confirm flow, override/append modes, save-failure keeps
dialog open) stays as-is — only how `candidates` gets seeded changes. `RestaurantDetail.test.tsx`
drops its OCR mock and updates render assertions for the dropped prop.

### Cleanup

Remove `ocr.ts`, `parse-menu-text.ts` (+ test), the `tesseract.js` dependency, and its
`allowBuilds` entry. Verify with
`grep -rn "tesseract\|parse-menu-text\|lib/ocr" apps/web/src apps/web/package.json pnpm-workspace.yaml`
returning nothing.

### Docs

Rewrite `docs/architecture.md`'s OCR decision entry to record the server-side approach, why it
beats the client-side one, and the local-dev caveat. Add the `CLAUDE.md` non-obvious-bits bullet
per the Acceptance Criteria.

### Tests

Run `pnpm test -- apps/api/src/routes/restaurants.test.ts apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx apps/web/src/routes/admin/RestaurantDetail.test.tsx`,
then the full `test_command`.

## Implementation Log

(Filled in by `/implement-task`.)

## Plan Deviations

(Filled in by `/implement-task`.)

## Review Notes

(Output of the `feature-dev:code-reviewer` agent, appended by `/implement-task`.)
