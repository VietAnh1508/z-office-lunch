import { describe, expect, it } from "vitest";
import { restaurants } from "db";
import { seedRestaurant } from "db/testing";
import { expectStructured500 } from "./assertions";
import { unreachableEnv } from "./env";
import { get, request } from "./request";
import { useTestDb } from "./db";

describe("test helpers", () => {
  const db = useTestDb();

  it("useTestDb truncates between tests (1/2)", async () => {
    await seedRestaurant(db);
    expect(await db.select().from(restaurants)).toHaveLength(1);
  });

  it("useTestDb truncates between tests (2/2)", async () => {
    expect(await db.select().from(restaurants)).toHaveLength(0);
  });

  it("request sends JSON and get hits the app", async () => {
    const res = await request("POST", "/api/restaurants", { name: "A", type: "food" });
    expect(res.status).toBe(201);
    expect((await get("/api/restaurants")).status).toBe(200);
  });

  it("expectStructured500 accepts an unreachable-db response", async () => {
    await expectStructured500(await get("/api/restaurants", unreachableEnv));
  });
});
