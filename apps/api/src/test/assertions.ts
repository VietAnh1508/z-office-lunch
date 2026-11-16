import { expect } from "vitest";
import { ERROR_MESSAGES } from "../lib/errors";

export async function expectStructured500(res: Response) {
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: ERROR_MESSAGES.internal });
}
