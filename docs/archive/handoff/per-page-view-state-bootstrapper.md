> **SUPERSEDED 2026-05-27 (morning cleanup).** Tutor-side per-page view state (zoom + position retained per page) shipped per Andrew's confirmation. See [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) for current canonical state. Student-side validation is a known gap — tracked in [`docs/BACKLOG.md`](../BACKLOG.md) under "Per-page view state — student-side validation." This file is preserved for archival reference; do not act on it directly.

# Per-page view state (pan + zoom) — executor briefing (tier b: persisted across reloads)

> **Recommended model: Composer.** This is a feature build with three small but distinct surfaces — additive schema extension to a JSON document type, Excalidraw viewport API integration on both tutor + student sides, and a debounced wire-v3 event for follow-mode propagation. The surfaces are well-trodden (schema-extension pattern from PDF page work, Excalidraw `appState.scrollX/scrollY/zoom` API, existing sync-client event-add pattern). No novel architecture. Opus is overkill. ~1-1.5 days Composer time.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the commit plan in order. No further confirmation needed; begin work.

You are building **Phase 5 task 8 — Per-page view state (pan + zoom) preserved independently** for the tutoring-notes app, at **scope tier (b): persisted across reloads**. ~1-1.5 day scope. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `src/lib/whiteboard/board-document-snapshot.ts` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\board-document-snapshot.ts`. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`).

## Branch discipline

