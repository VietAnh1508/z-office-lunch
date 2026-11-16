import type { Context } from "hono";
import type { Bindings } from "../bindings";
import type { Db } from "./db-types";
import type { Result } from "./result";

type Ctx = Context<{ Bindings: Bindings }>;

// Stubs: behavior arrives in the green commit.
export async function withDb(
  _c: Ctx,
  _label: string,
  _fn: (db: Db) => Promise<Response>,
): Promise<Response> {
  throw new Error("not implemented");
}

export function respond<T extends object>(
  _c: Ctx,
  _result: Result<T, number>,
  _okStatus?: number,
): Response {
  throw new Error("not implemented");
}
