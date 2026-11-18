import { eq } from "drizzle-orm";
import { menuItemSizes, sizeOptions } from "db";
import { seedMenuItem, seedRestaurant, seedSizePreset } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import { createPreset, deletePreset, listPresets, updatePreset } from "./service";

const failure = (error: string, status: number) => ({ ok: false, error, status });

describe("size-presets service", () => {
  const db = useTestDb();

  it("listPresets returns presets with their options", async () => {
    await seedSizePreset(db, { name: "A" });
    const list = await listPresets(db);
    expect(list).toHaveLength(1);
    expect(list[0]!.options).toHaveLength(3);
  });

  describe("createPreset", () => {
    it("trims the name and labels and keeps option order", async () => {
      const res = await createPreset(db, "  Starbucks ", [{ label: "Tall" }, { label: " Grande" }]);
      expect(res).toMatchObject({ ok: true, name: "Starbucks" });
      if (res.ok) {
        expect(res.options.map((o) => [o.label, o.sortOrder])).toEqual([
          ["Tall", 0],
          ["Grande", 1],
        ]);
      }
    });

    it("400 nameRequired for a blank or non-string name", async () => {
      expect(await createPreset(db, "  ", [{ label: "S" }])).toEqual(
        failure("name is required", 400),
      );
      expect(await createPreset(db, 5, [{ label: "S" }])).toEqual(failure("name is required", 400));
    });

    it("400 sizeOptionsRequired for a missing, empty or blank-label list", async () => {
      const msg = "at least one size option is required";
      expect(await createPreset(db, "X", undefined)).toEqual(failure(msg, 400));
      expect(await createPreset(db, "X", [])).toEqual(failure(msg, 400));
      expect(await createPreset(db, "X", [{ label: "S" }, { label: " " }])).toEqual(
        failure(msg, 400),
      );
    });

    it("400 sizeOptionsDuplicate for duplicate trimmed labels, case-sensitive", async () => {
      expect(await createPreset(db, "X", [{ label: "S" }, { label: " S" }])).toEqual(
        failure("size option labels must be unique", 400),
      );
      expect(await createPreset(db, "X", [{ label: "S" }, { label: "s" }])).toMatchObject({
        ok: true,
      });
    });

    it("409 sizePresetNameTaken for a duplicate name", async () => {
      await seedSizePreset(db, { name: "Dup" });
      expect(await createPreset(db, "Dup", [{ label: "S" }])).toEqual(
        failure("a size preset with this name already exists", 409),
      );
    });
  });

  describe("updatePreset", () => {
    it("404 comes before 400 validation errors", async () => {
      expect(await updatePreset(db, 999999, " ", [])).toEqual(
        failure("size preset not found", 404),
      );
    });

    it("keeps, renames, adds, removes and reorders options", async () => {
      const { preset, options } = await seedSizePreset(db);
      const [s, , l] = options;

      const res = await updatePreset(db, preset.id, "Renamed", [
        { id: l!.id, label: "Large" },
        { label: "XL" },
        { id: s!.id, label: "S" },
      ]);

      expect(res).toMatchObject({ ok: true, name: "Renamed" });
      if (res.ok) {
        expect(res.options.map((o) => [o.label, o.sortOrder])).toEqual([
          ["Large", 0],
          ["XL", 1],
          ["S", 2],
        ]);
      }
    });

    it("swaps labels without tripping the unique constraint", async () => {
      const { preset, options } = await seedSizePreset(db);
      const res = await updatePreset(db, preset.id, preset.name, [
        { id: options[0]!.id, label: "M" },
        { id: options[1]!.id, label: "S" },
      ]);
      expect(res).toMatchObject({ ok: true });
      if (res.ok) expect(res.options.map((o) => o.label)).toEqual(["M", "S"]);
    });

    it("400 sizeOptionInvalid for a foreign or repeated option id, or a non-integer id", async () => {
      const { preset, options } = await seedSizePreset(db);
      const { options: other } = await seedSizePreset(db, { name: "Other" });
      const msg = "size option does not belong to this preset";

      expect(await updatePreset(db, preset.id, "X", [{ id: other[0]!.id, label: "S" }])).toEqual(
        failure(msg, 400),
      );
      expect(
        await updatePreset(db, preset.id, "X", [
          { id: options[0]!.id, label: "S" },
          { id: options[0]!.id, label: "M" },
        ]),
      ).toEqual(failure(msg, 400));
      expect(await updatePreset(db, preset.id, "X", [{ id: 1.5, label: "S" }])).toEqual(
        failure(msg, 400),
      );
    });

    it("409 when renaming to another preset's name, rolling nothing forward", async () => {
      await seedSizePreset(db, { name: "Taken" });
      const { preset, options } = await seedSizePreset(db, { name: "Mine" });

      const res = await updatePreset(db, preset.id, "Taken", [{ label: "Only" }]);

      expect(res).toEqual(failure("a size preset with this name already exists", 409));
      const rows = await db.select().from(sizeOptions).where(eq(sizeOptions.presetId, preset.id));
      expect(rows.map((o) => o.id).sort()).toEqual(options.map((o) => o.id).sort());
    });

    it("keeping the preset's own name is fine", async () => {
      const { preset, options } = await seedSizePreset(db, { name: "Mine" });
      const res = await updatePreset(db, preset.id, "Mine", [{ id: options[0]!.id, label: "S" }]);
      expect(res).toMatchObject({ ok: true });
    });

    it("ticks a newly added option for items of restaurants using the preset", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });

      const res = await updatePreset(db, preset.id, preset.name, [
        ...options.map((o) => ({ id: o.id, label: o.label })),
        { label: "XL" },
      ]);

      expect(res.ok).toBe(true);
      const xl = res.ok ? res.options.find((o) => o.label === "XL")! : undefined;
      const rows = await db
        .select()
        .from(menuItemSizes)
        .where(eq(menuItemSizes.menuItemId, item!.id));
      expect(rows.map((x) => x.sizeOptionId)).toEqual([xl!.id]);
    });
  });

  describe("deletePreset", () => {
    it("deletes an unused preset and returns its id", async () => {
      const { preset } = await seedSizePreset(db);
      expect(await deletePreset(db, preset.id)).toEqual({ ok: true, id: preset.id });
      expect(await listPresets(db)).toEqual([]);
    });

    it("409 sizePresetInUse while a restaurant uses it", async () => {
      const { preset } = await seedSizePreset(db);
      await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      expect(await deletePreset(db, preset.id)).toEqual(
        failure("size preset is in use by a restaurant", 409),
      );
    });

    it("404 for a missing preset", async () => {
      expect(await deletePreset(db, 999999)).toEqual(failure("size preset not found", 404));
    });
  });
});
