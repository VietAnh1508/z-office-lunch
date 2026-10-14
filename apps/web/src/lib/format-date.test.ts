import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./format-date";

describe("formatDate", () => {
  it("formats as DD/MM/YYYY with zero padding", () => {
    expect(formatDate(new Date(2026, 7, 1, 9, 5))).toBe("01/08/2026");
  });
});

describe("formatDateTime", () => {
  it("appends 24h HH:mm in local time", () => {
    expect(formatDateTime(new Date(2026, 11, 25, 14, 7))).toBe("25/12/2026 14:07");
  });
});
