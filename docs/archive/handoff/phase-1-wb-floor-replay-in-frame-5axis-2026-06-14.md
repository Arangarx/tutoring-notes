# Phase 1 — WB Replay In-Frame: 5-Axis Adversarial Review

> **Plan reviewed:** `docs/handoff/phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` (Rev 2)  
> **Review date:** 2026-06-14  
> **Reviewer:** Sonnet 4.6 adversarial pass (read-only; no files modified)  
> **Verdict:** **NOT-CLEAN — 2 BLOCKERs**

---

## Code grounded against

All findings are tied to lines read during this review:

- `src/components/whiteboard/WhiteboardReplay.tsx` (~1,588 lines, read in full)
- `src/lib/whiteboard/replay-audio-timeline.ts` (read in full)
- `src/lib/whiteboard/event-log.ts` (read in full)
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode.tsx` (read in full)
- `src/components/whiteboard/TutorNotesSection.tsx` (read in full)
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx` (first 60 lines)

---

## Axis 1 — Data-loss / durability

### 🔴 BLOCKER-1: Notes field state is silently lost on every hero↔replay transition

**Finding:** The plan states (§ Unsaved-notes protection):

> *"Continue does not discard edits; notes state stays in React state."*

This is architecturally false as written.

The plan's component tree is:

```
SessionReviewMode
├── [reviewSurface === "hero"]  ReviewHeroLayout
│     └── TutorNotesSection  ← instance A; holds `fields` state
└── [reviewSurface === "replay"]  WhiteboardReplayInFrame
      └── ReplayNotesDrawer
            └── TutorNotesSection  ← instance B; separate mount; fields fresh from initialNote
```

React state lives in component instances. When `reviewSurface` flips from `"hero"` to `"replay"`, instance A **unmounts** and its `fields` state is destroyed. Instance B mounts fresh and re-initializes from `parseNoteContent(initialNote.content)` — the original AI-generated content, not the user's edits.

When the user goes **back** to hero, instance A remounts fresh again — any edits made in the drawer (instance B) are also gone.

The plan's "unsaved-notes guard" prevents the unmount only when the user clicks **Stay**. If they click **Continue**, their edits are discarded — exactly what "Continue does not discard edits" promises to prevent.

**Confirmed from `TutorNotesSection.tsx`:**  
- `fields` state is entirely internal (`useState<StructuredFields>`, L130–134)  
- No `initialFields`/`fields`/`onFieldsChange` controlled-prop API exists  
- Polling `useEffect` at L155–159 re-syncs `fields` from `note.content` on each poll result — meaning even if `fields` were lifted, a concurrent poll could overwrite user edits if generation is still in progress

**Plan fix required:**  
Choose one of two implementation paths and state it explicitly:

**Path A (recommended) — lift `fields` state:**  
`SessionReviewMode` owns `fields: StructuredFields` and `onFieldsChange`. Add controlled-prop API to `TutorNotesSection`: `fields?: StructuredFields`, `onFieldsChange?: (f: StructuredFields) => void`. When provided, component is controlled (no internal `fields` state). Hero and drawer both consume the same `fields` from `SessionReviewMode`. The `isDirty` flag lives in `SessionReviewMode` and is unambiguous.

**Path B (simpler but heavier) — single instance, CSS hide:**  
Only one `TutorNotesSection` instance exists, always mounted in `SessionReviewMode`. It's positioned either in the hero column (hero state) or slotted via React portal / prop-drilling into the drawer (replay state). CSS `display: none / block` swaps its visual location; React never re-mounts it. Heavier to wire but avoids controlled-prop refactor.

The plan must pick one path, name it, and include an additive change checklist for `TutorNotesSection`.

---

### SHOULD-FIX-3: `beforeunload`/router guard assumed to exist — it doesn't

**Finding:** Plan states (§ Unsaved-notes protection):

