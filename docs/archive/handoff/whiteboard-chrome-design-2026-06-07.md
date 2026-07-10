# Whiteboard chrome — design (ratified 2026-06-07)

> **Purpose:** Durable design artifact for the custom Mynk whiteboard chrome layer — toolbar, properties, session controls — driving Excalidraw via `excalidrawAPI`. Executors build Phase 1+ from this doc.
>
> **Requirements input (68 reqs):** [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md)
>
> **Branch / sequencing:** Build on **`v1-redesign`**. Whiteboard chrome is a **pre-master gate** for the V1 reveal (`v1-redesign → master`). Master stays frozen; urgent Sarah fixes cherry-pick to `master` in isolation (no UI feature flag).
>
> **Last ratified:** 2026-06-07 (Opus orchestrator + Andrew). **Audit dispositions ratified 2026-06-08** — P1.2 toolbar design unblocked. **Freedraw-latency fix folded into P1.1 as Phase-1 acceptance gate (Sonnet-tier)** — Andrew 2026-06-08. Feasibility spike on `@excalidraw/excalidraw` **0.18.1** (YELLOW = go; Phase 0 POC green 2026-06-08).

---

## 1. Feasibility summary

Spike verdict: **YELLOW = proceed** — core imperative APIs work; hide mechanism and a few interaction edges need a **runtime POC** (Phase 0) before full build.

| Area | Verdict | Evidence / notes |
|------|---------|------------------|
| **Tool switching** | **GREEN** | `excalidrawAPI.setActiveTool({ type })` works for all needed tools: `selection` (cursor), `freedraw` (pencil), `eraser`, `text`, shapes (`rectangle`, `diamond`, `ellipse`, `arrow`, `line`). |
| **Imperative styling** | **GREEN** | `updateScene({ appState: { currentItemStrokeColor, currentItemStrokeWidth, currentItemOpacity, … } })` sets stroke/color/opacity without native palette. |
| **Active tool readback** | **GREEN** | `getAppState().activeTool` — mirror highlight in Mynk chrome on `onChange`. |
| **Native chrome hide** | **YELLOW** | `zenModeEnabled={true}` alone leaves tool rail + hamburger. **Ratified:** zen + **scoped CSS** on Excalidraw wrapper. Do **not** pass `style` to `<Excalidraw>` — it sizes the wrapper, not the canvas. |
| **Full hide + undo under overlay** | **POC-gated** | Ctrl/Cmd+Z must work when focus is on canvas under Mynk overlay; needs real-browser POC. |
| **Pen / stylus** | **POC-gated (generic)** | Borrowed/generic tablet proves pen through hidden chrome; **not** Sarah's XPPen Star G640 — residual risk until Sarah tests (see §9). Native pen path untouched. |
| **Viewport offset integrity** | **POC-gated** | Chrome overlay must not shift canvas container without Excalidraw knowing — breaks tutor↔student viewport-follow offset-invariance (see §3). |

**Decoupling principle:** The rest of the v1 site redesign does **not** depend on the Excalidraw feasibility question and proceeds in parallel on `v1-redesign`. **Only** the whiteboard-chrome build is gated on Phase 0 POC success.

---

## 2. Chrome architecture

### 2.0 Standing principles (Andrew, ratified 2026-06-08)

These govern every chrome control decision — including P1.2 toolbar, properties popover, overflow, and context menus.

**A. Every function has a visible button affordance (TU-14).** No whiteboard function is reachable **only** via right-click or **only** via hotkey. Right-click menus and keyboard shortcuts are **accelerators**, never the sole path. Rationale: single-button mice, function-key "right-click", and accessibility/AT users — we cannot assume right-click or specific hotkeys exist. Buried-in-overflow / More is acceptable; button-less is not. Applies to z-order, delete-selected, style controls, and every student-facing function.

**B. Full touch/tablet/phone parity for ALL controls (TM-10).** Students draw on touch devices. Every control — z-order, delete, the right-click/long-press set, More styles, laser, theme toggle — must have a touch-reachable equivalent (long-press menu, selection toolbar, adequate tap targets). Not mouse-only or right-click-only. First-class constraint, not a desktop-afterthought.

### 2.1 Component model

