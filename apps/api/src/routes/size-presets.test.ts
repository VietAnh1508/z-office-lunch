import { eq } from "drizzle-orm";
import { createDb, sizeOptions, sizePresets } from "db";
import { TEST_DATABASE_URL, seedSizePreset, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { testEnv, unreachableEnv } from "../test/env";

type Preset = {
  id: number;
  name: string;
  options: { id: number; label: string; sortOrder: number }[];
};

const db = createDb(TEST_DATABASE_URL);

function post(body: unknown, env = testEnv) {
  return app.request(
    "/api/size-presets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

function patch(id: number | string, body: unknown) {
  return app.request(
    `/api/size-presets/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    testEnv,
  );
}

describe("size presets routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("GET /api/size-presets", () => {
    it("returns an empty list when there are none", async () => {
      const res = await app.request("/api/size-presets", {}, testEnv);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("lists presets by name with options by sortOrder", async () => {
      await seedSizePreset(db, { name: "Zeta" });
      const { preset } = await seedSizePreset(db, { name: "Alpha" });

      const res = await app.request("/api/size-presets", {}, testEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Preset[];
      expect(body.map((p) => p.name)).toEqual(["Alpha", "Zeta"]);
      expect(body[0]!.id).toBe(preset.id);
      expect(body[0]!.options.map((o) => [o.label, o.sortOrder])).toEqual([
        ["S", 0],
        ["M", 1],
        ["L", 2],
      ]);
    });

    it("returns 500 JSON when the database is unreachable", async () => {
      const res = await app.request("/api/size-presets", {}, unreachableEnv);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal error" });
    });
  });

  describe("POST /api/size-presets", () => {
    it("creates a preset with ordered, trimmed options", async () => {
      const res = await post({ name: "  Starbucks ", options: ["Tall", " Grande", "Venti"] });
      expect(res.status).toBe(201);
      const body = (await res.json()) as Preset;
      expect(body.name).toBe("Starbucks");
      expect(body.options.map((o) => [o.label, o.sortOrder])).toEqual([
        ["Tall", 0],
        ["Grande", 1],
        ["Venti", 2],
      ]);
    });

    it("400 nameRequired for an empty name", async () => {
      const res = await post({ name: "   ", options: ["S"] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "name is required" });
    });

    it("400 sizeOptionsRequired for a missing or empty list", async () => {
      for (const options of [undefined, []]) {
        const res = await post({ name: "X", options });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "at least one size option is required" });
      }
    });

    it("400 sizeOptionsRequired for an empty label", async () => {
      const res = await post({ name: "X", options: ["S", "  "] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "at least one size option is required" });
    });

    it("400 sizeOptionsDuplicate for duplicate trimmed labels, case-sensitive", async () => {
      const dup = await post({ name: "X", options: ["S", " S"] });
      expect(dup.status).toBe(400);
      expect(await dup.json()).toEqual({ error: "size option labels must be unique" });

      const ok = await post({ name: "X", options: ["S", "s"] });
      expect(ok.status).toBe(201);
    });

    it("409 sizePresetNameTaken for a duplicate name", async () => {
      await seedSizePreset(db, { name: "Dup" });
      const res = await post({ name: "Dup", options: ["S"] });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "a size preset with this name already exists" });
    });

    it("returns 500 JSON when the database is unreachable", async () => {
      const res = await post({ name: "X", options: ["S"] }, unreachableEnv);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal error" });
    });
  });

  describe("PATCH /api/size-presets/:id", () => {
    it("keeps, renames, adds, removes and reorders options in array order", async () => {
      const { preset, options } = await seedSizePreset(db);
      const [s, m, l] = options;

      const res = await patch(preset.id, {
        name: "Renamed",
        options: [{ id: l!.id, label: "Large" }, { label: "XL" }, { id: s!.id, label: "S" }],
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Preset;
      expect(body.name).toBe("Renamed");
      expect(body.options.map((o) => [o.label, o.sortOrder])).toEqual([
        ["Large", 0],
        ["XL", 1],
        ["S", 2],
      ]);
      expect(body.options[0]!.id).toBe(l!.id);
      expect(body.options[2]!.id).toBe(s!.id);

      const remaining = await db
        .select()
        .from(sizeOptions)
        .where(eq(sizeOptions.presetId, preset.id));
      expect(remaining.map((o) => o.id)).not.toContain(m!.id);
    });

    it("lets options swap labels without tripping the unique constraint", async () => {
      const { preset, options } = await seedSizePreset(db);
      const [s, m] = options;
      const res = await patch(preset.id, {
        name: preset.name,
        options: [
          { id: s!.id, label: "M" },
          { id: m!.id, label: "S" },
        ],
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Preset;
      expect(body.options.map((o) => o.label)).toEqual(["M", "S"]);
    });

    it("400 sizeOptionInvalid for an id from another preset", async () => {
      const { preset } = await seedSizePreset(db);
      const { options: other } = await seedSizePreset(db, { name: "Other" });
      const res = await patch(preset.id, {
        name: "X",
        options: [{ id: other[0]!.id, label: "S" }],
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "size option does not belong to this preset" });
    });

    it("applies the same validations as POST", async () => {
      const { preset } = await seedSizePreset(db);
      const noName = await patch(preset.id, { name: " ", options: [{ label: "S" }] });
      expect(noName.status).toBe(400);
      const empty = await patch(preset.id, { name: "X", options: [] });
      expect(empty.status).toBe(400);
      expect(await empty.json()).toEqual({ error: "at least one size option is required" });
      const dup = await patch(preset.id, { name: "X", options: [{ label: "S" }, { label: "S" }] });
      expect(dup.status).toBe(400);
      expect(await dup.json()).toEqual({ error: "size option labels must be unique" });
    });

    it("409 when renaming to another preset's name", async () => {
      await seedSizePreset(db, { name: "Taken" });
      const { preset } = await seedSizePreset(db, { name: "Mine" });
      const res = await patch(preset.id, { name: "Taken", options: [{ label: "S" }] });
      expect(res.status).toBe(409);
    });

    it("rolls back everything when the transaction fails", async () => {
      await seedSizePreset(db, { name: "Taken" });
      const { preset, options } = await seedSizePreset(db, { name: "Mine" });
      await patch(preset.id, { name: "Taken", options: [{ label: "Only" }] });
      const rows = await db.select().from(sizeOptions).where(eq(sizeOptions.presetId, preset.id));
      expect(rows.map((o) => o.id).sort()).toEqual(options.map((o) => o.id).sort());
    });

    it("404 sizePresetNotFound for a missing or non-numeric id", async () => {
      for (const id of [999999, "abc"]) {
        const res = await patch(id, { name: "X", options: [{ label: "S" }] });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "size preset not found" });
      }
    });
  });

  describe("DELETE /api/size-presets/:id", () => {
    it("deletes the preset and its options", async () => {
      const { preset } = await seedSizePreset(db);
      const res = await app.request(
        `/api/size-presets/${preset.id}`,
        { method: "DELETE" },
        testEnv,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: preset.id });
      expect(await db.select().from(sizePresets)).toHaveLength(0);
      expect(await db.select().from(sizeOptions)).toHaveLength(0);
    });

    it("404 for a missing or non-numeric id", async () => {
      for (const id of [999999, "abc"]) {
        const res = await app.request(`/api/size-presets/${id}`, { method: "DELETE" }, testEnv);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "size preset not found" });
      }
    });
  });
});
