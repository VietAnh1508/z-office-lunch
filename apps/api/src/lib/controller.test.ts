import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../bindings";
import { testEnv, unreachableEnv } from "../test/env";
import { respond, withDb } from "./controller";
import { fail, ok } from "./result";

function appWith(handler: Parameters<Hono<{ Bindings: Bindings }>["get"]>[1]) {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/x", handler);
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe("withDb", () => {
  it("passes a working db to fn and returns its response", async () => {
    const app = appWith((c) =>
      withDb(c, "do x", async (db) => {
        const r = await db.$client.query("select 1 as n");
        return c.json({ n: r.rows[0].n });
      }),
    );
    const res = await app.request("/x", {}, testEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 1 });
  });

  it("ends the db client after fn returns", async () => {
    let end: ReturnType<typeof vi.fn> | undefined;
    const app = appWith((c) =>
      withDb(c, "do x", async (db) => {
        end = vi.spyOn(db.$client, "end");
        return c.json({});
      }),
    );
    await app.request("/x", {}, testEnv);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("logs and returns a structured 500 when fn throws, still ending the client", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let end: ReturnType<typeof vi.fn> | undefined;
    const app = appWith((c) =>
      withDb(c, "do x", async (db) => {
        end = vi.spyOn(db.$client, "end");
        throw new Error("boom");
      }),
    );
    const res = await app.request("/x", {}, testEnv);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    expect(end).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      message: "failed to do x",
      error: "Error: boom",
    });
  });

  it("returns a structured 500 when the db is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = appWith((c) =>
      withDb(c, "do x", (db) => db.$client.query("select 1").then(() => c.json({}))),
    );
    const res = await app.request("/x", {}, unreachableEnv);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
  });
});

describe("respond", () => {
  it("maps a failure to its error body and status", async () => {
    const app = appWith((c) => respond(c, fail("nope", 404)));
    const res = await app.request("/x", {}, testEnv);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nope" });
  });

  it("maps success to the payload without ok, default status 200", async () => {
    const app = appWith((c) => respond(c, ok({ id: 1 })));
    const res = await app.request("/x", {}, testEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
  });

  it("uses the given okStatus", async () => {
    const app = appWith((c) => respond(c, ok({ id: 1 }), 201));
    expect((await app.request("/x", {}, testEnv)).status).toBe(201);
  });
});
