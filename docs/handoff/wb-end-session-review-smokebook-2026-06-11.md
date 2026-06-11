# Smokebook — A3 In-shell post-end-session review (Phase A)

**Branch:** `feat/wb-end-session-review`
**Date:** 2026-06-11
**Scope:** Phase A (functional in-shell mode flip). Phase B (visual polish) deferred to Andrew.

> **IMPORTANT:** jsdom cannot prove end-session correctness. These smoke steps
> require a **real browser session** (Vercel Preview or local dev with a real DB).

---

## What shipped (Phase A)

| Component | Change |
|---|---|
| `WhiteboardSessionShell` | New client component wrapping live + review modes with `mode: "live" \| "review"` state |
| `WhiteboardWorkspaceClient` | Added `onSessionEnded?` prop; replaces `router.replace + router.refresh` when provided |
| `SessionReviewMode` | New in-shell review surface: notes primary + read-only board preview + lazy replay drill-down |
| `TutorNotesSection` | Added `onSaved?` prop for in-shell save (no nav-away; inline "Saved — visible to parent" confirmation) |
| `loadSessionReviewPayload` | New server action loading review data client-side for `SessionReviewMode` |
| `workspace/page.tsx` | Wraps in `WhiteboardSessionShell` instead of bare `WorkspaceResumeGate` |
| `docs/RECORDER-LIFECYCLE.md` | Step 8 updated (in-shell flip + legacy fallback documented) |
| `WhiteboardWorkspaceEnd.dom.test.tsx` | +3 new A3 tests: `onSessionEnded` called, router.replace NOT called, ordering contract preserved |

---

## Pre-smoke verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors, 0 warnings |
| ESLint on new/modified files | ✅ 0 errors, 0 warnings |
| ESLint `WhiteboardWorkspaceClient.tsx` | 2 pre-existing warnings (lines 1834, 3336) — not introduced by this PR |
| `npx jest` | ✅ 13/13 pass in WhiteboardWorkspaceEnd.dom.test.tsx (3 new A3 tests green). Full suite: 4 suites failed (pre-existing DB-connectivity failures — same count as baseline). My branch: **fewer total test failures** (4) than baseline (5) |
| `npx next build` | ✅ Exit 0, route table printed |

---

## Smoke checklist (real-browser required)

### Setup
1. Deploy branch to Vercel Preview or run local dev server (`npm run dev`)
2. Have a real student in the DB with `recordingDefaultEnabled = true`
3. Have `WHITEBOARD_SYNC_URL` set (or note sync-disabled state)

---

### A. Atomic end-session pipeline still completes

Run a real whiteboard session. Click **End session** → confirm.

- [ ] Console shows all pipeline steps in order:
  - `wbsid=<id> ... stopAndUpload` / `flushPendingUploads` (if mic was armed)
  - `drainOutboxOrTimeout ok`
  - `endWhiteboardSession` server action completes (check network tab: 200 from `/api/...` action)
  - `triggerNotesGenerationAction` fire-and-forget logged
  - `revokeJoinTokensForSession` completes
- [ ] Session row in DB: `endedAt` set, `eventsBlobUrl` set, join tokens revoked
- [ ] If mic was armed: `SessionRecording` rows created, audio blobs uploaded
- [ ] No orphan outbox rows in IDB after end (check DevTools → Application → IndexedDB → `tutoring-notes-upload-outbox`)

### B. Shell flips in-place (no nav-away)

- [ ] After confirming End: **URL does not change** (still `/workspace/...`)
- [ ] The whiteboard canvas and live controls disappear
- [ ] The review surface appears in-place with "Session complete — [Student]" header
- [ ] No browser back-forward navigation event fired
- [ ] DevTools console: `[nsi] wbsid=<id> action=review_mode_mount` and `...review_mode_loaded` logged

### C. Mic/camera released + no ghost WebRTC

- [ ] Browser mic indicator (OS-level) disappears after mode flip
- [ ] Browser camera indicator disappears
- [ ] DevTools → Application → WebRTC (or `chrome://webrtc-internals`): no active peer connections
- [ ] Console: sync client `disconnect()` fired (look for `[wb-sync]` or `[avx]` teardown logs)
- [ ] Active-ping interval cleared (no `[wbsid=<id> ping]` logs after mode flip)

### D. Notes editing + save stays in shell

