import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../bindings";
import app from "../index";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

const testEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: TEST_DATABASE_URL } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;

const unreachableEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: "postgres://postgres:postgres@localhost:1/nonexistent" } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;

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
});
