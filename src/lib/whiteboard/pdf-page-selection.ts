/**
 * Parse tutor-entered PDF page selections (`1-5,8,10-12`) into sorted 1-based
 * indices for {@link renderPdfFileToPngs}'s `pageIndices` option.
 */

export type PdfCustomRangeParseResult =
  | { ok: true; indices: number[] }
  | { ok: false; error: string };

export function parsePdfCustomRanges(
  raw: string,
  totalPages: number
): PdfCustomRangeParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a page range." };
  }
  const tokens = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const uniq = new Set<number>();
  for (const part of tokens) {
    const dash = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (dash) {
      const a = Number.parseInt(dash[1]!, 10);
      const b = Number.parseInt(dash[2]!, 10);
      if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a < 1 ||
        b < 1 ||
        a > totalPages ||
        b > totalPages
      ) {
        return { ok: false, error: "Pages out of range." };
      }
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) uniq.add(i);
      continue;
    }
    const single = /^(\d+)$/.exec(part);
    if (single) {
      const n = Number.parseInt(single[1]!, 10);
      if (!Number.isFinite(n) || n < 1 || n > totalPages) {
        return { ok: false, error: "Pages out of range." };
      }
      uniq.add(n);
      continue;
    }
    return { ok: false, error: "Malformed range." };
  }
  const indices = [...uniq].sort((x, y) => x - y);
  return { ok: true, indices };
}

export function formatPdfSelectionPreview(indices: readonly number[]): string {
  if (indices.length === 0) return "";
  const max = 8;
  const head = indices.slice(0, max).join(", ");
  return indices.length > max ? `${head}, …` : head;
}
