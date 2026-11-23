---
id: 071
title: Layer the restaurants module
status: in_review
depends_on: [070]
parallelizable_with: []
epic: layered-api-refactor
tdd: required
test_command: "pnpm test -- apps/api/src/modules/restaurants"
created: 2026-11-06
---

## Goal

Split `routes/restaurants.ts` (470 lines, includes R2 storage and Workers AI use) into controller/service/repository, and split `restaurants.test.ts` (756) plus `restaurants-size-preset.test.ts` (241) per layer.

## Acceptance Criteria

- [ ] `modules/restaurants/{controller,service,repository}.ts` replace `routes/restaurants.ts`; `index.ts` updated.
- [ ] Controller keeps HTTP-only work: `bodyLimit` with 413 `onError`, multipart parse and `File`/MIME checks, image response headers (Content-Type, Cache-Control, ETag) and streaming.
- [ ] Service owns: food restaurant cannot have a size preset, preset must exist, rebuild item sizes only when the preset changed, omitted `sizePresetId` leaves it as-is, PATCH transaction (update, `clearRestaurantDrinkSizes`, `rebuildMenuItemSizes`), `size-reset-impact` query. R2 and AI bindings (`MENU_IMAGES`, `AI`) are passed in as arguments, never `c`.
- [ ] Menu-image storage sequences unchanged: upload = R2 put, DB update, compensating delete on DB failure, best-effort delete of the old image; DELETE = DB reference removed first, then best-effort R2 delete.
- [ ] AI generate-menu code (`parseGeneratedItems`, `bytesToBase64`, prompt constants) lives in the service (or a `menu-generation.ts` beside it) with its own unit tests using `test/fake-ai-binding.ts`.
- [ ] A missing R2 object stays 404 on `GET menu-image` and 500 on `generate-menu`, as today.
- [ ] `restaurants.test.ts` splits into CRUD / PATCH / menu-image / generate-menu files (plus layer tests), each well under ~400 lines; no coverage loss. Full `pnpm test` and `pnpm test:e2e` pass.

## Plan

Endpoints: `POST /`, `PATCH /:id`, `GET /:id/size-reset-impact`, `GET /`, `POST/GET/DELETE /:id/menu-image`, `POST /:id/generate-menu`. Tri-state parsers `optionalText` and `parseSizePresetId` (`undefined | null | number | "invalid"`) stay with body parsing.

The four "structured 500 when DB unreachable" tests collapse to the shared `expectStructured500` helper at controller level.

Files: `modules/restaurants/*` (+ split tests), `index.ts`; delete `routes/restaurants*.ts` and its tests.

Test-move protocol (see `.claude/rules/api-layers.md`): red commit relocates the existing `restaurants*.test.ts` HTTP tests word for word into the split controller test files (CRUD / PATCH / menu-image / generate-menu; still passing) and adds the new layer tests (failing). Green commit moves the code. The repeated unreachable-DB 500 tests may be merged into the shared helper, but name each merged `it` in the Implementation Log.

## Implementation Log

- Red: `61d42e8` — relocated `routes/restaurants.test.ts` (38 `it`) and `routes/restaurants-size-preset.test.ts` (18 `it`) into `modules/restaurants/controller-{crud,patch,menu-image,generate-menu}.test.ts` (51 `it`s verbatim + 5 unreachable-DB 500 `it`s merged into 1 `expectStructured500` test covering all 8 endpoints); added throwing stubs in `modules/restaurants/{repository,service,menu-generation}.ts` and `modules/size-presets/repository.ts` (`exists`), plus 29 new failing layer tests (`restaurants/repository.test.ts`: 5, `restaurants/menu-generation.test.ts`: 7, `restaurants/service.test.ts`: 16, `size-presets/repository.test.ts`: +1). `pnpm test apps/api/src/modules/restaurants` -> 28 failing, 52 passing (`size-presets/repository.test.ts` -> 1 failing, 11 passing).
- Green: `de0ab1e` — implemented `modules/restaurants/{repository,menu-generation,service,controller}.ts` and `modules/size-presets/repository.ts#exists`, updated `apps/api/src/index.ts` to mount `./modules/restaurants/controller`, and deleted `apps/api/src/routes/restaurants.ts`. `pnpm test apps/api/src/modules/restaurants` -> 7 files, 80 tests passing; full `pnpm test` -> 51 files, 681 tests passing; `pnpm test:e2e` -> 19 passed; `pnpm typecheck` and `pnpm lint` clean (0 errors).
- Review follow-up: `f37c10a` — tightened R2 compensating-delete, DB-first delete, and best-effort previous-image-delete assertions in `service.test.ts` and un-nested `DELETE /api/size-presets/:id` in `controller-patch.test.ts`. `pnpm test apps/api/src/modules/restaurants` -> 7 files, 80 tests passing; `pnpm typecheck` and `pnpm lint` clean.
- Old `it` accounting (56 total):
  - `routes/restaurants.test.ts` (38 `it`): 7 moved to `controller-crud.test.ts`, 6 to `controller-patch.test.ts`, 12 to `controller-menu-image.test.ts`, 9 to `controller-generate-menu.test.ts`, and 4 merged into `controller-crud.test.ts` (`expectStructured500`):
    1. `GET returns a structured 500 when the database is unreachable`
    2. `PATCH /:id > returns a structured 500 when the database is unreachable`
    3. `menu image > POST /:id/menu-image > returns a structured 500 when the database is unreachable`
    4. `menu image > POST /:id/generate-menu > returns a structured 500 when the database is unreachable`
  - `routes/restaurants-size-preset.test.ts` (18 `it`): 6 moved to `controller-crud.test.ts`, 11 to `controller-patch.test.ts` (9 `PATCH` + 2 `DELETE /api/size-presets/:id`), and 1 merged into `controller-crud.test.ts` (`expectStructured500`):
    5. `PATCH /api/restaurants/:id > returns a structured 500 when the database is unreachable`

