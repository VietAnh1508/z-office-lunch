import { eq } from "drizzle-orm";
import { createDb, menuItemSizes, menuItems, restaurants } from "db";
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

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

function send(method: "POST" | "PATCH", path: string, body: unknown, env = testEnv) {
  return app.request(
    path,
    { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );
}

const post = (body: unknown, env = testEnv) => send("POST", "/api/restaurants", body, env);
const patch = (id: number, body: unknown, env = testEnv) =>
  send("PATCH", `/api/restaurants/${id}`, body, env);

async function sizeRows(restaurantId: number) {
  const rows = await db
    .select({ menuItemId: menuItemSizes.menuItemId, sizeOptionId: menuItemSizes.sizeOptionId })
    .from(menuItemSizes)
    .innerJoin(menuItems, eq(menuItems.id, menuItemSizes.menuItemId))
    .where(eq(menuItems.restaurantId, restaurantId));
  return rows.sort((a, b) => a.menuItemId - b.menuItemId || a.sizeOptionId - b.sizeOptionId);
}

describe("restaurant size preset", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("POST /api/restaurants", () => {
    it("stores sizePresetId on a drink restaurant and exposes it via GET", async () => {
      const { preset } = await seedSizePreset(db);
      const res = await post({ name: "Tea", type: "drink", sizePresetId: preset.id });
      expect(res.status).toBe(201);
      expect(((await res.json()) as Restaurant).sizePresetId).toBe(preset.id);

      const list = (await (await app.request("/api/restaurants", {}, testEnv)).json()) as Restaurant[];
      expect(list[0]?.sizePresetId).toBe(preset.id);
    });

    it("defaults sizePresetId to null when omitted or null", async () => {
      for (const body of [{ name: "A", type: "drink" }, { name: "B", type: "drink", sizePresetId: null }]) {
        const res = await post(body);
        expect(res.status).toBe(201);
        expect(((await res.json()) as Restaurant).sizePresetId).toBeNull();
      }
    });

    it("400 sizePresetIdInvalid when not an integer or null", async () => {
      for (const sizePresetId of ["1", 1.5, true, {}]) {
        const res = await post({ name: "Tea", type: "drink", sizePresetId });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "sizePresetId must be a valid size preset id" });
      }
    });

    it("400 sizePresetFoodRestaurant for a food restaurant with a preset", async () => {
      const { preset } = await seedSizePreset(db);
      const res = await post({ name: "Pho", type: "food", sizePresetId: preset.id });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "only a drink restaurant can have a size preset" });
    });

    it("allows a food restaurant with an explicit null preset", async () => {
      const res = await post({ name: "Pho", type: "food", sizePresetId: null });
      expect(res.status).toBe(201);
    });

    it("404 sizePresetNotFound for a missing preset", async () => {
      const res = await post({ name: "Tea", type: "drink", sizePresetId: 999999 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "size preset not found" });
    });
  });

  describe("PATCH /api/restaurants/:id", () => {
    it("omitted sizePresetId leaves it unchanged and does not touch item sizes", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });

      const res = await patch(r!.id, { name: "Renamed" });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Restaurant).sizePresetId).toBe(preset.id);
      expect(await sizeRows(r!.id)).toEqual([
        { menuItemId: item!.id, sizeOptionId: options[0]!.id },
      ]);
    });

    it("explicit null clears the preset and deletes all item sizes", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      for (const o of options) {
        await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: o.id });
      }

      const res = await patch(r!.id, { name: "Tea", sizePresetId: null });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Restaurant).sizePresetId).toBeNull();
      expect(await sizeRows(r!.id)).toEqual([]);
    });

    it("assigning a preset adds every option for every item, active and inactive", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const active = await seedMenuItem(db, { restaurantId: r!.id, name: "A" });
      const inactive = await seedMenuItem(db, { restaurantId: r!.id, name: "B", active: false });
      const other = await seedRestaurant(db, { type: "drink", name: "Other" });
      await seedMenuItem(db, { restaurantId: other!.id });

      const res = await patch(r!.id, { name: "Tea", sizePresetId: preset.id });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Restaurant).sizePresetId).toBe(preset.id);

      const expected = [active!, inactive!]
        .flatMap((i) => options.map((o) => ({ menuItemId: i.id, sizeOptionId: o.id })))
        .sort((a, b) => a.menuItemId - b.menuItemId || a.sizeOptionId - b.sizeOptionId);
      expect(await sizeRows(r!.id)).toEqual(expected);
      expect(await sizeRows(other!.id)).toEqual([]);
    });

    it("changing to another preset replaces the item sizes", async () => {
      const first = await seedSizePreset(db, { name: "First" });
      const second = await seedSizePreset(db, { name: "Second" });
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: first.preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: first.options[0]!.id });

      const res = await patch(r!.id, { name: "Tea", sizePresetId: second.preset.id });
      expect(res.status).toBe(200);
      expect(await sizeRows(r!.id)).toEqual(
        second.options
          .map((o) => ({ menuItemId: item!.id, sizeOptionId: o.id }))
          .sort((a, b) => a.sizeOptionId - b.sizeOptionId),
      );
    });

    it("re-sending the same preset does not rebuild (a unticked size stays unticked)", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[1]!.id });

      const res = await patch(r!.id, { name: "Tea", sizePresetId: preset.id });
      expect(res.status).toBe(200);
      expect(await sizeRows(r!.id)).toEqual([
        { menuItemId: item!.id, sizeOptionId: options[1]!.id },
      ]);
    });

    it("assigning a preset to a drink restaurant with no items succeeds", async () => {
      const { preset } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const res = await patch(r!.id, { name: "Tea", sizePresetId: preset.id });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Restaurant).sizePresetId).toBe(preset.id);
    });

    it("400 sizePresetIdInvalid for a non-integer value", async () => {
      const r = await seedRestaurant(db, { type: "drink" });
      const res = await patch(r!.id, { name: "Tea", sizePresetId: "1" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "sizePresetId must be a valid size preset id" });
    });

    it("400 sizePresetFoodRestaurant for a food restaurant with a preset", async () => {
      const { preset } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "food" });
      const res = await patch(r!.id, { name: "Pho", sizePresetId: preset.id });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "only a drink restaurant can have a size preset" });
    });

    it("404 sizePresetNotFound for a missing preset, and nothing changes", async () => {
      const r = await seedRestaurant(db, { type: "drink" });
      const res = await patch(r!.id, { name: "Tea", sizePresetId: 999999 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "size preset not found" });
    });

    it("returns a structured 500 when the database is unreachable", async () => {
      const res = await patch(1, { name: "Tea", sizePresetId: 1 }, unreachableEnv);
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error?: string }).error).toBeTruthy();
    });
  });

  describe("DELETE /api/size-presets/:id", () => {
    it("409 sizePresetInUse while a restaurant references it", async () => {
      const { preset } = await seedSizePreset(db);
      await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });

      const res = await app.request(
        `/api/size-presets/${preset.id}`,
        { method: "DELETE" },
        testEnv,
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "size preset is in use by a restaurant" });
    });

    it("deletes once no restaurant references it", async () => {
      const { preset } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      await patch(r!.id, { name: "Tea", sizePresetId: null });

      const res = await app.request(
        `/api/size-presets/${preset.id}`,
        { method: "DELETE" },
        testEnv,
      );
      expect(res.status).toBe(200);
    });
  });
});
