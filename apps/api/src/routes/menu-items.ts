import { and, asc, eq, inArray } from "drizzle-orm";
import { menuItemSizes, menuItems, restaurants, sizeOptions } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";
import { clearRemovedItemSizes, fillSizesForItems } from "../lib/menu-item-sizes";
import { fail, ok, type Result } from "../lib/result";

function parseName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function parsePrice(raw: unknown): Result<{ price: string | null }> {
  if (raw === undefined || raw === null || raw === "") {
    return ok({ price: null });
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0
      ? ok({ price: String(raw) })
      : fail(ERROR_MESSAGES.priceInvalid);
  }
  if (typeof raw !== "string") {
    return fail(ERROR_MESSAGES.priceInvalid);
  }
  const trimmed = raw.trim();
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0
    ? ok({ price: trimmed })
    : fail(ERROR_MESSAGES.priceInvalid);
}

export const menuItemsRoute = new Hono<{ Bindings: Bindings }>();

menuItemsRoute.post("/:id/menu-items", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const name = parseName(body.name);
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  if (!parsedPrice.ok) {
    return c.json({ error: parsedPrice.error }, parsedPrice.status);
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

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(menuItems)
        .values({ restaurantId, name, price: parsedPrice.price })
        .returning();
      await fillSizesForItems(tx, [created!.id], restaurant.sizePresetId);
      return created;
    });
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

    const rows = await db.select().from(menuItems).where(conditions).orderBy(menuItems.name);
    const sizeRows =
      rows.length === 0
        ? []
        : await db
            .select({
              menuItemId: menuItemSizes.menuItemId,
              sizeOptionId: menuItemSizes.sizeOptionId,
            })
            .from(menuItemSizes)
            .innerJoin(sizeOptions, eq(sizeOptions.id, menuItemSizes.sizeOptionId))
            .where(
              inArray(
                menuItemSizes.menuItemId,
                rows.map((r) => r.id),
              ),
            )
            .orderBy(asc(sizeOptions.sortOrder), asc(sizeOptions.id));
    return c.json(
      rows.map((r) => ({
        ...r,
        sizeOptionIds: sizeRows.filter((s) => s.menuItemId === r.id).map((s) => s.sizeOptionId),
      })),
    );
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
  const name = parseName(body.name);
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  if (!parsedPrice.ok) {
    return c.json({ error: parsedPrice.error }, parsedPrice.status);
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
    console.error(
      JSON.stringify({ message: "failed to update menu item details", error: String(e) }),
    );
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

menuItemsRoute.put("/:id/menu-items/:itemId/sizes", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  if (!Number.isInteger(restaurantId) || !Number.isInteger(itemId)) {
    return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const raw = body.sizeOptionIds;
  if (
    !Array.isArray(raw) ||
    !raw.every((v) => Number.isInteger(v)) ||
    new Set(raw).size !== raw.length
  ) {
    return c.json({ error: ERROR_MESSAGES.sizeOptionInvalid }, 400);
  }
  const requested: number[] = raw;

  const db = getDb(c);
  try {
    const [item] = await db
      .select({ id: menuItems.id, presetId: restaurants.sizePresetId })
      .from(menuItems)
      .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
      .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
    if (!item) {
      return c.json({ error: ERROR_MESSAGES.menuItemNotFound }, 404);
    }

    const allowed =
      item.presetId === null
        ? []
        : (
            await db
              .select({ id: sizeOptions.id })
              .from(sizeOptions)
              .where(eq(sizeOptions.presetId, item.presetId))
          ).map((o) => o.id);
    if (requested.some((id) => !allowed.includes(id))) {
      return c.json({ error: ERROR_MESSAGES.sizeOptionInvalid }, 400);
    }

    await db.transaction(async (tx) => {
      await tx.delete(menuItemSizes).where(eq(menuItemSizes.menuItemId, itemId));
      await clearRemovedItemSizes(tx, restaurantId, itemId, requested);
      if (requested.length > 0) {
        await tx
          .insert(menuItemSizes)
          .values(requested.map((sizeOptionId) => ({ menuItemId: itemId, sizeOptionId })));
      }
    });

    const rows = await db
      .select({ id: menuItemSizes.sizeOptionId })
      .from(menuItemSizes)
      .innerJoin(sizeOptions, eq(sizeOptions.id, menuItemSizes.sizeOptionId))
      .where(eq(menuItemSizes.menuItemId, itemId))
      .orderBy(asc(sizeOptions.sortOrder), asc(sizeOptions.id));
    return c.json({ id: itemId, sizeOptionIds: rows.map((r) => r.id) });
  } catch (e) {
    console.error(
      JSON.stringify({ message: "failed to update menu item sizes", error: String(e) }),
    );
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
    const name = parseName(item?.name);
    if (!name) {
      return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
    }
    const parsedPrice = parsePrice(item?.price);
    if (!parsedPrice.ok) {
      return c.json({ error: parsedPrice.error }, parsedPrice.status);
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
      const created = await tx
        .insert(menuItems)
        .values(parsedItems.map((item) => ({ restaurantId, name: item.name, price: item.price })))
        .returning();
      await fillSizesForItems(
        tx,
        created.map((i) => i.id),
        restaurant.sizePresetId,
      );
      return created;
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
