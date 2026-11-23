import type { Db } from "../../lib/db-types";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";
import { clearRemovedItemSizes, fillSizesForItems } from "../menu-item-sizes/repository";
import { listPresetOptionIds } from "../size-presets/repository";
import * as repo from "./repository";
import type { MenuItemRow } from "./repository";

export type MenuItemWithSizes = MenuItemRow & { sizeOptionIds: number[] };

const restaurantNotFound = () => fail(ERROR_MESSAGES.restaurantNotFound, 404);
const itemNotFound = () => fail(ERROR_MESSAGES.menuItemNotFound, 404);

export async function listMenuItems(
  db: Db,
  restaurantId: number,
  activeOnly: boolean,
): Promise<MenuItemWithSizes[]> {
  const rows = await repo.listByRestaurant(db, restaurantId, activeOnly);
  const sizeRows = await repo.listSizesForItems(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    ...r,
    sizeOptionIds: sizeRows.filter((s) => s.menuItemId === r.id).map((s) => s.sizeOptionId),
  }));
}

export async function createMenuItem(
  db: Db,
  restaurantId: number,
  input: { name: string; price: string | null },
): Promise<Result<MenuItemRow, number>> {
  const restaurant = await repo.findRestaurantById(db, restaurantId);
  if (!restaurant) {
    return restaurantNotFound();
  }

  const row = await db.transaction(async (tx) => {
    const created = await repo.insertOne(tx, restaurantId, input.name, input.price);
    await fillSizesForItems(tx, [created.id], restaurant.sizePresetId);
    return created;
  });
  return ok(row);
}

export async function toggleMenuItem(
  db: Db,
  restaurantId: number,
  itemId: number,
): Promise<Result<MenuItemRow, number>> {
  const existing = await repo.findByIdInRestaurant(db, restaurantId, itemId);
  if (!existing) {
    return itemNotFound();
  }
  return ok(await repo.setActive(db, itemId, !existing.active));
}

export async function updateMenuItemDetails(
  db: Db,
  restaurantId: number,
  itemId: number,
  input: { name: string; price: string | null },
): Promise<Result<MenuItemRow, number>> {
  const existing = await repo.findByIdInRestaurant(db, restaurantId, itemId);
  if (!existing) {
    return itemNotFound();
  }
  return ok(await repo.updateDetails(db, itemId, input.name, input.price));
}

export async function updateMenuItemSizes(
  db: Db,
  restaurantId: number,
  itemId: number,
  requested: number[],
): Promise<Result<{ id: number; sizeOptionIds: number[] }, number>> {
  const item = await repo.findWithPreset(db, restaurantId, itemId);
  if (!item) {
    return itemNotFound();
  }

  const allowed = item.presetId === null ? [] : await listPresetOptionIds(db, item.presetId);
  if (requested.some((id) => !allowed.includes(id))) {
    return fail(ERROR_MESSAGES.sizeOptionInvalid, 400);
  }

  await db.transaction(async (tx) => {
    await repo.replaceItemSizes(tx, itemId, requested);
    await clearRemovedItemSizes(tx, restaurantId, itemId, requested);
  });

  const sizeOptionIds = await repo.listItemSizeIds(db, itemId);
  return ok({ id: itemId, sizeOptionIds });
}

export async function bulkCreateMenuItems(
  db: Db,
  restaurantId: number,
  mode: "override" | "append",
  items: { name: string; price: string | null }[],
): Promise<Result<{ items: MenuItemRow[] }, number>> {
  const restaurant = await repo.findRestaurantById(db, restaurantId);
  if (!restaurant) {
    return restaurantNotFound();
  }

  const inserted = await db.transaction(async (tx) => {
    if (mode === "override") {
      await repo.deactivateActiveForRestaurant(tx, restaurantId);
    }
    const created = await repo.insertMany(tx, restaurantId, items);
    await fillSizesForItems(
      tx,
      created.map((i) => i.id),
      restaurant.sizePresetId,
    );
    return created;
  });

  return ok({ items: inserted });
}
