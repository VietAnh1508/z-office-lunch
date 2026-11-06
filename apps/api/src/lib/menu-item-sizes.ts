import { menuItemSizes, menuItems, restaurants, sizeOptions } from "db";
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "./get-db";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

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
