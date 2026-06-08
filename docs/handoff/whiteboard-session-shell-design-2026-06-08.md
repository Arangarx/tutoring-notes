# Whiteboard session shell — design (2026-06-08)

> **Purpose:** Full design for the three-mode whiteboard "session shell" — waiting room, live board, and review — authored from the ratified 2026-06-08 decisions (Andrew). This is a **paper design + HTML mock only**. No production code is authored here.
>
> **Decisions source:** `whiteboard-chrome-requirements.md` § "Ratified 2026-06-08 (Andrew)" — decisions A through K captured verbatim-in-substance.
>
> **Prior chrome design (live board chrome):** [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) and [`whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](whiteboard-chrome-p1.2-visual-design-2026-06-08.md) — these remain authoritative for the live board chrome itself; this doc EXTENDS them with the waiting room and review mode layers.
>
> **Visual mock:** [`../brand-previews/whiteboard-session-shell-mock-2026-06-08.html`](../brand-previews/whiteboard-session-shell-mock-2026-06-08.html) — open in browser to see all three modes rendered in the Mynk design language.
>
> **Status:** DESIGN PAPER — not yet built. Next executor: P1.1 (Sonnet-tier) builds the live board chrome per [`whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](whiteboard-chrome-p1.2-visual-design-2026-06-08.md). Waiting room and review mode are the subsequent build targets.

---

## 1. Three-mode session shell — overview

### 1.1 Core concept

A single React shell component (`SessionShell`) wraps all three modes. The shell handles:
- URL-stable routing (the same URL works for all three modes; no nav-away on end-session)
- Top-level A/V context (mic, camera, stream refs) — passed down to each mode
- Session lifecycle state machine (`waiting | live | review`)
- Consent state reading (from student/session record)

The three modes are **not three pages** — they are three render states of one shell.

```
URL: /session/[sessionId]

           ┌──────────────────────────────────────────────────────┐
           │   SessionShell  (bg-background, 100dvh)              │
           │                                                       │
           │   mode === "waiting"  →  <WaitingRoom />             │
           │   mode === "live"     →  <LiveBoard />               │
           │   mode === "review"   →  <ReviewMode />              │
           │                                                       │
           │   Mode transitions:                                   │
           │   "waiting" → "live"    : student admits / tutor     │
           │                          clicks "Start session"      │
           │                          (timer starts NOW)          │
           │   "live" → "review"     : end-session action         │
           │                          (in-place, no nav)          │
           │   "review" → "live"     : "Return to board" escape   │
           └──────────────────────────────────────────────────────┘
```

### 1.2 Transition: live → review (in-place)

When the tutor ends the session from the live board:

1. Recording stops; outbox flushes (background).
2. Notes generation begins (background — auto-reduce pipeline).
3. The shell transitions `mode = "review"` **in place** — same URL, same React tree, no full unmount/remount of A/V streams.
4. A/V streams are released after a 2s grace period (allows the transition animation to complete).
5. `<ReviewMode />` renders with the session summary — notes front-and-center, video replay lazy-loaded.

The tutor sees a smooth crossfade from the board to the review panel. The URL does not change. Accidental browser back produces a "Return to session?" intercept (see §5.3).

### 1.3 Session types

| Type | Who is physically present | Remote join? | Recording gate |
|---|---|---|---|
| **Remote session** | Tutor at desktop | Student connects remotely | Student connection is the gate |
| **Solo session** | Tutor + child, same physical space, single device | No remote student | Tutor must enable solo recording mode in waiting room |

The session type is selected (or inferred) before entering the board. Solo mode has additional consent-surface requirements (§4.3).

---

## 2. Visual language — Mynk session shell

### 2.1 Color palette (tokens)

All components use design tokens only. No raw hex in component code.

| Token | Light value | Dark value | Use |
|---|---|---|---|
| `--surface-base` / `bg-background` | `#f5f4ec` | `#051a24` | Page-level background, canvas bg |
| `--surface-1` / `bg-card` | `#fcfbf4` | `#0e2a38` | Bars, panels, popovers |
| `--surface-2` / `bg-muted` | `#ecebe1` | `~#021018` | Sunken areas, input bg |
| `--border-default` / `border-border` | `#c5cfd0` | `#1c3548` | Panel borders |
| `--text-strong` / `text-foreground` | `#15203a` | `#f0ede4` | Primary text |
| `--text-muted` / `text-muted-foreground` | `#5a6877` | `#a5b5c0` | Secondary/label text |
| `--accent` | `#e27d60` | `#e27d60` | Coral — CTAs, live dot, session-active signals |
| `--accent-soft` | `#f8e0d6` | `#2e1d18` | Coral wash — badge bg, active indicator bg |
| `--accent-text` | `#8a3c25` | `#e8a08a` | Coral text — on accent-soft bg |
| `bg-foreground text-background` | navy-bg + cream-text | cream-bg + navy-text | Active tool, primary buttons |