- **One shared chrome component**, two variants: **`tutor-desktop`** (primary) and **`student-mobile-first`** (Phase 2).
- Mynk toolbar is a **sibling overlay** to the Excalidraw mount — **not** Excalidraw's `children` slot.
- Hide native UI: **`zenModeEnabled={true}`** + scoped CSS suppressing remaining rails/menus.
- Drive tools via **`setActiveTool`** — locked flow for cursor → pencil → eraser (Sarah order).
- Drive styles via **`currentItem*`** appState fields through `updateScene`.
- Mirror active-tool highlight from **`getAppState().activeTool`** on every `onChange`.
- **Undo:** keep existing **synthetic-key** undo path; hide native footer undo (SR-09). Coordinate with TU-03 / TU-11.
- Visual system: v1 tokens only (TU-02, open Q9) — no one-off oversized buttons.
- **Theme parity (TU-12):** Mynk chrome (toolbar, pulldowns, properties popover, page strip, bottom bars) styled for **both light and dark** via v1 tokens. Site theme defaults to **OS/system** until user explicitly picks light or dark (A′). Excalidraw `theme` prop follows the **app-selected** theme. **Board background follows theme** — no native Excalidraw canvas-bg control (M-10 dropped). **Whiteboard-local theme toggle (TU-13):** small theme control on the whiteboard chrome itself as an escape hatch in addition to the global nav toggle. Applies to **`tutor-desktop`** (Phase 1) and **`student-mobile-first`** (Phase 2).
- **Z-order default (TU-14 / NR-11):** PDF page images are **deepest-z**; all drawn strokes/annotations render **above** PDFs. Send-to-back / bring-to-front via buried/More toolbar buttons **and** right-click/long-press menu (TU-14, TM-10).
- **Pen mode (NR-03):** Leave Excalidraw native pen/tablet handling **untouched** — expose **no** Mynk pen-mode control. Watch palm-rejection only.

### 2.2 Imperative API cheat sheet (0.18.1)

| Mynk control | API |
|--------------|-----|
| Cursor | `setActiveTool({ type: "selection" })` |
| Pencil | `setActiveTool({ type: "freedraw" })` |
| Eraser | `setActiveTool({ type: "eraser" })` |
| Text | `setActiveTool({ type: "text" })` |
| Shapes | `setActiveTool({ type: "rectangle" \| "diamond" \| "ellipse" \| "arrow" \| "line" })` |
| Stroke / width / opacity | `updateScene({ appState: { currentItemStrokeColor, currentItemStrokeWidth, currentItemOpacity, … } })` |
| Active tool state | `getAppState().activeTool` |

Existing insert actions (PDF, Math, Desmos, image) stay as today — integrated into Mynk chrome (TU-04), not orphaned.

### 2.3 Sync DO-NOT-BREAK invariants (summary)

Custom chrome sits **on top of** the shipped sync stack. The architecture map identified **22 sync invariants** that chrome work must not violate — full detail in [`whiteboard-sync-redesign-2026-05-27.md`](whiteboard-sync-redesign-2026-05-27.md) (per-page P1–P8, wire I1–I4, viewport-align contract) and [`whiteboard-regression-net-design-2026-05-30.md`](whiteboard-regression-net-design-2026-05-30.md) (real-browser oracle inv 4–6). **`npm run test:wb-sync` must stay green** through every chrome phase.

**Two layout-critical invariants for chrome authors:**

1. **Never shift the canvas container without Excalidraw knowing.** Padding, margins, or flex reflow on the Excalidraw wrapper that change effective viewport geometry break tutor↔student **viewport-follow offset-invariance**. The scroll math in `viewport-align.ts` and the offset-invariance tests in `viewport-align.test.ts` assume the canvas container's client rect matches what Excalidraw reports. Chrome overlays are `position: fixed` / `absolute` **siblings** — they must not consume layout space inside the canvas flex child.

2. **Preserve `onChange` / programmatic-write guard discipline** in `WhiteboardWorkspaceClient.tsx`. Remote apply, page switch, and viewport programmatic paths set refs before writing:
   - `applyingRemoteToCanvasRef`
   - `pageSwitchProgrammaticRef`
   - `isApplyingViewportProgrammaticRef`  
   Chrome-driven `setActiveTool` / `updateScene` for **local tutor intent** must not trip these guards or skip `onChange` echo suppression. Any new imperative write from chrome needs the same discipline review.

---

## 3. Tutor-desktop layout — HYBRID (Fork 1, ratified)

