const pad = (n: number) => String(n).padStart(2, "0");

// Browser-local time, fixed DD/MM/YYYY regardless of the viewer's locale.
export function formatDate(value: string | Date): string {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | Date): string {
  const d = new Date(value);
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
