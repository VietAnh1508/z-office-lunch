import type { DbOrTx } from "../../lib/db-types";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";
import * as repo from "./repository";
import type { Employee } from "./repository";

type EmployeeResult = Result<Employee, 404>;

const notFound = () => fail(ERROR_MESSAGES.employeeNotFound, 404);

export async function createEmployee(db: DbOrTx, fullName: string): Promise<EmployeeResult> {
  return ok(await repo.insert(db, fullName));
}

export async function listEmployees(
  db: DbOrTx,
  opts: { activeOnly: boolean },
): Promise<Employee[]> {
  return repo.list(db, opts);
}

export async function getEmployee(db: DbOrTx, id: number): Promise<EmployeeResult> {
  const row = await repo.findById(db, id);
  return row ? ok(row) : notFound();
}

export async function toggleActive(db: DbOrTx, id: number): Promise<EmployeeResult> {
  const existing = await repo.findById(db, id);
  if (!existing) return notFound();
  const row = await repo.setActive(db, id, !existing.active);
  return row ? ok(row) : notFound();
}

export async function renameEmployee(
  db: DbOrTx,
  id: number,
  fullName: string,
): Promise<EmployeeResult> {
  const existing = await repo.findById(db, id);
  if (!existing) return notFound();
  const row = await repo.setName(db, id, fullName);
  return row ? ok(row) : notFound();
}
