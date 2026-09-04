---
id: 038-ref
title: "[PLANNING-APPROACH REFERENCE, DO NOT IMPLEMENT] Generate menu items via server-side Workers AI vision model"
status: reference  # deliberately not in the normal proposed|approved|... enum, so pnpm tasks:status ignores this file entirely
depends_on: [037]
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-04
---

## Why this file exists

This is the original, code-heavy Plan for what is now task `038` (`tasks/038-workers-ai-menu-generation.md`),
kept only as a reference for a live experiment on `/plan-task`'s planning style — not a task to
implement. Its Plan section wrote out full implementation bodies (route handler, schema constants,
component rewrite). `plan-task.md` was then changed (2026-09-04) to keep the Plan section to
decisions/findings/interface shapes and drop full code bodies, and `038` was rewritten under that
new guidance to compare against. Named without a leading number, unlike every real task file, so it
never reads as a numbered task and never occupies a real slot in the `tasks/` id sequence.

## Comparison protocol — run this once `038` reaches `status: done`

1. Read `038`'s filled-in Implementation Log and Plan Deviations, and `git diff <red-sha> <green-sha>`
   for its green commit (shas are in the Implementation Log).
2. For each file this reference's Plan wrote a full body for (`restaurants.ts`'s route handler,
   `isValidGeneratedItems`, `fake-ai-binding.ts`, `GenerateMenuFromImage.tsx`'s `handleGenerate`),
   compare the reference's snippet against `038`'s actual final code. Classify each as:
   - **Match** — actual code is the same in substance (naming/formatting aside).
   - **Diverged, plan would've needed fixing anyway** — the reference's snippet turns out wrong or
     incomplete for a reason `/implement-task` could only discover by running the code (e.g. the
     flagged AI response-envelope uncertainty). Pre-writing it would not have saved work.
   - **Diverged, plan was usable but implementation deviated for other reasons** — reference snippet
     was workable, but `038`'s Plan Deviations shows the actual implementation went a different way.
   - **Re-derived from scratch, no meaningful shortcut** — `038`'s Plan already gave enough
     (interface shape + decision) that having the reference's full body wouldn't have saved real
     effort.
3. Answer directly: did `038`'s leaner Plan cost real re-derivation effort during `/implement-task`
   that the reference's code bodies would have avoided for free? Or did `/implement-task` end up
   writing essentially the same code test-first regardless of how much the Plan pre-wrote?
4. Record the verdict as a short write-up — in `038`'s own task file (a new section, or folded into
   its Plan Deviations) is the natural spot; escalate to a `plan-task.md` guidance change (tighten,
   loosen, or refine further — e.g. keep full bodies only for the single highest-risk file) only if
   the verdict is clear. Treat this as one data point (n=1) — a single task's outcome is a pilot, not
   proof; if inconclusive, note that and consider one more comparison pair (ideally a
   frontend-heavy task, since 038 is backend/integration-heavy) before changing the guidance again.
5. Only after the write-up exists: delete this file (and this task's `Planning-approach note`
   section can go too). Until then, leave both in place even though this file's `status` keeps it
   out of every `pnpm tasks:status` listing.

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

### `apps/api/wrangler.jsonc`

Add an `ai` block (account-level binding, no id/resource name needed unlike `hyperdrive`/`r2_buckets`):
```jsonc
"ai": {
  "binding": "AI"
}
```

### `apps/api/src/bindings.ts`

```ts
export type Bindings = {
  ASSETS: Fetcher;
  HYPERDRIVE: Hyperdrive;
  MENU_IMAGES: R2Bucket;
  AI: Ai;
};
```
The `Ai` type ships from `@cloudflare/workers-types@^5.20260731.1`, already a devDependency in
`apps/api/package.json` — no new type package needed.

### `apps/api/src/routes/restaurants.ts` (new route, alongside the existing `/menu-image` routes)

Prompt, schema, and a runtime shape guard (JSON mode narrows *format*, not guaranteed compliance):
```ts
const GENERATE_MENU_PROMPT =
  "You are reading a restaurant menu photo. List every distinct menu item you can find, " +
  "including every size/variant as its own entry when an item has multiple prices (e.g. " +
  'small/medium/large) — fold the size into the item\'s name, e.g. "Cà Phê Đen (S)". Ignore ' +
  "decorative images, headers that aren't item names, and any text that isn't a menu item or its " +
  "price. Prices should be the plain number as printed (no currency symbol).";

const GENERATE_MENU_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, price: { type: "string" } },
        required: ["name", "price"],
      },
    },
  },
  required: ["items"],
} as const;

function isValidGeneratedItems(value: unknown): value is { name: string; price: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).price === "string",
    )
  );
}
```

Route:
```ts
restaurantsRoute.post("/:id/generate-menu", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!restaurant) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }
    if (!restaurant.menuImage) {
      return c.json({ error: ERROR_MESSAGES.menuImageNotFound }, 404);
    }

    const object = await c.env.MENU_IMAGES.get(restaurant.menuImage);
    if (!object) {
      console.error(
        JSON.stringify({ message: "menu image key set on row but missing from storage", restaurantId: id }),
      );
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    }
    const imageBytes = new Uint8Array(await object.arrayBuffer());

    const result = await c.env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: GENERATE_MENU_PROMPT },
            { type: "image", image: Array.from(imageBytes) },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: GENERATE_MENU_SCHEMA },
    });

    const items = (result as { response?: { items?: unknown } }).response?.items;
    if (!isValidGeneratedItems(items)) {
      console.error(
        JSON.stringify({ message: "menu generation returned an unexpected shape", restaurantId: id }),
      );
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    }

    return c.json({ items });
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to generate menu from image", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
```

