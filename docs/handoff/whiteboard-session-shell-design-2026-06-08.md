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
| **In-person tutoring — single-device recording** *(internal: solo session)* | Tutor + child, same physical space, single device | No remote student | Tutor must enable in-person single-device recording in waiting room |

The session type is selected (or inferred) before entering the board. In-person single-device recording has additional consent-surface requirements (§4.3).

---

## 2. Visual language — Mynk session shell

### 2.1 Color palette (tokens)

All components use design tokens only. No raw hex in component code.

> **Build note:** Mock transcribes `tokens.css` values; the BUILD must consume the real token CSS, not copies — primary actions map to shadcn `--primary` (= accent/coral).

| Token | Light value | Dark value | Use |
|---|---|---|---|
| `--surface-base` / `bg-background` | `#f5f4ec` | `#051a24` | Page-level background, canvas bg |
| `--surface-1` / `bg-card` | `#fcfbf4` | `#0e2a38` | Bars, panels, popovers |
| `--surface-2` / `bg-muted` | `#ecebe1` | `#142f3e` | Sunken areas, input bg |
| `--surface-3` | `#e3e2d8` | `#1c3548` | Elevated inset panels, toggle tracks (light) |
| `--surface-inset` | — | `#021018` | Deepest wells — video placeholder, toggle-off track (dark) |
| `--border-default` / `border-border` | `#c5cfd0` | `#1c3548` | Panel borders |
| `--border-subtle` | `#e3e8e9` | `#0e2a38` | Hairline dividers |
| `--text-strong` / `text-foreground` | `#15203a` | `#f0ede4` | Primary text |
| `--text-muted` / `text-muted-foreground` | `#5a6877` | `#a5b5c0` | Secondary/label text |
| `--text-disabled` | `#94a3b8` | `rgba(165, 181, 192, 0.45)` | Disabled labels |
| `--accent` / `--primary` | `#e27d60` | `#e27d60` | Coral — **primary CTAs** (Start session, End session, Save notes), live dot |
| `--accent-on` / `--primary-foreground` | `#15203a` | `#051a24` | Text on coral fill |
| `--accent-strong` | `#c96a50` | `#d06b4e` | Coral hover / pressed |
| `--accent-soft` | `#f8e0d6` | `#2e1d18` | Coral wash — badge bg, active indicator bg |
| `--accent-text` | `#8a3c25` | `#e8a08a` | Coral text — on accent-soft bg |
| `bg-foreground text-background` | navy-bg + cream-text | cream-bg + navy-text | **Active tool** in strip (inverse), not primary CTAs |
| `--destructive` / `--error` | `#dc2626` | `#fca5a5` | Destructive text, mic/video OFF states |
| `--success` | `#16a34a` | `#4ade80` | Checkmarks, ready indicators |

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

**Responsive (phone — see §7.4):** Single full-width column. Camera preview is a prominent block at the top (16:9); below it stack device-check list → device dropdowns → recording-status block → full-width coral admit/start CTA. No side rail; no clipped text. Mic/cam toggles remain large tap targets (40px+) under the preview.

### 4.2 Setup checklist logic

| Item | Source | Gate behavior |
|---|---|---|
| Camera | `getUserMedia` success + stream active | Shows green check; red X + "Fix" if denied |
| Microphone | `getUserMedia` + audio track active | Same |
| Student connected | Signaling presence event | Waiting room polls; shows "Waiting for student…" or "Student ready" |
| Sound test | Tutor plays a test tone and confirms | Optional; defaults to unchecked; "Skip" available |

**"Start session" button:** Enabled only when Camera + Microphone both green. Student connected is advisory for remote sessions; for in-person single-device sessions it is replaced by "In-person (single device) active" indicator.

### 4.3 Recording mode (consent-aware, structurally gated)

The recording section in the checklist shows differently based on session type:

