# Whiteboard chrome — P1.2 visual design (2026-06-08)

> **Purpose:** Full visual design for the Mynk whiteboard chrome layer — desktop, tablet, and phone — expressed in ratified primitives and tokens, satisfying all requirements. This is the build-ready spec for the P1.1 executor (Sonnet-tier).
>
> **Design parent:** [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) — architecture, phasing, POC gates, acceptance criteria. Read that first.
>
> **Requirements:** [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) — 68 requirements (TU-14, TM-10, PP-04, ST-05, PR-01, TU-12/TU-13).
>
> **Function dispositions:** [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md) — what goes where (Mynk toolbar / popover / More / DROP).
>
> **Token vocabulary:** [`docs/V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §1A — ratified primitives. [`src/styles/tokens.css`](../../src/styles/tokens.css) — canonical token values.
>
> **Visual language source:** `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` Surface 4 (active recording) — the established Mynk visual language for mid-session surfaces. The whiteboard chrome draws on this surface directly: `rec-topbar`, `rec-tool/.is-active`, `rec-live` badge, `rec-statusbar`, `rec-whiteboard-toolbar`.
>
> **Authored:** 2026-06-08. **Status:** RATIFIED — P1.1 executor may build from this.

---

## 1. Visual language source — Surface 4 (active recording)

The mock's Surface 4 establishes the precise visual language for mid-session chrome. Every design decision in this doc is derived from it or explicitly departs from it with a stated reason.

### 1.1 Key patterns extracted from Surface 4

| Pattern | Mock class | Token mapping | Notes |
|---|---|---|---|
| Top session bar | `.rec-topbar` | `bg-card border border-border rounded-md` | Raised card on `--surface-base` page; note rounded-md (10px) |
| "LIVE" / status badge | `.rec-live` | `bg-accent-soft text-accent-text rounded-full` + live-dot `bg-accent` | The universal "active session" signal |
| Session timer | `.rec-timer` | `font-mono font-semibold text-foreground tabular-nums` | 18px, letter-spacing 0.02em |
| End session button | `.rec-end-btn` | `bg-foreground text-background rounded-sm` (inverse colors) | Navy/dark bg + cream text — authority, not destructive |
| Whiteboard container | `.rec-whiteboard` | `bg-card border border-border rounded-md flex-1` | The canvas lives in a raised card; overflow: hidden |
| Mini toolbar bg | `.rec-whiteboard-toolbar` | `bg-surface-base border border-border rounded-sm p-1` | Small, floating, top-right in the mock |
| **Active tool** | `.rec-tool.is-active` | **`bg-foreground text-background`** | **Inverse colors: navy/dark bg + cream text — NOT coral** |
| Hover tool | `.rec-tool:hover` | `bg-muted/60 text-foreground` | `surface-sunken` equivalent |
| Default tool | `.rec-tool` | `text-muted-foreground` transparent bg | Mono label style (11px JetBrains Mono in mock) |
| Status bar | `.rec-statusbar` | `bg-card border border-border rounded-md` | Bottom info bar; `font-mono text-muted-foreground text-xs` |
| Status dot OK | `.stat-item.is-ok .dot` | `bg-[#5b9b73]` — a muted green | Non-semantic green; map to `--success` token |
| Status dot active | `.stat-item .dot` | `bg-accent` (coral) | Upload/recording-active indicator |
| Right panel bg | `.rec-side` | `bg-card border-l border-border` | Transcript panel — same surface as sidebar |
| Transcript speaker (tutor) | `.rec-trans-speaker` | `text-accent-text` | Light peach/coral label; `font-mono uppercase text-[10px]` |
| Transcript speaker (student) | `.is-other .rec-trans-speaker` | `text-muted-foreground` | Differentiated but still muted |

### 1.2 Critical departure: full-height tool strip vs mini corner toolbar

The mock's `.rec-whiteboard-toolbar` is a compact floating corner element (4-tool illustration). The P1.2 design uses a **collapsible left strip** (the ratified §3 hybrid layout) — same visual language, different geometry. The token/color decisions from the mock apply; the layout departs intentionally.

### 1.3 What coral is NOT used for

Across all 6 mock surfaces, coral `--accent` is used for: CTAs, live dots, active nav highlights, AI/pending strips, timestamps, session-status pills, feature icons. It is **never** used for active tool selection in a toolbar. Active tool = **inverse colors** (`bg-foreground text-background`). This is a firm boundary: do not make active-tool state coral.

---

## 2. Token vocabulary for whiteboard chrome

All controls use these token mappings. No raw hex. No `dark:` variants. Theme-agnostic per §2.11.

### 2.1 Surface tokens

| Zone | Token class | Fallback value (light) |
|---|---|---|
| Page (canvas container) | `bg-background` | `--surface-base` #f5f4ec |
| Left strip panel | `bg-card border-r border-border` | `--surface-1` #fcfbf4 |
| Top bar | `bg-card border-b border-border` | `--surface-1` #fcfbf4 |
| Properties popover | `bg-popover border border-border shadow-md` | `--surface-1`, shadow |
| "More styles" inner area | `bg-muted` | `--surface-2` #ecebe1 |
| Overflow `···` panel | `bg-popover border border-border shadow-md` | same |
| Bottom page strip | `bg-card border-t border-border` | `--surface-1` |

### 2.2 Interactive state tokens (toolbar buttons)

| State | Token class | Note |
|---|---|---|
| Default | `bg-transparent text-muted-foreground` | Icon slightly muted |
| Hover | `hover:bg-muted/60 text-foreground` | Surface-2 wash |
| **Active tool** | **`bg-foreground text-background`** | **Inverse (mock `.rec-tool.is-active`)** |
| Focus-visible | `ring-2 ring-ring` | `--focus-ring` = `--border-strong` |
| Disabled | `opacity-50 cursor-not-allowed` | |

### 2.3 Status / signal tokens

| Signal | Token pattern |
|---|---|
| LIVE badge | `bg-accent-soft text-accent-text rounded-full` + dot `bg-accent animate-pulse` |
| Active recording dot | `bg-accent` (coral, 7px, box-shadow halo `--accent-soft`) |
| Upload/sync OK | `text-success` dot |
| Upload pending | `text-accent` (coral) dot |
| Error | `text-destructive` dot + inline text |

### 2.4 Sizing

| Target | Desktop | Touch (≥TM-10) |
|---|---|---|
| ToolbarButton | 36×36px | 48×48px |
| Icon size | 18px | 20px |
| Top bar height | 44px | 48px |
| Left strip width | 48px | 56px |
| Properties popover width | 240px | full-width minus 24px margin |
| Stroke swatch circle | 20px | 28px |
| Stroke width preset | 28×28px | 36×36px |
| Min touch target (TM-10) | — | 48px |

---

## 3. Desktop tutor-desktop layout

**Requirement refs:** TB-01–11, PU-01–04, PP-01–05, SR-01–12, TU-01–14, TM-10, ST-05, PR-01.

### 3.1 Full desktop wireframe (expanded left strip)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR ~44px │ bg-card border-b border-border                                               │
│  [Mynk·]  │  [🔗 Share link]  [🎙▮▮▯ Mic ▾]  [📷 Cam]  │  [↶][↷]  │  [PDF][🖼][∑][📊]  │  [−][100%][+][⊡]  │  [☾/☀]  │
│  TU-07        TU-08                              TB-11         TU-04              TB-07        TU-13              │
│  (wordmark omitted in session; shown if top-bar    ─── zone separators: border-r border-border ───               │
│   has space — always bg-card, position: sticky)                                              │
├────────┬────────────────────────────────────────────────────────────────────────────────────┤
│  LEFT  │                                                                                     │
│  STRIP │                                                                                     │
│  48px  │                                                                                     │
│  bg-   │                         EXCALIDRAW CANVAS                                           │
│  card  │                     (flex-1, bg-background, no padding)                             │
│  brd-r │                                                                                     │
│        │                                          ┌─────────────────┐                        │
│ [▣]sel │                                          │  AV tile        │                        │
│ T-01   │                                          │  position:fixed │                        │
│        │                                          │  bottom-right   │                        │
│ [✎]pen │                                          │  bg-card border │                        │
│ T-02   │                                          │  rounded-md     │                        │
│        │                                          │  120×80px       │                        │
│ [⌫]ers │                                          └─────────────────┘                        │
│ T-03   │                                                                                     │
│        │   ┌─ PROPERTIES POPOVER (contextual, anchored left-strip) ──────────────────────┐  │
│ [T]txt │   │  bg-popover border border-border shadow-md rounded-md p-3 w-60              │  │
│ T-04   │   │  (appears on tool select OR element selection; dismiss outside-click PP-02) │  │
│        │   │  [see §4 for full popover spec]                                             │  │
│ [🔴]las│   └──────────────────────────────────────────────────────────────────────────────┘  │
│ T-16   │                                                                                     │
│ ST-05  │                                                                                     │
│        │                                                                                     │
│ [↗▾]  │  ← PulldownButton (shows last-used sub-tool icon + ▾ chevron)                       │
│ T-08+  │    Dropdown: [→ Arrow] [─ Line] (horizontal; popover anchored right)                │
│ T-09   │    PU-01                                                                            │
│        │                                                                                     │
│ [▭▾]  │  ← PulldownButton                                                                   │
│ T-05+  │    Dropdown: [▭ Rect] [◇ Diamond] [○ Ellipse] (horizontal)                         │
│ T-06+  │    PU-01, TB-03                                                                     │
│ T-07   │                                                                                     │
│        │                                                                                     │
│  ─ sep ─  border-b border-border-subtle mx-2 my-1                                            │
│        │                                                                                     │
│ [···]  │  ← More overflow (TU-14)                                                            │
│        │    Popover: z-order buttons, delete, hand, shortcuts help                           │
│        │    [see §5]                                                                         │
│        │                                                                                     │
│  ─ sep ─                                                                                     │
│        │                                                                                     │
│ [◀] ← collapse chevron (SR-02, SR-08, TB-05)                                                 │
│        │    Collapsed: strip shrinks to 0, chevron [▶] stays visible as 24px strip          │
├────────┴────────────────────────────────────────────────────────────────────────────────────┤
│ PAGE STRIP ~32px │ bg-card border-t border-border │ [Pg 1 ●][Pg 2][Pg 3][+] │ SR-06, SR-10 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Control placement table

| Zone | Controls | Req refs | Primitive |
|---|---|---|---|
| **Top bar left** | [Mynk·] wordmark (small, `text-sm`), \| separator, [🔗 Share link] | TU-07 | `Button variant="ghost" size="sm"` |
| **Top bar center-left** | [🎙 Mic ▮▮▯ ▾] meter + device picker, [📷 Cam toggle] | TU-08 | `Button variant="ghost" size="icon"` + mic meter bars in `bg-accent` |
| **Top bar center** | \| sep, [↶ Undo][↷ Redo], \| sep | TB-11, TU-03 | `ToolbarButton` (existing UndoRedoButtons) |
| **Top bar center-right** | [PDF][🖼 Img][∑ Math][📊 Desmos] | TU-04, TB-08–10 | `Button variant="ghost" size="icon"` |
| **Top bar right** | [−][100%][+][⊡ Fit], \| sep, [☾/☀ theme] | TB-07, TU-13 | Zoom: `Button variant="ghost" size="sm"`; theme: `ThemeToggleChip` |
| **Left strip** | Cursor, Pencil, Eraser, Text, Laser, Lines▾, Shapes▾, ···, ◀ | TB-01–05, ST-05, PU-01 | `ToolbarButton` 36px (48px if touch) |
| **Properties popover** | Stroke color, width, opacity + More tier (see §4) | PP-01–05 | `PropertyPopover` with `StrokeColorSwatch`, `StrokeWidthPreset` |
| **Overflow `···`** | Z-order, delete, hand | TU-14, TM-10 | `Button variant="ghost" size="default"` inside `Popover` |
| **AV tile** | Video feed, pip | SR-04 | `position: fixed bottom-4 right-4` overlay |
| **Page strip** | [1][2][3][+] pills | SR-06, SR-10 | Existing `PageStrip` |

### 3.3 Top bar zone separators

Between each functional group in the top bar, use a vertical separator:
- `<span className="h-4 w-px bg-border-subtle mx-1" aria-hidden />` — 1px, 16px tall, `--border-subtle`

Groups (left to right): `[identity/share]` · `[AV]` · `[undo/redo]` · `[inserts]` · `[zoom]` · `[theme]`

### 3.4 Left strip visual states

```
DEFAULT STRIP (48px wide, bg-card, border-r border-border):

 ┌──────────────────┐
 │                  │
 │  ┌────────────┐  │  ← ToolbarButton 36×36px, rounded-md
 │  │  ▣         │  │    default: bg-transparent text-muted-foreground
 │  └────────────┘  │
 │                  │
 │  ┌────────────┐  │  ← Active tool (freedraw selected):
 │  │  ✎  ██████│  │    bg-foreground text-background (inverse)
 │  └────────────┘  │    (matches mock .rec-tool.is-active)
 │                  │
 │  ┌────────────┐  │  ← PulldownButton: icon + ▾ (8px, text-muted)
 │  │ ↗ ▾       │  │
 │  └────────────┘  │
 └──────────────────┘

COLLAPSED STRIP (≤24px, chevron only):

 ┌────┐
 │  ▶ │  ← 24px strip, chevron button
 └────┘
```

---

## 4. Properties popover — full specification

**Opens:** On tool activation (freedraw, text, shapes, eraser) OR on element selection.  
**Dismiss:** Outside-click / tap anywhere on canvas (PP-02, TM-01).  
**Anchor:** Left edge of strip, vertically centered on active tool button.  
**Width:** 240px desktop; full-width minus 24px margin on touch.

```
┌─ PROPERTIES POPOVER ─────────────────────────────────────────────────────┐
│  bg-popover border border-border shadow-md rounded-md p-3                │
│                                                                           │
│  STROKE COLOR  (P-01 — always visible inline)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ ●  ○  ●  ●  ●  ●  ●  ●  [+]                                        │ │
│  │ ▲                                                                    │ │
│  │ selected: ring-2 ring-ring ring-offset-1 (--focus-ring / accent)    │ │
│  │ StrokeColorSwatch: 20px circle, border border-border, rounded-full  │ │
│  │ Presets: near-black, white, 3 greys, red, orange, blue, + custom    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  STROKE WIDTH  (P-04 — always visible inline)                             │
│  ┌────────────────────────────────────────┐                              │
│  │ [—] [──] [───] [────]                  │  (4 presets, thinnest first) │
│  │     ▲ active: bg-accent-soft ring-1   │  (DD-03: thinnest = default) │
│  │     StrokeWidthPreset: 28×28px        │                              │
│  └────────────────────────────────────────┘                              │
│                                                                           │
│  OPACITY  (P-15 — always visible)                                         │
│  Opacity: [████████░░] 80%   ← slider, --slider-track/thumb              │
│                                                                           │
│  ROUGHNESS  (P-07 — visible when shape/freedraw active)                   │
│  [Architect ✓] [Artist] [Cartoon]   ← 3-chip toggle                      │
│   (DD-01: Architect = default, roughness 0)                              │
│                                                                           │
│  EDGES  (P-08 — visible when shape active, not freedraw)                  │
│  [Sharp ✓]  [Round]   ← 2-chip toggle                                    │
│   (DD-02: Sharp = default)                                               │
│                                                                           │
│  ─────────────────────────────────────────────────────────────────────   │
│  [More styles ▾]  ← Button variant="ghost" size="sm" text-xs            │
│   PP-04: expands area below; ALL remaining native style props             │
│                                                                           │
│  ┌─ MORE STYLES AREA (bg-muted rounded-md p-2 mt-2) ────────────────┐   │
│  │                                                                    │   │
│  │  FILL  (P-03)                                                      │   │
│  │  [None ✓][⬚ Hatch][⊠ Cross][■ Solid]   ← 4-chip                  │   │
│  │                                                                    │   │
│  │  STROKE STYLE  (P-06)                                              │   │
│  │  [─ Solid][-- Dash][··· Dot]   ← 3-chip                           │   │
│  │                                                                    │   │
│  │  FREEDRAW PROFILE  (P-05 — freedraw only)                          │   │
│  │  [Profile 1][Profile 2][Profile 3]   ← 3-chip                     │   │
│  │                                                                    │   │
│  │  ARROW TYPE  (P-09 — arrows only)                                  │   │
│  │  [Round][Sharp][Elbow]   ← 3-chip                                  │   │
│  │                                                                    │   │
│  │  ARROWHEADS  (P-14 — arrows/lines)                                 │   │
│  │  Start: [none][dot][arrow][filled]  End: [none][dot][arrow][filled]│   │
│  │                                                                    │   │
│  │  FONT FAMILY  (P-10 — text only)                                   │   │
│  │  [Virgil][Helvetica][Code]   ← 3-chip                              │   │
│  │                                                                    │   │
│  │  FONT SIZE  (P-11 — text only)                                     │   │
│  │  [S][M][L][XL]   ← 4-chip; keyboard: Ctrl+Shift+,/.               │   │
│  │                                                                    │   │
│  │  TEXT ALIGN H  (P-12 — text only)                                  │   │
│  │  [←][↔][→]   ← icon buttons                                       │   │
│  │                                                                    │   │
│  │  TEXT ALIGN V  (P-13 — text only)                                  │   │
│  │  [↑][↕][↓]   ← icon buttons                                       │   │
│  │                                                                    │   │
│  │  ─ separator ─                                                     │   │
│  │                                                                    │   │
│  │  Z-ORDER  (P-16–P-19, TU-14)                                       │   │
│  │  [⬇ Send to back][↓ Send backward][↑ Bring forward][⬆ To front]  │   │
│  │  (Visible buttons — buried is OK, button-less is not per TU-14)   │   │
│  │                                                                    │   │
│  │  [🗑 Delete selected]  (P-24, TU-10, TU-14)                        │   │
│  │  Button variant="destructive" size="sm" — visible, buried in More  │   │
│  │                                                                    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  (outside-click → dismiss; PP-02, TM-01)                                 │
│  (long-press on strip button → same popover opens; TM-10)                │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Chip (toggle button) primitive

Used throughout the More styles tier:

| State | Token |
|---|---|
| Default | `border border-border bg-transparent text-foreground text-xs h-7 px-2 rounded-sm` |
| Selected | `bg-foreground text-background border-foreground` (matches active tool — inverse) |
| Hover | `hover:bg-muted/60` |

### 4.2 Popover trigger behavior

- Popover is **persistent while a tool is active** (not a press-and-hold; stays open until dismissed or tool changes)
- **On tool change**: popover contents update for the new tool (e.g., switching to text shows font controls)
- **On deselect** (click empty canvas): popover closes
- **On element select**: popover shows properties for that element's tool type
- **Outside-click**: closes popover; canvas retains focus so keyboard shortcuts still fire (TU-11)

---

## 5. Overflow (`···`) panel

**Position:** Anchored to `···` strip button; appears as popover to the right.  
**Touch (TM-10):** Long-press on `···` also opens this panel.

```
┌─ OVERFLOW PANEL ────────────────────────────────────────┐
│  bg-popover border border-border shadow-md rounded-md    │
│  min-w-[180px] p-1                                       │
│                                                          │
│  [⬇ Send to back]    Ctrl+Shift+[                        │
│  [↓ Send backward]   Ctrl+[                              │
│  [↑ Bring forward]   Ctrl+]                              │
│  [⬆ Bring to front]  Ctrl+Shift+]                        │
│  (P-16–P-19, TU-14, TM-10)                              │
│                                                          │
│  ─ separator ─                                           │
│                                                          │
│  [🗑 Delete selected]   Delete/Backspace                  │
│  (P-24, TU-10, TU-14 — variant="destructive")           │
│                                                          │
│  ─ separator ─                                           │
│                                                          │
│  [✋ Hand / pan]   H or Space+drag                        │
│  (T-11, NR-01)                                           │
│                                                          │
│  [? Shortcuts]   (optional, NR-09)                       │
│                                                          │
│  ─ separator ─                                           │
│                                                          │
│  PDF deepest-z note: (info chip, not a button)           │
│  "PDF pages are always below your drawing."              │
│  font-mono text-xs text-muted-foreground p-2             │
└──────────────────────────────────────────────────────────┘
```

**Item spec:** Each overflow item is a `<Button variant="ghost" size="default" className="w-full justify-start gap-3 text-sm font-normal">` — full-width, left-aligned, with keyboard shortcut hint right-aligned in `text-muted-foreground text-xs`.

---

## 6. Right-click / long-press context menu

**Trigger:** Right-click on canvas (desktop) OR long-press >500ms (touch, TM-10).  
**TU-14:** This is an accelerator — every item here ALSO has a visible button in overflow or More.

```
┌─ CONTEXT MENU (element selected) ─────────────────────┐
│  bg-popover border border-border shadow-md rounded-md  │
│  p-1 min-w-[160px] (native-ish presentation)           │
│                                                        │
│  Cut              Ctrl+X                               │
│  Copy             Ctrl+C                               │
│  Paste            Ctrl+V                               │
│  Duplicate        Ctrl+D                               │
│  ─                                                     │
│  Send to back     Ctrl+Shift+[   (P-16)               │
│  Send backward    Ctrl+[         (P-17)               │
│  Bring forward    Ctrl+]         (P-18)               │
│  Bring to front   Ctrl+Shift+]   (P-19)               │
│  ─                                                     │
│  Group            Ctrl+G         (P-25)               │
│  Ungroup          Ctrl+Shift+G   (P-26)               │
│  ─                                                     │
│  Delete           Delete         (P-24, C-32)         │
│  (text-destructive color)                              │
└────────────────────────────────────────────────────────┘
```

**Empty canvas context menu (TU-14):** Right-click on blank canvas shows Paste, Select All only. Z-order / delete require a selection.

---

## 7. Whiteboard-local theme toggle (TU-13)

**Position:** Top bar, rightmost slot (right of zoom controls).  
**Visual:**

```
[☾]  ← Button variant="ghost" size="icon" (36px)
     Light mode: shows moon icon (☾)
     Dark mode: shows sun icon (☀)
     Active ring: none (it's a state indicator, not a toggle highlight)
     Tooltip: "Toggle whiteboard theme"
```

**Wiring:** Calls `useTheme().toggle()` from the central theme provider — the same call the global nav toggle makes. Whiteboard-local and global nav toggle are aliases, not separate state. Excalidraw `theme` prop updates automatically via `useTheme` (TU-12).

---

## 8. Tablet layout (~768–1024px)

Tutor-on-tablet is **deferred to v1.1** (TM-09, Fork 2). The tablet layout described here is for **student on a tablet** (Phase 2) and for reference on smaller screens that may be encountered.

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOP BAR ~44px  bg-card border-b border-border                        │
│  [🔗][🎙▾][↶][↷] │ [PDF][🖼][∑] │ [−][+][⊡] │ [☾]                   │
│  (wordmark omitted; compact; all top-bar functions kept)             │
│  TU-07  TU-08   TB-11          TU-04       TB-07    TU-13           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                    CANVAS  (flex-1, ≥80% viewport)                   │
│                                                                      │
│                                    ┌────────────┐                    │
│                                    │ AV tile    │                    │
│                                    │ fixed BR   │                    │
│                                    └────────────┘                    │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ BOTTOM TOOL BAR ~56px  bg-card border-t border-border               │
│  [▣ sel][✎ pen][⌫ ers][T txt][🔴 las][↗▾][▭▾][···]                 │
│  T-01   T-02   T-03   T-04   T-16   T-08  T-05  overflow            │
│  (touch targets 48px each; SR-01; full-width flex)                  │
├─────────────────────────────────────────────────────────────────────┤
│ PAGE STRIP ~40px  bg-card border-t border-border                     │
│  [Pg 1 ●][Pg 2][Pg 3][+]                                            │
│  SR-06                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Properties popover on tablet:** Appears as a **bottom sheet** (not a side-anchored popover) — slides up from bottom, max-height 50vh, with drag handle. Dismisses on outside-tap (TM-01, PP-03). Full-width minus 16px margin on each side.

**Shape pulldown on tablet:** Appears inline above the bottom tool bar (not as a floating popover off the strip button).

---

## 9. Phone layout (≤480px — student-mobile-first variant, Phase 2)

Per `student-mobile-first` variant spec (§4 of design doc). Fundamentally different layout — not a breakpoint shrink of tutor desktop.

**Requirement refs:** SR-01, SR-05–07, SR-12, ST-01–04, TM-01, TM-03, TM-06–07, TM-10, TB-06.

```
┌────────────────────────────────────────────────────────────────┐
│  height: 100dvh (SR-07, SR-12)  — iOS Safari URL-bar safe      │
│  bg-background (--surface-base cream/navy)                      │
│                                                                │
│                                                                │
│                                                                │
│            CANVAS  (flex-1, ≥80dvh, overflow:hidden)           │
│            (Excalidraw, native toolbar hidden TB-06)           │
│            bg: --excalidraw-bg (follows app theme TU-12)       │
│                                                                │
│                              ┌─────────────────┐              │
│                              │  AV tile (fixed)│              │
│                              │  80×56px corner │              │
│                              │  bg-card border │              │
│                              │  rounded-md     │              │
│                              │  SR-04          │              │
│                              └─────────────────┘              │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ PAGE STRIP ~40px  bg-card border-t border-border               │
│  [1 ●][2][3]  ← pill tabs, rounded-full, text-xs font-mono    │
│  Active: bg-foreground text-background                         │
│  SR-06, ST-06 (mirrors tutor section grouping, read-only)      │
├────────────────────────────────────────────────────────────────┤
│ BOTTOM CONTROL BAR ~48px  bg-card border-t border-border       │
│  [✓ Follow tutor ON]  [🎙 Mic]  [✕ Leave]                      │
│  ST-01 default-on     ST-02     ST-02                          │
│  (each: 48px touch target, TM-10)                              │
│  Follow: accent-soft bg + accent-text when ON                  │
│          border border-border when OFF                         │
└────────────────────────────────────────────────────────────────┘

FLOATING TOOL BUTTONS (pencil + eraser, TB-06):
  [✎]  [⌫]
  position: fixed, bottom: calc(48px + 40px + 12px)  ← above strip+bar
  right: 12px
  ToolbarButton 48px each, bg-card border border-border rounded-md shadow-sm
  Active: bg-foreground text-background

[···] TOOLS OVERFLOW — bottom sheet (50vh max):
  Drag handle ▬  bg-muted-foreground/30  rounded-full  8×32px
  bg-card rounded-t-xl shadow-lg
  p-4 grid grid-cols-4 gap-3
  All tools (T-01–T-04, T-08–T-09, T-16, etc.) as 48px ToolbarButtons
  Z-order + delete buttons — visible here (TU-14, TM-10)
  Dismiss: outside-tap (TM-01, PP-03)
```

### 9.1 Student phone properties panel

```
┌─ PROPERTIES BOTTOM SHEET ────────────────────────────────────────────┐
│  bg-card rounded-t-xl shadow-lg p-4                                  │
│  max-height: 45dvh  overflow-y: auto                                 │
│  drag-handle at top                                                   │
│                                                                      │
│  Stroke color: [swatch row, 28px circles, 4px gap]                   │
│  Stroke width: [— ── ─── ────]                                       │
│  Opacity:      [slider]                                              │
│                                                                      │
│  [More styles ▾] expands in same sheet (scroll)                      │
│  (all P-03–P-14 tiered below)                                        │
│                                                                      │
│  dismiss: drag down / tap-outside (TM-01, PP-02, PP-03)             │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.2 Phase 2 acceptance gates (student phone)

Per design doc §6 Phase 2 acceptance:

| Criterion | Verify via |
|---|---|
| Canvas ≥80% viewport | Real iPhone Safari measure (TM-03 — jsdom blind spot) |
| `100dvh` correct | iPhone Safari URL-bar collapse test |
| Outside-tap dismiss | Touch test on device |
| Touch targets ≥48px | DevTools touch overlay |
| Pencil + eraser visible | Visual spot-check |
| Follow-on by default | Functional smoke |
| Sync `test:wb-sync` green | CI |

---

## 10. Drawing defaults (DD-01–04)

Set on session mount via `initialData.appState` + `updateScene`. These are non-visual but the chrome must display them correctly in the properties popover.

| Field | Value | Popover display |
|---|---|---|
| `currentItemRoughness` | `0` (architect) | "Architect" chip selected |
| `currentItemRoundness` | `"sharp"` (confirm exact at build time) | "Sharp" chip selected |
| `currentItemStrokeWidth` | thinnest preset (`1` or verify at build time) | Thinnest preset selected |
| `currentItemStrokeColor` | `var(--excalidraw-stroke)` (near-navy light / warm-white dark) | Darkest swatch selected |

**DD-04:** Stroke presets must include a "materially thinner" option (e.g., hairline) in addition to the default thinnest — for math annotation without requiring zoom.

---

## 11. Freedraw-latency constraint (PR-01)

> This is a BUILD constraint, not a design constraint. It is recorded here so the P1.2 executor does not accidentally introduce violations in the chrome layer.

**The constraint:** Do not add any per-pointer-move work to `onChange`. The freedraw-latency fix (Option A + E, design doc §6 P1.1 gate) eliminates the current per-move scene clone. Any new chrome-driven code that runs on every `onChange` event (e.g., reading `getAppState().activeTool` to update highlight) must be profiled to confirm it does not re-introduce O(N) blocking work on paint.

**Safe patterns:**
- Read `activeTool` from `onChange` to update the active-tool indicator — this is a single ref read, safe.
- Do NOT call `updateScene` on every pointer-move; only call it on tool-switch or style-change user actions.
- Do NOT access `getSceneElements()` on every pointer-move; this is O(N).

**Test gates:** `npm run test:wb-sync` + `use-tutor-live-document-wire` cadence tests green. Freedraw must feel instant (POC parity) before P1.1 ships.

---

## 12. Z-order and PDF deepest-z (TU-14, NR-11)

**Hard default:** PDF page images are the deepest z-order element on every canvas. All drawn strokes and annotations render above PDFs. This is applied at PDF-insert time (set `zIndex` or layer order so PDF elements are sent to back immediately on insert).

**Visible affordances (TU-14):**
1. Z-order buttons in Properties popover → More styles tier (see §4)
2. Z-order buttons in Overflow `···` panel (see §5)
3. Z-order items in right-click / long-press context menu (see §6)
4. Keyboard shortcuts documented (accelerators, not sole path)

**Touch parity (TM-10):** Long-press on `···` strip button opens overflow panel including z-order buttons. Long-press on canvas (empty) opens canvas context menu (no element selected → only Paste, Select All). Long-press on element opens element context menu with z-order + delete.

---

## 13. Laser pointer placement (ST-05)

**V1 top-level toolbar slot** — NOT deferred to overflow or Phase 3.

- **Position in left strip:** Between Eraser (T-03 / Text T-04) and Lines pulldown — 5th or 6th slot depending on final tool order.
- **Icon:** Laser pointer icon (e.g., `<Target />` or `<Crosshair />` from lucide); labeled "Laser" in tooltip.
- **API:** `setActiveTool({ type: "laser" })` — wait, verify at build time: `laser` or `freedraw` with laser mode? Check Excalidraw 0.18.1 `SHAPES` for exact type. The design doc says T-16 uses the laser button in collab mode; verify the exact `setActiveTool` call.
- **Active state:** Same as other tools — `bg-foreground text-background` (inverse).
- **Alignment verify:** Per ST-05, laser pointer position must appear correctly aligned to students. Viewport-alignment fix (2026-05-30) cleared most misalignment; verify in Phase 1 smoke.

---

## 14. Cross-links

| Doc | Role |
|---|---|
| [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) | Architecture, phasing, POC gate, P1.1 acceptance criteria, freedraw-latency fix spec |
| [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) | 68 requirements (TU-14, TM-10, PP-04, ST-05, PR-01, TU-12/TU-13) |
| [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md) | Ratified function dispositions (what goes in chrome vs More vs DROP) |
| [`docs/V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) §1A.5 | Toolbar/icon-control primitive spec |
| [`src/styles/tokens.css`](../../src/styles/tokens.css) | Token values |
| [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](../brand-previews/palette-mocks-FINAL-mynka-blue.html) | Visual source of truth (Surface 4 — active recording) |

---

## Changelog

- **2026-06-08:** Initial doc. Visual design pass completing architecture from `whiteboard-chrome-design-2026-06-07.md`. Draws on Surface 4 (active recording mock) for visual language; all primitives from `V1-COMPONENT-LIBRARY.md §1A`. Desktop + tablet + phone wireframes with full req-ID annotations. Authored by Sonnet subagent on branch `v1-redesign`.
