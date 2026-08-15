import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { employees, menuItems, restaurants, roundMenuItems, rounds, submissions } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const roundsRoute = new Hono<{ Bindings: Bindings }>();

const foodRestaurantAlias = alias(restaurants, "food_restaurant");
const drinkRestaurantAlias = alias(restaurants, "drink_restaurant");
const foodRoundMenuItemAlias = alias(roundMenuItems, "food_round_menu_item");
const drinkRoundMenuItemAlias = alias(roundMenuItems, "drink_round_menu_item");
const foodMenuItemAlias = alias(menuItems, "food_menu_item");
const drinkMenuItemAlias = alias(menuItems, "drink_menu_item");

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Auto-curates a restaurant's currently active menu items into a round. Fires
// at round create and at a restaurant change on a draft round's PATCH -- not
// when a restaurant's menu items change later, that stays manual. A
// restaurant with zero active items is a no-op, not an error: `.insert()`
// throws on an empty `.values([])`, so the empty case is guarded explicitly.
async function insertActiveMenuItems(tx: Tx, roundId: number, restaurantId: number) {
  const activeItems = await tx
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true)));
  if (activeItems.length === 0) {
    return;
  }
  await tx
    .insert(roundMenuItems)
    .values(activeItems.map((item) => ({ roundId, menuItemId: item.id })))
    .onConflictDoNothing();
}

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

    const [row] = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(rounds)
        .values({
          label,
          foodRestaurantId,
          drinkRestaurantId,
          deadline,
          status: "draft",
        })
        .returning();

      await insertActiveMenuItems(tx, inserted!.id, foodRestaurantId);
      if (drinkRestaurantId !== null) {
        await insertActiveMenuItems(tx, inserted!.id, drinkRestaurantId);
      }

      return [inserted];
    });
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