**Remote session (student connecting remotely):**
```
── Recording ──
Session audio helps parents stay in the loop and improves your notes —
recording starts automatically when your student joins (parent consent on file).
No manual "start recording" needed.

Recording is enabled when:
  [✓] Student connects through the approved link   ← structural gate
  [✓] Parent audio consent on file                 ← consent flag
  [✓] Parent video consent on file                 ← consent flag (if video recording)
```
(TU-16 — parent-friendly, non-alarming framing.)

**In-person tutoring — single-device recording (tutor + child physically co-present):**
```
── In-person tutoring — single-device recording ──
[  Toggle  ]  In-person (single device)

When enabled:
  ✓ You are starting a session without a remote student.
  ✓ The child may be in frame on your camera.
  ✓ This requires active parent consent on file for this student.

  Parent audio consent: [✓ On file / ✗ Not on file]
  Parent video consent: [✓ On file / ✗ Not on file — video will NOT be recorded]

⚠ If parent consent is not on file, recording is disabled.
   You can still conduct the session; upload a recording consent form first.
```

If the tutor toggles in-person (single device) recording on without consent on file, the toggle is accepted but the consent items show red — and recording is silently disabled (the board opens, in-person single-device recording is acknowledged, but no recording starts). The tutor sees a persistent inline notice: "Recording disabled — parent consent not on file."

**Consent-aware enforcement (Decision D):**
- `allowAudioRecording = false` → audio recording never starts, regardless of session type
- `allowVideoRecording = false` → tutor's video feed is excluded from recording (even when in-person single-device recording is enabled — the tutor's camera may capture the child)
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

For in-person single-device sessions, there is no admit flow. The tutor clicks "Start session" directly. The timer starts on that click.

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
│ "End session" button: bg-primary text-primary-foreground rounded-sm           │
│   (coral fill — authority CTA, not destructive — matches mock .tb-btn.primary) │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Timer:** Minutes only, no seconds (Sarah priority — "she rounds to 5/15 minutes"). Format: `14m` or `1h 2m`. Tab-figures, JetBrains Mono.

**LIVE badge:** `bg-accent-soft text-accent-text rounded-full px-2 py-0.5 text-xs font-mono uppercase` + 7px coral dot `animate-pulse`.

### 5.2 Video tile cluster with top-level A/V toggles (Decision F + SR-04)

The video cluster is **not just a feed** — it is the **primary A/V control surface** on the live board. **Sarah 2026-06-08:** default **top-right** (not bottom-right); **both tutor and student tiles** visible; **draggable + resizable**; default ~3× prior single-tile footprint.

```
┌──────────────────────────────────────────┐
│  AV CLUSTER  position:fixed top-4 right-4 │
│  bg-card border rounded-md  w-[240px]     │
│  resize: both (corner affordance)         │
│  drag handle top · labels Tutor / Student   │
│                                            │
│  ┌─────────────────────────────────────┐  │
│  │  TUTOR feed                         │  │
│  └─────────────────────────────────────┘  │
│  ┌─────────────────────────────────────┐  │
│  │  STUDENT feed                       │  │
│  └─────────────────────────────────────┘  │
│                                            │
│  [🎙 ON]  [📷 ON]  [⋮ devices]           │
└──────────────────────────────────────────┘
```

**Mic/video state display:**
- Mic ON: mic icon filled, active indicator
- Mic OFF/muted: mic icon with slash, `text-destructive` color — visually obvious
- Video ON: camera icon filled
- Video OFF: camera icon with slash + "No video" fallback avatar in feed

**Drag + resize:** Drag handle on top edge (`cursor: grab`). Corner resize handle for footprint adjustment. **Tile docking** (snap-to-edge, esp. mobile) is **deferred post-V1** — see `BACKLOG.md`.

**Phone/tablet:** Cluster shrinks to a compact floating pip (bottom-right on narrow viewports) — position override per §7.4.2; still shows both feeds when space allows.

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
│   ║    label: role-appropriate peer label (VP-01)            ║  │
│   ║      tutor viewer  → "Student view"                     ║  │
│   ║      student viewer → "Tutor view"                     ║  │
│   ║    mono 10px text-muted                                ║  │
│   ║                                                         ║  │
│   ╚═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═╝  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Role-appropriate label (VP-01, Andrew 2026-06-08):** The ghost label is **never a static string** — it is derived from the **viewer's role** and always names the **peer's** viewport: tutor sees **"Student view"**; student sees **"Tutor view"**. Mock includes a `⇄ role` toggle and meta-header control to preview the student perspective label.

