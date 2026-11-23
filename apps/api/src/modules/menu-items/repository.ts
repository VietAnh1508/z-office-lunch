import { and, asc, eq, inArray } from "drizzle-orm";
import { menuItemSizes, menuItems, restaurants, sizeOptions } from "db";
import type { DbOrTx, Tx } from "../../lib/db-types";

export type MenuItemRow = typeof menuItems.$inferSelect;
export type RestaurantRow = typeof restaurants.$inferSelect;

export async function findRestaurantById(
  db: DbOrTx,
  restaurantId: number,
): Promise<RestaurantRow | null> {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  return row ?? null;
}

export async function findByIdInRestaurant(
  db: DbOrTx,
  restaurantId: number,
  itemId: number,
): Promise<MenuItemRow | null> {
  const [row] = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  return row ?? null;
}

export async function findWithPreset(
  db: DbOrTx,
  restaurantId: number,
  itemId: number,
): Promise<{ id: number; presetId: number | null } | null> {
  const [row] = await db
    .select({ id: menuItems.id, presetId: restaurants.sizePresetId })
    .from(menuItems)
    .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  return row ?? null;
}

export async function listByRestaurant(
  db: DbOrTx,
  restaurantId: number,
  activeOnly: boolean,
): Promise<MenuItemRow[]> {
  const conditions = activeOnly
    ? and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true))
    : eq(menuItems.restaurantId, restaurantId);
  return db.select().from(menuItems).where(conditions).orderBy(menuItems.name);
}

export async function listSizesForItems(
  db: DbOrTx,
  itemIds: number[],
): Promise<{ menuItemId: number; sizeOptionId: number }[]> {
  if (itemIds.length === 0) {
    return [];
  }
  return db
    .select({
      menuItemId: menuItemSizes.menuItemId,
      sizeOptionId: menuItemSizes.sizeOptionId,
    })
    .from(menuItemSizes)
    .innerJoin(sizeOptions, eq(sizeOptions.id, menuItemSizes.sizeOptionId))
    .where(inArray(menuItemSizes.menuItemId, itemIds))
    .orderBy(asc(sizeOptions.sortOrder), asc(sizeOptions.id));
}

export async function listItemSizeIds(db: DbOrTx, itemId: number): Promise<number[]> {
  const rows = await listSizesForItems(db, [itemId]);
  return rows.map((r) => r.sizeOptionId);
}

export async function insertOne(
  tx: Tx,
  restaurantId: number,
  name: string,
  price: string | null,
): Promise<MenuItemRow> {
  const [created] = await tx.insert(menuItems).values({ restaurantId, name, price }).returning();
  return created!;
}

export async function insertMany(
  tx: Tx,
  restaurantId: number,
  items: { name: string; price: string | null }[],
): Promise<MenuItemRow[]> {
  if (items.length === 0) {
    return [];
  }
  return tx
    .insert(menuItems)
    .values(items.map((item) => ({ restaurantId, name: item.name, price: item.price })))
    .returning();
}

export async function deactivateActiveForRestaurant(tx: Tx, restaurantId: number): Promise<void> {
  await tx
    .update(menuItems)
    .set({ active: false })
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.active, true)));
}

export async function setActive(db: DbOrTx, itemId: number, active: boolean): Promise<MenuItemRow> {
  const [row] = await db
    .update(menuItems)
    .set({ active })
    .where(eq(menuItems.id, itemId))
    .returning();
  return row!;
}

export async function updateDetails(
  db: DbOrTx,
  itemId: number,
  name: string,
  price: string | null,
): Promise<MenuItemRow> {
  const [row] = await db
    .update(menuItems)
    .set({ name, price })
    .where(eq(menuItems.id, itemId))
    .returning();
  return row!;
}
