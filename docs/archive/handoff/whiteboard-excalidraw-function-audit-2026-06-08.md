# Excalidraw native function audit — coverage before chrome hide

> **Purpose:** Inventory every user-reachable Excalidraw function in `@excalidraw/excalidraw@0.18.1` and record a **coverage disposition** before we hide native UI (`zenModeEnabled` + scoped CSS) and drive the canvas from Mynk chrome.
>
> **Package verified:** `node_modules/@excalidraw/excalidraw` → version **0.18.1** (`dist/dev/index.js`, `dist/dev/chunk-4FTI6OG3.js` shapes, `dist/types/excalidraw/actions/shortcuts.d.ts`).
>
> **Our integration today:** `WhiteboardWorkspaceClient.tsx` / `StudentWhiteboardClient.tsx` pass `UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false } }}` only. No `aiEnabled` prop → stock Excalidraw defaults apply for AI-gated tools.
>
> **Requirements cross-ref:** [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) (67 reqs). **Design cross-ref:** [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md).
>
> **Audited:** 2026-06-08.
>
> **Andrew ratification 2026-06-08:** Dispositions locked for pen mode (T-12 / NR-03), all native styles kept + tiered (NR-02 / P-03–P-14), theme + board background (M-09/M-10 / NR-04 / **TU-13**), z-order + PDF deepest-z (P-16–P-19 / NR-11), laser V1 top-level (T-16 / NR-06 / ST-05), delete affordances (P-24 / NR-05). Two standing principles ratified: **every-function-a-button** (**TU-14**) and **full touch parity** (**TM-10**). P1.2 toolbar design unblocked.

---

## Methodology

1. **Tool rail** — `SHAPES` array (`chunk-4FTI6OG3.js` ~L7955) + `ShapesSwitcher` extra-tools dropdown (`index.js` ~L12458).
2. **Properties panel** — `SelectedShapeActions` (`index.js` ~L12305).
3. **Context menu** — `getContextMenuItems` (`index.js` ~L29190): `canvas` vs element/selection paths.
4. **Main menu** — `DefaultMainMenu` (`index.js` ~L21056) + `DefaultItems` (`dist/types/.../DefaultItems.d.ts`).
5. **Footer** — `Footer` (`index.js` ~L16736): zoom, undo/redo, help, finalize (touch).
6. **Keyboard** — `shortcutMap` (`index.js` ~L11984) + per-action `keyTest` + canvas `onKeyDown` tool routing (`index.js` ~L26300+).
7. **Library** — `DefaultSidebar` + `LibraryMenu` (`index.js` ~L18241, ~L21312).
8. **Mynk custom** — `UndoRedoButtons`, `PdfImageUploadButton`, `MathInsertButton`, `DesmosInsertButton`, page strip (workspace chrome, not Excalidraw).

**Legend — survives native-hide?**

| Col | Meaning |
|-----|---------|
| **Kb Y** | Works via keyboard when canvas has focus (TU-11 routing permitting). |
| **Kb N** | No keyboard path, or only via hidden UI affordance. |
| **Kb partial** | Keyboard exists but opens a native popup/dialog that may also be CSS-hidden — verify in Phase 0 POC. |

**Disposition options:** **Mynk toolbar** · **pulldown/overflow** · **context-menu (re-implement)** · **keyboard-only (document)** · **DROP** · **defer/open-question**

**Sarah's asks** — cross-ref to requirement IDs where applicable; blank = not explicitly in the 64 requirements.

---

## 1. Tool rail & toolbar-adjacent controls

Source: `SHAPES` + `ShapesSwitcher` + toolbar row (`PenModeButton`, `LockButton`, `HandButton`, collab `LaserPointerButton`).