**Implementation approach:** Rendered as a custom Excalidraw overlay element (not a canvas draw call) updated via the existing `pvs`-prefixed viewport-sync channel. The rectangle is read-only — not selectable or editable. Each participant sees the peer's bounds with the role-appropriate label on their own canvas only.

**Visibility control:** A small toggle in the top bar or AV tile: "👁 Student view" — defaults ON for remote sessions, hidden for in-person single-device sessions.

**Build-tier recommendation: Gate-A fast-follow (not V1 core).** Rationale:
- The plumbing (`pvs` viewport sync, peer viewport data) already exists
- The visual rendering is purely additive — an overlay element, no sync changes
- It does not affect reliability, sync invariants, or the freedraw hot path
- Build cost estimate: 1 focused Composer-2.5 session (reading viewport-sync code, adding the overlay element + toggle)
- Risk: LOW — purely cosmetic, isolated to the tutor's view, no student-side changes
- **Decision:** Include in the design (so the executor knows the shape); defer build until after P1.1 chrome ships and smokes green. First fast-follow priority.

### 5.4 Canvas grid toggle (VP-02)

Excalidraw exposes canvas grid via `gridModeEnabled` in `appState` (`initialData.appState` or `updateScene({ appState })` — see audit C-07 in [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md)). Native UI hides this behind Ctrl+'`; Mynk chrome surfaces it as a **per-user view preference**.

| Property | Value |
|---|---|
| Default | **OFF** (`gridModeEnabled: false`) |
| Sync | **None** — local view pref only (like theme toggle); tutor and student may differ |
| Affordance | Top-bar **View** `···` menu → "Show canvas grid" checkbox |
| Source | Andrew's wife loves grid; Sarah wants it available but off by default |

**Mock:** Live board top bar → vertical `···` View menu → checkbox toggles `.canvas-area.grid-on` (grid hidden by default).

### 5.5 Compact properties bar (PP-06)

Replaces the always-expanded properties popover with a **collapsed current-selection bar** — addresses Sarah's "palette takes up too much space" complaint (Andrew's wife echoed on first use).

**Desktop (≥1024px):**

```
┌──────────────────────────────┐
│  ●  ─  Architect             │  ← compact summary (color · width · style)
└──────────────────────────────┘
         ↓ hover
┌──────────────────────────────┐
│  Stroke color  [swatches…]   │
│  Stroke width  [presets…]    │
│  Roughness     [chips…]      │
│  More styles ▾               │
└──────────────────────────────┘
         ↓ pointer leaves → collapses
```

- Real CSS `:hover` expansion in mock — Andrew can demo without JS.
- Full option set unchanged (PP-04 tiering); only the **default footprint** shrinks.

**Phone / tablet portrait (<1024px, touch layouts):**

```
├─────────────────────────────┤
│  ●  ─  Architect  Colors ▸  │  ← compact strip; tap expands
├─────────────────────────────┤
│  ✏️  🧹  🎯  🎨  ···        │  ← bottom toolbar unchanged
```

- Tap compact strip (or legacy 🎨 control) → existing properties **bottom sheet**.
- Dismiss per **TM-11**: tap canvas/backdrop, swipe-down on handle, or × (supplement only).

**Requirement:** [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) **PP-06**. Pairs with PU-03, PP-01, TM-11.

### 5.6 End-session flow (live → review transition)

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
   │                bg-primary text-primary-fg │
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
│  ~38% width (desktop)     │  ~62% flex — SR-13: smaller notes   │
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

