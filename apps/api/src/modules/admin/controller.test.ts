import { describe, expect, it } from "vitest";
import { testEnv } from "../../test/env";
import { post } from "../../test/request";
import app from "../../index";

describe("admin routes", () => {
  it("POST /api/admin/verify-password with the correct password returns 200 { ok: true }", async () => {
    const res = await post("/api/admin/verify-password", { password: "test-admin-password" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("POST /api/admin/verify-password with the wrong password returns 401", async () => {
    const res = await post("/api/admin/verify-password", { password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "incorrect password" });
  });

  it("POST /api/admin/verify-password with a missing password returns 400", async () => {
    const res = await post("/api/admin/verify-password", {});

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/verify-password with a malformed JSON body returns 400", async () => {
    // Raw body on purpose: the helpers always JSON-encode.
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
    const res = await post(
      "/api/admin/verify-password",
      { password: "anything" },
      { ...testEnv, ADMIN_PASSWORD: "" },
    );

    expect(res.status).toBe(500);
  });
});
