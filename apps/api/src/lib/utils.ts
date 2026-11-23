// A non-integer id can never match a row, so callers map null to 404 rather than 400.
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}
