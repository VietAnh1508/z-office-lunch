import {
  menuItemSizes,
  menuItems,
  restaurants,
  roundMenuItems,
  rounds,
  sizeOptions,
  submissions,
} from "db";
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import type { getDb } from "./get-db";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

// Rebuilds every menu item's available sizes for a restaurant from scratch:
// wipes them, then (if there's a preset) ticks every option for every item,
// active and inactive. Callers run it inside a transaction.
// Inserts are guarded because Drizzle throws on an empty `.values([])`.
export async function rebuildMenuItemSizes(tx: Tx, restaurantId: number, presetId: number | null) {
  const items = await tx
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  const itemIds = items.map((i) => i.id);
  if (itemIds.length === 0) {
    return;
  }
  await tx.delete(menuItemSizes).where(inArray(menuItemSizes.menuItemId, itemIds));
  if (presetId === null) {
    return;
  }
  const options = await tx
    .select({ id: sizeOptions.id })
    .from(sizeOptions)
    .where(eq(sizeOptions.presetId, presetId));
  const rows = itemIds.flatMap((menuItemId) =>
    options.map((o) => ({ menuItemId, sizeOptionId: o.id })),
  );
  if (rows.length > 0) {
    await tx.insert(menuItemSizes).values(rows);
  }
}

// Ticks every option of a preset for the given items (new items start with all sizes).
export async function fillSizesForItems(tx: Tx, itemIds: number[], presetId: number | null) {
  if (presetId === null || itemIds.length === 0) {
    return;
  }
  const options = await tx
    .select({ id: sizeOptions.id })
    .from(sizeOptions)
    .where(eq(sizeOptions.presetId, presetId));
  const rows = itemIds.flatMap((menuItemId) =>
    options.map((o) => ({ menuItemId, sizeOptionId: o.id })),
  );
  if (rows.length > 0) {
    await tx.insert(menuItemSizes).values(rows);
  }
}

// Ticks one newly added preset option for every item of every restaurant using the preset.
export async function addOptionToRestaurants(tx: Tx, presetId: number, optionId: number) {
  const items = await tx
    .select({ id: menuItems.id })
    .from(menuItems)
    .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
    .where(eq(restaurants.sizePresetId, presetId));
  if (items.length > 0) {
    await tx
      .insert(menuItemSizes)
      .values(items.map((i) => ({ menuItemId: i.id, sizeOptionId: optionId })));
  }
}

// Submissions in rounds that can still change (open, or draft -- an open round
// can be reverted to draft keeping its submissions) with a picked drink size,
// whose drink item belongs to the restaurant (and optionally to one menu item).
function pickedSizeWhere(tx: DbOrTx, restaurantId: number, menuItemId?: number) {
  const rmiIds = tx
    .select({ id: roundMenuItems.id })
    .from(roundMenuItems)
    .innerJoin(menuItems, eq(menuItems.id, roundMenuItems.menuItemId))
    .innerJoin(rounds, eq(rounds.id, roundMenuItems.roundId))
    .where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        ne(rounds.status, "closed"),
        menuItemId !== undefined ? eq(menuItems.id, menuItemId) : undefined,
      ),
    );
  return and(
    isNotNull(submissions.drinkSizeOptionId),
    inArray(submissions.drinkRoundMenuItemId, rmiIds),
  );
}

// Clears picked sizes for a restaurant's drink items on non-closed rounds.
export async function clearRestaurantDrinkSizes(tx: Tx, restaurantId: number) {
  await tx
    .update(submissions)
    .set({ drinkSizeOptionId: null })
    .where(pickedSizeWhere(tx, restaurantId));
}

export async function countRestaurantDrinkSizes(tx: DbOrTx, restaurantId: number) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(submissions)
    .where(pickedSizeWhere(tx, restaurantId));
  return row?.count ?? 0;
}

// Clears picked sizes for one menu item that are no longer in `keptOptionIds`.
export async function clearRemovedItemSizes(
  tx: Tx,
  restaurantId: number,
  menuItemId: number,
  keptOptionIds: number[],
) {
  const where = pickedSizeWhere(tx, restaurantId, menuItemId);
  await tx
    .update(submissions)
    .set({ drinkSizeOptionId: null })
    .where(
      keptOptionIds.length > 0
        ? and(where, notInArray(submissions.drinkSizeOptionId, keptOptionIds))
        : where,
    );
}
