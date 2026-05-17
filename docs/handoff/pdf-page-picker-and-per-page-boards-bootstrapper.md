# PDF page-picker + per-PDF-page boards — Executor bootstrapper

Copy everything below the rule line into a fresh Composer chat. Do NOT include this header.

---

You are running a feature build for the tutoring-notes app. Composer-class. ~10-12 hr scope. **Branch + smoke + direct merge to master** — NO PR step. See `AGENTS.md` → "Merging convention (solo-tutor pilot stage)" for the policy: while the pilot is solo and no adversarial CI exists, PRs are pure ceremony with no review value; the smoke against the Vercel Preview URL is the gate. Target ship: **Sunday evening 2026-05-17** so it lands before Sarah's Monday 2026-05-18 session.

## Workspace + path discipline (read carefully)

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown in this bootstrapper without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `src/components/whiteboard/PdfImageUploadButton.tsx` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\components\whiteboard\PdfImageUploadButton.tsx`. Do NOT trust your shell's working directory — verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`) — sibling repos are OUT OF SCOPE for this build.

## Branch discipline (read carefully)

**You are starting in a workspace where the active branch may be ANYTHING** — possibly `master`, possibly a sibling feature branch from earlier work, possibly something else entirely. Cursor's per-workspace git state is shared across chats; you cannot assume the branch is correct just because the chat opened. **Your FIRST action after the read-first reads is to set up the branch correctly. Do NOT just run `git checkout -b ...` — that would branch off whatever HEAD is at, which may not be master.**

Run these commands in order, verifying each succeeds before the next:

```bash
git status                      # observe current state; if there are uncommitted changes, STOP and ask the user
git fetch origin                # pull latest refs without changing the working tree
git checkout master             # explicitly switch to master
git pull origin master          # ensure master is at the latest (will fast-forward; if it fails with a merge conflict, STOP and ask)
git log -1 --format='%H %s'     # verify master tip; expect d7fd583 (Phase 4c merge) AS A MINIMUM; if Phase 4d has merged, expect a later commit whose message includes "phase-4d" or similar
git checkout -b pdf-page-picker-and-per-page-boards   # branch off the now-current master
git status                      # confirm you are on the new branch with a clean tree
```

If `git log -1` shows master is at a commit OLDER than `d7fd583` (Phase 4c merge), STOP and tell the user — master is in a state you don't expect.

If `git log -1` shows master includes a Phase 4d merge: GREAT, you're starting after 4d landed. The polish + bug fixes + GainNode moderation work from 4d is in your base. Read `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\PHASE-4D-STATUS.md` AS PART OF YOUR READ-FIRST list so you know what changed (likely touched `WhiteboardWorkspaceClient.tsx` + `StudentWhiteboardClient.tsx` for AV polish — different code regions than the page strip, but worth knowing).

If `git log -1` shows master is at `d7fd583` exactly (Phase 4d NOT yet merged): STOP and tell the user — the original plan was sequential (PDF after 4d). If user confirms they want PDF first, fine, proceed; otherwise wait.

**After branch setup:**

