# Phase 1 — WB Replay In-Frame: Detailed Executable Plan

> **Rev 3 (2026-06-14):** Amended per [`phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md`](phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md) adversarial review (2 BLOCKERs, 5 SHOULD-FIXes). **BLOCKER-1:** Path A — lift `fields` + `isDirty` into `SessionReviewMode`; controlled-prop API on `TutorNotesSection`; no instance may own unsaved edits alone. **BLOCKER-2:** `WhiteboardReplayInFrame` lazy-mount-once + CSS hide (never unmount within review session); `pause()` on hide; hero uses ordinary conditional render. **S1:** hero thumbnail = final-frame still only. **S2:** full `seek(..., { play?, paint? })` signature + `paintReady` transition rules. **S3:** ADD `beforeunload` + in-app nav guard (none exists today). **S4:** `isDirty` = snapshot-at-mount semantics; poll reconciliation when not dirty. **S5:** Step 1 exit criteria gates admin hardware audio smoke. Rev 2 content otherwise intact.
>
> **Rev 2 (2026-06-14):** Reworked surface/UX per product-owner reconciliation of design §6 with implementation intent. **Rev 1** assumed always-on in-frame replay in a side column; **Rev 2** introduces a **two-state review surface** (notes-hero default + full-viewport replay toggle) inside the WB frame, plus a **notes drawer over replay** (basic). Architecture (Option B isolated overlay), scrubber bug fixes, reuse map, test strategy, and deferred A6-1/A6-6 items are **unchanged** and carried forward. New: `ReviewSurfaceState` machine, `ReplayNotesDrawer`, reserved "Would you agree?" slot (layout only), coexistence answers (unsaved-notes guard, drawer scroll/focus, ended `/workspace` route), expanded acceptance + smokebook items for two-state + drawer flows.
>
> **Branch:** `phase1/wb-replay-in-frame` (off `v1-redesign`)  
> **Program:** Experience-Driven Wedge — Phase 1 / Gate **A6** (replay fidelity)  
> **Authored:** 2026-06-14 (planning pass — no production code modified)  
> **Parent plan:** [`docs/handoff/phase-1-wb-floor-plan-2026-06-13.md`](phase-1-wb-floor-plan-2026-06-13.md)  
> **Hardware evidence:** [`docs/handoff/phase-1-wb-floor-1b-smokebook-2026-06-13.md`](phase-1-wb-floor-1b-smokebook-2026-06-13.md) item 1 FAIL  
> **Design refs:** [`docs/handoff/whiteboard-session-shell-design-2026-06-08.md`](whiteboard-session-shell-design-2026-06-08.md) §1.2 (in-place live→review flip), §6 (notes-primary, lazy replay — reconciled below); mock [`docs/brand-previews/whiteboard-session-shell-mock-2026-06-08.html`](../brand-previews/whiteboard-session-shell-mock-2026-06-08.html) `#page-review` (**hero/landing layout only** — pre-play board thumbnail, not replay-playing layout)  
> **Strategy root:** [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](../research/continuity-wedge-brainstorm-2026-06-12.md)

---

## ⛔ HARD CONSTRAINT — non-negotiable

**Whiteboard workspace engine work is ADDITIVE ONLY.**

The live-session engine in `WhiteboardWorkspaceClient.tsx` (~3,950 lines) couples page/board switching, `pageDataRef` guards, live-sync wiring, recording FSM, PDF insert, graph embeds, and viewport sync. It has **regressed twice** when executors rewrote it instead of extending it (see `AGENTS.md` § "Whiteboard chrome — extend don't rewrite", evidence: wb-chrome-redo P1.1/P2, 2026-06-09).

### "Looks like the live WB" ≠ reuse the live engine

**CRITICAL:** The replay state must **visually mirror** the live whiteboard chrome (same `.mynk-wb-chrome` language, top bar proportions, canvas well, bottom timeline strip) but as a **read-only style-mirror** layered over an **isolated** Excalidraw replay canvas (Option B). It does **NOT** mean mounting, forking, or refactoring `WhiteboardWorkspaceClient.tsx`.

| Allowed | Forbidden |
|---|---|
| New `ReplayBoardChrome` that **styles** like `LiveBoardChrome` (`src/components/whiteboard/chrome/LiveBoardChrome.tsx`) — same tokens, `data-mode="replay"`, read-only affordances | Mounting replay inside `WhiteboardWorkspaceClient` or reusing its page/sync/recording state machine |
| New components, hooks, handlers, JSX, CSS scoped to replay | Rewriting or refactoring `WhiteboardWorkspaceClient.tsx` engine logic |
| Isolated `ReplayCanvasSurface` + `useReplayTimelineController` (Option B) | Behavioral changes to `pageSwitchProgrammaticRef`, `pageDataRef`, sync effects, or recording FSM |
| Surgical wiring in `SessionReviewMode.tsx` / `WhiteboardSessionShell.tsx` (swap child components, add review sub-state) | "Simplifying" `WhiteboardReplay.tsx` by deleting half its guards in the same PR as the in-frame mount |
| Extracting shared libs/hooks FROM `WhiteboardReplay.tsx` | Treating the HTML mock's board thumbnail as the replay-playing layout |

**Executor pre-flight:** before any edit, `git diff` must show **zero** changes to live-engine behavioral paths in `WhiteboardWorkspaceClient.tsx` except an optional one-line import if absolutely required (default: **no touches**).

---

## Architecture decision

### Options evaluated

| | **(A) Reuse live workspace Excalidraw as replay surface** | **(B) In-frame replay overlay — isolated Excalidraw + unified timeline** |
|---|---|---|
| **Idea** | Flip `WhiteboardWorkspaceClient` (or a fork) into read-only replay mode inside `LiveBoardChrome` | New `ReplayBoardChrome` + own Excalidraw instance inside the WB frame; timeline controller drives audio + scene together |
| **Fidelity** | Theoretically highest (same mount path as live) | High — same `scene-paint` engine + `reconstructSceneAt` as live resume and existing replay |
| **Engine risk** | **Critical** — must interact with `pageDataRef`, `activePageIdRef`, `pageSwitchProgrammaticRef` (L470, L2005, L2277+), sync client (L791+), recorder hook (L2192+) | **Low** — zero coupling to live engine; mirrors `WorkspacePreviousSessionPreview` pattern (separate surface, shared scene-paint) |
| **Prior art** | Two failed chrome rewrites on this file | `WorkspacePreviousSessionPreview.tsx` + `WhiteboardReplay.tsx` already prove isolated Excalidraw + scene-paint composability |

### Recommendation: **(B) — in-frame replay overlay** (unchanged from Rev 1)

**Justification (concrete file evidence):**

