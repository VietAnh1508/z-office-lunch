import { restaurants } from "db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const restaurantsRoute = new Hono<{ Bindings: Bindings }>();

const MENU_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // phone photos of a physical menu
const MENU_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// HEIC/HEIF deliberately excluded — iPhones can produce it, but it won't render
// in an <img> outside Safari, so accepting it would store an unviewable file.

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function menuImageKey(restaurantId: number) {
  return `restaurants/${restaurantId}/${crypto.randomUUID()}`;
}

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
        note: optionalText(body.note),
        menuUrl: optionalText(body.menuUrl),
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

restaurantsRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return c.json({ error: ERROR_MESSAGES.nameRequired }, 400);
  }
  const contactInfo = optionalText(body.contactInfo);
  const note = optionalText(body.note);
  const menuUrl = optionalText(body.menuUrl);

  const db = getDb(c);
  try {
    const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }
    const [row] = await db
      .update(restaurants)
      .set({ name, contactInfo, note, menuUrl })
      .where(eq(restaurants.id, id))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to update restaurant", error: String(e) }));
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

restaurantsRoute.post(
  "/:id/menu-image",
  bodyLimit({
    maxSize: MENU_IMAGE_MAX_BYTES,
    onError: (c) => c.json({ error: ERROR_MESSAGES.menuImageTooLarge }, 413),
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }

    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = body.menuImage;
    if (!(file instanceof File)) {
      return c.json({ error: ERROR_MESSAGES.menuImageRequired }, 400);
    }
    if (!MENU_IMAGE_ALLOWED_TYPES.has(file.type)) {
      return c.json({ error: ERROR_MESSAGES.menuImageTypeInvalid }, 400);
    }

    const db = getDb(c);
    try {
      const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id));
      if (!existing) {
        return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
      }

      const key = menuImageKey(id);
      await c.env.MENU_IMAGES.put(key, file, { httpMetadata: { contentType: file.type } });

      let row;
      try {
        [row] = await db
          .update(restaurants)
          .set({ menuImage: key })
          .where(eq(restaurants.id, id))
          .returning();
      } catch (e) {
        await c.env.MENU_IMAGES.delete(key).catch(() => {});
        throw e;
      }

      if (existing.menuImage) {
        await c.env.MENU_IMAGES.delete(existing.menuImage).catch((e: unknown) => {
          console.error(
            JSON.stringify({ message: "failed to delete previous menu image", error: String(e) }),
          );
        });
      }

      return c.json(row);
    } catch (e) {
      console.error(JSON.stringify({ message: "failed to upload menu image", error: String(e) }));
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    } finally {
      await db.$client.end();
    }
  },
);

restaurantsRoute.get("/:id/menu-image", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!restaurant) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }
    if (!restaurant.menuImage) {
      return c.json({ error: ERROR_MESSAGES.menuImageNotFound }, 404);
    }

    const object = await c.env.MENU_IMAGES.get(restaurant.menuImage);
    if (!object) {
      console.error(
        JSON.stringify({ message: "menu image key set on row but missing from storage", restaurantId: id }),
      );
      return c.json({ error: ERROR_MESSAGES.menuImageNotFound }, 404);
    }

    c.header("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    c.header("Cache-Control", "no-cache");
    c.header("ETag", object.httpEtag);
    return c.body(object.body as ReadableStream);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to serve menu image", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

restaurantsRoute.delete("/:id/menu-image", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.restaurantNotFound }, 404);
    }
    if (!existing.menuImage) {
      return c.json({ error: ERROR_MESSAGES.menuImageNotFound }, 404);
    }

    const [row] = await db
      .update(restaurants)
      .set({ menuImage: null })
      .where(eq(restaurants.id, id))
      .returning();

    await c.env.MENU_IMAGES.delete(existing.menuImage).catch((e: unknown) => {
      console.error(
        JSON.stringify({ message: "failed to delete menu image from storage", error: String(e) }),
      );
    });

    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to delete menu image", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
