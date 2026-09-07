---
id: 038
title: Generate menu items via server-side Workers AI vision model
status: in_review
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
Moondream is OCR-specialized and likely more accurate on dense text, but would mean prompting for
JSON manually and writing our own parse/validate logic. **Correction, recorded during
implementation:** the premise below this line ("Llama 3.2 11B Vision's confirmed JSON-schema
support") turned out false on a real call — see Plan Deviations. `response_format: json_schema` is
silently ignored by this model (confirmed both with and without an image; this model's Workers AI
type definition has no `response_format` field at all, unlike text-only models such as Llama 3.3
70B). So Llama ends up needing exactly the manual prompt-for-JSON + runtime-validate approach this
paragraph rejected Moondream for — the choice stands anyway: Llama is confirmed working end-to-end
on this account (license cleared, image shape confirmed, a real fixture image correctly read with
S/M/L folded into names as predicted below), and switching to Moondream now would mean a fresh
license gate and a fresh shape probe for no proven accuracy benefit on an admin-review-gated
feature.

**Correction, recorded post-review (2026-09-07):** the paragraph above (multi-price S/M/L items,
one candidate per size) is superseded. Reviewing the merged implementation, the model is not asked
for price at all anymore — `price` is already optional on `MenuItem` and admin-entered by hand in
the review dialog, so there's no price for the model to misread, normalize, or need a schema for.
The prompt now asks for distinct item **names only**, once each (a multi-size item like Cà Phê Đen
is listed once, not split per size — there's no per-size price left to distinguish the entries).
This drops `normalizeGeneratedPrice` and its dot-grouping/JSON-number-coercion handling entirely
(see Plan Deviations for what those covered) — the runtime-validation surface shrinks to just
"is `name` a string," and a model that returns a price anyway has it silently ignored.

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
      uploaded), calls the vision model **(corrected during implementation — see Plan Deviations:
      `response_format: json_schema` is silently ignored by this model on a real call, so the shape
      is requested via prompt instruction only, not a schema-constraining option)** constraining the
      output to `{ items: { name: string }[] }` by runtime validation, and returns that shape with
      `200`. **Post-review correction:** originally `{ name: string; price: string }[]` — price
      extraction was dropped entirely (see the corrected Decision section).
- [ ] The endpoint returns `500 { error: ERROR_MESSAGES.internal }` (structured `console.error`,
      matching `.claude/rules/api-error-handling.md`) when: the R2 object is missing despite
      `menuImage` being set on the row; the model call throws/rejects; or the model's output doesn't
      validate against the expected shape at runtime (there is no schema-enforcement option for this
      model at all — see above — so runtime validation is the *only* thing standing between a
      malformed completion and the client). Nothing partially-valid is ever returned to the
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
      seeds `candidates` (each tagged with a locally-minted `rowId`, `price` starting empty for the
      admin to fill in by hand) and opens the review dialog. Everything downstream of `candidates`
      (editing, removing, override/append confirm, save) is unchanged.
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
- `200 { items: { name: string }[] }` — success. **Post-review correction:** originally
  `{ name: string; price: string }[]`; price extraction was dropped after review (see the
  corrected Decision section) — `price` is admin-entered by hand in the review dialog instead.
- `500 { error: ERROR_MESSAGES.internal }` (structured `console.error`, per
  `.claude/rules/api-error-handling.md`) — R2 object missing despite `menuImage` set; the model
  call throws/rejects; or the model's output fails a runtime shape check (JSON mode narrows
  *format*, not guaranteed compliance — validate before returning).

### Model call

- Model: `@cf/meta/llama-3.2-11b-vision-instruct`; shape requested via prompt instruction and
  validated at runtime (not `response_format: json_schema` — see the correction above).
- Prompt: list every distinct menu item by name only, once each; ignore prices, decorative
  images, and non-item text; respond with only the raw JSON object, no markdown/commentary.
  **Post-review
  correction:** originally asked for price too (plain printed number, no currency symbol) and
  split a multi-size item (S/M/L) into one entry per size with the size folded into the name
  (`"Cà Phê Đen (S)"`). Both dropped — price is admin-entered by hand afterward, so there's no
  per-size price left to justify splitting the entries; see the corrected Decision section.
- Read the image bytes from `MENU_IMAGES` server-side (the client doesn't re-send bytes it already
  uploaded).

**Resolved during implementation** via a real `wrangler dev` call against this project's actual
Cloudflare account, a real fixture menu image, and several probe shapes — see Plan Deviations for
the full account. Headline findings:
- One-time account gate hit first: this model requires submitting the literal prompt `"agree"`
  once per account before it runs at all (`AiError: 5016`) — done for this account (see
  `docs/deployment.md`).
- Working image content-part shape: `messages[].content[]` entry
  `{ type: "image_url", image_url: { url: "data:<mime>;base64,<b64>" } }` — *not* the
  `{ type: "image", image: <data> }` shape shown on the model's own Cloudflare docs page, which
  errored `AiError 8001: Invalid input` on a real call.
- `response_format: json_schema` is silently ignored by this model, with or without an image —
  see the Decision section's correction above. Dropped entirely; the shape is requested via
  prompt instruction only.