### 2.2 Typography

| Role | Font | Weight | Size | Usage |
|---|---|---|---|---|
| Display / headings | Fraunces (optical: opsz 144, SOFT 0–60) | 700 | 24–40px | Section heads, empty-state messages |
| Body | Inter | 400–500 | 14–16px | All prose content |
| Mono | JetBrains Mono | 400–500 | 11–13px | Timer, status labels, session ID |
| Wordmark | Fraunces opsz 144, SOFT 60 | 700 | 18px | "Mynk·" in shell top bar |

### 2.3 Component primitives (from V1-COMPONENT-LIBRARY)

- **ToolbarButton:** 36×36px desktop / 48×48px touch; `rounded-md`; states: default transparent → hover `bg-muted/60` → active `bg-foreground text-background`
- **Chip (toggle):** `h-7 px-2 rounded-sm border border-border`; selected = `bg-foreground text-background`
- **Badge:** `bg-accent-soft text-accent-text rounded-full text-xs font-mono`; LIVE badge adds pulsing coral dot
- **Popover:** `bg-popover border border-border shadow-md rounded-md`; outside-click dismiss
- **Bottom sheet (mobile):** `bg-card rounded-t-xl shadow-lg`; drag handle; `max-h-[50dvh]`

---

## 3. Three-mode shell — layout breakdown

### 3.1 Common shell frame

Every mode shares a common outer frame:

```
┌─────────────────────────────────────────────────────────────────┐
│  SHELL TOP BAR  44px  bg-card border-b border-border            │
│  [Mynk·]   │  [mode-specific content]   │  [End / Leave]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   MODE CONTENT AREA   (flex-1, 100dvh minus top-bar)           │
│   renders: WaitingRoom | LiveBoard | ReviewMode                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The top bar content differs per mode:
- **Waiting:** session name, "Waiting room" label, disabled timer (--:--), "Cancel"
- **Live:** LIVE badge + pulsing dot, running timer (minutes only, no seconds), "End session"
- **Review:** "Session complete" label, recorded duration, "Close"

---

## 4. Waiting room (green room) — full design

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR: [Mynk·] │ Session: [Student Name] — Waiting room │ [Cancel] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────┐  ┌──────────────────────────┐   │
│   │  VIDEO PREVIEW           │  │  SETUP CHECKLIST         │   │
│   │  (tutor self-view)       │  │                          │   │
│   │  bg-card border          │  │  [✓] Camera              │   │
│   │  rounded-lg 16:9         │  │  [✓] Microphone          │   │
│   │                          │  │  [ ] Student connected   │   │
│   │  [🎙 Mic: ON]  [📷 Cam: ON]  │  │  [ ] Sound test passed   │   │
│   │  below video, large tap  │  │                          │   │
│   │                          │  │  ── Devices ──           │   │
│   └──────────────────────────┘  │  Camera: [Front ▾]       │   │
│                                  │  Mic:    [Built-in ▾]    │   │
│                                  │  Speaker: [Built-in ▾]   │   │
│                                  │                          │   │
│                                  │  ── Recording ──         │   │
│                                  │  (see §4.3 below)        │   │
│                                  │                          │   │
│                                  │  [  Start session  ]     │   │
│                                  │  disabled until ready    │   │
│                                  └──────────────────────────┘   │
│                                                                  │
│   Student status:  ○ Not yet joined  /  ● Student ready         │
└─────────────────────────────────────────────────────────────────┘
```

**Responsive (phone/tablet — for future tutor-mobile):** Stack video preview above checklist. Full-width. Large touch targets (48px min) for mic/cam toggles.

### 4.2 Setup checklist logic

| Item | Source | Gate behavior |
|---|---|---|
| Camera | `getUserMedia` success + stream active | Shows green check; red X + "Fix" if denied |
| Microphone | `getUserMedia` + audio track active | Same |
| Student connected | Signaling presence event | Waiting room polls; shows "Waiting for student…" or "Student ready" |
| Sound test | Tutor plays a test tone and confirms | Optional; defaults to unchecked; "Skip" available |

