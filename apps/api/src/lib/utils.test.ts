import { describe, expect, it } from "vitest";
import { parseId, trimmed } from "./utils";

describe("parseId", () => {
  it("returns integer ids and null for non-integers", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("0")).toBe(0);
    expect(parseId("1.5")).toBeNull();
    expect(parseId("abc")).toBeNull();
  });
});

describe("trimmed", () => {
  it("trims strings and returns empty string for non-strings", () => {
    expect(trimmed("  hello  ")).toBe("hello");
    expect(trimmed(undefined)).toBe("");
    expect(trimmed(null)).toBe("");
    expect(trimmed(123)).toBe("");
  });
});
