import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("schema", () => {
  it("exports a table for every data model entity", () => {
    expect(schema.restaurants).toBeDefined();
    expect(schema.menuItems).toBeDefined();
    expect(schema.employees).toBeDefined();
    expect(schema.rounds).toBeDefined();
    expect(schema.roundMenuItems).toBeDefined();
    expect(schema.submissions).toBeDefined();
  });
});
