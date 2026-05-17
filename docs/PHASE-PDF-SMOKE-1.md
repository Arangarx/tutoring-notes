# PHASE-PDF smoke 1 — findings (2026-05-16)

Captured verbatim from Andrew's first smoke run against the Vercel Preview
for branch `pdf-page-picker-and-per-page-boards`. Use this as the working
worklist; mark items resolved / deferred as we go.

## Live session findings

1. **Picker dialog disappears unexpectedly.** Hard to reproduce, but can be
   forced: highlight text inside the custom-range field, deselect, then
   re-highlight — dialog vanishes. Likely the ModalPortal backdrop
   `onClick` firing on selection / focus event bubbling.
2. **Question:** should we lock PDF page position / clamp pan + zoom to
   the page edges? (Bootstrapper deferred this as v1 scope, but worth a
   design call now that we have per-page boards.)
3. **Per-page scene leakage (PDF ↔ Page 1).** While testing collapse,
   first PDF page ended up rendering on Page 1, and the original Page 1
   drawing ended up on the first PDF page. Strong "page swap" signal.
4. **Auto-expand prevents collapse while on a PDF page.** Working as
   designed (bootstrapper auto-expand rule). When off the section the
   tutor *can* collapse and the state sticks. Reported as **better than
   expected**, not a bug.
5. **"Add page" lands at the end.** After importing PDF (7 pages) +
   built-in Page 1, "Add page" produced "Page 9" beneath the PDF
   section. Tutor's intuition was a Page 2 row near the top.
6. **Cross-page sync drift (Page 1 ↔ Page 9).** Over time, drawings
   from Page 1 and Page 9 merged — both ended up showing both sets.
   PDF page 1 still had its original strokes only.
7. **PDF pages copying into other pages.** More general manifestation
   of #6 / #3 — there is page-data leakage somewhere in the live
   document apply / page-switch path.
8. **Per-PDF 30-page cap hit, but token error mid-upload.** With two
   PDFs already in the session, third PDF returned: `Inserted 16 of 30
   pages; remainder failed: Could not upload to whiteboard storage.
   Please try again. (Vercel Blob: Failed to retrieve the client
   token)`. First 16 *did* land. Almost certainly the existing Vercel
   Blob client-token rate limit; PDF flow surfaces it more often now.
9. **Replay screen has no page strip.** Bootstrapper specifically
   called out the replay should show section grouping. **Replay UI was
   not extended in this build — gap.**
10. No console errors observed on initial replay load nor after refresh.
11. **Scrub is not live; intermittent 429s.** Scrubber didn't paint
    strokes while dragging on first load; after pressing play it
    painted while scrubbing for a bit, then stopped once scrubbed past
    the loaded window. Eventually saw `GET .../api/audio/admin/<id> →
    429 (Too Many Requests)`. Likely pre-existing replay hydration +
    audio segment fetch limit; this branch did not touch that path.
12. **Replay shows PDFs as placeholder image blocks** (right size,
    generic image icon). Asset hydration for PDF pages in replay
    isn't completing — replay player isn't loading from
    `customData.assetUrl` properly.
13. Forward playback (non-scrub) renders strokes correctly.

## Side notes

S1. **First-N input doesn't select on focus.** Tutor expected typing
    "3" to replace "15", not have to delete first. Add
    select-all-on-focus.
S2. **Smoke checklist arithmetic was wrong.** `1-3,5,7-8` is **6**
    pages, not 5 as the checklist claimed. Live dialog correctly says
    6. Update the smoke checklist in the bootstrapper / status doc.
S3. **Viewport center mismatch tutor ↔ student** — the page-1 image
    drops at the tutor's viewport center, not the student's. Pre-
    existing in `insert-asset.ts`'s `viewportCenter` call (it reads
    the tutor's local Excalidraw state). Likely needs a deterministic
    anchor (e.g. document-space origin per page) rather than per-tab
    viewport.
S4. **Math whiteboard library default + Excalidraw library button.**
    (a) Promote the math equation insert to the main WB toolbar
    (right now it lives in the math popover button only). (b) If
    Sarah uses Excalidraw's built-in library button to import a
    library, does that persist across sessions, or does she re-import
    each time? — needs investigation.

## Triage

**Merge blockers (must fix before this lands on master):**

- #3 / #6 / #7 — page-data leakage. Existing-session affecting; can't
  ship with this regression. Investigate `selectTutorPage` +
  `applyBoardDocumentV1ToExcalidraw` + integrate.appendBoardPage race
  vs Excalidraw's debounced `onChange`.
- #1 — picker dialog dismiss-on-selection. Easy fix (don't close on
  mousedown if a selection range exists; or restrict backdrop close
  to actual outside clicks).
- #9 / #12 — replay page strip + PDF asset hydration in replay. The
  bootstrapper explicitly required replay verification.

**Strong follow-ups (consider for this branch if time allows):**

- S1 — First-N select-on-focus.
- S2 — Smoke checklist arithmetic fix.
- #4 / #5 — design decisions on auto-expand behaviour and Add-page
  placement; document the chosen behaviour.

**Defer / not this branch:**

- #2 — PDF position lock / pan-clamp. Separate design spike.
- #8 — Vercel Blob token rate limit; tracked in the existing upload
  retry path. Worth a follow-up but not gating PDF v1.
- #11 — Replay scrub liveness + 429. Pre-existing, not introduced by
  this branch. File a separate follow-up.
- S3 — Per-tab insert-origin (tutor vs student viewport). Pre-existing.
- S4 — Math button promotion + library button behaviour. Separate
  toolbar / persistence spike.

## Status

- Branch: `pdf-page-picker-and-per-page-boards`
- Tip at smoke-1: `ca146eb` (PDF page picker, per-page boards, and
  grouped page strip).
- **NOT mergeable as-is** until blockers above are addressed.

## Smoke-1 fixes landed (pending smoke 2)

| Smoke ref | Fix | Where |
| --- | --- | --- |
| #3 / #6 / #7 page leakage | Atomic `commitPdfBatch` integrate hook + always-save leaving scene + double-RAF guard + per-page-id tracking in `ensureNativeImageAssetUrlsForSync` tail | `src/lib/whiteboard/insert-asset.ts`, `WhiteboardWorkspaceClient.tsx` (`selectTutorPage`, `addTutorPage`, `pdfBoardIntegrate`, `handleExcalidrawChange`) |
| #1 picker dismiss-on-selection | `onPointerDown` + `onPointerUp` pair; close only when both events land on backdrop | `src/components/whiteboard/PdfImageUploadButton.tsx` |
| #5 Add Page placement | Insert after active page + smallest-unused `Page N` label | `WhiteboardWorkspaceClient.tsx` (`addTutorPage`) |
| #12 replay PDF placeholders | `registerImageAssets` registers under `wba-${elementId}` to match `toExcalidraw` synthesis | `src/components/whiteboard/WhiteboardReplay.tsx` |
| S1 First-N select-on-focus | `onFocus={(e) => e.currentTarget.select()}` | `PdfImageUploadButton.tsx` |
| S2 Smoke checklist arithmetic | `1-3,5,7-8` = **6** pages, not 5 — bootstrapper checklist updated | `~/.cursor/plans/pdf-page-picker-and-per-page-boards-bootstrapper.md` |

Test status post-fix: `npx jest --testPathPatterns="whiteboard"` →
**428/428 pass**; `npx tsc --noEmit` → clean.

Still deferred (per triage above): #2, #8, #9, #11, S3, S4.
