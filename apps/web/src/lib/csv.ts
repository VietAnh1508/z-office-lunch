function escapeCsvField(value: string | number | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /["\r\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a CSV document from headers + rows, escaping commas/quotes/newlines
 * per RFC 4180 and prepending a UTF-8 BOM so it opens cleanly in Excel,
 * including with non-ASCII (e.g. Vietnamese) names.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return `﻿${lines.join("\r\n")}`;
}
