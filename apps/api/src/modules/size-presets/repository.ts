import { restaurants, sizeOptions, sizePresets } from "db";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "../../lib/db-types";

export type PresetOption = { id: number; label: string; sortOrder: number };
export type Preset = { id: number; name: string; options: PresetOption[] };

export async function listWithOptions(db: DbOrTx): Promise<Preset[]> {
  const presets = await db.select().from(sizePresets).orderBy(asc(sizePresets.name));
  const options = await db
    .select()
    .from(sizeOptions)
    .orderBy(asc(sizeOptions.sortOrder), asc(sizeOptions.id));
  return presets.map((p) => ({
    id: p.id,
    name: p.name,
    options: options
      .filter((o) => o.presetId === p.id)
      .map((o) => ({ id: o.id, label: o.label, sortOrder: o.sortOrder })),
  }));
}

export async function findWithOptions(db: DbOrTx, id: number): Promise<Preset | null> {
  const [preset] = await db.select().from(sizePresets).where(eq(sizePresets.id, id));
  if (!preset) {
    return null;
  }
  const options = await db
    .select({ id: sizeOptions.id, label: sizeOptions.label, sortOrder: sizeOptions.sortOrder })
    .from(sizeOptions)
    .where(eq(sizeOptions.presetId, id))
    .orderBy(asc(sizeOptions.sortOrder));
  return { id: preset.id, name: preset.name, options };
}

// Id of a preset named `name`, ignoring `exceptId` (for rename checks).
export async function findIdByName(
  db: DbOrTx,
  name: string,
  exceptId?: number,
): Promise<number | undefined> {
  const [row] = await db
    .select({ id: sizePresets.id })
    .from(sizePresets)
    .where(
      and(
        eq(sizePresets.name, name),
        exceptId === undefined ? undefined : ne(sizePresets.id, exceptId),
      ),
    );
  return row?.id;
}

export async function isUsedByRestaurant(db: DbOrTx, id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.sizePresetId, id))
    .limit(1);
  return row !== undefined;
}

export async function insertWithOptions(tx: Tx, name: string, labels: string[]): Promise<number> {
  const [preset] = await tx.insert(sizePresets).values({ name }).returning();
  await tx
    .insert(sizeOptions)
    .values(labels.map((label, sortOrder) => ({ presetId: preset!.id, label, sortOrder })));
  return preset!.id;
}

export async function setName(tx: Tx, id: number, name: string): Promise<void> {
  await tx.update(sizePresets).set({ name }).where(eq(sizePresets.id, id));
}

export async function deleteOptions(tx: Tx, optionIds: number[]): Promise<void> {
  if (optionIds.length > 0) {
    await tx.delete(sizeOptions).where(inArray(sizeOptions.id, optionIds));
  }
}

// Moves an option onto a throwaway label so label swaps can't trip the unique constraint.
export async function parkOptionLabel(tx: Tx, optionId: number): Promise<void> {
  await tx
    .update(sizeOptions)
    .set({ label: `__tmp__${optionId}` })
    .where(eq(sizeOptions.id, optionId));
}

export async function insertOption(
  tx: Tx,
  presetId: number,
  label: string,
  sortOrder: number,
): Promise<number> {
  const [added] = await tx
    .insert(sizeOptions)
    .values({ presetId, label, sortOrder })
    .returning({ id: sizeOptions.id });
  return added!.id;
}

export async function updateOption(
  tx: Tx,
  optionId: number,
  label: string,
  sortOrder: number,
): Promise<void> {
  await tx.update(sizeOptions).set({ label, sortOrder }).where(eq(sizeOptions.id, optionId));
}

export async function remove(db: Db, id: number): Promise<number | undefined> {
  const [row] = await db
    .delete(sizePresets)
    .where(eq(sizePresets.id, id))
    .returning({ id: sizePresets.id });
  return row?.id;
}

export async function listPresetOptionIds(db: DbOrTx, presetId: number): Promise<number[]> {
  const rows = await db
    .select({ id: sizeOptions.id })
    .from(sizeOptions)
    .where(eq(sizeOptions.presetId, presetId));
  return rows.map((r) => r.id);
}

export async function exists(db: DbOrTx, id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: sizePresets.id })
    .from(sizePresets)
    .where(eq(sizePresets.id, id));
  return row !== undefined;
}
