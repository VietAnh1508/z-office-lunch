import type { DbOrTx, Tx } from "../../lib/db-types";

// Scaffolding for the red commit: signatures only, behavior moves in the green commit.
const todo = (): never => {
  throw new Error("not implemented");
};

export async function rebuildMenuItemSizes(
  _tx: Tx,
  _restaurantId: number,
  _presetId: number | null,
): Promise<void> {
  return todo();
}

export async function fillSizesForItems(
  _tx: Tx,
  _itemIds: number[],
  _presetId: number | null,
): Promise<void> {
  return todo();
}

export async function addOptionToRestaurants(
  _tx: Tx,
  _presetId: number,
  _optionId: number,
): Promise<void> {
  return todo();
}

export async function clearRestaurantDrinkSizes(_tx: Tx, _restaurantId: number): Promise<void> {
  return todo();
}

export async function countRestaurantDrinkSizes(
  _tx: DbOrTx,
  _restaurantId: number,
): Promise<number> {
  return todo();
}

export async function clearRemovedItemSizes(
  _tx: Tx,
  _restaurantId: number,
  _menuItemId: number,
  _keptOptionIds: number[],
): Promise<void> {
  return todo();
}
