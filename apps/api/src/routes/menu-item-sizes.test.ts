import { eq } from "drizzle-orm";
import { createDb, menuItemSizes, menuItems } from "db";
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
import { testEnv, unreachableEnv } from "../test/env";

type Item = typeof menuItems.$inferSelect & { sizeOptionIds: number[] };

const db = createDb(TEST_DATABASE_URL);

function send(method: string, path: string, body?: unknown, env = testEnv) {
  return app.request(
    path,
    { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );
}

async function sizeIds(menuItemId: number) {
  const rows = await db
    .select({ id: menuItemSizes.sizeOptionId })
    .from(menuItemSizes)
    .where(eq(menuItemSizes.menuItemId, menuItemId));
  return rows.map((r) => r.id).sort((a, b) => a - b);
}

describe("menu item sizes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("auto-fill on create", () => {
    it("POST ticks every option of the restaurant's preset", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });

      const res = await send("POST", `/api/restaurants/${r!.id}/menu-items`, { name: "Latte" });
      expect(res.status).toBe(201);
      const created = (await res.json()) as { id: number };
      expect(await sizeIds(created.id)).toEqual(options.map((o) => o.id).sort((a, b) => a - b));
    });

    it("POST adds no size rows when the restaurant has no preset", async () => {
      const r = await seedRestaurant(db, { type: "drink" });
      const res = await send("POST", `/api/restaurants/${r!.id}/menu-items`, { name: "Latte" });
      const created = (await res.json()) as { id: number };
      expect(await sizeIds(created.id)).toEqual([]);
    });

    it("bulk ticks every option for every new item", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });

      const res = await send("POST", `/api/restaurants/${r!.id}/menu-items/bulk`, {
        mode: "append",
        items: [{ name: "A" }, { name: "B" }],
      });
      expect(res.status).toBe(201);
      const created = (await res.json()) as { id: number }[];
      const expected = options.map((o) => o.id).sort((a, b) => a - b);
      for (const item of created) {
        expect(await sizeIds(item.id)).toEqual(expected);
      }
    });

    it("bulk adds no size rows when the restaurant has no preset", async () => {
      const r = await seedRestaurant(db, { type: "drink" });
      const res = await send("POST", `/api/restaurants/${r!.id}/menu-items/bulk`, {
        mode: "append",
        items: [{ name: "A" }],
      });
      const created = (await res.json()) as { id: number }[];
      expect(await sizeIds(created[0]!.id)).toEqual([]);
    });
  });

  describe("GET sizeOptionIds", () => {
    it("lists each item's option ids ordered by option sortOrder", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const a = await seedMenuItem(db, { restaurantId: r!.id, name: "A" });
      const b = await seedMenuItem(db, { restaurantId: r!.id, name: "B" });
      // insert in reverse order so the result order can't be insertion order
      for (const o of [options[2]!, options[0]!]) {
        await seedMenuItemSize(db, { menuItemId: a!.id, sizeOptionId: o.id });
      }

      const res = await send("GET", `/api/restaurants/${r!.id}/menu-items`);
      const rows = (await res.json()) as Item[];
      expect(rows.find((i) => i.id === a!.id)?.sizeOptionIds).toEqual([
        options[0]!.id,
        options[2]!.id,
      ]);
      expect(rows.find((i) => i.id === b!.id)?.sizeOptionIds).toEqual([]);
    });
  });

  describe("PUT /api/restaurants/:id/menu-items/:itemId/sizes", () => {
    const put = (rid: number | string, iid: number | string, body: unknown, env = testEnv) =>
      send("PUT", `/api/restaurants/${rid}/menu-items/${iid}/sizes`, body, env);

    it("replaces the item's rows and returns { id, sizeOptionIds }", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });

      const res = await put(r!.id, item!.id, { sizeOptionIds: [options[2]!.id, options[1]!.id] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: item!.id,
        sizeOptionIds: [options[1]!.id, options[2]!.id],
      });
      expect(await sizeIds(item!.id)).toEqual([options[1]!.id, options[2]!.id]);
    });

    it("allows an empty list", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });

      const res = await put(r!.id, item!.id, { sizeOptionIds: [] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: item!.id, sizeOptionIds: [] });
      expect(await sizeIds(item!.id)).toEqual([]);
    });

    it("400 sizeOptionInvalid for an option from another preset", async () => {
      const { preset } = await seedSizePreset(db);
      const { options: foreign } = await seedSizePreset(db, { name: "Other" });
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });

      const res = await put(r!.id, item!.id, { sizeOptionIds: [foreign[0]!.id] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "size option does not belong to this preset" });
    });

    it("400 sizeOptionInvalid for a non-array, non-integer or duplicate ids", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });

      for (const sizeOptionIds of [
        undefined,
        "1",
        ["1"],
        [1.5],
        [options[0]!.id, options[0]!.id],
      ]) {
        const res = await put(r!.id, item!.id, { sizeOptionIds });
        expect(res.status).toBe(400);
      }
    });

    it("a restaurant without a preset only accepts an empty list", async () => {
      const { options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const item = await seedMenuItem(db, { restaurantId: r!.id });

      expect((await put(r!.id, item!.id, { sizeOptionIds: [] })).status).toBe(200);
      const res = await put(r!.id, item!.id, { sizeOptionIds: [options[0]!.id] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "size option does not belong to this preset" });
    });

    it("404 for an unknown restaurant, unknown item, or item of another restaurant", async () => {
      const r = await seedRestaurant(db, { type: "drink" });
      const other = await seedRestaurant(db, { type: "drink", name: "Other" });
      const item = await seedMenuItem(db, { restaurantId: other!.id });

      for (const [rid, iid] of [
        [999999, item!.id],
        [r!.id, 999999],
        [r!.id, item!.id],
        ["abc", item!.id],
        [r!.id, "abc"],
      ] as const) {
        const res = await put(rid, iid, { sizeOptionIds: [] });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "menu item not found" });
      }
    });

    it("500 when the database is unreachable", async () => {
      const res = await put(1, 1, { sizeOptionIds: [] }, unreachableEnv);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal error" });
    });
  });
});
