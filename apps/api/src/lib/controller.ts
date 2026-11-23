import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Bindings } from "../bindings";
import type { Db } from "./db-types";
import { ERROR_MESSAGES } from "./errors";
import { getDb } from "./get-db";
import type { Result } from "./result";

type Ctx = Context<{ Bindings: Bindings }>;

// Owns the DB lifecycle for a handler: open, run, log + structured 500 on throw,
// and always await end() (never waitUntil — see .claude/rules/api-error-handling.md).
export async function withDb(
  c: Ctx,
  label: string,
  fn: (db: Db) => Promise<Response>,
): Promise<Response> {
  const db = getDb(c);
  try {
    return await fn(db);
  } catch (e) {
    console.error(JSON.stringify({ message: `failed to ${label}`, error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
}

// Maps a Result to a JSON response: failure -> { error } + its status, success -> payload.
export function respond<T extends object>(
  c: Ctx,
  result: Result<T, number>,
  okStatus: ContentfulStatusCode = 200,
): Response {
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as ContentfulStatusCode);
  }
  const { ok: _ok, ...data } = result;
  return c.json(data, okStatus);
}

// A non-integer id can never match a row, so callers map null to 404 rather than 400.
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}
