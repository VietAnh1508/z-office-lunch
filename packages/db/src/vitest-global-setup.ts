import { runMigrations } from "./migrate";
import { ensureTestDatabase, TEST_DATABASE_URL } from "./testing";

export default async function setup() {
  await ensureTestDatabase();
  await runMigrations(TEST_DATABASE_URL);
}
