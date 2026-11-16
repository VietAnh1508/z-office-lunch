import type { Result } from "../../lib/result";

export function verifyPassword(
  _submitted: unknown,
  _adminPassword: string | undefined,
): Result<object, number> {
  throw new Error("not implemented");
}
