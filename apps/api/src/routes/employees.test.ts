import { createDb, employees } from "db";
import { TEST_DATABASE_URL, seedEmployee, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Bindings } from "../bindings";
import app from "../index";

type Employee = typeof employees.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

const testEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: TEST_DATABASE_URL } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;

describe("employees routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("POST without fullName returns 400", async () => {
    const res = await app.request(
      "/api/employees",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("valid POST persists a row defaulting active to true and is retrievable via GET", async () => {
    const postRes = await app.request(
      "/api/employees",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Jane Doe" }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Employee;
    expect(created.fullName).toBe("Jane Doe");
    expect(created.active).toBe(true);

    const getRes = await app.request("/api/employees", {}, testEnv);
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Employee[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe("Jane Doe");
  });

  it("GET without ?active filters returns all employees; ?active=true excludes deactivated ones", async () => {
    await seedEmployee(db, { fullName: "Active Person", active: true });
    await seedEmployee(db, { fullName: "Inactive Person", active: false });

    const allRes = await app.request("/api/employees", {}, testEnv);
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as Employee[];
    expect(all).toHaveLength(2);

    const activeRes = await app.request("/api/employees?active=true", {}, testEnv);
    expect(activeRes.status).toBe(200);
    const active = (await activeRes.json()) as Employee[];
    expect(active).toHaveLength(1);
    expect(active[0]?.fullName).toBe("Active Person");
  });

  it("PATCH toggles active and is reflected in a subsequent GET", async () => {
    const employee = await seedEmployee(db, { fullName: "Jane Doe", active: true });

    const patchRes = await app.request(
      `/api/employees/${employee!.id}`,
      { method: "PATCH" },
      testEnv,
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as Employee;
    expect(patched.active).toBe(false);

    const getRes = await app.request("/api/employees", {}, testEnv);
    const rows = (await getRes.json()) as Employee[];
    expect(rows[0]?.active).toBe(false);
  });

  it("PATCH on a nonexistent employee returns 404", async () => {
    const res = await app.request("/api/employees/999999", { method: "PATCH" }, testEnv);

    expect(res.status).toBe(404);
  });

  it("a deactivated employee is excluded from ?active=true but still resolvable by id", async () => {
    const employee = await seedEmployee(db, { fullName: "Jane Doe", active: false });

    const getRes = await app.request(`/api/employees/${employee!.id}`, {}, testEnv);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Employee;
    expect(fetched.fullName).toBe("Jane Doe");
    expect(fetched.active).toBe(false);
  });

  it("GET /:id for a nonexistent employee returns 404", async () => {
    const res = await app.request("/api/employees/999999", {}, testEnv);

    expect(res.status).toBe(404);
  });
});
