import type { DbOrTx } from "../../lib/db-types";
import type { Result } from "../../lib/result";
import type { Employee } from "./repository";

type EmployeeResult = Result<Employee, 404>;

export async function createEmployee(_db: DbOrTx, _fullName: string): Promise<EmployeeResult> {
  throw new Error("not implemented");
}

export async function listEmployees(
  _db: DbOrTx,
  _opts: { activeOnly: boolean },
): Promise<Employee[]> {
  throw new Error("not implemented");
}

export async function getEmployee(_db: DbOrTx, _id: number): Promise<EmployeeResult> {
  throw new Error("not implemented");
}

export async function toggleActive(_db: DbOrTx, _id: number): Promise<EmployeeResult> {
  throw new Error("not implemented");
}

export async function renameEmployee(
  _db: DbOrTx,
  _id: number,
  _fullName: string,
): Promise<EmployeeResult> {
  throw new Error("not implemented");
}
