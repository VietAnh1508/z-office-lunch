import { eq } from "drizzle-orm";
import { createDb, submissions } from "db";
import {
  TEST_DATABASE_URL,
  seedEmployee,
  seedMenuItem,
  seedMenuItemSize,
  seedRestaurant,
  seedRound,
  seedRoundMenuItem,
  seedSizePreset,
  seedSubmission,
  truncateAll,
} from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { ERROR_MESSAGES } from "../lib/errors";
import { testEnv } from "../test/env";

const db = createDb(TEST_DATABASE_URL);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

function send(method: string, path: string, body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    testEnv,
  );
}

// A drink restaurant with a preset (S/M/L), one drink item offering all three
// sizes, and an open drink-only round curating that item.
async function setup(roundOverrides: Parameters<typeof seedRound>[1] = {}) {
  const { preset, options } = await seedSizePreset(db);
  const drink = await seedRestaurant(db, {
    name: "Tea",
    type: "drink",
    sizePresetId: preset.id,
  });
  const item = await seedMenuItem(db, { restaurantId: drink!.id, name: "Milk tea" });
  for (const o of options) {
    await seedMenuItemSize(db, { menuItemId: item!.id, sizeOptionId: o.id });
  }
  const round = await seedRound(db, {
    drinkRestaurantId: drink!.id,
    status: "open",
    deadline: FUTURE,
    ...roundOverrides,
  });
  const rmi = await seedRoundMenuItem(db, { roundId: round!.id, menuItemId: item!.id });
  const employee = await seedEmployee(db, { fullName: "Alice" });
  return {
    preset,
    options,
    drink: drink!,
    item: item!,
    round: round!,
    rmi: rmi!,
    employee: employee!,
  };
}

async function sizeOf(id: number) {
  const [row] = await db.select().from(submissions).where(eq(submissions.id, id));
  return row!.drinkSizeOptionId;
}