1. **`WhiteboardWorkspaceClient.tsx` is not a safe replay host.** Multi-page state is keyed by `pageDataRef` / `activePageIdRef` with `pageSwitchProgrammaticRef` suppressing recorder flushes (L2005, L2059, L3406). Replay would need to either fake page switches (touches engine guards) or ignore multi-page (A6-6 gap). `event-log.ts` L161–164 explicitly documents that per-page navigation is **not** in the replay event stream today.

2. **`LiveBoardChrome` is live-only.** `LiveBoardChrome.tsx` L28–31: "Presentational chrome frame for the **live** whiteboard" with mandatory slots for `toolStrip`, `bottomToolbar`, `boardTabStrip` — all recording/live affordances. Achieve visual parity via **CSS + slot subset** in `ReplayBoardChrome`, not by driving replay through the live chrome tree.

3. **Existing replay is already isolated.** `WhiteboardReplay.tsx` (~1,587 lines) owns its own lazy Excalidraw (`viewModeEnabled`), hidden `<audio>`, custom scrubber, and `createThrottledPlayLoop` — deliberately **not** imported by the workspace engine. The bugs are in timeline/scrubber orchestration, not in engine coupling.

4. **In-shell review today is split and out-of-frame.** `SessionReviewMode.tsx` L218–276: `WorkspacePreviousSessionPreview` (final frame only) + lazy `WhiteboardReplay` below the fold ("Review video while editing"). Andrew's 1b smoke (item 1 Notes): replay still feels like an external page; scrubber broken. The fix is **two-state UX composition** inside the WB frame, not engine reuse.

5. **Design mock shows hero landing, not replay-playing.** `whiteboard-session-shell-mock-2026-06-08.html` `#page-review`: notes-primary column + board thumbnail / "Review video while editing" CTA — aligns with **hero state** default. Full-viewport replay is a **second state** toggled on demand (Rev 2).

---

## Two-state review surface (Rev 2 — authoritative UX)

### Shell context (unchanged)

`WhiteboardSessionShell.tsx` keeps `mode: "live" | "review"` — in-place flip on End Session, same URL (`workspace/page.tsx`). **Do not** change this mechanism. All work below is inside `SessionReviewMode` once `mode === "review"`.

### Sub-state machine: `ReviewSurfaceState`

```typescript
// src/app/.../workspace/review-surface-state.ts (new — types + helpers only)
type ReviewSurfaceState = "hero" | "replay";
```

| State | Default? | What renders | Entry | Exit |
|---|---|---|---|---|
| **`hero`** | **Yes** — landing on End Session | Notes-hero layout: reserved confirm slot + `TutorNotesSection` + board thumbnail CTA | End Session flip; "Back to notes" from replay; unsaved-notes guard may intercept | User clicks **Replay** / Play on thumbnail → `replay` (after guard if dirty) |
| **`replay`** | No | Full-viewport `WhiteboardReplayInFrame` inside WB frame + unobtrusive scrubber; optional `ReplayNotesDrawer` overlay | From `hero` via replay CTA | Pause + **Back to notes**; or drawer-only interaction (stays in `replay`) |

**State owner:** `SessionReviewMode` holds `reviewSurface: ReviewSurfaceState` (default `"hero"`). Reset to `"hero"` on each fresh mount (new End Session). Do **not** persist surface sub-state across navigations.

**Lifted notes state (BLOCKER-1 — Path A):** `SessionReviewMode` is the **sole owner** of in-memory notes edits for the review session. **No `TutorNotesSection` instance may be the sole owner of unsaved edits** — hero and drawer instances are controlled views over the same lifted state.

```typescript
// SessionReviewMode — lifted notes state (new)
type StructuredFields = {
  topics: string;
  assessment: string;
  nextSteps: string;
  links: string;
};

// Captured ONCE when lifted state initializes (snapshot-at-mount — S4)
const initialParsedFields: StructuredFields = parseNoteContent(payload.initialNote.content);

const [notesFields, setNotesFields] = useState<StructuredFields>(initialParsedFields);
const isDirty =
  JSON.stringify(notesFields) !== JSON.stringify(initialParsedFields);
```

**`TutorNotesSection` controlled-prop API (additive — uncontrolled callers unchanged):**

```typescript
// New optional props on TutorNotesSection
fields?: StructuredFields;
onFieldsChange?: (fields: StructuredFields) => void;
```

| Mode | When | Behavior |
|---|---|---|
| **Controlled** | `fields` + `onFieldsChange` both provided | Component does **not** hold internal `fields` state; all edits flow through props. Used by in-shell review (hero + drawer). |
| **Uncontrolled** | Props omitted | Existing internal `useState` + poll sync — **standalone `/notes` and other existing callers keep working unchanged.** |

**Save path:** `saveSessionNotesAction(whiteboardSessionId, notesFields)` must read from **lifted `notesFields` in `SessionReviewMode`**, not from a child instance's internal state. Wire Save button in both hero and drawer controlled instances to call save with the lifted fields (pass `notesFields` into the save handler or lift save callback to `SessionReviewMode`).

**Poll / auto-generation reconciliation (S4):** `TutorNotesSection`'s existing poll `useEffect` (re-syncs `fields` from server `note.content`) must **not** overwrite user edits. When controlled: poll updates are adopted into lifted state **only when `!isDirty`**. When uncontrolled: same rule via internal guard. Never re-fetch or poll solely to recompute `isDirty` mid-edit.

**Logging:**

```
[nsi] wbsid=<id> action=review_surface_hero_mount
[nsi] wbsid=<id> action=review_surface_replay_enter
[nsi] wbsid=<id> action=review_surface_hero_return from=replay
[nsi] wbsid=<id> action=review_notes_drawer_open|close open=<bool>
```

### State 1 — Hero (notes-primary)

**Product goal:** Tutor should not have to type anything — auto-generated notes are the hero. Editing via `TutorNotesSection` + nsi save flow is the **working** content now.

**Layout (desktop ≥768px):** Match mock proportions — notes column ~38% (primary), board column ~62% (secondary). Reference: mock `#page-review` `.review-notes-panel` + `.review-board-panel`.

**Layout (mobile <768px):** Notes full-width dominant; board column becomes thumbnail + replay CTA only (no persistent side column). "Board & video" pattern from design §7.4.3 — secondary, not space-stealing.

**Hero composition:**

```
SessionReviewMode (reviewSurface === "hero")
├── ReviewHeroTopBar          ← session complete, duration, "Open full replay" link
├── ReviewHeroLayout (grid)
│   ├── ReviewNotesHeroColumn
│   │   ├── ReviewConfirmSlot   ← RESERVED — empty placeholder, Phase 2 drop-in
│   │   └── TutorNotesSection   ← controlled: fields={notesFields} onFieldsChange={setNotesFields}
│   └── ReviewBoardThumbnailColumn
│       ├── BoardThumbnailPreview  ← static FINAL-FRAME still (S1 — matches WorkspacePreviousSessionPreview)
│       └── ReplayEntryCTA         ← "▶ Replay session" → reviewSurface = "replay"
```

