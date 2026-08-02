import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "./index";
import { restaurants } from "./schema";
import { seedRestaurant, TEST_DATABASE_URL, truncateAll } from "./testing";

const db = createDb(TEST_DATABASE_URL);

describe("testing harness", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("truncateAll then seedRestaurant then a plain select confirms one row", async () => {
    await seedRestaurant(db, { name: "Pho 24" });

    const rows = await db.select().from(restaurants);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Pho 24");
  });
});