| ID | Function | What it does | Current access path(s) | Survives native-hide? | In Sarah's asks? | Recommended disposition |
|----|----------|--------------|------------------------|----------------------|------------------|-------------------------|
| T-01 | **Selection** (cursor) | Select / move / resize elements | Tool rail; **V** or **1**; command palette | Kb Y | TB-01 | **Mynk toolbar** (primary) |
| T-02 | **Freedraw** (pencil) | Freehand ink strokes | Tool rail; **P** or **X** or **7** | Kb Y | TB-01, TM-04 | **Mynk toolbar** (primary) |
| T-03 | **Eraser** | Stroke eraser | Tool rail; **E** or **0**; `toggleEraserTool` | Kb Y | TB-01, TU-10, TM-08 | **Mynk toolbar** (primary) |
| T-04 | **Text** | Place / edit text | Tool rail; **T** or **8** | Kb Y | TB-01 (after eraser) | **Mynk toolbar** |
| T-05 | **Rectangle** | Draw rectangles | Tool rail; **R** or **2** | Kb Y | TB-03, PU-01 | **pulldown/overflow** (shape pulldown) |
| T-06 | **Diamond** | Draw diamonds | Tool rail; **D** or **3** | Kb Y | TB-03, PU-01 | **pulldown/overflow** |
| T-07 | **Ellipse** | Draw ellipses / circles | Tool rail; **O** or **4** | Kb Y | TB-03, PU-01 | **pulldown/overflow** |
| T-08 | **Arrow** | Draw arrows (bindable) | Tool rail; **A** or **5** | Kb Y | TB-02, PU-01 | **pulldown/overflow** (line pulldown) |
| T-09 | **Line** | Draw lines | Tool rail; **L** or **6** | Kb Y | TB-02, PU-01 | **pulldown/overflow** |
| T-10 | **Image** | Insert image from file picker | Tool rail **9**; image tool drag/drop; paste image | Kb partial (**9** only) | TB-09 | **Mynk toolbar** (TB-09 phone-photo path) + paste survives |
| T-11 | **Hand** (pan) | Pan canvas without selecting | Toolbar hand btn; **H**; hold **Space** (temporary grab) | Kb Y | — | **keyboard-only (document)** or student overflow; tutor **defer** |
| T-12 | **Pen mode** | Ignore finger touches on tablet | Toolbar pen-mode toggle | Kb N | TM-04, TU-05 | **NO-BUILD — leave native** — Excalidraw pen/tablet handling untouched; expose **no** Mynk pen-mode control. Watch-item: revisit only if palm-rejection trouble reported (NR-03 resolved) |
| T-13 | **Tool lock** | Lock active tool across shapes | Toolbar lock; **Q** | Kb Y | — | **keyboard-only (document)** |
| T-14 | **Frame** | Draw frame containers | Extra-tools ▾; **F** | Kb Y | — | **DROP** (tutoring rarely uses frames) |
| T-15 | **Embeddable** | Insert iframe embed | Extra-tools ▾ | Kb N | — (Desmos is custom insert) | **DROP** — we use `DesmosInsertButton` + `validateEmbeddable` |
| T-16 | **Laser pointer** | Ephemeral laser trail for students | Extra-tools ▾; **K**; collab laser btn when `isCollaborating` | Kb Y | ST-05 | **Mynk toolbar (primary, V1 top-level slot)** — ST-05 reframed: **verify** alignment/visibility to student in V1; fix if regressed (viewport fix cleared most misalignment) |
| T-17 | **Magicframe** (AI) | AI flowchart frame | Extra-tools ▾ (when `aiEnabled`) | Kb N | — | **DROP** — not passed `aiEnabled` on WB mount |
| T-18 | **Mermaid → diagram** | AI mermaid import dialog | Extra-tools ▾ (`openDialog: ttd/mermaid`) | Kb N | — | **DROP** |
| T-19 | **Text-to-diagram** | AI diagram from text | Command palette (`aiEnabled`) | Kb partial | — | **DROP** |
| T-20 | **Library sidebar trigger** | Open shapes library panel | Top-right library icon (`DefaultSidebar.Trigger`) | Kb N | — | **DROP** — app does not use Excalidraw library |

---

## 2. Properties / styling panel (`SelectedShapeActions`)

Source: `index.js` ~L12328–12401. Shown when a tool is active or elements selected (left palette today).

