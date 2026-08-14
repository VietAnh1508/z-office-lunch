function escapeCsvField(value: string | number | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /["\r\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a CSV document from headers + rows, escaping commas/quotes/newlines
 * per RFC 4180 and prepending a UTF-8 BOM so it opens cleanly in Excel,
 * including with non-ASCII (e.g. Vietnamese) names.
 *
 * Also prepends a `sep=,` directive line: without it, Excel picks its CSV
 * delimiter from the OS/Excel regional "list separator" setting rather than
 * always using a comma — semicolon in many non-US locales (including
 * Vietnamese) — so a plain comma-delimited file opens as one unsplit column.
 * `sep=,` is a de facto standard Excel recognizes (Windows and Mac) to force
 * comma-splitting regardless of locale.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return `﻿sep=,\r\n${lines.join("\r\n")}`;
}