**Biggest open risk in this task, to resolve first during implementation:** the exact shape of the
`image` content-part (`Array.from(imageBytes)` vs. a raw `Uint8Array`/`ArrayBuffer` vs. a base64
string) and the exact response envelope (`result.response.items` vs. `result.items` directly) for
*this specific combination* — image input plus `response_format: json_schema` — are not confirmed
against a live call; Cloudflare's own docs are incomplete/inconsistent on this combination. Before
writing the fake `AI` binding or any test, do one real `wrangler dev` + `curl`/script call against a
real menu image and a real Cloudflare account to confirm both shapes, and adjust the snippet above
to match reality rather than trusting it verbatim.

### `apps/api/src/test/fake-ai-binding.ts` (new)

Mirrors `fake-menu-images-bucket.ts`'s pattern — a factory tests configure per scenario:
```ts
export function createFakeAiBinding(run: (model: string, input: unknown) => Promise<unknown>) {
  return { run };
}
```
Used as `{ ...testEnv, MENU_IMAGES: bucket, AI: createFakeAiBinding(async () => ({ response: { items: [...] } })) }`.

### `apps/api/src/routes/restaurants.test.ts` (extend)

New `describe("POST /:id/generate-menu")` covering: success (seeded fake bucket object + fake AI
returning valid items → 200 + items array); restaurant not found (404); no `menuImage` set (404
`menuImageNotFound`); R2 object missing despite key set (500, mirrors the existing analogous
assertion in the `GET /:id/menu-image` tests); AI call rejects (500 `internal`); AI returns a shape
`isValidGeneratedItems` rejects (500 `internal`).

### `apps/web/src/routes/admin/GenerateMenuFromImage.tsx`

Replace `handleGenerate`, drop the `recognizeMenuImage`/`parseMenuText` imports, add
`import { api } from "@/lib/api";`:
```ts
async function handleGenerate() {
  setIsRecognizing(true);
  try {
    const { items } = await api.post<{ items: { name: string; price: string }[] }>(
      `/restaurants/${restaurantId}/generate-menu`,
      {},
    );
    if (items.length === 0) {
      toast.error("No menu items found in the image.");
      return;
    }
    setCandidates(items.map((item) => ({ rowId: crypto.randomUUID(), ...item })));
    setPriceErrors({});
    setReviewOpen(true);
  } catch {
    toast.error("Could not generate menu items from the image.");
  } finally {
    setIsRecognizing(false);
  }
}
```
Button label: `{isRecognizing ? "Generating menu…" : "Generate menu from image"}`. Drop the
`menuImageSrc` prop entirely — it was only ever used for the removed `fetch(menuImageSrc).blob()`
call, so the component's signature shrinks to `{ restaurantId: number }`.

### `apps/web/src/routes/admin/RestaurantDetail.tsx`

Update the call site to match the dropped prop:
```tsx
{menuImage && <GenerateMenuFromImage restaurantId={restaurant.id} />}
```
(The `<img>` preview right above it keeps using its own computed `src` — unaffected.)

### Removed files

- `apps/web/src/lib/ocr.ts`
- `apps/web/src/lib/parse-menu-text.ts`
- `apps/web/src/lib/parse-menu-text.test.ts`

### `apps/web/package.json` / `pnpm-workspace.yaml`

Remove the `"tesseract.js": "^7.0.0"` dependency and the `tesseract.js: false` `allowBuilds` entry
(both added specifically for it in task 037). Run `pnpm install` to update the lockfile.

### `apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx`

Remove `vi.mock("@/lib/ocr")`. Replace per-test blob-fetch/OCR mocking with MSW
`server.use(http.post("/api/restaurants/1/generate-menu", ...))` returning `{ items: [...] }` for
success cases and an error status for failure cases. Every existing assertion (async-gap dialog
opening, edit/remove correctness, invalid-price blocks Save, confirm flow, override/append modes,
save-failure keeps the dialog open) stays — only how `candidates` gets seeded changes.

### `apps/web/src/routes/admin/RestaurantDetail.test.tsx`

Remove the `vi.mock("@/lib/ocr")` line added by task 037 (no longer imported transitively); update
any `<GenerateMenuFromImage>` render assertions for the dropped `menuImageSrc` prop.

### `docs/architecture.md`

Rewrite the OCR decision bullet: server-side Workers AI vision-model call
(`@cf/meta/llama-3.2-11b-vision-instruct`), JSON-schema-constrained structured output feeding
directly into the existing bulk-create endpoint, cost within Workers AI's free daily neuron
allowance for this app's volume, and the local-dev caveat (no local AI emulation — manual
`pnpm dev`/`dev:hot` testing hits the real account; automated tests use a fake `AI` binding and stay
network-free).

### `CLAUDE.md`

Add a bullet to the App → "Non-obvious bits" list: `pnpm dev`/`dev:hot`'s "Generate menu from image"
button calls the real Cloudflare Workers AI account (no local emulation exists for the `ai`
binding) — free-tier neurons cover normal use; `pnpm test`/`pnpm test:e2e` never hit it, they use a
fake `AI` binding.

### Tests

Run `pnpm test -- apps/api/src/routes/restaurants.test.ts apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx apps/web/src/routes/admin/RestaurantDetail.test.tsx`,
then the full `test_command`. Confirm all green, and confirm no leftover references
(`grep -rn "tesseract\|parse-menu-text\|lib/ocr" apps/web/src apps/web/package.json pnpm-workspace.yaml`
should return nothing).

## Implementation Log

(Filled in by `/implement-task`.)

## Plan Deviations

(Filled in by `/implement-task`.)

## Review Notes

(Output of the `feature-dev:code-reviewer` agent, appended by `/implement-task`.)