**Mobile (phone — see §7.4):** Notes are **primary** — full width, majority of the viewport. The session-board / "Review video while editing" panel is **not** a persistent side column; it is a slide-in overlay toggled by a "Board & video" control in the notes header (or equivalent). When closed, notes and "Save & share with parent" remain unobstructed. Tutor opens board/video only on demand.

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

### 7.0 Governing principle — **Primary-content dominance on narrow viewports**

> **Named principle (2026-06-08 mobile pass):** On mobile (narrow / phone widths), **primary content is full-width, single-column, and dominant**. Secondary panels are **dismissible overlays, bottom-sheets, drawers, or floating pips** — **never** persistent space-stealing side columns.

This principle applies across all three session-shell modes:

| Mode | Primary content (dominant) | Secondary (overlay / dismissible only) |
|---|---|---|
| **Waiting room** | Camera preview + device-check stack + admit CTA | *(none — everything stacks in one column)* |
| **Live board** | Excalidraw canvas (full-bleed behind chrome) | Properties palette → bottom sheet; video → floating pip; tools → compact icon bar |
| **Review** | Session notes editor + share actions | Board thumbnail + video replay → slide-in overlay |

Desktop (≥1024px) and tablet landscape layouts are unchanged. This principle governs **only** the `<480px` / phone breakpoint (mock: **Phone** device frame, 390×844).

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
| Pointer wand (ST-07) | ✓ Top-level | ✗ (tutor controls wand; student sees highlight) |
| Shape pulldowns | ✓ | In overflow ··· |
| More styles popover | ✓ Full | ✓ Bottom sheet |
| Follow-tutor toggle | ✗ (tutor IS the leader) | ✓ Default ON (ST-01) |
| Add page | ✓ | ✗ v1 (ST-03 defer) |
| Session timer | ✓ Top bar | ✓ Top bar (read-only) |
| End session | ✓ | ✗ (Leave) |
| A/V mic toggle | ✓ Top-level | ✓ Top-level (on bottom bar) |
| A/V video toggle | ✓ Top-level | ✓ Top-level (on bottom bar) |

### 7.3 Mobile palette-dismissal fix (Decision E — PP-02/PP-03, **TM-11**, **PP-06**)

The prior complaint: "the properties/color palette eats too much space and on mobile won't dismiss without re-tapping the tool button." **Hard requirement:** [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) **TM-11** (V1 — tap-off/backdrop, swipe-down on handle, and × as supplement only; re-tap tool as sole dismiss is disallowed). **Compact bar:** **PP-06** — collapsed current-selection strip on phone/tablet; tap expands to bottom sheet.

**Fix:**
1. Properties panel on phone = bottom sheet (not a side popover or persistent column). Slides up; dismisses on downward drag OR tap-outside OR tap on canvas OR × close.
2. Bottom sheet has a drag handle. Tap anywhere on the canvas (above the sheet) dismisses it.
3. The sheet is `max-height: 45dvh` — never more than half the screen.
4. After tool selection, the sheet is **not auto-opened** — it only opens when the user explicitly taps the compact properties strip or "Colors & styles" control. First draw is always possible without the sheet open.
5. On tablet portrait, properties is a bottom sheet (not a floating popover). On desktop, **PP-06** compact bar expands on hover (§5.5) — not a persistent quarter-screen popover.

### 7.4 Per-mode mobile layout (mock-validated 2026-06-08)

Visual reference: [`../brand-previews/whiteboard-session-shell-mock-2026-06-08.html`](../brand-previews/whiteboard-session-shell-mock-2026-06-08.html) — use the **Phone** viewport (390×844 true-proportion frame). **Compare** shows phone + tablet side by side.

