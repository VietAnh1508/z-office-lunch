import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";

// Check order matters: a bad request (400) wins over a misconfigured server (500).
export function verifyPassword(
  submitted: unknown,
  adminPassword: string | undefined,
): Result<object, number> {
  if (typeof submitted !== "string") {
    return fail(ERROR_MESSAGES.passwordRequired);
  }
  if (!adminPassword) {
    console.error(JSON.stringify({ message: "ADMIN_PASSWORD is not configured" }));
    return fail(ERROR_MESSAGES.internal, 500);
  }
  if (submitted !== adminPassword) {
    return fail(ERROR_MESSAGES.adminPasswordIncorrect, 401);
  }
  return ok();
}
