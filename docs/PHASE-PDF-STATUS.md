# PHASE-PDF — PDF page picker + per-page boards

## TL;DR

Shipped **subset PDF import** (inspect → picker → render) and **one board tab per PDF page**, grouped under a **collapsible section** keyed by `pdf-<uuid>` with tutor-local collapse state in `localStorage`. Wire **v3 document broadcasts** carry additive `pageList[].section` + optional `sections` map (student mirrors tutor labels).

## Data model (`WhiteboardBoardDocumentV1`)

- `pageList[]`: `{ id, title, section? }`
- Optional `sections`: `Record<sectionId, { label }>`
- Type guard accepts legacy docs without these fields.

## PDF picker UX (`PdfImageUploadButton`)

1. Choose PDF → **inspect** (`readPdfFilePageCount`).
2. **Picker**: All pages (disabled when `totalPages > PDF_MAX_PAGES`), First N (clamped), or **custom ranges** (`parsePdfCustomRanges`).
3. Continue → sequential render (`renderPdfFileToPngs` + optional `pageIndices`) → `insertPdfPagesAsBoardPages`.

Logs (prefix `wbsid=`): `pdf-inspect`, `pdf-pick`, `pdf-upload`, `pdf-page-insert`, `pdf-section-toggle`.

## Insert API

- `insertPdfPagesAsBoardPages`: uploads sequentially, workspace **`InsertPdfBoardPagesIntegrate`** owns page-list + scene mutations + BinaryFiles registration.
- `insertPdfPagesOnCanvas` retained for unit coverage / legacy comparison.

## Page strip (`PageStrip.tsx`)

- Consecutive rows sharing `section` render under a **section header** (muted chrome).
- Collapse prefs: `wb-section-collapsed:<sessionId>:<sectionId>`; **auto-expand** when `activePageId` falls inside a collapsed section.
- Tutor: **remove page** (×) when `pageList.length > 1`; empty sections **pruned** from registry on delete.

## Sync

- `WhiteboardWirePage` extended additively (`section?` on rows, optional `sections` map).
- `useTutorLiveDocumentWire` emits full rows + registry when non-empty.
- `useStudentWhiteboardCanvas` hydrates both; student broadcasts mirror shape for native-image path.

## Recording / replay

- Checkpoints / `getWireBroadcastExtras` include additive fields via shared snapshot builders.
- **Manual smoke**: replay page-strip grouping after tutor inserts PDF — not automated here.

## Tests added / touched

- `board-document-snapshot.test.ts`, `pdf-render.test.ts` (`resolvePdfPagesToRender`), `insert-asset.test.ts`, `pdf-page-selection.test.ts`.
- Student AV mount mock updated with `sectionsRegistry`.

## Known gaps / follow-ups

- Large PDFs + **mobile Safari** at picker step (memory) — manual only.
- **Replay UI** may need explicit `PageStrip` parity if it renders page metadata separately from checkpoint docs (verify on Preview smoke).

## Explicitly deferred (bootstrapper)

- Option C multi-tier page model, manual section CRUD beyond prune-on-delete, drag-into-section semantics, server-side PDF render, CSP changes.
