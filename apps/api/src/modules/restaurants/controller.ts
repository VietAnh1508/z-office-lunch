import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Bindings } from "../../bindings";
import { respond, withDb } from "../../lib/controller";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail } from "../../lib/result";
import { parseId, trimmed } from "../../lib/utils";
import {
  createRestaurant,
  deleteMenuImage,
  generateMenu,
  getMenuImage,
  getSizeResetImpact,
  listRestaurants,
  updateRestaurant,
  uploadMenuImage,
} from "./service";

const MENU_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // phone photos of a physical menu
const MENU_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// HEIC/HEIF deliberately excluded — iPhones can produce it, but it won't render
// in an <img> outside Safari, so accepting it would store an unviewable file.

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// `undefined` = not sent, `null` = clear, number = assign.
function parseSizePresetId(raw: unknown): number | null | undefined | "invalid" {
  if (raw === undefined || raw === null) {
    return raw;
  }
  return Number.isInteger(raw) ? (raw as number) : "invalid";
}

function parseSizePresetQuery(raw: string | undefined): number | null | "invalid" {
  if (raw === "null") {
    return null;
  }
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : "invalid";
}

const restaurantNotFound = () => fail(ERROR_MESSAGES.restaurantNotFound, 404);

export const restaurantsRoute = new Hono<{ Bindings: Bindings }>();

restaurantsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = trimmed(body.name);
  const type = body.type;
  if (!name) {
    return respond(c, fail(ERROR_MESSAGES.nameRequired));
  }
  if (type !== "food" && type !== "drink") {
    return respond(c, fail(ERROR_MESSAGES.typeInvalid));
  }
  const sizePresetId = parseSizePresetId(body.sizePresetId);
  if (sizePresetId === "invalid") {
    return respond(c, fail(ERROR_MESSAGES.sizePresetIdInvalid));
  }

  return withDb(c, "create restaurant", async (db) =>
    respond(
      c,
      await createRestaurant(db, {
        name,
        type,
        contactInfo: typeof body.contactInfo === "string" ? body.contactInfo : null,
        note: optionalText(body.note),
        menuUrl: optionalText(body.menuUrl),
        sizePresetId,
      }),
      201,
    ),
  );
});

restaurantsRoute.patch("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return respond(c, restaurantNotFound());
  }
  const body = await c.req.json().catch(() => ({}));
  const name = trimmed(body.name);
  if (!name) {
    return respond(c, fail(ERROR_MESSAGES.nameRequired));
  }
  const contactInfo = optionalText(body.contactInfo);
  const note = optionalText(body.note);
  const menuUrl = optionalText(body.menuUrl);
  const sizePresetId = parseSizePresetId(body.sizePresetId);
  if (sizePresetId === "invalid") {
    return respond(c, fail(ERROR_MESSAGES.sizePresetIdInvalid));
  }

  return withDb(c, "update restaurant", async (db) =>
    respond(
      c,
      await updateRestaurant(db, id, {
        name,
        contactInfo,
        note,
        menuUrl,
        sizePresetId,
      }),
    ),
  );
});

// Read-only preview for the UI: how many picked drink sizes would a preset
// change clear. `sizePresetId` is a preset id or the literal "null".
restaurantsRoute.get("/:id/size-reset-impact", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return respond(c, restaurantNotFound());
  }
  const target = parseSizePresetQuery(c.req.query("sizePresetId"));
  if (target === "invalid") {
    return respond(c, fail(ERROR_MESSAGES.sizePresetIdInvalid));
  }

  return withDb(c, "compute size reset impact", async (db) =>
    respond(c, await getSizeResetImpact(db, id, target)),
  );
});

restaurantsRoute.get("/", async (c) => {
  return withDb(c, "list restaurants", async (db) => c.json(await listRestaurants(db)));
});

restaurantsRoute.post(
  "/:id/menu-image",
  bodyLimit({
    maxSize: MENU_IMAGE_MAX_BYTES,
    onError: (c) => c.json({ error: ERROR_MESSAGES.menuImageTooLarge }, 413),
  }),
  async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) {
      return respond(c, restaurantNotFound());
    }

    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = body.menuImage;
    if (!(file instanceof File)) {
      return respond(c, fail(ERROR_MESSAGES.menuImageRequired));
    }
    if (!MENU_IMAGE_ALLOWED_TYPES.has(file.type)) {
      return respond(c, fail(ERROR_MESSAGES.menuImageTypeInvalid));
    }

    return withDb(c, "upload menu image", async (db) =>
      respond(c, await uploadMenuImage(db, c.env.MENU_IMAGES, id, file)),
    );
  },
);

restaurantsRoute.get("/:id/menu-image", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return respond(c, restaurantNotFound());
  }

  return withDb(c, "serve menu image", async (db) => {
    const result = await getMenuImage(db, c.env.MENU_IMAGES, id);
    if (!result.ok) {
      return respond(c, result);
    }
    const { object } = result;
    c.header("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    c.header("Cache-Control", "no-cache");
    c.header("ETag", object.httpEtag);
    return c.body(object.body as ReadableStream);
  });
});

restaurantsRoute.post("/:id/generate-menu", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return respond(c, restaurantNotFound());
  }

  return withDb(c, "generate menu", async (db) =>
    respond(c, await generateMenu(db, c.env.MENU_IMAGES, c.env.AI, id)),
  );
});

restaurantsRoute.delete("/:id/menu-image", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return respond(c, restaurantNotFound());
  }

  return withDb(c, "delete menu image", async (db) =>
    respond(c, await deleteMenuImage(db, c.env.MENU_IMAGES, id)),
  );
});
