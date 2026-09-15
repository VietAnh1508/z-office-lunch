---
id: 045
title: size_presets table + find-or-create CRUD-lite endpoint
status: approved
depends_on: []
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Add a `size_presets` table (an ordered list of size labels, e.g. `["S","M","L"]`, no
separate name — the label list is its identity) plus a minimal API to list existing
presets and find-or-create one. Standalone and self-contained; nothing references it yet.

## Acceptance Criteria

- [ ] `packages/db/src/schema.ts`: new `sizePresets` table — `id` (serial pk), `labels`
      (`text("labels").array().notNull()`), `unique().on(table.labels)`.
- [ ] A new migration exists under `packages/db/migrations/` (via `pnpm --filter db generate`)
      creating the table — inspect the generated SQL directly, don't assume from the diff alone.
      **Verify first**: confirm whether drizzle-kit actually emits a `UNIQUE` constraint on a
      `text[]` column (unseen elsewhere in this codebase). If it doesn't emit cleanly, drop the
      `unique()` from the schema and rely on the API's find-or-create as the sole dedup mechanism
      instead — state which path was taken in the Implementation Log.
- [ ] `GET /api/size-presets` → `200 [{ id, labels }, ...]`, ordered by `id`.
- [ ] `POST /api/size-presets` body `{ labels: string[] }`:
      - trims each label; 400 `sizePresetLabelsRequired` if the array is empty after trimming or
        any element is empty after trimming
      - 400 `sizePresetLabelsDuplicate` if any two trimmed labels are exactly equal (case-sensitive)
      - find-or-create: if a preset with the exact same ordered, trimmed label list already
        exists, return it with `200`; otherwise insert and return `201`
- [ ] New route file `apps/api/src/routes/size-presets.ts`, registered in `apps/api/src/index.ts`
      as `app.route("/api/size-presets", sizePresetsRoute)`, following the standard
      try/catch/finally + `ERROR_MESSAGES` + `db.$client.end()` shape (`.claude/rules/api-error-handling.md`).
- [ ] New `ERROR_MESSAGES` entries: `sizePresetLabelsRequired`, `sizePresetLabelsDuplicate`.
- [ ] `packages/db/src/testing.ts`: `size_presets` added to the `truncateAll` TRUNCATE list;
      new `seedSizePreset(db, overrides = {})` helper defaulting to `labels: ["S", "M", "L"]`.
- [ ] `packages/db/src/schema.test.ts`: `sizePresets` export asserted defined, same shape as
      the other table smoke-test entries.
- [ ] New `apps/api/src/routes/size-presets.test.ts` covering: empty list, create, validation
      (empty array, empty-after-trim label, duplicate labels within one request), find-or-create
      returning the same row + `200` on a repeat request, and a distinct order (`["L","M","S"]`
      vs `["S","M","L"]`) creating a second, different row.

## Plan

### Schema (`packages/db/src/schema.ts`)

```ts
export const sizePresets = pgTable(
  "size_presets",
  {
    id: serial("id").primaryKey(),
    labels: text("labels").array().notNull(),
  },
  (table) => [unique().on(table.labels)],
);
```

Place it near `restaurants` (nothing references it yet — no FK in this task). No `pgEnum`
touched, so this avoids the known non-interactive `drizzle-kit generate` prompt gotcha
(`tasks/015-move-type-to-restaurant.md`'s Plan Deviations) entirely.

Run `pnpm --filter db generate`, inspect the emitted SQL file for a `CREATE TABLE size_presets`
plus (if it emits) a `UNIQUE` constraint on `labels`, then `pnpm --filter db migrate` against the
local/test databases.

### API (`apps/api/src/routes/size-presets.ts`, new file)

```ts
export const sizePresetsRoute = new Hono<{ Bindings: Bindings }>();

sizePresetsRoute.get("/", async (c) => { /* select().from(sizePresets).orderBy(sizePresets.id) */ });

sizePresetsRoute.post("/", async (c) => {
  // 1. body.labels must be an array; trim each element
  // 2. 400 sizePresetLabelsRequired if empty (after trim) or any element empty after trim
  // 3. 400 sizePresetLabelsDuplicate if two trimmed labels are case-sensitively equal
  // 4. select where labels array-equals the normalized (trimmed, in order) input
  //    (`eq(sizePresets.labels, normalizedLabels)` -- Postgres array equality is exact-order,
  //    exact-length; verify this drizzle `eq()` call actually compiles/works against a text[]
  //    column during the red step, it hasn't been used elsewhere in this codebase)
  // 5. if found, return that row with 200; else insert and return 201
});
```

Register in `apps/api/src/index.ts`: `app.route("/api/size-presets", sizePresetsRoute)`,
alongside the existing four `app.route(...)` calls.

### Errors (`apps/api/src/lib/errors.ts`)

Add `sizePresetLabelsRequired: "labels must be a non-empty array of non-empty labels"` and
`sizePresetLabelsDuplicate: "labels must not contain duplicates"`.

### Test helpers (`packages/db/src/testing.ts`)

```ts
export async function seedSizePreset(
  db: Db,
  overrides: Partial<typeof schema.sizePresets.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.sizePresets)
    .values({ labels: ["S", "M", "L"], ...overrides })
    .returning();
  return row;
}
```

Add `size_presets` to the `truncateAll` TRUNCATE table list.

### Tests (`apps/api/src/routes/size-presets.test.ts`, new file)

Follow the existing `restaurants.test.ts` shape: `createDb(TEST_DATABASE_URL)`, `beforeEach:
truncateAll(db)`, `afterAll: db.$client.end()`, `app.request("/api/size-presets", ...,
testEnv)`. Cover the cases listed in Acceptance Criteria, plus the `unreachableEnv` 500-path
case per `.claude/rules/api-error-handling.md`.

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
