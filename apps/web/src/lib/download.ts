/**
 * Triggers a browser download of `content` as `filename`. Kept separate from
 * `csv.ts` (which stays a pure, DOM-free function) so the CSV-building logic
 * can be unit tested without touching Blob/anchor/URL browser APIs.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
