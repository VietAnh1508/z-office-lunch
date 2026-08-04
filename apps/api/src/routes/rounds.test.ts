import { createDb, roundMenuItems, rounds } from "db";
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
import { testEnv, unreachableEnv } from "../test/env";

type Round = typeof rounds.$inferSelect;
type RoundMenuItem = typeof roundMenuItems.$inferSelect;

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

  describe("round menu items", () => {
    it("POST adds a food menu item to the round", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: foodItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(201);
      const created = (await res.json()) as RoundMenuItem;
      expect(created.roundId).toBe(round!.id);
      expect(created.menuItemId).toBe(foodItem!.id);
    });

    it("POST adds a drink menu item to the round", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, drinkRestaurantId: drink!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: drinkItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(201);
    });

    it("POST rejects a menu item whose restaurant doesn't match the round's restaurants", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const otherFood = await seedRestaurant(db, { name: "Other Food", type: "food" });
      const otherItem = await seedMenuItem(db, { restaurantId: otherFood!.id, name: "Bun Cha" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: otherItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("POST for a nonexistent round returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });

      const res = await app.request(
        "/api/rounds/999999/menu-items",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: foodItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("POST with a nonexistent menuItemId returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: 999999 }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("POST for an already-curated menu item returns 409", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: foodItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(409);
    });

    it("GET lists curated menu items for a round", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/menu-items`, {}, testEnv);

      expect(res.status).toBe(200);
      const list = (await res.json()) as RoundMenuItem[];
      expect(list).toHaveLength(1);
      expect(list[0]?.menuItemId).toBe(foodItem!.id);
    });

    it("DELETE removes a curated menu item", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      const curated = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/${curated!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(200);

      const listRes = await app.request(`/api/rounds/${round!.id}/menu-items`, {}, testEnv);
      const list = (await listRes.json()) as RoundMenuItem[];
      expect(list).toHaveLength(0);
    });

    it("DELETE for a nonexistent curated item returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/999999`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(404);
    });
  });

  describe("round status transitions", () => {
    it("PATCH opens a round with at least one curated food item", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.status).toBe("open");
    });

    it("PATCH opening a round with zero curated food items returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH opening a round while another round is open returns 409", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItemA = await seedMenuItem(db, { restaurantId: food!.id, name: "Item A" });
      const foodItemB = await seedMenuItem(db, { restaurantId: food!.id, name: "Item B" });
      const openRound = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });
      await seedRoundMenuItem(db, { roundId: openRound!.id, menuItemId: foodItemA!.id });
      const draftRound = await seedRound(db, { foodRestaurantId: food!.id, label: "Round 2" });
      await seedRoundMenuItem(db, { roundId: draftRound!.id, menuItemId: foodItemB!.id });

      const res = await app.request(
        `/api/rounds/${draftRound!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
        testEnv,
      );

      expect(res.status).toBe(409);
    });

    it("PATCH closes an open round", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "closed" }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.status).toBe("closed");
    });

    it("PATCH closing a draft round returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "closed" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH with an invalid status value returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "bogus" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH status for a nonexistent round returns 404", async () => {
      const res = await app.request(
        "/api/rounds/999999/status",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });
  });
});