- Response envelope: `result.response` — a string when the completion isn't valid JSON (e.g.
  truncated or free prose), but Workers AI appears to auto-parse a syntactically-valid JSON
  completion into an object in place of the string (observed, not documented anywhere found). The
  route and the fake binding both handle either case.
- Default `max_tokens` (256) truncates well before a real multi-item menu completes; a real
  ~90-item multi-column coffee menu needed ~1400 completion tokens. Uses `max_tokens: 4096` for
  headroom.

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

- Red: `5885727` — `test: cover POST /:id/generate-menu (Workers AI vision menu generation)`.
  `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 9 failing (all 404s from the
  not-yet-implemented route).
- Green: `11d7de5` — `feat: generate menu items via server-side Workers AI vision model`.
  `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (348/348 vitest
  tests across `apps/api`/`apps/web`, typecheck clean across all 3 packages, web build succeeds).
  `pnpm test:e2e` also run manually (not part of `test_command`) — 11/11 passing, confirming the
  new `ai` binding doesn't break `wrangler dev`'s webServer startup for e2e.
- Real Cloudflare account probing (before writing any test, per the Plan's "Unresolved" note):
  built a disposable scratch Worker with only an `ai` binding, ran `wrangler dev` against it, and
  sent a real fixture menu-photo (a Vietnamese coffee shop menu, left over from task 037's manual
  testing) through several candidate request shapes to nail down the image content-part shape,
  the response envelope, and whether `response_format: json_schema` actually applies here — see
  Plan Deviations. Cleaned up after use; not part of this PR's diff.
- Post-review simplification (2026-09-07, not yet committed): during PR review the user asked to
  simplify extraction to name-only and drop price entirely, since `price` is already optional in
  this app's data model. Reworked `GENERATE_MENU_PROMPT`/`parseGeneratedItems` (dropped
  `normalizeGeneratedPrice` and the numeric-price-coercion branch), the frontend seed (`price`
  starts `""` for manual entry), both test suites, and this task file's Decision/Plan/Plan
  Deviations/Review Notes sections to match — see the corrections in place above. Verified
  `parsePrice` (`menu-items.ts`) already treats `""` as `null`, so an unfilled generated price
  saves cleanly. `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing
  (349/349 vitest tests).

## Plan Deviations

- **The Decision section's premise for choosing Llama 3.2 11B Vision over Moondream — "confirmed
  JSON-schema support" — was false.** A real call (image input, `response_format: json_schema`)
  came back as free-text prose, not schema-constrained JSON; a follow-up real call with
  `response_format` but *no* image was equally ignored, isolating the cause to the model itself
  rather than the image+JSON-mode combination. This matches `@cloudflare/workers-types`: the
  model's input type (`Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_{Prompt,Messages}`) has no
  `response_format` field at all, unlike e.g. Llama 3.3 70B's, which does. Corrected the Decision
  section and the AC bullet in place (rather than only noting it here) since the task file is
  what a PR reviewer checks against. Kept the model choice — see the corrected Decision section
  for why switching to Moondream now wasn't worth it.
- **Dropped `response_format` entirely instead of sending it anyway "just in case."** It would
  need an `as any`/cast past the type (which correctly has no such field for this model), do
  nothing, and mislead the next reader into thinking the output is schema-enforced when it isn't.
  The shape is requested via prompt instruction only and validated at runtime — this was already
  the AC's fallback path ("model output doesn't validate against the expected shape"), so no new
  code path was needed, only a different reason the validation step is load-bearing.
- **The vision content-part shape on the model's own Cloudflare docs page is wrong.** That page
  shows `{ "type": "image", "image": "<image_data>" }`; a real call with that shape returned
  `AiError 8001: Invalid input`. `{ type: "image_url", image_url: { url: "data:<mime>;base64,<b64>" } }`
  is what actually works (confirmed against a real menu photo, which the model read correctly,
  including folding S/M/L sizes into item names exactly as the (unmodified) Decision section
  predicted).
- **Default `max_tokens` (256) silently truncates a real menu's completion.** Not anticipated in
  the Plan. A real ~90-item multi-column coffee menu needed ~1400 completion tokens; discovered
  by hitting the truncation during probing (a cut-off, non-JSON response). Set `max_tokens: 4096`
  for headroom — this only affects tokens actually generated, not a fixed cost.
- **Workers AI requires a one-time per-account license acceptance for this model** (submitting
  the literal prompt `"agree"`), not mentioned anywhere in the Plan or Context. Hit it as the very
  first real-call error (`AiError 5016`) before any of the shape-probing above could even start.
  This is a real external side effect on the project's actual Cloudflare account (the same one
  used for production), not something to do silently — stopped and asked the user for explicit
  confirmation before submitting it; user chose to have it submitted immediately. Recorded in
  `docs/deployment.md` so a future fork/new-account setup knows this step exists.
- **`bytesToBase64` (chunked `String.fromCharCode`) wasn't in the Plan.** Spreading a full (up to
  10MB, per `MENU_IMAGE_MAX_BYTES`) image `Uint8Array` into `String.fromCharCode(...bytes)` risks
  exceeding the JS engine's call-stack argument limit; noticed this while writing the route, ahead
  of it ever failing in a test (the test fixtures are small).
- **The code-reviewer agent (see Review Notes) caught two runtime-validation gaps the Plan
  missed, both stemming from `response_format` being a no-op (nothing actually constrains the
  model's price formatting or JSON value types):** a dot-grouped price (e.g. `"25.000"`) passed
  shape validation as a string but silently became `25` (not `25000`) once `Number()`'d
  downstream and stored in the `numeric` column — exactly what task 037's now-deleted
  `normalizePriceToken` used to catch, ported into the new endpoint (`normalizeGeneratedPrice`);
  and a price returned as a bare JSON number (right value, wrong JSON type) 500'd an
  otherwise-good response outright, now accepted and coerced to a string. Fixed in `e5de3a7` with
  two new regression tests. **Post-review correction (2026-09-07):** this whole surface — price
  extraction, `normalizeGeneratedPrice`, the JSON-number coercion — was removed rather than kept
  fixed; see the corrected Decision section for why (price is admin-entered by hand now, so
  there's no model-emitted price left to normalize or coerce).
- Otherwise implemented as planned: endpoint contract, fake `AI` binding test double shape/pattern,
  frontend `handleGenerate` swap and UX contract, and the cleanup of `ocr.ts`/`parse-menu-text.ts`/
  `tesseract.js` all matched the Plan as written.

## Review Notes

Output of the `feature-dev:code-reviewer` agent, run against the red→green diff
(`5885727`..`11d7de5`):

### Critical

**1. Deleting `parse-menu-text.ts` removed price normalization with nothing server-side replacing
it — silent 1000x price corruption for dot-grouped Vietnamese prices (confidence 90).**

- `apps/api/src/routes/restaurants.ts:29-33` — `GENERATE_MENU_PROMPT` explicitly asks the model for
  "the plain printed number, with no currency symbol," which for the dominant real-world case this
  task exists to fix (Vietnamese menus, e.g. "25.000" = 25,000 VND with a dot as thousands
  separator) invites the model to echo that literal formatting.
- Neither validation layer rejects or normalizes a dot-grouped number: frontend `validatePrice`
  and backend `parsePrice` both do `Number(trimmed)` — and `Number("25.000") === 25`, which is
  finite and non-negative, so it passes as valid.
- `packages/db/src/schema.ts:32` declares `price: numeric("price")`. Postgres interprets the
  stored string `"25.000"` as the decimal value `25`. The admin review UI still displays "25.000"
  in the field (looks correct), so the review-before-save safety net this task relies on elsewhere
  won't catch it.
- Task 037's deleted `normalizePriceToken` explicitly handled exactly this case. This diff removes
  that normalization without adding any replacement, silently reintroducing a bug task 037 had
  already fixed.
- **Outcome: fixed** in `e5de3a7` — ported `normalizePriceToken` into the new endpoint as
  `normalizeGeneratedPrice`, applied to every item's price before returning. Regression test added
  ("normalizes a dot-grouped thousands price instead of passing it through literally").
  **Superseded post-review (2026-09-07):** the model no longer extracts price at all — see the
  corrected Decision section — so this finding is now moot by removal rather than fixed by
  normalization: there's no model-emitted price string left for a dot-grouped format to corrupt.

### Important

**2. `parseGeneratedItems` rejects the entire response if any single item's `price` comes back as
a JSON number instead of a string (confidence 82).**

- Since `response_format: json_schema` is confirmed (per this same task's Plan Deviations) to be
  silently ignored by this model, there is no schema enforcement on JSON *value types*, only what
  the prompt asks for. A model emitting `"price": 29` as a bare number for one item (out of
  possibly 90) throws away the entire successful response and turns a good menu-read into a 500.
- **Outcome: fixed** in `e5de3a7` — `parseGeneratedItems` now accepts `typeof price === "number"`
  in addition to `"string"` and coerces via `String(price)` (through the same
  `normalizeGeneratedPrice` path as finding 1). Regression test added ("coerces a price returned
  as a JSON number instead of a string"). **Superseded post-review (2026-09-07):** moot by removal
  — `parseGeneratedItems` no longer reads `price` at all, so there's no JSON-type mismatch left to
  coerce. A model that returns a price anyway now has it silently ignored (a regression test
  covers this, "ignores a price the model returns anyway").

### Notes (not flagged as violations)

- `toastApiError(error, "Could not generate menu items from the image.")` will show the raw
  backend message (`"internal error"`) instead of the friendlier fallback whenever the route
  actually returns a `500 { error: ERROR_MESSAGES.internal }`, because `ApiError.message` is
  populated from the response body and `toastApiError` prefers it. This is the established,
  rule-compliant pattern across the whole app (`.claude/rules/mutation-feedback.md`), not
  something introduced incorrectly by this diff — no change made.
- Everything else checked out clean: `.claude/rules/api-error-handling.md` compliance, chunked
  base64 encoding correctness, empty-items 200 path, button label/disabled-state UX contract,
  and repo-wide OCR/tesseract cleanup completeness were all confirmed with no issues.
