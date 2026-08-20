import { describe, expect, it } from "vitest";
import { normalizeMenuUrl } from "./menu-url";

describe("normalizeMenuUrl", () => {
  it("prefixes a bare domain with https://", () => {
    expect(normalizeMenuUrl("example.com/menu")).toBe("https://example.com/menu");
  });

  it("leaves an http:// URL unchanged", () => {
    expect(normalizeMenuUrl("http://example.com")).toBe("http://example.com");
  });

  it("leaves an https:// URL unchanged", () => {
    expect(normalizeMenuUrl("https://example.com")).toBe("https://example.com");
  });

  it("detects the scheme case-insensitively without double-prefixing", () => {
    expect(normalizeMenuUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
  });

  it("trims surrounding whitespace before prefixing", () => {
    expect(normalizeMenuUrl("  example.com  ")).toBe("https://example.com");
  });
});
