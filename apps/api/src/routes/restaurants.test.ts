import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { testEnv, unreachableEnv } from "../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("restaurants routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("POST without name returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("valid POST persists a row and is retrievable via GET", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "food", contactInfo: "090-123-4567" }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.name).toBe("Pho 24");
    expect(created.type).toBe("food");

    const getRes = await app.request("/api/restaurants", {}, testEnv);
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Restaurant[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Pho 24");
    expect(rows[0]?.contactInfo).toBe("090-123-4567");
    expect(rows[0]?.type).toBe("food");
  });

  it("POST persists note and menuUrl", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pho 24",
          type: "food",
          note: "Cash only",
          menuUrl: "https://pho24.example.com/menu",
        }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.note).toBe("Cash only");
    expect(created.menuUrl).toBe("https://pho24.example.com/menu");
  });

  it("POST without note/menuUrl, or with blank/whitespace values, stores null for each independently", async () => {
    const missingRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "food" }),
      },
      testEnv,
    );
    const missingCreated = (await missingRes.json()) as Restaurant;
    expect(missingCreated.note).toBeNull();
    expect(missingCreated.menuUrl).toBeNull();

    const blankRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bun Cha", type: "food", note: "   ", menuUrl: "" }),
      },
      testEnv,
    );
    const blankCreated = (await blankRes.json()) as Restaurant;
    expect(blankCreated.note).toBeNull();
    expect(blankCreated.menuUrl).toBeNull();
  });

  it("POST without type returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST with an invalid type returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "sandwich" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("valid POST with type drink persists and round-trips via GET", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tra Da", type: "drink" }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.type).toBe("drink");

    const getRes = await app.request("/api/restaurants", {}, testEnv);
    const rows = (await getRes.json()) as Restaurant[];
    expect(rows[0]?.type).toBe("drink");
  });

  it("GET returns a structured 500 when the database is unreachable", async () => {
    const res = await app.request("/api/restaurants", {}, unreachableEnv);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  describe("PATCH /:id", () => {
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

    it("returns a structured 500 when the database is unreachable", async () => {
      const res = await app.request(
        "/api/restaurants/1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24" }),
        },
        unreachableEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    });
  });
});
