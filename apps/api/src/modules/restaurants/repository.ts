import { restaurants } from "db";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../../lib/db-types";

export type RestaurantRow = typeof restaurants.$inferSelect;

export type NewRestaurant = {
  name: string;
  type: "food" | "drink";
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  sizePresetId: number | null;
};

export type UpdateRestaurantFields = {
  name: string;
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  sizePresetId?: number | null;
};

export async function findById(db: DbOrTx, id: number): Promise<RestaurantRow | null> {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id));
  return row ?? null;
}

export async function list(db: DbOrTx): Promise<RestaurantRow[]> {
  return db.select().from(restaurants).orderBy(restaurants.id);
}

export async function insert(db: DbOrTx, values: NewRestaurant): Promise<RestaurantRow> {
  const [row] = await db.insert(restaurants).values(values).returning();
  return row!;
}

export async function update(
  db: DbOrTx,
  id: number,
  values: UpdateRestaurantFields,
): Promise<RestaurantRow> {
  const [row] = await db.update(restaurants).set(values).where(eq(restaurants.id, id)).returning();
  return row!;
}

export async function setMenuImage(
  db: DbOrTx,
  id: number,
  menuImage: string | null,
): Promise<RestaurantRow> {
  const [row] = await db
    .update(restaurants)
    .set({ menuImage })
    .where(eq(restaurants.id, id))
    .returning();
  return row!;
}
