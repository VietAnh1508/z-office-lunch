import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { restaurants, sizeOptions, sizePresets } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";
import { addOptionToRestaurants } from "../lib/menu-item-sizes";
import { fail, ok, type Result } from "../lib/result";

type Db = ReturnType<typeof getDb>;

type OptionInput = { id?: number; label: string };

type ParsedPreset = Result<{ name: string; options: OptionInput[] }>;

function parseName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function parseLabel(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// `entries` is already shaped as { id?, label } — POST maps plain strings into this first.
function validatePreset(rawName: unknown, entries: unknown): ParsedPreset {
  const name = parseName(rawName);
  if (!name) {
    return fail(ERROR_MESSAGES.nameRequired);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return fail(ERROR_MESSAGES.sizeOptionsRequired);
  }
  const options: OptionInput[] = [];
  for (const entry of entries) {
    const label = parseLabel(entry?.label);
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

async function loadPreset(db: Db, id: number) {
  const [preset] = await db.select().from(sizePresets).where(eq(sizePresets.id, id));
  if (!preset) {
    return null;
  }
  const options = await db
    .select({ id: sizeOptions.id, label: sizeOptions.label, sortOrder: sizeOptions.sortOrder })
    .from(sizeOptions)
    .where(eq(sizeOptions.presetId, id))
    .orderBy(asc(sizeOptions.sortOrder));
  return { id: preset.id, name: preset.name, options };
}

export const sizePresetsRoute = new Hono<{ Bindings: Bindings }>();

sizePresetsRoute.get("/", async (c) => {
  const db = getDb(c);
  try {
    const presets = await db.select().from(sizePresets).orderBy(asc(sizePresets.name));
    const options = await db
      .select()
      .from(sizeOptions)
      .orderBy(asc(sizeOptions.sortOrder), asc(sizeOptions.id));
    return c.json(
      presets.map((p) => ({
        id: p.id,
        name: p.name,
        options: options
          .filter((o) => o.presetId === p.id)
          .map((o) => ({ id: o.id, label: o.label, sortOrder: o.sortOrder })),
      })),
    );
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list size presets", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

sizePresetsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const entries = Array.isArray(body.options)
    ? body.options.map((label: unknown) => ({ label }))
    : body.options;
  const parsed = validatePreset(body.name, entries);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, parsed.status);
  }

  const db = getDb(c);
  try {
    const [taken] = await db
      .select({ id: sizePresets.id })
      .from(sizePresets)
      .where(eq(sizePresets.name, parsed.name));
    if (taken) {
      return c.json({ error: ERROR_MESSAGES.sizePresetNameTaken }, 409);
    }

    const id = await db.transaction(async (tx) => {
      const [preset] = await tx.insert(sizePresets).values({ name: parsed.name }).returning();
      await tx.insert(sizeOptions).values(
        parsed.options.map((o, sortOrder) => ({
          presetId: preset!.id,
          label: o.label,
          sortOrder,
        })),
      );
      return preset!.id;
    });
    return c.json(await loadPreset(db, id), 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create size preset", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

sizePresetsRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.sizePresetNotFound }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = validatePreset(body.name, body.options);

  const db = getDb(c);
  try {
    const existing = await loadPreset(db, id);
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.sizePresetNotFound }, 404);
    }
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }

    const ownIds = new Set(existing.options.map((o) => o.id));
    const keptIds = parsed.options.flatMap((o) => (o.id === undefined ? [] : [o.id]));
    if (keptIds.some((k) => !ownIds.has(k)) || new Set(keptIds).size !== keptIds.length) {
      return c.json({ error: ERROR_MESSAGES.sizeOptionInvalid }, 400);
    }

    const [taken] = await db
      .select({ id: sizePresets.id })
      .from(sizePresets)
      .where(and(eq(sizePresets.name, parsed.name), ne(sizePresets.id, id)));
    if (taken) {
      return c.json({ error: ERROR_MESSAGES.sizePresetNameTaken }, 409);
    }

    await db.transaction(async (tx) => {
      await tx.update(sizePresets).set({ name: parsed.name }).where(eq(sizePresets.id, id));

      const removedIds = [...ownIds].filter((k) => !keptIds.includes(k));
      if (removedIds.length > 0) {
        await tx.delete(sizeOptions).where(inArray(sizeOptions.id, removedIds));
      }
      // Park kept options on throwaway labels first so swapping/renaming labels
      // can't trip the (preset, label) unique constraint mid-update.
      for (const keptId of keptIds) {
        await tx
          .update(sizeOptions)
          .set({ label: `__tmp__${keptId}` })
          .where(eq(sizeOptions.id, keptId));
      }
      for (const [sortOrder, o] of parsed.options.entries()) {
        if (o.id === undefined) {
          const [added] = await tx
            .insert(sizeOptions)
            .values({ presetId: id, label: o.label, sortOrder })
            .returning({ id: sizeOptions.id });
          await addOptionToRestaurants(tx, id, added!.id);
        } else {
          await tx
            .update(sizeOptions)
            .set({ label: o.label, sortOrder })
            .where(eq(sizeOptions.id, o.id));
        }
      }
    });
    return c.json(await loadPreset(db, id));
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to update size preset", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

sizePresetsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.sizePresetNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [inUse] = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.sizePresetId, id))
      .limit(1);
    if (inUse) {
      return c.json({ error: ERROR_MESSAGES.sizePresetInUse }, 409);
    }
    const [row] = await db
      .delete(sizePresets)
      .where(eq(sizePresets.id, id))
      .returning({ id: sizePresets.id });
    if (!row) {
      return c.json({ error: ERROR_MESSAGES.sizePresetNotFound }, 404);
    }
    return c.json({ id: row.id });
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to delete size preset", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