**You are starting in a workspace where the active branch may be ANYTHING.** Cursor's per-workspace git state persists across chats; do not assume `master`. Your FIRST action after the read-first reads is to set up the branch correctly.

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                # if uncommitted changes exist, STOP and ask the user
git fetch origin                                          # retry on transient DNS failures (Andrew's git-push-retry rule applies)
git checkout master                                       # switch to master
git pull origin master                                    # fast-forward
git log -1 --format='%H %s'                               # expect a tip at or after 22d9afc (housekeeping merge); if older, STOP
git checkout -b feat/per-page-view-state                  # branch off master
git status                                                # confirm clean tree on new branch
```

**After branch setup:**
- Push after Commit 1: `git push -u origin feat/per-page-view-state`. Triggers Vercel Preview deploy.
- Smoke happens against the Vercel Preview URL Andrew will share back. You DO NOT smoke this; Andrew smokes it on real hardware. Your job is build + unit tests + push + report.
- **NEVER push directly to master.** Branch → commit → push → smoke (Andrew) → merge (Andrew or you-on-Andrew's-go-ahead).

## Project context

Live commercial-pilot app. Sarah (pilot tutor) is the primary user. Current pain point this build addresses (Andrew, 2026-05-17 3:23 PM):

> *"Slot into the plan somewhere....pages should remember their position and zoom independently."*

**Today's behavior (bug)**: All whiteboard pages share one global pan/zoom state in the Excalidraw viewport. When the tutor zooms into page 3 to inspect an equation, switches to page 5 to talk through a related problem, comes back to page 3 — the zoom + pan have either reset or been clobbered. The tutor has to re-zoom + re-pan to find what they were looking at. Same for PDF-derived pages.

**Target behavior**: Each page remembers its OWN pan offset (`scrollX`, `scrollY`) + zoom level independently. Tutor zooms+pans on page 3, switches to page 5, returns to page 3 → lands at the exact prior pan+zoom. Matches Adobe Reader, browser PDF viewers, Miro, Notability — this is table-stakes UX that users expect without realizing they expect it.

**Tier you're building: (b) Persisted across reloads.** Additive extension to `WhiteboardBoardDocumentV1` schema, wire-v3 carries view-state updates, page-switch flushes current view state to the document, replay reads it back. Sarah will reload tabs (browser hiccups, accidental refresh) and expect state to survive — tier (a) in-session-only would be a regression on reload. **Do NOT build tier (c) (replay scrubber respects historical view state, ~2-3 days Opus); that's explicitly deferred.**

**Scope decision Andrew has already made**:
- **Tier (b)** — persisted across reloads. Locked.
- **Persistence model**: page-level only in the canonical `WhiteboardBoardDocumentV1` (tutor's authoritative state). Do NOT build per-viewer-per-page localStorage state — that's deferred to a future task when Phase 5 task 3 (follow vs independent v2) ships.
- **Follow vs independent composition**: Phase 5 task 3 is NOT YET SHIPPED. Today's student behavior is effectively "always tracking tutor." For this build, the student-side simply applies whatever per-page view state the tutor's document has when the student switches to that page. When task 3 ships later, the toggle will gate this behavior; that future work is OUT OF YOUR SCOPE.
- **Replay**: shows the FINAL per-page view state of each page (no historical scrubbing). When replay viewer lands on page N, it applies `pageList[N].viewState` if present; if absent (old session pre-this-feature), falls back to default-fit viewport. Backward compatible.
- **ID prefix**: `pvs` (per-page view state).

## Critical safety constraints (READ before implementing)

**Constraint #1 — Additive document schema, no version bump.** `WhiteboardBoardDocumentV1` already exists at `src/lib/whiteboard/board-document-snapshot.ts`. The `pageList[i]` entries currently have `{ id: string; title: string; section?: string }`. Add `viewState?: { panX: number; panY: number; zoom: number }` as an optional fourth field. **Do NOT bump to V2**; the additive optional field is genuinely backward-compatible — `isWhiteboardBoardDocumentV1` doesn't reject unknown fields, so old saved documents (no `viewState`) parse fine, and new documents with `viewState` parse fine. Extend the type guard to *validate* `viewState` when present (reject if it's present but malformed), but tolerate absence. Version bumps trigger document migration plumbing that is out of scope for this build.

**Constraint #2 — Wire-v3 events must be debounced, not pixel-by-pixel.** Pan/zoom interactions produce continuous state changes (every mouse-wheel tick, every drag pixel). You CANNOT fire a wire event per pixel — it would spam the WebSocket connection and starve real stroke updates. Pattern: **debounce ~200ms after user stops interacting, then fire one consolidated `pageViewState` event for the active page**. Plus: **fire immediately on page switch** (capture-and-flush the current page's state BEFORE switching, so the latest interaction always lands in the document). Plus: **fire on tab-close / End-session** (best-effort flush via `visibilitychange` listener or similar; if it fails, the next reload reads the most recent debounced flush — acceptable). Reference: look at how stroke updates are batched in `src/lib/whiteboard/sync-client.ts` and mirror that batching philosophy.

**Constraint #3 — Replay backward compatibility.** Old sessions (recorded before this feature ships) have no `viewState` on their `pageList` entries. Replay must NOT crash or render wrong on these. Test explicitly: open a previously-recorded session in replay and confirm it renders normally with default fit/zoom (no JS errors, no blank canvas, no NaN scrolling). The viewport-apply code must short-circuit cleanly when `viewState` is undefined.

**Constraint #4 — Persistence pathway integrity.** The view state rides along inside `WhiteboardBoardDocumentV1`. That document is persisted via at least two paths: **(a) sessionStorage draft** (`src/lib/whiteboard/session-scene-draft.ts`) for tab-reload recovery, and **(b) IndexedDB checkpoint → server checkpoint API** (`src/app/api/whiteboard/[sessionId]/checkpoint/route.ts`) for cross-device persistence. Because you're extending the document type and not changing its outer shape, BOTH paths should automatically carry the new field — but VERIFY this in smoke. Specifically: reload tutor tab mid-session → check that view state survives (sessionStorage path). End session, reopen replay → check that view state survives (server checkpoint path).

**Constraint #5 — Logging discipline.** Per AGENTS.md, every state transition in this feature gets a `[pvs]` log prefix with a per-page identifier. Pattern: `[pvs] pvs=<pageId> action=<capture|restore|flush|wire-recv> panX=<n> panY=<n> zoom=<n> source=<page-switch|debounced-flush|wire-recv|reload-restore>`. Without these, prod debugging is impossible if Sarah reports "my zoom got lost." This is non-negotiable per the workspace convention.

**Constraint #6 — Don't accidentally change page-switch semantics.** The existing page-switch flow (click a thumbnail in `PageStrip.tsx`, or invoke a programmatic page switch) currently has its own concerns (active page id update, Excalidraw scene swap, possibly snapshot triggers). You're inserting TWO new responsibilities into this flow: **before the swap**, capture the outgoing page's current viewport state into the document; **after the swap**, apply the incoming page's `viewState` to the Excalidraw viewport (or do nothing if absent). Don't refactor the page-switch flow beyond these two insertion points — adjacent refactors are scope creep.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions: per-session ID logging (you'll add `pvs` prefix entry — Phase 5 task 8 use), CSP discipline (no new external origins here — n/a), the merging convention.
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\board-document-snapshot.ts` — the document type + type guard. Currently 49 lines. This is the foundational extension surface.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__\whiteboard\board-document-snapshot.test.ts` — existing tests to extend for the new field's parse-tolerance + validation cases.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\session-scene-draft.ts` — sessionStorage draft persistence; verify the document round-trips through it without losing the new field (should be free since it's a generic JSON round-trip, but confirm).
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\whiteboard\sync-client.ts` — wire-v3 protocol. Find the existing event-batching pattern (how stroke updates / page additions / etc. are serialized + debounced). You'll add a `pageViewState` event variant here that follows the same pattern.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__\whiteboard\sync-client.test.ts` — existing wire tests to extend.
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useTutorLiveDocumentWire.ts` — tutor side of the wire. The "capture viewport → debounce → flush as wire event" pulse lives here or adjacent.
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\whiteboard\[whiteboardSessionId]\workspace\WhiteboardWorkspaceClient.tsx` — tutor workspace. This is where Excalidraw is mounted and where page-switch handlers live. The two-insertion-point pattern from constraint #6 happens here.
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\w\[joinToken]\StudentWhiteboardClient.tsx` — student viewer. Receives wire updates, switches pages when tutor switches. View-state apply lives here on the student side.
10. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useStudentWhiteboardCanvas.ts` — student canvas state hook; may need a viewport-apply path or a callback exposing the Excalidraw API to the parent.
11. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\components\whiteboard\PageStrip.tsx` — page-switch UI. Both tutor + student render this; confirm both paths funnel through the same `onSelectPage` handler so the capture/apply logic only needs one home.
12. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\api\whiteboard\[sessionId]\checkpoint\route.ts` — checkpoint API endpoint. Serializes the document to the server. Should be free — generic JSON pass-through — but verify.
13. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useWhiteboardRecorder.ts` — recording / replay hook; check whether replay-path uses `WhiteboardBoardDocumentV1` directly (to know where the replay-side viewport-apply hook goes).
14. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\WHITEBOARD-STATUS.md` — current whiteboard build status doc; you'll add a "Per-page view state SHIPPED" entry at the end (Andrew's STATUS-doc pattern per AGENTS.md).
15. Quick survey of `src/lib/whiteboard/` for the Excalidraw appState shape (`scrollX`, `scrollY`, `zoom`) — find an existing call site that reads or writes these, mirror that pattern. Excalidraw's `zoom` is `{ value: number }`; `scrollX`/`scrollY` are plain numbers.

