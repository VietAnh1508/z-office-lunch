import { describe, expect, it } from "vitest";
import { parseMenuText } from "./parse-menu-text";

describe("parseMenuText", () => {
  it("splits a plain price off the end of a line", () => {
    expect(parseMenuText("Pho Bo 25000")).toEqual([
      { name: "Pho Bo", price: "25000" },
    ]);
  });

  it("normalizes a dot thousands-grouping price", () => {
    expect(parseMenuText("Pho Bo 25.000")).toEqual([
      { name: "Pho Bo", price: "25000" },
    ]);
  });

  it("normalizes a comma decimal price", () => {
    expect(parseMenuText("Pho Ga 12,50")).toEqual([
      { name: "Pho Ga", price: "12.50" },
    ]);
  });

  it("normalizes a k-multiplier price", () => {
    expect(parseMenuText("Coffee 45k")).toEqual([
      { name: "Coffee", price: "45000" },
    ]);
  });

  it("leaves price empty when no price-like trailing token exists", () => {
    expect(parseMenuText("Bun Cha")).toEqual([{ name: "Bun Cha", price: "" }]);
  });

  it("treats a line that is only a number as the name, not a price", () => {
    expect(parseMenuText("45000")).toEqual([{ name: "45000", price: "" }]);
  });

  it("only treats the trailing token as a price, not a mid-line number", () => {
    expect(parseMenuText("Set 2 for 90000")).toEqual([
      { name: "Set 2 for", price: "90000" },
    ]);
  });

  it("drops blank and whitespace-only lines", () => {
    expect(parseMenuText("\n  \nPho Bo 25000\n")).toEqual([
      { name: "Pho Bo", price: "25000" },
    ]);
  });
});
