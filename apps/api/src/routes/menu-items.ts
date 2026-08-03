import { and, eq } from "drizzle-orm";
import { menuItems, restaurants } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const menuItemsRoute = new Hono<{ Bindings: Bindings }>();

menuItemsRoute.post("/:id/menu-items", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const type = body.type;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = typeof body.price === "string" && body.price.trim() !== "" ? body.price : null;

  if (type !== "food" && type !== "drink") {
    return c.json({ error: ERROR_MESSAGES.typeInvalid }, 400);
  }
  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }

  const db = getDb(c);
  try {
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId));
    if (!restaurant) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }

    const [row] = await db
      .insert(menuItems)
      .values({ restaurantId, type, name, price })
      .returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create menu item", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

menuItemsRoute.get("/:id/menu-items", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const activeOnly = c.req.query("active") === "true";

  const db = getDb(c);
  try {
    const conditions = activeOnly
      ? and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true))
      : eq(menuItems.restaurantId, restaurantId);

    const rows = await db.select().from(menuItems).where(conditions).orderBy(menuItems.id);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list menu items", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

menuItemsRoute.patch("/:id/menu-items/:itemId", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));

  const db = getDb(c);
  try {
    const [existing] = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
    }

    const [row] = await db
      .update(menuItems)
      .set({ active: !existing.active })
      .where(eq(menuItems.id, itemId))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to toggle menu item", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
