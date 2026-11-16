import { Hono } from "hono";
import type { Bindings } from "../../bindings";
import { respond } from "../../lib/controller";
import { verifyPassword } from "./service";

export const adminRoute = new Hono<{ Bindings: Bindings }>();

adminRoute.post("/verify-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = verifyPassword(body.password, c.env.ADMIN_PASSWORD);
  // The success body is `{ ok: true }`, which `respond` would strip down to `{}`.
  return result.ok ? c.json({ ok: true }, 200) : respond(c, result);
});