## YOUR SCOPE — what is IN this chat

### Commit 1 — Extend `WhiteboardBoardDocumentV1` schema + type guard

File: `src/lib/whiteboard/board-document-snapshot.ts`.

- Add `viewState?: { panX: number; panY: number; zoom: number }` as optional fourth field on each `pageList[i]` entry.
- Extend `isWhiteboardBoardDocumentV1` to validate `viewState` when present: must be an object with `panX`, `panY`, `zoom` all finite numbers; reject if malformed. Tolerate absence (do not reject).
- Add an exported helper `getPageViewState(doc, pageId): { panX, panY, zoom } | undefined` for cleaner consumer code.
- Add an exported helper `setPageViewState(doc, pageId, viewState): WhiteboardBoardDocumentV1` that returns a new document with the field set on the matching pageList entry (immutable update, like the rest of the codebase's document mutation pattern — verify by reading existing helpers in this file or sibling files).
- **No version bump.** Stays at `v: 1`.

Update `src/__tests__/whiteboard/board-document-snapshot.test.ts`:
- Existing documents (no `viewState`) still pass the type guard.
- Documents with valid `viewState` pass the type guard.
- Documents with malformed `viewState` (missing field, NaN, wrong type) fail the type guard.
- `getPageViewState` returns undefined for pages without state, returns the state object for pages with state.
- `setPageViewState` returns a new document; original is not mutated; only the matching pageList entry is updated.

### Commit 2 — Tutor-side: capture + restore on page switch, debounced flush on viewport change

Files: `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`, possibly `src/hooks/useTutorLiveDocumentWire.ts` (or wherever the tutor's "I changed the document, propagate it" pulse lives — read first, decide based on existing structure).

- **Page-switch flow**: in the `onSelectPage` handler, BEFORE updating `activePageId`:
  1. Read the current Excalidraw viewport via the API ref (`excalidrawAPI.getAppState()` → `{ scrollX, scrollY, zoom: { value } }`).
  2. Call `setPageViewState(doc, currentActivePageId, { panX: scrollX, panY: scrollY, zoom: zoom.value })` and apply to the in-memory document.
  3. Log `[pvs] pvs=<pageId> action=capture source=page-switch panX=<n> panY=<n> zoom=<n>`.
  AFTER updating `activePageId`:
  4. Read `getPageViewState(doc, newActivePageId)`. If present, apply via `excalidrawAPI.updateScene({ appState: { scrollX: panX, scrollY: panY, zoom: { value: zoom } } })`. If absent, do nothing (Excalidraw keeps default viewport, which is fit-to-content behavior — verify by reading existing fresh-page-creation code).
  5. Log `[pvs] pvs=<pageId> action=restore source=page-switch panX=<n> panY=<n> zoom=<n>` (or `viewState=absent` if no stored state).
- **Debounced flush on viewport change**: subscribe to Excalidraw's `onChange` callback (it fires on every viewport / element change). Track the active page id and the latest `{ scrollX, scrollY, zoom }`. Debounce 200ms; on debounce-fire, call `setPageViewState(doc, activePageId, ...)` + propagate via existing wire pulse. Log `[pvs] pvs=<pageId> action=flush source=debounced panX=<n> panY=<n> zoom=<n>`.
- **CRITICAL: distinguish "user pan/zoom" from "programmatic viewport apply"**. If you apply view state via `updateScene` and that triggers `onChange`, you'll loop: apply → onChange → flush → re-apply. Use a ref-flag (`isApplyingViewportRef = true` set right before `updateScene`, cleared on the next microtask) to skip the debounce-flush during programmatic applies. Test this carefully — infinite loops on every page switch would be a session-killing bug.

Tests: add a DOM test under `src/__tests__/dom/` (or wherever the existing workspace client tests live — check `useWhiteboardRecorder.dom.test.tsx`'s neighbors) covering:
- Click page B from page A → page A's viewport captured to document, page B's viewport (if present) applied.
- Pan + zoom on page A, no page switch → debounce fires, document updated with new view state.
- Programmatic apply does NOT trigger a debounced flush (the loop-prevention test).

### Commit 3 — Wire-v3 `pageViewState` event variant for follow-mode propagation

Files: `src/lib/whiteboard/sync-client.ts`, `src/__tests__/whiteboard/sync-client.test.ts`.

- Add a new wire event variant: `{ kind: "pageViewState", pageId: string, panX: number, panY: number, zoom: number }`. Follow the existing event-variant pattern in this file (likely a discriminated union with a `kind` field).
- Producer (tutor side): when the debounced flush from Commit 2 fires, AFTER updating the local document, ALSO emit a `pageViewState` event via the wire. This is the follow-mode propagation channel.
- Consumer (student side): when the wire receives a `pageViewState` event, update the local document via `setPageViewState`. If the affected page is the currently-active page on the student's side, apply the viewport (same `excalidrawAPI.updateScene` call as Commit 2). If a different page, the state is stored for later (will apply when the student navigates to that page).
- Plumbing: the receive-handler likely lives in `src/hooks/useStudentWhiteboardCanvas.ts` or `StudentWhiteboardClient.tsx` — find where existing wire events are consumed, mirror.
- Logging: `[pvs] pvs=<pageId> action=wire-emit ...` on tutor side; `[pvs] pvs=<pageId> action=wire-recv ...` on student side.

Tests: extend `sync-client.test.ts` to cover:
- Round-trip serialize → deserialize of the new event variant.
- Backward compatibility: unknown event variants are gracefully ignored (test by serializing a `pageViewState` event and confirming an older-style consumer would skip it — if the existing protocol doesn't already enforce this, add it).

### Commit 4 — Student-side: receive + apply, plus restore on initial load

Files: `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`, `src/hooks/useStudentWhiteboardCanvas.ts`.

- On initial document load (when student first joins or reloads), if the active page has a `viewState`, apply it to the Excalidraw viewport on student side. Log `[pvs] pvs=<pageId> action=restore source=initial-load ...`.
- On page-switch (student following the tutor's page change, since today's behavior is "always track tutor"): apply the new active page's view state if present.
- Same anti-loop guard as Commit 2 (the `isApplyingViewportRef` flag).
- **Student does NOT emit `pageViewState` events.** Read-only viewer of tutor's state for now. The future per-viewer-independent-mode work (Phase 5 task 3 + later) will revisit this.

Tests: add a DOM test covering:
- Student receives a `pageViewState` event for the active page → viewport applies.
- Student receives a `pageViewState` event for a non-active page → document updates, viewport does NOT apply (still showing the active page).
- Student loads a session whose document has a `viewState` on the active page → viewport applies on mount.

### Commit 5 — Reload + replay safety

Files: cross-cutting — verify the document round-trips correctly through:
- `src/lib/whiteboard/session-scene-draft.ts` (sessionStorage draft path).
- `src/app/api/whiteboard/[sessionId]/checkpoint/route.ts` (server checkpoint path).
- Replay-mode rendering (wherever `WhiteboardBoardDocumentV1` is consumed in the replay UI — likely the same `StudentWhiteboardClient.tsx` or a sibling replay-mode component; search the codebase for replay-mode mount points).

For each path, write an integration-style test (or manual smoke item in the smoke checklist if integration is too heavy) confirming the view state survives. Most of this should be free since you didn't change the document's outer shape, but VERIFY rather than assume.

For replay specifically: when replay viewer lands on a page, apply that page's view state if present; if absent (old pre-feature session), default-fit. Log `[pvs] pvs=<pageId> action=restore source=replay-mount ...`.

### Commit 6 — Docs + ID-prefix registration + STATUS update

- **Update `AGENTS.md`**: add a line in the per-session-ID-logging section registering `pvs` (per-page view state — Phase 5 task 8). ONE-LINE addition; don't restructure.
- **Update `docs/WHITEBOARD-STATUS.md`**: append a "Per-page view state SHIPPED" entry with commit hashes, behavior summary, smoke checklist, and the explicit "tier (c) replay scrubber respects historical view state is DEFERRED" note. Follow the existing STATUS-doc pattern (sibling completed entries are the template).
- **Add a brief section to `docs/RECORDER-LIFECYCLE.md`** OR a sibling whiteboard-specific doc explaining the new flush triggers (page-switch, debounced 200ms, tab-close best-effort) so future debugging has a reference. ~10 lines.

## SMOKE CHECKLIST FOR ANDREW (executor: copy verbatim into your final report)

Andrew runs these against the Vercel Preview URL on real hardware (his laptop + a phone / second browser).

### Tutor-side
- [ ] **Basic per-page persistence**: create session, add 3 pages, zoom+pan on page 1, switch to page 2 (verify page 2 is at default viewport), zoom+pan on page 2, return to page 1 → page 1 lands at exact prior pan+zoom. Repeat for page 3.
- [ ] **Reload-survives**: zoom+pan on page 2, wait ~3 seconds (longer than 200ms debounce — confirm via `[pvs] action=flush` log), reload tutor tab → on reload, switch to page 2 → viewport restores.
- [ ] **End-session survives**: zoom+pan on page 2, end session, reopen session (or look at it in replay) → page 2 still at the stored viewport.
- [ ] **PDF-derived pages**: insert a multi-page PDF, zoom+pan on PDF page 3, switch to PDF page 5, return to page 3 → state preserved.
- [ ] **Fresh-page default behavior**: add a brand new page (no stored viewState) → viewport is default-fit (same as before this feature; no regression).

### Student-side (follow-mode behavior, since task 3 is not shipped)
- [ ] **Initial load**: tutor zooms+pans on page 1, student joins (or reloads) → student's page 1 viewport matches tutor's stored state.
- [ ] **Live wire propagation**: tutor zooms+pans on page 1 while student is watching → after ~200ms, student's viewport updates to match.
- [ ] **Cross-page wire**: tutor zooms+pans on page 2 while student is on page 1 (no visible change for student) → tutor switches to page 1 → confirm tutor's page-1 state is what propagates, not stale.
- [ ] **Page-switch tracking**: tutor switches page 1 → 2 → 3 with different zooms each → student tracks page changes AND zooms.

### Backward compatibility (the must-not-break test)
- [ ] **Old session in replay**: open a session that was recorded BEFORE this feature shipped (any pre-`feat/per-page-view-state` session) → replay renders normally with default viewport per page; no JS errors in console; no blank canvas.
- [ ] **Old session reopened mid-stream**: if you have any in-progress draft sessions in sessionStorage from before this build, reopen → document parses fine, viewport defaults to fit.

### Adversarial / edge
- [ ] **Rapid page switching**: click rapidly through 5 pages in <1 second each → no infinite-loop crash, viewport changes track the active page correctly. Watch console for repeated `action=flush` storms (should NOT happen — anti-loop guard from Commit 2 should suppress them).
- [ ] **Tab close mid-pan**: pan on page 3, immediately close tab (no debounce flush time) → reopen → page 3 may or may not have the last partial pan, but it should be from a recent flush, not undefined. Document the actual behavior — if it loses up to 200ms of state, that's acceptable; if it loses much more, the tab-close flush isn't firing.
- [ ] **Logs are present**: check the browser console — confirm `[pvs] pvs=...` logs appear for capture / restore / flush / wire-emit / wire-recv events. Without these, prod debugging is impossible.

### Tests + lint
- [ ] `npx jest src/__tests__/whiteboard src/__tests__/dom` → green for all the new tests; pre-existing DB-touching test failures (~9 from baseline) ignored as documented.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint src/` 0 new errors (pre-existing warnings OK).

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin feat/per-page-view-state`.
4. Report back to Andrew with:
   - **Branch name**: `feat/per-page-view-state`
   - **Test counts** (passed / failed; flag any NEW failures)
   - **Commit hashes** (Commit 1 → Commit 6 with brief description each)
   - **Smoke checklist** (full list above, copy verbatim)
   - **Logs to look for during smoke** (the `[pvs]` prefix conventions)
   - **Notable findings** (e.g. "Excalidraw `onChange` fires more often than expected; debounce needed extra guard for X")
   - **Deferred items** (per-viewer-independent-mode persistence; replay scrubber historical scrubbing — tier c)
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff feat/per-page-view-state
   git push origin master
   ```

## STOP CONDITIONS

- **Don't build tier (a) or tier (c).** Tier (b) only. Tier (a) is a strict subset and would feel like a regression on reload; tier (c) requires Opus-class design pass and is explicitly deferred.
- **Don't build per-viewer-per-page localStorage state.** That's deferred until Phase 5 task 3 (follow vs independent v2) ships. Document only stores tutor's authoritative state for now.
- **Don't bump `WhiteboardBoardDocumentV1` to V2.** The additive field doesn't require a version bump; bumping triggers migration plumbing that's out of scope.
- **Don't refactor the page-switch flow beyond the two insertion points** (capture-before-swap, apply-after-swap). Adjacent refactors are scope creep.
- **Don't add new package.json deps.** Excalidraw API + existing wire-client + existing document type are sufficient.
- **Don't change CSP / middleware.** No new external origins here.
- **Don't touch `prisma/schema.prisma` or generate migrations.** The document is stored in an existing JSON column; no schema migration required.
- **Don't merge to master yourself.** Branch + push + WAIT for Andrew's smoke + his go-ahead.
- **Don't modify the master plan file** (`~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_*.plan.md`). Orchestrator's job.
- **Don't fire wire events per pixel** of pan motion. Debounce 200ms. Mandatory.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation.
- Per-session ID logging mandatory: `[pvs] pvs=<pageId>` prefix on every state transition.
- Tier (b) only; do NOT escalate scope to (c) even if it seems "almost free."
- Schema extension is additive at v1; NO version bump.
- Anti-loop guard on programmatic viewport applies is non-negotiable (Constraint #6 / Commit 2). Infinite loop on page switch = session-killing bug.
- Replay backward compatibility is non-negotiable (Constraint #3). Old sessions must render normally.
- Logging on every state transition (capture, restore, flush, wire-emit, wire-recv) is mandatory per workspace convention.
