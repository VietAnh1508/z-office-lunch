const SCHEME_RE = /^https?:\/\//i;

export function normalizeMenuUrl(url: string): string {
  const trimmed = url.trim();
  return SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}
