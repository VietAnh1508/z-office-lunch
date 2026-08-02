import { createDb } from "../packages/db/src/index";
import { runMigrations } from "../packages/db/src/migrate";
import { ensureTestDatabase, TEST_DATABASE_URL, truncateAll } from "../packages/db/src/testing";

export default async function globalSetup() {
  await ensureTestDatabase();
  await runMigrations(TEST_DATABASE_URL);

  const db = createDb(TEST_DATABASE_URL);
  await truncateAll(db);
  await db.$client.end();
}
