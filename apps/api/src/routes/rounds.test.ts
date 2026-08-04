import { createDb, rounds } from "db";
import { TEST_DATABASE_URL, seedRestaurant, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { testEnv, unreachableEnv } from "../test/env";

type Round = typeof rounds.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("rounds routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("valid POST creates a draft round, ignoring a status passed in the body", async () => {
    const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: food!.id,
          deadline: "2026-08-10T12:00:00.000Z",
          status: "open",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as Round;
    expect(created.label).toBe("Week 1");
    expect(created.foodRestaurantId).toBe(food!.id);
    expect(created.drinkRestaurantId).toBeNull();
    expect(created.status).toBe("draft");
  });

  it("valid POST with a drinkRestaurantId persists both restaurants", async () => {
    const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });
    const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: food!.id,
          drinkRestaurantId: drink!.id,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as Round;
    expect(created.drinkRestaurantId).toBe(drink!.id);
  });

  it("POST without label returns 400", async () => {
    const food = await seedRestaurant(db, { type: "food" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodRestaurantId: food!.id, deadline: "2026-08-10T12:00:00.000Z" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST without a deadline returns 400", async () => {
    const food = await seedRestaurant(db, { type: "food" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Week 1", foodRestaurantId: food!.id }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST without foodRestaurantId returns 400", async () => {
    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Week 1", deadline: "2026-08-10T12:00:00.000Z" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST with a nonexistent foodRestaurantId returns 404", async () => {
    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: 999999,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("POST with a foodRestaurantId pointing at a drink restaurant returns 400", async () => {
    const drink = await seedRestaurant(db, { type: "drink" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: drink!.id,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST with a nonexistent drinkRestaurantId returns 404", async () => {
    const food = await seedRestaurant(db, { type: "food" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: food!.id,
          drinkRestaurantId: 999999,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(404);
  });

  it("POST with a drinkRestaurantId pointing at a food restaurant returns 400", async () => {
    const food = await seedRestaurant(db, { type: "food" });
    const otherFood = await seedRestaurant(db, { name: "Other Food", type: "food" });

    const res = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: food!.id,
          drinkRestaurantId: otherFood!.id,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("GET list and GET :id return created rounds", async () => {
    const food = await seedRestaurant(db, { type: "food" });

    const postRes = await app.request(
      "/api/rounds",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Week 1",
          foodRestaurantId: food!.id,
          deadline: "2026-08-10T12:00:00.000Z",
        }),
      },
      testEnv,
    );
    const created = (await postRes.json()) as Round;

    const listRes = await app.request("/api/rounds", {}, testEnv);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Round[];
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe("Week 1");

    const getRes = await app.request(`/api/rounds/${created.id}`, {}, testEnv);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Round;
    expect(fetched.label).toBe("Week 1");
  });

  it("GET :id for a nonexistent round returns 404", async () => {
    const res = await app.request("/api/rounds/999999", {}, testEnv);

    expect(res.status).toBe(404);
  });

  it("GET returns a structured 500 when the database is unreachable", async () => {
    const res = await app.request("/api/rounds", {}, unreachableEnv);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });
});
