# Whiteboard chrome requirements — custom Mynk UI (design input)

> **Purpose:** Design INPUT for the custom Mynk whiteboard chrome layer (toolbar + properties/controls), driving Excalidraw via `excalidrawAPI`. Sequenced into the **whiteboard wave**; **not** a V1-notes blocker.
>
> **Sources mined:** [`docs/Sarah-Chat-05-26-2026.txt`](../Sarah-Chat-05-26-2026.txt) (raw tutor chat), reconciled against [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md), [`docs/handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md), [`docs/BACKLOG.md`](../BACKLOG.md) (whiteboard queue), [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md), [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) (§5 Workspace + §5.7 Surface 7), [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) (Surface 5), [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5.
>
> **Last consolidated:** 2026-06-07.

---

## LOCKED decision (Andrew, 2026-06-07)

Replace Excalidraw's native whiteboard UI with **our own custom chrome** (toolbar + properties/controls), driving the canvas via `excalidrawAPI` — the same pattern already used for Undo/Redo + PDF/Math/Desmos inserts.

**Why:** Excalidraw `^0.18.1` `UIOptions` cannot reorder tools, compress/replace the properties palette, or fix mobile popup behavior. See [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5 and [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) § "Sarah UX asks + custom chrome decision" @ commit `927d536`.

**Scope:** One shared chrome layer with **`tutor-desktop`** and **`student-mobile-first`** variants. Real-iPhone acceptance gate. Not a V1-notes blocker.

---

## HARD quality bar (Andrew, verbatim intent)

The current custom controls are **ugly / oversized / unprofessional**. The new chrome **must** look genuinely **professional and polished**, with **mobile/tablet-aware** ergonomics. **"Functional but ugly" does not pass.** Visual polish and small-screen ergonomics are **acceptance criteria**, not extras.

---

## Feasibility legend

| Tag | Meaning |
|-----|---------|
| **(i)** | Config-doable — `UIOptions`, `initialData.appState`, or `updateScene({ appState })` without custom chrome |
| **(ii)** | Custom-chrome required — hide native Excalidraw UI; drive `excalidrawAPI` |
| **(iii)** | Fork / brittle CSS — possible but fragile; prefer (ii) |
| **(iv)** | Infeasible in stock Excalidraw — would need upstream change or abandon |

Pinned API finding: on `@excalidraw/excalidraw` 0.18.1, `UIOptions.tools` only toggles the **image** tool; it cannot reorder, regroup, resize the properties panel, or control mobile palette dismissal.

---

## Requirements (de-duplicated)

### Toolbar / tool-set & ordering

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **TB-01** | Primary toolbar order: **Cursor → Pencil → Eraser → Typing**, then shape tools. Sarah priority **#3**. | (ii) | Sarah-Chat L10–14; orchestrator U4; BACKLOG toolbar-reorder row |
| **TB-02** | Consolidate **line + arrow** into one dropdown/pulldown. | (ii) | Sarah-Chat L15; orchestrator U5 |
| **TB-03** | Consolidate **rectangle + diamond + ellipse** into one dropdown/pulldown. | (ii) | Sarah-Chat L16; orchestrator U6 |
| **TB-04** | Tools generally ordered by **most-used first** (Sarah's workflow, not Excalidraw default). | (ii) | Sarah-Chat L72; priorities L69–73 |
| **TB-05** | **Tutor desktop:** slim collapsible toolbar strip (left or top per v1 spec); not a full native Excalidraw rail consuming canvas width. | (ii) | v1-component-redesign §5 Workspace; RELIABILITY-REDESIGN Surface 5 |
| **TB-06** | **Student mobile:** native Excalidraw toolbar **hidden by default**. Student needs follow-tutor toggle + **pencil + eraser**; everything else in **`···` overflow**. | (ii) | v1-component-redesign §5.7; RELIABILITY-REDESIGN Surface 5 |
| **TB-07** | Preserve **zoom-in for precise labeling** — Sarah explicitly values this; chrome must not steal zoom affordances or viewport. | (ii) layout | Sarah-Chat L46; orchestrator U11 (positive validation) |

### Pulldown / consolidation

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **PU-01** | Shape tools grouped into **two pulldowns** (lines/arrows; rect/diamond/ellipse) instead of separate toolbar slots. | (ii) | Sarah-Chat L15–16; v1-component-redesign §5 |
| **PU-02** | Infrequent tools (image insert paths, extra shapes, etc.) live in overflow **`···`**, not permanent toolbar slots. | (ii) | v1-component-redesign §5.7; student-mobile spec |
| **PU-03** | **Desktop tutor:** pen/style UI is a **compact bar by default**; full tool menu only on explicit expand — not automatic quarter-screen takeover. | (ii) | 2026-06-06 U5; BACKLOG `pilot-2026-06-06` pen-panel row; Sarah-Chat L73 (priority #4) |

### Properties palette (compress / replace)

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **PP-01** | Replace or heavily compress Excalidraw's **left properties palette** — it dominates desktop (~quarter screen when pen active per 2026-06-06 session). | (ii) | 2026-06-06 U5; BACKLOG framing note 2026-06-07 |
| **PP-02** | **Close styles/properties panel without re-tapping the same control** — dismiss on outside click/tap (Sarah priority **#4**, Andrew-promoted). | (ii) | Sarah-Chat L44–45, L73; orchestrator I7 + priorities |
| **PP-03** | Mobile **color / pen palette** dismisses on **click-away** (outside tap), not only by re-tapping the palette button. | (ii) | Sarah-Chat L44–45; orchestrator I7; BACKLOG I7 row |
| **PP-04** | Properties UI shows **basics inline** (stroke width, color, opacity); advanced options behind one expand affordance. | (ii) | 2026-06-06 U5; v1 workspace collapsible-toolbar intent |

### Drawing defaults

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **DD-01** | Default **sloppiness / roughness = architect** (clean hand-drawn, not sketchy). | (i) | Sarah-Chat L17; orchestrator U7; v1-component-redesign §5 |
| **DD-02** | Default **edges = sharp** (not round). | (i) | Sarah-Chat L17; orchestrator U8; v1-component-redesign §5 |
| **DD-03** | **Thinner default pen stroke** — current strokes too thick, *"took up a lot of room"* on desktop tutor. | (i) + (ii) presets UI | 2026-06-06 U6; BACKLOG `pilot-2026-06-06` |
| **DD-04** | Stroke-width presets must include a **materially thinner** option for math annotation without requiring zoom. | (i) + (ii) | 2026-06-06 U6 acceptance |

### Touch / mobile-tablet behavior

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **TM-01** | All floating palettes/popovers on touch devices: **outside-tap dismiss** (see PP-02, PP-03). | (ii) | Sarah-Chat L44–45; I7 |
| **TM-02** | Fix **pointer-transform hit offset** (eraser + PDF touch targets drift up-left on mobile) — distinct from viewport sync. | app-bug + (ii) if native handles wrong | BACKLOG post-sync smoke (d); not in raw chat |
| **TM-03** | **Real iPhone Safari** acceptance for student-mobile chrome — jsdom cannot validate layout/popup behavior. | process gate | PLATFORM-ASSUMPTIONS §8; AGENTS.md layout blind-spot rule |
| **TM-04** | **Tablet / XPPen** pressure-sensitive drawing must keep working through custom chrome (Sarah priority **#2**). | (i) input path | Sarah-Chat L71; orchestrator F1; 2026-06-06 W2 validation |
| **TM-05** | **Tutor-on-phone/tablet** variant when tutor joins from non-desktop — usable tool chrome, not student layout copy-paste. | (ii) | BACKLOG tutor-side mobile row; orchestrator backlog note |

### Screen real estate / responsive

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **SR-01** | **Student iPhone:** whiteboard **≥80%** of viewport (Wyzant benchmark ~85–90%). Today ~30–35% per smoke I5. | (ii) layout shell | Sarah-Chat L21; orchestrator I5; RELIABILITY-REDESIGN Surface 5 |
| **SR-02** | **Tutor desktop:** whiteboard area **significantly larger** — current canvas too small vs Wyzant reference. | (ii) | 2026-06-06 U2; v1 workspace maximal-canvas constraint |
| **SR-03** | **Declutter** — page feels crowded; concise layout matching Wyzant *intent* (big canvas, light chrome), not literal clone. | (ii) | 2026-06-06 U3; orchestrator Wyzant image §2 |
| **SR-04** | **Video tile** overlays whiteboard corner (bottom-right), not stacked above canvas — *"video closer to the whiteboard on the phone."* | (ii) layout | Sarah-Chat L22; orchestrator I6; v1 §5.7 |
| **SR-05** | Remove **Board pages explainer card** on student mobile (~25% viewport in I5 screenshot); replace with compact strip. | (ii) | RELIABILITY-REDESIGN Surface 5; v1 §5.7 |
| **SR-06** | **Page strip** ≤40px — pill tabs `[1] [2] [3]`. | (ii) | v1 §5.7 |
| **SR-07** | Use **`100dvh`** (not `100vh`) for iOS Safari URL-bar collapse. | (ii) layout | v1 §5.7; RELIABILITY-REDESIGN |
| **SR-08** | **Wyzant-shaped** chrome: toolbar minimal across top/side; no dominant left+right sidebars eating canvas. | (ii) | orchestrator §2 Wyzant image; locked decision §3 |
| **SR-09** | Avoid duplicate chrome (e.g. separate app Undo/Redo **plus** full native Excalidraw toolbar) — consolidate into Mynk chrome. | (ii) | I5 screenshot analysis (orchestrator I5) |

### Student-WB-specific (fundamentally different, mobile-first)

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **ST-01** | **Follow-tutor** toggle in bottom control bar; **checked by default** (sync pan/zoom). | (ii) placement + sync behavior | Sarah-Chat L41; orchestrator B1/B2; v1 §5.7 |
| **ST-02** | Student bottom bar ~48px: **follow toggle, mic, leave** — above compact page strip. | (ii) | v1 §5.7 |
| **ST-03** | **Student add-page:** **No** for v1 (ratified 2026-05-31); architecture must allow enabling later. | product | Sarah-Chat L23; v1 §8 Q student-add-page |
| **ST-04** | Student does **not** need full shape/text toolset by default — tutor drives structure; student annotates. | (ii) | v1 §5.7; RELIABILITY-REDESIGN |
| **ST-05** | **Laser pointer** must be **visible** to student and **aligned** with cursor (currently offset + invisible — B8/B9). | (ii) or app-bug | Sarah-Chat L39–40; orchestrator B8/B9 |

### Tutor-WB-specific

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **TU-01** | **Tutor-desktop chrome** is the primary design target (pilot norm: desktop tutor + mobile student). | (ii) | orchestrator mobile-parity decision §3 |
| **TU-02** | **Professional visual polish** — controls sized/spaced like a commercial product; Mynka Blue / v1 component system. | (ii) | HARD quality bar (above); 2026-06-06 U1 |
| **TU-03** | **Keyboard undo** Ctrl/Cmd+Z must work reliably on desktop (on-screen undo works; keyboard regressed 2026-06-06). Coordinate custom `UndoRedoButtons` with hidden native shortcuts. | (ii) + app-bug | 2026-06-06 B1; BACKLOG |
| **TU-04** | Custom insert actions (PDF, Math, Desmos) integrate into Mynk toolbar — not orphaned from native Excalidraw menu. | (ii) | existing pattern; WHITEBOARD-STATUS § custom chrome |
| **TU-05** | **Writing tablet** (XPPen Star G640) — priority **#2**; pen input path must not break when native toolbar hidden. | (i) + verify | Sarah-Chat L71; orchestrator F1 |
| **TU-06** | **Waiting room** (when built) affects session chrome timing, not tool chrome — but toolbar/session bar must coexist with pre-session gate. | layout | Sarah-Chat L6–7; v1 §8 waiting room ratified |

---

## Out of scope for this doc (tracked elsewhere)

These appeared in the raw chat or pilot captures but are **not** custom-chrome design inputs:

| Topic | Track in |
|-------|----------|
| Sync-to-tutor / viewport centering bugs (B1–B4) | Wave 1 reliability; `WHITEBOARD-STATUS` sync redesign |
| Session timer minutes-only, waiting room timer start | Session lifecycle / v1 shell |
| Live A/V, camera permissions, device release | `LIVE-AV.md`, Phase 4 |
| Native image insert, cold refresh, Excalidraw recovery modal | `BACKLOG.md` whiteboard queue |
| End-session discard / stop-and-delete | `BACKLOG.md` `pilot-2026-06-06` F1 |
| Share-link naming / clipboard | v1 workspace labels + B2 backlog |
| Student accounts + consent | Identity epic |

---

## Open design questions (for the chrome design pass)

1. **Toolbar placement — tutor desktop:** left collapsible strip (v1 wireframe) vs minimal top bar (Wyzant reference)? Or hybrid (tools top, properties left flyout)?
2. **Pulldown grouping:** besides line/arrow and rect/diamond/ellipse, which tools share a pulldown vs overflow? Where do PDF/Math/Desmos land?
3. **Properties compression:** which properties are always visible (color, width, opacity) vs behind "More styles"?
4. **Student vs tutor tool parity:** v1 assumes student gets pencil+eraser only — confirm after Sarah uses student-add-page (still uncertain in raw chat L23).
5. **Tutor-mobile variant:** defer to v1.1 or ship minimal parity with desktop chrome at smaller breakpoints?
6. **Laser pointer:** fix within Excalidraw layer vs custom overlay tool in Mynk chrome?
7. **Zen mode vs CSS hide:** `zenModeEnabled` + custom chrome vs `display:none` on native UI — which preserves `excalidrawAPI` behavior best on 0.18.1?
8. **Keyboard shortcuts:** expose Excalidraw defaults (P, R, etc.) when native toolbar hidden — document and test conflict with browser/app shortcuts.
9. **Visual system:** map every chrome control to v1 tokens (`docs/V1-COMPONENT-LIBRARY.md`) — no one-off oversized buttons.
10. **Acceptance mocks:** produce clickable prototype on real iPhone + tutor Mac before implementation merge.

---

## Source reconciliation notes

### Raw chat (`Sarah-Chat-05-26-2026.txt`) — whiteboard lines

| Lines | Ask | Captured elsewhere? |
|-------|-----|---------------------|
| 9–14 | Toolbar reorder + dropdowns | Yes — orchestrator U3–U6, BACKLOG |
| 17 | Architect + sharp defaults | Yes — U7/U8 |
| 21 | Board off phone | Yes — I5 |
| 22 | Video closer to WB | Yes — I6 |
| 23 | Student add page uncertain | Yes — F4, v1 Q ratified |
| 39–40 | Laser pointer | Yes — B8/B9 |
| 41 | Sync default on | Yes — B1/B2 (behavior) |
| 44–45 | Palette click-away | Yes — I7 |
| 46 | Likes zoom for labeling | Yes — U11 (preserve, not new backlog row) |
| 69–73 | Priorities: sync, tablet, tools, close styles | Yes — §2.7 |

**Genuinely new from raw chat only:** **none** — the 2026-05-26 orchestrator report embeds the full raw chat and structured parse. This doc's additive value is **2026-06-06 desktop session** items (pen panel size, thinner stroke, canvas too small, clutter) plus the **LOCKED custom-chrome decision**, feasibility tags, and student/tutor variant split.

### Added from 2026-06-06 session (not in May raw chat)

- Pen options quarter-screen (U5) → PP-01, PU-03
- Thinner pen stroke (U6) → DD-03, DD-04
- Whiteboard too small (U2) → SR-02
- Clutter / Wyzant layout (U3) → SR-03, SR-08
- Ctrl+Z keyboard bug (B1) → TU-03
- Computer-user-friendly general (U1) → TU-02 HARD bar

---

## Cross-links

- Implementation status + feasibility table: [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) § Sarah UX asks + custom chrome decision
- Backlog rows: [`docs/BACKLOG.md`](../BACKLOG.md) § Whiteboard — implementation / design queue
- Excalidraw API constraint: [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5
- Student mobile layout shell: [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §5.7
- Mobile viewport architecture: [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) Surface 5

---

## Requirement count

| Category | Distinct requirements |
|----------|----------------------:|
| Toolbar / tool-set & ordering | 7 |
| Pulldown / consolidation | 3 |
| Properties palette | 4 |
| Drawing defaults | 4 |
| Touch / mobile-tablet | 5 |
| Screen real estate / responsive | 9 |
| Student-WB-specific | 5 |
| Tutor-WB-specific | 6 |
| **Total** | **43** |
