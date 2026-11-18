import type { Db } from "../../lib/db-types";
import type { Result } from "../../lib/result";
import type { Preset } from "./repository";

// Scaffolding for the red commit: signatures only, behavior moves in the green commit.
const todo = (): never => {
  throw new Error("not implemented");
};

type PresetResult = Result<Preset, number>;

export async function listPresets(_db: Db): Promise<Preset[]> {
  return todo();
}

export async function createPreset(
  _db: Db,
  _rawName: unknown,
  _rawOptions: unknown,
): Promise<PresetResult> {
  return todo();
}

export async function updatePreset(
  _db: Db,
  _id: number,
  _rawName: unknown,
  _rawOptions: unknown,
): Promise<PresetResult> {
  return todo();
}

export async function deletePreset(_db: Db, _id: number): Promise<Result<{ id: number }, number>> {
  return todo();
}