describe("submission drink size", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("validation on POST/PATCH submissions", () => {
    it("POST stores a valid drinkSizeOptionId", async () => {
      const s = await setup();
      const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
        employeeId: s.employee.id,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[1]!.id,
      });
      expect(res.status).toBe(201);
      expect(((await res.json()) as { drinkSizeOptionId: number }).drinkSizeOptionId).toBe(
        s.options[1]!.id,
      );
    });

    it("absent or null size is stored as null (not required yet)", async () => {
      const s = await setup();
      const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
        employeeId: s.employee.id,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: null,
      });
      expect(res.status).toBe(201);
      expect(
        ((await res.json()) as { drinkSizeOptionId: number | null }).drinkSizeOptionId,
      ).toBeNull();
    });

    it("rejects a non-integer drinkSizeOptionId with 400", async () => {
      const s = await setup();
      const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
        employeeId: s.employee.id,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: "big",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: ERROR_MESSAGES.drinkSizeOptionInvalid });
    });

    it("rejects a size that is not ticked for the chosen drink item with 400", async () => {
      const s = await setup();
      const other = await seedSizePreset(db, { name: "Other" });
      for (const body of [
        { drinkSizeOptionId: other.options[0]!.id },
        { drinkSizeOptionId: 999999 },
      ]) {
        const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
          employeeId: s.employee.id,
          drinkRoundMenuItemId: s.rmi.id,
          ...body,
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: ERROR_MESSAGES.drinkSizeNotAvailable });
      }
    });

    it("rejects a size whose option was un-ticked for the item", async () => {
      const s = await setup();
      const bare = await seedMenuItem(db, { restaurantId: s.drink.id, name: "Water" });
      const bareRmi = await seedRoundMenuItem(db, { roundId: s.round.id, menuItemId: bare!.id });
      const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
        employeeId: s.employee.id,
        drinkRoundMenuItemId: bareRmi!.id,
        drinkSizeOptionId: s.options[0]!.id,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: ERROR_MESSAGES.drinkSizeNotAvailable });
    });

    it("drops the size when no drink item is chosen", async () => {
      const food = await seedRestaurant(db, { name: "Pho", type: "food" });
      const foodItem = await seedMenuItem(db, { restaurantId: food!.id });
      const s = await setup({ foodRestaurantId: food!.id });
      const foodRmi = await seedRoundMenuItem(db, {
        roundId: s.round.id,
        menuItemId: foodItem!.id,
      });
      const res = await send("POST", `/api/rounds/${s.round.id}/submissions`, {
        employeeId: s.employee.id,
        foodRoundMenuItemId: foodRmi!.id,
        drinkSizeOptionId: s.options[0]!.id,
      });
      expect(res.status).toBe(201);
      expect(
        ((await res.json()) as { drinkSizeOptionId: number | null }).drinkSizeOptionId,
      ).toBeNull();
    });

    it("admin PATCH sets and validates the size", async () => {
      const s = await setup();
      const sub = await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
      });
      const ok = await send("PATCH", `/api/rounds/${s.round.id}/submissions/${sub!.id}`, {
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[2]!.id,
      });
      expect(ok.status).toBe(200);
      expect(await sizeOf(sub!.id)).toBe(s.options[2]!.id);

      const bad = await send("PATCH", `/api/rounds/${s.round.id}/submissions/${sub!.id}`, {
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: 999999,
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("clearing when the drink item is nulled", () => {
    it("DELETE round menu item clears the size", async () => {
      const s = await setup({ status: "draft" });
      const sub = await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
        drinkNote: "less ice",
        drinkSizeOptionId: s.options[0]!.id,
      });
      const res = await send("DELETE", `/api/rounds/${s.round.id}/menu-items/${s.rmi.id}`);
      expect(res.status).toBe(200);
      const [row] = await db.select().from(submissions).where(eq(submissions.id, sub!.id));
      expect(row!.drinkRoundMenuItemId).toBeNull();
      expect(row!.drinkNote).toBeNull();
      expect(row!.drinkSizeOptionId).toBeNull();
    });

    it("a draft round's drink restaurant change clears the size", async () => {
      const s = await setup({ status: "draft" });
      const sub = await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[0]!.id,
      });
      const newDrink = await seedRestaurant(db, { name: "Coffee", type: "drink" });
      const res = await send("PATCH", `/api/rounds/${s.round.id}`, {
        drinkRestaurantId: newDrink!.id,
        deadline: FUTURE.toISOString(),
      });
      expect(res.status).toBe(200);
      const [row] = await db.select().from(submissions).where(eq(submissions.id, sub!.id));
      expect(row!.drinkRoundMenuItemId).toBeNull();
      expect(row!.drinkSizeOptionId).toBeNull();
    });
  });

  describe("restaurant preset change", () => {
    async function seedPicks() {
      const s = await setup({ status: "open" });
      const closed = await seedRound(db, {
        drinkRestaurantId: s.drink.id,
        status: "closed",
        deadline: FUTURE,
        label: "Old",
      });
      const closedRmi = await seedRoundMenuItem(db, { roundId: closed!.id, menuItemId: s.item.id });
      const draft = await seedRound(db, {
        drinkRestaurantId: s.drink.id,
        status: "draft",
        deadline: FUTURE,
        label: "Next",
      });
      const draftRmi = await seedRoundMenuItem(db, { roundId: draft!.id, menuItemId: s.item.id });
      const e2 = await seedEmployee(db, { fullName: "Bob" });
      const e3 = await seedEmployee(db, { fullName: "Cy" });
      const mk = (roundId: number, employeeId: number, rmiId: number) =>
        seedSubmission(db, {
          roundId,
          employeeId,
          foodRoundMenuItemId: null,
          drinkRoundMenuItemId: rmiId,
          drinkSizeOptionId: s.options[0]!.id,
        });
      return {
        s,
        open: await mk(s.round.id, s.employee.id, s.rmi.id),
        closed: await mk(closed!.id, e2!.id, closedRmi!.id),
        draft: await mk(draft!.id, e3!.id, draftRmi!.id),
      };
    }

    it("changing the preset clears sizes on open and draft rounds, not closed", async () => {
      const { s, open, closed, draft } = await seedPicks();
      const next = await seedSizePreset(db, { name: "Next" });
      const res = await send("PATCH", `/api/restaurants/${s.drink.id}`, {
        name: "Tea",
        sizePresetId: next.preset.id,
      });
      expect(res.status).toBe(200);
      expect(await sizeOf(open!.id)).toBeNull();
      expect(await sizeOf(draft!.id)).toBeNull();
      expect(await sizeOf(closed!.id)).toBe(s.options[0]!.id);
    });

    it("removing the preset clears sizes on open rounds", async () => {
      const { s, open } = await seedPicks();
      const res = await send("PATCH", `/api/restaurants/${s.drink.id}`, {
        name: "Tea",
        sizePresetId: null,
      });
      expect(res.status).toBe(200);
      expect(await sizeOf(open!.id)).toBeNull();
    });

    it("a PATCH that keeps the same preset leaves sizes alone", async () => {
      const { s, open } = await seedPicks();
      await send("PATCH", `/api/restaurants/${s.drink.id}`, {
        name: "Tea 2",
        sizePresetId: s.preset.id,
      });
      expect(await sizeOf(open!.id)).toBe(s.options[0]!.id);
    });

    it("only touches submissions for that restaurant's items", async () => {
      const { s, open } = await seedPicks();
      const otherPreset = await seedSizePreset(db, { name: "P2" });
      const otherDrink = await seedRestaurant(db, {
        name: "Other",
        type: "drink",
        sizePresetId: otherPreset.preset.id,
      });
      await send("PATCH", `/api/restaurants/${otherDrink!.id}`, {
        name: "Other",
        sizePresetId: null,
      });
      expect(await sizeOf(open!.id)).toBe(s.options[0]!.id);
    });
  });

  describe("PUT menu item sizes", () => {
    it("clears sizes removed by the update on non-closed rounds only", async () => {
      const s = await setup({ status: "open" });
      const closed = await seedRound(db, {
        drinkRestaurantId: s.drink.id,
        status: "closed",
        deadline: FUTURE,
        label: "Old",
      });
      const closedRmi = await seedRoundMenuItem(db, { roundId: closed!.id, menuItemId: s.item.id });
      const e2 = await seedEmployee(db, { fullName: "Bob" });
      const mk = (roundId: number, employeeId: number, rmiId: number, opt: number) =>
        seedSubmission(db, {
          roundId,
          employeeId,
          foodRoundMenuItemId: null,
          drinkRoundMenuItemId: rmiId,
          drinkSizeOptionId: opt,
        });
      const removedOpen = await mk(s.round.id, s.employee.id, s.rmi.id, s.options[0]!.id);
      const removedClosed = await mk(closed!.id, e2!.id, closedRmi!.id, s.options[0]!.id);

      const res = await send(
        "PUT",
        `/api/restaurants/${s.drink.id}/menu-items/${s.item.id}/sizes`,
        {
          sizeOptionIds: [s.options[1]!.id, s.options[2]!.id],
        },
      );
      expect(res.status).toBe(200);
      expect(await sizeOf(removedOpen!.id)).toBeNull();
      expect(await sizeOf(removedClosed!.id)).toBe(s.options[0]!.id);
    });

    it("keeps a size that is still ticked", async () => {
      const s = await setup({ status: "open" });
      const sub = await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[1]!.id,
      });
      await send("PUT", `/api/restaurants/${s.drink.id}/menu-items/${s.item.id}/sizes`, {
        sizeOptionIds: [s.options[1]!.id],
      });
      expect(await sizeOf(sub!.id)).toBe(s.options[1]!.id);
    });
  });

  describe("GET /api/restaurants/:id/size-reset-impact", () => {
    async function impact(restaurantId: number, q: string) {
      return send("GET", `/api/restaurants/${restaurantId}/size-reset-impact${q}`);
    }

    it("counts non-closed submissions with a size that a preset change would clear", async () => {
      const s = await setup({ status: "open" });
      await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[0]!.id,
      });
      const e2 = await seedEmployee(db, { fullName: "Bob" });
      await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: e2!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
      }); // no size -> not counted
      const closed = await seedRound(db, {
        drinkRestaurantId: s.drink.id,
        status: "closed",
        deadline: FUTURE,
        label: "Old",
      });
      const closedRmi = await seedRoundMenuItem(db, { roundId: closed!.id, menuItemId: s.item.id });
      await seedSubmission(db, {
        roundId: closed!.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: closedRmi!.id,
        drinkSizeOptionId: s.options[0]!.id,
      }); // closed -> not counted

      const other = await seedSizePreset(db, { name: "Other" });
      let res = await impact(s.drink.id, `?sizePresetId=${other.preset.id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ affectedSubmissions: 1 });

      res = await impact(s.drink.id, "?sizePresetId=null");
      expect(await res.json()).toEqual({ affectedSubmissions: 1 });

      res = await impact(s.drink.id, `?sizePresetId=${s.preset.id}`);
      expect(await res.json()).toEqual({ affectedSubmissions: 0 });
    });

    it("404s for an unknown restaurant and 400s for a bad sizePresetId", async () => {
      const s = await setup();
      expect((await impact(999999, "?sizePresetId=null")).status).toBe(404);
      const bad = await impact(s.drink.id, "?sizePresetId=abc");
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: ERROR_MESSAGES.sizePresetIdInvalid });
      expect((await impact(s.drink.id, "")).status).toBe(400);
    });
  });

  describe("response shapes", () => {
    it("public round exposes ordered sizes on drink items, without price", async () => {
      const s = await setup();
      const res = await send("GET", `/api/rounds/${s.round.id}/public`);
      const body = (await res.json()) as {
        drinkItems: { id: number; name: string; sizes: { id: number; label: string }[] }[];
      };
      expect(body.drinkItems[0]!.sizes).toEqual(
        s.options.map((o) => ({ id: o.id, label: o.label })),
      );
      expect(body.drinkItems[0]).not.toHaveProperty("price");
    });

    it("public drink item with no ticked sizes gets an empty list", async () => {
      const s = await setup();
      const bare = await seedMenuItem(db, { restaurantId: s.drink.id, name: "Water" });
      await seedRoundMenuItem(db, { roundId: s.round.id, menuItemId: bare!.id });
      const res = await send("GET", `/api/rounds/${s.round.id}/public`);
      const body = (await res.json()) as { drinkItems: { name: string; sizes: unknown[] }[] };
      expect(body.drinkItems.find((i) => i.name === "Water")!.sizes).toEqual([]);
    });

    it("submissions list rows carry drinkSizeOptionId and drinkSize label", async () => {
      const s = await setup();
      const e2 = await seedEmployee(db, { fullName: "Bob" });
      await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: s.employee.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
        drinkSizeOptionId: s.options[2]!.id,
      });
      await seedSubmission(db, {
        roundId: s.round.id,
        employeeId: e2!.id,
        foodRoundMenuItemId: null,
        drinkRoundMenuItemId: s.rmi.id,
      });
      const res = await send("GET", `/api/rounds/${s.round.id}/submissions`);
      const rows = (await res.json()) as {
        drinkSizeOptionId: number | null;
        drinkSize: string | null;
      }[];
      expect(rows[0]).toMatchObject({ drinkSizeOptionId: s.options[2]!.id, drinkSize: "L" });
      expect(rows[1]).toMatchObject({ drinkSizeOptionId: null, drinkSize: null });
    });
  });
});