**"Start session" button:** Enabled only when Camera + Microphone both green. Student connected is advisory for remote sessions; for solo sessions it is replaced by "Solo mode active" indicator.

### 4.3 Recording mode (consent-aware, structurally gated)

The recording section in the checklist shows differently based on session type:

**Remote session (student connecting remotely):**
```
── Recording ──
Recording is enabled when:
  [✓] Student connects through the approved link   ← structural gate
  [✓] Parent audio consent on file                 ← consent flag
  [✓] Parent video consent on file                 ← consent flag (if video recording)

When the student connects, recording capability unlocks automatically.
No manual "start recording" needed — it begins with the session.
```

**Solo session (tutor + child physically co-present):**
```
── Solo session recording ──
[  Toggle  ]  Enable solo recording mode

When enabled:
  ✓ You are starting a session without a remote student.
  ✓ The child may be in frame on your camera.
  ✓ This requires active parent consent on file for this student.

  Parent audio consent: [✓ On file / ✗ Not on file]
  Parent video consent: [✓ On file / ✗ Not on file — video will NOT be recorded]

⚠ If parent consent is not on file, recording is disabled.
   You can still conduct the session; upload a recording consent form first.
```

If the tutor toggles "Solo recording mode" on without consent on file, the toggle is accepted but the consent items show red — and recording is silently disabled (the board opens, solo mode is acknowledged, but no recording starts). The tutor sees a persistent inline notice: "Recording disabled — parent consent not on file."

**Consent-aware enforcement (Decision D):**
- `allowAudioRecording = false` → audio recording never starts, regardless of session type
- `allowVideoRecording = false` → tutor's video feed is excluded from recording (even in solo mode — the tutor's camera may capture the child)
- These flags are read from the student's consent record at session-start and re-read on session resume

### 4.4 Admit flow (remote session)

```
Tutor waiting room                    Student arrives
─────────────────                    ───────────────
"Waiting for [Student]…"             Student enters waiting room (own view)
○ Not yet joined                     Student sees: "Waiting for teacher…"

[Student ready] signal arrives →     Tutor sees: ● Student is ready
                                     "Admit [Student Name]"  button appears

Tutor clicks "Admit" →               Student's board loads
                                     BOTH leave waiting room simultaneously
                                     Timer starts NOW (on tutor side)
```

For solo sessions, there is no admit flow. The tutor clicks "Start session" directly. The timer starts on that click.

---

## 5. Live board — chrome design

