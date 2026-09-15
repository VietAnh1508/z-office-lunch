/**
 * Turns a pasted, newline-separated block of text into a clean list of menu
 * item names: trims each line and drops any that are blank or whitespace-only.
 * No deduplication (no unique constraint on name in the data model) and no
 * bullet/numbering stripping — lines are otherwise returned verbatim.
 */
export function parseMenuItemNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
