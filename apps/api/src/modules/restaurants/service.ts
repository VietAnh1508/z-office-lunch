import type { Db } from "../../lib/db-types";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";
import {
  clearRestaurantDrinkSizes,
  countRestaurantDrinkSizes,
  rebuildMenuItemSizes,
} from "../menu-item-sizes/repository";
import { exists as presetExists } from "../size-presets/repository";
import { generateMenuItemsFromImage } from "./menu-generation";
import * as repo from "./repository";
import type { RestaurantRow } from "./repository";

export type CreateRestaurantInput = {
  name: string;
  type: "food" | "drink";
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  sizePresetId: number | null | undefined;
};

export type UpdateRestaurantInput = {
  name: string;
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  sizePresetId: number | null | undefined;
};

const restaurantNotFound = () => fail(ERROR_MESSAGES.restaurantNotFound, 404);
const menuImageNotFound = () => fail(ERROR_MESSAGES.menuImageNotFound, 404);

function menuImageKey(restaurantId: number) {
  return `restaurants/${restaurantId}/${crypto.randomUUID()}`;
}

export async function listRestaurants(db: Db): Promise<RestaurantRow[]> {
  return repo.list(db);
}

export async function createRestaurant(
  db: Db,
  input: CreateRestaurantInput,
): Promise<Result<RestaurantRow, number>> {
  if (typeof input.sizePresetId === "number") {
    if (input.type === "food") {
      return fail(ERROR_MESSAGES.sizePresetFoodRestaurant, 400);
    }
    if (!(await presetExists(db, input.sizePresetId))) {
      return fail(ERROR_MESSAGES.sizePresetNotFound, 404);
    }
  }
  // A new restaurant has no menu items yet, so there's nothing to rebuild.
  const row = await repo.insert(db, {
    name: input.name,
    type: input.type,
    contactInfo: input.contactInfo,
    note: input.note,
    menuUrl: input.menuUrl,
    sizePresetId: input.sizePresetId ?? null,
  });
  return ok(row);
}

export async function updateRestaurant(
  db: Db,
  id: number,
  input: UpdateRestaurantInput,
): Promise<Result<RestaurantRow, number>> {
  const existing = await repo.findById(db, id);
  if (!existing) {
    return restaurantNotFound();
  }
  if (typeof input.sizePresetId === "number") {
    if (existing.type === "food") {
      return fail(ERROR_MESSAGES.sizePresetFoodRestaurant, 400);
    }
    if (!(await presetExists(db, input.sizePresetId))) {
      return fail(ERROR_MESSAGES.sizePresetNotFound, 404);
    }
  }

  // Omitted sizePresetId leaves it as-is (PATCH is otherwise a full replace);
  // only an explicit null clears it.
  const nextPresetId = input.sizePresetId;
  const row = await db.transaction(async (tx) => {
    const updated = await repo.update(tx, id, {
      name: input.name,
      contactInfo: input.contactInfo,
      note: input.note,
      menuUrl: input.menuUrl,
      ...(nextPresetId !== undefined ? { sizePresetId: nextPresetId } : {}),
    });
    if (nextPresetId !== undefined && nextPresetId !== existing.sizePresetId) {
      await clearRestaurantDrinkSizes(tx, id);
      await rebuildMenuItemSizes(tx, id, nextPresetId);
    }
    return updated;
  });
  return ok(row);
}

export async function getSizeResetImpact(
  db: Db,
  id: number,
  targetSizePresetId: number | null,
): Promise<Result<{ affectedSubmissions: number }, number>> {
  const existing = await repo.findById(db, id);
  if (!existing) {
    return restaurantNotFound();
  }
  const affectedSubmissions =
    targetSizePresetId === existing.sizePresetId ? 0 : await countRestaurantDrinkSizes(db, id);
  return ok({ affectedSubmissions });
}

export async function uploadMenuImage(
  db: Db,
  bucket: R2Bucket,
  id: number,
  file: File,
): Promise<Result<RestaurantRow, number>> {
  const existing = await repo.findById(db, id);
  if (!existing) {
    return restaurantNotFound();
  }

  const key = menuImageKey(id);
  await bucket.put(key, file, { httpMetadata: { contentType: file.type } });

  let row: RestaurantRow;
  try {
    row = await repo.setMenuImage(db, id, key);
  } catch (e) {
    await bucket.delete(key).catch(() => {});
    throw e;
  }

  if (existing.menuImage) {
    await bucket.delete(existing.menuImage).catch((e: unknown) => {
      console.error(
        JSON.stringify({ message: "failed to delete previous menu image", error: String(e) }),
      );
    });
  }

  return ok(row);
}

export async function getMenuImage(
  db: Db,
  bucket: R2Bucket,
  id: number,
): Promise<Result<{ object: R2ObjectBody }, number>> {
  const restaurant = await repo.findById(db, id);
  if (!restaurant) {
    return restaurantNotFound();
  }
  if (!restaurant.menuImage) {
    return menuImageNotFound();
  }

  const object = await bucket.get(restaurant.menuImage);
  if (!object) {
    console.error(
      JSON.stringify({
        message: "menu image key set on row but missing from storage",
        restaurantId: id,
      }),
    );
    return menuImageNotFound();
  }

  return ok({ object });
}

export async function deleteMenuImage(
  db: Db,
  bucket: R2Bucket,
  id: number,
): Promise<Result<RestaurantRow, number>> {
  const existing = await repo.findById(db, id);
  if (!existing) {
    return restaurantNotFound();
  }
  if (!existing.menuImage) {
    return menuImageNotFound();
  }

  const row = await repo.setMenuImage(db, id, null);

  await bucket.delete(existing.menuImage).catch((e: unknown) => {
    console.error(
      JSON.stringify({ message: "failed to delete menu image from storage", error: String(e) }),
    );
  });

  return ok(row);
}

export async function generateMenu(
  db: Db,
  bucket: R2Bucket,
  ai: Ai,
  id: number,
): Promise<Result<{ items: { name: string }[] }, number>> {
  const restaurant = await repo.findById(db, id);
  if (!restaurant) {
    return restaurantNotFound();
  }
  if (!restaurant.menuImage) {
    return menuImageNotFound();
  }

  const object = await bucket.get(restaurant.menuImage);
  if (!object) {
    console.error(
      JSON.stringify({
        message: "menu image key set on row but missing from storage",
        restaurantId: id,
      }),
    );
    return fail(ERROR_MESSAGES.internal, 500);
  }

  const bytes = new Uint8Array(await new Response(object.body as ReadableStream).arrayBuffer());
  const contentType = object.httpMetadata?.contentType ?? "image/jpeg";
  return generateMenuItemsFromImage(ai, bytes, contentType, id);
}
