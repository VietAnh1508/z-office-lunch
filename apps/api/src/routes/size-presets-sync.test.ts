import { eq } from "drizzle-orm";
import { createDb, menuItemSizes } from "db";
import {
  TEST_DATABASE_URL,
  seedMenuItem,
  seedMenuItemSize,
  seedRestaurant,
  seedSizePreset,
  truncateAll,
} from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { testEnv } from "../test/env";

const db = createDb(TEST_DATABASE_URL);

function patch(id: number, body: unknown) {
  return app.request(
    `/api/size-presets/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    testEnv,
  );
}

async function sizeIds(menuItemId: number) {
  const rows = await db
    .select({ id: menuItemSizes.sizeOptionId })
    .from(menuItemSizes)
    .where(eq(menuItemSizes.menuItemId, menuItemId));
  return rows.map((r) => r.id).sort((a, b) => a - b);
}

describe("PATCH /api/size-presets/:id menu item size sync", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("a new option is ticked for every item (active and inactive) of every restaurant using the preset", async () => {
    const { preset, options } = await seedSizePreset(db);
    const r1 = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id, name: "R1" });
    const r2 = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id, name: "R2" });
    const unrelated = await seedRestaurant(db, { type: "drink", name: "R3" });
    const items = [
      await seedMenuItem(db, { restaurantId: r1!.id, name: "A" }),
      await seedMenuItem(db, { restaurantId: r1!.id, name: "B", active: false }),
      await seedMenuItem(db, { restaurantId: r2!.id, name: "C" }),
    ];
    const untouched = await seedMenuItem(db, { restaurantId: unrelated!.id });
    await seedMenuItemSize(db, { menuItemId: items[0]!.id, sizeOptionId: options[0]!.id });

    const res = await patch(preset.id, {
      name: preset.name,
      options: [...options.map((o) => ({ id: o.id, label: o.label })), { label: "XL" }],
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { options: { id: number; label: string }[] };
    const xl = updated.options.find((o) => o.label === "XL")!;

    for (const item of items) {
      expect(await sizeIds(item!.id)).toContain(xl.id);
    }
    // existing ticks and unticks are left alone
    expect(await sizeIds(items[0]!.id)).toEqual([options[0]!.id, xl.id].sort((a, b) => a - b));
    expect(await sizeIds(untouched!.id)).toEqual([]);
  });

  it("a removed option's rows disappear and nothing else changes", async () => {
    const { preset, options } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const item = await seedMenuItem(db, { restaurantId: r!.id });
    for (const o of options) {
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: o.id });
    }

    const res = await patch(preset.id, {
      name: preset.name,
      options: [options[0]!, options[1]!].map((o) => ({ id: o.id, label: o.label })),
    });
    expect(res.status).toBe(200);
    expect(await sizeIds(item!.id)).toEqual([options[0]!.id, options[1]!.id]);
  });

  it("renames and reorders change no rows", async () => {
    const { preset, options } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const item = await seedMenuItem(db, { restaurantId: r!.id });
    await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[1]!.id });

    const res = await patch(preset.id, {
      name: "Renamed",
      options: [options[2]!, options[1]!, options[0]!].map((o) => ({
        id: o.id,
        label: `${o.label}!`,
      })),
    });
    expect(res.status).toBe(200);
    expect(await sizeIds(item!.id)).toEqual([options[1]!.id]);
  });
});
