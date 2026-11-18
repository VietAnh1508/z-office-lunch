import type { Db } from "../../lib/db-types";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";
import { addOptionToRestaurants } from "../menu-item-sizes/repository";
import * as repo from "./repository";
import type { Preset } from "./repository";

type OptionInput = { id?: number; label: string };
type PresetResult = Result<Preset, number>;

const notFound = () => fail(ERROR_MESSAGES.sizePresetNotFound, 404);

function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// `entries` is shaped as { id?, label } — the controller maps plain strings into this for POST.
function validatePreset(
  rawName: unknown,
  entries: unknown,
): Result<{ name: string; options: OptionInput[] }> {
  const name = trimmed(rawName);
  if (!name) {
    return fail(ERROR_MESSAGES.nameRequired);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return fail(ERROR_MESSAGES.sizeOptionsRequired);
  }
  const options: OptionInput[] = [];
  for (const entry of entries) {
    const label = trimmed(entry?.label);
    if (!label) {
      return fail(ERROR_MESSAGES.sizeOptionsRequired);
    }
    const id = entry.id;
    if (id !== undefined && id !== null && !Number.isInteger(id)) {
      return fail(ERROR_MESSAGES.sizeOptionInvalid);
    }
    options.push({ id: id ?? undefined, label });
  }
  if (new Set(options.map((o) => o.label)).size !== options.length) {
    return fail(ERROR_MESSAGES.sizeOptionsDuplicate);
  }
  return ok({ name, options });
}

export async function listPresets(db: Db): Promise<Preset[]> {
  return repo.listWithOptions(db);
}

export async function createPreset(
  db: Db,
  rawName: unknown,
  rawOptions: unknown,
): Promise<PresetResult> {
  const parsed = validatePreset(rawName, rawOptions);
  if (!parsed.ok) {
    return parsed;
  }
  if ((await repo.findIdByName(db, parsed.name)) !== undefined) {
    return fail(ERROR_MESSAGES.sizePresetNameTaken, 409);
  }
  const id = await db.transaction((tx) =>
    repo.insertWithOptions(
      tx,
      parsed.name,
      parsed.options.map((o) => o.label),
    ),
  );
  return ok((await repo.findWithOptions(db, id))!);
}

export async function updatePreset(
  db: Db,
  id: number,
  rawName: unknown,
  rawOptions: unknown,
): Promise<PresetResult> {
  // 404 is checked before validation, so a missing preset wins over a bad body.
  const existing = await repo.findWithOptions(db, id);
  if (!existing) {
    return notFound();
  }
  const parsed = validatePreset(rawName, rawOptions);
  if (!parsed.ok) {
    return parsed;
  }

  const ownIds = new Set(existing.options.map((o) => o.id));
  const keptIds = parsed.options.flatMap((o) => (o.id === undefined ? [] : [o.id]));
  if (keptIds.some((k) => !ownIds.has(k)) || new Set(keptIds).size !== keptIds.length) {
    return fail(ERROR_MESSAGES.sizeOptionInvalid);
  }
  if ((await repo.findIdByName(db, parsed.name, id)) !== undefined) {
    return fail(ERROR_MESSAGES.sizePresetNameTaken, 409);
  }

  await db.transaction(async (tx) => {
    await repo.setName(tx, id, parsed.name);
    await repo.deleteOptions(
      tx,
      [...ownIds].filter((k) => !keptIds.includes(k)),
    );
    // Park kept options on throwaway labels first so swapping/renaming labels
    // can't trip the (preset, label) unique constraint mid-update.
    for (const keptId of keptIds) {
      await repo.parkOptionLabel(tx, keptId);
    }
    for (const [sortOrder, o] of parsed.options.entries()) {
      if (o.id === undefined) {
        const optionId = await repo.insertOption(tx, id, o.label, sortOrder);
        await addOptionToRestaurants(tx, id, optionId);
      } else {
        await repo.updateOption(tx, o.id, o.label, sortOrder);
      }
    }
  });
  return ok((await repo.findWithOptions(db, id))!);
}

export async function deletePreset(db: Db, id: number): Promise<Result<{ id: number }, number>> {
  if (await repo.isUsedByRestaurant(db, id)) {
    return fail(ERROR_MESSAGES.sizePresetInUse, 409);
  }
  const removed = await repo.remove(db, id);
  return removed === undefined ? notFound() : ok({ id: removed });
}
