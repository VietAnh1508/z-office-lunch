import { describe, expect, it } from "vitest";
import { verifyPassword } from "./service";

describe("verifyPassword", () => {
  it("succeeds when the submitted password matches", () => {
    expect(verifyPassword("secret", "secret")).toEqual({ ok: true });
  });

  it("fails 401 on a wrong password", () => {
    expect(verifyPassword("nope", "secret")).toEqual({
      ok: false,
      error: "incorrect password",
      status: 401,
    });
  });

  it.each([undefined, null, 123, {}])("fails 400 when the password is %j", (submitted) => {
    const result = verifyPassword(submitted, "secret");
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("checks the submitted value before the server config (400 beats 500)", () => {
    expect(verifyPassword(undefined, undefined)).toMatchObject({ ok: false, status: 400 });
  });

  it.each(["", undefined])("fails 500 when ADMIN_PASSWORD is %j", (configured) => {
    expect(verifyPassword("anything", configured)).toEqual({
      ok: false,
      error: "internal error",
      status: 500,
    });
  });
});
