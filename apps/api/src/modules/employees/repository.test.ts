import { seedEmployee } from "db/testing";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../test/db";
import { findById, insert, list, setActive, setName } from "./repository";

describe("employees repository", () => {
  const db = useTestDb();

  it("insert returns the new row, active by default", async () => {
    const row = await insert(db, "Jane Doe");
    expect(row).toMatchObject({ fullName: "Jane Doe", active: true });
    expect(row.id).toEqual(expect.any(Number));
  });

  it("findById returns the row, or undefined when missing", async () => {
    const e = await seedEmployee(db, { fullName: "Jane Doe" });
    expect((await findById(db, e!.id))?.fullName).toBe("Jane Doe");
    expect(await findById(db, 999999)).toBeUndefined();
  });

  it("list orders by fullName and filters inactive rows when activeOnly", async () => {
    await seedEmployee(db, { fullName: "Zed", active: true });
    await seedEmployee(db, { fullName: "Amy", active: false });
    await seedEmployee(db, { fullName: "Bob", active: true });

    expect((await list(db, { activeOnly: false })).map((r) => r.fullName)).toEqual([
      "Amy",
      "Bob",
      "Zed",
    ]);
    expect((await list(db, { activeOnly: true })).map((r) => r.fullName)).toEqual(["Bob", "Zed"]);
  });

  it("setActive updates only the active flag and returns the row", async () => {
    const e = await seedEmployee(db, { fullName: "Jane Doe", active: true });
    const row = await setActive(db, e!.id, false);
    expect(row).toMatchObject({ id: e!.id, fullName: "Jane Doe", active: false });
    expect(await setActive(db, 999999, false)).toBeUndefined();
  });

  it("setName updates only the name and returns the row", async () => {
    const e = await seedEmployee(db, { fullName: "Jane Doe", active: false });
    const row = await setName(db, e!.id, "Jane Smith");
    expect(row).toMatchObject({ id: e!.id, fullName: "Jane Smith", active: false });
    expect(await setName(db, 999999, "X")).toBeUndefined();
  });
});
