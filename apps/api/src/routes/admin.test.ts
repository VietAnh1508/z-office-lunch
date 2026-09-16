import { describe, expect, it } from "vitest";
import app from "../index";
import { testEnv } from "../test/env";

describe("admin routes", () => {
  it("POST /api/admin/verify-password with the correct password returns 200 { ok: true }", async () => {
    const res = await app.request(
      "/api/admin/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test-admin-password" }),
      },
      testEnv,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("POST /api/admin/verify-password with the wrong password returns 401", async () => {
    const res = await app.request(
      "/api/admin/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong-password" }),
      },
      testEnv,
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "incorrect password" });
  });

  it("POST /api/admin/verify-password with a missing password returns 400", async () => {
    const res = await app.request(
      "/api/admin/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/verify-password with a malformed JSON body returns 400", async () => {
    const res = await app.request(
      "/api/admin/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/verify-password returns 500 when ADMIN_PASSWORD is unset", async () => {
    const res = await app.request(
      "/api/admin/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      },
      { ...testEnv, ADMIN_PASSWORD: "" },
    );

    expect(res.status).toBe(500);
  });
});
