---
id: 071
title: Layer the restaurants module
status: approved
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

## Plan Deviations

## Review Notes
