import { eq } from "drizzle-orm";
import { employees } from "db";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { ERROR_MESSAGES } from "../lib/errors";
import { getDb } from "../lib/get-db";

export const employeesRoute = new Hono<{ Bindings: Bindings }>();

function parseFullName(body: unknown): string {
  const raw = (body as Record<string, unknown>)?.fullName;
  return typeof raw === "string" ? raw.trim() : "";
}

employeesRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const fullName = parseFullName(body);
  if (!fullName) {
    return c.json({ error: ERROR_MESSAGES.fullNameRequired }, 400);
  }

  const db = getDb(c);
  try {
    const [row] = await db.insert(employees).values({ fullName }).returning();
    return c.json(row, 201);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to create employee", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

employeesRoute.get("/", async (c) => {
  const activeOnly = c.req.query("active") === "true";

  const db = getDb(c);
  try {
    const rows = activeOnly
      ? await db.select().from(employees).where(eq(employees.active, true)).orderBy(employees.id)
      : await db.select().from(employees).orderBy(employees.id);
    return c.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to list employees", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

employeesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [row] = await db.select().from(employees).where(eq(employees.id, id));
    if (!row) {
      return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
    }
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to fetch employee", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

employeesRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
  }

  const db = getDb(c);
  try {
    const [existing] = await db.select().from(employees).where(eq(employees.id, id));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
    }

    const [row] = await db
      .update(employees)
      .set({ active: !existing.active })
      .where(eq(employees.id, id))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to toggle employee", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});

employeesRoute.patch("/:id/name", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const fullName = parseFullName(body);
  if (!fullName) {
    return c.json({ error: ERROR_MESSAGES.fullNameRequired }, 400);
  }

  const db = getDb(c);
  try {
    const [existing] = await db.select().from(employees).where(eq(employees.id, id));
    if (!existing) {
      return c.json({ error: ERROR_MESSAGES.employeeNotFound }, 404);
    }

    const [row] = await db
      .update(employees)
      .set({ fullName })
      .where(eq(employees.id, id))
      .returning();
    return c.json(row);
  } catch (e) {
    console.error(JSON.stringify({ message: "failed to update employee name", error: String(e) }));
    return c.json({ error: ERROR_MESSAGES.internal }, 500);
  } finally {
    await db.$client.end();
  }
});