| ID | Function | What it does | Current access path(s) | Survives native-hide? | In Sarah's asks? | Recommended disposition |
|----|----------|--------------|------------------------|----------------------|------------------|-------------------------|
| P-01 | **Stroke color** | `currentItemStrokeColor` | Properties swatch; **S** opens stroke popup; Shift+eyedropper | Kb partial | PP-04, DD-03 | **Mynk properties popover** |
| P-02 | **Background color** | `currentItemBackgroundColor` | Properties swatch; **G** opens bg popup | Kb partial | PP-04 | **Mynk popover** (shapes only) |
| P-03 | **Fill style** | Hachure / cross-hatch / solid | Properties | Kb N | PP-04 | **KEEP — tiered** (inline or **More styles** overflow) |
| P-04 | **Stroke width** | Line thickness presets | Properties | Kb N | DD-03, DD-04, PP-04 | **KEEP — tiered** (**Mynk popover** inline) |
| P-05 | **Stroke shape** (freedraw) | Pencil stroke profile | Properties (freedraw only) | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-06 | **Stroke style** | Solid / dashed / dotted | Properties | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-07 | **Sloppiness / roughness** | Architect / artist / cartoonist | Properties | Kb N | DD-01, PP-04 | **KEEP — tiered** (default architect via `initialData`; inline or **More**) |
| P-08 | **Edges / roundness** | Sharp vs round corners | Properties | Kb N | DD-02, PP-04 | **KEEP — tiered** (default sharp via `initialData`; inline or **More**) |
| P-09 | **Arrow type** | Round / sharp / elbow | Properties (arrows) | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-10 | **Font family** | Virgil, Helvetica, etc. | Properties; **Shift+F** opens font popup | Kb partial | PP-04 | **KEEP — tiered** (**More styles**; math uses Math insert) |
| P-11 | **Font size** | Point size | Properties; **Ctrl+Shift+,** / **Ctrl+Shift+.** | Kb Y | PP-04 | **KEEP — tiered** (**More styles**) |
| P-12 | **Text align** (horizontal) | Left / center / right | Properties | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-13 | **Text align** (vertical) | Top / middle / bottom | Properties | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-14 | **Arrowheads** (start/end) | Arrow cap styles | Properties (arrows/lines) | Kb N | PP-04 | **KEEP — tiered** (**More styles**) |
| P-15 | **Opacity** | Element opacity 0–100 | Properties | Kb N | PP-04 | **Mynk popover** (inline) |
| P-16 | **Send to back** | Z-order | Properties layers row; **Ctrl+Shift+[** (Win) / **Ctrl+Alt+[** (Mac) | Kb Y | TU-14, TM-10 | **Mynk toolbar (buried/More) + context-menu/long-press** — visible button required (TU-14); touch parity (TM-10). **HARD default:** PDF pages deepest-z; strokes/annotations render above PDFs |
| P-17 | **Send backward** | Z-order −1 | Properties; **Ctrl+[** | Kb Y | TU-14, TM-10 | **Mynk toolbar (buried/More) + context-menu/long-press** (TU-14, TM-10) |
| P-18 | **Bring forward** | Z-order +1 | Properties; **Ctrl+]** | Kb Y | TU-14, TM-10 | **Mynk toolbar (buried/More) + context-menu/long-press** (TU-14, TM-10) |
| P-19 | **Bring to front** | Z-order max | Properties; **Ctrl+Shift+]** / **Ctrl+Alt+]** | Kb Y | TU-14, TM-10 | **Mynk toolbar (buried/More) + context-menu/long-press** (TU-14, TM-10) |
| P-20 | **Align left/center/right** | Horizontal align selection | Properties (≥2 elements); **Ctrl+Shift+←/→** | Kb Y | — | **context-menu** or **keyboard-only** |
| P-21 | **Align top/center/bottom** | Vertical align | Properties; **Ctrl+Shift+↑/↓** | Kb Y | — | **context-menu** or **keyboard-only** |
| P-22 | **Distribute H / V** | Even spacing (≥3) | Properties; **Alt+H** / **Alt+V** | Kb Y | — | **keyboard-only** |
| P-23 | **Duplicate** | Clone selection | Properties actions; **Ctrl+D** | Kb Y | — | **context-menu** or **keyboard-only** |
| P-24 | **Delete** | Remove selection | Properties; **Delete** / **Backspace** | Kb Y | TU-10, TU-14, TM-10 | **Mynk** — eraser stays primary toolbar control; selected-element delete via **keyboard Delete** + **right-click/long-press** + **buried visible button** (TU-14; not button-less) |
| P-25 | **Group** | Group elements | Properties; **Ctrl+G** | Kb Y | — | **keyboard-only** |
| P-26 | **Ungroup** | Ungroup | Properties; **Ctrl+Shift+G** | Kb Y | — | **keyboard-only** |
| P-27 | **Hyperlink** | Add/edit URL on element | Properties link btn; **Ctrl+K** | Kb Y | — | **DROP** (tutoring) or **context-menu** |
| P-28 | **Crop image** | Crop image element | Properties (image selected) | Kb N | — | **DROP** |
| P-29 | **Linear point editor** | Edit arrow/line points | Properties; context menu | Kb N | — | **keyboard-only** — double-click line may still work |

**Not in properties panel** (context menu only): **Copy styles** (**Ctrl+Alt+C**), **Paste styles** (**Ctrl+Alt+V**).

---

## 3. Right-click context menu

Source: `getContextMenuItems` (`index.js` ~L29190).

### 3a. Canvas context (empty canvas, edit mode)

