import { eq } from "drizzle-orm";
import { restaurants, rounds } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const roundsRoute = new Hono<{ Bindings: Bindings }>();

roundsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const foodRestaurantId = Number(body.foodRestaurantId);
  const deadline =
    typeof body.deadline === "string" || typeof body.deadline === "number"
      ? new Date(body.deadline)
      : null;

  if (!label) {
    return c.json({ error: ERROR_MESSAGES.labelRequired }, 400);
  }
  if (!Number.isInteger(foodRestaurantId)) {
    return c.json({ error: ERROR_MESSAGES.foodRestaurantIdRequired }, 400);
  }
  if (!deadline || Number.isNaN(deadline.getTime())) {
    return c.json({ error: ERROR_MESSAGES.deadlineInvalid }, 400);
  }

  let drinkRestaurantId: number | null = null;
  if (
    body.drinkRestaurantId !== undefined &&
    body.drinkRestaurantId !== null &&
    body.drinkRestaurantId !== ""
  ) {
    const parsed = Number(body.drinkRestaurantId);
    if (!Number.isInteger(parsed)) {
      return c.json({ error: ERROR_MESSAGES.drinkRestaurantIdInvalid }, 400);
    }
    drinkRestaurantId = parsed;
  }

  const db = getDb(c);
  try {
    const [foodRestaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, foodRestaurantId));
    if (!foodRestaurant) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }
    if (foodRestaurant.type !== "food") {
      return c.json({ error: ERROR_MESSAGES.foodRestaurantTypeInvalid }, 400);
    }

    if (drinkRestaurantId !== null) {
      const [drinkRestaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, drinkRestaurantId));
      if (!drinkRestaurant) {
        return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
      }
      if (drinkRestaurant.type !== "drink") {
        return c.json({ error: ERROR_MESSAGES.drinkRestaurantTypeInvalid }, 400);
      }
    }

    const [row] = await db
      .insert(rounds)
      .values({
        label,
        foodRestaurantId,
        drinkRestaurantId,
        deadline,
        status: "draft",
      })
      .returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create round", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.get("/", async (c) => {
  const db = getDb(c);
  try {
    const rows = await db.select().from(rounds).orderBy(rounds.id);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list rounds", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [row] = await db.select().from(rounds).where(eq(rounds.id, id));
    if (!row) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to fetch round", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
