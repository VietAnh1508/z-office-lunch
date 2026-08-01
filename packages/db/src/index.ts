import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export * from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}