**Decision:** slim **top bar** + collapsible **left tool strip** + **contextual properties popover** + floating video tile. Maximizes canvas (collapsible left, compact top, popover vs quarter-screen palette) while giving each control class a logical home.

### 3.1 Wireframe (tutor desktop)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR ~44px                                                               │
│ [Share link] [Mic▮▮▯ + picker] [Cam] │ ↶ ↷ │ [PDF][Img][Math][Desmos] │ − + Fit │ [☀/☾] │
├────┬────────────────────────────────────────────────────────────────────────┤
│ L  │                                                                        │
│ E  │                                                                        │
│ F  │                     EXCALIDRAW CANVAS (full flex)                      │
│    │                                                                        │
│ ~  │                                        ┌──────────┐                    │
│48px│                                        │ AV tile  │                    │
│    │                                        │ bottom-R │                    │
│ ▶  │                                        └──────────┘                    │
│sel │                                                                        │
│ ✎  │   ┌─ Properties popover (on tool select) ─┐                           │
│ ⌫  │   │ Color │ Width │ Opacity │ [More ▾]    │  dismiss: outside-click    │
│ T  │   │ More = ALL remaining native styles    │  (PP-04; nothing dropped)  │
│ 🔴 │   └────────────────────────────────────────┘                           │
│ ─  │                                                                        │
│ ↗▼ │  lines/arrows pulldown                                                  │
│ ▭▼ │  rect/diamond/ellipse pulldown                                          │
│ ···│  overflow: z-order, delete-selected, hand (TU-14, TM-10)               │
│[◀] │  collapse toggle                                                         │
└────┴────────────────────────────────────────────────────────────────────────┘
│ PAGE STRIP (existing; section headers SR-10; insert-order UX Phase 3)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Control placement

| Zone | Contents | Requirement refs |
|------|----------|------------------|
| **Top bar (~44px)** | Share link (TU-07), AV mic-meter + device picker (TU-08), cam, undo/redo (TB-11, TU-03), insert actions PDF/image/math/Desmos (TB-08–10, TU-04), zoom / fit (TB-07), **whiteboard-local theme toggle** (TU-13) | TU-09 session bar intent — top bar absorbs session + zoom; bottom AV strip de-emphasized on desktop |
| **Left strip (collapsible)** | Tool order: cursor → pencil → eraser → text → **laser (V1 top-level)** (TB-01, ST-05); line+arrow pulldown (TB-02, PU-01); rect+diamond+ellipse pulldown (TB-03); **··· overflow** for z-order, delete-selected, hand (TU-14); collapse chevron (TB-05, SR-02, SR-08) | Sarah priority #3; laser not deferred |
| **Properties popover** | Basics inline: stroke color, width, opacity, default roughness/roundness (PP-04); **More styles** holds **ALL** remaining native style props (fill, stroke style, arrow type, arrowheads, text align, font, freedraw profile, etc.) — nothing dropped; dismiss on outside-click (PP-02, TM-01, TM-10) | Replaces native quarter-screen palette (PP-01, PU-03) |
| **Video tile** | Floating bottom-right overlay (SR-04) | Does not stack above canvas |
| **Page strip** | Unchanged in Phase 1; polish in Phase 3 (SR-10, SR-11) | |

### 3.3 Drawing defaults (Phase 1)

Ship with tutor-desktop chrome (DD-01–04). Concrete `appState` on session start (`initialData.appState` + `updateScene`):

| Field | Value | Requirement |
|-------|-------|-------------|
| `currentItemRoughness` | **0** | Architect — sloppiness OFF (DD-01) |
| `currentItemRoundness` | **sharp** (confirm exact value shape at build time — spike flagged for runtime) | Sharp edges, no rounding (DD-02) |
| `currentItemStrokeWidth` | **thinnest preset** | Default pen = THINNEST (DD-03); properties popover presets include heavier + materially thinner options (DD-04) |

Expose stroke width / roughness / roundness in properties popover (inline or More tier per PP-04). Clean/sharp defaults pinned (DD-01–03); all native style options remain available tiered.

**Z-order (TU-14):** PDF pages deepest-z; annotations always above. Z-order controls in overflow + context-menu/long-press — never keyboard-only.

**Delete (TU-10, TU-14):** Eraser primary; selected-element delete via keyboard + right-click/long-press + buried visible button.

---

## 4. Student-mobile variant outline (Phase 2)

