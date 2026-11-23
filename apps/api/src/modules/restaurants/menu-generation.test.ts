import { describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGES } from "../../lib/errors";
import { createFakeAiBinding } from "../../test/fake-ai-binding";
import {
  GENERATE_MENU_MAX_TOKENS,
  GENERATE_MENU_MODEL,
  GENERATE_MENU_PROMPT,
  bytesToBase64,
  generateMenuItemsFromImage,
  parseGeneratedItems,
} from "./menu-generation";

describe("menu-generation", () => {
  describe("parseGeneratedItems", () => {
    it("extracts item names from a parsed object and drops extra fields", () => {
      expect(
        parseGeneratedItems({
          items: [
            { name: "Pho Bo", price: "50.000" },
            { name: "Banh Mi", extra: true },
          ],
        }),
      ).toEqual([{ name: "Pho Bo" }, { name: "Banh Mi" }]);
    });

    it("parses a JSON string and strips markdown code fences", () => {
      expect(parseGeneratedItems(JSON.stringify({ items: [{ name: "Bun Cha" }] }))).toEqual([
        { name: "Bun Cha" },
      ]);
      expect(parseGeneratedItems('```json\n{"items":[{"name":"Com Tam"}]}\n```')).toEqual([
        { name: "Com Tam" },
      ]);
      expect(parseGeneratedItems('```\n{"items":[{"name":"Tra Da"}]}\n```')).toEqual([
        { name: "Tra Da" },
      ]);
    });

    it("returns null for invalid JSON, wrong top-level shapes, or items missing name", () => {
      const invalidInputs: unknown[] = [
        null,
        undefined,
        42,
        "Here is the menu: * Pho",
        {},
        { items: "not-an-array" },
        { items: [null] },
        { items: [{}] },
        { items: [{ name: 123 }] },
      ];
      for (const input of invalidInputs) {
        expect(parseGeneratedItems(input)).toBeNull();
      }
    });
  });

  describe("bytesToBase64", () => {
    it("encodes small and multi-chunk (>32KB) buffers accurately", () => {
      expect(bytesToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe("SGVsbG8=");

      const large = new Uint8Array(70_000);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }
      const encoded = bytesToBase64(large);
      const decoded = atob(encoded);
      expect(decoded.length).toBe(large.length);
      expect(decoded.charCodeAt(0)).toBe(0);
      expect(decoded.charCodeAt(69_999)).toBe(69_999 % 256);
    });
  });

  describe("generateMenuItemsFromImage", () => {
    it("calls AI with model, prompt, max_tokens, and base64 image data URL", async () => {
      const ai = createFakeAiBinding();
      ai.resolveWith({ items: [{ name: "Ca Phe Sua Da" }] });
      const runSpy = vi.spyOn(ai, "run");

      const bytes = new Uint8Array([1, 2, 3]);
      const result = await generateMenuItemsFromImage(ai as unknown as Ai, bytes, "image/png", 42);

      expect(result).toEqual({ ok: true, items: [{ name: "Ca Phe Sua Da" }] });
      expect(runSpy).toHaveBeenCalledWith(GENERATE_MENU_MODEL, {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GENERATE_MENU_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${bytesToBase64(bytes)}` },
              },
            ],
          },
        ],
        max_tokens: GENERATE_MENU_MAX_TOKENS,
      });
    });

    it("returns 500 failure when the AI call rejects", async () => {
      const ai = createFakeAiBinding();
      ai.rejectWith(new Error("upstream failure"));

      const result = await generateMenuItemsFromImage(
        ai as unknown as Ai,
        new Uint8Array([1]),
        "image/jpeg",
        1,
      );

      expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.internal, status: 500 });
    });

    it("returns 500 failure when the AI response fails validation", async () => {
      const ai = createFakeAiBinding();
      ai.resolveWith("Not valid JSON");

      const result = await generateMenuItemsFromImage(
        ai as unknown as Ai,
        new Uint8Array([1]),
        "image/jpeg",
        1,
      );

      expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.internal, status: 500 });
    });
  });
});
