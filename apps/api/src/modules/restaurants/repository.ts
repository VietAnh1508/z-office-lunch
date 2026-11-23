import { restaurants } from "db";
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

export async function findById(_db: DbOrTx, _id: number): Promise<RestaurantRow | null> {
  throw new Error("not implemented");
}

export async function list(_db: DbOrTx): Promise<RestaurantRow[]> {
  throw new Error("not implemented");
}

export async function insert(_db: DbOrTx, _values: NewRestaurant): Promise<RestaurantRow> {
  throw new Error("not implemented");
}

export async function update(
  _db: DbOrTx,
  _id: number,
  _values: UpdateRestaurantFields,
): Promise<RestaurantRow> {
  throw new Error("not implemented");
}

export async function setMenuImage(
  _db: DbOrTx,
  _id: number,
  _menuImage: string | null,
): Promise<RestaurantRow> {
  throw new Error("not implemented");
}