**`ReviewConfirmSlot` (layout only — Phase 2 content deferred):**

- Render a visually distinct reserved region above `TutorNotesSection`: `data-testid="wb-review-confirm-slot"`, `aria-hidden="true"` when empty, min-height ~80px, dashed border + muted label *"Session insights — coming soon"*.
- **Do not** build agree/disagree UI, reduction engine, or evaluative statement content.
- Slot must accept a future `<ReviewConfirmSection />` without restructuring the hero grid.

**Board thumbnail in hero (not full replay) — S1 decided:**

- The hero board thumbnail shows the **final frame** (same paint pattern as `WorkspacePreviousSessionPreview` today) — the board state at session end, which is the context the tutor needs while writing notes.
- Implement via `ReviewBoardThumbnail` reusing `createScenePainter` + final-frame `applySceneAt(totalMs)` (or equivalent final-frame apply) — **no scrubber, no audio preload, no t=0 still**.
- **Never** show the final frame in the replay-playing surface (`ReplayCanvasSurface`) — that is B2's anti-pattern (final-frame flash before play). Hero thumbnail ≠ replay canvas.
- CTA: `data-testid="wb-review-enter-replay"` — transitions to `replay` state (lazy-mounts `WhiteboardReplayInFrame` on first enter per BLOCKER-2).

### State 2 — Replay (full-viewport, live-WB look, read-only)

**Product goal:** Tutor watches session replay in a surface that **feels like the live board** — same chrome visual language — but canvas is read-only and timeline is unobtrusive.

**Layout:** `WhiteboardReplayInFrame` occupies the **full review content area** (not a side column). `ReplayBoardChrome` mirrors live chrome styling:

- Top bar: session label, student name, duration, **Back to notes** (`data-testid="wb-replay-back-to-notes"`), optional "Open full replay" link
- Canvas well: `ReplayCanvasSurface` (isolated Excalidraw `viewModeEnabled`)
- Bottom: `ReplayTimelineScrubber` — fixed strip, unobtrusive (48px), always visible
- **No** tool strip, board tabs, insert actions, or recording controls — styled absence, not disabled live widgets

**Replay entry behavior:**

- First enter from hero: lazy-load replay bundle (same `dynamic()` pattern as today); controller `seek(0, { paint: true, play: false })` before reveal (B2 fix — see `paintReady` gate in § Unified timeline).
- **Play** from idle: `seek(0, { play: true })` per first-play policy (B3).
- **Back to notes:** call `controller.pause()`; set `reviewSurface = "hero"`; hide replay wrapper (BLOCKER-2 — do **not** unmount). Hero thumbnail remains final-frame still.

**Persistence contract — `WhiteboardReplayInFrame` (BLOCKER-2 — mandatory):**

| Surface | Mount strategy | On hero↔replay toggle |
|---|---|---|
| **`WhiteboardReplayInFrame`** | **Lazy-mounted once** on first replay entry (`hasEnteredReplay` ref or equivalent) | On "Back to notes": wrapper **hidden** via CSS `display: none` + `aria-hidden="true"` — **NEVER unmounted** after first enter (within the same review session). On re-show: wrapper visible again; preserved `globalMs` already reflected in scrubber. |
| **Hero layout** (`ReviewHeroLayout`, etc.) | Ordinary conditional render when `reviewSurface === "hero"` | Safe to mount/unmount — notes edits survive via lifted state (BLOCKER-1), not hero instance state. |

**On hide (hero return):** call `controller.pause()` so audio cannot ghost-play after the wrapper is hidden.

**On re-show (re-enter replay):** do **not** call `seek(preservedGlobalMs, …)` unless position drift is observed — audio element and `globalMs` are preserved. If a layout/resize event fires when the container becomes visible again, call Excalidraw `api.refresh?.()` once.

**Executor anti-pattern (forbidden):** `{reviewSurface === "replay" && <WhiteboardReplayInFrame />}` without a persist-once wrapper — this destroys controller state and resets scrubber to 0 on every "Back to notes."

**No-audio sessions:** Hero shows replay CTA when `eventsProxyUrl` exists; replay state uses synth timeline (controller no-audio path). Recommend: include — same as Rev 1 open decision #3, now **decided in**.

### Notes drawer over replay (in scope — basic)

Because replay canvas is read-only, a slide-out notes panel can overlay the board **during replay** without blocking drawing (there is none). Enables "type and watch at the same time" without PiP or split-screen.

**Component:** `ReplayNotesDrawer.tsx`

| Requirement | Implementation |
|---|---|
| Reuse notes UI | Mount `TutorNotesSection` in **controlled** mode: `fields={notesFields}` `onFieldsChange={setNotesFields}` — same lifted state as hero (BLOCKER-1). Optional `variant="drawer"` for layout; **do not fork save logic** |
| Audio keeps playing | Drawer open/close does **not** call `pause()` on timeline controller; typing does not steal audio focus (hidden `<audio>` unchanged) |
| Scrubber stays visible | Drawer docks **left or right** (~360px max-width desktop, full-width bottom sheet on mobile); `z-index` above canvas, **below or beside** scrubber strip — scrubber strip is **never** covered. Use `pointer-events: none` on drawer backdrop if any; drawer panel `pointer-events: auto` |
| Open/close | Toggle button in `ReplayBoardChrome` top bar: `data-testid="wb-replay-notes-drawer-toggle"`; `aria-expanded`; ESC closes drawer, does not exit replay state |
| Default | Closed on replay enter |

**Drawer + scrub interaction (coexistence — specified):**

| Concern | Behavior |
|---|---|
| Audio while typing | **Continues.** Drawer edits do not pause/scrub. |
| Which surface scrolls | **Drawer body** scrolls (`overflow-y: auto` on notes fields). Replay canvas does not scroll. Page/body behind replay is `overflow: hidden` in replay state. |
| Focus | Focus moves to drawer on open (first focusable field). On close, focus returns to drawer toggle. Scrubber remains keyboard-accessible via tab order **after** drawer content when drawer open. |
| Scrub while drawer open | Allowed — scrubber stays visible and functional; scene + audio seek normally; drawer text preserved. |

---

## Chosen component boundary (extended for two-state + drawer)

