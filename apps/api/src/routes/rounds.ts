import { and, eq, ne, sql } from "drizzle-orm";
import { menuItems, restaurants, roundMenuItems, rounds } from "db";
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

roundsRoute.get("/:id/public", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
    // A draft round returns the same 404 as a nonexistent one — no partial
    // signal that it exists before the admin opens it.
    if (!round || round.status === "draft") {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }

    const selectCuratedItems = (restaurantId: number) =>
      db
        .select({ id: roundMenuItems.id, name: menuItems.name })
        .from(roundMenuItems)
        .innerJoin(menuItems, eq(roundMenuItems.menuItemId, menuItems.id))
        .where(and(eq(roundMenuItems.roundId, round.id), eq(menuItems.restaurantId, restaurantId)))
        .orderBy(roundMenuItems.id);

    const foodItems = await selectCuratedItems(round.foodRestaurantId);
    const drinkItems =
      round.drinkRestaurantId !== null ? await selectCuratedItems(round.drinkRestaurantId) : null;

    return c.json({
      label: round.label,
      deadline: round.deadline,
      status: round.status,
      foodItems,
      ...(drinkItems !== null ? { drinkItems } : {}),
    });
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to fetch public round", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.post("/:id/menu-items", async (c) => {
  const roundId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const menuItemId = Number(body.menuItemId);

  if (!Number.isInteger(roundId)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }
  if (!Number.isInteger(menuItemId)) {
    return c.json({ error: ERROR_MESSAGES.menuItemIdRequired }, 400);
  }

  const db = getDb(c);
  try {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }

    const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId));
    if (!menuItem) {
      return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
    }
    if (
      menuItem.restaurantId !== round.foodRestaurantId &&
      menuItem.restaurantId !== round.drinkRestaurantId
    ) {
      return c.json({ error: ERROR_MESSAGES.roundMenuItemMismatch }, 400);
    }

    const [existing] = await db
      .select()
      .from(roundMenuItems)
      .where(and(eq(roundMenuItems.roundId, roundId), eq(roundMenuItems.menuItemId, menuItemId)));
    if (existing) {
      return c.json({ error: ERROR_MESSAGES.roundMenuItemAlreadyCurated }, 409);
    }

    const [row] = await db
      .insert(roundMenuItems)
      .values({ roundId, menuItemId })
      .returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to add round menu item", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.get("/:id/menu-items", async (c) => {
  const roundId = Number(c.req.param("id"));
  if (!Number.isInteger(roundId)) {
    return c.json([]);
  }

  const db = getDb(c);
  try {
    const rows = await db
      .select()
      .from(roundMenuItems)
      .where(eq(roundMenuItems.roundId, roundId))
      .orderBy(roundMenuItems.id);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list round menu items", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.delete("/:id/menu-items/:itemId", async (c) => {
  const roundId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));

  if (!Number.isInteger(roundId) || !Number.isInteger(itemId)) {
    return c.json({ error: ERROR_MESSAGES.roundMenuItemNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [existing] = await db
      .select()
      .from(roundMenuItems)
      .where(and(eq(roundMenuItems.id, itemId), eq(roundMenuItems.roundId, roundId)));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.roundMenuItemNotFound }, 404);
    }

    const [row] = await db
      .delete(roundMenuItems)
      .where(eq(roundMenuItems.id, itemId))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(
      JSON.stringify({ message: "failed to remove round menu item", error: String(e) }),
    );
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
    if (!round) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }
    if (round.status !== "draft") {
      return c.json({ error: ERROR_MESSAGES.roundDeleteNotDraft }, 400);
    }

    const [row] = await db.delete(rounds).where(eq(rounds.id, id)).returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to delete round", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.patch("/:id/status", async (c) => {
  const roundId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = body.status;

  if (!Number.isInteger(roundId)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }
  if (status !== "open" && status !== "closed") {
    return c.json({ error: ERROR_MESSAGES.roundStatusInvalid }, 400);
  }

  const db = getDb(c);
  try {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }

    if (status === "open") {
      const [foodItemCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(roundMenuItems)
        .innerJoin(menuItems, eq(roundMenuItems.menuItemId, menuItems.id))
        .where(
          and(
            eq(roundMenuItems.roundId, roundId),
            eq(menuItems.restaurantId, round.foodRestaurantId),
          ),
        );
      if (!foodItemCount || foodItemCount.count === 0) {
        return c.json({ error: ERROR_MESSAGES.roundOpenNoFoodItems }, 400);
      }

      const [otherOpenRound] = await db
        .select()
        .from(rounds)
        .where(and(eq(rounds.status, "open"), ne(rounds.id, roundId)));
      if (otherOpenRound) {
        return c.json({ error: ERROR_MESSAGES.roundOpenAnotherOpen }, 409);
      }
    } else {
      if (round.status !== "open") {
        return c.json({ error: ERROR_MESSAGES.roundCloseNotOpen }, 400);
      }
    }

    const [row] = await db
      .update(rounds)
      .set({ status })
      .where(eq(rounds.id, roundId))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(
      JSON.stringify({ message: "failed to update round status", error: String(e) }),
    );
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
