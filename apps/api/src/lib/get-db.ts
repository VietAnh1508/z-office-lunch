import { createDb } from "db";
import type { Context } from "hono";
import type { Bindings } from "../bindings";

export function getDb(c: Context<{ Bindings: Bindings }>) {
  return createDb(c.env.HYPERDRIVE.connectionString);
}