```
WhiteboardSessionShell (mode: live | review — unchanged)
  └── SessionReviewMode
        ├── reviewSurface: "hero" | "replay"
        ├── notesFields + setNotesFields   ← BLOCKER-1 lifted state (sole owner of edits)
        ├── isDirty (snapshot-at-mount)    ← S4
        ├── hasEnteredReplay (ref)         ← BLOCKER-2 lazy-mount gate
        │
        ├── [hero, conditional render] ReviewHeroLayout
        │     ├── ReviewConfirmSlot (placeholder)
        │     ├── TutorNotesSection (controlled)
        │     └── ReviewBoardThumbnail (final-frame) + ReplayEntryCTA
        │
        └── [persist-once wrapper — display:none when hero]
              WhiteboardReplayInFrame      ← NEVER unmounted after first enter
              ├── ReplayBoardChrome
              │     ├── replayTopBar
              │     ├── ReplayCanvasSurface
              │     └── ReplayTimelineScrubber
              ├── ReplayNotesDrawer
              │     └── TutorNotesSection (controlled — same notesFields)
              └── useReplayTimelineController
```

**What gets reused vs replaced from `WhiteboardReplay.tsx`:**

| Piece | Disposition |
|---|---|
| Fetch/parse/preload/asset-registration effects | **Extract** → `useReplayTimelineController` + `ReplayCanvasSurface` |
| `seekGlobalMs`, segment swap, rAF loop, synth clock | **Extract + rewrite** → controller hook (fix bugs at this layer) |
| Scrubber JSX + Play/Pause | **Replace** → `ReplayTimelineScrubber` (fixed bottom strip inside chrome) |
| Outer card layout (`<h2>`, standalone grid) | **Not used** in-frame; admin/share keep old wrapper temporarily |
| `WhiteboardReplay.tsx` default export | **Keep** as thin wrapper around shared hook for admin/share routes during transition |

### New files (Rev 2 additions marked †)

| File | Purpose |
|---|---|
| `src/hooks/useReplayTimelineController.ts` | Timeline state machine: load, seek, play, segment advance, `totalMs` oracle |
| `src/components/whiteboard/replay/ReplayBoardChrome.tsx` | Presentational replay frame — **style-mirror** of `LiveBoardChrome`, not a fork of live engine |
| `src/components/whiteboard/replay/ReplayCanvasSurface.tsx` | Isolated Excalidraw + scene painter + asset preload |
| `src/components/whiteboard/replay/ReplayTimelineScrubber.tsx` | Play/Pause + range + elapsed/total labels |
| `src/components/whiteboard/replay/WhiteboardReplayInFrame.tsx` | Composes chrome + canvas + scrubber; props mirror `WhiteboardReplayProps` minus standalone `title` card |
| `src/components/whiteboard/replay/ReplayNotesDrawer.tsx` † | Slide-over notes panel during replay |
| `src/app/.../workspace/ReviewConfirmSlot.tsx` † | Reserved placeholder for Phase 2 confirm section |
| `src/app/.../workspace/ReviewHeroLayout.tsx` † | Hero-state grid composition |
| `src/app/.../workspace/review-surface-state.ts` † | `ReviewSurfaceState` type + transition helpers |
| `src/__tests__/whiteboard/replay-timeline-controller.test.ts` | Jest: seek/play/boundary math with independent oracle |
| `src/__tests__/dom/WhiteboardReplayInFrame.dom.test.tsx` | jsdom: mount + testids; no geometry |
| `src/__tests__/dom/SessionReviewMode.dom.test.tsx` † | jsdom: hero default, state transitions (mocked replay) |

---

## Context: current replay mounts (verified)

There is **no** `/replay` route. Playback mounts via shared `src/components/whiteboard/WhiteboardReplay.tsx` from:

| Surface | File | Notes |
|---|---|---|
| Admin review page | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx` L293 | Full-page replay |
| Share replay | `src/app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx` L169 | Parent-facing |
| In-shell post-end review | `SessionReviewMode.tsx` L269 | Lazy drill-down only — **replaced by two-state model** |
| Final-frame preview (no scrubber) | `WorkspacePreviousSessionPreview.tsx` | **Not** replay — last frame only |

### Ended `/workspace` revisit vs in-shell review (coexistence)

| Surface | When | Component | Relation to Rev 2 |
|---|---|---|---|
| **In-shell review** | Immediately after End Session (`WhiteboardSessionShell` `mode="review"`) | `SessionReviewMode` two-state surface | **This plan** |
| **Ended workspace revisit** | Tutor navigates to `/workspace` URL after session already ended (`workspace/page.tsx` L128–171) | `WorkspacePreviousSessionPreview` | **Unchanged** — separate route branch; static final-frame + "Start new session". Do **not** regress. |

Andrew's 1b smoke confusion ("Previous whiteboard session — read only preview") was from **revisiting ended `/workspace`**, not from post-end in-shell review. Rev 2 makes in-shell review notes-hero by default; ended-route preview stays as-is until a dedicated unification follow-up.

**Explicit non-regression:** `WorkspacePreviousSessionPreview` remains on ended `/workspace` route. Remove it from **in-shell** `SessionReviewMode` hero column (replaced by `ReviewBoardThumbnail` + replay toggle). Do not delete the component.

---

## Unsaved-notes protection (coexistence — specified)

**`isDirty` definition (S4 — snapshot-at-mount):** Captured once when lifted state initializes:

```typescript
const initialParsedFields = parseNoteContent(payload.initialNote.content); // never updated by polls
const isDirty = JSON.stringify(notesFields) !== JSON.stringify(initialParsedFields);
```

- **Not** dirty-vs-latest-server-content (poll race would flip `isDirty` false mid-edit).
- **Not** "any keystroke" — revert-to-initial is not dirty.
- Poll / auto-generation: adopt incoming generated content into `notesFields` **only when `!isDirty`** (see § Lifted notes state).

| Transition | Guard |
|---|---|
| Hero → Replay (`reviewSurface` `"hero"` → `"replay"`) | If `isDirty`, show inline confirm: *"You have unsaved note changes. Continue to replay?"* `[Stay]` `[Continue]` — **Continue preserves edits** because `notesFields` lives in `SessionReviewMode`, not in the unmounting hero instance (BLOCKER-1) |
| Replay → Hero (Back to notes) | No guard — drawer + hero share lifted `notesFields` |
| Drawer close | No guard |
| Browser hard-close / external nav | **ADD** `beforeunload` guard in `SessionReviewMode` (S3 — **does not exist today**; do not assume "extend") |

**`beforeunload` + in-app nav guard (S3 — ADD, not extend):**

```typescript
// SessionReviewMode — new useEffect
useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); }; // custom text not shown in modern browsers
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

- Fires when `isDirty === true` in **either** `reviewSurface` (`"hero"` or `"replay"`).
- **Limits:** `beforeunload` cannot show custom message text (browser default only). In-app Next.js router navigation needs a separate intercept where feasible (e.g. link-click confirm or `router.events` / App Router equivalent) — document any gaps in smokebook Notes if not fully covered.

**Do not** auto-save on state switch. Tutor explicitly Saves via existing nsi flow reading lifted `notesFields`.

---

## Known bugs (1b smoke item 1 FAIL) — root causes + fix mechanisms

(Unchanged from Rev 1 — fixes land in `useReplayTimelineController`.)

