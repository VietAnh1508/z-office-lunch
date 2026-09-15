function escapeCsvField(value: string | number | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /["\r\n\t]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a tab-delimited CSV document, escaping tabs/quotes/newlines per
 * RFC 4180 (tab in place of comma as the delimiter) and prepending a BOM so
 * it opens cleanly in Excel, including with non-ASCII (e.g. Vietnamese)
 * names.
 *
 * Tab, not comma, because of two Excel bugs that together rule out every
 * comma-delimited option:
 *  - A comma-delimited file needs a `sep=,` directive line to force
 *    comma-splitting regardless of the OS/Excel regional "list separator"
 *    setting (semicolon in many non-US locales, including Vietnamese) —
 *    but `sep=,` breaks Excel's BOM-based UTF-8 detection for the rest of
 *    the file, so it mangles multi-byte characters instead.
 *    See https://answers.microsoft.com/en-us/msoffice/forum/all/open-utf-8-csv-file-with-sep-loose-encoding/b907d943-6b03-4eed-a7cd-11c2e32f8e1f
 *  - Dropping `sep=,` fixes the encoding but brings back the locale-delimiter
 *    problem: double-clicking a plain comma CSV on a semicolon-locale
 *    machine opens it as one unsplit column.
 *  Tab-delimited UTF-16LE (see `downloadCsv` in `download.ts`, which does the
 *  actual byte encoding) sidesteps both: Excel auto-splits on tab regardless
 *  of locale, and Unicode BOM detection for UTF-16 doesn't have the `sep=,`
 *  bug that UTF-8 detection does.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join("\t"));
  return `﻿${lines.join("\r\n")}`;
}
