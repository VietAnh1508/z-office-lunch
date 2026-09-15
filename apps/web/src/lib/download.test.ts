import { describe, expect, it } from "vitest";
import { utf16LeBytes } from "./download";

describe("utf16LeBytes", () => {
  it("encodes a leading BOM character as the UTF-16LE byte-order mark (FF FE)", () => {
    const bytes = utf16LeBytes("﻿Ann");

    expect(Array.from(bytes.subarray(0, 2))).toEqual([0xff, 0xfe]);
  });

  it("round-trips non-ASCII text via TextDecoder", () => {
    const content = "﻿Nguyễn Văn An";

    const bytes = utf16LeBytes(content);
    const decoded = new TextDecoder("utf-16le", { ignoreBOM: true }).decode(bytes);

    expect(decoded).toBe(content);
  });

  it("encodes each ASCII character as 2 bytes, low byte first", () => {
    const bytes = utf16LeBytes("A");

    expect(Array.from(bytes)).toEqual([0x41, 0x00]);
  });
});