| ID | Function | Access | Kb fallback? | Sarah? | Disposition |
|----|----------|--------|--------------|--------|-------------|
| C-01 | Paste | Canvas ctx | **Ctrl+V** Y | — | survives paste |
| C-02 | Copy as PNG | Canvas ctx | **Shift+Alt+C** Y | — | **DROP** |
| C-03 | Copy as SVG | Canvas ctx | Kb N | — | **DROP** |
| C-04 | Copy text | Canvas ctx | Kb N | — | **DROP** |
| C-05 | Select all | Canvas ctx | **Ctrl+A** Y | — | **keyboard-only** |
| C-06 | Unlock all elements | Canvas ctx | command palette | partial | **DROP** |
| C-07 | Toggle grid | Canvas ctx | **Ctrl+'** Y | — | **DROP** |
| C-08 | Toggle objects snap | Canvas ctx | **Alt+S** Y | — | **DROP** |
| C-09 | Toggle zen mode | Canvas ctx | **Alt+Z** Y | — | **DROP** (we force zen) |
| C-10 | Toggle view mode | Canvas ctx | **Alt+R** Y | — | **DROP** |
| C-11 | Toggle stats | Canvas ctx | **Alt+/** Y | — | **DROP** |

### 3b. Element / selection context (edit mode)

| ID | Function | Access | Kb fallback? | Sarah? | Disposition |
|----|----------|--------|--------------|--------|-------------|
| C-12 | Cut | Ctx | **Ctrl+X** Y | — | survives |
| C-13 | Copy | Ctx | **Ctrl+C** Y | — | survives |
| C-14 | Paste | Ctx | **Ctrl+V** Y | — | survives |
| C-15 | Select all in frame | Ctx (in frame) | Kb N | — | **DROP** |
| C-16 | Remove all from frame | Ctx | Kb N | — | **DROP** |
| C-17 | Wrap selection in frame | Ctx | Kb N | — | **DROP** |
| C-18 | Crop image | Ctx | Kb N | — | **DROP** |
| C-19 | Copy as PNG / SVG | Ctx | PNG Y; SVG N | — | **DROP** |
| C-20 | Copy styles / Paste styles | Ctx | **Ctrl+Alt+C/V** Y | — | **keyboard-only** |
| C-21 | Group / Ungroup | Ctx | **Ctrl+G** / **Ctrl+Shift+G** Y | — | **keyboard-only** |
| C-22 | Auto-resize text | Ctx | Kb N | — | **DROP** |
| C-23 | Bind / Unbind text | Ctx | Kb N | — | **DROP** |
| C-24 | Wrap text in container | Ctx | Kb N | — | **DROP** |
| C-25 | Add to library | Ctx | Kb N | — | **DROP** |
| C-26 | Z-order (4 actions) | Ctx | Kb Y | TU-14, TM-10 | **context-menu/long-press + Mynk buried buttons** (accelerator, not sole path — TU-14; TM-10) |
| C-27 | Flip H / V | Ctx | **Shift+H** / **Shift+V** Y | — | **keyboard-only** |
| C-28 | Toggle linear editor | Ctx | Kb N | — | **keyboard-only** (double-click?) |
| C-29 | Link / Copy element link | Ctx | **Ctrl+K** partial | — | **DROP** |
| C-30 | Duplicate | Ctx | **Ctrl+D** Y | — | **keyboard-only** |
| C-31 | Toggle lock | Ctx | **Ctrl+Shift+L** Y | — | **keyboard-only** |
| C-32 | Delete | Ctx | **Delete** Y | TU-10, TU-14 | survives via eraser + keyboard + right-click/long-press + buried visible button (TU-14) |

---

## 4. Main menu (hamburger)

Source: `DefaultMainMenu` (`index.js` ~L21056). **Already disabled via `UIOptions.canvasActions`:** `loadScene`, `saveToActiveFile`.

| ID | Function | In menu? | Kb fallback? | Sarah? | Disposition |
|----|----------|----------|--------------|--------|-------------|
| M-01 | Open / Load scene | Hidden (`loadScene: false`) | **Ctrl+O** still registered but action disabled | — | **DROP** (server truth) |
| M-02 | Save to file | Hidden (`saveToActiveFile: false`) | **Ctrl+S** disabled | — | **DROP** |
| M-03 | Export scene (JSON) | Default **on** | Kb N | — | **DROP** |
| M-04 | Export image dialog | Default **on** | **Ctrl+Shift+E** Y | — | **DROP** (notes export elsewhere) |
| M-05 | Find on canvas (search) | Default **on** | **Ctrl+F** Y | — | **DROP** |
| M-06 | Help / keyboard cheatsheet | Default **on** | **?** Y | — | **DROP** or link from Mynk **?** overflow |
| M-07 | Clear canvas | Default **on** | **Ctrl+Cmd+Delete** Y | — | **DROP** (dangerous in live session) |
| M-08 | Social links | Default **on** | Kb N | — | **DROP** |
| M-09 | Toggle light/dark theme | Default **on** | **Shift+Alt+D** Y | TU-12, TU-13 | **DROP** native — site theme defaults to OS until user picks light/dark (A′); Excalidraw `theme` follows app (TU-12); **whiteboard-local theme toggle** on chrome (TU-13) |
| M-10 | Canvas background color | Default **on** (`changeViewBackgroundColor`) | Kb N | TU-12 | **DROP** native control — board background follows app theme (TU-12); no separate canvas-bg picker needed |
| M-11 | Command palette | **Not** in default menu | **Ctrl+/`**, **Ctrl+Shift+P** Y | — | **DROP** |

---

## 5. Footer

Source: `index.js` ~L16736–16789.

| ID | Function | Access | Kb fallback? | Sarah? | Disposition |
|----|----------|--------|--------------|--------|-------------|
| F-01 | Zoom out | Footer | **Ctrl+-** Y | TB-07 | **Mynk top bar** (−) |
| F-02 | Reset zoom | Footer | **Ctrl+0** Y | TB-07 | **Mynk top bar** |
| F-03 | Zoom in | Footer | **Ctrl++** Y | TB-07 | **Mynk top bar** (+) |
| F-04 | Undo | Footer + Mynk | **Ctrl+Z** Y | TB-11, TU-03 | **Mynk top bar** (existing `UndoRedoButtons`) |
| F-05 | Redo | Footer + Mynk | **Ctrl+Shift+Z** / **Ctrl+Y** Y | TB-11 | **Mynk top bar** |
| F-06 | Finalize multi-point line | Footer (touch) | **Enter** / **Esc** (finalize action) | — | survives on touch |
| F-07 | Help | Footer right | **?** Y | — | **DROP** |
| F-08 | Zoom to fit | Not in footer UI; actions exist | **Shift+1** Y | TB-07, DD-05 | **Mynk top bar** “Fit” |

Additional zoom actions (no footer button): **Shift+2** fit selection in viewport, **Shift+3** fit selection.

---

## 6. Keyboard shortcuts — full catalog

### 6a. Tools & modes (single-key when canvas focused)

| Key | Function | ID ref |
|-----|----------|--------|
| V / 1 | Selection | T-01 |
| R / 2 | Rectangle | T-05 |
| D / 3 | Diamond | T-06 |
| O / 4 | Ellipse | T-07 |
| A / 5 | Arrow | T-08 |
| L / 6 | Line | T-09 |
| P, X / 7 | Freedraw | T-02 |
| T / 8 | Text | T-04 |
| 9 | Image tool | T-10 |
| E / 0 | Eraser | T-03 |
| H | Hand tool | T-11 |
| F | Frame tool | T-14 |
| K | Laser toggle | T-16 |
| Q | Tool lock | T-13 |
| Space (hold) | Temporary pan | T-11 |

### 6b. History, clipboard, selection

| Shortcut | Function |
|----------|----------|
| Ctrl+Z | Undo (F-04) |
| Ctrl+Shift+Z / Ctrl+Y | Redo (F-05) |
| Ctrl+C / X / V | Copy / cut / paste |
| Ctrl+D | Duplicate (P-23) |
| Ctrl+A | Select all (C-05) |
| Delete / Backspace | Delete selection (P-24) |
| Ctrl+Alt+C / V | Copy / paste styles |

### 6c. Zoom & view

| Shortcut | Function |
|----------|----------|
| Ctrl++ / Ctrl+- / Ctrl+0 | Zoom in / out / reset (F-01–03) |
| Shift+1 / 2 / 3 | Zoom to fit / selection in viewport / selection |
| Alt+Z | Zen (irrelevant — we enable zen) |
| Alt+R | View mode |
| Alt+/ | Stats panel |
| Ctrl+' | Grid |
| Alt+S | Objects snap |

### 6d. Arrange & transform

| Shortcut | Function |
|----------|----------|
| Ctrl+[ / ] | Send backward / bring forward |
| Ctrl+Shift+[ / ] (Win) or Ctrl+Alt+[ / ] (Mac) | Send to back / bring to front |
| Ctrl+Shift+arrows | Align selection |
| Alt+H / Alt+V | Distribute H / V |
| Shift+H / Shift+V | Flip horizontal / vertical |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| Ctrl+Shift+L | Toggle element lock |

### 6e. Popups without full properties panel

| Shortcut | Opens |
|----------|-------|
| S (no modifiers, with selection) | Stroke color popup (P-01) |
| G | Background color popup (P-02) |
| Shift+F | Font family popup (P-10) |
| Shift+S / Shift+I | Eyedropper stroke / background |

### 6f. Export / file / meta

| Shortcut | Function |
|----------|----------|
| Ctrl+S | Save (disabled for us) |
| Ctrl+O | Load (disabled for us) |
| Ctrl+Shift+E | Export image dialog (M-04) |
| Ctrl+Delete | Clear canvas (M-07) |
| Ctrl+F | Search menu (M-05) |
| Ctrl+/`, Ctrl+Shift+P | Command palette (M-11) |
| Shift+Alt+D | Toggle Excalidraw theme (M-09) |
| Shift+Alt+C | Copy as PNG |
| ? | Help dialog |

---

## 7. Library

| ID | Function | Access | Survives? | Sarah? | Disposition |
|----|----------|--------|-----------|--------|-------------|
| L-01 | Open library sidebar | Top-right icon | Kb N | — | **DROP** |
| L-02 | Drag library items to canvas | Sidebar | Kb N | — | **DROP** |
| L-03 | Add selection to library | Context menu (C-25) | Kb N | — | **DROP** |

**App dependency:** None. Our image path uses `ensure-native-image-asset-urls-for-sync.ts` (paste / image tool / upload), not Excalidraw personal library. Library items would not sync through our relay without extra work.

---

## 8. Gestures & interaction (non-menu)

| ID | Function | Access | Survives native-hide? | Sarah? | Disposition |
|----|----------|--------|----------------------|--------|-------------|
| G-01 | Multi-select (shift-click, drag box) | Canvas | Y | — | unchanged |
| G-02 | Pinch / ctrl+wheel zoom | Canvas | Y | TB-07 | unchanged |
| G-03 | Two-finger / wheel pan | Canvas | Y | — | unchanged |
| G-04 | Space+drag pan | Canvas | Y | T-11 | **document** |
| G-05 | Image paste from clipboard | Canvas | Y (Ctrl+V) | TB-09 | keep; Mynk image btn supplements |
| G-06 | Drag-drop image file | Canvas | Y | TB-09 | keep |
| G-07 | Frames (as containers) | T-14 | Y if frame tool used | — | **DROP** |
| G-08 | Element links (click-through) | Created via P-27 | Y | — | **DROP** |
| G-09 | Collaboration cursors | Relay sync layer | Y (our stack) | — | out of scope (sync) |
| G-10 | Bind arrows to shapes | Drawing UX | Y | — | unchanged |
| G-11 | Linear / elbow arrow edit | Double-click / drag handles | Y | — | unchanged |

---

## 9. Mynk custom actions (already outside Excalidraw chrome)

| ID | Function | Location | Notes |
|----|----------|----------|-------|
| X-01 | **Undo / Redo** | Workspace toolbar `UndoRedoButtons` | Synthetic Ctrl+Z path; maps to F-04/F-05 + TB-11 |
| X-02 | **PDF insert** | `PdfImageUploadButton` | TB-08, PU-04, TU-04 |
| X-03 | **Math insert** | `MathInsertButton` | TU-04 |
| X-04 | **Desmos insert** | `DesmosInsertButton` | TB-10, TU-04 |
| X-05 | **Page strip** | Workspace per-page boards | SR-06, SR-10, ST-06 |
| X-06 | **Copy student link** | Workspace toolbar | TU-07 (rename pending) |
| X-07 | **Session / AV chrome** | Timer, mic, recording pills | TU-08, TU-09 — not Excalidraw |

---

## Summary counts

| Metric | Count |
|--------|------:|
| **Total functions catalogued** | **127** |
| **Would be SILENTLY LOST** (Kb N, not in Mynk chrome plan, not intentional DROP) — post-ratification | **5** |
| **Keyboard-only survivors** (work but hidden affordance — TU-11 discoverability) — post-ratification | **~22** |
| **Candidate new requirements** (NR-01–NR-12) | **12** (7 accepted → reqs; 3 resolved no-build; 2 open) |

---

## SILENTLY LOST on native-hide (critical)

Functions **currently UI-reachable**, **no keyboard fallback**, **not covered** by the ratified Mynk chrome wireframe (§3 of design doc) and **not** marked intentional DROP.

**Andrew ratification 2026-06-08 cleared P0 items:** T-12 (leave native — no Mynk control), P-03–P-14 (all styles **KEEP — tiered** in More styles / inline per PP-04), M-10 (board bg follows app theme — TU-12). Z-order (P-16–P-19) and delete (P-24) now require visible buttons (TU-14). Laser (T-16) is V1 top-level.

**Remaining silently-lost (post-ratification):**

| Priority | ID | Function | Why it matters |
|----------|-----|----------|----------------|
| **P1** | T-10 | **Image tool file picker** (non-paste) | TB-09 covers Mynk button; **numeric 9** alone is undiscoverable — OK if Mynk ships |
| **P2** | C-22–C-24 | **Text bind/wrap/auto-resize** | Power-user diagramming; unlikely tutoring |
| **P2** | C-03, C-19 | **Copy as SVG** | Export niche |
| **P2** | T-15 | **Embeddable tool** | Superseded by Desmos insert |
| **P2** | L-01–L-03 | **Library** | No product dependency today |

**Mitigated by P1.2 chrome plan (not silent if we ship on schedule):** T-01–T-09, **T-16 (V1 top-level)**, P-01–P-19, P-24, F-01–05, F-08, X-01–05, theme (TU-12/TU-13).

---

## Keyboard-only survivors (TU-11 discoverability)

These **keep working** with canvas focus after hide but lose **visible affordances**. Tutor-desktop should document in a shortcuts cheat sheet (open Q8); student-mobile may deliberately omit most.

| Category | IDs | Examples |
|----------|-----|----------|
| Tool keys | T-01–T-11, T-13–T-14, T-16 | V/P/E/R…, H, Q, K, Space-pan |
| History / clipboard | F-04–05, C-12–14, C-20, C-30–32 | Ctrl+Z, copy/paste, duplicate, delete |
| Arrange | P-16–P-22, C-26–C-27 | Z-order, align, distribute, flip |
| Group | P-25–P-26 | Ctrl+G |
| Zoom | F-01–03, F-08 | Ctrl+/0/+, Shift+1 |
| Color popups | P-01–P-02, P-10 | S, G, Shift+F (native popups — **POC verify** not CSS-killed) |
| Misc | P-11, P-27, C-07–C-11 | Font size inc/dec, Ctrl+K, grid/snap/stats |

**Total keyboard-only survivors:** 34 (includes tools Sarah needs but won't see on screen — acceptable for tutor desktop if TU-11 documents; student-mobile should gate per ST-04).

---

## Coverage gaps vs 67 requirements

Native functions Sarah may want that were **candidate new requirements** (NR-01–NR-12). **Andrew ratification 2026-06-08** disposition:

| # | Candidate requirement | Native function(s) | Ratified disposition |
|---|----------------------|-------------------|------------------------|
| NR-01 | **Hand / pan tool discoverable** | T-11 | **OPEN** — keyboard-only (H / Space) acceptable for v1; revisit if pan discoverability feedback |
| NR-02 | **“More styles” overflow contract** | P-03–P-14 | **ACCEPTED → PP-04** — keep **ALL** native style props; clean/sharp defaults pinned; tier inline vs **More styles** |
| NR-03 | **Pen mode affordance** | T-12 | **RESOLVED — no-build** — leave Excalidraw native pen/tablet handling; no Mynk control; watch palm-rejection only |
| NR-04 | **Canvas background policy** | M-10 | **RESOLVED → TU-12 + TU-13** — board bg follows app theme; drop native canvas-bg control; whiteboard-local theme toggle (TU-13) |
| NR-05 | **Delete selected vs eraser** | P-24, C-32 | **ACCEPTED → TU-10 + TU-14** — eraser primary; delete via keyboard + right-click/long-press + buried visible button |
| NR-06 | **Laser in tutor toolbar** | T-16 | **ACCEPTED → ST-05** — V1 **top-level** toolbar slot; verify alignment/visibility (fix if regressed) |
| NR-07 | **Multi-select + transform handles** | G-01 | **OPEN** — implicit; confirm handles visible when chrome hidden (Phase 1 acceptance) |
| NR-08 | **Image paste + Mynk image btn parity** | T-10, G-05 | **OPEN** — TB-09 covers Mynk button; paste survives |
| NR-09 | **Shortcuts help surface** | M-06, F-07 | **OPEN** — optional `?` in Mynk overflow (TU-11) |
| NR-10 | **Stroke style for marking PDFs** | P-06 | **ACCEPTED → PP-04** — stroke style kept in More styles tier |
| NR-11 | **Z-order for overlapping annotations** | P-16–P-19 | **ACCEPTED → TU-14 + TM-10** — PDF deepest-z HARD default; z-order via buried buttons + context-menu/long-press |
| NR-12 | **Native popup survival under CSS hide** | P-01–P-02, P-10 | **OPEN** — Phase 0 POC gate (partially verified green 2026-06-08) |

**New standing principles (ratified → requirements):** **TU-14** every-function-has-a-button; **TM-10** full touch parity for all controls.

---

## Implications for chrome design (P1.2)

**P1.2 toolbar design unblocked** (Andrew 2026-06-08). Standing principles: **TU-14** (every function has a visible button; right-click/hotkeys are accelerators only) and **TM-10** (full touch/long-press parity).

### Must cover in Mynk chrome (P1.2 toolbar / top bar / popover)

- **Tools:** T-01–T-04 primary strip; **T-16 laser V1 top-level** (ST-05 verify); T-05–T-09 in pulldowns (TB-01–03, PU-01).
- **Inserts:** X-02–X-04 top bar (TU-04); image (TB-09).
- **Zoom:** F-01–03, F-08 top bar (TB-07).
- **Undo/redo:** X-01 (TB-11) — hide native footer (SR-09).
- **Theme:** TU-12 app theme drives Excalidraw `theme`; **TU-13** whiteboard-local theme toggle on chrome.
- **Properties popover:** P-01, P-04, P-07, P-15 inline defaults; **More styles** tier holds **ALL** remaining native style props (P-03–P-06, P-08–P-14) per PP-04.
- **Z-order:** P-16–P-19 via buried/More toolbar buttons + context-menu/long-press (TU-14, TM-10). **HARD default:** PDF pages deepest-z; all drawn elements above PDFs.
- **Delete:** Eraser primary (T-03); selected-element delete via keyboard + right-click/long-press + buried button (TU-10, TU-14).
- **Pen mode:** T-12 — **no Mynk control**; native Excalidraw tablet handling untouched.

### Pulldown / overflow (`···`)

- Remaining shapes (student ST-04).
- Hand tool (NR-01 open), image file picker fallback.
- Z-order buttons (buried OK per TU-14), delete-selected button (buried OK).
- Optional shortcuts help (NR-09).

### Context-menu / long-press (accelerators — TU-14, TM-10)

- Z-order (P-16–P-19), delete (P-24/C-32), align, flip — **plus** matching visible toolbar buttons (buried/More acceptable; button-less not).

### Keyboard-only (document in TU-11 — accelerators, not sole path)

- Arrange shortcuts, group/ungroup, tool hotkeys, Space-pan — must also have button equivalents where function is student-facing (TM-10).
- Do **not** rely on student discovering keyboard-only paths (ST-04).

### DROP (intentional)

- Library (L-01–03), export/save/load (M-01–M-04), socials (M-08), frames/embeddable/AI tools (T-14–T-19), clear canvas (M-07), stats/grid/snap/zen/view (C-07–C-11), text bind/wrap (C-22–C-24), copy-as-SVG (C-03), hyperlinks (P-27) unless product changes.

### Phase 0 POC gates (from audit)

1. Native **S / G / Shift+F** color popups still work when rails are CSS-hidden (NR-12 — POC green 2026-06-08).
2. **Pen mode** still auto-activates on stylus (TM-04) without Mynk toggle — **ratified: leave native, no Mynk control** (NR-03 resolved).
3. **Ctrl+Z** under Mynk overlay (TU-03) — POC green 2026-06-08.

---

## Source references (0.18.1)

| Area | Location |
|------|----------|
| `SHAPES` / tool keys | `dist/dev/chunk-4FTI6OG3.js` ~L7955 |
| Extra tools dropdown | `dist/dev/index.js` ~L12458 |
| Properties panel | `dist/dev/index.js` ~L12305 (`SelectedShapeActions`) |
| Context menu items | `dist/dev/index.js` ~L29190 (`getContextMenuItems`) |
| Main menu defaults | `dist/dev/index.js` ~L21056 (`DefaultMainMenu`) |
| Footer | `dist/dev/index.js` ~L16736 |
| `shortcutMap` | `dist/dev/index.js` ~L11984 |
| `UIOptions` / `CanvasActions` | `dist/types/excalidraw/types.d.ts` ~L475 |
| Our `UIOptions` | `WhiteboardWorkspaceClient.tsx` ~L3479 |

---

## Cross-links

- Requirements: [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md)
- Design: [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md)
- Platform API limits: [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5
