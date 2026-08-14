import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

// Minimal RFC-4180-ish parser, used only to prove the escaping in `toCsv` is
// actually reversible rather than just eyeballing the raw string. Mirrors
// Excel's own handling of the leading BOM and `sep=,` directive line: both
// are consumed before the real header/data rows are parsed.
function parseCsv(input: string): string[][] {
  const withoutBom = input.startsWith("﻿") ? input.slice(1) : input;
  const withoutSepDirective = withoutBom.startsWith("sep=,\r\n")
    ? withoutBom.slice("sep=,\r\n".length)
    : withoutBom;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < withoutSepDirective.length) {
    const char = withoutSepDirective[i];

    if (inQuotes) {
      if (char === '"') {
        if (withoutSepDirective[i + 1] === '"') {
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
    if (char === "\r" && withoutSepDirective[i + 1] === "\n") {
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

  it("forces comma as Excel's delimiter via a sep=, directive, regardless of the OS locale", () => {
    // Without this, Excel picks its CSV delimiter from the OS/Excel regional
    // "list separator" setting — semicolon in many non-US locales (including
    // Vietnamese) — and a comma-delimited file opens as one unsplit column.
    const csv = toCsv(["Name"], [["Ann"]]);

    expect(csv).toBe("﻿sep=,\r\nName\r\nAnn");
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

    expect(csv).toBe("﻿sep=,\r\nEmployee,Food\r\nAn Nguyen,Pho Bo");
  });

  it("renders null as an empty field", () => {
    const csv = toCsv(["Employee", "Drink"], [["An Nguyen", null]]);

    expect(csv).toBe("﻿sep=,\r\nEmployee,Drink\r\nAn Nguyen,");
  });

  it("opens cleanly with Vietnamese names, which pass through untouched (no ASCII-only escaping)", () => {
    const csv = toCsv(["Employee"], [["Nguyễn Văn An"]]);

    expect(csv).toBe("﻿sep=,\r\nEmployee\r\nNguyễn Văn An");
  });
});
