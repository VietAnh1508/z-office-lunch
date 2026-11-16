import { createDb } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach } from "vitest";

// Call at file or describe scope. Returns the shared db for seeding/asserting.
export function useTestDb() {
  const db = createDb(TEST_DATABASE_URL);
  beforeEach(async () => {
    await truncateAll(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });
  return db;
}