Fundamentally different **`student-mobile-first`** variant — not a breakpoint shrink of tutor chrome.

| Element | Spec | Requirement refs |
|---------|------|------------------|
| Canvas | **≥80%** viewport; native toolbar hidden (TB-06) | SR-01, SR-03 |
| Bottom control bar ~48px | Follow-tutor (default on, ST-01), mic, leave (ST-02) | v1 §5.7 |
| Tools | Pencil + eraser visible; rest in **`···` overflow** (TB-06, PU-02) | ST-04 |
| Page strip | ≤40px pill tabs; no explainer card (SR-05, SR-06); section mirror (ST-06) | |
| Viewport | `100dvh` + no clip on Safari URL-bar collapse (SR-07, SR-12) | |
| Acceptance | **Real iPhone Safari** gate — jsdom cannot validate (TM-03) | PHASE-2-IOS-SMOKE-MATRIX S11 |

Architecture must allow **student add-page** later (ST-03 defer); v1 student does not add pages.

---

## 5. Fork resolutions (ratified)

### Fork 1 — Tutor-desktop placement = **HYBRID**

Slim top bar for session/insert/zoom + collapsible left strip for drawing tools + contextual properties popover. Rationale: maximizes canvas, logical grouping, matches Sarah's tool order without Wyzant-style full left+right sidebars (SR-08).

### Fork 2 — Tutor-on-mobile = **DEFER to v1.1** + expectations notice (**TM-09**)

Pilot norm remains **desktop tutor + mobile student**. v1 ships:

1. **Pre-subscribe / pricing copy:** tutor-side phone/tablet support is upcoming; **desktop tutoring only** for now.
2. **Host-time gate:** device-detected block when a tutor tries to **start** a whiteboard session from non-desktop — message: *"Desktop tutoring only for now; phone/tablet tutoring is coming."*

Architecture must **not** preclude enabling tutor-mobile later (shared chrome component, variant prop). TM-05 full tutor-mobile chrome is v1.1, not v1.

### Fork 3 — Prototype gate = **YES, fail-fast**

Before Phase 1 goes full bore: a **sync-free throwaway runtime POC** on a Vercel preview proves Excalidraw direction — hide native UI, tool switching, undo under overlay, generic pen, viewport offset integrity. **Fail fast** if POC red; do not invest in full chrome + sync integration on a broken hide/pen/viewport foundation.

POC scope is intentionally **narrow** — no relay, no multi-page sync, no AV. Phase 0 only.

---

## 6. Phasing and acceptance criteria

### Phase 0 — Runtime feasibility POC (in flight)

**Goal:** De-risk YELLOW items on a throwaway branch → Vercel preview.

| Criterion | Pass |
|-----------|------|
| Native UI fully hidden (zen + scoped CSS) | No tool rail, hamburger, or footer undo visible |
| Tool switching | Mynk buttons drive `setActiveTool`; highlight mirrors `activeTool` |
| Undo | Ctrl/Cmd+Z works with canvas focus under overlay; synthetic-key path intact |
| Pen | Generic tablet draws through hidden chrome |
| Viewport | No offset drift when chrome mounts/unmounts; canvas container geometry unchanged |
| No `style` on `<Excalidraw>` | Wrapper sizing regression absent |

**Gate:** Phase 1 dispatch **blocked** until Andrew smokes POC preview green.

### Phase 1 — Tutor-desktop chrome (P1.1)

**Goal:** Hybrid layout (§3) on `WhiteboardWorkspaceClient` tutor path; drawing defaults; consolidated pulldowns; dismissible properties popover.

**Executor tier (Andrew 2026-06-08):** **Sonnet** — P1.1 now carries **fragile sync hot-path** work (freedraw-latency fix folded in as Phase-1 acceptance gate below). Default Composer dispatch is insufficient for auth/sync-boundary + concurrency reasoning on this surface.

#### P1.1 acceptance gate: freedraw-latency fix (folded in)

**Decision (Andrew 2026-06-08):** The freedraw draw-latency fix is **folded into the P1.1 whiteboard-chrome build as a Phase-1 acceptance gate** — **not** a standalone fix and **not** a deferred follow-up.

**Symptom:** ~250ms freedraw lag on `v1-redesign` (stroke trails cursor); Phase 0 chrome POC was instant.