#### 7.4.1 Waiting room (phone)

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  ┌─────────────────────────┐│
│  │  CAMERA PREVIEW  16:9   ││  ← full width, top
│  │  [Mic ON]  [Camera ON]  ││
│  │  ● Emma R. ready        ││
│  └─────────────────────────┘│
│  Device check (stacked)     │
│  Camera / Mic / Speaker ▾   │
│  Recording status block     │
│  [ Admit … & Start ]        │  ← full-width coral CTA
└─────────────────────────────┘
```

No left rail. No two-column squeeze. All text wraps normally at full phone width.

#### 7.4.2 Live board (phone)

```
┌─────────────────────────────┐
│  TOP BAR (compact icons)    │
├─────────────────────────────┤
│                             │
│     CANVAS (full-bleed)     │  ← dominant; ≥80% usable height
│                             │
│              ┌──────┐       │
│              │ AV   │       │  ← floating draggable pip
│              │ pip  │       │
│              └──────┘       │
├─────────────────────────────┤
│  Board1  Board2  Board3  +  │  ← board tab strip (SR-14)
├─────────────────────────────┤
│  ✏️  🧹  🎯  🎨  ···        │  ← bottom icon toolbar (not side strip)
└─────────────────────────────┘

  ╔═══════════════════════════╗  ← bottom sheet (on demand only)
  ║  Stroke properties    [×] ║
  ║  colors · width · style   ║
  ╚═══════════════════════════╝
```

- Left tool strip hidden on phone; tools move to bottom bar.
- Properties palette is **never** a layout column — only the dismissible bottom sheet (§7.3).
- Video tile is a small floating pip with top-level mic/video toggles, not a flex column.
- Mock frame: 390px portrait width.

#### 7.4.3 Review mode (phone)

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  Session notes — Emma R.    │
│  [Board & video]  Generating│  ← overlay toggle (secondary)
├─────────────────────────────┤
│                             │
│  NOTES EDITOR (full width)  │  ← primary; fills viewport
│                             │
│  [Save & share with parent] │
│  [Regenerate]               │
└─────────────────────────────┘

  (slide-in from right when "Board & video" tapped)
  ┌─────────────────────────────┐
  │  Session board          [×] │
  │  [▶ Review video …]         │
  │  [↩ Return to board]        │
  └─────────────────────────────┘
```

Notes are never squeezed into a narrow rail. Board/video is opt-in via overlay.

### 7.5 Per-mode tablet layout (mock-validated 2026-06-08)

Visual reference: same mock — **Tablet** viewport (iPad Air 834×1194 portrait, 1194×834 landscape) or **Compare** (phone + tablet simultaneously). Each frame renders at true CSS viewport dimensions then scales to fit the page.

**Design rationale:** At 834px portrait, pure phone reflow wastes horizontal space; pure desktop two-pane live board is too tight with a 48px strip + popover. Tablet therefore uses a **hybrid**: portrait borrows phone canvas/toolbar patterns where touch matters; landscape uses full desktop chrome because width matches a small laptop.

| Mode | Tablet portrait (834×1194) | Tablet landscape (1194×834) |
|---|---|---|
| **Waiting room** | **Compact two-column** — camera preview (~55%) + setup panel (260–300px) side by side; same information density as desktop, tighter gutters | **Desktop two-column** — same as ≥1024px; extra width goes to preview |
| **Live board** | **Canvas-dominant hybrid** — left strip hidden; bottom icon toolbar; properties via bottom sheet (§7.3 / TM-11); AV pip ~148px; top bar keeps Share label + mic meter (richer than phone) | **Full desktop layout** — collapsible left strip, side-anchored properties popover, full top-bar tool row |
| **Review** | **Side-by-side split** — notes editor flex-1 + fixed ~300px board/video column (no slide-in overlay; both panes always visible) | **Desktop split** — notes + 340px board column |

Portrait review intentionally **does not** use the phone overlay pattern: at 834px there is enough width for persistent board preview while editing notes — the overlay is a phone constraint, not a tablet one.

Landscape at 1194px exceeds the 1024px desktop breakpoint; the mock applies no tablet-specific overrides (desktop rules only).

---

## 8. Consent-aware recording model — UI manifestation

### 8.1 What the tutor sees

**In waiting room (Decision C + D):**
- Structural gating shown visually (§4.3)
- No "Start recording" affordance anywhere on the live board
- In-person (single device) recording toggle requires explicit action — not default