The live board chrome is fully specified in [`whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](whiteboard-chrome-p1.2-visual-design-2026-06-08.md). This section captures the **session-shell-specific additions** to the live board that Decision A–K ratified.

### 5.1 Top bar (session mode)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR ~44px  bg-card border-b border-border                               │
│                                                                              │
│ [Mynk·]  │  ● LIVE  14:32  │  [🔗 Share]  [🎙▮▮▯▾]  [📷]  │  [↶][↷]  │  [PDF][🖼][∑][📊]  │  [−][100%][+][⊡]  │  [☾]  │  [End session] │
│           ↑               ↑                                                  │
│           LIVE badge      Timer: minutes only, no seconds                   │
│           bg-accent-soft  font-mono semibold                                │
│           text-accent-text                                                   │
│           + pulsing coral dot                                                │
│                                                                              │
│ "End session" button: bg-foreground text-background rounded-sm              │
│   (inverse colors — authority, not destructive — matches mock .rec-end-btn) │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Timer:** Minutes only, no seconds (Sarah priority — "she rounds to 5/15 minutes"). Format: `14m` or `1h 2m`. Tab-figures, JetBrains Mono.

**LIVE badge:** `bg-accent-soft text-accent-text rounded-full px-2 py-0.5 text-xs font-mono uppercase` + 7px coral dot `animate-pulse`.

### 5.2 Video tile with top-level A/V toggles (Decision F)

The video tile is **not just a video feed** — it is the **primary A/V control surface** on the live board.

```
┌──────────────────────────────────────────┐
│  AV TILE  position:fixed bottom-4 right-4│
│  bg-card border border-border rounded-md  │
│  w-[160px]  (draggable — drag handle top) │
│                                            │
│  ┌─────────────────────────────────────┐  │
│  │  video feed  (aspect 4:3 or 16:9)  │  │
│  │  bg-black rounded-sm               │  │
│  │  (student remote feed or self-view  │  │
│  │   based on solo/remote mode)        │  │
│  └─────────────────────────────────────┘  │
│                                            │
│  [🎙 ON]  [📷 ON]  ← TOP-LEVEL toggles    │
│  ToolbarButton 36px  state:               │
│    ON  = bg-foreground text-background    │
│    OFF = bg-destructive/10 text-destructive│
│                                            │
│  [⋮] drill-down: device-switching        │
│  (devices chosen in waiting room;         │
│   drill-down = change-mid-session escape) │
└──────────────────────────────────────────┘
```

**Mic/video state display:**
- Mic ON: mic icon filled, active indicator
- Mic OFF/muted: mic icon with slash, `text-destructive` color — visually obvious
- Video ON: camera icon filled
- Video OFF: camera icon with slash + "No video" fallback avatar in feed

**Drag handle:** Top edge of tile, `cursor: grab`. Tile snaps to nearest corner on release (not free-float — avoids covering toolbar).

### 5.3 Ghost peer viewport bounds (Decision K)

When the student is connected (remote session), a ghosted rectangle renders on the Excalidraw canvas showing the student's current viewport:

```
Canvas view:
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│   [tutor's annotations here]                                 │
│                                                               │
│   ╔═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═╗  │
│   ║                                                         ║  │
│   ║    STUDENT'S CURRENT VIEWPORT                          ║  │
│   ║    (dashed border, low opacity)                        ║  │
│   ║    border: var(--accent) 30% opacity dashed            ║  │
│   ║    fill: var(--accent-soft) 8% opacity                 ║  │
│   ║    label: "Student view" — mono 10px text-muted        ║  │
│   ║                                                         ║  │
│   ╚═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═╝  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Implementation approach:** Rendered as a custom Excalidraw overlay element (not a canvas draw call) updated via the existing `pvs`-prefixed viewport-sync channel. The rectangle is read-only for the tutor — it is not selectable or editable.

**Visibility control:** A small toggle in the top bar or AV tile: "👁 Student view" — defaults ON for remote sessions, hidden for solo sessions.

**Build-tier recommendation: Gate-A fast-follow (not V1 core).** Rationale:
- The plumbing (`pvs` viewport sync, peer viewport data) already exists
- The visual rendering is purely additive — an overlay element, no sync changes
- It does not affect reliability, sync invariants, or the freedraw hot path
- Build cost estimate: 1 focused Composer-2.5 session (reading viewport-sync code, adding the overlay element + toggle)
- Risk: LOW — purely cosmetic, isolated to the tutor's view, no student-side changes
- **Decision:** Include in the design (so the executor knows the shape); defer build until after P1.1 chrome ships and smokes green. First fast-follow priority.

### 5.4 End-session flow (live → review transition)

When the tutor clicks "End session":

1. **Confirmation dialog** (inline modal, not browser `confirm()`):
   ```
   ┌─────────────────────────────────────────┐
   │  End this session?                       │
   │                                          │
   │  The recording will be saved and notes   │
   │  will be generated automatically.        │
   │                                          │
   │  [Cancel]      [End session]             │
   │                bg-foreground text-bg     │
   └─────────────────────────────────────────┘
   ```

2. On confirm: recording stops, outbox flushes, notes pipeline triggers (all async/background).
3. Shell transitions `mode = "review"` with crossfade animation (200ms).
4. A/V streams released after 2s grace.

---

## 6. Review mode — full design

### 6.1 Philosophy

After end-session, the tutor needs **notes front-and-center** — not a video scrubber. The flow is:
- Write/review/finalize notes immediately after the session, while memory is fresh
- The board itself is preserved and accessible (scroll to review canvas; future feature)
- Video replay is a **lazy-loaded drill-down** — "Review video while editing" — not the default view

### 6.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR: [Mynk·] │ Session complete · [Student Name] · 14m │ [Close] │
├───────────────────────────┬─────────────────────────────────────┤
│  NOTES PANEL (primary)    │  BOARD PREVIEW (secondary)          │
│  ~60% width               │  ~40% width                         │
│                           │  Excalidraw in read-only mode       │
│  ── Session notes ──      │  (non-interactive by default)       │
│                           │                                      │
│  [Auto-generated notes    │  [Board thumbnail / mini canvas]    │
│   appear here as          │                                      │
│   they generate —         │  ┌─────────────────────────────┐   │
│   skeleton while pending] │  │  [▶ Review video while      │   │
│                           │  │     editing]                │   │
│  [Text editor area]       │  │  Lazy-loaded on click;      │   │
│                           │  │  player replaces thumbnail; │   │
│  [Save notes]             │  │  notes still editable       │   │
│  [Regenerate]             │  └─────────────────────────────┘   │
│                           │                                      │
│  ── Actions ──            │  [↩ Return to board]               │
│  [Share with parent]      │  (escape hatch — opens live mode)  │
│  [Download PDF]           │                                      │
├───────────────────────────┴─────────────────────────────────────┤
│  (board stays accessible by scrolling down — same shell)        │
└─────────────────────────────────────────────────────────────────┘
```

**Mobile (phone/tablet):** Single column. Notes on top, board preview below. "Review video while editing" as a full-width button below the notes area.

### 6.3 Notes panel behavior

- **While generating:** Skeleton placeholder ("Generating session notes…") with coral accent-soft pulse animation. "Regenerate" is disabled. "Save" is disabled.
- **Partial notes ready:** Show what's ready; "Partial notes — still generating…" badge at top.
- **Notes ready:** Full editable text area. "Save" and "Regenerate" both enabled.
- **After Save:** "Saved — visible to parent" confirmation inline (3s, then fades). Notes are immediately parent-visible (no separate "Send" step — Decision B4 from ORCHESTRATOR-STATE).
- **Regenerate:** Re-runs the AI reduce pass; does NOT overwrite until the tutor explicitly saves the new version.

### 6.4 Video replay (lazy drill-down)

"Review video while editing" button opens the player inline above the notes panel on desktop (or as a slide-in on mobile). The notes panel scrolls below the player — both remain visible/accessible. Player controls: play/pause, scrub, 2× speed, close (collapses player, notes return to full width).

The player is loaded **on demand** — no pre-fetch of video assets until the button is clicked. This keeps review-mode load time fast even for long sessions.

### 6.5 Accidental-nav recovery (nav-away intercept)

If the tutor navigates away from the session URL while in review mode with unsaved notes:

```
[browser beforeunload / Next.js router interceptor]

"Leave without saving?"
Your session notes haven't been saved yet. Leave anyway?

[Stay]      [Leave anyway]
```

If the tutor navigates away and returns to the session URL:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠ You left mid-review                                          │
│                                                                  │
│  Your session with [Student Name] has ended.                    │
│  Your notes draft was preserved.                                │
│                                                                  │
│  [Continue reviewing notes]                                      │
└─────────────────────────────────────────────────────────────────┘
```

The draft is held in the browser (localStorage/sessionStorage) until explicitly saved or discarded.

---

## 7. Responsive behavior — one board, three screen sizes

### 7.1 Screen size axis (Decision E)

The real design axis is screen size, not tutor-vs-student. Tutor vs student is a different **control set** on the same responsive surface.

| Breakpoint | Name | Primary use case | Canvas target |
|---|---|---|---|
| ≥1024px | Desktop | Tutor (primary design target v1) | ~85%+ viewport width |
| 480–1023px | Tablet | Student tablet (Phase 2); future tutor-mobile (v1.1) | ≥80% viewport |
| <480px | Phone | Student phone (Phase 2) | ≥80dvh |

### 7.2 Control set differences

| Feature | Tutor (desktop) | Student (tablet/phone) |
|---|---|---|
| Full left tool strip | ✓ (collapsible) | ✗ (tools in bottom bar or overlay) |
| Insert actions (PDF/Math/Desmos) | ✓ Top bar | ✗ (tutor-only) |
| Laser pointer | ✓ Top-level | ✗ (tutor controls laser; student sees it) |
| Shape pulldowns | ✓ | In overflow ··· |
| More styles popover | ✓ Full | ✓ Bottom sheet |
| Follow-tutor toggle | ✗ (tutor IS the leader) | ✓ Default ON (ST-01) |
| Add page | ✓ | ✗ v1 (ST-03 defer) |
| Session timer | ✓ Top bar | ✓ Top bar (read-only) |
| End session | ✓ | ✗ (Leave) |
| A/V mic toggle | ✓ Top-level | ✓ Top-level (on bottom bar) |
| A/V video toggle | ✓ Top-level | ✓ Top-level (on bottom bar) |

### 7.3 Mobile palette-dismissal fix (Decision E — PP-02/PP-03)

The prior complaint: "the properties/color palette eats too much space and on mobile won't dismiss without re-tapping the tool button."

**Fix:**
1. Properties panel on phone = bottom sheet (not a side popover). Slides up; dismisses on downward drag OR tap-outside OR tap on canvas.
2. Bottom sheet has a drag handle. Tap anywhere on the canvas (above the sheet) dismisses it.
3. The sheet is `max-height: 45dvh` — never more than half the screen.
4. After tool selection, the sheet is **not auto-opened** — it only opens when the user explicitly taps a style control. First draw is always possible without the sheet open.
5. On tablet, properties is a bottom sheet (not a floating popover). On desktop, it is the side-anchored popover from the left strip.

---

## 8. Consent-aware recording model — UI manifestation

### 8.1 What the tutor sees

**In waiting room (Decision C + D):**
- Structural gating shown visually (§4.3)
- No "Start recording" affordance anywhere on the live board
- Solo mode toggle requires explicit action — not default

**On live board:**
- Recording status indicator in the top bar (adjacent to LIVE badge):
  - Remote: `● REC` if recording active (audio + video per consent)
  - Solo enabled: `● REC solo` 
  - Consent-limited: `● REC audio only` (video consent absent)
  - Not recording: no REC indicator (just LIVE badge)
- No "Stop recording" button — recording is structural, not manually controlled

**Solo session consent summary (persistent on live board, dismissible after reading):**
```
┌────────────────────────────────────────────────────────────┐
│  Solo session  ·  Recording active                         │
│  Audio: capturing  ·  Video: capturing                     │
│  Parent consent on file  ✓                                 │
│                                             [Dismiss]      │
└────────────────────────────────────────────────────────────┘
```

### 8.2 Symmetric consent enforcement (Decision C — tutor stream)

In solo mode: if `allowVideoRecording = false`, the tutor's video feed is **excluded from recording**. The tutor can still see themselves in the AV tile (local preview), but the feed is not written to the recording. A badge on the video tile: "Video not recorded" in `text-muted-foreground text-xs`.

### 8.3 The loophole (acknowledged, not relied-upon)

The "student connects remotely to unlock recording then sits beside the tutor" scenario is acknowledged in the requirements. Design mitigations:
1. The remote connection flow requires the student to actually appear in the signaling layer — the tutor sees "Student is connected" as a UI fact, not just a flag
2. No affordance in the UI encourages or enables this pattern
3. Do not rely on tutor goodwill — the structural gates are the primary defense

---

## 9. Iconography — professional standard

### 9.1 P1.1 rejection punch list (what NOT to repeat)

The P1.1 build was rejected for, among other things, unprofessional eraser and laser icons. Specific replacements:

| Function | Old (rejected) | New (required) |
|---|---|---|
| Eraser | Custom/ugly eraser icon | `Eraser` from lucide-react (the standard clean eraser) |
| Laser pointer | Custom/off-brand laser | `Target` or `Crosshair` from lucide-react — clean circle target; or `Zap` for a more energy feel |
| Cursor/select | Any non-standard | `MousePointer` or `MousePointer2` from lucide-react |
| Pencil/freedraw | Any non-standard | `Pencil` from lucide-react |
| Text | Any non-standard | `Type` from lucide-react |
| Shape pulldown | Any non-standard | Last-used shape icon + `ChevronDown` from lucide-react |
| Undo/Redo | ↶↷ text | `Undo2` / `Redo2` from lucide-react |
| Mic ON | Any | `Mic` from lucide-react |
| Mic OFF | Any | `MicOff` from lucide-react |
| Video ON | Any | `Video` from lucide-react |
| Video OFF | Any | `VideoOff` from lucide-react |
| More/overflow | `···` text is fine | `MoreHorizontal` or `MoreVertical` from lucide-react |
| Theme toggle | Sun/moon text | `Sun` / `Moon` from lucide-react |
| Share link | Any | `Link` or `Share2` from lucide-react |
| End session | Text only | Text label "End session" (no icon — authority word, not destructive icon) |

### 9.2 Icon spec

All icons in the tool strip: 18px (`w-[18px] h-[18px]`), `stroke-width={1.5}`. Touch/tablet: 20px. No filled icons except in active state where `bg-foreground text-background` handles the visual weight.

### 9.3 Hover states (P1.1 rejection item)

Every interactive element MUST have a hover state. No exceptions:
- Tool buttons: `hover:bg-muted/60` (the muted wash)
- Chip toggles: `hover:bg-muted/60`
- Top bar buttons: `hover:bg-muted/60 hover:text-foreground`
- Tooltips: Every icon button has a `title` attribute AND a styled tooltip (`bg-popover border border-border rounded-sm px-2 py-1 text-xs`) on hover delay 500ms.

---

## 10. Other P1.1 rejection items — design resolution

### 10.1 Audio panel size

**Rejected:** Large audio panel on the live board, visible by default, taking significant canvas space.

**Fix (Decision B + F):** A/V setup is in the waiting room. The live board has NO audio panel. Mic/video are top-level toggles on the AV tile (36px buttons). Device picker is a compact drill-down dropdown from the AV tile overflow button. Mic meter (3-bar visual) is optional and lives inside the AV tile, not as a separate panel.

### 10.2 Text buttons where icons should be

**Rejected:** Text labels where icon buttons belong.

**Fix:** Every tool strip item is an icon button with a tooltip. The only text in the tool strip is keyboard shortcut hints in tooltips. Top bar uses text labels for session-level controls (Share link, End session) — because these are verb-actions not tools, and text is correct there.

### 10.3 Opacity slider range

**Rejected:** Opacity slider had wrong range (e.g., 0–100 but visually wrong).

**Fix:** Opacity slider: range 0–100, input type range, step 5. Default 100. Display the value as `80%` inline. The slider thumb and track use `--slider-track / --slider-thumb` tokens. In the More styles area, not inline by default.

### 10.4 Z-order coloring

**Rejected:** "Unreadable z-order coloring" — unclear visual treatment.

**Fix:** Z-order buttons in the overflow panel use standard ghost button styling with icon + text label. No special color coding on z-order (the hierarchy is implied by label: "Send to back" / "Bring to front"). Delete button is `variant="destructive"` (red) — the only colored button in the overflow.

### 10.5 Inconsistent collapse-toggle position

**Rejected:** Collapse toggle moved around, inconsistent.

**Fix:** Collapse toggle is always at the **bottom** of the left strip, pinned above the page strip. Never moves. When collapsed, it becomes a 24px chevron strip on the left edge. Always visible.

### 10.6 Missing styles

**Rejected:** Some styles from the Excalidraw native UI were missing in the P1.1 chrome.

**Fix (Decision G + PP-04):** ALL Excalidraw native styles are kept — none dropped. They are tiered: inline basics (color, width, opacity, roughness, edges) → More styles drawer (fill, stroke style, freedraw profile, arrow type, arrowheads, font, text align, z-order, delete). Nothing is silently removed.

---

## 11. Design-fidelity acceptance checklist

This checklist is the gate the eventual chrome build must pass. P1.1 was rejected for skipping this standard.

### 11.1 Visual polish bar

- [ ] **No monochrome look** — design uses Mynka Blue palette with depth: `bg-card` panels on `bg-background` page; coral accent for live/active signals; not all-grey
- [ ] **Consistent surface depth** — top bar and left strip are `bg-card` (raised); canvas is `bg-background` (base); popover is `bg-popover` with shadow; the layering is visually readable
- [ ] **Professional iconography** — all icons from lucide-react (or equivalent clean library), consistent `stroke-width={1.5}`, no custom ugly icons
- [ ] **Hover states everywhere** — every interactive element has a visible hover state (no "dead" buttons)
- [ ] **Active tool legible** — `bg-foreground text-background` (inverse) applied correctly; NOT coral for active tool
- [ ] **Typography hierarchy** — session timer in `font-mono font-semibold tabular-nums`; labels in `text-xs text-muted-foreground`; no oversized labels where icons suffice
- [ ] **Spacing consistent** — `gap-1` between strip buttons, `p-1` on strip container, `p-3` on popovers — from V1-COMPONENT-LIBRARY sizing

### 11.2 Functional completeness

- [ ] **Three modes implemented:** waiting room, live board, review — all accessible and navigable
- [ ] **Toolbar order:** Cursor → Pencil → Eraser → Text → Laser → Lines▾ → Shapes▾ → ···
- [ ] **Properties popover:** opens on tool activate, dismisses on outside-click, contains inline basics + More styles (all native styles present)
- [ ] **Drawing defaults on session start:** roughness=0, edges=sharp, stroke=thinnest
- [ ] **Laser in top-level slot** (not overflow, not deferred)
- [ ] **Drag-to-dismiss palette on mobile** (properties bottom sheet dismisses on tap-outside and swipe-down)
- [ ] **Every function has a visible button** — no keyboard-only or right-click-only sole paths
- [ ] **Collapse toggle always at strip bottom** — never moves
- [ ] **AV tile draggable** with mic/video as top-level toggles
- [ ] **Ghost viewport bounds** visible when student is connected (or noted as Gate-A fast-follow with the toggle stub in place)

### 11.3 Consent and recording model

- [ ] **No tutor attestation modal** — removed entirely
- [ ] **No "Start recording" button** on live board
- [ ] **Waiting room shows recording gate** — structural gate status visible
- [ ] **Solo mode toggle** in waiting room for solo sessions
- [ ] **Consent flags honored** — `allowAudioRecording=false` prevents audio recording; `allowVideoRecording=false` prevents video recording including tutor stream
- [ ] **REC indicator on live board** — shows recording status (or absent if not recording)
- [ ] **Timer: minutes only** — no seconds displayed

### 11.4 Freedraw latency (PR-01 — hard criterion)

- [ ] **Freedraw instant** — pointer-move to on-screen stroke with no perceptible lag
- [ ] **Option A fix landed** — `preserveImageAssetUrlsOnSceneWrite` deferred to wire/checkpoint builds, NOT per-pointer-move
- [ ] **Option E flush landed** — `pointerup`/idle flush ensures last stroke segment is never dropped
- [ ] **`npm run test:wb-sync` GREEN** — 22 sync invariants unbroken

### 11.5 Theme parity (TU-12/TU-13)

- [ ] **Both light and dark renderable** — chrome readable in both themes via tokens
- [ ] **No hardcoded colors** — no `#hex`, no `dark:` branching in component code
- [ ] **Whiteboard-local theme toggle** present in top bar (rightmost slot)
- [ ] **Excalidraw `theme` prop** follows app-selected theme

---

## 12. Open questions for Andrew (underspecified areas)

| # | Question | Relevant decisions | Recommendation |
|---|---|---|---|
| Q1 | **Session type selection UX:** How does the tutor declare "this is a solo session" vs "this is a remote session"? Is it a setting on the session before the waiting room, or a choice IN the waiting room? | Decision C (solo mode) | Recommend: on the pre-session booking/setup page, with the waiting room reflecting the choice. The waiting room should not force a choice mid-flow. |
| Q2 | **Student waiting room UX:** What does the student see while waiting to be admitted? We've specified the tutor side but not the student waiting room screen. | Decision B | Decision needed before Phase 2 build. Suggest: simple "Your teacher will let you in shortly" screen with their own A/V preview. |
| Q3 | **Ghost bounds toggle:** Default ON or OFF? | Decision K | Recommend ON by default (useful; non-intrusive at low opacity). Toggle to disable if it distracts. |
| Q4 | **Solo mode + parent consent self-certification:** If parent consent is NOT on file, can the tutor still enable solo mode for a non-recorded session? Or is solo mode only available if consent is on file? | Decision C | Recommend: Solo mode toggle always available; recording portion within it is gated by consent. Tutor can run an unrecorded solo session. |
| Q5 | **Review mode video:** When is video available? Is there always a recording? (Could be no-consent sessions with no video.) | Decision C, D | Design should show "No recording for this session" gracefully when `allowVideoRecording=false` and `allowAudioRecording=false`. |
| Q6 | **"Return to board" from review mode:** Can the tutor actually draw again after ending the session? (Is the board read-only in review?) | Decision A | Recommend: board is read-only in review mode for the current architecture; add annotations = separate explicit action (or always writeable). Clarify before build. |

---

## Cross-links

| Doc | Role |
|---|---|
| [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) | 68 requirements + § "Ratified 2026-06-08 (Andrew)" |
| [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) | Live board architecture, phasing, POC gates |
| [`whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](whiteboard-chrome-p1.2-visual-design-2026-06-08.md) | Live board visual design spec (P1.1 executor build target) |
| [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md) | Function dispositions — what goes where |
| [`../brand-previews/whiteboard-session-shell-mock-2026-06-08.html`](../brand-previews/whiteboard-session-shell-mock-2026-06-08.html) | Static HTML visual mock — open in browser |
| [`../brand-previews/palette-mocks-FINAL-mynka-blue.html`](../brand-previews/palette-mocks-FINAL-mynka-blue.html) | Mynk visual language source of truth |
| [`docs/LIVE-AV.md`](../LIVE-AV.md) | A/V architecture (before touching peer-mesh, mic-recorder-audio) |
| [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) | Recording FSM + outbox (before touching recording layer) |

---

## Changelog

- **2026-06-08:** Initial design doc. Three-mode session shell, waiting room, live board additions (AV tile, ghost bounds, session bar), review mode, responsive behavior, consent-aware recording model, P1.1 rejection punch-list resolutions, acceptance checklist, open questions. Authored by Sonnet subagent on branch `v1-redesign`.
