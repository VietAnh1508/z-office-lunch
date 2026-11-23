import { Hono } from "hono";
import type { Bindings } from "../../bindings";
import { parseId, respond, withDb } from "../../lib/controller";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail } from "../../lib/result";
import { createPreset, deletePreset, listPresets, updatePreset } from "./service";

export const sizePresetsRoute = new Hono<{ Bindings: Bindings }>();

const notFound = () => fail(ERROR_MESSAGES.sizePresetNotFound, 404);

sizePresetsRoute.get("/", (c) =>
  withDb(c, "list size presets", async (db) => c.json(await listPresets(db))),
);

sizePresetsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // POST takes plain label strings; the service works on { label } entries.
  const entries = Array.isArray(body.options)
    ? body.options.map((label: unknown) => ({ label }))
    : body.options;

  return withDb(c, "create size preset", async (db) =>
    respond(c, await createPreset(db, body.name, entries), 201),
  );
});

sizePresetsRoute.patch("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return respond(c, notFound());
  const body = await c.req.json().catch(() => ({}));

  return withDb(c, "update size preset", async (db) =>
    respond(c, await updatePreset(db, id, body.name, body.options)),
  );
});

sizePresetsRoute.delete("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return respond(c, notFound());

  return withDb(c, "delete size preset", async (db) => respond(c, await deletePreset(db, id)));
});
