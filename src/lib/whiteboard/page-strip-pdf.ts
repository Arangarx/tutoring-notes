import type { PageStripRow } from "@/components/whiteboard/PageStrip";

/**
 * PDF imports register a collapsible strip section whose id is prefixed
 * `pdf-` (UUID) or `pdf_` (fallback). See `insertPdfPagesAsBoardPages`.
 */
export function isPdfBoardSection(sectionId: string | undefined): boolean {
  if (!sectionId) return false;
  return sectionId.startsWith("pdf-") || sectionId.startsWith("pdf_");
}

export function isImageBoardSection(sectionId: string | undefined): boolean {
  if (!sectionId) return false;
  return sectionId.startsWith("img-");
}

/** Derive board-kind flags from the section id. Callers do not pass them. */
export function enrichPageStripRow(
  row: Omit<PageStripRow, "isPdf" | "isImage">
): PageStripRow {
  return {
    ...row,
    isPdf: isPdfBoardSection(row.section),
    isImage: isImageBoardSection(row.section),
  };
}
