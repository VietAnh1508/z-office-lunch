import { restaurants } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const restaurantsRoute = new Hono<{ Bindings: Bindings }>();

restaurantsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  if (type !== "food" && type !== "drink") {
    return c.json({ error: ERROR_MESSAGES.typeInvalid }, 400);
  }

  const db = getDb(c);
  try {
    const [row] = await db
      .insert(restaurants)
      .values({
        name,
        type,
        contactInfo: typeof body.contactInfo === "string" ? body.contactInfo : null,
        menuSourceNote: typeof body.menuSourceNote === "string" ? body.menuSourceNote : null,
      })
      .returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create restaurant", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

restaurantsRoute.get("/", async (c) => {
  const db = getDb(c);
  try {
    const rows = await db.select().from(restaurants).orderBy(restaurants.id);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list restaurants", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
