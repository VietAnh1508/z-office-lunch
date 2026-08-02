import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function runMigrations(connectionString: string) {
  const db = drizzle(connectionString);
  await migrate(db, { migrationsFolder });
  await db.$client.end();
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/office_lunch";
  await runMigrations(connectionString);
  console.log("Migrations applied.");
  process.exit(0);
}
