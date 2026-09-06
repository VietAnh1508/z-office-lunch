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

const GENERATE_MENU_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
// Generous headroom over what a real menu needs (a ~90-item multi-column coffee menu used
// ~1400 completion tokens in manual testing) — a truncated response fails the shape check
// below and 500s, which is worse than the token cost of a wide margin.
const GENERATE_MENU_MAX_TOKENS = 4096;
const GENERATE_MENU_PROMPT =
  "List every distinct menu item in this image. For an item offered in multiple sizes " +
  '(e.g. S/M/L), emit one entry per size with the size folded into the name, e.g. "Ca Phe ' +
  "Den (S)\". Ignore decorative images and any text that isn't a menu item. Price should be " +
  "the plain printed number, with no currency symbol.\n\n" +
  'Respond with ONLY a single JSON object of the exact shape {"items":[{"name":string,"price":string}]} ' +
  "— no markdown, no code fences, no commentary before or after.";

// Cloudflare's `response_format: json_schema` JSON mode is NOT usable here: this model's
// input type has no `response_format` field at all (unlike e.g. Llama 3.3 70B's), and a real
// call confirmed it silently ignores the option when passed anyway — the response comes back
// as free-text prose, not schema-constrained JSON. So the shape is requested via prompt
// instruction only, and validated at runtime below; nothing unvalidated is ever returned.
function parseGeneratedItems(modelResponse: unknown): { name: string; price: string }[] | null {
  let parsed: unknown = modelResponse;
  if (typeof parsed === "string") {
    // Workers AI appears to auto-parse a valid JSON completion into an object already (observed
    // in manual testing), but strip markdown code fences and parse defensively in case a given
    // response comes back as a string instead.
    const stripped = parsed
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return null;
    }
  }
  if (parsed === null || typeof parsed !== "object") {
    return null;
  }
  const items = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return null;
  }
  const result: { name: string; price: string }[] = [];
  for (const item of items) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).name !== "string" ||
      typeof (item as Record<string, unknown>).price !== "string"
    ) {
      return null;
    }
    result.push({ name: (item as { name: string }).name, price: (item as { price: string }).price });
  }
  return result;
}

// R2 doesn't expose a chunked base64 encoder, and spreading a whole (up to 10MB) image into
// String.fromCharCode(...bytes) risks blowing the call-stack argument limit — encode in chunks.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
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

restaurantsRoute.post("/:id/generate-menu", async (c) => {
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
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    }

    const bytes = new Uint8Array(await new Response(object.body as ReadableStream).arrayBuffer());
    const contentType = object.httpMetadata?.contentType ?? "image/jpeg";
    const imageDataUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;

    let modelResponse: unknown;
    try {
      const result = await c.env.AI.run(GENERATE_MENU_MODEL, {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GENERATE_MENU_PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: GENERATE_MENU_MAX_TOKENS,
      });
      modelResponse = (result as { response?: unknown }).response;
    } catch (e) {
      console.error(JSON.stringify({ message: "menu generation model call failed", error: String(e) }));
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    }

    const items = parseGeneratedItems(modelResponse);
    if (!items) {
      console.error(
        JSON.stringify({ message: "menu generation model returned an unexpected shape", restaurantId: id }),
      );
      return c.json({ error: ERROR_MESSAGES.internal }, 500);
    }

    return c.json({ items });
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to generate menu", error: String(e) }));
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
