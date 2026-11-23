import { Hono } from "hono";
import type { Bindings } from "../../bindings";
import { parseId, respond, trimmed, withDb } from "../../lib/controller";
import { ERROR_MESSAGES } from "../../lib/errors";
import { fail } from "../../lib/result";
import {
  createEmployee,
  getEmployee,
  listEmployees,
  renameEmployee,
  toggleActive,
} from "./service";

export const employeesRoute = new Hono<{ Bindings: Bindings }>();

function parseFullName(body: unknown): string {
  return trimmed((body as Record<string, unknown>)?.fullName);
}

const notFound = () => fail(ERROR_MESSAGES.employeeNotFound, 404);
const nameRequired = () => fail(ERROR_MESSAGES.fullNameRequired);

employeesRoute.post("/", async (c) => {
  const fullName = parseFullName(await c.req.json().catch(() => ({})));
  if (!fullName) return respond(c, nameRequired());

  return withDb(c, "create employee", async (db) =>
    respond(c, await createEmployee(db, fullName), 201),
  );
});

employeesRoute.get("/", async (c) => {
  const activeOnly = c.req.query("active") === "true";

  return withDb(c, "list employees", async (db) => c.json(await listEmployees(db, { activeOnly })));
});

employeesRoute.get("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return respond(c, notFound());

  return withDb(c, "fetch employee", async (db) => respond(c, await getEmployee(db, id)));
});

employeesRoute.patch("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return respond(c, notFound());

  return withDb(c, "toggle employee", async (db) => respond(c, await toggleActive(db, id)));
});

employeesRoute.patch("/:id/name", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return respond(c, notFound());

  const fullName = parseFullName(await c.req.json().catch(() => ({})));
  if (!fullName) return respond(c, nameRequired());

  return withDb(c, "update employee name", async (db) =>
    respond(c, await renameEmployee(db, id, fullName)),
  );
});
