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
import app from "../../index";
import { testEnv } from "../../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

function patch(id: number, body: unknown, env = testEnv) {
  return app.request(
    `/api/restaurants/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function sizeRows(restaurantId: number) {
  const rows = await db
    .select({ menuItemId: menuItemSizes.menuItemId, sizeOptionId: menuItemSizes.sizeOptionId })
    .from(menuItemSizes)
    .innerJoin(menuItems, eq(menuItems.id, menuItemSizes.menuItemId))
    .where(eq(menuItems.restaurantId, restaurantId));
  return rows.sort((a, b) => a.menuItemId - b.menuItemId || a.sizeOptionId - b.sizeOptionId);
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("PATCH /api/restaurants/:id", () => {
  async function createRestaurant(overrides: Record<string, unknown> = {}) {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pho 24",
          type: "food",
          contactInfo: "090-123-4567",
          note: "Cash only",
          menuUrl: "https://pho24.example.com/menu",
          ...overrides,
        }),
      },
      testEnv,
    );
    return (await res.json()) as Restaurant;
  }

  it("updates name, contactInfo, note, menuUrl together and returns the updated row", async () => {
    const restaurant = await createRestaurant();

    const res = await app.request(
      `/api/restaurants/${restaurant.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pho 25",
          contactInfo: "090-999-9999",
          note: "Card accepted now",
          menuUrl: "https://pho25.example.com/menu",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Restaurant;
    expect(updated.name).toBe("Pho 25");
    expect(updated.contactInfo).toBe("090-999-9999");
    expect(updated.note).toBe("Card accepted now");
    expect(updated.menuUrl).toBe("https://pho25.example.com/menu");
  });

  it("clearing contactInfo/note/menuUrl (blank or omitted) sets them to null", async () => {
    const restaurant = await createRestaurant();

    const res = await app.request(
      `/api/restaurants/${restaurant.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", contactInfo: "   ", note: "" }),
      },
      testEnv,
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Restaurant;
    expect(updated.contactInfo).toBeNull();
    expect(updated.note).toBeNull();
    expect(updated.menuUrl).toBeNull();
  });

  it("blank/whitespace-only/missing name returns 400 nameRequired, row left unchanged", async () => {
    const restaurant = await createRestaurant();

    for (const body of [{ name: "   " }, {}]) {
      const res = await app.request(
        `/api/restaurants/${restaurant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        testEnv,
      );
      expect(res.status).toBe(400);
    }

    const getRes = await app.request("/api/restaurants", {}, testEnv);
    const rows = (await getRes.json()) as Restaurant[];
    expect(rows.find((r) => r.id === restaurant.id)?.name).toBe("Pho 24");
  });

  it("never modifies type, even if included in the request body", async () => {
    const restaurant = await createRestaurant({ type: "food" });

    const res = await app.request(
      `/api/restaurants/${restaurant.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "drink" }),
      },
      testEnv,
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Restaurant;
    expect(updated.type).toBe("food");
  });

  it("nonexistent id returns 404 restaurantNotFound", async () => {
    const res = await app.request(
      "/api/restaurants/999999",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24" }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("non-integer id returns 404 restaurantNotFound", async () => {
    const res = await app.request(
      "/api/restaurants/abc",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24" }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  describe("size preset", () => {
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
  });
});

describe("DELETE /api/size-presets/:id", () => {
  it("409 sizePresetInUse while a restaurant references it", async () => {
    const { preset } = await seedSizePreset(db);
    await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });

    const res = await app.request(`/api/size-presets/${preset.id}`, { method: "DELETE" }, testEnv);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "size preset is in use by a restaurant" });
  });

  it("deletes once no restaurant references it", async () => {
    const { preset } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    await patch(r!.id, { name: "Tea", sizePresetId: null });

    const res = await app.request(`/api/size-presets/${preset.id}`, { method: "DELETE" }, testEnv);
    expect(res.status).toBe(200);
  });
});