## Plan Deviations

- Added `exists(db, id)` (and its unit test) to `apps/api/src/modules/size-presets/repository.ts` instead of keeping `presetExists` in `modules/restaurants/`, following `.claude/rules/api-layers.md` ("Each repository owns its own tables. Cross-domain reads go through the other module's repository").
- Extracted AI menu generation (`GENERATE_MENU_*`, `parseGeneratedItems`, `bytesToBase64`, `generateMenuItemsFromImage`) into `modules/restaurants/menu-generation.ts` with `menu-generation.test.ts` (permitted by AC #5).
- The plan referenced four unreachable-DB 500 tests; across both old test files there were five (4 in `restaurants.test.ts` + 1 in `restaurants-size-preset.test.ts`). All 5 were merged into `controller-crud.test.ts`'s `expectStructured500` test, which also covers all 8 restaurant endpoints.
- `listRestaurants` returns `RestaurantRow[]` rather than a `Result` (consistent with `listEmployees` and `listMenuItems`), because listing has no domain failure and `respond()` only maps objects.
- Under pnpm 11, `pnpm test -- apps/api/src/modules/restaurants` forwards `--` verbatim to Vitest (`No test files found`); ran `pnpm test apps/api/src/modules/restaurants` instead (worth updating `AGENTS.md` / task frontmatter in a retrospective).
- `status: in_progress` was set locally before the red commit and committed together with `status: in_review` in the `chore:` commit.

## Review Notes

Code review subagent (`research`) reviewed `git diff main...HEAD` against `tasks/071-layer-restaurants.md`, `.claude/rules/api-layers.md`, `.claude/rules/api-error-handling.md`, and `main:apps/api/src/routes/restaurants*.ts`. Verdict: **No high- or medium-severity issues found.** Findings (all low):

1. **Compensating R2 delete test could pass vacuously** (`service.test.ts:268-280`): only asserted `bucket.objects.size === 0`, which would pass even if `put` had not run.
   - **Action:** Fixed in `f37c10a` — spied on `bucket.put` and `bucket.delete` to assert `put` ran once and `delete` was called with the uploaded key.
2. **DB-first ordering in `deleteMenuImage` test isn't actually asserted (and previous-image delete failure path untested)** (`service.test.ts:303-318`, `:251-266`).
   - **Action:** Fixed in `f37c10a` — asserted `findById(db, r!.id)?.menuImage === null` inside `failingDeleteBucket.delete()` before throwing, and added a re-upload assertion with a rejecting `delete` confirming best-effort old-image cleanup still returns `ok`.
3. **Slightly misleading `describe` nesting** (`controller-patch.test.ts:290-316`): `DELETE /api/size-presets/:id` was nested inside `describe("PATCH /api/restaurants/:id", ...)`.
   - **Action:** Fixed in `f37c10a` — moved `beforeEach`/`afterAll` to file scope and made `DELETE /api/size-presets/:id` a sibling top-level `describe`.
4. **Bookkeeping reminder: 5 (not 4) merged unreachable-DB tests to list in Implementation Log.**
   - **Action:** Named all 5 merged `it` blocks in the Implementation Log above.
