import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

// Minimal RFC-4180-ish parser, used only to prove the escaping in `toCsv` is
// actually reversible rather than just eyeballing the raw string.
function parseCsv(input: string): string[][] {
  const withoutBom = input.startsWith("﻿") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < withoutBom.length) {
    const char = withoutBom[i];

    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r" && withoutBom[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

describe("toCsv", () => {
  it("prepends a UTF-8 BOM", () => {
    const csv = toCsv(["Name"], [["Ann"]]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("round-trips a note containing a comma, a quote, and a newline", () => {
    const note = 'Extra spicy, please "no cilantro"\nthanks';

    const csv = toCsv(["Employee", "Note"], [["An Nguyen", note]]);
    const parsed = parseCsv(csv);

    expect(parsed[0]).toEqual(["Employee", "Note"]);
    expect(parsed[1]).toEqual(["An Nguyen", note]);
  });

  it("leaves plain fields unescaped", () => {
    const csv = toCsv(["Employee", "Food"], [["An Nguyen", "Pho Bo"]]);

    expect(csv).toBe("﻿Employee,Food\r\nAn Nguyen,Pho Bo");
  });

  it("renders null as an empty field", () => {
    const csv = toCsv(["Employee", "Drink"], [["An Nguyen", null]]);

    expect(csv).toBe("﻿Employee,Drink\r\nAn Nguyen,");
  });

  it("opens cleanly with Vietnamese names, which pass through untouched (no ASCII-only escaping)", () => {
    const csv = toCsv(["Employee"], [["Nguyễn Văn An"]]);

    expect(csv).toBe("﻿Employee\r\nNguyễn Văn An");
  });
});