**Root cause (one-liner):** Pre-existing sync hot-path work the POC skipped — **not** chrome. **Primary:** `preserveImageAssetUrlsOnSceneWrite` (`src/lib/whiteboard/preserve-image-asset-urls.ts`) deep-clones the **entire** scene on **every** pointer-move inside Excalidraw's `onChange` (`handleExcalidrawChange` in `WhiteboardWorkspaceClient.tsx` ~L2975) — O(N) per point, blocks paint; runs **solo** (always). **Secondary:** v3 document emit every 50ms (`useTutorLiveDocumentWire.ts` `emitDocument`) re-clones + `JSON.stringify`s the whole multi-page doc; recorder `flushPendingDiff` every 100ms canonicalizes + diffs whole scene (`useWhiteboardRecorder.ts`, `excalidraw-adapter.ts`); recorder `pushEvent` `setState` storm forces full workspace re-render while recording. Minor: `onLocalElementSnapshot` O(N) per move.

**Recommended fix — Option A (low-risk, mandatory):** Stop cloning per pointer-move — assign `pageDataRef[pageId] = elements` (ref, no clone) on `onChange`; run `preserveImageAssetUrlsOnSceneWrite` **only** when building wire/checkpoint payloads (`getTutorDocumentPagesSnapshot`, `buildBoardDocumentForCheckpoint`). Excalidraw still owns the live canvas; deferral affects buckets/wire only, not paint.

**Mandatory companion — Option E:** Add a `pointerup`/idle flush (`flushThrottledFrameNow()` + `flushDocumentBroadcastNow()`) so widening/deferring throttled work can **never** drop the last stroke segment. Must respect `applyingRemoteToCanvasRef` / `pageSwitchProgrammaticRef` guards.

**Optional follow-on (lower priority — only if needed after A+E):** Slim v3 emit (avoid triple-clone); decouple recorder UI `setState` from `pushEvent` (1Hz footer); incremental freedraw diff.

**Invariants the fix must respect:** All **22 whiteboard sync invariants** (§2.3) — especially P5 image `assetUrl` preservation must still run before any peer-visible snapshot/v3 send; recorder event-log replay fidelity; monotonic rev; throttle-not-debounce continuous-gesture cadence.

**Test gates:** `npm run test:wb-sync` green **and** `use-tutor-live-document-wire` cadence tests green.

| Criterion | Pass |
|-----------|------|
| Layout | Top bar + collapsible left strip + popover per wireframe |
| Tools | Sarah order + two shape pulldowns (TB-01–03, PU-01) |
| Properties | Basics inline, More expand, outside-click dismiss (PP-02, PP-04) |
| Drawing defaults | Fresh session canvas opens with **`currentItemRoughness: 0`** (architect / sloppiness off), **sharp edges** (`currentItemRoundness` = sharp — implementer confirms exact value shape at build time), **`currentItemStrokeWidth` = thinnest preset** (DD-01–03); popover presets include heavier + materially thinner options (DD-04) |
| Session | Share link, AV controls, inserts in chrome (TU-04, TU-07, TU-08) |
| **Draw latency** | **PR-01:** Freedraw instant (POC parity); hot-path fix landed per Option A + Option E above; no regression vs Phase 0 POC |
| Sync | `npm run test:wb-sync` green; 22 invariants unbroken (§2.3); wire cadence tests green |
| Keyboard | TU-11 surface routing defined for tutor-desktop |
| Visual | Professional polish bar (HARD quality bar; TU-02) |
| Theme | **TU-12 + TU-13:** tutor-desktop chrome readable in **light and dark**; Excalidraw `theme` + board bg follow app-selected theme; whiteboard-local theme toggle on chrome |
| Laser | **ST-05:** V1 top-level toolbar slot; verify alignment/visibility to student (fix if regressed) |
| Affordances | **TU-14 + TM-10:** every function has visible button; full touch/long-press parity for z-order, delete, More styles |
| Styles | **PP-04:** all native style props kept — inline vs More styles tier; nothing dropped |
| Z-order | **TU-14:** PDF deepest-z HARD default; send-to-back/bring-to-front via buttons + menu |

### Phase 2 — Student-mobile chrome

**Goal:** `student-mobile-first` variant per §4.

