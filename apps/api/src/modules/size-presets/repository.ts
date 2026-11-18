import type { Db, DbOrTx, Tx } from "../../lib/db-types";

// Scaffolding for the red commit: signatures only, behavior moves in the green commit.
const todo = (): never => {
  throw new Error("not implemented");
};

export type PresetOption = { id: number; label: string; sortOrder: number };
export type Preset = { id: number; name: string; options: PresetOption[] };

export async function listWithOptions(_db: DbOrTx): Promise<Preset[]> {
  return todo();
}

export async function findWithOptions(_db: DbOrTx, _id: number): Promise<Preset | null> {
  return todo();
}

// Id of a preset named `name`, ignoring `exceptId` (for rename checks).
export async function findIdByName(
  _db: DbOrTx,
  _name: string,
  _exceptId?: number,
): Promise<number | undefined> {
  return todo();
}

export async function isUsedByRestaurant(_db: DbOrTx, _id: number): Promise<boolean> {
  return todo();
}

export async function insertWithOptions(
  _tx: Tx,
  _name: string,
  _labels: string[],
): Promise<number> {
  return todo();
}

export async function setName(_tx: Tx, _id: number, _name: string): Promise<void> {
  return todo();
}

export async function deleteOptions(_tx: Tx, _optionIds: number[]): Promise<void> {
  return todo();
}

// Moves an option onto a throwaway label so label swaps can't trip the unique constraint.
export async function parkOptionLabel(_tx: Tx, _optionId: number): Promise<void> {
  return todo();
}

export async function insertOption(
  _tx: Tx,
  _presetId: number,
  _label: string,
  _sortOrder: number,
): Promise<number> {
  return todo();
}

export async function updateOption(
  _tx: Tx,
  _optionId: number,
  _label: string,
  _sortOrder: number,
): Promise<void> {
  return todo();
}

export async function remove(_db: Db, _id: number): Promise<number | undefined> {
  return todo();
}
