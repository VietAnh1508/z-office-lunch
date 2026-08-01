import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/office_lunch";

const db = drizzle(connectionString);

await migrate(db, { migrationsFolder: "./migrations" });

console.log("Migrations applied.");
process.exit(0);
