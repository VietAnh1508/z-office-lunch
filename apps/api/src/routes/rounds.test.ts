import { eq } from "drizzle-orm";
import { createDb, roundMenuItems, rounds, submissions } from "db";
import {
  TEST_DATABASE_URL,
  seedEmployee,
  seedMenuItem,
  seedRestaurant,
  seedRound,
  seedRoundMenuItem,
  seedSubmission,
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

  describe("auto-curation on round create", () => {
    it("POST auto-curates all active food menu items into round_menu_items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const itemA = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const itemB = await seedMenuItem(db, { restaurantId: food!.id, name: "Bun Cha" });

      const res = await app.request(
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

      expect(res.status).toBe(201);
      const created = (await res.json()) as Round;
      const curated = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.roundId, created.id));
      expect(curated.map((c) => c.menuItemId).sort((a, b) => a - b)).toEqual(
        [itemA!.id, itemB!.id].sort((a, b) => a - b),
      );
    });

    it("POST skips inactive food menu items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const activeItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      await seedMenuItem(db, { restaurantId: food!.id, name: "Discontinued", active: false });

      const res = await app.request(
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

      expect(res.status).toBe(201);
      const created = (await res.json()) as Round;
      const curated = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.roundId, created.id));
      expect(curated).toHaveLength(1);
      expect(curated[0]?.menuItemId).toBe(activeItem!.id);
    });

    it("POST with a drinkRestaurantId also auto-curates that restaurant's active items", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });

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
      const curated = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.roundId, created.id));
      expect(curated.map((c) => c.menuItemId).sort((a, b) => a - b)).toEqual(
        [foodItem!.id, drinkItem!.id].sort((a, b) => a - b),
      );
    });

    it("POST for a restaurant with zero active menu items still succeeds, curating nothing", async () => {
      const food = await seedRestaurant(db, { type: "food" });

      const res = await app.request(
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

      expect(res.status).toBe(201);
      const created = (await res.json()) as Round;
      const curated = await db
        .select()
        .from(roundMenuItems)
        .where(eq(roundMenuItems.roundId, created.id));
      expect(curated).toHaveLength(0);
    });
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

    it("DELETE nulls foodRoundMenuItemId/foodNote on a referencing submission, leaves drink side untouched", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, drinkRestaurantId: drink!.id });
      const curatedFood = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });
      const curatedDrink = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: drinkItem!.id });
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: curatedFood!.id,
        foodNote: "extra spicy",
        drinkRoundMenuItemId: curatedDrink!.id,
        drinkNote: "less ice",
      });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/${curatedFood!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(200);

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission!.foodRoundMenuItemId).toBeNull();
      expect(updatedSubmission!.foodNote).toBeNull();
      expect(updatedSubmission!.drinkRoundMenuItemId).toBe(curatedDrink!.id);
      expect(updatedSubmission!.drinkNote).toBe("less ice");
    });

    it("DELETE nulls drinkRoundMenuItemId/drinkNote on a referencing submission, leaves food side untouched", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, drinkRestaurantId: drink!.id });
      const curatedFood = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });
      const curatedDrink = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: drinkItem!.id });
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: curatedFood!.id,
        foodNote: "extra spicy",
        drinkRoundMenuItemId: curatedDrink!.id,
        drinkNote: "less ice",
      });

      const res = await app.request(
        `/api/rounds/${round!.id}/menu-items/${curatedDrink!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      expect(res.status).toBe(200);

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission!.drinkRoundMenuItemId).toBeNull();
      expect(updatedSubmission!.drinkNote).toBeNull();
      expect(updatedSubmission!.foodRoundMenuItemId).toBe(curatedFood!.id);
      expect(updatedSubmission!.foodNote).toBe("extra spicy");
    });

    it("DELETE with no referencing submission returns the deleted row unchanged", async () => {
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
      const deleted = (await res.json()) as RoundMenuItem;
      expect(deleted).toEqual(curated);
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

    it("PATCH reverts an open round to draft", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Round;
      expect(updated.status).toBe("draft");
    });

    it("PATCH reverting a draft round to draft returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("PATCH reverting a closed round to draft returns 400", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "closed" });

      const res = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
    });

    it("reverting and reopening still enforces roundOpenNoFoodItems if curation was emptied out", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });
      const roundMenuItem = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: foodItem!.id,
      });

      const revertRes = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        },
        testEnv,
      );
      expect(revertRes.status).toBe(200);

      await app.request(
        `/api/rounds/${round!.id}/menu-items/${roundMenuItem!.id}`,
        { method: "DELETE" },
        testEnv,
      );

      const reopenRes = await app.request(
        `/api/rounds/${round!.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
        testEnv,
      );

      expect(reopenRes.status).toBe(400);
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

    it("PATCH changing foodRestaurantId nulls foodRoundMenuItemId/foodNote on affected submissions, leaves drink side untouched", async () => {
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
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: curatedFood!.id,
        foodNote: "extra spicy",
        drinkRoundMenuItemId: curatedDrink!.id,
        drinkNote: "less ice",
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

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission!.foodRoundMenuItemId).toBeNull();
      expect(updatedSubmission!.foodNote).toBeNull();
      expect(updatedSubmission!.drinkRoundMenuItemId).toBe(curatedDrink!.id);
      expect(updatedSubmission!.drinkNote).toBe("less ice");
    });

    it("PATCH changing drinkRestaurantId nulls drinkRoundMenuItemId/drinkNote on affected submissions, leaves food side untouched", async () => {
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
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: curatedFood!.id,
        foodNote: "extra spicy",
        drinkRoundMenuItemId: curatedDrink!.id,
        drinkNote: "less ice",
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

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission!.drinkRoundMenuItemId).toBeNull();
      expect(updatedSubmission!.drinkNote).toBeNull();
      expect(updatedSubmission!.foodRoundMenuItemId).toBe(curatedFood!.id);
      expect(updatedSubmission!.foodNote).toBe("extra spicy");
    });

    it("PATCH clearing drinkRestaurantId nulls drinkRoundMenuItemId/drinkNote on affected submissions", async () => {
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
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: curatedDrink!.id,
        drinkNote: "less ice",
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

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission!.drinkRoundMenuItemId).toBeNull();
      expect(updatedSubmission!.drinkNote).toBeNull();
    });

    it("PATCH with a deadline-only change leaves an existing submission completely untouched", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const round = await seedRound(db, { foodRestaurantId: food!.id });
      const curatedFood = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: foodItem!.id,
      });
      const employee = await seedEmployee(db);
      const submission = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: curatedFood!.id,
        foodNote: "extra spicy",
        drinkRoundMenuItemId: null,
      });

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

      const [updatedSubmission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submission!.id));
      expect(updatedSubmission).toEqual(submission);
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

    describe("auto-curation on restaurant change", () => {
      it("PATCH changing foodRestaurantId auto-curates the new restaurant's active items", async () => {
        const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });
        const otherFood = await seedRestaurant(db, { name: "Bun Cha", type: "food" });
        const otherFoodItem = await seedMenuItem(db, {
          restaurantId: otherFood!.id,
          name: "Bun Cha",
        });
        const round = await seedRound(db, { foodRestaurantId: food!.id });

        const res = await app.request(
          `/api/rounds/${round!.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deadline: round!.deadline.toISOString(),
              foodRestaurantId: otherFood!.id,
            }),
          },
          testEnv,
        );

        expect(res.status).toBe(200);
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated).toHaveLength(1);
        expect(curated[0]?.menuItemId).toBe(otherFoodItem!.id);
      });

      it("PATCH changing drinkRestaurantId auto-curates the new restaurant's active items", async () => {
        const food = await seedRestaurant(db, { type: "food" });
        const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
        const otherDrink = await seedRestaurant(db, { name: "Coconut Coffee", type: "drink" });
        const otherDrinkItem = await seedMenuItem(db, {
          restaurantId: otherDrink!.id,
          name: "Coconut Coffee",
        });
        const round = await seedRound(db, {
          foodRestaurantId: food!.id,
          drinkRestaurantId: drink!.id,
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
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated).toHaveLength(1);
        expect(curated[0]?.menuItemId).toBe(otherDrinkItem!.id);
      });

      it("PATCH clearing drinkRestaurantId (value→null) purges and curates nothing", async () => {
        const food = await seedRestaurant(db, { type: "food" });
        const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
        const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
        const round = await seedRound(db, {
          foodRestaurantId: food!.id,
          drinkRestaurantId: drink!.id,
        });
        await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: drinkItem!.id });

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
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated).toHaveLength(0);
      });

      it("PATCH setting drinkRestaurantId for the first time (null→value) auto-curates its active items, leaving food untouched", async () => {
        const food = await seedRestaurant(db, { type: "food" });
        const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
        const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
        const drinkItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
        const round = await seedRound(db, { foodRestaurantId: food!.id });
        const curatedFood = await seedRoundMenuItem(db, {
          roundId: round!.id,
          menuItemId: foodItem!.id,
        });

        const res = await app.request(
          `/api/rounds/${round!.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deadline: round!.deadline.toISOString(),
              foodRestaurantId: food!.id,
              drinkRestaurantId: drink!.id,
            }),
          },
          testEnv,
        );

        expect(res.status).toBe(200);
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated.map((c) => c.menuItemId).sort((a, b) => a - b)).toEqual(
          [foodItem!.id, drinkItem!.id].sort((a, b) => a - b),
        );
        expect(curated.some((c) => c.id === curatedFood!.id)).toBe(true);
      });

      it("PATCH with a deadline-only change auto-curates nothing on either side", async () => {
        const food = await seedRestaurant(db, { type: "food" });
        // Added to the restaurant after round creation -- auto-curation only
        // fires on round create or a restaurant change, not when a restaurant's
        // menu items change later, so a deadline-only PATCH must not pick it up.
        await seedMenuItem(db, { restaurantId: food!.id, name: "New Item" });
        const round = await seedRound(db, { foodRestaurantId: food!.id });

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
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated).toHaveLength(0);
      });

      it("PATCH A→B then B→A re-triggers full auto-curation, re-inserting a previously unchecked item", async () => {
        const foodA = await seedRestaurant(db, { name: "Pho 24", type: "food" });
        const itemA1 = await seedMenuItem(db, { restaurantId: foodA!.id, name: "Pho Bo" });
        const itemA2 = await seedMenuItem(db, { restaurantId: foodA!.id, name: "Pho Ga" });
        const foodB = await seedRestaurant(db, { name: "Bun Cha", type: "food" });
        const round = await seedRound(db, { foodRestaurantId: foodA!.id });
        // Simulates the state right after round creation auto-curated both A
        // items and the admin then manually opted itemA2 back out, before the
        // restaurant is ever changed.
        await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: itemA1!.id });

        await app.request(
          `/api/rounds/${round!.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deadline: round!.deadline.toISOString(),
              foodRestaurantId: foodB!.id,
            }),
          },
          testEnv,
        );
        const res = await app.request(
          `/api/rounds/${round!.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deadline: round!.deadline.toISOString(),
              foodRestaurantId: foodA!.id,
            }),
          },
          testEnv,
        );

        expect(res.status).toBe(200);
        const curated = await db
          .select()
          .from(roundMenuItems)
          .where(eq(roundMenuItems.roundId, round!.id));
        expect(curated.map((c) => c.menuItemId).sort((a, b) => a - b)).toEqual(
          [itemA1!.id, itemA2!.id].sort((a, b) => a - b),
        );
      });
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

    it("GET /public for an open round with no drinkRestaurantId omits drinkItems and drinkRestaurant entirely", async () => {
      const food = await seedRestaurant(db, {
        type: "food",
        contactInfo: "012-345-6789",
        note: "Cash only",
      });
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
        foodRestaurant: { id: number; name: string; menuUrl: string | null; menuImage: string | null };
        drinkRestaurant?: unknown;
      };
      expect(body.label).toBe(round!.label);
      expect(body.foodItems).toHaveLength(1);
      expect(body.foodItems[0]?.name).toBe("Pho Bo");
      expect("drinkItems" in body).toBe(false);
      expect(body.foodRestaurant).toEqual({
        id: food!.id,
        name: food!.name,
        menuUrl: null,
        menuImage: null,
      });
      expect("drinkRestaurant" in body).toBe(false);
      const json = JSON.stringify(body);
      expect(json).not.toContain("price");
      expect(json).not.toContain("contactInfo");
      expect(json).not.toContain("Cash only");
      expect(json).not.toContain("012-345-6789");
      expect(json).not.toContain("note");
      expect(json).not.toContain("createdAt");
      expect(json).not.toContain('"type"');
    });

    it("GET /public includes foodRestaurant's menuUrl and menuImage when set on the restaurant", async () => {
      const food = await seedRestaurant(db, {
        type: "food",
        menuUrl: "https://example.com/menu",
        menuImage: "some-r2-key",
      });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "open" });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        foodRestaurant: { menuUrl: string | null; menuImage: string | null };
      };
      expect(body.foodRestaurant.menuUrl).toBe("https://example.com/menu");
      expect(body.foodRestaurant.menuImage).toBe("some-r2-key");
    });

    it("GET /public for an open round with a drinkRestaurantId includes curated drink items and drinkRestaurant", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, {
        name: "Tra Da Corner",
        type: "drink",
        menuUrl: "https://tradacorner.example.com",
      });
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
      const body = (await res.json()) as {
        drinkItems: Array<{ id: number; name: string }>;
        drinkRestaurant: { id: number; name: string; menuUrl: string | null; menuImage: string | null };
      };
      expect(body.drinkItems).toHaveLength(1);
      expect(body.drinkItems[0]?.name).toBe("Tra Da");
      expect(body.drinkRestaurant).toEqual({
        id: drink!.id,
        name: "Tra Da Corner",
        menuUrl: "https://tradacorner.example.com",
        menuImage: null,
      });
    });

    it("GET /public for a closed round still returns its items, status, foodRestaurant, and drinkRestaurant", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        drinkRestaurantId: drink!.id,
        status: "closed",
      });
      await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: foodItem!.id });

      const res = await app.request(`/api/rounds/${round!.id}/public`, {}, testEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        foodItems: unknown[];
        foodRestaurant: { id: number };
        drinkRestaurant: { id: number };
      };
      expect(body.status).toBe("closed");
      expect(body.foodItems).toHaveLength(1);
      expect(body.foodRestaurant.id).toBe(food!.id);
      expect(body.drinkRestaurant.id).toBe(drink!.id);
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
      expect(typeof body[0]?.id).toBe("number");
      expect(body[0]?.status).toBe("open");
      expect(body[0]?.deadline).toBeTruthy();
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

  describe("submissions", () => {
    type Submission = typeof submissions.$inferSelect;

    async function seedOpenFoodRound(overrides: Partial<typeof rounds.$inferInsert> = {}) {
      const food = await seedRestaurant(db, { name: "Pho 24", type: "food" });
      const foodMenuItem = await seedMenuItem(db, { restaurantId: food!.id, name: "Pho Bo" });
      const round = await seedRound(db, {
        foodRestaurantId: food!.id,
        status: "open",
        deadline: new Date("2999-01-01T00:00:00.000Z"),
        ...overrides,
      });
      const foodRoundMenuItem = await seedRoundMenuItem(db, {
        roundId: round!.id,
        menuItemId: foodMenuItem!.id,
      });
      return { food, foodMenuItem, round: round!, foodRoundMenuItem: foodRoundMenuItem! };
    }

    it("valid POST creates a submission for the food item only", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();
      const employee = await seedEmployee(db, { fullName: "An Nguyen" });

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
            foodNote: "No cilantro",
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(201);
      const created = (await res.json()) as Submission;
      expect(created.roundId).toBe(round.id);
      expect(created.employeeId).toBe(employee!.id);
      expect(created.foodRoundMenuItemId).toBe(foodRoundMenuItem.id);
      expect(created.foodNote).toBe("No cilantro");
      expect(created.drinkRoundMenuItemId).toBeNull();
    });

    describe("round menu item deletion nulls a referencing submission", () => {
      it("nulls foodRoundMenuItemId when the referenced round menu item is deleted", async () => {
        const { round, foodRoundMenuItem } = await seedOpenFoodRound();
        const employee = await seedEmployee(db);
        const submission = await seedSubmission(db, {
          roundId: round.id,
          employeeId: employee!.id,
          foodRoundMenuItemId: foodRoundMenuItem.id,
        });

        await db.delete(roundMenuItems).where(eq(roundMenuItems.id, foodRoundMenuItem.id));

        const [updated] = await db
          .select()
          .from(submissions)
          .where(eq(submissions.id, submission!.id));
        expect(updated?.foodRoundMenuItemId).toBeNull();
      });

      it("nulls drinkRoundMenuItemId when the referenced round menu item is deleted", async () => {
        const { round, foodRoundMenuItem } = await seedOpenFoodRound();
        const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
        const drinkMenuItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
        const drinkRoundMenuItem = await seedRoundMenuItem(db, {
          roundId: round.id,
          menuItemId: drinkMenuItem!.id,
        });
        const employee = await seedEmployee(db);
        const submission = await seedSubmission(db, {
          roundId: round.id,
          employeeId: employee!.id,
          foodRoundMenuItemId: foodRoundMenuItem.id,
          drinkRoundMenuItemId: drinkRoundMenuItem!.id,
        });

        await db.delete(roundMenuItems).where(eq(roundMenuItems.id, drinkRoundMenuItem!.id));

        const [updated] = await db
          .select()
          .from(submissions)
          .where(eq(submissions.id, submission!.id));
        expect(updated?.drinkRoundMenuItemId).toBeNull();
      });
    });

    it("valid POST with drink fields persists both food and drink picks", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();
      const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
      const drinkMenuItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
      await db
        .update(rounds)
        .set({ drinkRestaurantId: drink!.id })
        .where(eq(rounds.id, round.id));
      const drinkRoundMenuItem = await seedRoundMenuItem(db, {
        roundId: round.id,
        menuItemId: drinkMenuItem!.id,
      });
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
            drinkRoundMenuItemId: drinkRoundMenuItem!.id,
            drinkNote: "Less ice",
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(201);
      const created = (await res.json()) as Submission;
      expect(created.drinkRoundMenuItemId).toBe(drinkRoundMenuItem!.id);
      expect(created.drinkNote).toBe("Less ice");
    });

    it("POST without employeeId returns 400", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foodRoundMenuItemId: foodRoundMenuItem.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.employeeIdRequired);
    });

    it("POST without foodRoundMenuItemId returns 400", async () => {
      const { round } = await seedOpenFoodRound();
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: employee!.id }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.foodRoundMenuItemIdRequired);
    });

    it("POST on a nonexistent round returns 404", async () => {
      const employee = await seedEmployee(db);

      const res = await app.request(
        "/api/rounds/999999/submissions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: employee!.id, foodRoundMenuItemId: 1 }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundNotFound);
    });

    it("POST with a nonexistent employeeId returns 404", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: 999999,
            foodRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.employeeNotFound);
    });

    it("POST rejected with 400 when the round is still draft", async () => {
      const food = await seedRestaurant(db, { type: "food" });
      const round = await seedRound(db, { foodRestaurantId: food!.id, status: "draft" });
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round!.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: employee!.id, foodRoundMenuItemId: 1 }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundNotOpenForSubmission);
    });

    it("POST rejected with 400 when the round is closed", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound({ status: "closed" });
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundNotOpenForSubmission);
    });

    it("POST rejected with 400 when the deadline has passed, even though status is still open", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound({
        deadline: new Date("2000-01-01T00:00:00.000Z"),
      });
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundDeadlinePassed);
    });

    it("POST rejected with 409 on a duplicate (roundId, employeeId) submission", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();
      const employee = await seedEmployee(db);
      await seedSubmission(db, {
        roundId: round.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: foodRoundMenuItem.id,
      });

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.submissionDuplicate);
    });

    it("POST rejected with 400 when drinkRoundMenuItemId is given but the round has no drinkRestaurantId", async () => {
      const { round, foodRoundMenuItem } = await seedOpenFoodRound();
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${round.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
            drinkRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.submissionNoDrinkRestaurant);
    });

    it("POST rejected with 404 when foodRoundMenuItemId belongs to a different round", async () => {
      const { foodRoundMenuItem } = await seedOpenFoodRound();
      const { round: otherRound } = await seedOpenFoodRound();
      const employee = await seedEmployee(db);

      const res = await app.request(
        `/api/rounds/${otherRound.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee!.id,
            foodRoundMenuItemId: foodRoundMenuItem.id,
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(ERROR_MESSAGES.roundMenuItemNotFound);
    });

    it("POST returns a structured 500 when the database is unreachable", async () => {
      const res = await app.request(
        "/api/rounds/1/submissions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: 1, foodRoundMenuItemId: 1 }),
        },
        unreachableEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    });

    describe("GET submissions", () => {
      type SubmissionRow = {
        id: number;
        employeeName: string;
        foodName: string | null;
        foodNote: string | null;
        drinkName: string | null;
        drinkNote: string | null;
      };

      it("GET returns resolved names, excluding price and raw FKs", async () => {
        const { round, foodRoundMenuItem } = await seedOpenFoodRound();
        const employee = await seedEmployee(db, { fullName: "An Nguyen" });
        await seedSubmission(db, {
          roundId: round.id,
          employeeId: employee!.id,
          foodRoundMenuItemId: foodRoundMenuItem.id,
          foodNote: "No cilantro",
        });

        const res = await app.request(`/api/rounds/${round.id}/submissions`, {}, testEnv);

        expect(res.status).toBe(200);
        const body = (await res.json()) as SubmissionRow[];
        expect(body).toHaveLength(1);
        expect(body[0]?.employeeName).toBe("An Nguyen");
        expect(body[0]?.foodName).toBe("Pho Bo");
        expect(body[0]?.foodNote).toBe("No cilantro");
        expect(body[0]?.drinkName).toBeNull();
        expect(body[0]?.drinkNote).toBeNull();
        expect(JSON.stringify(body)).not.toContain("price");
        expect(JSON.stringify(body)).not.toContain("RoundMenuItemId");
        expect(JSON.stringify(body)).not.toContain("employeeId");
      });

      it("GET includes drinkName and drinkNote when a drink was submitted", async () => {
        const { round, foodRoundMenuItem } = await seedOpenFoodRound();
        const drink = await seedRestaurant(db, { name: "Tra Da Corner", type: "drink" });
        const drinkMenuItem = await seedMenuItem(db, { restaurantId: drink!.id, name: "Tra Da" });
        await db
          .update(rounds)
          .set({ drinkRestaurantId: drink!.id })
          .where(eq(rounds.id, round.id));
        const drinkRoundMenuItem = await seedRoundMenuItem(db, {
          roundId: round.id,
          menuItemId: drinkMenuItem!.id,
        });
        const employee = await seedEmployee(db);
        await seedSubmission(db, {
          roundId: round.id,
          employeeId: employee!.id,
          foodRoundMenuItemId: foodRoundMenuItem.id,
          drinkRoundMenuItemId: drinkRoundMenuItem!.id,
          drinkNote: "Less ice",
        });

        const res = await app.request(`/api/rounds/${round.id}/submissions`, {}, testEnv);

        expect(res.status).toBe(200);
        const body = (await res.json()) as SubmissionRow[];
        expect(body[0]?.drinkName).toBe("Tra Da");
        expect(body[0]?.drinkNote).toBe("Less ice");
      });

      it("GET still includes a submission whose foodRoundMenuItemId was nulled, with foodName: null", async () => {
        const { round, foodRoundMenuItem } = await seedOpenFoodRound();
        const employee = await seedEmployee(db, { fullName: "An Nguyen" });
        const submission = await seedSubmission(db, {
          roundId: round.id,
          employeeId: employee!.id,
          foodRoundMenuItemId: foodRoundMenuItem.id,
        });
        // Simulates post-cascade state directly -- no route can produce this
        // deletion yet (that's tasks 030/031).
        await db
          .update(submissions)
          .set({ foodRoundMenuItemId: null })
          .where(eq(submissions.id, submission!.id));

        const res = await app.request(`/api/rounds/${round.id}/submissions`, {}, testEnv);

        expect(res.status).toBe(200);
        const body = (await res.json()) as SubmissionRow[];
        expect(body).toHaveLength(1);
        expect(body[0]?.employeeName).toBe("An Nguyen");
        expect(body[0]?.foodName).toBeNull();
      });

      it("GET returns [] for a round with no submissions", async () => {
        const { round } = await seedOpenFoodRound();

        const res = await app.request(`/api/rounds/${round.id}/submissions`, {}, testEnv);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
      });

      it("GET returns [] for a non-integer round id", async () => {
        const res = await app.request("/api/rounds/abc/submissions", {}, testEnv);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
      });

      it("GET returns a structured 500 when the database is unreachable", async () => {
        const res = await app.request("/api/rounds/1/submissions", {}, unreachableEnv);

        expect(res.status).toBe(500);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBeTruthy();
      });
    });
  });
});
