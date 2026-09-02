---
id: 037
title: Generate menu from image via client-side OCR
status: done
depends_on: [035, 036]
parallelizable_with: []
epic: ocr-menu-generation
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-02
---

## Goal

Let the admin turn an already-uploaded restaurant menu image (task 027) into menu items without typing them in by hand: a "Generate menu" button runs OCR on the image client-side (`tesseract.js`, no server-side vision call, no new binding/secret), parses the result into candidate items (task 036's `parseMenuText`), shows them in an editable review dialog, and on accept saves them via task 035's bulk endpoint — asking override-vs-append only when the restaurant already has menu items.

**Note:** task 036's `parse-menu-text.ts` was only ever tested against hand-picked strings — there was no real OCR output to test it against yet. Its code review flagged two real gaps (`name` whitespace collapses inconsistently between the price/no-price branches; `PRICE_TOKEN_RE` accepts token shapes `normalizePriceToken` can't actually normalize, e.g. `"1.234.567"` or `"25.000,50"`, letting garbage through as `price`). Once this task has `tesseract.js` producing real recognized text from real menu images, run some of that raw text through `parseMenuText` and revisit its heuristic against what real OCR output actually looks like — fix what's still wrong then, rather than guessing now with no real data to check against.

## Acceptance Criteria

- [ ] A "Generate menu" button renders next to the uploaded menu image in `RestaurantDetailsForm`, only when the restaurant has one (`menuImage` truthy) — same condition the `<img>` preview already uses.
- [ ] Clicking it: fetches the menu image as a `Blob` from its existing URL, runs `tesseract.js` OCR (`createWorker(["eng", "vie"])`) on the blob, then `parseMenuText` on the recognized text. The review dialog does **not** open synchronously on click — only once OCR + parsing resolves.
- [ ] If OCR rejects, shows `"Could not read the menu image."` via a plain `toast.error(...)` at the call site (not mutation-hook-owned — OCR is a client-side WASM call, not an API request, so it's a deliberate, documented exception to the "hook owns its own toast" convention) and does not open the dialog.
- [ ] If `parseMenuText` returns zero candidates, shows `"No menu items found in the image."` via `toast.error(...)` and does not open the dialog.
- [ ] On success, opens a **controlled** review `Dialog` (`open`/`onOpenChange` state — not `AlertDialogTrigger asChild`, since it must open after the async OCR gap) listing one row per candidate, each independently editable (name, price) and independently removable, using the same inline non-negative-price validation message (`"Price must be a valid non-negative number."`) `MenuItemRow` already uses.
- [ ] Removing one row never misidentifies another — editing row 2 after removing row 1 lands the edit on the correct remaining candidate (rows are keyed by a stable id minted at parse time, never by array index after mutation).
- [ ] An edited-to-invalid price on any row blocks Save (inline error shown, no request sent).
- [ ] Clicking Save when the restaurant currently has at least one active menu item opens an override/append confirmation (`"Replace current menu"` / `"Add to current menu"`) while the review dialog remains mounted underneath; cancelling the confirmation returns to the still-populated review dialog (edits/removals intact), not an empty one.
- [ ] Clicking Save when the restaurant currently has zero menu items skips the confirmation and saves directly with `mode: "append"`.
- [ ] Choosing "Replace current menu" calls the bulk endpoint with `mode: "override"`; choosing "Add to current menu" (or the zero-items direct-save path) calls it with `mode: "append"`.
- [ ] On save success: both dialogs close, candidates are cleared, a `"Menu items generated"` toast shows, and the restaurant's menu item list re-renders with the new rows.
- [ ] On save failure: an error toast shows and the review dialog stays open with all edits/removals intact (nothing is lost).

## Plan

### Dependency

`pnpm add tesseract.js` in `apps/web`. No bundler/CSP config needed — it loads its worker/core/language assets from jsDelivr by default, and the API sets no `Content-Security-Policy` header that would block that.

### `apps/web/src/lib/ocr.ts` (new)

```ts
export async function recognizeMenuImage(imageBlob: Blob): Promise<string> {
  const worker = await createWorker(["eng", "vie"]);
  try {
    const { data } = await worker.recognize(imageBlob);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
```
Takes a `Blob`, not a URL string — passing a relative `/api/...` URL risks the tesseract worker resolving it against its own (CDN) origin instead of the page's. The caller fetches the blob from the same URL the `<img>` preview already uses. `["eng", "vie"]` since the app's own seed restaurants are Vietnamese food/drink places. No dedicated test file — this module is mocked wholesale wherever it's consumed (see below), not unit-tested against the real WASM library.

### `apps/web/src/components/ui/dialog.tsx` (modify)

Add `DialogHeader`, `DialogFooter`, `DialogDescription`, mirroring the shapes already in `alert-dialog.tsx`'s `AlertDialogHeader`/`Footer`/`Description`. The plain `Dialog` currently only exports `Title`/`Trigger`/`Content`/`Close`/`Portal`/`Overlay`.

### `apps/web/src/routes/admin/useMenuItems.ts` (modify)

Add `useBulkCreateMenuItems(restaurantId)`, same shape as every other hook in this file:
```ts
export function useBulkCreateMenuItems(restaurantId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: "override" | "append"; items: { name: string; price: string }[] }) =>
      api.post<MenuItem[]>(`/restaurants/${restaurantId}/menu-items/bulk`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) });
      toast.success("Menu items generated");
    },
    onError: (error) => toastApiError(error, "Could not save menu items."),
  });
}
```

### `apps/web/src/routes/admin/MenuCandidateRow.tsx` (new)

One candidate row: editable name (via `useRequiredField`) + editable price (local state, same `validatePrice` check `MenuItemRow` uses — copy, don't extract, matching the precedent already set in task 034), a remove button. Fully controlled by the parent's `candidates` array (`{ rowId, name, price }[]`) via `onChange(rowId, patch)` / `onRemove(rowId)` props — mirrors `MenuItemRow`'s markup but is not itself persisted (no mutation hooks, no `id`/`active` of its own).

### `apps/web/src/routes/admin/GenerateMenuFromImage.tsx` (new)

Props: `{ restaurantId: number; menuImageSrc: string }`. Reads `useMenuItems(restaurantId)` itself (same query key `RestaurantDetail` already uses — deduped by TanStack) to compute `hasExistingItems`.

- "Generate menu" `Button` (`variant="outline"`, matching the existing "Upload menu image" button styling), `disabled` while recognizing.
- On click: `setIsRecognizing(true)` → `fetch(menuImageSrc)` → `.blob()` → `recognizeMenuImage(blob)` → `parseMenuText(text)`. Empty result → toast + stop. Success → seed `candidates` state (each tagged with a locally-minted stable `rowId`), `setReviewOpen(true)`. Rejection → toast + stop. `finally setIsRecognizing(false)`.
- Controlled review `Dialog` (`open={reviewOpen} onOpenChange={setReviewOpen}`), `DialogContent` sized to hold a full list (e.g. `max-w-2xl`, an inner scrollable row-list container), rows rendered via `MenuCandidateRow`. Footer "Save" button disabled when `candidates.length === 0`.
- Save handler: if `hasExistingItems`, open a nested controlled `AlertDialog` (`confirmOpen`) with "Replace current menu" / "Add to current menu" actions, leaving the review `Dialog` open underneath. If not, call the mutation directly with `mode: "append"`.
- On mutation success: close both dialogs, clear `candidates`.

### `apps/web/src/routes/admin/RestaurantDetail.tsx` (modify)

Inside `RestaurantDetailsForm`, next to the existing `{menuImage && <img ... />}` block, add:
```tsx
{menuImage && (
  <GenerateMenuFromImage
    restaurantId={restaurant.id}
    menuImageSrc={`/api/restaurants/${restaurant.id}/menu-image?v=${menuImage}`}
  />
)}
```
Same computed `src` the `<img>` already uses.

### Tests

- `apps/web/src/routes/admin/RestaurantDetail.test.tsx` (modify): add `vi.mock("@/lib/ocr")` to this suite — it now transitively imports `GenerateMenuFromImage` → `@/lib/ocr` → `tesseract.js`, and the real WASM library must never load in jsdom.
- `apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx` (new, kept separate from the already-750-line `RestaurantDetail.test.tsx`): `vi.mock("@/lib/ocr")`, `userEvent.setup({ pointerEventsCheck: 0 })` for any interaction while a Radix dialog is open, MSW mocking the bulk endpoint. Covers every Acceptance Criteria bullet above: async-gap dialog opening, OCR-failure/zero-candidate toasts with no dialog, row edit/remove correctness (edit row 2 after removing row 1), invalid-price blocks Save, existing-items confirm flow with intact review dialog after Cancel, zero-items direct append save, override vs. append mode sent correctly, save-failure keeps the dialog open.

Run `pnpm test -- apps/web/src/lib/parse-menu-text.test.ts apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx apps/web/src/routes/admin/RestaurantDetail.test.tsx`, then the full `test_command`, confirm all green.

### Doc update

`docs/architecture.md`'s "Open items — not yet decided" OCR entry: rewrite from "not yet decided" to a decided entry recording client-side `tesseract.js` (chosen over a vision-LLM/Workers-AI backend call specifically to avoid a new binding/secret) and the accuracy trade-off accepted (WASM OCR + heuristic parsing vs. a frontier vision model; best-effort, admin reviews/edits before saving).

## Implementation Log

- red commit: 8ef4b12 — `pnpm test` -> 2 test files failing (`GenerateMenuFromImage.test.tsx`: module not found; `RestaurantDetail.test.tsx`: 1 failing, "Generate menu" button not found)
- green commit: c20bb9d — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (345/345 tests, typecheck clean, build succeeds). Includes a post-review fix (button label swaps to "Reading menu…" while OCR is running) applied before this commit was finalized — see Review Notes.

## Plan Deviations

- `MenuCandidateRow` does not use `useRequiredField` for the name field as the Plan sketched. Instead it's a fully presentational component (no internal hooks/state) controlled entirely by the parent's `candidates` array via `onChange(rowId, patch)`/`onRemove(rowId)`. This was needed because Save (in the parent) must validate every row's *current* price in one pass before deciding whether to open the override/append confirmation — that's much simpler with the parent owning all row state directly than reconciling values back out of N independent `useRequiredField` instances. Consequently there's no inline name-required validation (only price validation, matching the Acceptance Criteria exactly); an emptied-out name would be caught server-side and surface via the existing save-failure path (error toast, dialog stays open, edits intact) rather than an inline error.
- `pnpm add tesseract.js` triggered pnpm's new `allowBuilds` build-script approval gate (not mentioned in the Plan, and not present in the repo before this task). Checked `tesseract.js`'s `package.json` — no install/postinstall lifecycle script, only manual `build`/`profile:*` scripts that pnpm wouldn't run anyway — and set `tesseract.js: false` in `pnpm-workspace.yaml`'s `allowBuilds` to unblock `pnpm install`/`pnpm test`.
- Caught and fixed a bug in my own first test (`GenerateMenuFromImage.test.tsx`) during the Green phase: asserted `screen.getByText("Pho Bo")` against a value that's inside an `<input>`, not text content, so it needed `getByDisplayValue` instead. Not a Plan deviation, just a self-correction while going from Red to Green.

## Review Notes

Output of the `feature-dev:code-reviewer` agent (run against the red→green diff):

### Findings

**Important (confidence 80) — No progress feedback during OCR recognition** — `apps/web/src/routes/admin/GenerateMenuFromImage.tsx` (Generate menu button)

> The "Generate menu" button only gets `disabled={isRecognizing}`; its label never changes and there's no spinner. `recognizeMenuImage` creates a fresh `tesseract.js` worker on every click via `createWorker(["eng", "vie"])`, which on a cold cache downloads the WASM core plus English and Vietnamese trained-data files before recognition even starts — realistically tens of seconds, not the sub-second latency of the existing `disabled={uploadMenuImage.isPending}` precedent this pattern was borrowed from. During that window the user sees a greyed-out button with no other signal, and the failure mode (OCR rejects) looks identical to the in-progress state until the toast eventually appears.

**Fixed**: button label now swaps to `"Reading menu…"` while `isRecognizing` is true, with a test asserting the disabled/relabeled state during the async gap before OCR resolves.

### Verified as not issues

- `MenuCandidate.price` is always `string` (never `null`/`undefined`), so `validatePrice`/`c.price.trim()` can't throw.
- The deliberate `useRequiredField`-skipping deviation in `MenuCandidateRow` round-trips correctly through the server's `nameRequired` 400 as described in Plan Deviations above.
- `useBulkCreateMenuItems` correctly owns its own toast per `.claude/rules/mutation-feedback.md`; the OCR-failure `toast.error` at the call site is the documented, AC-specified exception.
- Missing `isPending` disable on the override/append `AlertDialogAction`s matches every other `AlertDialogAction` usage in the codebase (`RoundList.tsx`, `RoundDetail.tsx`) — pre-existing pattern, not introduced here.
- Radix Dialog/AlertDialog portal to `document.body`, so no risk of the confirm dialog's buttons submitting the surrounding `RestaurantDetailsForm`.
- Every Acceptance Criteria bullet was walked against the diff and the corresponding test in `GenerateMenuFromImage.test.tsx` — all satisfied.

No other findings at confidence ≥ 80.