> *"Browser/nav away: Existing `beforeunload` / router guard in `TutorNotesSection` or `SessionReviewMode` if present; **do not remove**. Extend to cover replay state."*

After reading both files in full: **there is no** `beforeunload`, `useBeforeUnload`, or Next.js router guard in either component. The plan's "extend" instruction implies extending something that exists.

**Plan fix required:** Replace "if present; do not remove; extend" with a definitive choice: either (a) "add a minimal `useEffect`-based `beforeunload` guard in `SessionReviewMode` that fires when `isDirty === true` and `reviewSurface` is either `"hero"` or `"replay"`," or (b) "deliberately out of scope for this branch — document the gap in BACKLOG." A ghost extension that silently no-ops is worse than explicit scoping.

---

### SHOULD-FIX-4: `onDirtyChange` / `isDirty` spec incomplete

**Finding:** Plan says:

> *"`TutorNotesSection` tracks dirty state via existing field edits (executor: verify `onDirtyChange` or equivalent exists; if not, add minimal `isDirty` callback prop — additive only)."*

The prop does not exist (confirmed from `TutorNotesSection.tsx` L44–58). The plan leaves "what counts as dirty" undefined. Three competing definitions are viable:

1. `fields !== parseNoteContent(note.content)` (dirty vs latest server content — resets after each poll)
2. `fields !== parseNoteContent(initialNote.content)` (dirty vs load-time content — stable)
3. Any user keystroke (always dirty after typing, regardless of content)

Definition 1 has a race: if the user types while generation is still in-flight, a poll arriving at L155–159 re-syncs `fields` from the new server content, which would flip `isDirty` back to false mid-edit and silently discard unsaved user edits. This is exactly the kind of silent data loss the plan says it prevents.

**Plan fix required:** Define "dirty" precisely. Definition 2 is safest (snapshot at mount time; not reset by polls). If BLOCKER-1 is fixed by Path A (lifted state), `isDirty` should be `JSON.stringify(fields) !== JSON.stringify(initialParsedFields)` where `initialParsedFields` is captured once at load and never updated by polls. Include this in the `TutorNotesSection` additive change spec.

---

## Axis 2 — Failure modes / graceful degradation

### NOTE-1: `ReplayEntryCTA` shown for empty sessions (no events, no audio)

**Finding:** Plan says: "Hero shows replay CTA when `eventsProxyUrl` exists." But `eventsProxyUrl` exists even when `events.json` has 0 events and no audio — the placeholder blob is written by the recorder hook on every session start. In the current `SessionReviewMode.tsx` (L234), replay is only offered when `payload.hasAudio`. Rev 2 opens it to all sessions with an events proxy URL.

User flow: tutor starts and immediately ends a session (no drawing, no audio) → hero shows "▶ Replay session" → user clicks → `WhiteboardReplayInFrame` renders the `wb-replay-empty` state ("No whiteboard activity was recorded"). Mildly misleading CTA.

**Plan fix required (SHOULD-FIX):** Add a condition: show `ReplayEntryCTA` only when `hasAudio || (eventsProxyUrl && eventCount > 0)`. Load `eventCount` from the existing `loadSessionReviewPayload` payload (already fetches the events proxy URL; can cheaply return `log.events.length` from the server action without a second fetch). Or: suppress the CTA and show a "No recording available" message in the thumbnail column when both are absent.

---

### NOTE: Multi-segment (A6-1) degradation — adequately specified

The plan's banner-only degradation + `data-testid="wb-replay-multi-segment-notice"` is concrete and safe. Controller handles N segments without crashing per the existing `WhiteboardReplay.tsx` multi-segment paths. ✓ No action needed.

### NOTE: Corrupt/empty event log, missing blob, slow load — adequately specified

`useReplayTimelineController` inherits the existing fetch+parse+error pipeline from `WhiteboardReplay.tsx` (L382–435). Error states (`loadState.kind === "error"`) are handled. ✓ No action needed.

---

## Axis 3 — Correctness of the core mechanism

