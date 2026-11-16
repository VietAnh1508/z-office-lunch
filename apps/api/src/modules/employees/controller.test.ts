import { employees } from "db";
import { seedEmployee } from "db/testing";
import { describe, expect, it } from "vitest";
import { expectStructured500 } from "../../test/assertions";
import { useTestDb } from "../../test/db";
import { unreachableEnv } from "../../test/env";
import { get, patch, post } from "../../test/request";

type Employee = typeof employees.$inferSelect;

describe("employees routes", () => {
  const db = useTestDb();

  it("POST without fullName returns 400", async () => {
    const res = await post("/api/employees", {});

    expect(res.status).toBe(400);
  });

  it("valid POST persists a row defaulting active to true and is retrievable via GET", async () => {
    const postRes = await post("/api/employees", { fullName: "Jane Doe" });

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Employee;
    expect(created.fullName).toBe("Jane Doe");
    expect(created.active).toBe(true);

    const getRes = await get("/api/employees");
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Employee[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe("Jane Doe");
  });

  it("GET without ?active filters returns all employees; ?active=true excludes deactivated ones", async () => {
    await seedEmployee(db, { fullName: "Active Person", active: true });
    await seedEmployee(db, { fullName: "Inactive Person", active: false });

    const allRes = await get("/api/employees");
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as Employee[];
    expect(all).toHaveLength(2);

    const activeRes = await get("/api/employees?active=true");
    expect(activeRes.status).toBe(200);
    const active = (await activeRes.json()) as Employee[];
    expect(active).toHaveLength(1);
    expect(active[0]?.fullName).toBe("Active Person");
  });

  it("PATCH toggles active and is reflected in a subsequent GET", async () => {
    const employee = await seedEmployee(db, { fullName: "Jane Doe", active: true });

    const patchRes = await patch(`/api/employees/${employee!.id}`);
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as Employee;
    expect(patched.active).toBe(false);

    const getRes = await get("/api/employees");
    const rows = (await getRes.json()) as Employee[];
    expect(rows[0]?.active).toBe(false);
  });

  it("PATCH on a nonexistent employee returns 404", async () => {
    const res = await patch("/api/employees/999999");

    expect(res.status).toBe(404);
  });

  it("a deactivated employee is excluded from ?active=true but still resolvable by id", async () => {
    const employee = await seedEmployee(db, { fullName: "Jane Doe", active: false });

    const getRes = await get(`/api/employees/${employee!.id}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Employee;
    expect(fetched.fullName).toBe("Jane Doe");
    expect(fetched.active).toBe(false);
  });

  it("GET /:id for a nonexistent employee returns 404", async () => {
    const res = await get("/api/employees/999999");

    expect(res.status).toBe(404);
  });

  it("GET /:id and PATCH /:id with a non-integer id return 404 employeeNotFound", async () => {
    for (const res of [await get("/api/employees/abc"), await patch("/api/employees/abc")]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "employee not found" });
    }
  });

  it("returns a structured 500 when the database is unreachable", async () => {
    await expectStructured500(await post("/api/employees", { fullName: "Jane" }, unreachableEnv));
    await expectStructured500(await get("/api/employees", unreachableEnv));
    await expectStructured500(await get("/api/employees/1", unreachableEnv));
    await expectStructured500(await patch("/api/employees/1", undefined, unreachableEnv));
    await expectStructured500(
      await patch("/api/employees/1/name", { fullName: "Jane" }, unreachableEnv),
    );
  });

  describe("PATCH /:id/name", () => {
    it("updates fullName and leaves active unchanged", async () => {
      const employee = await seedEmployee(db, { fullName: "Jane Doe", active: false });

      const res = await patch(`/api/employees/${employee!.id}/name`, { fullName: "Jane Smith" });

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Employee;
      expect(updated.fullName).toBe("Jane Smith");
      expect(updated.active).toBe(false);

      const getRes = await get(`/api/employees/${employee!.id}`);
      const fetched = (await getRes.json()) as Employee;
      expect(fetched.fullName).toBe("Jane Smith");
    });

    it("trims fullName before saving", async () => {
      const employee = await seedEmployee(db, { fullName: "Jane Doe" });

      const res = await patch(`/api/employees/${employee!.id}/name`, {
        fullName: "  Jane Smith  ",
      });

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Employee;
      expect(updated.fullName).toBe("Jane Smith");
    });

    it("missing fullName returns 400 fullNameRequired and leaves the row unchanged", async () => {
      const employee = await seedEmployee(db, { fullName: "Jane Doe" });

      const res = await patch(`/api/employees/${employee!.id}/name`, {});

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("fullName is required");

      const getRes = await get(`/api/employees/${employee!.id}`);
      const fetched = (await getRes.json()) as Employee;
      expect(fetched.fullName).toBe("Jane Doe");
    });

    it("blank/whitespace-only fullName returns 400 fullNameRequired", async () => {
      const employee = await seedEmployee(db, { fullName: "Jane Doe" });

      const res = await patch(`/api/employees/${employee!.id}/name`, { fullName: "   " });

      expect(res.status).toBe(400);
    });

    it("nonexistent id returns 404 employeeNotFound", async () => {
      const res = await patch("/api/employees/999999/name", { fullName: "Jane Smith" });

      expect(res.status).toBe(404);
    });

    it("non-integer id returns 404 employeeNotFound", async () => {
      const res = await patch("/api/employees/not-a-number/name", { fullName: "Jane Smith" });

      expect(res.status).toBe(404);
    });
  });
});
