function escapeCsvField(value: string | number | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /["\r\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a CSV document from headers + rows, escaping commas/quotes/newlines
 * per RFC 4180 and prepending a UTF-8 BOM so it opens cleanly in Excel,
 * including with non-ASCII (e.g. Vietnamese) names.
 *
 * Deliberately does NOT prepend a `sep=,` directive line. That was tried to
 * force comma-splitting regardless of the OS/Excel regional "list separator"
 * setting (semicolon in many non-US locales), but it breaks Excel's
 * BOM-based UTF-8 detection for the rest of the file — Excel falls back to a
 * legacy codepage and mangles multi-byte characters (e.g. Vietnamese
 * diacritics) whenever `sep=,` precedes the BOM-marked content, even though
 * the BOM itself is correct. Correct encoding of non-ASCII names/notes
 * matters more here than delimiter auto-detection on non-US locales.
 * See https://answers.microsoft.com/en-us/msoffice/forum/all/open-utf-8-csv-file-with-sep-loose-encoding/b907d943-6b03-4eed-a7cd-11c2e32f8e1f
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return `﻿${lines.join("\r\n")}`;
}
