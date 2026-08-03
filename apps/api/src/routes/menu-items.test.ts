import { createDb, menuItems } from "db";
import { TEST_DATABASE_URL, seedRestaurant, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../bindings";
import app from "../index";

type MenuItem = typeof menuItems.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

const testEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: TEST_DATABASE_URL } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;

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
        body: JSON.stringify({ type: "food", name: "Banh Mi" }),
      },
      testEnv,
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as MenuItem;
    expect(created.name).toBe("Banh Mi");
    expect(created.type).toBe("food");
    expect(created.active).toBe(true);
  });

  it("POST under a nonexistent restaurant returns 404", async () => {
    const res = await app.request(
      "/api/restaurants/999999/menu-items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "food", name: "Banh Mi" }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("GET without ?active filters returns all items; ?active=true excludes inactive ones", async () => {
    const restaurant = await seedRestaurant(db);
    await db.insert(menuItems).values([
      { restaurantId: restaurant!.id, type: "food", name: "Active Item", active: true },
      { restaurantId: restaurant!.id, type: "drink", name: "Inactive Item", active: false },
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
      .values({ restaurantId: restaurant!.id, type: "food", name: "Banh Mi", active: true })
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
        body: JSON.stringify({ type: "food", name: "Banh Mi", price: 5.5 }),
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
        body: JSON.stringify({ type: "food", name: "Pho", price: "not-a-number" }),
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
        body: JSON.stringify({ type: "food", name: "Banh Mi" }),
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
});