| Criterion | Pass |
|-----------|------|
| Layout | ≥80% canvas, bottom bar, ≤40px page strip, `100dvh` |
| Tools | Pencil + eraser + overflow; native hidden |
| Follow | Default-on follow toggle |
| Theme | **TU-12:** student-mobile chrome + Excalidraw `theme` match app-selected light/dark (parity with tutor path) |
| iOS | Real iPhone Safari acceptance (TM-03) — matrix S11 rows ticked |
| Sync | `test:wb-sync` green on student paths |

### Phase 3 — Polish + cross-cutting

| Item | Requirement refs |
|------|------------------|
| Laser pointer alignment re-verify | ST-05 (if V1 gate regresses) |
| Eraser cursor vs delete path | TM-08 |
| PDF page-picker integration in chrome | TB-08, PU-04 |
| Page insert order UX | SR-11 |
| Ghost peer viewport overlays (follow OFF) | open Q11 — ship or defer per backlog |
| iOS touch undo verify | TM-06 |
| Pointer-transform hit offset | TM-02 |

---

## 7. Open questions (still unresolved)

From requirements doc — **not** closed by this design pass:

| # | Question | Notes |
|---|----------|-------|
| 2 | Pulldown grouping beyond shapes — where PDF/Math/Desmos/Image land | **Resolved 2026-06-08:** inserts on **top bar**; all styles tiered inline vs More (**PP-04**) |
| 3 | Which properties always visible vs behind "More" | **Resolved 2026-06-08:** color, width, opacity (+ default roughness/roundness) inline; **ALL** other native style props in More — nothing dropped |
| 4 | Student vs tutor tool parity after Sarah tests student add-page | v1 pencil+eraser only; revisit v1.1+ |
| 6 | Laser pointer: Excalidraw layer vs custom overlay | **Resolved 2026-06-08:** V1 **top-level** toolbar slot; **verify** alignment/visibility (ST-05) |
| 8 | Keyboard shortcuts when native toolbar hidden | TU-11 — define parity at Phase 1 tutor, Phase 2 student |
| 9 | Visual system token mapping for every control | Follow V1-COMPONENT-LIBRARY; no one-offs |
| 10 | PDF default fit: tutor vs student viewport | DD-05 — product open |
| 11 | Ghost peer viewport overlays when follow OFF | Defer default; optional polish |

**Resolved this pass:** Q1 hybrid, Q5 defer+TM-09, Q7 zen+scoped CSS, Q12 fail-fast Phase 0 POC (+ Phase 2 real-iPhone gate).

---

## 8. Pen / XPPen residual risk

- Phase 0 POC with a **borrowed/generic tablet** proves pen input works through hidden chrome **generically**.
- Does **not** certify Sarah's **XPPen Star G640** (TU-05, TM-04, Sarah priority #2).
- **Residual risk** until Sarah tests on her hardware — native pen handling code stays **untouched**; only chrome visibility changes.
- Acceptance: Sarah session on XPPen before calling pen path done.

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md) | **Pre-hide audit** — full Excalidraw 0.18.1 function inventory, silently-lost list, keyboard-only survivors, candidate new requirements |
| [`whiteboard-chrome-requirements.md`](whiteboard-chrome-requirements.md) | 68 requirements (incl. TM-09, TM-10, TU-12–TU-14, PR-01) |
| [`WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) | Build status + Sarah UX table |
| [`whiteboard-sync-redesign-2026-05-27.md`](whiteboard-sync-redesign-2026-05-27.md) | Sync invariants P1–P8, I1–I4 |
| [`whiteboard-regression-net-design-2026-05-30.md`](whiteboard-regression-net-design-2026-05-30.md) | Real-browser regression net |
| [`v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) | §5.7 student mobile shell |
| [`PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5 | Excalidraw 0.18.1 API limits |
| [`BACKLOG.md`](../BACKLOG.md) | Whiteboard queue + TM-09 row |

---

## 10. Executor quick-start (Phase 1)

1. Confirm Phase 0 POC green on preview (Andrew sign-off).
2. Read §2.3 layout invariants before touching `WhiteboardWorkspaceClient.tsx` layout.
3. Add `MynkWhiteboardChrome` sibling overlay; wire `excalidrawAPI` ref already on workspace.
4. Implement `tutor-desktop` variant per §3 wireframe; hide native via zen + scoped CSS module.
5. Mirror `activeTool` on `onChange`; route undo through existing synthetic-key helper.
6. Set drawing defaults on session mount (DD-01–04).
7. Run `npm run test:wb-sync` before push; no merge without green net.
