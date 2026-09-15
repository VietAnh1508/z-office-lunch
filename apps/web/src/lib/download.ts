/**
 * Encodes `content` as UTF-16LE bytes, one JS UTF-16 code unit -> 2
 * little-endian bytes. A leading U+FEFF (the BOM `toCsv` prepends) becomes
 * the bytes FF FE, i.e. the UTF-16LE byte-order mark Excel looks for.
 *
 * Kept separate from the Blob/anchor/URL browser APIs below so it can be
 * unit tested directly.
 */
export function utf16LeBytes(content: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(content.length * 2));
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return bytes;
}

/**
 * Triggers a browser download of `content` as `filename`.
 *
 * Encodes as UTF-16LE rather than handing the string straight to `Blob`
 * (which would encode as UTF-8): paired with `toCsv`'s tab delimiter, a
 * UTF-16LE BOM is what makes Excel auto-split into columns *and* decode
 * non-ASCII text correctly on double-click, regardless of OS locale — see
 * the rationale in `csv.ts`.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([utf16LeBytes(content)], { type: "text/csv;charset=utf-16le;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
