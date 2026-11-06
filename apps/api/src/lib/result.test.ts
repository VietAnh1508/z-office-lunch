import { describe, expect, it } from "vitest";
import { fail, ok, type Result } from "./result";

describe("result helpers", () => {
  it("ok spreads the payload next to ok: true", () => {
    expect(ok({ name: "a", count: 2 })).toEqual({ ok: true, name: "a", count: 2 });
  });

  it("ok with no payload is just { ok: true }", () => {
    expect(ok()).toEqual({ ok: true });
  });

  it("fail defaults to status 400", () => {
    expect(fail("bad")).toEqual({ ok: false, error: "bad", status: 400 });
  });

  it("fail carries a custom status", () => {
    expect(fail("missing", 404)).toEqual({ ok: false, error: "missing", status: 404 });
  });

  it("narrows on ok", () => {
    const parse = (n: number): Result<{ value: number }, 400 | 404> =>
      n > 0 ? ok({ value: n }) : n === 0 ? fail("zero", 404) : fail("negative");

    const good = parse(3);
    if (!good.ok) throw new Error("expected ok");
    const value: number = good.value;
    expect(value).toBe(3);

    const bad = parse(-1);
    if (bad.ok) throw new Error("expected failure");
    const status: 400 | 404 = bad.status;
    expect(status).toBe(400);
    expect(bad.error).toBe("negative");
  });
});
