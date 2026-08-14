import { eq } from "drizzle-orm";
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
import { ERROR_MESSAGES } from "../lib/errors";
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

    it("POST on an open round returns 400 roundEditNotDraft", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: foodItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundEditNotDraft);
    });

    it("POST on a closed round returns 400 roundEditNotDraft", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: foodItem!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundEditNotDraft);
    });

    it("POST on a closed round with a mismatched-restaurant menuItemId still returns roundEditNotDraft, not roundMenuItemMismatch", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const otherFood = await seedRestaurant(db, { name: "Other Food", type: "food" });
      const otherItem = await seedMenuItem(db, { restaurantId: otherFood!.id, name: "Bun Cha" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

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
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundEditNotDraft);
    });

    it("DELETE on an open round returns 400 roundEditNotDraft, leaving the item curated", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });
      const curated = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/${curated!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundEditNotDraft);

      const listRes = await app.request(`/api/rounds/${round!.id}/menu-items`, {}, testEnv);
      const list = (await listRes.json()) as RoundMenuItem[];
      expect(list).toHaveLength(1);
    });

    it("DELETE on a closed round returns 400 roundEditNotDraft, leaving the item curated", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });
      const curated = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/${curated!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundEditNotDraft);

      const listRes = await app.request(`/api/rounds/${round!.id}/menu-items`, {}, testEnv);
      const list = (await listRes.json()) as RoundMenuItem[];
      expect(list).toHaveLength(1);
    });

    it("DELETE on a closed round with a nonexistent itemId still returns 404 roundMenuItemNotFound", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/999999`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundMenuItemNotFound);
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

  describe("round deletion", () => {
    it("DELETE removes a draft round", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(`/api/rounds/${round!.id}`, { method: "DELETE" }, testEnv);

      expect(res.status).toBe(200);
      const deleted = (await res.json()) as Round;
      expect(deleted.id).toBe(round!.id);

      const listRes = await app.request("/api/rounds", {}, testEnv);
      const list = (await listRes.json()) as Round[];
      expect(list).toHaveLength(0);
    });

    it("DELETE removes curated menu items for the round along with it", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}`, { method: "DELETE" }, testEnv);

      expect(res.status).toBe(200);

      const [orphan] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.roundId, round!.id));
      expect(orphan).toBeUndefined();
    });

    it("DELETE an open round returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request(`/api/rounds/${round!.id}`, { method: "DELETE" }, testEnv);

      expect(res.status).toBe(400);
    });

    it("DELETE a closed round returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

      const res = await app.request(`/api/rounds/${round!.id}`, { method: "DELETE" }, testEnv);

      expect(res.status).toBe(400);
    });

    it("DELETE for a nonexistent round returns 404", async () => {
      const res = await app.request("/api/rounds/999999", { method: "DELETE" }, testEnv);

      expect(res.status).toBe(404);
    });

    it("DELETE with a non-integer id returns 404", async () => {
      const res = await app.request("/api/rounds/abc", { method: "DELETE" }, testEnv);

      expect(res.status).toBe(404);
    });
  });

  describe("round update", () => {
    it("PATCH a deadline-only change on a draft round succeeds, leaving curated food items untouched", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      const curated = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(new Date(updated.deadline).toISOString()).toBe("2026-09-01T12:00:00.000Z");
      expect(updated.foodRestaurantId).toBe(food!.id);

      const [stillCurated] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curated!.id));
      expect(stillCurated).toBeDefined();
    });

    it("PATCH changing foodRestaurantId purges only that side's stale curated items", async () => {
      const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });
      const otherFood = await seedRestaurant(db, { name: "Bun Cha", type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
      });
      const curatedFood = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: foodItem!.id,
      });
      const curatedDrink = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: drinkItem!.id,
      });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: round!.deadline.toISOString(),
            foodRestaurantId: otherFood!.id,
            drinkRestaurantId: drink!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.foodRestaurantId).toBe(otherFood!.id);

      const [orphanFood] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curatedFood!.id));
      expect(orphanFood).toBeUndefined();

      const [stillCuratedDrink] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curatedDrink!.id));
      expect(stillCuratedDrink).toBeDefined();
    });

    it("PATCH changing drinkRestaurantId purges only that side's stale curated items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const otherDrink = await seedRestaurant(db, { name: "Coconut Coffee", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
      });
      const curatedFood = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: foodItem!.id,
      });
      const curatedDrink = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: drinkItem!.id,
      });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: round!.deadline.toISOString(),
            foodRestaurantId: food!.id,
            drinkRestaurantId: otherDrink!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.drinkRestaurantId).toBe(otherDrink!.id);

      const [orphanDrink] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curatedDrink!.id));
      expect(orphanDrink).toBeUndefined();

      const [stillCuratedFood] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curatedFood!.id));
      expect(stillCuratedFood).toBeDefined();
    });

    it("PATCH clearing drinkRestaurantId sets it to null and purges its curated items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
      });
      const curatedDrink = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: drinkItem!.id,
      });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: round!.deadline.toISOString(),
            foodRestaurantId: food!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.drinkRestaurantId).toBeNull();

      const [orphanDrink] = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.id, curatedDrink!.id));
      expect(orphanDrink).toBeUndefined();
    });

    it("PATCH on an open round returns 400 and leaves the row unchanged", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);

      const [unchanged] = await db.select().from(rounds).where(eq(rounds.id, round!.id));
      expect(unchanged!.deadline).toEqual(round!.deadline);
    });

    it("PATCH on a closed round returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH for a nonexistent round returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });

      const res = await app.request(
        "/api/rounds/999999",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("PATCH with a non-integer id returns 404", async () => {
      const res = await app.request(
        "/api/rounds/abc",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadline: "2026-09-01T12:00:00.000Z", foodRestaurantId: 1 }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("PATCH with an invalid deadline returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foodRestaurantId: food!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH with a non-integer foodRestaurantId returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadline: "2026-09-01T12:00:00.000Z" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH with a foodRestaurantId referencing a missing restaurant returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: 999999,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("PATCH with a foodRestaurantId pointing at a drink restaurant returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { type: "drink" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: drink!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH with a non-integer drinkRestaurantId returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
            drinkRestaurantId: "abc",
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH with a drinkRestaurantId pointing at a food restaurant returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const otherFood = await seedRestaurant(db, { name: "Other Food", type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadline: "2026-09-01T12:00:00.000Z",
            foodRestaurantId: food!.id,
            drinkRestaurantId: otherFood!.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });
  });

  describe("public round view", () => {
    it("GET /public for a draft round returns 404", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(404);
    });

    it("GET /public for a nonexistent round returns 404", async () => {
      const res = await app.request("/api/rounds/999999/public", {}, testEnv);

      expect(res.status).toBe(404);
    });

    it("a draft round and a nonexistent round return the identical 404 body", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const draftRound = await seedRound(db, { foodRestaurantId: food!.id });

      const draftRes = await app.request(`/api/rounds/${draftRound!.id}/public`, {}, testEnv);
      const missingRes = await app.request("/api/rounds/999999/public", {}, testEnv);

      expect(await draftRes.json()).toEqual(await missingRes.json());
    });

    it("GET /public for an open round with no drinkRestaurantId omits drinkItems entirely", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, {
        restaurantId: food!.id,
        name: "Pho Bo",
        price: "50000",
      });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        label: string;
        foodItems: Array<{ id: number; name: string }>;
        drinkItems?: unknown[];
      };
      expect(body.label).toBe(round!.label);
      expect(body.foodItems).toHaveLength(1);
      expect(body.foodItems[0]?.name).toBe("Pho Bo");
      expect("drinkItems" in body).toBe(false);
      expect(JSON.stringify(body)).not.toContain("price");
    });

    it("GET /public for an open round with a drinkRestaurantId includes curated drink items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
        status: "open",
      });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: drinkItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { drinkItems: Array<{ id: number; name: string }> };
      expect(body.drinkItems).toHaveLength(1);
      expect(body.drinkItems[0]?.name).toBe("Tra Da");
    });

    it("GET /public for a closed round still returns its items and status", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; foodItems: unknown[] };
      expect(body.status).toBe("closed");
      expect(body.foodItems).toHaveLength(1);
    });
  });

  describe("public rounds list", () => {
    type PublicRound = {
      id: number;
      label: string;
      status: string;
      deadline: string;
      foodRestaurantName: string;
      drinkRestaurantName: string | null;
    };

    it("GET /api/rounds/public returns only open/closed rounds, draft's label absent", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      await seedRound(db, { foodRestaurantId: food!.id, label: "Draft Round" });
      await seedRound(db, { foodRestaurantId: food!.id, label: "Open Round", status: "open" });
      await seedRound(db, { foodRestaurantId: food!.id, label: "Closed Round", status: "closed" });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as PublicRound[];
      const labels = body.map((r) => r.label);
      expect(labels).toContain("Open Round");
      expect(labels).toContain("Closed Round");
      expect(labels).not.toContain("Draft Round");
    });

    it("GET /api/rounds/public returns 200 with an array (regression guard against /:id shadowing)", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/rounds/public sorts the response by deadline ascending", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      await seedRound(db, {
        foodRestaurantId: food!.id,
        label: "Later",
        status: "open",
        deadline: new Date("2026-09-01T00:00:00.000Z"),
      });
      await seedRound(db, {
        foodRestaurantId: food!.id,
        label: "Earlier",
        status: "closed",
        deadline: new Date("2026-08-01T00:00:00.000Z"),
      });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as PublicRound[];
      expect(body.map((r) => r.label)).toEqual(["Earlier", "Later"]);
    });

    it("GET /api/rounds/public joins restaurant names, not raw ids", async () => {
      const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
        status: "open",
      });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as PublicRound[];
      expect(body[0]?.foodRestaurantName).toBe("Pho 24");
      expect(body[0]?.drinkRestaurantName).toBe("Tra Da Corner");
    });

    it("GET /api/rounds/public returns drinkRestaurantName: null when the round has no drink restaurant", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as PublicRound[];
      expect("drinkRestaurantName" in body[0]!).toBe(true);
      expect(body[0]?.drinkRestaurantName).toBeNull();
    });

    it("GET /api/rounds/public returns 200, [] when no rounds match", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      await seedRound(db, { foodRestaurantId: food!.id, label: "Only Draft" });

      const res = await app.request("/api/rounds/public", {}, testEnv);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("GET /api/rounds/public returns a structured 500 when the database is unreachable", async () => {
      const res = await app.request("/api/rounds/public", {}, unreachableEnv);

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    });
  });
});
