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

- `insertPdfPagesAsBoardPages`: uploads sequentially, accumulates rows, then calls the workspace **`InsertPdfBoardPagesIntegrate.commitPdfBatch`** **once** with section seed + all rows + first page id. The workspace `commitPdfBatch`:
  1. Freezes the anchor page's scene into `pageDataRef` BEFORE any state mutation.
  2. Seeds the section registry.
  3. Writes per-page `pageDataRef` entries.
  4. Appends all new rows to `pageListRef` + `setPageList` in one shot.
  5. Registers all BinaryFiles via a single `api.addFiles`.
  6. Navigates to the first PDF page (only if anchor is still active).
  Atomic commit closes the page-switch / `setPageList` race window that smoke-1 #3/#6/#7 exploited.
- Partial failures still call `commitPdfBatch` with the successful prefix and return a `Inserted N of M…` error message.
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

## Smoke-1 / Smoke-2 / Smoke-3 hardening (2026-05-16)

See [PHASE-PDF-SMOKE-1.md](PHASE-PDF-SMOKE-1.md) for the full smoke
findings + triage (rounds 1, 2, and 3 all in that doc).

**Smoke-3 follow-on** (the leak's twin — peer-broadcast side):
- The smoke-2 fix closed the `selectTutorPage` async window, but the
  *peer-broadcast* path (`applyRemoteToCanvas`) had a structurally
  identical race: it captured `activePageIdRef.current` BEFORE the
  hydrate await, then after the await called
  `updateSceneMergingWithRemote` which read `api.getSceneElements()`
  (the live scene, now showing the page the tutor had switched to)
  and pushed `reconcileElements`'s **union** of (new-page elements +
  peer's target-page elements) back into the live scene AND into
  `pageDataRef[capturedActive]`. Bilateral leakage.
- Round-3 fix: rewrote `applyRemoteToCanvas` — no pre-await capture;
  read all volatile state AFTER hydrate; use `pageDataRef[targetId]`
  as the merge local (or the live scene only when *still* on target
  at read time); only update the live scene when still on target +
  no page-switch swap is in flight at write time. When we've moved,
  only the bucket is updated; the next page-switch hydrate surfaces
  the change.
- Also (round 3): drop the `!Mf.fontsDirectory` guard in
  `MathInsertButton.tsx`. `MathfieldElement.fontsDirectory` defaults
  to the truthy `"./fonts/"`, so the round-2 conditional never fired
  and the CDN URL was never assigned — KaTeX 404s persisted.
  Unconditional assignment now lands.

**Smoke-2 follow-on** (the real leak — round 1 fix was insufficient):
- `selectTutorPage`'s `await hydrateRemoteImageFilesForScene` had been
  positioned BETWEEN bumping `activePageIdRef` and calling
  `api.updateScene`. That async window allowed a parallel select /
  add-page to read `activePageIdRef = new` while `getSceneElements()`
  still returned the old scene, writing `pageDataRef[new] = old` and
  committing a page swap.
- Round-2 fix: `tutorSwitchTokenRef` monotonic counter — every
  `selectTutorPage` / `addTutorPage` bumps it at entry; `selectTutorPage`
  abandons after hydrate if a newer call won the race; the
  `activePageIdRef = nextId` and `updateScene(next)` calls are now
  in the same synchronous block.
- Also: `MathfieldElement.fontsDirectory` pinned to jsDelivr CDN so
  the Insert math button stops 404'ing on Vercel Preview (smoke-2
  Note 1 — pre-existing, not introduced by this branch). Round 3
  re-fixed because the guard was wrong (see above).

Round-1 blockers fixed (still hold after round-2 verification):

- **#3 / #6 / #7 page-data leakage** — atomic `commitPdfBatch` (above);
  `selectTutorPage` + `addTutorPage` now save the leaving scene
  unconditionally, hold the programmatic-switch guard across **two
  animation frames** instead of `setTimeout(0)`, and the
  `ensureNativeImageAssetUrlsForSync` async tail no longer writes back
  to `pageDataRef[curPage]` when the active page changed since the
  upload started.
- **#1 picker dialog dismiss-on-text-selection** — backdrop now uses
  `onPointerDown` + `onPointerUp`; only closes when BOTH events land
  on the backdrop (drag-release outside an input no longer dismisses).
- **#5 Add Page placement** — inserts right after the active page and
  picks the smallest unused `Page N` label so adding from inside a PDF
  section produces a sensible "Page 2", not "Page 9".
- **#12 replay PDFs show as placeholders** — `registerImageAssets`
  now registers BinaryFiles under `wba-${elementId}` to match the
  `toExcalidraw` synthesis. Previously the replay used
  `stableHashFileId(url)` which never matched the rendered Excalidraw
  element's `fileId`, so Excalidraw couldn't find the bitmap.
- **S1 First-N select-on-focus** — typing replaces the prefilled value
  instead of requiring backspace.

Deferred to a follow-up branch (per smoke-1 triage):

- **#2** PDF page lock / pan-clamp — separate spike.
- **#8** Vercel Blob token rate limit during 30-page imports — existing
  retry path needs a backoff; not introduced here.
- **#9** Replay page strip display — read-only `PageStrip` in replay
  viewer.
- **#11** Replay scrub liveness + 429 — pre-existing recorder issue.
- **S3** Tutor-vs-student viewport-center insert origin — pre-existing.
- **S4** Math button promotion + Excalidraw library button behaviour.

## Known gaps / follow-ups

- Large PDFs + **mobile Safari** at picker step (memory) — manual only.
- **Replay page strip** still not rendered (#9, deferred above).

## Explicitly deferred (bootstrapper)

- Option C multi-tier page model, manual section CRUD beyond prune-on-delete, drag-into-section semantics, server-side PDF render, CSP changes.