**On live board:**
- Recording status indicator in the top bar (adjacent to LIVE badge):
  - Remote: `● REC` if recording active (audio + video per consent)
  - In-person enabled: `● REC in-person`
  - Consent-limited: `● REC audio only` (video consent absent)
  - Not recording: no REC indicator (just LIVE badge)
- No "Stop recording" button — recording is structural, not manually controlled

**In-person session consent summary (persistent on live board, dismissible after reading):**
```
┌────────────────────────────────────────────────────────────┐
│  In-person (single device)  ·  Recording active            │
│  Audio: capturing  ·  Video: capturing                     │
│  Parent consent on file  ✓                                 │
│                                             [Dismiss]      │
└────────────────────────────────────────────────────────────┘
```

### 8.2 Symmetric consent enforcement (Decision C — tutor stream)

When in-person single-device recording is enabled: if `allowVideoRecording = false`, the tutor's video feed is **excluded from recording**. The tutor can still see themselves in the AV tile (local preview), but the feed is not written to the recording. A badge on the video tile: "Video not recorded" in `text-muted-foreground text-xs`.

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
| Eraser | Backspace-like / ugly eraser | `Eraser` from lucide-react — classic block eraser (**IC-01**) |
| Pointer wand (was laser) | Crosshair / laser glyph | `Wand2` from lucide-react (**ST-07**; Sarah 2026-06-08) |
| Cursor/select | Any non-standard | `MousePointer` or `MousePointer2` from lucide-react |
| Pencil/freedraw | Any non-standard | `Pencil` from lucide-react |
| Text | Any non-standard | `Type` from lucide-react |
| Alternate shapes pulldown | Rect default | **Diagonal line default** + last-used icon + `ChevronDown` (**PU-05**) |
| Share link | Any | `Link` icon + **"Copied"** transient state + dropdown chevron stub (**TU-15**) |
| Undo/Redo | ↶↷ text | `Undo2` / `Redo2` from lucide-react |
| Mic ON | Any | `Mic` from lucide-react |
| Mic OFF | Any | `MicOff` from lucide-react |
| Video ON | Any | `Video` from lucide-react |
| Video OFF | Any | `VideoOff` from lucide-react |
| More/overflow | `···` text is fine | `MoreHorizontal` or `MoreVertical` from lucide-react |
| Theme toggle | Sun/moon text | `Sun` / `Moon` from lucide-react |
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
- [ ] **Toolbar order:** Cursor → Pencil → Eraser → Text → Wand → Shapes▾ (line default) → ···
- [ ] **Share "Copied" feedback (TU-15)** — transient state on copy; dropdown stub present
- [ ] **Board tab strip (SR-14)** — "Board N" labels + `+` tab; user-facing "board" terminology
- [ ] **Desktop review split (SR-13)** — notes column narrower; mobile review unchanged
- [ ] **Compact properties bar (PP-06):** collapsed current-selection summary; desktop expands on hover; phone/tablet tap → bottom sheet with TM-11 dismiss
- [ ] **Canvas grid toggle (VP-02):** default OFF; per-user local pref in View menu
- [ ] **Ghost label (VP-01):** role-appropriate peer label on ghost bounds
- [ ] **Drawing defaults on session start:** roughness=0, edges=sharp, stroke=thinnest
- [ ] **Laser in top-level slot** (not overflow, not deferred)
- [ ] **Drag-to-dismiss palette on mobile** (properties bottom sheet dismisses on tap-outside and swipe-down)
- [ ] **Every function has a visible button** — no keyboard-only or right-click-only sole paths
- [ ] **Collapse toggle always at strip bottom** — never moves
- [ ] **AV tile cluster (SR-04)** — top-right default; tutor + student feeds; draggable + resizable; mic/video toggles
- [ ] **Ghost viewport bounds** visible when student is connected (or noted as Gate-A fast-follow with the toggle stub in place)

### 11.3 Consent and recording model

