import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api } from "@/lib/api";
import { server } from "./mocks/server";

describe("api.get", () => {
  it("fetches from a relative URL", async () => {
    server.use(
      http.get("/api/smoke", () => HttpResponse.json({ ok: true })),
    );

    const result = await api.get<{ ok: boolean }>("/smoke");
    expect(result).toEqual({ ok: true });
  });
});