### 🔴 BLOCKER-2: `WhiteboardReplayInFrame` persistence mechanism unspecified — scrubber position guarantee breaks, audio leak risk

**Finding:** The plan states (§ State 2 — Replay):

> *"**Back to notes:** pause playback; `reviewSurface = "hero"`; **do not unmount** controller state if user returns to replay within same review session (preserve scrubber position)"*

And (§ Open decisions #2):

> *"Plan prefers **preserving** scrubber position within same review session. Confirm?"*

Yet the plan never specifies **how** `WhiteboardReplayInFrame` survives the transition to `reviewSurface === "hero"`. If an executor uses the obvious conditional render:

```tsx
{reviewSurface === "replay" && <WhiteboardReplayInFrame ... />}
```

`WhiteboardReplayInFrame` unmounts on every "Back to notes" → all `useReplayTimelineController` state is destroyed → scrubber resets to 0 → audio element destroyed → if audio was still playing when unmount fires (e.g. async state update race), the cleanup effect must call `el.pause()` or audio could ghost-play.

An `el.pause()` in cleanup is not guaranteed in all browsers when the element is garbage-collected during React teardown — this is a known edge case with hidden `<audio>` elements.

The plan says "do not unmount controller state" as a requirement but gives no implementation contract.

**Plan fix required:**  
Add a new paragraph to § State 2 — Replay or § Component boundary:

> *"**Persistence contract:** `WhiteboardReplayInFrame` is **lazy-mounted once** on first replay entry and thereafter hidden via CSS (`display: none` on its wrapper) rather than unmounted when `reviewSurface === "hero"`. The audio element is paused (via `controller.pause()`) on back-to-notes, but not destroyed. On re-entry (`"hero"` → `"replay"`), the wrapper is shown again; `seek(preservedGlobalMs, { play: false })` is NOT required if the audio is already at the correct position. If Excalidraw fires a ResizeObserver when the container is re-shown, call `api.refresh()` once — hardware smoke item 3 validates this."*

Add an explicit acceptance criterion: "After back-to-notes and re-enter, scrubber shows preserved position (not 0:00)."

Note: this also changes the CSS architecture — `display: none` on `WhiteboardReplayInFrame` means the replay chrome is in the DOM but invisible during hero state. Confirm this is acceptable (no accessibility leak: `aria-hidden="true"` on the wrapper when hero state).

---

### SHOULD-FIX-2: `seek` signature has undeclared `{ paint: boolean }` option; `paintReady` transition unspecified

**Finding:** The plan declares:

```typescript
seek(targetGlobalMs: number, opts: { play: boolean }): void
```

But later says:

> *"First enter from hero: ... controller `seek(0, { paint: true, play: false })` before reveal (B2 fix)."*

`{ paint: true }` is not in the declared signature. Executor has two competing reads: (a) `paint` is an undocumented option that sets `paintReady = true`, or (b) the `{ paint: true }` is just descriptive text and `paintReady` becomes `true` automatically after any `seek(0)`.

Additionally, `paintReady` is in `ReplayTimelineState` but its transition rules are not specified:
- What initial value? (`false`)  
- What triggers `false → true`? (`seek(0)` completing? first successful `applySceneAt`?)  
- Can it go `true → false`? (on new session load: yes; on scrub: no)

Without this, B2 (the primary failing smoke item) can be implemented inconsistently and the `opacity: 0` gate may never lift, leaving a blank canvas.

**Plan fix required:** Either:
- Update the `seek` signature to `seek(targetGlobalMs: number, opts: { play: boolean; paint?: boolean }): void` and specify: "When `paint: true`, the implementation calls `applySceneAt(targetGlobalMs)` synchronously and sets `paintReady = true`. When `paint: false` (the default for user scrubs), `applySceneAt` still runs but `paintReady` is not affected." OR  
- Remove the `{ paint: true }` language, and specify: "`paintReady` is automatically set to `true` after the first successful `applySceneAt` call on a non-empty log. For empty logs (no events), `paintReady` is set to `true` immediately on controller mount."

---

### SHOULD-FIX (implementation note): `seek` state-update ordering differs from existing impl

**Finding:** The plan's `seek` contract specifies:

> *"Implementation order: clamp → `applySceneAt` (immediate) → `loadSegmentAt` → update `globalMs`."*

The existing `seekGlobalMs` in `WhiteboardReplay.tsx` (L695–716) does it in a different order:

```typescript
setAudioElapsedMs(globalMs);  // update state first
setPlaying(autoplay);
applySceneAtRef.current(globalMs);
loadSegmentAt(segmentIndex, localMs, autoplay);
```

The existing code updates state BEFORE `applySceneAt`. The plan's order updates state LAST. In the plan's ordering, during the `applySceneAt` call the scrubber's `value={globalMs}` still shows the old position, causing a one-frame visual lag on every seek. This is cosmetic but differs from current behavior and could confuse smoke testers comparing pre/post.

**Plan fix required (NOTE level, not BLOCKER):** Align the specified implementation order with the existing pattern: `clamp → update globalMs → update playing → applySceneAt → loadSegmentAt`. Add a comment in the plan: "State updates before applySceneAt so the scrubber moves synchronously with the scene on seek."

---

### ✓ Independent oracle test rule — adequately specified

Plan: "timeline tests use walk-the-durations oracle, never constants back-derived from hook implementation." ✓ This is the correct pattern (mirrors existing `replay-audio-timeline.test.ts` structure). No action needed.

### ✓ `totalMs` oracle with null DB durations — adequately specified

Plan's B1 fix (`max(measuredAudioTotalMs, maxEventTimestampMs(log), 1)`) correctly replicates the `resolvedMaxMs` pattern from `WhiteboardReplay.tsx` L1126–1129. The temporal sequencing (initial estimate → updated from `el.duration` metadata) is well understood from the existing code. No action needed.

### ✓ First-play-from-zero (B3) — adequately specified

`seek(hasEverPlayed ? globalMs : 0, { play: true })` correctly gates the first play. Open decision #1 is confirmed valid. ✓

---

## Axis 4 — Architecture / blast radius

### ✓ `WhiteboardWorkspaceClient.tsx` isolation — genuinely respected

The plan's component boundary is:
- `WhiteboardSessionShell.tsx` → "optional layout props only"
- `SessionReviewMode.tsx` → wired, substantially modified
- `WhiteboardWorkspaceClient.tsx` → "DO NOT TOUCH"

The shell comment at `WhiteboardSessionShell.tsx` L13 confirms: "CONDITIONAL MOUNT is intentional: flipping to 'review' UNMOUNTS the live subtree." The review mode flip already existed and was working. All new work is inside `SessionReviewMode` and new files under `src/components/whiteboard/replay/`. The live engine is genuinely isolated. ✓

### ✓ `ReplayBoardChrome` decoupling — correctly specified

The plan explicitly says "Reference only — do not import live slots" for `LiveBoardChrome.tsx`. Style parity via CSS tokens (`.mynk-wb-chrome[data-mode="replay"]`) rather than engine reuse. No live-engine internals needed for visual parity. ✓

### NOTE-2: `replayCachedRestoreElements` module singleton scope on extraction

**Finding:** `WhiteboardReplay.tsx` L107–109 has a module-level singleton:

```typescript
let replayCachedRestoreElements: ... = null;
```

When `useReplayTimelineController` is extracted to a new file, it needs `restoreElements` too. If the hook is in a different module, it cannot share this cache without an explicit import or re-export.

The plan says "reuse existing libs **without modification**" for `scene-paint.ts` etc., but doesn't address the `restoreElements` singleton. In practice, the simplest fix is to move the singleton to a shared module (e.g., `src/lib/whiteboard/excal-restore-cache.ts`) imported by both. Or: keep `replayCachedRestoreElements` in `WhiteboardReplay.tsx` and export it; the hook imports it. Or: pass `restoreElements` as a prop to both `useReplayTimelineController` and `createScenePainter`.

**Plan fix required (SHOULD-FIX):** Add one line to the reuse map for `WhiteboardReplay.tsx`: "Extract `replayCachedRestoreElements` + its preload effect as a shared `useRestoreElementsCache()` hook or a named export from `WhiteboardReplay.tsx`. Both old wrapper and new controller import from the same location."

---

## Axis 5 — UX honesty / coexistence

### SHOULD-FIX-1: Hero board thumbnail — "final-frame OR t=0 still" left unresolved

**Finding:** Plan says (§ State 1 — Hero):

> *"Reuse final-frame paint pattern from `WorkspacePreviousSessionPreview` **or** a lightweight `ReviewBoardThumbnail` that shares `createScenePainter` + final-frame apply — **no scrubber, no audio preload**."*

And (§ Board thumbnail in hero):

> *"static final-frame OR t=0 still (see below)"*

The "see below" resolves to nothing — there is no further specification. These are opposite UX choices:

- **Final frame:** shows the board at session end — contextually useful, tutor immediately sees what was left on the board. This is the existing `WorkspacePreviousSessionPreview` behavior.
- **t=0 still:** shows an empty board at the start of the session — less useful and potentially confusing (same as looking at a blank board).

B2's anti-pattern was showing the final frame *before* replay starts inside the replay state. Showing the final frame in the **hero thumbnail** is honest and intentional — they're labeled differently (thumbnail vs replay-playing surface).

**Plan fix required:** Explicitly decide and state: "The hero board thumbnail shows the **final frame** (same as `WorkspacePreviousSessionPreview` today) because that is the state of the board at session end — the context the tutor needs while writing notes. Never show the final frame in the replay-playing surface (`ReplayCanvasSurface`) — that is B2's anti-pattern."

---

### ✓ Drawer scroll / focus / audio-while-typing — fully specified

The plan addresses each concern in the "Drawer + scrub interaction" table: drawer body scrolls; canvas does not; `overflow: hidden` on body in replay state; focus moves to drawer on open / returns to toggle on close; audio continues on typing; scrubbing while drawer open is allowed. All four coexistence concerns from the review prompt are answered. ✓

### ✓ Ended `/workspace` route non-regression — clearly scoped

`WorkspacePreviousSessionPreview` stays on ended `/workspace` route (L128–171 of `workspace/page.tsx`); removed only from in-shell `SessionReviewMode` hero column. Smoke item 8 covers this. ✓

### SHOULD-FIX-5: Step 1 parity PR gate needs explicit admin hardware smoke requirement

**Finding:** Step 1 exit criteria say "existing replay tests green; admin review page still renders." The hook extraction is a substantial structural refactor: ~400 lines of carefully guarded effects (`isAtEndRef`, `segmentSwappingRef`, `globalSegmentOffsetMsRef`, `createThrottledPlayLoop`, synth clock, `applySceneAtRef` pattern) all move into the new hook. The "jsdom blind spot" section correctly notes that jsdom can't catch WebM duration, audio-scene sync, or scrubber drag correctness.

"Admin review page still renders" could be satisfied by a blank page with no error. The existing smoke item 10 ("Standalone admin replay regression") in the smokebook covers this, but it's not tied to the Step 1 gate.

**Plan fix required:** Add to Step 1 exit criteria: "Smoke items 2 + 4 pass on the admin review page (`/admin/students/<id>/whiteboard/<wbsid>`) before advancing to Step 2." This gates the parity PR against real audio behavior before building new UI on top.

---

## Summary table

| # | Axis | Classification | Title |
|---|---|---|---|
| BLOCKER-1 | Data loss | 🔴 BLOCKER | Notes field state silently lost on hero↔replay transition |
| BLOCKER-2 | Correctness + UX | 🔴 BLOCKER | `WhiteboardReplayInFrame` persistence unspecified — scrubber guarantee and audio lifecycle broken |
| SHOULD-FIX-1 | UX honesty | 🟡 SHOULD-FIX | Hero thumbnail: "final-frame OR t=0" unresolved |
| SHOULD-FIX-2 | Correctness | 🟡 SHOULD-FIX | `seek` signature has undeclared `paint` option; `paintReady` transition unspecified |
| SHOULD-FIX-3 | Data loss | 🟡 SHOULD-FIX | `beforeunload` guard assumed to exist; it doesn't |
| SHOULD-FIX-4 | Data loss | 🟡 SHOULD-FIX | `isDirty` definition incomplete; polling race unaddressed |
| SHOULD-FIX-5 | Regression | 🟡 SHOULD-FIX | Step 1 parity PR gate requires admin hardware smoke |
| NOTE-1 | Failure mode | ℹ NOTE | `ReplayEntryCTA` shown for empty sessions |
| NOTE-2 | Architecture | ℹ NOTE | `replayCachedRestoreElements` singleton scope on extraction |
| NOTE-3 | Correctness | ℹ NOTE | `seek` state-update ordering differs from existing impl (cosmetic) |

---

## Required plan changes for each BLOCKER

### BLOCKER-1 fix

**In § Unsaved-notes protection, replace:**

> *"notes state stays in React state"*

**With one of (choose one):**

> **(Path A — controlled props):** "`SessionReviewMode` lifts `fields: StructuredFields` and `setFields`. `TutorNotesSection` gains optional controlled-prop API: `fields?: StructuredFields; onFieldsChange?: (f: StructuredFields) => void`. When provided, the component is controlled and does not hold internal `fields` state. Hero and drawer both consume `fields` from `SessionReviewMode`. `isDirty = JSON.stringify(fields) !== JSON.stringify(initialParsedFields)` where `initialParsedFields` is captured at `SessionReviewMode` mount from `payload.initialNote.content` and never updated by polls."*

> **(Path B — CSS hide single instance):** "`TutorNotesSection` is mounted once in `SessionReviewMode` and passed down via props to both hero layout and drawer slot. CSS `display: none / block` controls its visual placement. No unmount during sub-state transitions."*

### BLOCKER-2 fix

**Add to § State 2 — Replay:**

> *"**Persistence contract:** `WhiteboardReplayInFrame` is **lazy-mounted once** on first replay entry. When `reviewSurface` returns to `"hero"`, the `WhiteboardReplayInFrame` wrapper is hidden via CSS (`display: none`; `aria-hidden="true"` on the wrapper element) rather than unmounted. The `useReplayTimelineController` hook and its audio element remain alive. The controller's `pause()` is called on `reviewSurface = 'hero'`. On re-entry, the wrapper is shown and the preserved `globalMs` displayed in the scrubber. If Excalidraw fires a layout event when the container is re-shown, call `api.refresh?.()` once. Hardware smoke item 3 validates this."*

**Update acceptance criteria:**

> *"- [ ] After back-to-notes and re-enter replay, scrubber shows preserved position (not 0:00)."*

---

## Verdict

**NOT-CLEAN — 2 BLOCKERs.**

The plan is architecturally sound and the hard constraint (non-negotiable no-touch of `WhiteboardWorkspaceClient.tsx`) is genuinely respected. The bug fixes (B1–B3), deferred items (A6-1, A6-6), component isolation (Option B), and most UX coexistence details are well-specified. The test strategy correctly identifies the jsdom blind spot.

The two blockers are both **state-preservation specification gaps** — the plan makes user-visible guarantees (notes preserved across transitions; scrubber position preserved) but omits the implementation mechanism that would make those guarantees true. An executor following the plan as written would produce a correct-looking implementation that silently loses notes and resets the scrubber on every hero↔replay toggle. Both are addressable with short additive specification paragraphs; no architectural rework needed.

Fix the two blockers, then this plan is clean to execute.
