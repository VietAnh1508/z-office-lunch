import { describe, expect, it } from "vitest";
import { api } from "../lib/api";

describe("api.get", () => {
  it("fetches from a relative URL", async () => {
    const result = await api.get<{ ok: boolean }>("/smoke");
    expect(result).toEqual({ ok: true });
  });
});
