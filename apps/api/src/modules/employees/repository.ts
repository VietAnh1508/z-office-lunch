import { employees } from "db";
import type { DbOrTx } from "../../lib/db-types";

export type Employee = typeof employees.$inferSelect;

export async function findById(_db: DbOrTx, _id: number): Promise<Employee | undefined> {
  throw new Error("not implemented");
}

export async function list(_db: DbOrTx, _opts: { activeOnly: boolean }): Promise<Employee[]> {
  throw new Error("not implemented");
}

export async function insert(_db: DbOrTx, _fullName: string): Promise<Employee> {
  throw new Error("not implemented");
}

export async function setActive(
  _db: DbOrTx,
  _id: number,
  _active: boolean,
): Promise<Employee | undefined> {
  throw new Error("not implemented");
}

export async function setName(
  _db: DbOrTx,
  _id: number,
  _fullName: string,
): Promise<Employee | undefined> {
  throw new Error("not implemented");
}
