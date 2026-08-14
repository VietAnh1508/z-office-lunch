import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/office_lunch_test";

const testDbUrl = new URL(TEST_DATABASE_URL);
const testDbName = testDbUrl.pathname.replace(/^\//, "");
const adminDbUrl = new URL(TEST_DATABASE_URL);
adminDbUrl.pathname = "/postgres";

/**
 * Creates the test database if it doesn't exist yet. Postgres's
 * docker-entrypoint-initdb.d scripts only run against a fresh volume, so this
 * covers already-initialized dev machines too.
 */
export async function ensureTestDatabase() {
  const client = new pg.Client({ connectionString: adminDbUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      testDbName,
    ]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${testDbName}"`);
    }
  } finally {
    await client.end();
  }
}

export async function truncateAll(db: Db) {
  await db.execute(
    sql`TRUNCATE TABLE submissions, round_menu_items, rounds, employees, menu_items, restaurants RESTART IDENTITY CASCADE`,
  );
}

export async function seedRestaurant(
  db: Db,
  overrides: Partial<typeof schema.restaurants.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.restaurants)
    .values({ name: "Test Restaurant", type: "food", ...overrides })
    .returning();
  return row;
}

export async function seedMenuItem(
  db: Db,
  overrides: Partial<typeof schema.menuItems.$inferInsert> & { restaurantId: number },
) {
  const [row] = await db
    .insert(schema.menuItems)
    .values({ name: "Test Item", ...overrides })
    .returning();
  return row;
}

export async function seedEmployee(
  db: Db,
  overrides: Partial<typeof schema.employees.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.employees)
    .values({ fullName: "Test Employee", ...overrides })
    .returning();
  return row;
}

export async function seedRound(
  db: Db,
  overrides: Partial<typeof schema.rounds.$inferInsert> & { foodRestaurantId: number },
) {
  const [row] = await db
    .insert(schema.rounds)
    .values({ label: "Test Round", deadline: new Date(), ...overrides })
    .returning();
  return row;
}

export async function seedRoundMenuItem(
  db: Db,
  overrides: Partial<typeof schema.roundMenuItems.$inferInsert> & {
    roundId: number;
    menuItemId: number;
  },
) {
  const [row] = await db
    .insert(schema.roundMenuItems)
    .values({ ...overrides })
    .returning();
  return row;
}

export async function seedSubmission(
  db: Db,
  overrides: Partial<typeof schema.submissions.$inferInsert> & {
    roundId: number;
    employeeId: number;
    foodRoundMenuItemId: number;
  },
) {
  const [row] = await db
    .insert(schema.submissions)
    .values({ ...overrides })
    .returning();
  return row;
}
