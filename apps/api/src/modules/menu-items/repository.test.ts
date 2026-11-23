import { eq } from "drizzle-orm";
import { menuItemSizes, menuItems } from "db";
import { seedMenuItem, seedMenuItemSize, seedRestaurant, seedSizePreset } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import {
  deactivateActiveForRestaurant,
  findByIdInRestaurant,
  findRestaurantById,
  findWithPreset,
  insertMany,
  insertOne,
  listByRestaurant,
  listItemSizeIds,
  listPresetOptionIds,
  listSizesForItems,
  replaceItemSizes,
  setActive,
  updateDetails,
} from "./repository";

describe("menu-items repository", () => {
  const db = useTestDb();

  it("findRestaurantById returns the restaurant or null", async () => {
    const r = await seedRestaurant(db, { name: "Pho 24" });
    expect(await findRestaurantById(db, r!.id)).toMatchObject({ id: r!.id, name: "Pho 24" });
    expect(await findRestaurantById(db, 999999)).toBeNull();
  });

  it("findByIdInRestaurant matches only when the item belongs to that restaurant", async () => {
    const r1 = await seedRestaurant(db, { name: "R1" });
    const r2 = await seedRestaurant(db, { name: "R2" });
    const item = await seedMenuItem(db, { restaurantId: r1!.id, name: "Pho" });

    expect(await findByIdInRestaurant(db, r1!.id, item!.id)).toMatchObject({ id: item!.id });
    expect(await findByIdInRestaurant(db, r2!.id, item!.id)).toBeNull();
    expect(await findByIdInRestaurant(db, r1!.id, 999999)).toBeNull();
  });

  it("findWithPreset returns item id and restaurant sizePresetId, or null", async () => {
    const { preset } = await seedSizePreset(db);
    const withPreset = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const withoutPreset = await seedRestaurant(db, { type: "food", name: "Food" });
    const itemA = await seedMenuItem(db, { restaurantId: withPreset!.id });
    const itemB = await seedMenuItem(db, { restaurantId: withoutPreset!.id });

    expect(await findWithPreset(db, withPreset!.id, itemA!.id)).toEqual({
      id: itemA!.id,
      presetId: preset.id,
    });
    expect(await findWithPreset(db, withoutPreset!.id, itemB!.id)).toEqual({
      id: itemB!.id,
      presetId: null,
    });
    expect(await findWithPreset(db, withoutPreset!.id, itemA!.id)).toBeNull();
  });

  it("listByRestaurant orders by name and filters activeOnly", async () => {
    const r = await seedRestaurant(db);
    await seedMenuItem(db, { restaurantId: r!.id, name: "Zebra", active: true });
    await seedMenuItem(db, { restaurantId: r!.id, name: "Alpha", active: false });
    await seedMenuItem(db, { restaurantId: r!.id, name: "Mango", active: true });

    const all = await listByRestaurant(db, r!.id, false);
    expect(all.map((i) => i.name)).toEqual(["Alpha", "Mango", "Zebra"]);

    const active = await listByRestaurant(db, r!.id, true);
    expect(active.map((i) => i.name)).toEqual(["Mango", "Zebra"]);
  });

  it("listSizesForItems and listItemSizeIds order by sortOrder, id and handle empty input", async () => {
    expect(await listSizesForItems(db, [])).toEqual([]);

    const { preset, options } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const item = await seedMenuItem(db, { restaurantId: r!.id });
    for (const opt of [options[2]!, options[0]!]) {
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: opt.id });
    }

    expect(await listSizesForItems(db, [item!.id])).toEqual([
      { menuItemId: item!.id, sizeOptionId: options[0]!.id },
      { menuItemId: item!.id, sizeOptionId: options[2]!.id },
    ]);
    expect(await listItemSizeIds(db, item!.id)).toEqual([options[0]!.id, options[2]!.id]);
  });

  it("listPresetOptionIds returns all option ids for a preset", async () => {
    const { preset, options } = await seedSizePreset(db);
    const { preset: other } = await seedSizePreset(db, { name: "Other" });

    const ids = await listPresetOptionIds(db, preset.id);
    expect(ids.sort((a, b) => a - b)).toEqual(options.map((o) => o.id).sort((a, b) => a - b));
    expect(ids.every((id) => other.id !== id)).toBe(true);
  });

  it("insertOne and insertMany create active rows", async () => {
    const r = await seedRestaurant(db);
    const one = await db.transaction((tx) => insertOne(tx, r!.id, "Banh Mi", "25000"));
    expect(one).toMatchObject({
      restaurantId: r!.id,
      name: "Banh Mi",
      price: "25000",
      active: true,
    });

    expect(await db.transaction((tx) => insertMany(tx, r!.id, []))).toEqual([]);
    const many = await db.transaction((tx) =>
      insertMany(tx, r!.id, [
        { name: "Pho", price: "45000" },
        { name: "Tra Da", price: null },
      ]),
    );
    expect(many).toHaveLength(2);
    expect(many.map((i) => i.name)).toEqual(["Pho", "Tra Da"]);
  });

  it("deactivateActiveForRestaurant only affects active items in that restaurant", async () => {
    const r1 = await seedRestaurant(db, { name: "R1" });
    const r2 = await seedRestaurant(db, { name: "R2" });
    const a = await seedMenuItem(db, { restaurantId: r1!.id, name: "A", active: true });
    const b = await seedMenuItem(db, { restaurantId: r2!.id, name: "B", active: true });

    await db.transaction((tx) => deactivateActiveForRestaurant(tx, r1!.id));

    const [rowA] = await db.select().from(menuItems).where(eq(menuItems.id, a!.id));
    const [rowB] = await db.select().from(menuItems).where(eq(menuItems.id, b!.id));
    expect(rowA!.active).toBe(false);
    expect(rowB!.active).toBe(true);
  });

  it("setActive and updateDetails update only the targeted fields", async () => {
    const r = await seedRestaurant(db);
    const item = await seedMenuItem(db, {
      restaurantId: r!.id,
      name: "Old",
      price: "10",
      active: true,
    });

    const toggled = await setActive(db, item!.id, false);
    expect(toggled.active).toBe(false);

    const updated = await updateDetails(db, item!.id, "New", null);
    expect(updated).toMatchObject({ id: item!.id, name: "New", price: null, active: false });
  });

  it("replaceItemSizes replaces all size rows for the item", async () => {
    const { preset, options } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const item = await seedMenuItem(db, { restaurantId: r!.id });
    await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });

    await db.transaction((tx) => replaceItemSizes(tx, item!.id, [options[1]!.id, options[2]!.id]));
    const rows = await db
      .select()
      .from(menuItemSizes)
      .where(eq(menuItemSizes.menuItemId, item!.id));
    expect(rows.map((row) => row.sizeOptionId).sort((a, b) => a - b)).toEqual(
      [options[1]!.id, options[2]!.id].sort((a, b) => a - b),
    );

    await db.transaction((tx) => replaceItemSizes(tx, item!.id, []));
    expect(
      await db.select().from(menuItemSizes).where(eq(menuItemSizes.menuItemId, item!.id)),
    ).toHaveLength(0);
  });
});
