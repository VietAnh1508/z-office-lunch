import { eq } from "drizzle-orm";
import { createDb, menuItems, roundMenuItems } from "db";
import {
  TEST_DATABASE_URL,
  seedMenuItem,
  seedRestaurant,
  seedRound,
  seedRoundMenuItem,
  truncateAll,
} from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { testEnv } from "../test/env";

type MenuItem = typeof menuItems.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("menu items routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("POST creates a menu item defaulting active to true", async () => {
    const restaurant = await seedRestaurant(db);

    const res = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Banh Mi" }),
      },
      testEnv,
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as MenuItem;
    expect(created.name).toBe("Banh Mi");
    expect(created.active).toBe(true);
  });

  it("POST under a nonexistent restaurant returns 404", async () => {
    const res = await app.request(
      "/api/restaurants/999999/menu-items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Banh Mi" }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("GET without ?active filters returns all items; ?active=true excludes inactive ones", async () => {
    const restaurant = await seedRestaurant(db);
    await db.insert(menuItems).values([
      { restaurantId: restaurant!.id, name: "Active Item", active: true },
      { restaurantId: restaurant!.id, name: "Inactive Item", active: false },
    ]);

    const allRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as MenuItem[];
    expect(all).toHaveLength(2);

    const activeRes = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items?active=true`,
      {},
      testEnv,
    );
    expect(activeRes.status).toBe(200);
    const active = (await activeRes.json()) as MenuItem[];
    expect(active).toHaveLength(1);
    expect(active[0]?.name).toBe("Active Item");
  });

  it("PATCH toggles active and is reflected in a subsequent GET", async () => {
    const restaurant = await seedRestaurant(db);
    const [item] = await db
      .insert(menuItems)
      .values({ restaurantId: restaurant!.id, name: "Banh Mi", active: true })
      .returning();

    const patchRes = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items/${item?.id}`,
      { method: "PATCH" },
      testEnv,
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as MenuItem;
    expect(patched.active).toBe(false);

    const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
    const rows = (await getRes.json()) as MenuItem[];
    expect(rows[0]?.active).toBe(false);
  });

  it("PATCH on a nonexistent menu item returns 404", async () => {
    const restaurant = await seedRestaurant(db);

    const res = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items/999999`,
      { method: "PATCH" },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("POST stores a numeric JSON price and rejects a non-numeric one", async () => {
    const restaurant = await seedRestaurant(db);

    const numericRes = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Banh Mi", price: 5.5 }),
      },
      testEnv,
    );
    expect(numericRes.status).toBe(201);
    const created = (await numericRes.json()) as MenuItem;
    expect(created.price).toBe("5.5");

    const invalidRes = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho", price: "not-a-number" }),
      },
      testEnv,
    );
    expect(invalidRes.status).toBe(400);
  });

  it("POST under a non-numeric restaurant id returns 404 without a server error", async () => {
    const res = await app.request(
      "/api/restaurants/not-a-number/menu-items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Banh Mi" }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("GET with a non-numeric restaurant id returns an empty list without a server error", async () => {
    const res = await app.request("/api/restaurants/not-a-number/menu-items", {}, testEnv);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("PATCH with a non-numeric item id returns 404 without a server error", async () => {
    const restaurant = await seedRestaurant(db);

    const res = await app.request(
      `/api/restaurants/${restaurant!.id}/menu-items/not-a-number`,
      { method: "PATCH" },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  describe("PATCH /:id/menu-items/:itemId/details", () => {
    it("updates name and price, leaving active untouched", async () => {
      const restaurant = await seedRestaurant(db);
      const item = await seedMenuItem(db, {
        restaurantId: restaurant!.id,
        name: "Banh Mi",
        price: "5",
        active: false,
      });

      const res = await app.request(
        `/api/restaurants/${restaurant!.id}/menu-items/${item!.id}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Banh Mi Thit", price: 7.5 }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as MenuItem;
      expect(updated.name).toBe("Banh Mi Thit");
      expect(updated.price).toBe("7.5");
      expect(updated.active).toBe(false);
    });

    it("rejects a blank/whitespace-only/missing name with 400 and leaves the row unchanged", async () => {
      const restaurant = await seedRestaurant(db);
      const item = await seedMenuItem(db, { restaurantId: restaurant!.id, name: "Banh Mi" });

      for (const name of ["", "   ", undefined]) {
        const res = await app.request(
          `/api/restaurants/${restaurant!.id}/menu-items/${item!.id}/details`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, price: 5 }),
          },
          testEnv,
        );
        expect(res.status).toBe(400);
      }

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      const rows = (await getRes.json()) as MenuItem[];
      expect(rows[0]?.name).toBe("Banh Mi");
    });

    it("rejects an invalid price with 400 and leaves the row unchanged", async () => {
      const restaurant = await seedRestaurant(db);
      const item = await seedMenuItem(db, {
        restaurantId: restaurant!.id,
        name: "Banh Mi",
        price: "5",
      });

      const res = await app.request(
        `/api/restaurants/${restaurant!.id}/menu-items/${item!.id}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Banh Mi", price: "not-a-number" }),
        },
        testEnv,
      );
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      const rows = (await getRes.json()) as MenuItem[];
      expect(rows[0]?.price).toBe("5");
    });

    it("clears price to null when omitted, null, or an empty string", async () => {
      const restaurant = await seedRestaurant(db);

      for (const price of [undefined, null, ""]) {
        const item = await seedMenuItem(db, {
          restaurantId: restaurant!.id,
          name: "Banh Mi",
          price: "5",
        });

        const res = await app.request(
          `/api/restaurants/${restaurant!.id}/menu-items/${item!.id}/details`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Banh Mi", price }),
          },
          testEnv,
        );
        expect(res.status).toBe(200);
        const updated = (await res.json()) as MenuItem;
        expect(updated.price).toBeNull();
      }
    });

    it("returns 404 for a nonexistent menu item", async () => {
      const restaurant = await seedRestaurant(db);

      const res = await app.request(
        `/api/restaurants/${restaurant!.id}/menu-items/999999/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Banh Mi" }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("returns 404 for non-integer restaurant or item ids", async () => {
      const restaurant = await seedRestaurant(db);
      const item = await seedMenuItem(db, { restaurantId: restaurant!.id, name: "Banh Mi" });

      const badRestaurant = await app.request(
        `/api/restaurants/not-a-number/menu-items/${item!.id}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Banh Mi" }),
        },
        testEnv,
      );
      expect(badRestaurant.status).toBe(404);

      const badItem = await app.request(
        `/api/restaurants/${restaurant!.id}/menu-items/not-a-number/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Banh Mi" }),
        },
        testEnv,
      );
      expect(badItem.status).toBe(404);
    });
  });

  describe("POST /:id/menu-items/bulk", () => {
    async function postBulk(restaurantId: number, body: unknown) {
      return app.request(
        `/api/restaurants/${restaurantId}/menu-items/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        testEnv,
      );
    }

    it("append inserts all items as active rows, leaving existing items untouched", async () => {
      const restaurant = await seedRestaurant(db);
      const existing = await seedMenuItem(db, { restaurantId: restaurant!.id, name: "Pho Bo" });

      const res = await postBulk(restaurant!.id, {
        mode: "append",
        items: [
          { name: "Banh Mi", price: "25000" },
          { name: "Bun Cha" },
        ],
      });

      expect(res.status).toBe(201);
      const inserted = (await res.json()) as MenuItem[];
      expect(inserted).toHaveLength(2);
      expect(inserted.every((i) => i.active)).toBe(true);
      expect(inserted.map((i) => i.name).sort()).toEqual(["Banh Mi", "Bun Cha"]);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      const rows = (await getRes.json()) as MenuItem[];
      expect(rows).toHaveLength(3);
      const stillThere = rows.find((r) => r.id === existing!.id);
      expect(stillThere?.active).toBe(true);
    });

    it("override deactivates existing active items and inserts the new ones as active", async () => {
      const restaurant = await seedRestaurant(db);
      const existing = await seedMenuItem(db, {
        restaurantId: restaurant!.id,
        name: "Pho Bo",
        active: true,
      });

      const res = await postBulk(restaurant!.id, {
        mode: "override",
        items: [{ name: "Banh Mi", price: "25000" }],
      });

      expect(res.status).toBe(201);
      const inserted = (await res.json()) as MenuItem[];
      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.name).toBe("Banh Mi");
      expect(inserted[0]?.active).toBe(true);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      const rows = (await getRes.json()) as MenuItem[];
      expect(rows).toHaveLength(2);
      const oldRow = rows.find((r) => r.id === existing!.id);
      expect(oldRow?.active).toBe(false);
    });

    it("override is FK-safe: a menu item curated into a round survives as a deactivated row, not deleted", async () => {
      const restaurant = await seedRestaurant(db);
      const item = await seedMenuItem(db, {
        restaurantId: restaurant!.id,
        name: "Pho Bo",
        active: true,
      });
      const round = await seedRound(db, { foodRestaurantId: restaurant!.id });
      const roundMenuItem = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: item!.id,
      });

      const res = await postBulk(restaurant!.id, {
        mode: "override",
        items: [{ name: "Banh Mi" }],
      });

      expect(res.status).toBe(201);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      const rows = (await getRes.json()) as MenuItem[];
      const oldRow = rows.find((r) => r.id === item!.id);
      expect(oldRow).toBeDefined();
      expect(oldRow?.active).toBe(false);

      const [stillCurated] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, roundMenuItem!.id));
      expect(stillCurated).toBeDefined();
      expect(stillCurated?.menuItemId).toBe(item!.id);
    });

    it("rejects a missing/invalid mode with 400", async () => {
      const restaurant = await seedRestaurant(db);

      for (const mode of [undefined, "invalid", "", 1]) {
        const res = await postBulk(restaurant!.id, { mode, items: [{ name: "Banh Mi" }] });
        expect(res.status).toBe(400);
      }
    });

    it("rejects missing/non-array/empty items for both modes with 400", async () => {
      const restaurant = await seedRestaurant(db);

      for (const mode of ["append", "override"]) {
        for (const items of [undefined, "not-an-array", []]) {
          const res = await postBulk(restaurant!.id, { mode, items });
          expect(res.status).toBe(400);
        }
      }
    });

    it("rejects a blank name in any item with 400 and writes nothing", async () => {
      const restaurant = await seedRestaurant(db);

      const res = await postBulk(restaurant!.id, {
        mode: "append",
        items: [{ name: "Banh Mi" }, { name: "   " }],
      });
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      expect(await getRes.json()).toEqual([]);
    });

    it("rejects an invalid price in any item with 400 and writes nothing", async () => {
      const restaurant = await seedRestaurant(db);

      const res = await postBulk(restaurant!.id, {
        mode: "append",
        items: [{ name: "Banh Mi", price: "not-a-number" }],
      });
      expect(res.status).toBe(400);

      const getRes = await app.request(`/api/restaurants/${restaurant!.id}/menu-items`, {}, testEnv);
      expect(await getRes.json()).toEqual([]);
    });

    it("returns 404 for a nonexistent or non-integer restaurant id", async () => {
      const missingRes = await postBulk(999999, { mode: "append", items: [{ name: "Banh Mi" }] });
      expect(missingRes.status).toBe(404);

      const badIdRes = await app.request(
        "/api/restaurants/not-a-number/menu-items/bulk",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "append", items: [{ name: "Banh Mi" }] }),
        },
        testEnv,
      );
      expect(badIdRes.status).toBe(404);
    });
  });
});