- [ ] **No tutor attestation modal** — removed entirely
- [ ] **No "Start recording" button** on live board
- [ ] **Waiting room shows recording gate** — structural gate status visible
- [ ] **In-person (single device) recording toggle** in waiting room for in-person sessions *(internal: solo)*
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
| Q1 | **Session type selection UX:** How does the tutor declare "this is an in-person single-device session" vs "this is a remote session"? Is it a setting on the session before the waiting room, or a choice IN the waiting room? | Decision C (in-person single-device recording; internal: solo mode) | Recommend: on the pre-session booking/setup page, with the waiting room reflecting the choice. The waiting room should not force a choice mid-flow. |
| Q2 | **Student waiting room UX:** What does the student see while waiting to be admitted? We've specified the tutor side but not the student waiting room screen. | Decision B | Decision needed before Phase 2 build. Suggest: simple "Your teacher will let you in shortly" screen with their own A/V preview. |
| Q3 | **Ghost bounds toggle:** Default ON or OFF? | Decision K | Recommend ON by default (useful; non-intrusive at low opacity). Toggle to disable if it distracts. |
| Q4 | **In-person (single device) recording + parent consent self-certification:** If parent consent is NOT on file, can the tutor still enable in-person single-device recording for a non-recorded session? Or is it only available if consent is on file? | Decision C | Recommend: In-person (single device) toggle always available; recording portion within it is gated by consent. Tutor can run an unrecorded in-person single-device session. |
| Q5 | **Review mode video:** When is video available? Is there always a recording? (Could be no-consent sessions with no video.) | Decision C, D | Design should show "No recording for this session" gracefully when `allowVideoRecording=false` and `allowAudioRecording=false`. |
| Q6 | **"Return to board" from review mode:** Can the tutor actually draw again after ending the session? (Is the board read-only in review?) | Decision A | Recommend: board is read-only in review mode for the current architecture; add annotations = separate explicit action (or always writeable). Clarify before build. |
| Q7 | **Asymmetric viewport handling:** How should the participant with the **smaller viewport** (sees less of the canvas) experience the shared board + ghost bounds? **Candidate (a):** smaller-view person sees the larger person's bounds as ghost + a one-tap **"follow tutor"** that snaps their viewport to match. **Candidate (b):** the larger-view person's ghost shows the smaller person's box so they can bring content into where the student is looking. | Decision K, VP-01; follow-tutor ST-01 | **Needs Andrew decision** — do not resolve in design pass. |
| Q8 | **Scheduling + external calendar** — Sarah considers this a release feature. Full proposal in `BACKLOG.md` § Scheduling; **pending Andrew scope decision** (competes with current V1 gate list). | Product | **Not committed V1** until Andrew decides sequencing. |

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
- **2026-06-08:** Color-fidelity pass — dark surface ladder + semantic tokens aligned to `tokens.css`; primary CTAs corrected to coral (`--accent` / `--accent-on`); build note added re shadcn `--primary` mapping.
- **2026-06-08:** Mobile responsive pass — §7.0 **Primary-content dominance** principle; per-mode phone layouts (§7.4); mock updated with single-column waiting room, full-bleed canvas + properties bottom sheet + AV pip on live board, notes-primary + board slide-in overlay on review. Desktop layouts unchanged.
- **2026-06-08:** Device-frame mock pass — true-proportion **Phone** (390×844), **Tablet** (iPad Air portrait/landscape), and **Compare** viewports with CSS `transform: scale()` fit; §7.5 tablet per-mode treatment (portrait hybrid, landscape desktop).
- **2026-06-08:** Live-feedback pass — **VP-01** role-appropriate ghost labels; **VP-02** canvas grid toggle (default OFF); **PP-06** compact properties bar (hover desktop / tap+TM-11 touch); open Q7 asymmetric viewport handling.
- **2026-06-08:** Sarah pilot batch — **IC-01** eraser glyph; **ST-07** wand icon; **PU-05** shapes pulldown (line default); **TU-15** Share→Copied; **SR-13** desktop review notes narrower; **SR-14** board tab strip; **SR-04** AV cluster top-right + both participants + resize; **TU-16** parent-friendly recording copy; open Q8 scheduling.
