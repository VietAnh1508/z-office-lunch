import { describe, expect, it } from "vitest";
import { parseMenuItemNames } from "./parse-menu-item-names";

describe("parseMenuItemNames", () => {
  it("splits multi-line input into trimmed names", () => {
    expect(parseMenuItemNames("Pho\nBun Cha\nCom Tam")).toEqual([
      "Pho",
      "Bun Cha",
      "Com Tam",
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseMenuItemNames("Pho\r\nBun Cha\r\nCom Tam")).toEqual([
      "Pho",
      "Bun Cha",
      "Com Tam",
    ]);
  });

  it("drops leading and trailing blank lines", () => {
    expect(parseMenuItemNames("\n\nPho\nBun Cha\n\n")).toEqual([
      "Pho",
      "Bun Cha",
    ]);
  });

  it("drops whitespace-only lines interspersed between real lines", () => {
    expect(parseMenuItemNames("Pho\n   \nBun Cha\n\t\nCom Tam")).toEqual([
      "Pho",
      "Bun Cha",
      "Com Tam",
    ]);
  });

  it("trims surrounding whitespace on each line", () => {
    expect(parseMenuItemNames("  Pho  \n  Bun Cha  ")).toEqual([
      "Pho",
      "Bun Cha",
    ]);
  });

  it("keeps duplicate names", () => {
    expect(parseMenuItemNames("Pho\nPho")).toEqual(["Pho", "Pho"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseMenuItemNames("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(parseMenuItemNames("   \n  \n\t")).toEqual([]);
  });

  it("returns a single-element array for a single line with no trailing newline", () => {
    expect(parseMenuItemNames("Pho")).toEqual(["Pho"]);
  });
});
