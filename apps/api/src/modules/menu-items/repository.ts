import type { menuItems, restaurants } from "db";
import type { DbOrTx, Tx } from "../../lib/db-types";

export type MenuItemRow = typeof menuItems.$inferSelect;
export type RestaurantRow = typeof restaurants.$inferSelect;

const notImplemented = (): never => {
  throw new Error("not implemented");
};

export async function findRestaurantById(
  _db: DbOrTx,
  _restaurantId: number,
): Promise<RestaurantRow | null> {
  return notImplemented();
}

export async function findByIdInRestaurant(
  _db: DbOrTx,
  _restaurantId: number,
  _itemId: number,
): Promise<MenuItemRow | null> {
  return notImplemented();
}

export async function findWithPreset(
  _db: DbOrTx,
  _restaurantId: number,
  _itemId: number,
): Promise<{ id: number; presetId: number | null } | null> {
  return notImplemented();
}

export async function listByRestaurant(
  _db: DbOrTx,
  _restaurantId: number,
  _activeOnly: boolean,
): Promise<MenuItemRow[]> {
  return notImplemented();
}

export async function listSizesForItems(
  _db: DbOrTx,
  _itemIds: number[],
): Promise<{ menuItemId: number; sizeOptionId: number }[]> {
  return notImplemented();
}

export async function listItemSizeIds(_db: DbOrTx, _itemId: number): Promise<number[]> {
  return notImplemented();
}

export async function listPresetOptionIds(_db: DbOrTx, _presetId: number): Promise<number[]> {
  return notImplemented();
}

export async function insertOne(
  _tx: Tx,
  _restaurantId: number,
  _name: string,
  _price: string | null,
): Promise<MenuItemRow> {
  return notImplemented();
}

export async function insertMany(
  _tx: Tx,
  _restaurantId: number,
  _items: { name: string; price: string | null }[],
): Promise<MenuItemRow[]> {
  return notImplemented();
}

export async function deactivateActiveForRestaurant(_tx: Tx, _restaurantId: number): Promise<void> {
  return notImplemented();
}

export async function setActive(
  _db: DbOrTx,
  _itemId: number,
  _active: boolean,
): Promise<MenuItemRow> {
  return notImplemented();
}

export async function updateDetails(
  _db: DbOrTx,
  _itemId: number,
  _name: string,
  _price: string | null,
): Promise<MenuItemRow> {
  return notImplemented();
}

export async function replaceItemSizes(
  _tx: Tx,
  _itemId: number,
  _sizeOptionIds: number[],
): Promise<void> {
  return notImplemented();
}