| # | Symptom | Likely root cause in current `WhiteboardReplay.tsx` | Fix in new controller |
|---|---|---|---|
| **B1** | Scrubber doesn't start at beginning or end (range/position wrong) | `scrubberMax` overshoot; `resolvedMaxMs` may be **0** when DB durations null; scrubber `value` not reset on segment-list change | **`totalMs` oracle:** `max(measuredAudioTotalMs, maxEventTimestampMs(log), 1)`. Initialize `globalMs = 0`. |
| **B2** | Final-board frame flashes at t=0 before playback | Initial paint races; `snapshotBlobUrl` may paint final PNG | **Gate visibility:** `ReplayCanvasSurface` `opacity: 0` until `paintReadyAtT0`. **Never** pass `snapshotBlobUrl` into in-frame replay. `seek(0, { paint: true, play: false })` before reveal. |
| **B3** | Audio starts at scrubber-drop position instead of 0 when user expected start | `handleAudioPlayToggle` calls `el.play()` without seek | **First-play-from-idle:** `seek(0, { play: true })` when `!hasEverPlayed`. After first play, scrub position authoritative. |
| **B4** | Tutor audio scratchy | Record-side — **deferred** | N/A |

---

## Unified timeline / scrubber design

(Unchanged from Rev 1 — single `globalMs` source of truth, `seek()` contract, play/pause/end policies.)

### Single source of truth: `globalMs`

```typescript
// src/hooks/useReplayTimelineController.ts (new)
type ReplayTimelineState = {
  globalMs: number;           // 0 .. totalMs — scrubber position + scene time
  totalMs: number;            // authoritative ceiling
  playing: boolean;
  activeSegmentIndex: number;
  loadState: "idle" | "loading" | "ready" | "error";
  paintReady: boolean;        // canvas may be shown
};
```

**Seek contract** — one function, both channels (S2 — full signature):

```typescript
seek(globalMs: number, opts?: { play?: boolean; paint?: boolean }): void
```

| Option | Default | Behavior |
|---|---|---|
| `play` | `false` | When `true`, start audio/synth playback after seek. |
| `paint` | `false` | When `true`, synchronously `applySceneAt(globalMs)` and set `paintReady = true`. When `false` (user scrubs), `applySceneAt` still runs but `paintReady` is **not** affected. |

**`paintReady` transition rules (B2 — S2):**

| Rule | Value |
|---|---|
| Initial value | `false` — `ReplayCanvasSurface` stays `opacity: 0` until ready |
| `false → true` | First `seek(0, { paint: true, play: false })` on replay entry completes `applySceneAt(0)` — canvas shows **reconstructed-at-0 scene** (empty or first stroke), **NOT** the final frame, before audio starts |
| `true → false` | Only on new session load / controller reset — **not** on user scrub |
| Empty log (0 events) | Set `paintReady = true` immediately after first `applySceneAt(0)` (trivial empty scene) |

**Implementation order** (align with existing `seekGlobalMs` — avoids scrubber one-frame lag):

`clamp → update globalMs → update playing → applySceneAt → loadSegmentAt`

**Play/pause:**

- **Play:** `seek(hasEverPlayed ? globalMs : 0, { play: true })`; set `hasEverPlayed = true`.
- **Pause:** `el.pause()` + stop synth rAF; `playing = false`.
- **End:** `isAtEnd = true`, `playing = false`, no loop; scrubber at `totalMs`.

Reuse existing libs **without modification:** `replay-parse.ts`, `replay-audio-timeline.ts`, `event-log.ts`, `scene-paint.ts`, `webm-duration-fix.ts`.

---

## Deferred (out of scope — explicit)

| Item | Rationale |
|---|---|
| **Picture-in-Picture / half-screen split layout** | Notes drawer covers near-term "type while watching" need; PiP is fast-follow pending pilot feedback |
| **"Would you agree?" reduction engine + content** | Phase 2 — hero includes `ReviewConfirmSlot` placeholder only |
| **A6-1 multi-segment player** | Separate thread; graceful degradation + banner in this branch |
| **A6-6 multi-page / board-tabs replay** | No `pageSwitch` in events.json; `reconstructSceneAt` is flat stream |
| **Laser pointer in replay** | Not in events.json; needs record-side change |
| **Tutor scratchy audio (B4)** | Record-side graph/encoding; note in smokebook, do not block merge |
| **Ended `/workspace` → in-shell replay unification** | Keep `WorkspacePreviousSessionPreview` on ended route; follow-up thread |
| **Admin/share page reskin to in-frame chrome** | Transition: shared hook parity first; cosmetic follow-up |

### Multi-segment handling (A6-1) — graceful degradation

When `effectiveSegments.length > 1`, show non-blocking chip: *"Multi-part recording — timing may drift at part boundaries"* (`data-testid="wb-replay-multi-segment-notice"`). Controller handles N segments without crashing; boundary hitch fix is follow-up `phase1/wb-replay-a6-1`.

### Multi-page / board tabs (A6-6)

Document limitation in `WhiteboardReplayInFrame` + release note. Do **not** fake `BoardTabStrip` until record-side emits page context.

### Laser pointer

Note in smokebook **Ignore this run**; do not fail replay on missing laser.

---

## Reuse map (file by file)

| File | Disposition |
|---|---|
| `src/lib/whiteboard/replay-parse.ts` | **Reuse as-is** |
| `src/lib/whiteboard/replay-audio-timeline.ts` | **Reuse as-is** |
| `src/lib/whiteboard/event-log.ts` | **Reuse as-is** |
| `src/lib/whiteboard/scene-paint.ts` | **Reuse as-is** |
| `src/lib/audio/webm-duration-fix.ts` | **Reuse as-is** |
| `src/lib/whiteboard/resolve-asset-read-url.ts` | **Reuse as-is** |
| `src/components/whiteboard/GraphEmbeddable.tsx` | **Reuse as-is** |
| `src/hooks/useExcalidrawThemeFromSystem.ts` | **Reuse as-is** |
| `src/components/whiteboard/WhiteboardReplay.tsx` | **Wrap** — refactor internals to call `useReplayTimelineController`; keep export stable |
| `src/components/whiteboard/TutorNotesSection.tsx` | **Extend** — optional controlled API (`fields?`, `onFieldsChange?`); poll guard when controlled; uncontrolled callers unchanged; hero + drawer both controlled from `SessionReviewMode` |
| `src/app/.../notes-actions.ts` | **Reuse as-is** — nsi save flow |
| `src/app/.../workspace/WorkspacePreviousSessionPreview.tsx` | **Keep** on ended `/workspace` route; **remove from in-shell hero** |
| `src/app/.../workspace/SessionReviewMode.tsx` | **Wire** — two-state machine + hero/replay layouts + drawer |
| `src/app/.../workspace/WhiteboardWorkspaceClient.tsx` | **DO NOT TOUCH** |
| `src/app/.../workspace/WhiteboardSessionShell.tsx` | **No engine edits** — optional layout props only |
| `src/app/admin/.../whiteboard/[id]/page.tsx` | **No change** in phase 1 (transition) |
| `src/app/s/[token]/whiteboard/[id]/page.tsx` | **No change** in phase 1 (transition) |
| `src/components/whiteboard/chrome/LiveBoardChrome.tsx` | **Reference only** — visual reference for `ReplayBoardChrome`; do not import live slots |
| `src/app/.../workspace/whiteboard-chrome.css` | **Extend** — `.mynk-wb-chrome[data-mode="replay"]` rules |

