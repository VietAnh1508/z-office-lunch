import type { Db } from "../../lib/db-types";
import type { Result } from "../../lib/result";
import type { MenuItemRow } from "./repository";

export type MenuItemWithSizes = MenuItemRow & { sizeOptionIds: number[] };

const notImplemented = (): never => {
  throw new Error("not implemented");
};

export async function listMenuItems(
  _db: Db,
  _restaurantId: number,
  _activeOnly: boolean,
): Promise<MenuItemWithSizes[]> {
  return notImplemented();
}

export async function createMenuItem(
  _db: Db,
  _restaurantId: number,
  _input: { name: string; price: string | null },
): Promise<Result<MenuItemRow, number>> {
  return notImplemented();
}

export async function toggleMenuItem(
  _db: Db,
  _restaurantId: number,
  _itemId: number,
): Promise<Result<MenuItemRow, number>> {
  return notImplemented();
}

export async function updateMenuItemDetails(
  _db: Db,
  _restaurantId: number,
  _itemId: number,
  _input: { name: string; price: string | null },
): Promise<Result<MenuItemRow, number>> {
  return notImplemented();
}

export async function updateMenuItemSizes(
  _db: Db,
  _restaurantId: number,
  _itemId: number,
  _requested: number[],
): Promise<Result<{ id: number; sizeOptionIds: number[] }, number>> {
  return notImplemented();
}

export async function bulkCreateMenuItems(
  _db: Db,
  _restaurantId: number,
  _mode: "override" | "append",
  _items: { name: string; price: string | null }[],
): Promise<Result<{ items: MenuItemRow[] }, number>> {
  return notImplemented();
}