- [ ] Notes skeleton / generating state shown while AI reduces transcript
- [ ] Notes form appears when generation completes
- [ ] Edit a field, click **Save to notes**
- [ ] Confirm: **URL does not change**, inline "✓ Saved — visible to parent" confirmation appears
- [ ] Notes are actually saved: navigate to `/admin/students/[id]/notes` in a separate tab and confirm the note is visible with READY status

### E. Lazy replay drill-down works

- [ ] On review surface, "▶ Review video while editing" button is visible (only if session has audio)
- [ ] Clicking it mounts `WhiteboardReplay` (not pre-fetched on review entry — confirm in network tab: no audio fetch until button click)
- [ ] Player plays audio correctly
- [ ] "✕ Close player" button collapses the player

### F. Standalone revisit route still works

- [ ] Open `/admin/students/[id]/whiteboard/[whiteboardSessionId]` directly in a new tab
- [ ] Read-only review page loads with `WhiteboardReplay` and `TutorNotesSection`
- [ ] No breakage from the TutorNotesSection `onSaved?` prop being absent (standalone still navigates to `/notes` on save — verify)
- [ ] Notes deep link from `TutorStudentNoteExpandedBody` opens the standalone review page correctly

### G. Board preview in review mode

- [ ] Read-only Excalidraw shows the final-frame board strokes
- [ ] Canvas is non-interactive (view-only mode)
- [ ] "Open full replay" link in the board preview header works

---

## Phase B deferred TODOs (do NOT build until Andrew approves)

These are explicitly out of scope for Phase A. List them here for the next executor.

1. **End-confirmation modal** — replace native `window.confirm` on End button with an inline modal per design §5.6 ("End this session?" with Cancel/End buttons, no browser dialog)
2. **Full notes-primary visual layout** — the mock (`whiteboard-session-shell-mock-2026-06-08.html` `#page-review`) has a polished split layout with Mynk styling; Phase A is functional but not pixel-final
3. **Mobile board/video overlay** — on narrow viewports, board preview should be a slide-in overlay (currently stacks in a single column via `@media (max-width: 768px)`)
4. **"Return to board" escape hatch** — design Q6 unresolved; the shell could support live→review→live but the design question is whether the board is read-only in review mode
5. **Top-bar shell chrome** — "Session complete · [Student] · 14m · [Close]" bar shared across modes (Phase A just has the inline "Session complete" card in SessionReviewMode)
6. **Nav-away intercept** — `beforeunload` guard for unsaved notes in review mode
7. **`window.confirm` replacement in TutorNotesSection** — Regenerate + Delete still use native confirm; replace with inline confirmations in Phase B

---

## Architecture notes (for future executor)

### Teardown proof (item 3 from spec)

Conditional mount is the teardown mechanism. When `WhiteboardSessionShell` flips `mode="review"`:
1. The live subtree (`WorkspaceResumeGate + WhiteboardWorkspaceClient`) is **unmounted** by React
2. `WhiteboardWorkspaceClient` unmount effects fire:
   - `syncClientRef.current.disconnect()` — sync client teardown (~L791-812)
   - `useLiveAV` cleanup: mesh/signaling dispose + non-recorder track stop (~L1142-1168, L1549-1571)
   - Active-ping interval clear + final inactive beacon (~L2663-2740)
3. `SessionReviewMode` mounts and calls `loadSessionReviewPayload`

`markPersisted` and `clearSessionSceneDraft` run AFTER `onSessionEnded?.()` because:
- `onSessionEnded()` is a React state-update dispatch (synchronous queue)
- React schedules the remount for the NEXT render commit
- The `handleEndSession` async function continues executing `markPersisted` / `clearSessionSceneDraft` before React processes the render

This is the same timing as the old `router.replace` — both are "schedule something to happen" calls that let the current async context finish.

### `onSessionEnded` fallback

If `onSessionEnded` is not provided (e.g. any caller that doesn't use `WhiteboardSessionShell`), `handleEndSession` falls back to the old `router.replace(reviewHref) + router.refresh()`. This means the standalone review page behavior and any future callers are unaffected.

### Standalone review route

`/admin/students/[id]/whiteboard/[whiteboardSessionId]` (`page.tsx`) is untouched. It continues to:
- Load session data server-side
- Render `WhiteboardReplay` + `TutorNotesSection` (without `onSaved`)
- Work correctly for revisiting past sessions and deep links from notes

`TutorNotesSection` without `onSaved` continues to navigate to `/admin/students/[id]/notes` on save (unchanged behavior).

---

## Commit hash

See `git log --oneline feat/wb-end-session-review` after push.