---

## Migration / coexistence

| Phase | Behavior |
|---|---|
| **This branch** | In-shell `SessionReviewMode`: hero default + full-viewport replay toggle + notes drawer. Admin + share keep `WhiteboardReplay` (shared hook internally). |
| **Transition** | Both players coexist; bugfixes land in both via shared hook. |
| **Later** | Admin/share migrate to `WhiteboardReplayInFrame` OR reskin wrapper. |
| **Delete policy** | **Do not delete** `WhiteboardReplay.tsx` until admin/share migrated + smoke PASS. |
| **Ended `/workspace`** | `WorkspacePreviousSessionPreview` **unchanged** — do not regress. |

---

## Implementation steps (executor order)

### Step 0 — Branch + baseline

```powershell
git checkout v1-redesign
git pull origin v1-redesign
git checkout -b phase1/wb-replay-in-frame
npx jest --runInBand --testPathPatterns "whiteboard/replay"
```

### Step 1 — Extract `useReplayTimelineController` (no UI)

1. Create `src/hooks/useReplayTimelineController.ts`.
2. Move from `WhiteboardReplay.tsx` with **behavioral fixes** (B1–B3).
3. Refactor `WhiteboardReplay.tsx` to consume the hook — **parity PR** before new UI.
4. Run: `npx jest --runInBand --testPathPatterns "WhiteboardReplay|replay"`

**Exit criteria:**

- Existing replay tests green (`npx jest --runInBand --testPathPatterns "WhiteboardReplay|replay"`).
- Admin review page still renders.
- **Real-browser / hardware smoke gate (S5 — mandatory before Step 2):** On `/admin/students/<id>/whiteboard/<wbsid>` (full review page), manually verify: load a session **with audio**, press Play, scrub mid-session, confirm **audio + scene stay in sync**. Reference: hardware smokebook items **2 + 4** and [`phase-1-wb-floor-1b-smokebook-2026-06-13.md`](phase-1-wb-floor-1b-smokebook-2026-06-13.md) (jsdom cannot catch WebM duration, audio decode, or scrubber drag). **Do not advance to Step 2** until this passes — hook extraction moves ~400 lines of guarded effects; jest green alone is insufficient.

### Step 2 — New replay chrome components

1. **`ReplayBoardChrome.tsx`** — style-mirror `LiveBoardChrome`:
   - `data-mode="replay"` on `.mynk-wb-chrome`
   - Slots: `topBar`, `canvas`, `timelineStrip`, `drawerSlot?`
   - Read-only: no tool strip / board tabs / live controls
   - Import `whiteboard-chrome.css`; replay overrides at bottom.

2. **`ReplayCanvasSurface.tsx`** — isolated Excalidraw; gate on `paintReady`.

3. **`ReplayTimelineScrubber.tsx`** — bottom strip inside chrome; testids per Rev 1.

4. **`WhiteboardReplayInFrame.tsx`** — compose chrome + canvas + scrubber.

5. **`ReplayNotesDrawer.tsx`** — slide-over; mounts `TutorNotesSection`; scrubber never covered.

### Step 3 — Hero state + two-state wire in `SessionReviewMode`

1. **Lift notes state (BLOCKER-1):** `notesFields`, `setNotesFields`, `initialParsedFields` snapshot, `isDirty` in `SessionReviewMode`. Add controlled props to `TutorNotesSection`; wire save to lifted `notesFields`.
2. Add `reviewSurface` state + `hasEnteredReplay` ref + `ReviewHeroLayout` + `ReviewConfirmSlot` placeholder.
3. **`ReviewBoardThumbnail`** — **final-frame** still only (S1); `ReplayEntryCTA`.
4. Replace L218–276 block: remove `WorkspacePreviousSessionPreview` + old lazy `WhiteboardReplay` drill-down from hero.
5. **Mount strategies (BLOCKER-2):** Hero → ordinary conditional render when `reviewSurface === "hero"`. Replay → lazy-mount `WhiteboardReplayInFrame` once on first enter; thereafter `display: none` / show toggle — **never unmount**. `pause()` on hide.
6. Wire unsaved-notes guard (hero → replay) + **ADD** `beforeunload` guard (S3).
7. `ReplayNotesDrawer`: controlled `TutorNotesSection` sharing `notesFields`.
8. Keep top bar "Open full replay" link.

### Step 4 — CSS (theme-agnostic)

Per `both-theme-components.mdc`: tokens only.

```css
.mynk-wb-chrome[data-mode="replay"] .mynk-wb-replay-timeline {
  height: 48px;
  flex-shrink: 0;
  z-index: 20; /* above drawer backdrop, drawer panel beside/below top bar */
}
.mynk-wb-chrome[data-mode="replay"] .mynk-wb-replay-drawer {
  /* dock left/right; max-width 360px; does not cover timeline strip */
}
.mynk-wb-chrome[data-mode="replay"] .mynk-wb-body {
  /* single column: canvas fills */
}
```

Replay state: full viewport within review area. Hero state: `wb-review-layout` grid per mock.

### Step 5 — Tests + build

```powershell
npx jest --runInBand --testPathPatterns "replay-timeline-controller|WhiteboardReplay|WhiteboardReplayInFrame|SessionReviewMode"
npx next build
```

---

## Test strategy

### Agent-runnable Jest (CI-safe)

**Independent oracle rule:** timeline tests use walk-the-durations oracle, never constants back-derived from hook implementation.

| Test file | What it proves |
|---|---|
| `replay-audio-timeline.test.ts` | **Already exists** |
| `replay-timeline-controller.test.ts` | **New** — seek/segment/`totalMs`/first-play/end-state |
| `replay.test.ts` | **Already exists** — `reconstructSceneAt` at 0 vs final |
| `WhiteboardReplay.dom.test.tsx` | **Must stay green** after hook extraction |
| `WhiteboardReplayInFrame.dom.test.tsx` | **New** — mounts, scrubber testids, load gate |
| `SessionReviewMode.dom.test.tsx` | **New** — default `hero`; CTA switches to `replay` (mock `WhiteboardReplayInFrame`); confirm slot present; dirty guard blocks transition; lifted `notesFields` survives hero↔replay toggle (mock) |