- Push after Commit 1: `git push -u origin pdf-page-picker-and-per-page-boards`. This triggers a Vercel Preview deploy.
- ALL browser smoke testing happens against the **branch Vercel Preview URL**, NEVER against `tutoring-notes.vercel.app` (which is master/production where Sarah's real sessions live).
- **NEVER push directly to master.** Branch → commit → push → smoke on Preview URL → wait for user (Andrew) to confirm smoke pass → only then merge to master (the merge step is in "FINAL STEPS" below; do NOT run it until Andrew has confirmed).

## Project context

Live commercial-pilot app — Sarah uses this for real sessions. The PDF workbook insert flow is in BACKLOG as a Sarah-2026-04-24 request: she wants Wyzant-style page-range picker (import subset, not whole PDF) plus per-PDF-page board pages (so a 10-page worksheet becomes 10 navigable pages instead of all stacked on one). Today's behavior stacks all pages on the current board page — Sarah's worksheets routinely scroll off-screen and the tutor loses track of which page they're on. This build closes both gaps for Monday.

**This is a v1 build**, not a perfect-everything build. The page-strip UI gets a new section-grouping concept (Option B from the orchestrator's design pass — see "DESIGN SPEC" below); deeper questions like a multi-tier page model (Option C) are explicitly deferred to a future spike.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions (additive migrations, ownership assertions, per-session ID logging, CSP discipline).
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\BACKLOG.md` — search for "PDF workbook in Board pages" + "Sarah (2026-04-24, Discord)" for the original feature request.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\components\whiteboard\PdfImageUploadButton.tsx` — current upload modal flow. You will REPLACE the single-shot file-pick step with a two-step flow: file-pick → page-picker → render+insert.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\pdf-render.ts` — `renderPdfFileToPngs` accepts a `scale` option but not a page-selection option. You will ADD a `pageIndices?: number[]` option (default = all up to PDF_MAX_PAGES) so we only render selected pages, not all-then-filter.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\insert-asset.ts` — current `insertPdfPagesOnCanvas` stacks all pages on the active board page. You will ADD a sibling function `insertPdfPagesAsBoardPages` that creates one new board page per PDF page with section grouping.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\board-document-snapshot.ts` — current `WhiteboardBoardDocumentV1` schema (`pageList: { id: string; title: string }[]`). You will EXTEND with `section?: string` per page row + a new optional `sections?: Record<string, { label: string }>` map. Both additive, v1-compatible.
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\whiteboard\[whiteboardSessionId]\workspace\WhiteboardWorkspaceClient.tsx` — the page-strip UI lives here (search for `pageList` references). You will ADD section-header rendering with expand/collapse.
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\w\[joinToken]\StudentWhiteboardClient.tsx` — student-side page-strip mirror. Same section-header rendering (read-only since student doesn't add pages).
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useTutorLiveDocumentWire.ts` — sync envelope handling for page-list changes. Verify section field travels through existing envelopes; if a new envelope kind is needed, STOP and ask the orchestrator first (likely not needed since additive field).
10. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useStudentWhiteboardCanvas.ts` — student-side document hydration. Verify section field flows through.
11. `git log master --oneline -10` — confirm master tip is `d7fd583` (Phase 4c merge) or later before starting.

## YOUR SCOPE — what is IN this chat

**Goal**: Replace the current "stack PDF on current page" flow with "user picks which pages, each picked page becomes its own board page, all grouped under a collapsible section labeled with the PDF filename." Smokeable end-to-end on Vercel Preview with a real PDF.

**Deliverables (one branch — `pdf-page-picker-and-per-page-boards` off master — smoke + direct merge, no PR)**:

### DESIGN SPEC (orchestrator's design pass — implement as-specified)

#### Data model extension (additive, v1-compatible)

```typescript
// src/lib/whiteboard/board-document-snapshot.ts
type WhiteboardBoardDocumentV1 = {
  v: 1;
  pageList: { id: string; title: string; section?: string }[];  // NEW: optional section
  activePageId: string;
  pages: Record<string, ReadonlyArray<unknown>>;
  sections?: Record<string, { label: string }>;  // NEW: optional section registry
};
```

Both additions are **optional fields** — existing documents without the new fields still validate against v1. The `isWhiteboardBoardDocumentV1` type guard must accept documents without `section` on pageList rows and without the top-level `sections` map.

#### Section ID format

`pdf-<crypto.randomUUID()>` — unambiguous prefix so future code can identify PDF-derived sections vs (hypothetical future) user-created sections.

#### Page title format within a section

Each PDF page row gets `title: "<PDFName> p.<N>"`, where:
- `PDFName` = source PDF filename WITHOUT the `.pdf` extension, truncated to 20 chars if longer (append `…` if truncated). This format is consistent whether the page is inside or outside a section (so if user later drags a page out of a section, the title still makes sense).
- `N` = the PDF's natural 1-based page number (NOT a 0-based index, NOT renumbered if user only imported pages 3-5).

#### Section label

The section's `label` in the `sections` map = the full PDF filename (without `.pdf` extension, no truncation — the section header has room).

#### Page-strip UI behavior

- **Standalone pages** (no `section` field): render identical to today (same row UI, same active-state styling).
- **Sectioned pages** (consecutive pages with the same `section` value):
  - A section header is rendered ABOVE the first page in the run.
  - Header layout: `[▾ chevron] <SectionLabel> · <N pages>` (chevron expanded/collapsed icon · section label · count badge).
  - Click on the header toggles expand/collapse state.
  - **Expand state is persisted in localStorage** keyed by `<sessionId>:<sectionId>` (NOT synced — it's a per-tutor view preference). Default state after insert is EXPANDED (so the tutor sees the new pages they just imported). After page reload, restore from localStorage; if no entry, default expanded.
  - When **collapsed**, the section's pages are hidden from the strip BUT remain in the underlying `pageList`. **Edge case**: if the active page is inside a collapsed section (e.g. tutor collapses the section while viewing one of its pages), AUTO-EXPAND the containing section so the active page stays visible. Don't surprise the tutor with "where did my page go?"
- **Visual styling**: section header uses a slightly muted background (`rgba(...)`) so it reads as structural, not an action. Pages within an expanded section are subtly indented (e.g. left padding +12px) so the grouping is visually clear without being heavy-handed.
- **NO drag-to-reorder changes in v1**. The page strip already supports reorder (or doesn't — verify in the existing code). If it does, reordering a sectioned page within its section: keep section sticky. Reordering OUT of the section (dropping between two non-section pages): the page LOSES its `section` field — UI accepts this as a "manually broken out" page; the section continues with whatever pages remain. **If 0 pages remain in a section, prune the section entry from the `sections` map**. (Orphan section metadata isn't broken but is noise.)
- **NO manual section create/delete UI in v1**. Sections are created only by the PDF-import flow. If the section becomes empty (last page removed), prune the section.

#### Sync behavior

The `section` field on page rows + the `sections` map are part of the board document. Existing sync envelopes that carry page-list mutations (search for envelope kinds in `sync-client.ts` — likely `page-list-update` or similar) propagate the additive fields automatically because the envelope payload is the whole document snapshot or a diff over it. **VERIFY in your implementation**:
- Tutor inserts a 5-page PDF → student receives the 5 new pages WITH their `section` field, AND the section registry entry.
- Tutor collapses the section → student's strip is UNAFFECTED (collapse is local-only).
- Tutor deletes one of the sectioned pages → student receives the page-removal AND, if it was the last in the section, the section registry removal.

If verification reveals the envelope shape doesn't carry the new fields (e.g. it's a hand-crafted patch list that doesn't include section), STOP and ask the orchestrator. Likely fix: extend the envelope's payload to include the section-relevant fields. Should be additive.

#### Recording behavior

Whiteboard event log captures page-add/remove events with full page metadata (verify in `useWhiteboardRecorder.ts` / `WBEventLog`). The `section` field is just an additional field on the page row; it should flow through capture automatically. **VERIFY**: end a session that inserted a PDF; replay shows the section grouping correctly in the page strip.

If verification reveals the event-log capture drops the section field, fix at the capture layer (still additive — no schema change needed if events serialize the whole row).

### Group A — PDF render layer (do first, no UI churn)

1. **Extend `renderPdfFileToPngs` to accept page selection** (`src/lib/whiteboard/pdf-render.ts`):
   - Add option `pageIndices?: number[]` (1-based, defaults to all pages up to `PDF_MAX_PAGES`).
   - If `pageIndices` is provided: validate every entry is 1 ≤ i ≤ `totalPagesInPdf`; if any out-of-range, return `{ ok: false, reason: "render-failed", message: "Selected pages out of range" }`.
   - If `pageIndices.length > PDF_MAX_PAGES`: truncate to first `PDF_MAX_PAGES` and set `truncated: true` in the result. **Don't silently drop entries** — sort + truncate + log the truncation.
   - Sequential render path stays the same; only difference is the loop iterates over `pageIndices` instead of `1..pagesToRender`. Result's `pages[].pageIndex` carries the ORIGINAL PDF page number (NOT a re-indexed value) so downstream code can title pages correctly.
   - Update tests in `src/__tests__/whiteboard/` (search for pdf-render tests; add new cases covering: explicit `pageIndices` arg, out-of-range error, over-cap truncation, ordering preserved).

### Group B — PDF picker UI (do second)

2. **Two-step modal flow** in `src/components/whiteboard/PdfImageUploadButton.tsx`:
   - **Step 1 (existing)**: file pick.
   - **Step 1b (NEW — "inspecting" state)**: after file selected, before render, load the PDF via pdfjs and read `doc.numPages`. Add a new DialogState entry `inspecting: { totalPages: number, filename: string }`.
   - **Step 2 (NEW — "picking" state)**: show a page-selection UI:
     - Header: `"<PDFName> · <N> pages"`.
     - Three radio-button-style options:
       - **All pages** (default selected if `N <= PDF_MAX_PAGES`, ELSE disabled with "PDF has >30 pages, pick a range").
       - **First N pages** with number input clamped to `[1, min(totalPages, PDF_MAX_PAGES)]`.
       - **Custom range** with text input accepting comma-separated ranges (`1-5,8,10-12`). Parser: split on commas → trim → each token is either `N` (single page) or `N-M` (inclusive range); flatten + dedupe + sort → validate every page is `1 ≤ p ≤ totalPages`.
     - Live preview line: `"Will import: M pages (page 1, 2, 3, 8, 10, 11, 12)"` — show up to 8 page numbers then ellipsis.
     - Validation error if input is malformed: red helper text, "Continue" button disabled.
     - Apply `PDF_MAX_PAGES` cap: if selected > 30, warn `"Only first 30 pages will be imported"` and truncate at submit time.
     - **Continue** button → goes to existing "rendering" / "uploading" states with the selected `pageIndices` threaded through.
     - **Back** button → return to file pick.
   - Keep all existing UI affordances: iOS warning, error display, progress strip during render/upload, success message, cancel.
   - Tests under `src/__tests__/dom/PdfImageUploadButton.dom.test.tsx` (or extend existing test file): assert (a) inspecting state appears after file pick before render, (b) each picker option drives the right `pageIndices`, (c) custom range parser handles `1-5,8,10-12` → `[1,2,3,4,5,8,10,11,12]`, (d) over-cap selection truncates + warns, (e) malformed range disables Continue, (f) Back returns to file pick.

### Group C — Per-page board insert (do third)

3. **Add `insertPdfPagesAsBoardPages`** to `src/lib/whiteboard/insert-asset.ts`:
   - Sibling to `insertPdfPagesOnCanvas` (do NOT delete the old function in v1; it stays for any callsite not yet migrated — though the PDF button is the only caller, so practically it becomes dead code that you can delete at the end of this commit if you're confident).
   - Signature: `insertPdfPagesAsBoardPages(args: InsertAssetCommonArgs & { pages: PdfPageRender[]; filename: string; onProgress?: (uploaded: number, total: number) => void; })`.
   - Behavior:
     - Generate one section ID: `const sectionId = "pdf-" + crypto.randomUUID();`.
     - Derive section label: `filename.replace(/\.pdf$/i, "")` (full, no truncation).
     - Derive title format helper: `pdfPageTitle(filename, pageIndex)` → `"<truncated-name> p.<N>"` per the design spec.
     - **For each page** (sequentially — preserve order; do NOT parallelize since the page-list mutation API likely isn't reentrant):
       - Upload the PNG via existing `uploadWhiteboardAsset` (same as the old `insertPdfPagesOnCanvas`).
       - Mutate the board document to add a new page entry: `{ id: crypto.randomUUID(), title: pdfPageTitle(filename, page.pageIndex), section: sectionId }`.
       - Place the uploaded image as the sole element on the new page, sized to full page (use the existing `addImageElementToPage` helper if one exists, OR adapt the image-placement logic from `insertPdfPagesOnCanvas`).
       - Call `onProgress(i+1, total)` after each.
     - **After all pages inserted**: add the section registry entry: `sections[sectionId] = { label: sectionLabel }`. Mutate atomically via whatever the existing document-mutation API requires.
     - **Auto-navigate**: set `activePageId` to the FIRST newly-inserted PDF page so the tutor sees the import landed somewhere visible. Skip auto-nav if the user was already navigating during import (race: rare but possible — if `activePageId` changed during the loop, don't override).
     - Return: `{ ok: true, pagesInserted: <N>, sectionId, firstPageId }`.
   - Error handling: if upload fails mid-loop, KEEP the pages already inserted (rolling back partial inserts has its own failure modes), return `{ ok: false, reason: "upload-failed", message: "Inserted X of N pages; remainder failed: <message>" }` so the UI can surface partial-success.
   - **Single-page PDF edge case**: still uses the same code path (creates a 1-page section). The orchestrator considered making single-page PDFs skip the section entirely, but consistency wins — a 1-page section is degenerate but predictable. Confirm with orchestrator if you feel strongly otherwise.
   - Tests under `src/__tests__/whiteboard/insert-asset.test.ts` (extend existing): assert (a) creates N new pages with correct titles + section IDs, (b) section registry entry added, (c) auto-nav to first inserted page, (d) partial-failure returns partial-success result without rollback.

4. **Wire `PdfImageUploadButton.tsx` to call `insertPdfPagesAsBoardPages`** instead of `insertPdfPagesOnCanvas`:
   - Single line swap in the upload modal's existing code path.
   - Success message: `"Inserted <N> pages as new boards"` (was: `"Inserted N pages"`).
   - If you choose to delete the old `insertPdfPagesOnCanvas`: confirm no other callers via `Grep`, then delete + clean up dead types.

### Group D — Page-strip section grouping UI (do fourth — biggest UI lift)

5. **Page-strip section rendering** in `WhiteboardWorkspaceClient.tsx` (tutor) + `StudentWhiteboardClient.tsx` (student):
   - Locate the existing page-strip rendering code (search for `pageList.map` or similar — current shape is likely a flat list of page-row buttons).
   - Wrap the map in a section-aware renderer:
     ```typescript
     // Pseudocode for the renderer
     function renderPageStrip(pageList, sections, activePageId, collapsedSections) {
       const items = [];
       let i = 0;
       while (i < pageList.length) {
         const p = pageList[i];
         if (!p.section) {
           items.push(<PageRow page={p} active={p.id === activePageId} />);
           i++;
         } else {
           // Group consecutive pages with the same section
           const sectionId = p.section;
           const sectionPages = [];
           while (i < pageList.length && pageList[i].section === sectionId) {
             sectionPages.push(pageList[i]);
             i++;
           }
           const sectionLabel = sections?.[sectionId]?.label ?? "PDF";
           const collapsed = computeCollapsedState(sectionId, sectionPages, activePageId, collapsedSections);
           items.push(<SectionHeader id={sectionId} label={sectionLabel} count={sectionPages.length} collapsed={collapsed} onToggle={...} />);
           if (!collapsed) {
             sectionPages.forEach(sp => items.push(<PageRow page={sp} active={sp.id === activePageId} indented />));
           }
         }
       }
       return items;
     }
     ```
   - **Collapsed-state computation**:
     - Read from localStorage on mount: `localStorage.getItem("wb-section-collapsed:<sessionId>:<sectionId>")` → `"true"` | `null`.
     - Override to expanded if active page is in this section (auto-expand rule).
     - Write to localStorage on toggle.
   - **SectionHeader styling**: muted background (e.g. `rgba(148, 163, 184, 0.08)`), chevron icon (▾ when expanded, ▸ when collapsed), label, count badge (`N pages` in a smaller muted text).
   - **PageRow `indented` prop**: adds `padding-left: 12px` when rendered inside a section.
   - **Student-side**: identical rendering logic; just no add/remove affordances. Refactor: extract the `renderPageStrip` logic into a shared component `src/components/whiteboard/PageStrip.tsx` consumed by both clients. **This reduces duplication AND keeps merge conflict risk with the concurrent 4d branch lower** (smaller diffs in the workspace + student client files).
   - Tests under `src/__tests__/components/whiteboard/PageStrip.dom.test.tsx` (new file): assert (a) standalone pages render flat, (b) consecutive same-section pages collapse under a header, (c) toggling header expands/collapses, (d) active page inside collapsed section auto-expands the section, (e) different section IDs render separate headers, (f) empty sections don't render a header.

### Group E — Sync + recording verification (small but non-skippable)

6. **Sync verification**:
   - Local smoke: tutor inserts a 3-page PDF; verify student-side receives all 3 pages with their `section` field and the section registry entry.
   - DOM test: extend `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx` (or add a new test file) to assert that when the synced document has pages with `section` fields, the student-side page-strip renders them grouped.
   - If sync DROPS the section field: trace the envelope shape; fix at the layer that's strip-ing the field (additive — should NOT require schema changes). Document the fix in PHASE-PDF-STATUS.md.

7. **Recording verification**:
   - Local smoke: insert a PDF, draw on a couple of the new pages, end session, open replay; assert the replay's page strip shows the section grouping correctly.
   - DOM test: extend `src/__tests__/dom/useWhiteboardRecorder.dom.test.tsx` (or add a new case) to assert event log capture includes the section field on page-add events.
   - If recording DROPS the section field: trace the capture layer; fix it. Additive — should NOT require schema changes.

### Group F — Docs

8. **`docs/PHASE-PDF-STATUS.md`** (pattern matches PHASE-1B/4A/4C-STATUS.md):
   - TL;DR.
   - Data model changes (additive `section` + `sections`).
   - PDF picker UX (the two-step flow + the three picker options).
   - `insertPdfPagesAsBoardPages` API contract.
   - Page-strip section-grouping UX (collapse/expand rules, localStorage persistence, auto-expand-if-active edge case).
   - Sync envelope behavior (additive field propagation; what was verified).
   - Recording capture behavior (event log + section field; what was verified).
   - Known not-yet-tested edge cases (large PDFs at the 30-page cap, custom range parser edge inputs, mobile Safari memory at the picker step).
   - What's NOT included (Option C multi-tier page model; manual section create/delete UI; drag-to-section behavior beyond v1 spec).

## What is OUT of this chat (defer explicitly)

- **Option C (multi-tier page model)** — orchestrator deferred to a future spike. Don't refactor pageList into a two-array shape.
- **Manual section creation / deletion** — sections are PDF-import-only in v1. No "create section" button.
- **Drag-into-section behavior** — v1 spec: dragging a non-section page into the middle of a section does NOT auto-group it. Page strip just renders whatever the data model says. If pageList has a non-section page between two same-section pages, the section "breaks" visually around that page — that's acceptable v1 behavior.
- **PDF page reorder within a section** — if existing strip supports reorder, fine; if not, no new reorder work in v1.
- **PDF re-rendering at different zoom levels** — current 1.5x scale + clamp band is fine for v1. Don't add a quality selector.
- **Server-side PDF rendering** — stays client-side. Don't introduce a server route.
- **Single-page PDFs skipping section** — orchestrator chose consistency (1-page section is fine). Don't optimize away.
- **`insertPdfPagesOnCanvas` (stack-on-current-page) preservation as an option** — orchestrator chose replacement, not coexistence. The old function can be deleted once the button stops calling it. (If you choose to keep it: that's defensible if you think someone will need it; document the keep in PHASE-PDF-STATUS.md.)

If you find yourself adding any of these, STOP and re-read the partitioning.

## CRITICAL CONSTRAINTS

- **Additive migrations only.** `WhiteboardBoardDocumentV1` gains optional fields; the type guard must accept documents WITHOUT them. Documents in the wild without `section` / `sections` must still load + render correctly (as if all pages were standalone — which is exactly what happens with the section-aware renderer's `if (!p.section)` branch).
- **No DB schema changes expected.** The board document is stored as JSON; no Prisma migration needed for adding optional fields to its inner shape.
- **CSP / Permissions-Policy is FROZEN.** PDF rendering is client-side via pdfjs already — no new origins needed. If you reach for `src/middleware.ts`, STOP.
- **Per-session ID logging mandatory** for new state transitions: PDF inspect (`wbsid=<id> pdf-inspect totalPages=<N> filename=<name>`), page-pick (`pdf-pick selected=<N> mode=all|first|custom`), per-page upload start/done (`pdf-upload page=<N> bytes=<size>`), per-page board insert (`pdf-page-insert pageId=<id> sectionId=<id>`), section collapse/expand toggle (`pdf-section-toggle sectionId=<id> collapsed=<bool>`). Reuse the `wbsid` prefix for whiteboard-session-level events; new sub-events under it; do NOT introduce a new top-level prefix.
- **Server actions assert ownership** where applicable (this build adds NO new server actions; the existing `uploadWhiteboardAsset` route already asserts).
- **Tokenized share links** — PDF pages are stored as Vercel Blob with the existing tokenized URLs; verify share-replay surfaces the new pages correctly via the existing token-based audio/asset proxy (no new auth surface).
- **iOS Safari memory caveat** — current 30-page cap exists for this. Don't relax it. The picker UI's "First N" / "Custom range" actually IMPROVES iOS behavior because the tutor can choose 5 pages instead of being forced to render all 30.
- **Page-strip refactor strategy** (good practice regardless of merge concerns): extract the page-strip renderer to a NEW shared component `src/components/whiteboard/PageStrip.tsx` consumed by both `WhiteboardWorkspaceClient.tsx` and `StudentWhiteboardClient.tsx`. Single source of truth for the section-grouping logic; the workspace + student client diffs become minimal (delete old inline rendering, import + use the new component). Note: PDF work runs sequentially AFTER Phase 4d merges, so the post-4d master already includes 4d's polish + bug fixes in these two files (different code regions than the page strip, but worth being aware of when locating the page-strip code).
- **Don't touch `useAudioRecorder.ts`, `endWhiteboardSession`, `peer-mesh.ts`, `signaling.ts`, `useLiveAV.ts`, wire encryption.** None of those should be needed.
- **Don't modify the master plan file.** Orchestrator's job.
- **Hotfix policy**: branch + smoke + direct merge to master (see `AGENTS.md` "Merging convention"). No untested direct pushes to master.

## EXECUTION ORDER (recommended commit cadence)

1. **Commit 1 — Data model extension + type guard update + tests** (`src/lib/whiteboard/board-document-snapshot.ts` + tests).
   - Smallest reasonable diff that lands the schema additions. Verify existing tests still pass + new optional-field tests pass.
   - Push the branch immediately so Vercel starts building.

2. **Commit 2 — `renderPdfFileToPngs` page-selection support** (`src/lib/whiteboard/pdf-render.ts` + tests).
   - Add `pageIndices?` option; preserve default behavior when omitted.

3. **Commit 3 — `insertPdfPagesAsBoardPages` function** (`src/lib/whiteboard/insert-asset.ts` + tests).
   - Implement the per-page-board insert logic; add tests for happy path + partial-failure.

4. **Commit 4 — PDF picker UI** (`src/components/whiteboard/PdfImageUploadButton.tsx` + tests).
   - Two-step flow + three picker options + custom-range parser + tests.

5. **Commit 5 — Wire button to `insertPdfPagesAsBoardPages`**.
   - Single-call swap; verify end-to-end on Vercel Preview (insert a small PDF; see new pages appear).

6. **Commit 6 — Page-strip section-grouping UI + shared component extraction** (`src/components/whiteboard/PageStrip.tsx` NEW; `WhiteboardWorkspaceClient.tsx` + `StudentWhiteboardClient.tsx` use it).
   - This is the biggest commit; section header + collapse/expand + auto-expand + localStorage + indentation.

7. **Commit 7 — Sync + recording verification + any needed fixes**.
   - Smoke locally + on Preview; fix any field-stripping issues; tests.

8. **Commit 8 — `docs/PHASE-PDF-STATUS.md`**.
   - No code changes; handoff doc.

After commit 8: full `npx jest` + `npx tsc --noEmit` once more. Push.

## WRAP-UP

1. Full test suite: `npx jest` green (modulo the 8 pre-existing DB-dependent failures Phase 4a/4b/4c documented).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin pdf-page-picker-and-per-page-boards`.
4. Report back to the user (Andrew) with:
   - **Branch name**: `pdf-page-picker-and-per-page-boards`
   - **Preview URL**: `https://tutoring-notes-git-pdf-page-picker-and-per-page-boards-arangarx.vercel.app` (or whatever Vercel assigned — confirm in the GitHub Vercel comment, but the deterministic URL is `tutoring-notes-git-<branch>-arangarx.vercel.app`)
   - **Test counts** (passed / failed; note any new failures vs the 8 pre-existing)
   - **Smoke checklist** (link or paste the full list from "SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW" below)
   - **Deferred items or surprises** (especially: if sync/recording verification revealed field-stripping that required envelope-shape changes — that's important for the orchestrator to know)
   - **What's known-not-yet-tested** (iOS Safari at the picker step with a large PDF, share-replay rendering of sectioned pages)
5. **STOP and wait for Andrew's smoke result. Do NOT merge to master yourself.** Andrew runs the smoke checklist against the Preview URL. If pass: he'll merge directly (or ask you to merge). If fail: he'll report what broke and you'll fix.
6. **If Andrew confirms smoke pass and asks you to merge** (or if the orchestrator does), the merge sequence is:

   ```bash
   git checkout master
   git pull origin master                                   # ensure latest in case anything else landed
   git merge --no-ff pdf-page-picker-and-per-page-boards    # creates a revertable merge commit
   git push origin master
   # branch lives on for the stale-branch sweep utility to clean up later
   ```

   Per `AGENTS.md` "Merging convention", no PR is required for solo-pilot-stage work — the Preview-URL smoke is the gate, and the `--no-ff` merge commit gives a clean revert point.

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

(Andrew runs this against the branch Preview URL after Commit 6 lands, then again after Commit 7. Don't merge to master until at least the post-commit-7 smoke is green AND Andrew has confirmed.)

- [ ] On the **branch preview URL**, hard-refreshed since the last deploy.
- [ ] Open workspace as tutor. Click **Insert PDF**. Modal opens with iOS warning + 30-page / 25 MB copy.
- [ ] Pick a real 10-page PDF. Modal advances to the "inspecting" state briefly, then to the picker.
- [ ] Picker shows `"<PDFName> · 10 pages"`. "All pages" radio selected by default. Live preview: `"Will import: 10 pages (page 1, 2, 3, ..., 10)"`.
- [ ] Switch to "First N" with N=3. Live preview updates: `"Will import: 3 pages (page 1, 2, 3)"`.
- [ ] Switch to "Custom range" with `1-3,5,7-8`. Live preview: `"Will import: 6 pages (page 1, 2, 3, 5, 7, 8)"`. (smoke-1 S2: corrected from "5 pages".)
- [ ] Try malformed input like `1-,abc`. Continue button disables; red helper text appears.
- [ ] Pick `1-3,5,7-8`, hit Continue. Modal advances to rendering → uploading → success.
- [ ] After success, the page strip shows a NEW section header with the PDF filename + "6 pages" badge, expanded by default. Active page is the first imported PDF page (page 1).
- [ ] Each PDF page in the strip has title `<PDFName> p.1`, `<PDFName> p.2`, etc. (using the ORIGINAL PDF page numbers — so the strip shows p.1, p.2, p.3, p.5, p.7, p.8 — not 1,2,3,4,5).
- [ ] Click the section header chevron. Section collapses; pages disappear from strip. Header now shows ▸.
- [ ] Click again. Section expands. Pages reappear.
- [ ] Navigate to one of the PDF pages, then collapse the section. The section AUTO-EXPANDS (because the active page is inside it).
- [ ] Reload the tab. Section's last expand/collapse state is RESTORED from localStorage.
- [ ] Open student window via join link. Wait ~5 seconds. Student's page strip shows the same section header with the same pages.
- [ ] Tutor toggles collapse on the section. Student strip is UNCHANGED (collapse is local-only).
- [ ] Tutor deletes one of the sectioned pages (use existing page-remove affordance). Student sees the page removed; the section continues with N-1 pages.
- [ ] Tutor deletes ALL pages in the section. Section header disappears (no orphan header).
- [ ] Pick a 1-page PDF. Picker shows it; import. New section with 1 page (consistent behavior).
- [ ] Pick a 50-page PDF. Picker says "PDF has 50 pages, pick a range" and "All pages" is disabled. Use "First 30" or custom range. Import respects the 30-page cap.
- [ ] Insert two different PDFs in the same session. Two separate sections appear in the strip, each with their own filename label.
- [ ] Tutor draws on a couple of the new PDF pages. End session. Open replay. Page strip in replay shows the same section grouping correctly. Drawn pages render with the right strokes.
- [ ] DevTools console: no errors. New `[whiteboard] wbsid=… pdf-inspect/pick/upload/page-insert/section-toggle ...` log lines visible. No CSP violations.
- [ ] Existing whiteboard sync (drawing tutor → strokes appear on student) still works. Existing tutor-mic recording still works. PDF picker did NOT regress either.
- [ ] `npx jest` locally: green (modulo the 8 documented DB failures).
- [ ] `npx tsc --noEmit` clean.

## STOP CONDITIONS

- **Don't change Permissions-Policy / CSP.** Frozen.
- **Don't introduce a server-side PDF rendering route.** Stays client-side.
- **Don't refactor pageList into a multi-array shape (Option C).** Future spike.
- **Don't add manual section create/delete UI.** v1 = PDF-import-only.
- **Don't touch live-A/V code paths** (`useLiveAV`, `peer-mesh`, `signaling`, `mic-recorder-audio`). Concurrent 4d branch owns those.
- **Don't merge to master yourself.** Branch + push + smoke + WAIT for Andrew's go-ahead, then merge per `AGENTS.md` "Merging convention". No PR step; the Preview-URL smoke is the gate.
- **Don't modify the master plan file.** Orchestrator's job.
- **Don't drift past Sunday evening.** Sarah Monday is the soft deadline. If you're at hour 10 and Group D (page-strip UI) isn't done, STOP and ship what you have as a partial — the orchestrator will decide whether to ship Groups A-C as a first merge + Groups D-F as a follow-up branch.
- If sync envelope verification reveals a SHAPE CHANGE is needed (not just additive field flow), STOP and ask the orchestrator. This would be a bigger architectural call than a v1 build should make.
- If `tsc --noEmit` reveals a pre-existing error unrelated to this work, STOP and ask.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation. Branch + smoke + merge (per `AGENTS.md`).
- Don't modify the master plan file. Orchestrator's job.
- Reuse existing primitives. The new picker UI consumes existing pdfjs render path + existing upload path. The new section grouping consumes the existing pageList; just adds an optional field. The shared `PageStrip.tsx` component consolidates rendering that exists today inline in two places.
- Per-session ID logging mandatory. Reuse `wbsid` prefix; new sub-events under it.
- No DB migrations.
- CSP / Permissions-Policy FROZEN.
- Page-strip refactor: extract `PageStrip.tsx` as a shared component (consumed by workspace + student client) for cleaner code and smaller diffs in both client files.
- If anything in this bootstrapper is unclear, ask the user before guessing. The user routes the question to the orchestrator chat if needed.
