import { eq } from "drizzle-orm";
import { employees } from "db";
import type { DbOrTx } from "../../lib/db-types";

export type Employee = typeof employees.$inferSelect;

export async function findById(db: DbOrTx, id: number): Promise<Employee | undefined> {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  return row;
}

export async function list(
  db: DbOrTx,
  { activeOnly }: { activeOnly: boolean },
): Promise<Employee[]> {
  const query = db.select().from(employees);
  return activeOnly
    ? query.where(eq(employees.active, true)).orderBy(employees.fullName)
    : query.orderBy(employees.fullName);
}

export async function insert(db: DbOrTx, fullName: string): Promise<Employee> {
  const [row] = await db.insert(employees).values({ fullName }).returning();
  return row!;
}

export async function setActive(
  db: DbOrTx,
  id: number,
  active: boolean,
): Promise<Employee | undefined> {
  const [row] = await db.update(employees).set({ active }).where(eq(employees.id, id)).returning();
  return row;
}

export async function setName(
  db: DbOrTx,
  id: number,
  fullName: string,
): Promise<Employee | undefined> {
  const [row] = await db
    .update(employees)
    .set({ fullName })
    .where(eq(employees.id, id))
    .returning();
  return row;
}
