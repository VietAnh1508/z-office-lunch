import { eq } from "drizzle-orm";
import { sizeOptions, sizePresets } from "db";
import { seedRestaurant, seedSizePreset } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import {
  deleteOptions,
  exists,
  findIdByName,
  findWithOptions,
  insertOption,
  insertWithOptions,
  isUsedByRestaurant,
  listPresetOptionIds,
  listWithOptions,
  parkOptionLabel,
  remove,
  setName,
  updateOption,
} from "./repository";

describe("size-presets repository", () => {
  const db = useTestDb();

  const optionRows = (presetId: number) =>
    db.select().from(sizeOptions).where(eq(sizeOptions.presetId, presetId));

  it("listWithOptions orders presets by name and options by sortOrder", async () => {
    await seedSizePreset(db, { name: "Zeta" });
    await seedSizePreset(db, { name: "Alpha" });

    const list = await listWithOptions(db);

    expect(list.map((p) => p.name)).toEqual(["Alpha", "Zeta"]);
    expect(list[0]!.options.map((o) => [o.label, o.sortOrder])).toEqual([
      ["S", 0],
      ["M", 1],
      ["L", 2],
    ]);
  });

  it("findWithOptions returns the preset with ordered options, or null", async () => {
    const { preset } = await seedSizePreset(db);

    const found = await findWithOptions(db, preset.id);

    expect(found).toMatchObject({ id: preset.id, name: preset.name });
    expect(found!.options.map((o) => o.label)).toEqual(["S", "M", "L"]);
    expect(await findWithOptions(db, 999999)).toBeNull();
  });

  it("findIdByName finds by exact name and can ignore one id", async () => {
    const { preset } = await seedSizePreset(db, { name: "Same" });

    expect(await findIdByName(db, "Same")).toBe(preset.id);
    expect(await findIdByName(db, "Same", preset.id)).toBeUndefined();
    expect(await findIdByName(db, "Nope")).toBeUndefined();
  });

  it("isUsedByRestaurant is true only while a restaurant references the preset", async () => {
    const { preset } = await seedSizePreset(db);
    expect(await isUsedByRestaurant(db, preset.id)).toBe(false);
    await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    expect(await isUsedByRestaurant(db, preset.id)).toBe(true);
  });

  it("insertWithOptions creates the preset and its options in order", async () => {
    const id = await db.transaction((tx) => insertWithOptions(tx, "New", ["Tall", "Grande"]));

    const found = await findWithOptions(db, id);
    expect(found!.name).toBe("New");
    expect(found!.options.map((o) => [o.label, o.sortOrder])).toEqual([
      ["Tall", 0],
      ["Grande", 1],
    ]);
  });

  it("setName renames only that preset", async () => {
    const { preset } = await seedSizePreset(db, { name: "Old" });
    await db.transaction((tx) => setName(tx, preset.id, "Renamed"));
    expect((await findWithOptions(db, preset.id))!.name).toBe("Renamed");
  });

  it("deleteOptions removes just the given options", async () => {
    const { preset, options } = await seedSizePreset(db);
    await db.transaction((tx) => deleteOptions(tx, [options[1]!.id]));
    expect((await optionRows(preset.id)).map((o) => o.id).sort()).toEqual(
      [options[0]!.id, options[2]!.id].sort(),
    );
  });

  it("parkOptionLabel moves the option onto a throwaway label", async () => {
    const { preset, options } = await seedSizePreset(db);
    await db.transaction((tx) => parkOptionLabel(tx, options[0]!.id));
    const row = (await optionRows(preset.id)).find((o) => o.id === options[0]!.id);
    expect(row!.label).toBe(`__tmp__${options[0]!.id}`);
  });

  it("insertOption returns the new id and updateOption changes label and order", async () => {
    const { preset } = await seedSizePreset(db);

    const id = await db.transaction((tx) => insertOption(tx, preset.id, "XL", 5));
    expect((await optionRows(preset.id)).find((o) => o.id === id)).toMatchObject({
      label: "XL",
      sortOrder: 5,
    });

    await db.transaction((tx) => updateOption(tx, id, "XXL", 1));
    expect((await optionRows(preset.id)).find((o) => o.id === id)).toMatchObject({
      label: "XXL",
      sortOrder: 1,
    });
  });

  it("remove deletes the preset and its options and returns the id, or undefined", async () => {
    const { preset } = await seedSizePreset(db);

    expect(await remove(db, preset.id)).toBe(preset.id);
    expect(await db.select().from(sizePresets)).toHaveLength(0);
    expect(await optionRows(preset.id)).toHaveLength(0);
    expect(await remove(db, preset.id)).toBeUndefined();
  });

  it("listPresetOptionIds returns all option ids for a preset", async () => {
    const { preset, options } = await seedSizePreset(db);
    const { options: otherOptions } = await seedSizePreset(db, { name: "Other" });

    const ids = await listPresetOptionIds(db, preset.id);
    expect(ids.sort((a, b) => a - b)).toEqual(options.map((o) => o.id).sort((a, b) => a - b));
    expect(otherOptions.every((o) => !ids.includes(o.id))).toBe(true);
  });

  it("exists returns true for an existing preset and false otherwise", async () => {
    const { preset } = await seedSizePreset(db);

    expect(await exists(db, preset.id)).toBe(true);
    expect(await exists(db, 999999)).toBe(false);
  });
});
