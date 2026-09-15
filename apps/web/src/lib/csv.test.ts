import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

// Minimal RFC-4180-ish parser, used only to prove the escaping in `toCsv` is
// actually reversible rather than just eyeballing the raw string. Mirrors
// Excel's own handling of the leading BOM before the real header/data rows
// are parsed.
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
    if (char === "\t") {
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

  it("delimits fields with a tab, not a comma", () => {
    // Tab (not comma, even with a sep=, directive) is what makes Excel
    // auto-split into columns regardless of OS/Excel regional "list
    // separator" locale, without also breaking BOM-based Unicode detection
    // the way `sep=,` does for UTF-8. See the rationale comment on `toCsv`.
    const csv = toCsv(["Name"], [["Ann"]]);

    expect(csv).toBe("﻿Name\r\nAnn");
  });

  it("round-trips a note containing a tab, a quote, and a newline", () => {
    const note = 'Extra spicy\tplease "no cilantro"\nthanks';

    const csv = toCsv(["Employee", "Note"], [["An Nguyen", note]]);
    const parsed = parseCsv(csv);

    expect(parsed[0]).toEqual(["Employee", "Note"]);
    expect(parsed[1]).toEqual(["An Nguyen", note]);
  });

  it("leaves plain fields unescaped, including ones containing a comma", () => {
    const csv = toCsv(["Employee", "Food"], [["An Nguyen", "Pho, extra beef"]]);

    expect(csv).toBe("﻿Employee\tFood\r\nAn Nguyen\tPho, extra beef");
  });

  it("renders null as an empty field", () => {
    const csv = toCsv(["Employee", "Drink"], [["An Nguyen", null]]);

    expect(csv).toBe("﻿Employee\tDrink\r\nAn Nguyen\t");
  });

  it("opens cleanly with Vietnamese names, which pass through untouched (no ASCII-only escaping)", () => {
    const csv = toCsv(["Employee"], [["Nguyễn Văn An"]]);

    expect(csv).toBe("﻿Employee\r\nNguyễn Văn An");
  });
});
