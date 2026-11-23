import { eq } from "drizzle-orm";
import { menuItemSizes, sizeOptions, submissions } from "db";
import {
  seedEmployee,
  seedMenuItem,
  seedMenuItemSize,
  seedRestaurant,
  seedRound,
  seedRoundMenuItem,
  seedSizePreset,
  seedSubmission,
} from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import {
  addOptionToRestaurants,
  clearRemovedItemSizes,
  clearRestaurantDrinkSizes,
  countRestaurantDrinkSizes,
  fillSizesForItems,
  rebuildMenuItemSizes,
  replaceItemSizes,
} from "./repository";

const byId = (a: number, b: number) => a - b;

describe("menu-item-sizes repository", () => {
  const db = useTestDb();

  async function sizeIds(menuItemId: number) {
    const rows = await db
      .select({ id: menuItemSizes.sizeOptionId })
      .from(menuItemSizes)
      .where(eq(menuItemSizes.menuItemId, menuItemId));
    return rows.map((r) => r.id).sort(byId);
  }

  describe("rebuildMenuItemSizes", () => {
    it("wipes existing ticks and ticks every option for every item, active or not", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const a = await seedMenuItem(db, { restaurantId: r!.id, name: "A" });
      const b = await seedMenuItem(db, { restaurantId: r!.id, name: "B", active: false });
      const other = await seedRestaurant(db, { type: "drink", name: "Other" });
      const untouched = await seedMenuItem(db, { restaurantId: other!.id });
      await seedMenuItemSize(db, { menuItemId: a!.id, sizeOptionId: options[0]!.id });
      await seedMenuItemSize(db, { menuItemId: untouched!.id, sizeOptionId: options[0]!.id });

      await db.transaction((tx) => rebuildMenuItemSizes(tx, r!.id, preset.id));

      const all = options.map((o) => o.id).sort(byId);
      expect(await sizeIds(a!.id)).toEqual(all);
      expect(await sizeIds(b!.id)).toEqual(all);
      expect(await sizeIds(untouched!.id)).toEqual([options[0]!.id]);
    });

    it("with no preset it only clears the restaurant's ticks", async () => {
      const { options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const a = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: a!.id, sizeOptionId: options[0]!.id });

      await db.transaction((tx) => rebuildMenuItemSizes(tx, r!.id, null));

      expect(await sizeIds(a!.id)).toEqual([]);
    });

    it("does nothing for a restaurant without items", async () => {
      const { preset } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });

      await db.transaction((tx) => rebuildMenuItemSizes(tx, r!.id, preset.id));

      expect(await db.select().from(menuItemSizes)).toEqual([]);
    });
  });

  describe("fillSizesForItems", () => {
    it("ticks every option of the preset for the given items only", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const a = await seedMenuItem(db, { restaurantId: r!.id, name: "A" });
      const b = await seedMenuItem(db, { restaurantId: r!.id, name: "B" });

      await db.transaction((tx) => fillSizesForItems(tx, [a!.id], preset.id));

      expect(await sizeIds(a!.id)).toEqual(options.map((o) => o.id).sort(byId));
      expect(await sizeIds(b!.id)).toEqual([]);
    });

    it("is a no-op without a preset or without items", async () => {
      const { preset } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const a = await seedMenuItem(db, { restaurantId: r!.id });

      await db.transaction(async (tx) => {
        await fillSizesForItems(tx, [a!.id], null);
        await fillSizesForItems(tx, [], preset.id);
      });

      expect(await db.select().from(menuItemSizes)).toEqual([]);
    });
  });

  describe("addOptionToRestaurants", () => {
    it("ticks the option for every item of restaurants using the preset, nobody else", async () => {
      const { preset, options } = await seedSizePreset(db);
      const using = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const notUsing = await seedRestaurant(db, { type: "drink", name: "Other" });
      const active = await seedMenuItem(db, { restaurantId: using!.id, name: "A" });
      const inactive = await seedMenuItem(db, {
        restaurantId: using!.id,
        name: "B",
        active: false,
      });
      const unrelated = await seedMenuItem(db, { restaurantId: notUsing!.id });

      await db.transaction((tx) => addOptionToRestaurants(tx, preset.id, options[0]!.id));

      expect(await sizeIds(active!.id)).toEqual([options[0]!.id]);
      expect(await sizeIds(inactive!.id)).toEqual([options[0]!.id]);
      expect(await sizeIds(unrelated!.id)).toEqual([]);
    });
  });

  describe("picked drink sizes", () => {
    async function seedPicked(status: "draft" | "open" | "closed", restaurantId: number) {
      const sizes = (await db.select().from(sizeOptions))[0]!;
      const item = await seedMenuItem(db, { restaurantId, name: `item-${status}` });
      const round = await seedRound(db, { status, label: status });
      const rmi = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: item!.id });
      const employee = await seedEmployee(db, { fullName: `emp-${status}` });
      const sub = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: employee!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: rmi!.id,
        drinkSizeOptionId: sizes.id,
      });
      return { sub: sub!, item: item!, sizeId: sizes.id };
    }

    const pickedOf = async (id: number) =>
      (await db.select().from(submissions).where(eq(submissions.id, id)))[0]!.drinkSizeOptionId;

    it("count and clear only touch non-closed rounds of the restaurant", async () => {
      await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const other = await seedRestaurant(db, { type: "drink", name: "Other" });
      const draft = await seedPicked("draft", r!.id);
      const open = await seedPicked("open", r!.id);
      const closed = await seedPicked("closed", r!.id);
      const elsewhere = await seedPicked("open", other!.id);

      expect(await countRestaurantDrinkSizes(db, r!.id)).toBe(2);
      await db.transaction((tx) => clearRestaurantDrinkSizes(tx, r!.id));

      expect(await pickedOf(draft.sub.id)).toBeNull();
      expect(await pickedOf(open.sub.id)).toBeNull();
      expect(await pickedOf(closed.sub.id)).toBe(closed.sizeId);
      expect(await pickedOf(elsewhere.sub.id)).toBe(elsewhere.sizeId);
      expect(await countRestaurantDrinkSizes(db, r!.id)).toBe(0);
    });

    it("clearRemovedItemSizes clears picks outside the kept options for one item", async () => {
      await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink" });
      const a = await seedPicked("open", r!.id);
      const b = await seedPicked("draft", r!.id);

      // kept: the picked size is still allowed -> untouched
      await db.transaction((tx) => clearRemovedItemSizes(tx, r!.id, a.item.id, [a.sizeId]));
      expect(await pickedOf(a.sub.id)).toBe(a.sizeId);

      // not kept -> cleared, but only for that item
      await db.transaction((tx) => clearRemovedItemSizes(tx, r!.id, a.item.id, []));
      expect(await pickedOf(a.sub.id)).toBeNull();
      expect(await pickedOf(b.sub.id)).toBe(b.sizeId);
    });
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
    expect(rows.map((row) => row.sizeOptionId).sort(byId)).toEqual(
      [options[1]!.id, options[2]!.id].sort(byId),
    );

    await db.transaction((tx) => replaceItemSizes(tx, item!.id, []));
    expect(
      await db.select().from(menuItemSizes).where(eq(menuItemSizes.menuItemId, item!.id)),
    ).toHaveLength(0);
  });
});
