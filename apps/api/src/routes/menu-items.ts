import { and, eq } from "drizzle-orm";
import { menuItems, restaurants } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

function parsePrice(raw: unknown): { ok: true; price: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, price: null };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? { ok: true, price: String(raw) } : { ok: false };
  }
  if (typeof raw !== "string") {
    return { ok: false };
  }
  const trimmed = raw.trim();
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? { ok: true, price: trimmed } : { ok: false };
}

export const menuItemsRoute = new Hono<{ Bindings: Bindings }>();

menuItemsRoute.post("/:id/menu-items", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  if (!parsedPrice.ok) {
    return c.json({ error: ERROR_MESSAGES.priceInvalid }, 400);
  }
  if (!Number.isInteger(restaurantId)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
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
      .values({ restaurantId, name, price: parsedPrice.price })
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

  if (!Number.isInteger(restaurantId)) {
    return c.json([]);
  }

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

  if (!Number.isInteger(restaurantId) || !Number.isInteger(itemId)) {
    return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
  }

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

menuItemsRoute.patch("/:id/menu-items/:itemId/details", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  if (!Number.isInteger(restaurantId) || !Number.isInteger(itemId)) {
    return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  if (!parsedPrice.ok) {
    return c.json({ error: ERROR_MESSAGES.priceInvalid }, 400);
  }

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
      .set({ name, price: parsedPrice.price })
      .where(eq(menuItems.id, itemId))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to update menu item details", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

menuItemsRoute.post("/:id/menu-items/bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const mode = body.mode;

  if (mode !== "override" && mode !== "append") {
    return c.json({ error: ERROR_MESSAGES.bulkModeInvalid }, 400);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: ERROR_MESSAGES.bulkItemsRequired }, 400);
  }

  const parsedItems: { name: string; price: string | null }[] = [];
  for (const item of body.items) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) {
      return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
    }
    const parsedPrice = parsePrice(item?.price);
    if (!parsedPrice.ok) {
      return c.json({ error: ERROR_MESSAGES.priceInvalid }, 400);
    }
    parsedItems.push({ name, price: parsedPrice.price });
  }

  const restaurantId = Number(c.req.param("id"));
  if (!Number.isInteger(restaurantId)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
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

    const inserted = await db.transaction(async (tx) => {
      if (mode === "override") {
        await tx
          .update(menuItems)
          .set({ active: false })
          .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true)));
      }
      return tx
        .insert(menuItems)
        .values(parsedItems.map((item) => ({ restaurantId, name: item.name, price: item.price })))
        .returning();
    });

    return c.json(inserted, 201);
  } catch (e) {
    console.error(
      JSON.stringify({ message: "failed to bulk generate menu items", error: String(e) }),
    );
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
