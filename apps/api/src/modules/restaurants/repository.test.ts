import { seedRestaurant, seedSizePreset } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import { findById, insert, list, setMenuImage, update } from "./repository";

describe("restaurants repository", () => {
  const db = useTestDb();

  it("findById returns the restaurant or null", async () => {
    const r = await seedRestaurant(db, { name: "Pho 24" });

    expect(await findById(db, r!.id)).toMatchObject({ id: r!.id, name: "Pho 24" });
    expect(await findById(db, 999999)).toBeNull();
  });

  it("list returns all restaurants ordered by id", async () => {
    const first = await seedRestaurant(db, { name: "Zebra" });
    const second = await seedRestaurant(db, { name: "Alpha" });

    const rows = await list(db);

    expect(rows.map((r) => r.id)).toEqual([first!.id, second!.id]);
    expect(rows.map((r) => r.name)).toEqual(["Zebra", "Alpha"]);
  });

  it("insert persists all fields and returns the created row", async () => {
    const { preset } = await seedSizePreset(db);

    const created = await insert(db, {
      name: "Tea House",
      type: "drink",
      contactInfo: "090-123-4567",
      note: "Ice separate",
      menuUrl: "https://tea.example.com",
      sizePresetId: preset.id,
    });

    expect(created).toMatchObject({
      name: "Tea House",
      type: "drink",
      contactInfo: "090-123-4567",
      note: "Ice separate",
      menuUrl: "https://tea.example.com",
      sizePresetId: preset.id,
      menuImage: null,
    });
  });

  it("update writes fields and preserves sizePresetId when omitted", async () => {
    const { preset } = await seedSizePreset(db);
    const r = await seedRestaurant(db, {
      name: "Old",
      type: "drink",
      sizePresetId: preset.id,
    });

    const kept = await db.transaction((tx) =>
      update(tx, r!.id, {
        name: "Renamed",
        contactInfo: "111",
        note: "Updated",
        menuUrl: "https://new.example.com",
      }),
    );
    expect(kept).toMatchObject({
      id: r!.id,
      name: "Renamed",
      contactInfo: "111",
      note: "Updated",
      menuUrl: "https://new.example.com",
      sizePresetId: preset.id,
    });

    const cleared = await db.transaction((tx) =>
      update(tx, r!.id, {
        name: "Cleared",
        contactInfo: null,
        note: null,
        menuUrl: null,
        sizePresetId: null,
      }),
    );
    expect(cleared).toMatchObject({
      id: r!.id,
      name: "Cleared",
      contactInfo: null,
      note: null,
      menuUrl: null,
      sizePresetId: null,
    });
  });

  it("setMenuImage sets and clears the menuImage key", async () => {
    const r = await seedRestaurant(db);

    const set = await setMenuImage(db, r!.id, "restaurants/1/img.jpg");
    expect(set.menuImage).toBe("restaurants/1/img.jpg");

    const cleared = await setMenuImage(db, r!.id, null);
    expect(cleared.menuImage).toBeNull();
  });
});
