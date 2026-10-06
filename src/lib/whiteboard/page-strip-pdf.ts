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

/** Derive `isPdf` from section id when building or hydrating page strip rows. */
export function enrichPageStripRow(
  row: Omit<PageStripRow, "isPdf" | "isImage"> & { isPdf?: boolean; isImage?: boolean }
): PageStripRow {
  return {
    ...row,
    isPdf: row.isPdf ?? isPdfBoardSection(row.section),
    isImage: row.isImage ?? isImageBoardSection(row.section),
  };
}