roundsRoute.get("/public", async (c) => {
  const db = getDb(c);
  try {
    const rows = await db
      .select({
        id: rounds.id,
        label: rounds.label,
        status: rounds.status,
        deadline: rounds.deadline,
        foodRestaurantName: foodRestaurantAlias.name,
        drinkRestaurantName: drinkRestaurantAlias.name,
      })
      .from(rounds)
      .innerJoin(foodRestaurantAlias, eq(rounds.foodRestaurantId, foodRestaurantAlias.id))
      .leftJoin(drinkRestaurantAlias, eq(rounds.drinkRestaurantId, drinkRestaurantAlias.id))
      .where(inArray(rounds.status, ["open", "closed"]))
      .orderBy(rounds.deadline);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list public rounds", error: String(e) }));
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
    if (round.status !== "draft") {
      return c.json({ error: ERROR_MESSAGES.roundEditNotDraft }, 400);
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

    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (round!.status !== "draft") {
      return c.json({ error: ERROR_MESSAGES.roundEditNotDraft }, 400);
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

roundsRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const foodRestaurantId = Number(body.foodRestaurantId);
  const deadline =
    typeof body.deadline === "string" || typeof body.deadline === "number"
      ? new Date(body.deadline)
      : null;

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
    const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
    if (!round) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }
    if (round.status !== "draft") {
      return c.json({ error: ERROR_MESSAGES.roundEditNotDraft }, 400);
    }

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

    const foodChanged = foodRestaurantId !== round.foodRestaurantId;
    const drinkChanged = drinkRestaurantId !== round.drinkRestaurantId;

    const [row] = await db.transaction(async (tx) => {
      const purgeStaleItems = (restaurantId: number) =>
        tx.delete(roundMenuItems).where(
          and(
            eq(roundMenuItems.roundId, id),
            inArray(
              roundMenuItems.menuItemId,
              tx.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.restaurantId, restaurantId)),
            ),
          ),
        );

      if (foodChanged) {
        await purgeStaleItems(round.foodRestaurantId);
      }
      if (drinkChanged && round.drinkRestaurantId !== null) {
        await purgeStaleItems(round.drinkRestaurantId);
      }

      // A restaurant change re-runs auto-curation from scratch for that side,
      // including re-inserting any item the admin had previously opted out of
      // curating. So A->B->A (two sequential changes back to the original
      // restaurant) resurrects an opt-out made against A before the first
      // change -- intended per this task's scope, not a regression.
      if (foodChanged) {
        await insertActiveMenuItems(tx, id, foodRestaurantId);
      }
      // Purge and insert are gated independently on the drink side: purge
      // needs a previous drink restaurant to clean up after (`round.drinkRestaurantId
      // !== null` above), while insert needs a new one to curate into
      // (`drinkRestaurantId !== null` here) -- a value->null clear has
      // nothing to insert, a null->value set has nothing to purge.
      if (drinkChanged && drinkRestaurantId !== null) {
        await insertActiveMenuItems(tx, id, drinkRestaurantId);
      }

      return tx
        .update(rounds)
        .set({ foodRestaurantId, drinkRestaurantId, deadline })
        .where(eq(rounds.id, id))
        .returning();
    });

    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to update round", error: String(e) }));
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

roundsRoute.post("/:id/submissions", async (c) => {
  const roundId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  const foodRoundMenuItemId = Number(body.foodRoundMenuItemId);
  const foodNote = typeof body.foodNote === "string" && body.foodNote.trim() ? body.foodNote.trim() : null;

  if (!Number.isInteger(roundId)) {
    return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
  }
  if (!Number.isInteger(employeeId)) {
    return c.json({ error: ERROR_MESSAGES.employeeIdRequired }, 400);
  }
  if (!Number.isInteger(foodRoundMenuItemId)) {
    return c.json({ error: ERROR_MESSAGES.foodRoundMenuItemIdRequired }, 400);
  }

  let drinkRoundMenuItemId: number | null = null;
  if (
    body.drinkRoundMenuItemId !== undefined &&
    body.drinkRoundMenuItemId !== null &&
    body.drinkRoundMenuItemId !== ""
  ) {
    const parsed = Number(body.drinkRoundMenuItemId);
    if (!Number.isInteger(parsed)) {
      return c.json({ error: ERROR_MESSAGES.drinkRoundMenuItemIdInvalid }, 400);
    }
    drinkRoundMenuItemId = parsed;
  }
  const drinkNote =
    drinkRoundMenuItemId !== null && typeof body.drinkNote === "string" && body.drinkNote.trim()
      ? body.drinkNote.trim()
      : null;

  const db = getDb(c);
  try {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (!round) {
      return c.json({ error: ERROR_MESSAGES.roundNotFound }, 404);
    }
    if (round.status !== "open") {
      return c.json({ error: ERROR_MESSAGES.roundNotOpenForSubmission }, 400);
    }
    // Checked independently of `status` — closing a round is a separate admin
    // action from the deadline, so a round left open past its deadline must
    // still reject submissions.
    if (new Date() > round.deadline) {
      return c.json({ error: ERROR_MESSAGES.roundDeadlinePassed }, 400);
    }

    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) {
      return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
    }

    const selectRoundMenuItem = (id: number) =>
      db
        .select({ id: roundMenuItems.id, restaurantId: menuItems.restaurantId })
        .from(roundMenuItems)
        .innerJoin(menuItems, eq(roundMenuItems.menuItemId, menuItems.id))
        .where(and(eq(roundMenuItems.id, id), eq(roundMenuItems.roundId, roundId)));

    const [foodItem] = await selectRoundMenuItem(foodRoundMenuItemId);
    if (!foodItem) {
      return c.json({ error: ERROR_MESSAGES.roundMenuItemNotFound }, 404);
    }
    if (foodItem.restaurantId !== round.foodRestaurantId) {
      return c.json({ error: ERROR_MESSAGES.foodRoundMenuItemInvalid }, 400);
    }

    if (drinkRoundMenuItemId !== null) {
      if (round.drinkRestaurantId === null) {
        return c.json({ error: ERROR_MESSAGES.submissionNoDrinkRestaurant }, 400);
      }
      const [drinkItem] = await selectRoundMenuItem(drinkRoundMenuItemId);
      if (!drinkItem) {
        return c.json({ error: ERROR_MESSAGES.roundMenuItemNotFound }, 404);
      }
      if (drinkItem.restaurantId !== round.drinkRestaurantId) {
        return c.json({ error: ERROR_MESSAGES.drinkRoundMenuItemInvalid }, 400);
      }
    }

    const [existing] = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.roundId, roundId), eq(submissions.employeeId, employeeId)));
    if (existing) {
      return c.json({ error: ERROR_MESSAGES.submissionDuplicate }, 409);
    }

    const [row] = await db
      .insert(submissions)
      .values({
        roundId,
        employeeId,
        foodRoundMenuItemId,
        foodNote,
        drinkRoundMenuItemId,
        drinkNote,
      })
      .returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create submission", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

roundsRoute.get("/:id/submissions", async (c) => {
  const roundId = Number(c.req.param("id"));
  if (!Number.isInteger(roundId)) {
    return c.json([]);
  }

  const db = getDb(c);
  try {
    // Explicit column selection (never `price`, never a raw *RoundMenuItemId
    // FK) so the client gets already-resolved names and never has to
    // re-join or remember to drop a field itself.
    const rows = await db
      .select({
        id: submissions.id,
        employeeName: employees.fullName,
        foodName: foodMenuItemAlias.name,
        foodNote: submissions.foodNote,
        drinkName: drinkMenuItemAlias.name,
        drinkNote: submissions.drinkNote,
      })
      .from(submissions)
      .innerJoin(employees, eq(submissions.employeeId, employees.id))
      .innerJoin(
        foodRoundMenuItemAlias,
        eq(submissions.foodRoundMenuItemId, foodRoundMenuItemAlias.id),
      )
      .innerJoin(foodMenuItemAlias, eq(foodRoundMenuItemAlias.menuItemId, foodMenuItemAlias.id))
      .leftJoin(
        drinkRoundMenuItemAlias,
        eq(submissions.drinkRoundMenuItemId, drinkRoundMenuItemAlias.id),
      )
      .leftJoin(drinkMenuItemAlias, eq(drinkRoundMenuItemAlias.menuItemId, drinkMenuItemAlias.id))
      .where(eq(submissions.roundId, roundId))
      .orderBy(submissions.id);
    return c.json(rows);
  } catch (e) {
    console.error(
      JSON.stringify({ message: "failed to list round submissions", error: String(e) }),
    );
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