### jsdom blind spot — MUST hardware/smoke

| Concern | Why jsdom fails | Proof venue |
|---|---|---|
| Scrubber drag geometry | No reliable range input events | Hardware smokebook |
| Audio-scene visual sync | No real audio decode | Hardware smokebook |
| **Drawer-over-board layout** | No real layout; z-index/stacking | Hardware smokebook item 6 |
| **Full-viewport replay chrome** | Canvas + chrome proportions | Hardware smokebook |
| WebM duration fix | `el.duration` NaN in jsdom | Desktop Chrome smoke |
| Multi-segment boundary hitch | Network + codec | Deferred A6-1 smoke |
| Theme parity | Excalidraw canvas background | Both themes in smoke |
| Unsaved-notes confirm UX | Dialog + focus | Hardware smokebook item 7 |

---

## Hardware smokebook stub

Conforms to [`docs/handoff/SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md).  
**Preview URL:** fetch via Vercel MCP — `list_deployments` → `meta.githubCommitRef=phase1/wb-replay-in-frame`.

---

# Phase 1 — WB Replay In-Frame Smoke Runbook (STUB)

**Branch:** `phase1/wb-replay-in-frame`  
**Tip commit:** `[run git log -1 --format=%H]`  
**Preview:** `<unverified — fetch from Vercel MCP>`

---

### 1. Hero landing — notes primary (light theme)

**Action:** Tutor: start session → record 30s with strokes → **End session** (in-shell review, do not navigate away). Observe default view.

**Expect:** **Notes-hero** layout — `TutorNotesSection` visible and editable; reserved confirm slot present (placeholder); board thumbnail in secondary column with Replay CTA. **No** full-viewport replay; **no** final-frame flash dominating hero. Scrubber not visible in hero.

**Ignore this run:** Confirm section content (Phase 2). Notes AI quality. Tutor scratchy audio (B4).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Enter replay — true start (light theme)

**Action:** From item 1 hero, click **Replay session** (or equivalent CTA). Observe full-viewport replay. Scrubber at 0:00. Press **Play** without touching scrubber.

**Expect:** Replay chrome **looks like live WB** (top bar, canvas well, bottom scrubber) but read-only — no tool strip. Canvas shows **empty or first stroke only** — NOT final-board flash. Audio from beginning. Strokes sync with audio.

**Ignore this run:** Laser pointer. Board tabs (A6-6).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Back to notes + replay return (light theme)

**Action:** While replay playing, click **Back to notes**. Then re-enter replay.

**Expect:** Returns to hero; notes edits preserved (including edits made in drawer before back). Re-enter replay: scrubber shows **preserved position (not 0:00)**. No audio leak after back (`pause()` on hide).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Scrubber true end (light theme)

**Action:** Fresh replay. Let play to natural end.

**Expect:** Stops (no loop). Scrubber at 100%. Final stroke state. Play again → restarts from 0.

**Ignore this run:** Multi-segment (A6-1 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Scrub drag mid-session

**Action:** Pause replay. Drag scrubber to ~50% → release → Play.

**Expect:** Audio and scene resume from ~50%. No corrupted audio during drag.

**Ignore this run:** Sub-250ms jitter.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Notes drawer while replay playing (light theme)

**Action:** Enter replay; press Play. Open **Notes** drawer. Type in notes fields for 10s while replay continues.

**Expect:** Audio **keeps playing** during typing. Drawer does **not** cover scrubber or play/pause. Drawer body scrolls; canvas does not. Close drawer — replay still playing at correct position.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Unsaved notes guard + drawer↔hero edit survival (light theme)

**Action:** On hero, edit notes without saving. Click Replay CTA — choose **Continue**. Open notes drawer; edit a different field. Click **Back to notes**. Observe hero notes. Re-enter replay; open drawer again.

**Expect:** Confirm dialog on first hero→replay when dirty. **Continue** enters replay with unsaved hero edits intact. Drawer edits visible in hero after back. Drawer shows same edits on re-enter. **Save** persists all edits via nsi.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Ended `/workspace` revisit (regression)

**Action:** After session ended, navigate away then open `/admin/students/<id>/whiteboard/<wbsid>/workspace` directly.

**Expect:** `WorkspacePreviousSessionPreview` still renders ("Previous whiteboard session" / start-new-session flow). **Not** the in-shell two-state review (session already ended — different branch).

**Ignore this run:** Unifying ended-route with in-shell review (deferred).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 9. Both themes

**Action:** Repeat items 1–2 and 6 with **dark** theme, then **light**.

**Expect:** Hero and replay chrome readable; no white flash on stroke paint.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 10. Standalone admin replay regression

**Action:** Open `/admin/students/<id>/whiteboard/<wbsid>` (full review page). Run items 2 + 4.

**Expect:** Same scrubber behavior (shared hook). No regression from refactor.

**Ignore this run:** Page chrome reskin.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL

---

*(End of smokebook stub)*

---

## Acceptance criteria (checkable)

### Timeline controller

- [ ] `replay-timeline-controller.test.ts` green — oracle-based seek/segment mapping
- [ ] `seek(0, { paint: true })` paints empty/first-event scene; sets `paintReady = true` (S2)
- [ ] `seek` signature: `seek(globalMs, opts?: { play?: boolean; paint?: boolean })` (S2)
- [ ] `totalMs` matches measured `el.duration` sum when DB `durationSeconds` null
- [ ] `play()` from idle starts at `globalMs=0` (first play)
- [ ] End-of-timeline: `playing=false`, scrubber at `totalMs`, no auto-loop
- [ ] Step 1 admin hardware smoke (items 2+4) PASS before Step 2 (S5)

### Two-state review surface

- [ ] Default on End Session: `reviewSurface === "hero"` — notes primary, confirm slot visible (placeholder)
- [ ] `ReviewConfirmSlot` present (`data-testid="wb-review-confirm-slot"`); no agree/disagree UI built
- [ ] Hero thumbnail shows **final frame** (not t=0 still)
- [ ] Replay CTA transitions to full-viewport `WhiteboardReplayInFrame`
- [ ] **Back to notes** returns to hero; lifted `notesFields` preserved (BLOCKER-1)
- [ ] **Editing notes in drawer, toggling to hero and back, shows the same edits and they are saveable** (BLOCKER-1 acceptance)
- [ ] After back-to-notes and re-enter replay, scrubber shows **preserved position (not 0:00)** (BLOCKER-2)
- [ ] `WhiteboardReplayInFrame` hidden via CSS on hero — not unmounted after first enter (BLOCKER-2)
- [ ] `WorkspacePreviousSessionPreview` **removed** from in-shell hero; **still** on ended `/workspace` route

### Replay chrome (live look, no engine reuse)

- [ ] `ReplayBoardChrome` uses `data-mode="replay"`; style-mirrors live chrome; read-only (no tool strip/tabs)
- [ ] Scrubber inside chrome bottom strip; unobtrusive
- [ ] No final-frame flash before first play (hardware item 2)
- [ ] `WhiteboardWorkspaceClient.tsx` **unchanged** in `git diff` vs `v1-redesign`

### Notes drawer

- [ ] Drawer toggle in replay top bar; opens/closes without pausing audio
- [ ] `TutorNotesSection` reused in drawer; nsi save works from drawer
- [ ] Scrubber + play/pause remain visible and usable when drawer open
- [ ] Drawer body scrolls; replay canvas does not

### Lifted notes state + unsaved-notes guard

- [ ] `TutorNotesSection` controlled API: `fields?` + `onFieldsChange?`; uncontrolled standalone callers unchanged
- [ ] `isDirty` uses snapshot-at-mount (`initialParsedFields`); polls do not reset dirty mid-edit (S4)
- [ ] `saveSessionNotesAction` reads lifted `notesFields` from `SessionReviewMode`
- [ ] Dirty notes → replay transition shows confirm; **Continue** preserves edits (BLOCKER-1)
- [ ] `beforeunload` guard added when `isDirty` (S3)
- [ ] `SessionReviewMode.dom.test.tsx` covers guard + lifted-state survival across surface toggle (mocked)

### Regression

- [ ] `npx jest --runInBand --testPathPatterns "whiteboard/replay|WhiteboardReplay|SessionReviewMode"` green
- [ ] `npx next build` exit 0
- [ ] Admin + share `WhiteboardReplay` pages still render (parity)
- [ ] Ended `/workspace` route still shows `WorkspacePreviousSessionPreview` (hardware item 8)

### Hardware (Andrew)

- [ ] Smokebook items 1–10 PASS (or SKIP with reason)
- [ ] Multi-segment notice visible when `audioSegments.length > 1`; no crash

---

## 5-axis reliability self-flag (starter for adversarial review)

| Axis | Risk | Mitigation in this plan |
|---|---|---|
| **Data loss** | **Medium → mitigated (Rev 3)** | BLOCKER-1 lifted state; S4 snapshot-at-mount `isDirty`; S3 ADD `beforeunload`; BLOCKER-2 replay persist-once (no scrubber/notes loss on toggle) |
| **Crash recovery** | Low | No change to capture pipeline |
| **Sync fidelity** | N/A | Replay is post-session |
| **Replay accuracy** | **HIGH — primary target** | Unified `seek()`; measured `totalMs`; first-play-from-zero; t=0 paint gate. Residual: multi-segment drift (deferred A6-1), multi-page (deferred A6-6) |
| **Availability (tutor flow)** | **Medium** — two-state UX change | Hero default preserves notes-first; fallback "Open full replay" link; ended-route preview unchanged |

**BLOCKER candidates for 5-axis pass:**

1. **RB-B1:** Hook extraction must not regress admin/share before in-frame ships — Step 1 parity PR.
2. **RB-B2:** `totalMs` oracle unit-tested with null DB durations.
3. **RB-B3:** No `WhiteboardWorkspaceClient.tsx` engine edits — grep gate.
4. **RB-B4:** Drawer must not pause audio or cover scrubber — hardware item 6.
5. **RB-B5:** Unsaved-notes guard must not silently discard — hardware item 7 (drawer↔hero edit survival).
6. **RB-B6 (Rev 3):** Lifted `notesFields` — no `TutorNotesSection` instance owns edits alone; hardware item 7.
7. **RB-B7 (Rev 3):** `WhiteboardReplayInFrame` persist-once — hardware item 3 scrubber position.

---

## Sequencing

```
1. Step 1 — extract hook + refactor WhiteboardReplay (parity)
2. Step 1b — Andrew/admin hardware smoke items 2+4 on admin review page (S5 gate)
3. Step 2 — replay chrome + drawer components
4. Step 3 — SessionReviewMode two-state wire + lifted notes + persist-once replay
5. Step 4 — CSS
6. jest + next build
7. Andrew hardware smoke (smokebook above)
8. merge --no-ff to v1-redesign after PASS
```

**Do not parallelize** with Phase 1b audio-clock work on the same files.

---

## Open decisions for Andrew

1. **First-play policy:** First **Play** forces `t=0` even if user pre-scrubbed; after first play, scrub position authoritative. *(Rev 1 default — confirm still valid.)*
2. **Scrubber position on hero → replay → hero → replay:** **Resolved (Rev 3 / BLOCKER-2)** — `WhiteboardReplayInFrame` persist-once + CSS hide preserves scrubber position within same review session. Hardware item 3 validates.
3. **A6-1 timing:** Defer multi-segment fix + banner only, or pull in if hardware repro available?

*(Rev 2 resolved: ended `/workspace` stays preview-only; no-audio sessions get replay state with synth scrubber; PiP/split deferred in favor of drawer.)*

---

## Rev 3 — 5-axis findings not fully resolved in-plan (orchestrator judgment)

| Review ID | Finding | Status in Rev 3 |
|---|---|---|
| **NOTE-1** | `ReplayEntryCTA` shown for empty sessions (events proxy exists but 0 events, no audio) | **Not specified** — needs Andrew/product call: gate CTA on `hasAudio \|\| eventCount > 0`, or show "No recording available" in thumbnail column. Low severity; does not block execution but may mislead on instant-end sessions. |
| **NOTE-2** | `replayCachedRestoreElements` module singleton scope when extracting hook | **Not specified** — executor should move to shared `useRestoreElementsCache()` or named export imported by both `WhiteboardReplay.tsx` and `useReplayTimelineController`; add during Step 1 if not obvious. Low blast radius if missed (duplicate preload, not data loss). |
| **NOTE-3** | `seek` state-update ordering | **Resolved** — implementation order aligned with existing `seekGlobalMs` (state before `applySceneAt`). |

---

## Summary checklist (executor)

| # | Task | Owner |
|---|---|---|
| 1 | `useReplayTimelineController` + tests | Agent |
| 2 | Refactor `WhiteboardReplay.tsx` to hook (parity) | Agent |
| 3 | `ReplayBoardChrome` + `ReplayCanvasSurface` + `ReplayTimelineScrubber` | Agent |
| 4 | `ReplayNotesDrawer` + `ReviewConfirmSlot` + `ReviewHeroLayout` | Agent |
| 5 | `TutorNotesSection` controlled API + lifted notes state in `SessionReviewMode` | Agent |
| 5b | `WhiteboardReplayInFrame` persist-once + `SessionReviewMode` two-state wire + guards | Agent |
| 6 | CSS replay + hero layout tokens | Agent |
| 7 | `SessionReviewMode.dom.test.tsx` | Agent |
| 8 | `npx next build` | Agent |
| 9 | Hardware smokebook items 1–10 | Andrew |
