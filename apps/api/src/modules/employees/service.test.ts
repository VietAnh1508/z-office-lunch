import { seedEmployee } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import {
  createEmployee,
  getEmployee,
  listEmployees,
  renameEmployee,
  toggleActive,
} from "./service";

const notFound = { ok: false, error: "employee not found", status: 404 };

describe("employees service", () => {
  const db = useTestDb();

  it("createEmployee returns the new active employee", async () => {
    expect(await createEmployee(db, "Jane Doe")).toMatchObject({
      ok: true,
      fullName: "Jane Doe",
      active: true,
    });
  });

  it("listEmployees honours activeOnly", async () => {
    await seedEmployee(db, { fullName: "On", active: true });
    await seedEmployee(db, { fullName: "Off", active: false });
    expect(await listEmployees(db, { activeOnly: false })).toHaveLength(2);
    expect((await listEmployees(db, { activeOnly: true })).map((r) => r.fullName)).toEqual(["On"]);
  });

  it("getEmployee returns the employee even when inactive, or 404", async () => {
    const e = await seedEmployee(db, { fullName: "Jane", active: false });
    expect(await getEmployee(db, e!.id)).toMatchObject({ ok: true, active: false });
    expect(await getEmployee(db, 999999)).toEqual(notFound);
  });

  it("toggleActive flips the flag in both directions", async () => {
    const e = await seedEmployee(db, { fullName: "Jane", active: true });
    expect(await toggleActive(db, e!.id)).toMatchObject({ ok: true, active: false });
    expect(await toggleActive(db, e!.id)).toMatchObject({ ok: true, active: true });
  });

  it("toggleActive returns 404 for a missing employee", async () => {
    expect(await toggleActive(db, 999999)).toEqual(notFound);
  });

  it("renameEmployee changes the name only, or 404", async () => {
    const e = await seedEmployee(db, { fullName: "Jane", active: false });
    expect(await renameEmployee(db, e!.id, "Janet")).toMatchObject({
      ok: true,
      fullName: "Janet",
      active: false,
    });
    expect(await renameEmployee(db, 999999, "X")).toEqual(notFound);
  });
});
