import type { Db } from "../../lib/db-types";
import type { Result } from "../../lib/result";
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

export async function listRestaurants(_db: Db): Promise<RestaurantRow[]> {
  throw new Error("not implemented");
}

export async function createRestaurant(
  _db: Db,
  _input: CreateRestaurantInput,
): Promise<Result<RestaurantRow, number>> {
  throw new Error("not implemented");
}

export async function updateRestaurant(
  _db: Db,
  _id: number,
  _input: UpdateRestaurantInput,
): Promise<Result<RestaurantRow, number>> {
  throw new Error("not implemented");
}

export async function getSizeResetImpact(
  _db: Db,
  _id: number,
  _targetSizePresetId: number | null,
): Promise<Result<{ affectedSubmissions: number }, number>> {
  throw new Error("not implemented");
}

export async function uploadMenuImage(
  _db: Db,
  _bucket: R2Bucket,
  _id: number,
  _file: File,
): Promise<Result<RestaurantRow, number>> {
  throw new Error("not implemented");
}

export async function getMenuImage(
  _db: Db,
  _bucket: R2Bucket,
  _id: number,
): Promise<Result<{ object: R2ObjectBody }, number>> {
  throw new Error("not implemented");
}

export async function deleteMenuImage(
  _db: Db,
  _bucket: R2Bucket,
  _id: number,
): Promise<Result<RestaurantRow, number>> {
  throw new Error("not implemented");
}

export async function generateMenu(
  _db: Db,
  _bucket: R2Bucket,
  _ai: Ai,
  _id: number,
): Promise<Result<{ items: { name: string }[] }, number>> {
  throw new Error("not implemented");
}
