import { Hono } from "hono";
import type { Bindings } from "../../bindings";
import { respond, withDb } from "../../lib/controller";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";
import {
  bulkCreateMenuItems,
  createMenuItem,
  listMenuItems,
  toggleMenuItem,
  updateMenuItemDetails,
  updateMenuItemSizes,
} from "./service";

// A non-integer id can never match a row, so it is a 404 rather than a 400.
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

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

function parseSizeOptionIds(raw: unknown): Result<{ ids: number[] }> {
  if (
    !Array.isArray(raw) ||
    !raw.every((v) => Number.isInteger(v)) ||
    new Set(raw).size !== raw.length
  ) {
    return fail(ERROR_MESSAGES.sizeOptionInvalid);
  }
  return ok({ ids: raw });
}

function parseBulkBody(
  body: Record<string, unknown>,
): Result<{ mode: "override" | "append"; items: { name: string; price: string | null }[] }> {
  const mode = body.mode;
  if (mode !== "override" && mode !== "append") {
    return fail(ERROR_MESSAGES.bulkModeInvalid);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail(ERROR_MESSAGES.bulkItemsRequired);
  }

  const items: { name: string; price: string | null }[] = [];
  for (const item of body.items) {
    const name = parseName(item?.name);
    if (!name) {
      return fail(ERROR_MESSAGES.nameRequired);
    }
    const parsedPrice = parsePrice(item?.price);
    if (!parsedPrice.ok) {
      return parsedPrice;
    }
    items.push({ name, price: parsedPrice.price });
  }
  return ok({ mode, items });
}

const restaurantNotFound = () => fail(ERROR_MESSAGES.restaurantNotFound, 404);
const itemNotFound = () => fail(ERROR_MESSAGES.menuItemNotFound, 404);

export const menuItemsRoute = new Hono<{ Bindings: Bindings }>();

menuItemsRoute.post("/:id/menu-items", async (c) => {
  const rawId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const name = parseName(body.name);
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return respond(c, fail(ERROR_MESSAGES.nameRequired));
  }
  if (!parsedPrice.ok) {
    return respond(c, parsedPrice);
  }
  const restaurantId = parseId(rawId);
  if (restaurantId === null) {
    return respond(c, restaurantNotFound());
  }

  return withDb(c, "create menu item", async (db) =>
    respond(c, await createMenuItem(db, restaurantId, { name, price: parsedPrice.price }), 201),
  );
});

menuItemsRoute.get("/:id/menu-items", async (c) => {
  const restaurantId = parseId(c.req.param("id"));
  if (restaurantId === null) {
    return c.json([]);
  }
  const activeOnly = c.req.query("active") === "true";

  return withDb(c, "list menu items", async (db) =>
    c.json(await listMenuItems(db, restaurantId, activeOnly)),
  );
});

menuItemsRoute.patch("/:id/menu-items/:itemId", async (c) => {
  const restaurantId = parseId(c.req.param("id"));
  const itemId = parseId(c.req.param("itemId"));
  if (restaurantId === null || itemId === null) {
    return respond(c, itemNotFound());
  }

  return withDb(c, "toggle menu item", async (db) =>
    respond(c, await toggleMenuItem(db, restaurantId, itemId)),
  );
});

menuItemsRoute.patch("/:id/menu-items/:itemId/details", async (c) => {
  const restaurantId = parseId(c.req.param("id"));
  const itemId = parseId(c.req.param("itemId"));
  if (restaurantId === null || itemId === null) {
    return respond(c, itemNotFound());
  }

  const body = await c.req.json().catch(() => ({}));
  const name = parseName(body.name);
  const parsedPrice = parsePrice(body.price);

  if (!name) {
    return respond(c, fail(ERROR_MESSAGES.nameRequired));
  }
  if (!parsedPrice.ok) {
    return respond(c, parsedPrice);
  }

  return withDb(c, "update menu item details", async (db) =>
    respond(
      c,
      await updateMenuItemDetails(db, restaurantId, itemId, { name, price: parsedPrice.price }),
    ),
  );
});

menuItemsRoute.put("/:id/menu-items/:itemId/sizes", async (c) => {
  const restaurantId = parseId(c.req.param("id"));
  const itemId = parseId(c.req.param("itemId"));
  if (restaurantId === null || itemId === null) {
    return respond(c, itemNotFound());
  }

  const body = await c.req.json().catch(() => ({}));
  const parsedIds = parseSizeOptionIds(body.sizeOptionIds);
  if (!parsedIds.ok) {
    return respond(c, parsedIds);
  }

  return withDb(c, "update menu item sizes", async (db) =>
    respond(c, await updateMenuItemSizes(db, restaurantId, itemId, parsedIds.ids)),
  );
});

menuItemsRoute.post("/:id/menu-items/bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseBulkBody(body);
  if (!parsed.ok) {
    return respond(c, parsed);
  }

  const restaurantId = parseId(c.req.param("id"));
  if (restaurantId === null) {
    return respond(c, restaurantNotFound());
  }

  return withDb(c, "bulk generate menu items", async (db) => {
    const result = await bulkCreateMenuItems(db, restaurantId, parsed.mode, parsed.items);
    return result.ok ? c.json(result.items, 201) : respond(c, result);
  });
});
