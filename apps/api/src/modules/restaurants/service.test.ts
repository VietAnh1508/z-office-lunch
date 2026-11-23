import { eq } from "drizzle-orm";
import { menuItemSizes, menuItems, submissions } from "db";
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
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../lib/db-types";
import { ERROR_MESSAGES } from "../../lib/errors";
import { useTestDb } from "../../test/db";
import { createFakeAiBinding } from "../../test/fake-ai-binding";
import { createFakeMenuImagesBucket } from "../../test/fake-menu-images-bucket";
import { findById } from "./repository";
import {
  createRestaurant,
  deleteMenuImage,
  generateMenu,
  getMenuImage,
  getSizeResetImpact,
  listRestaurants,
  updateRestaurant,
  uploadMenuImage,
} from "./service";

const failure = (error: string, status: number) => ({ ok: false, error, status });

describe("restaurants service", () => {
  const db = useTestDb();

  async function sizeRows(restaurantId: number) {
    const rows = await db
      .select({ menuItemId: menuItemSizes.menuItemId, sizeOptionId: menuItemSizes.sizeOptionId })
      .from(menuItemSizes)
      .innerJoin(menuItems, eq(menuItems.id, menuItemSizes.menuItemId))
      .where(eq(menuItems.restaurantId, restaurantId));
    return rows.sort((a, b) => a.menuItemId - b.menuItemId || a.sizeOptionId - b.sizeOptionId);
  }

  it("listRestaurants returns restaurants ordered by id", async () => {
    const r1 = await seedRestaurant(db, { name: "First" });
    const r2 = await seedRestaurant(db, { name: "Second" });

    const rows = await listRestaurants(db);
    expect(rows.map((r) => r.id)).toEqual([r1!.id, r2!.id]);
  });

  describe("createRestaurant", () => {
    it("rejects a sizePresetId on a food restaurant", async () => {
      const { preset } = await seedSizePreset(db);

      expect(
        await createRestaurant(db, {
          name: "Pho",
          type: "food",
          contactInfo: null,
          note: null,
          menuUrl: null,
          sizePresetId: preset.id,
        }),
      ).toEqual(failure(ERROR_MESSAGES.sizePresetFoodRestaurant, 400));
    });

    it("404s when the referenced size preset does not exist", async () => {
      expect(
        await createRestaurant(db, {
          name: "Tea",
          type: "drink",
          contactInfo: null,
          note: null,
          menuUrl: null,
          sizePresetId: 999999,
        }),
      ).toEqual(failure(ERROR_MESSAGES.sizePresetNotFound, 404));
    });

    it("creates a drink restaurant with an existing size preset", async () => {
      const { preset } = await seedSizePreset(db);

      const res = await createRestaurant(db, {
        name: "Tea",
        type: "drink",
        contactInfo: "090",
        note: "Note",
        menuUrl: null,
        sizePresetId: preset.id,
      });

      expect(res).toMatchObject({
        ok: true,
        name: "Tea",
        type: "drink",
        sizePresetId: preset.id,
      });
    });
  });

  describe("updateRestaurant", () => {
    it("404s for a missing restaurant", async () => {
      expect(
        await updateRestaurant(db, 999999, {
          name: "Pho",
          contactInfo: null,
          note: null,
          menuUrl: null,
          sizePresetId: undefined,
        }),
      ).toEqual(failure(ERROR_MESSAGES.restaurantNotFound, 404));
    });

    it("400s when assigning a preset to a food restaurant and 404s for a missing preset", async () => {
      const { preset } = await seedSizePreset(db);
      const food = await seedRestaurant(db, { type: "food" });
      const drink = await seedRestaurant(db, { type: "drink" });

      expect(
        await updateRestaurant(db, food!.id, {
          name: "Pho",
          contactInfo: null,
          note: null,
          menuUrl: null,
          sizePresetId: preset.id,
        }),
      ).toEqual(failure(ERROR_MESSAGES.sizePresetFoodRestaurant, 400));

      expect(
        await updateRestaurant(db, drink!.id, {
          name: "Tea",
          contactInfo: null,
          note: null,
          menuUrl: null,
          sizePresetId: 999999,
        }),
      ).toEqual(failure(ERROR_MESSAGES.sizePresetNotFound, 404));
    });

    it("leaves preset and item sizes untouched when sizePresetId is omitted or unchanged", async () => {
      const { preset, options } = await seedSizePreset(db);
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: options[0]!.id });

      const omitted = await updateRestaurant(db, r!.id, {
        name: "Renamed",
        contactInfo: null,
        note: null,
        menuUrl: null,
        sizePresetId: undefined,
      });
      expect(omitted).toMatchObject({ ok: true, name: "Renamed", sizePresetId: preset.id });
      expect(await sizeRows(r!.id)).toEqual([
        { menuItemId: item!.id, sizeOptionId: options[0]!.id },
      ]);

      const same = await updateRestaurant(db, r!.id, {
        name: "Same",
        contactInfo: null,
        note: null,
        menuUrl: null,
        sizePresetId: preset.id,
      });
      expect(same).toMatchObject({ ok: true, name: "Same", sizePresetId: preset.id });
      expect(await sizeRows(r!.id)).toEqual([
        { menuItemId: item!.id, sizeOptionId: options[0]!.id },
      ]);
    });

    it("clears non-closed drink sizes and rebuilds menu item sizes when preset changes", async () => {
      const first = await seedSizePreset(db, { name: "First" });
      const second = await seedSizePreset(db, { name: "Second" });
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: first.preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: first.options[0]!.id });

      const emp = await seedEmployee(db);
      const round = await seedRound(db, { drinkRestaurantId: r!.id, status: "open" });
      const rmi = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: item!.id });
      const sub = await seedSubmission(db, {
        roundId: round!.id,
        employeeId: emp!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: rmi!.id,
        drinkSizeOptionId: first.options[0]!.id,
      });

      const res = await updateRestaurant(db, r!.id, {
        name: "Tea",
        contactInfo: null,
        note: null,
        menuUrl: null,
        sizePresetId: second.preset.id,
      });
      expect(res).toMatchObject({ ok: true, sizePresetId: second.preset.id });

      const [updatedSub] = await db.select().from(submissions).where(eq(submissions.id, sub!.id));
      expect(updatedSub!.drinkSizeOptionId).toBeNull();
      expect(await sizeRows(r!.id)).toEqual(
        second.options
          .map((o) => ({ menuItemId: item!.id, sizeOptionId: o.id }))
          .sort((a, b) => a.sizeOptionId - b.sizeOptionId),
      );
    });
  });

  describe("getSizeResetImpact", () => {
    it("404s for a missing restaurant", async () => {
      expect(await getSizeResetImpact(db, 999999, null)).toEqual(
        failure(ERROR_MESSAGES.restaurantNotFound, 404),
      );
    });

    it("returns 0 when target matches current preset and counts non-closed picks when it differs", async () => {
      const { preset, options } = await seedSizePreset(db);
      const other = await seedSizePreset(db, { name: "Other" });
      const r = await seedRestaurant(db, { type: "drink", sizePresetId: preset.id });
      const item = await seedMenuItem(db, { restaurantId: r!.id });
      const emp = await seedEmployee(db);
      const round = await seedRound(db, { drinkRestaurantId: r!.id, status: "open" });
      const rmi = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: item!.id });
      await seedSubmission(db, {
        roundId: round!.id,
        employeeId: emp!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: rmi!.id,
        drinkSizeOptionId: options[0]!.id,
      });

      expect(await getSizeResetImpact(db, r!.id, preset.id)).toEqual({
        ok: true,
        affectedSubmissions: 0,
      });
      expect(await getSizeResetImpact(db, r!.id, other.preset.id)).toEqual({
        ok: true,
        affectedSubmissions: 1,
      });
      expect(await getSizeResetImpact(db, r!.id, null)).toEqual({
        ok: true,
        affectedSubmissions: 1,
      });
    });
  });

  describe("menu image lifecycle", () => {
    const makeFile = (bytes: number[] = [1, 2, 3], type = "image/jpeg") =>
      new File([new Uint8Array(bytes)], "menu.jpg", { type });

    it("uploadMenuImage puts object, updates DB, and best-effort deletes the previous image", async () => {
      const r = await seedRestaurant(db);
      const bucket = createFakeMenuImagesBucket();

      const first = await uploadMenuImage(db, bucket as unknown as R2Bucket, r!.id, makeFile([1]));
      expect(first.ok).toBe(true);
      const firstKey = first.ok ? first.menuImage! : "";
      expect(bucket.objects.has(firstKey)).toBe(true);

      const second = await uploadMenuImage(db, bucket as unknown as R2Bucket, r!.id, makeFile([2]));
      expect(second.ok).toBe(true);
      const secondKey = second.ok ? second.menuImage! : "";
      expect(secondKey).not.toBe(firstKey);
      expect(bucket.objects.has(firstKey)).toBe(false);
      expect(bucket.objects.has(secondKey)).toBe(true);

      const failingOldDeleteBucket = {
        ...bucket,
        async delete() {
          throw new Error("r2 delete old failed");
        },
      };
      const third = await uploadMenuImage(
        db,
        failingOldDeleteBucket as unknown as R2Bucket,
        r!.id,
        makeFile([3]),
      );
      expect(third.ok).toBe(true);
      if (third.ok) {
        expect(third.menuImage).not.toBe(secondKey);
        expect(bucket.objects.has(third.menuImage!)).toBe(true);
      }
    });

    it("uploadMenuImage performs a compensating R2 delete when the DB update throws", async () => {
      const r = await seedRestaurant(db);
      const bucket = createFakeMenuImagesBucket();
      const putSpy = vi.spyOn(bucket, "put");
      const deleteSpy = vi.spyOn(bucket, "delete");
      const failingUpdateDb = Object.create(db) as Db;
      failingUpdateDb.update = (() => {
        throw new Error("db update failed");
      }) as unknown as Db["update"];

      await expect(
        uploadMenuImage(failingUpdateDb, bucket as unknown as R2Bucket, r!.id, makeFile()),
      ).rejects.toThrow("db update failed");
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(putSpy.mock.calls[0]?.[0]);
      expect(bucket.objects.size).toBe(0);
    });

    it("getMenuImage returns 404 when restaurant, key, or R2 object is missing", async () => {
      const bucket = createFakeMenuImagesBucket();
      expect(await getMenuImage(db, bucket as unknown as R2Bucket, 999999)).toEqual(
        failure(ERROR_MESSAGES.restaurantNotFound, 404),
      );

      const r = await seedRestaurant(db);
      expect(await getMenuImage(db, bucket as unknown as R2Bucket, r!.id)).toEqual(
        failure(ERROR_MESSAGES.menuImageNotFound, 404),
      );

      const uploaded = await uploadMenuImage(db, bucket as unknown as R2Bucket, r!.id, makeFile());
      expect(uploaded.ok).toBe(true);
      if (uploaded.ok) {
        bucket.objects.delete(uploaded.menuImage!);
      }
      expect(await getMenuImage(db, bucket as unknown as R2Bucket, r!.id)).toEqual(
        failure(ERROR_MESSAGES.menuImageNotFound, 404),
      );
    });

    it("deleteMenuImage clears the DB reference first and still succeeds if R2 delete fails", async () => {
      const r = await seedRestaurant(db);
      const bucket = createFakeMenuImagesBucket();
      const uploaded = await uploadMenuImage(db, bucket as unknown as R2Bucket, r!.id, makeFile());
      expect(uploaded.ok).toBe(true);

      let dbImageDuringR2Delete: string | null | undefined = "not-checked";
      const failingDeleteBucket = {
        ...bucket,
        async delete() {
          dbImageDuringR2Delete = (await findById(db, r!.id))?.menuImage;
          throw new Error("r2 delete failed");
        },
      };

      const deleted = await deleteMenuImage(db, failingDeleteBucket as unknown as R2Bucket, r!.id);
      expect(dbImageDuringR2Delete).toBeNull();
      expect(deleted).toMatchObject({ ok: true, id: r!.id, menuImage: null });
    });
  });

  describe("generateMenu", () => {
    it("returns 404 when restaurant or menuImage is missing, and 500 when R2 object is missing", async () => {
      const bucket = createFakeMenuImagesBucket();
      const ai = createFakeAiBinding();

      expect(
        await generateMenu(db, bucket as unknown as R2Bucket, ai as unknown as Ai, 999999),
      ).toEqual(failure(ERROR_MESSAGES.restaurantNotFound, 404));

      const r = await seedRestaurant(db);
      expect(
        await generateMenu(db, bucket as unknown as R2Bucket, ai as unknown as Ai, r!.id),
      ).toEqual(failure(ERROR_MESSAGES.menuImageNotFound, 404));

      const uploaded = await uploadMenuImage(
        db,
        bucket as unknown as R2Bucket,
        r!.id,
        new File([new Uint8Array([1, 2])], "menu.jpg", { type: "image/jpeg" }),
      );
      if (uploaded.ok) {
        bucket.objects.delete(uploaded.menuImage!);
      }

      expect(
        await generateMenu(db, bucket as unknown as R2Bucket, ai as unknown as Ai, r!.id),
      ).toEqual(failure(ERROR_MESSAGES.internal, 500));
    });

    it("returns parsed items when R2 object and AI succeed", async () => {
      const r = await seedRestaurant(db);
      const bucket = createFakeMenuImagesBucket();
      await uploadMenuImage(
        db,
        bucket as unknown as R2Bucket,
        r!.id,
        new File([new Uint8Array([1, 2, 3])], "menu.png", { type: "image/png" }),
      );

      const ai = createFakeAiBinding();
      ai.resolveWith({ items: [{ name: "Pho Bo" }] });

      expect(
        await generateMenu(db, bucket as unknown as R2Bucket, ai as unknown as Ai, r!.id),
      ).toEqual({ ok: true, items: [{ name: "Pho Bo" }] });
    });
  });
});
