import { describe, expect, it } from "vitest";
import { formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("formats a whole VND amount with dot thousands separators", () => {
    expect(formatPrice("11000")).toBe("11.000");
    expect(formatPrice("150000")).toBe("150.000");
  });

  it("formats small amounts without separators", () => {
    expect(formatPrice("500")).toBe("500");
  });

  it("formats a decimal amount with a comma decimal separator", () => {
    expect(formatPrice("11000.5")).toBe("11.000,5");
  });
});
