import { eq } from "drizzle-orm";
import { menuItemSizes, submissions } from "db";
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
  bulkCreateMenuItems,
  createMenuItem,
  listMenuItems,
  toggleMenuItem,
  updateMenuItemDetails,
  updateMenuItemSizes,
} from "./service";

const failure = (error: string, status: number) => ({ ok: false, error, status });

describe("menu-items service", () => {
  const db = useTestDb();

  it("listMenuItems merges sorted sizeOptionIds onto each item", async () => {
    const { preset, options } = await seedSizePreset(db);
    const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
    const a = await seedMenuItem(db, { restaurantId: r!.id, name: "A", active: true });
    await seedMenuItem(db, { restaurantId: r!.id, name: "B", active: false });
    await seedMenuItemSize(db, { menuItemId: a!.id, sizeOptionId: options[2]!.id });
    await seedMenuItemSize(db, { menuItemId: a!.id, sizeOptionId: options[0]!.id });

    const all = await listMenuItems(db, r!.id, false);
    expect(all).toHaveLength(2);
    expect(all.find((i) => i.id === a!.id)?.sizeOptionIds).toEqual([
      options[0]!.id,
      options[2]!.id,
    ]);

    const active = await listMenuItems(db, r!.id, true);
    expect(active.map((i) => i.id)).toEqual([a!.id]);
  });

  describe("createMenuItem", () => {
    it("404 when the restaurant does not exist", async () => {
      expect(await createMenuItem(db, 999999, { name: "Pho", price: null })).toEqual(
        failure("restaurant not found", 404),
      );
    });

    it("creates the item and ticks all preset sizes", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });

      const res = await createMenuItem(db, r!.id, { name: "Latte", price: "45000" });
      expect(res).toMatchObject({ ok: true, name: "Latte", price: "45000", active: true });
      if (res.ok) {
        const sizes = await db
          .select({ id: menuItemSizes.sizeOptionId })
          .from(menuItemSizes)
          .where(eq(menuItemSizes.menuItemId, res.id));
        expect(sizes.map((s) => s.id).sort((a, b) => a - b)).toEqual(
          options.map((o) => o.id).sort((a, b) => a - b),
        );
      }
    });
  });

  describe("toggleMenuItem & updateMenuItemDetails", () => {
    it("404 when the item is missing or belongs to another restaurant", async () => {
      const r1 = await seedRestaurant(db, { name: "R1" });
      const r2 = await seedRestaurant(db, { name: "R2" });
      const item = await seedMenuItem(db, { restaurantId: r1!.id });

      expect(await toggleMenuItem(db, r2!.id, item!.id)).toEqual(
        failure("menu item not found", 404),
      );
      expect(await updateMenuItemDetails(db, r2!.id, item!.id, { name: "X", price: null })).toEqual(
        failure("menu item not found", 404),
      );
    });

    it("toggles active and updates details", async () => {
      const r = await seedRestaurant(db);
      const item = await seedMenuItem(db, { restaurantId: r!.id, name: "Pho", active: true });

      const toggled = await toggleMenuItem(db, r!.id, item!.id);
      expect(toggled).toMatchObject({ ok: true, active: false });

      const updated = await updateMenuItemDetails(db, r!.id, item!.id, {
        name: "Pho Dac Biet",
        price: "60000",
      });
      expect(updated).toMatchObject({
        ok: true,
        name: "Pho Dac Biet",
        price: "60000",
        active: false,
      });
    });
  });

  describe("updateMenuItemSizes", () => {
    it("404 when item is missing or in another restaurant", async () => {
      const r = await seedRestaurant(db);
      expect(await updateMenuItemSizes(db, r!.id, 999999, [])).toEqual(
        failure("menu item not found", 404),
      );
    });

    it("400 when any requested size is outside the restaurant's preset", async () => {
      const { preset } = await seedSizePreset(db);
      const { options: foreign } = await seedSizePreset(db, { name: "Foreign" });
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });

      expect(await updateMenuItemSizes(db, r!.id, item!.id, [foreign[0]!.id])).toEqual(
        failure("size option does not belong to this preset", 400),
      );
    });

    it("replaces sizes and clears removed sizes from open-round submissions", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[1]!.id });

      const emp = await seedEmployee(db);
      const round = await seedRound(db, { drinkRestaurantId: r!.id, status: "open" });
      const rmi = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: item!.id });
      const sub = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: emp!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: rmi!.id,
        drinkSizeOptionId: options[0]!.id,
      });

      const res = await updateMenuItemSizes(db, r!.id, item!.id, [options[1]!.id]);
      expect(res).toEqual({ ok: true, id: item!.id, sizeOptionIds: [options[1]!.id] });

      const [updatedSub] = await db.select().from(submissions).where(eq(submissions.id, sub!.id));
      expect(updatedSub!.drinkSizeOptionId).toBeNull();
    });
  });

  describe("bulkCreateMenuItems", () => {
    it("404 when the restaurant does not exist", async () => {
      expect(
        await bulkCreateMenuItems(db, 999999, "append", [{ name: "Pho", price: null }]),
      ).toEqual(failure("restaurant not found", 404));
    });

    it("override deactivates existing items, inserts new ones, and fills preset sizes", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const oldItem = await seedMenuItem(db, { restaurantId: r!.id, name: "Old", active: true });

      const res = await bulkCreateMenuItems(db, r!.id, "override", [
        { name: "Latte", price: "45000" },
        { name: "Matcha", price: null },
      ]);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.items).toHaveLength(2);
        const list = await listMenuItems(db, r!.id, false);
        expect(list.find((i) => i.id === oldItem!.id)?.active).toBe(false);
        expect(list.find((i) => i.id === res.items[0]!.id)?.sizeOptionIds).toEqual(
          options.map((o) => o.id),
        );
      }
    });
  });
});
