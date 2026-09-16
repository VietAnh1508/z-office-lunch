import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";

export const adminRoute = new Hono<{ Bindings: Bindings }>();

adminRoute.post("/verify-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.password !== "string") {
    return c.json({ error: ERROR_MESSAGES.passwordRequired }, 400);
  }
  if (!c.env.ADMIN_PASSWORD) {
    console.error(JSON.stringify({ message: "ADMIN_PASSWORD is not configured" }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  }
  if (body.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: ERROR_MESSAGES.adminPasswordIncorrect }, 401);
  }
  return c.json({ ok: true }, 200);
});
