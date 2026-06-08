# Whiteboard chrome requirements — custom Mynk UI (design input)

> **Purpose:** Design INPUT for the custom Mynk whiteboard chrome layer (toolbar + properties/controls), driving Excalidraw via `excalidrawAPI`.
>
> **Sequencing (ratified Andrew 2026-06-07/08):** Whiteboard chrome is a **pre-master gate** for the V1 reveal — build on `v1-redesign` before `v1-redesign → master`. Master cut = Sarah reveal (`tutoring-notes.vercel.app` / `usemynk.com` share the same production deployment on `master`; no UI-skin feature flag). The reveal must be one cohesive site, not polished chrome around still-janky Excalidraw native UI.
>
> **Last consolidated:** 2026-06-08 (audit dispositions ratified; TU-13/TU-14/TM-10 added; PP-04/ST-05 expanded; **PR-01** freedraw-latency gate folded into P1.1). Prior: 2026-06-07 TU-12 theme parity, TU-11 keyboard surface routing. **Design doc (ratified forks + phasing):** [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md). **Audit:** [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md).

---

## LOCKED decision (Andrew, 2026-06-07)

Replace Excalidraw's native whiteboard UI with **our own custom chrome** (toolbar + properties/controls), driving the canvas via `excalidrawAPI` — the same pattern already used for Undo/Redo + PDF/Math/Desmos inserts.

**Why:** Excalidraw `^0.18.1` `UIOptions` cannot reorder tools, compress/replace the properties palette, or fix mobile popup behavior. See [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5 and [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) § "Sarah UX asks + custom chrome decision" @ commit `927d536`.

**Scope:** One shared chrome layer with **`tutor-desktop`** and **`student-mobile-first`** variants. Real-iPhone acceptance gate. **Pre-master gate** — required before `v1-redesign → master` (cohesive V1 reveal).

**Standing principles (Andrew, ratified 2026-06-08):**

1. **Every function has a visible button affordance (TU-14).** No whiteboard function is reachable **only** via right-click or **only** via hotkey. Right-click menus and keyboard shortcuts are **accelerators**, never the sole path. Rationale: single-button mice, function-key "right-click", and accessibility/AT users — we cannot assume right-click or specific hotkeys exist. Buried-in-overflow is acceptable; button-less is not.
2. **Full touch/tablet/phone parity for ALL controls (TM-10).** Students draw on touch devices; every control — including z-order, delete, the right-click set, and "More styles" — must have a touch-reachable equivalent (long-press / selection toolbar / tap targets), not mouse-only/right-click-only. First-class constraint, not a desktop-afterthought.

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
| **TB-01** | Primary toolbar order: **Cursor → Pencil → Eraser → Typing**, then shape tools. Sarah priority **#3**. | (ii) | Sarah-Chat L10–14; orchestrator U4; BACKLOG |
| **TB-02** | Consolidate **line + arrow** into one dropdown/pulldown. | (ii) | Sarah-Chat L15; orchestrator U5 |
| **TB-03** | Consolidate **rectangle + diamond + ellipse** into one dropdown/pulldown. | (ii) | Sarah-Chat L16; orchestrator U6 |
| **TB-04** | Tools generally ordered by **most-used first** (Sarah's workflow, not Excalidraw default). | (ii) | Sarah-Chat L72; priorities L69–73 |
| **TB-05** | **Tutor desktop:** slim collapsible toolbar strip (left or top per v1 spec); not a full native Excalidraw rail consuming canvas width. | (ii) | v1-component-redesign §5; RELIABILITY-REDESIGN Surface 5 |
| **TB-06** | **Student mobile:** native Excalidraw toolbar **hidden by default**. Student needs follow-tutor toggle + **pencil + eraser**; everything else in **`···` overflow**. | (ii) | v1-component-redesign §5.7; RELIABILITY-REDESIGN Surface 5 |
| **TB-07** | Preserve **zoom-in for precise labeling** — Sarah explicitly values this; chrome must not steal zoom affordances or viewport. | (ii) layout | Sarah-Chat L46; orchestrator U11 |
| **TB-08** | **Wyzant-style PDF page subset picker** — import selected pages, not forced whole-document (two-step: file → page picker). | (ii) | whiteboard-smoke-log § Sarah 2026-04-24; pdf-page-picker bootstrapper |
| **TB-09** | **Phone-photo / image insert** first-class in toolbar flows (not only disk drag/drop or hidden Excalidraw menu). | (ii) | whiteboard-smoke-log § Sarah 2026-04-24; BACKLOG native image |
| **TB-10** | **Graph / Desmos insert** affordance in Mynk toolbar (Sarah top-10 action: "importing or inserting a graph"). | (ii) | orchestrator Q1; BACKLOG Apr 24 Q1; WHITEBOARD-STATUS Sarah Q&A |
| **TB-11** | Keep **visible Undo/Redo** controls in Mynk chrome (chunky ↶/↷ shipped Apr 2024); coordinate with keyboard path (TU-03, TU-11). | (ii) | BACKLOG undo row; whiteboard-smoke-log |

### Pulldown / consolidation

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **PU-01** | Shape tools grouped into **two pulldowns** (lines/arrows; rect/diamond/ellipse) instead of separate toolbar slots. | (ii) | Sarah-Chat L15–16; v1-component-redesign §5 |
| **PU-02** | Infrequent tools (image insert paths, extra shapes, etc.) live in overflow **`···`**, not permanent toolbar slots. | (ii) | v1-component-redesign §5.7 |
| **PU-03** | **Desktop tutor:** pen/style UI is a **compact bar by default**; full tool menu only on explicit expand — not automatic quarter-screen takeover. | (ii) | 2026-06-06 U5; BACKLOG `pilot-2026-06-06`; Sarah-Chat L73 |
| **PU-04** | **PDF insert** uses consolidated modal chrome (iOS warning, page cap copy, subset picker) — not scattered native menus. | (ii) | pdf-page-picker bootstrapper; Sarah Apr 24 |

### Properties palette (compress / replace)

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **PP-01** | Replace or heavily compress Excalidraw's **left properties palette** — dominates desktop (~quarter screen when pen active per 2026-06-06). | (ii) | 2026-06-06 U5; BACKLOG framing note |
| **PP-02** | **Close styles/properties panel without re-tapping the same control** — dismiss on outside click/tap (Sarah priority **#4**). | (ii) | Sarah-Chat L44–45, L73; orchestrator I7 |
| **PP-03** | Mobile **color / pen palette** dismisses on **click-away** (outside tap). | (ii) | Sarah-Chat L44–45; BACKLOG I7; whiteboard-sync-redesign § I7 |
| **PP-04** | Properties UI shows **basics inline** (stroke width, color, opacity, roughness/roundness defaults); **ALL remaining native style properties kept** — fill style, stroke style, freedraw stroke profile, arrow type, arrowheads, text align (incl. vertical), font family/size, etc. — organized **primary-inline vs "More styles" overflow** (NR-02 ratified). Clean/sharp is the **default** (roughness 0, sharp edges, thinnest stroke — DD-01–03); every option remains available. | (ii) | 2026-06-06 U5; audit NR-02/P-03–P-14 ratified 2026-06-08 |
| **PP-05** | **Single restore story** — suppress or replace Excalidraw's confusing **"Load draft into board"** recovery modal during live collab (prefer Discard / server truth). | (ii) + (iii) | BACKLOG Excalidraw recovery row; whiteboard-smoke-log § refresh |

### Drawing defaults

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **DD-01** | Default **sloppiness / roughness = architect** (= `currentItemRoughness: 0`, sloppiness OFF) — clean hand-drawn, not sketchy. | (i) | Sarah-Chat L17; orchestrator U7 |
| **DD-02** | Default **edges = sharp** (= sharp edges / no rounding; `currentItemRoundness` = sharp). | (i) | Sarah-Chat L17; orchestrator U8 |
| **DD-03** | Default pen stroke = **THINNEST preset** (= `currentItemStrokeWidth` thinnest preset) — current strokes too thick on desktop tutor. | (i) + (ii) | 2026-06-06 U6; BACKLOG |
| **DD-04** | Default is thinnest (DD-03); stroke-width **presets** include standard heavier options plus a **materially thinner** option for math annotation without requiring zoom. | (i) + (ii) | 2026-06-06 U6 acceptance |
| **DD-05** | Default **PDF zoom-to-fit** on insert (per-page board pages); student inherits via follow — design whether fit targets tutor vs student viewport (open). | (i) + layout | BACKLOG PDF-fit row; pdf bootstrapper |

### Touch / mobile-tablet behavior

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **TM-01** | All floating palettes/popovers on touch devices: **outside-tap dismiss** (PP-02, PP-03). | (ii) | Sarah-Chat; I7 |
| **TM-02** | Fix **pointer-transform hit offset** (eraser + PDF touch targets drift up-left on mobile). | app-bug + (ii) | BACKLOG post-sync smoke (d) |
| **TM-03** | **Real iPhone Safari** acceptance for student-mobile chrome — jsdom cannot validate layout/popup behavior. | process gate | PLATFORM-ASSUMPTIONS §8; PHASE-2-IOS-SMOKE-MATRIX S11 |
| **TM-04** | **Tablet / XPPen** pressure-sensitive drawing must keep working through custom chrome (Sarah priority **#2**). **Leave Excalidraw native pen/tablet handling untouched** — expose **no** Mynk pen-mode control (NR-03 resolved). Watch-item: revisit only if palm-rejection trouble reported. | (i) + verify | Sarah-Chat L71; 2026-06-06 W2; audit T-12 ratified 2026-06-08 |
| **TM-05** | **Tutor-on-phone/tablet** variant when tutor joins from non-desktop. | (ii) | BACKLOG tutor-side mobile row |
| **TM-06** | **iOS touch undo/redo** on visible ↶/↷ buttons — verify after custom chrome (shipped desktop; touch unverified). | (ii) + verify | BACKLOG undo row; iOS matrix §7; TU-11 |
| **TM-07** | **Touch drawing ergonomics** on iOS — palm rejection, continuous stroke broadcast (S11 matrix). | (ii) + verify | PHASE-2-IOS-SMOKE-MATRIX §7, S11 |
| **TM-08** | **Eraser cursor** aligned with stroke delete path (icon/cursor vs actual erase position). | app-bug | BACKLOG eraser cursor row; whiteboard-sync-redesign |
| **TM-09** | **Tutor-mobile deferral + expectations notice (v1.1).** (a) Pre-subscribe/pricing copy: tutor phone/tablet support upcoming; **desktop tutoring only** now. (b) Host-time device gate: block tutor **starting** a whiteboard session from non-desktop with *"Desktop tutoring only for now; phone/tablet tutoring is coming."* Architecture must not preclude tutor-mobile later. **Defers TM-05** full variant to v1.1. | (ii) + product | Design pass 2026-06-07 Fork 2; [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) §5 |
| **TM-10** | **Full touch/tablet/phone parity for ALL chrome controls.** Every whiteboard function exposed in chrome — z-order, delete-selected, More styles, laser, theme toggle, etc. — must have a **touch-reachable equivalent** (long-press menu, selection toolbar, adequate tap targets). No desktop-only or right-click-only interaction for any function students need. Standing principle (Andrew 2026-06-08). | (ii) + verify | Audit ratification 2026-06-08; pairs with TU-14 |

### Screen real estate / responsive

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **SR-01** | **Student iPhone:** whiteboard **≥80%** of viewport (Wyzant ~85–90%). Today ~30–35% per I5. | (ii) | Sarah-Chat L21; RELIABILITY-REDESIGN Surface 5 |
| **SR-02** | **Tutor desktop:** whiteboard area **significantly larger** — canvas too small vs Wyzant reference. | (ii) | 2026-06-06 U2; v1 maximal-canvas |
| **SR-03** | **Declutter** — crowded page; Wyzant *intent* (big canvas, light chrome). | (ii) | 2026-06-06 U3; orchestrator Wyzant image |
| **SR-04** | **Video tile** overlays whiteboard corner (bottom-right), not stacked above canvas. | (ii) | Sarah-Chat L22; v1 §5.7 |
| **SR-05** | Remove **Board pages explainer card** on student mobile (~25% viewport); compact strip instead. | (ii) | RELIABILITY-REDESIGN; v1 §5.7 |
| **SR-06** | **Page strip** ≤40px — pill tabs `[1] [2] [3]`. | (ii) | v1 §5.7 |
| **SR-07** | Use **`100dvh`** (not `100vh`) for iOS Safari URL-bar collapse. | (ii) | v1 §5.7; iOS matrix §7 |
| **SR-08** | **Wyzant-shaped** chrome: minimal toolbar; no dominant left+right sidebars eating canvas. | (ii) | orchestrator §2; locked §3 |
| **SR-09** | Avoid duplicate chrome (app Undo/Redo **plus** full native Excalidraw toolbar) — consolidate into Mynk chrome. | (ii) | orchestrator I5 screenshot |
| **SR-10** | **Page strip:** PDF workbook **section headers** (collapsible groups per imported file). | (ii) | whiteboard-smoke-log Apr 24; pdf-page-picker bootstrapper |
| **SR-11** | **Page insert order** — new pages inserting *after* active page feels counterintuitive; revisit strip UX. | (ii) product | BACKLOG smoke 2026-05-30 (c) |
| **SR-12** | **iOS dynamic viewport:** custom chrome must not clip when Safari URL bar collapses (pair with `100dvh`). | (ii) | PHASE-2-IOS-SMOKE-MATRIX §7 known-quirks |

### Student-WB-specific (fundamentally different, mobile-first)

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **ST-01** | **Follow-tutor** toggle in bottom control bar; **checked by default** (sync pan/zoom). | (ii) | Sarah-Chat L41; v1 §5.7 |
| **ST-02** | Student bottom bar ~48px: **follow toggle, mic, leave** — above compact page strip. | (ii) | v1 §5.7 |
| **ST-03** | **Student add-page:** **No** for v1 (ratified); architecture must allow enabling later. | product | Sarah-Chat L23; v1 §8 |
| **ST-04** | Student does **not** need full shape/text toolset by default — tutor drives structure. | (ii) | v1 §5.7; RELIABILITY-REDESIGN |
| **ST-05** | **Laser pointer** — **V1 top-level** reachable toolbar slot (not deferred). **Verify** alignment and visibility to student in V1; fix if regressed (viewport-alignment fix cleared most misalignment per Andrew 2026-06-08). Remains a V1 acceptance gate. | (ii) + verify | Sarah-Chat L39–40; audit T-16/NR-06 ratified 2026-06-08 |
| **ST-06** | Student page strip mirrors tutor **section grouping** (read-only; no add-page in v1). | (ii) | pdf-page-picker bootstrapper § student mirror |

### Tutor-WB-specific

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **TU-01** | **Tutor-desktop chrome** is the primary design target (desktop tutor + mobile student). | (ii) | orchestrator mobile-parity §3 |
| **TU-02** | **Professional visual polish** — Mynka Blue / v1 component system; not monochrome reskin. | (ii) | HARD bar; 2026-06-06 U1; V1-COMPONENT-LIBRARY §2.10 |
| **TU-03** | **Keyboard undo** Ctrl/Cmd+Z reliable on desktop (on-screen undo works; keyboard regressed 2026-06-06). | (ii) + app-bug | 2026-06-06 B1; BACKLOG; ORCHESTRATOR-STATE; TU-11 |
| **TU-04** | Custom insert actions (PDF, Math, Desmos) integrated into Mynk toolbar — not orphaned. | (ii) | WHITEBOARD-STATUS § custom chrome |
| **TU-05** | **Writing tablet** (XPPen Star G640) — priority **#2**; pen input must not break when native toolbar hidden. **No Mynk pen-mode toggle** — native Excalidraw stylus path untouched (NR-03). | (i) + verify | Sarah-Chat L71; orchestrator F1; audit T-12 ratified 2026-06-08 |
| **TU-06** | **Waiting room** (when built): session chrome coexists with pre-session gate; timer starts after leave. | layout | Sarah-Chat L6–7; v1 §8 waiting room |
| **TU-07** | Join/share control labeled **"Share link"** (not "Copy student link"). | (ii) copy | 2026-06-06 U4; v1 workspace spec |
| **TU-08** | **Mic meter + device picker** in workspace chrome (not headless-only). | (ii) | whiteboard-smoke-log § W-audio pending |
| **TU-09** | **Session bar ~40px** + **bottom controls strip** (mic, cam, pages, share) per v1 wireframe — separate from tool chrome but one visual system. | (ii) | v1-component-redesign §5 Workspace |
| **TU-10** | **Eraser/delete** remains discoverable — Sarah likes delete (positive validation). Eraser stays **primary toolbar** control; **selected-element delete** via keyboard Delete **and** right-click/long-press **and** a buried visible button (TU-14 — not button-less). | (ii) | Sarah-Chat L8; audit P-24/NR-05 ratified 2026-06-08 |
| **TU-11** | **Keyboard-shortcut surface routing.** Canvas shortcuts (P, R, E, Delete, Ctrl/Cmd+Z, etc.) fire ONLY when the Excalidraw canvas has focus. Mynk chrome inputs (search/URL fields, insert modals, page strip, follow toggle, AV controls) must NOT steal or leak canvas shortcuts. Focus returns to canvas after Mynk modals/palettes close. No browser-chrome hijack (e.g. Ctrl+Z must never trigger browser back-navigation). Define tutor-desktop vs student-mobile parity for shortcut routing when native Excalidraw toolbar is hidden. Native pen/stylus preservation unchanged (TM-04 / TU-05). | (ii) + verify | TU-03; TB-11; TM-06; open Q8 |
| **TU-12** | **Theme parity: Mynk chrome + Excalidraw theme follow app light/dark selection.** Toolbar, pulldowns, properties popover, page strip, and bottom bars styled for **both** light and dark via v1 tokens (`tutor-desktop` + `student-mobile-first`). Site theme defaults to **OS/system** until user explicitly picks light or dark (A′). Excalidraw `theme` prop follows the **app-selected** theme. **Board background follows theme** — no native Excalidraw canvas-bg control (M-10 dropped; NR-04 resolved). Not the dev-only `?theme=` param. | (ii) | BACKLOG § V1 redesign; audit M-09/M-10 ratified 2026-06-08 |
| **TU-13** | **Whiteboard-local theme toggle** — a small theme toggle **on the whiteboard chrome itself** as an escape hatch (in addition to the global nav toggle). Lets tutor/student flip board theme without leaving the session surface. | (ii) | Audit NR-04 ratified 2026-06-08 |
| **TU-14** | **Every function has a visible button affordance.** No whiteboard function reachable **only** via right-click or **only** via hotkey. Right-click and keyboard shortcuts are **accelerators**, not sole paths. Includes z-order (send-to-back / bring-to-front via buried/More buttons **and** context-menu/long-press), delete-selected, and all style controls. **HARD z-order default (NR-11):** PDF pages deepest-z; all drawn elements render above PDFs. Buried-in-overflow/More is acceptable; button-less is not. Standing principle (Andrew 2026-06-08). | (ii) | Audit P-16–P-19/NR-11 ratification 2026-06-08; pairs with TM-10 |

### Performance / draw latency (sync hot path)

| ID | Requirement | Tag | Source |
|----|-------------|-----|--------|
| **PR-01** | **Freedraw must not regress draw latency** — pencil stroke must track the cursor instantly (Phase 0 POC parity). P1.1 chrome build **must land the sync hot-path fix** (Option A: stop per-pointer-move scene clone; defer `preserveImageAssetUrlsOnSceneWrite` to wire/checkpoint payloads only; Option E: `pointerup`/idle flush so last stroke segment is never dropped). Must respect all 22 sync invariants (esp. P5 `assetUrl` preservation before peer-visible snapshots). Gates: `npm run test:wb-sync` + `use-tutor-live-document-wire` cadence tests. **P1.1 executor tier: Sonnet** (Andrew 2026-06-08). | app-bug + (ii) | Andrew 2026-06-08; [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) §6 P1.1 acceptance gate; `BACKLOG.md` freedraw-latency row |

---

## Out of scope for this doc (tracked elsewhere)

| Topic | Track in |
|-------|----------|
| Sync-to-tutor / viewport centering bugs (B1–B4) | Wave 1 reliability; sync redesign |
| Ghost viewport rectangles when follow OFF (Andrew smoke 2026-05-27) | BACKLOG future polish — design optional |
| Session timer minutes-only, waiting room timer logic | Session lifecycle |
| Live A/V, camera permissions, device release | `LIVE-AV.md` |
| Native image insert bug (broken placeholders) | `BACKLOG.md` — implementation, not chrome layout |
| End-session discard / stop-and-delete | `BACKLOG.md` `pilot-2026-06-06` F1 |
| Student "Loading scene…" intermittent join | `BACKLOG.md`; ORCHESTRATOR-STATE |
| Student accounts + consent | Identity epic |

---

## Open design questions (for the chrome design pass)

**Resolved (design pass 2026-06-07 — detail in [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md)):**

1. ~~**Toolbar placement — tutor desktop:**~~ **RESOLVED → HYBRID** — slim top bar (~44px) session/insert/zoom + collapsible left tool strip + contextual properties popover.
5. ~~**Tutor-mobile variant:**~~ **RESOLVED → DEFER v1.1 + expectations notice** — see **TM-09** (pre-subscribe copy + host-time desktop-only gate).
7. ~~**Zen mode vs CSS hide:**~~ **RESOLVED → `zenModeEnabled` + scoped CSS** (zen alone insufficient). Do not pass `style` to `<Excalidraw>`.
12. ~~**Prototype / acceptance gate:**~~ **RESOLVED → fail-fast Phase 0 runtime POC** on Vercel preview before Phase 1 full build (sync-free throwaway); real-iPhone gate remains Phase 2.

**Resolved (audit ratification 2026-06-08 — detail in [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md)):**

2. ~~**Pulldown grouping / More styles:**~~ **RESOLVED → all-styles-tiered** — keep **ALL** native style props; primary-inline vs **More styles** overflow (**PP-04**); inserts on top bar per hybrid layout.
3. ~~**Properties compression:**~~ **RESOLVED → PP-04** — color, width, opacity (+ default roughness/roundness) inline; **every other** native style prop in More styles tier.
6. ~~**Laser pointer:**~~ **RESOLVED → V1 top-level toolbar slot** — **ST-05** reframe: verify alignment/visibility to student; fix if regressed (not deferred to Phase 3).
13. ~~**Pen mode:**~~ **RESOLVED → leave native, no Mynk control** (NR-03) — watch palm-rejection only.
14. ~~**Canvas background / theme on board:**~~ **RESOLVED → TU-12 + TU-13** — board bg follows app theme; whiteboard-local theme toggle on chrome.
15. ~~**Z-order / delete affordances:**~~ **RESOLVED → TU-14 + TM-10** — PDF deepest-z HARD default; visible buttons + context-menu/long-press for z-order and delete-selected.

**Still open:**

> **Pre-hide audit (2026-06-08):** [`whiteboard-excalidraw-function-audit-2026-06-08.md`](whiteboard-excalidraw-function-audit-2026-06-08.md) — ratified 2026-06-08; 5 remaining silently-lost items; NR-01, NR-07–NR-09, NR-12 still open.

4. **Student vs tutor tool parity:** v1 pencil+eraser only — revisit after Sarah tests student add-page.
8. **Keyboard shortcuts:** expose Excalidraw defaults (P, R, etc.) when native toolbar hidden? → see **TU-11** (surface routing + tutor-desktop vs student-mobile parity); shortcuts are accelerators per **TU-14**.
9. **Visual system:** every chrome control maps to v1 tokens — no one-off oversized buttons.
10. **PDF default fit:** tutor viewport vs student viewport on insert (BACKLOG open design row).
11. **Ghost peer viewport overlays** when follow is OFF — ship in chrome wave or defer?

---

## Sources swept (exhaustive `docs/` pass, 2026-06-07)

Broad case-insensitive ripgrep across **`docs/`** and **`docs/handoff/`** for whiteboard/chrome terms (`whiteboard`, `excalidraw`, `canvas`, `toolbar`, `palette`, `pen`, `stroke`, `eraser`, `zoom`, `touch`, `tablet`, `mobile`, `page strip`, `undo`, `redo`, `dropdown`, `Wyzant`, `Sarah`, etc.). Files below **contained Sarah and/or whiteboard control feedback** and were read for this roll-up.

### Primary Sarah voice (requirements origin)

| Doc | Date / note | Chrome feedback? |
|-----|-------------|------------------|
| [`docs/Sarah-Chat-05-26-2026.txt`](../Sarah-Chat-05-26-2026.txt) | 2026-05-26 raw smoke | **Yes** — toolbar order, dropdowns, defaults, palette dismiss, viewport, priorities |
| [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md) | 2026-05-26 | **Yes** — structured parse of raw chat + Wyzant image |
| [`docs/handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md) | 2026-06-06 | **Yes** — pen panel size, thinner stroke, canvas size, clutter, Ctrl+Z |
| [`docs/whiteboard-smoke-log.md`](../whiteboard-smoke-log.md) | Sarah **2026-04-24** | **Yes** — PDF page picker, phone photos, separate pages, reload essential |
| [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md) | Updated 2026-06-07 | **Yes** — feasibility answers for toolbar/palette (engineering capture) |

### Engineering captures + backlog (folded requirements)

| Doc | Date / note | Chrome feedback? |
|-----|-------------|------------------|
| [`docs/BACKLOG.md`](../BACKLOG.md) | Ongoing; pilot rows through 2026-06-07 | **Yes** — whiteboard queue, `pilot-2026-06-06`, Apr 24 undo, eraser, page insert order, recovery modal |
| [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) | 2026-06-07 custom-chrome § | **Yes** — LOCKED decision, Sarah UX table, Sarah pre-build Q&A |
| [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5 | 2026-06-07 | **Yes** — API feasibility constraint |
| [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) | Surface 5 | **Yes** — mobile layout architecture, palette I7 |
| [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) | §5 + §5.7 | **Yes** — workspace + student mobile wireframes |
| [`docs/handoff/whiteboard-sync-redesign-2026-05-27.md`](whiteboard-sync-redesign-2026-05-27.md) | 2026-06-07 correction | **Yes** — customization feasibility, I7 palette, eraser cursor class |
| [`docs/handoff/pdf-page-picker-and-per-page-boards-bootstrapper.md`](pdf-page-picker-and-per-page-boards-bootstrapper.md) | 2026-05-17 | **Yes** — Sarah Apr 24 PDF/page-strip UX spec |
| [`docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md`](reliability-redesign-2026-05-27-orchestrator-report.md) | 2026-05-27 | **Yes** — mobile redesign dispatch, Wyzant benchmark |
| [`docs/PHASE-2-IOS-SMOKE-MATRIX.md`](../PHASE-2-IOS-SMOKE-MATRIX.md) | S11 whiteboard | **Yes** — touch/undo/toolbar clip known-quirks |
| [`docs/V1-COMPONENT-LIBRARY.md`](../V1-COMPONENT-LIBRARY.md) | Chunk B5/B6 tracker | **Partial** — polish bar, whiteboard collision zone (live session files) |
| [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) | 2026-06-07 head | **Partial** — v1 UI pass, frozen WB bugs (Ctrl+Z, join loading) |
| [`docs/handoff/MORNING-RUNBOOK-2026-06-07.md`](MORNING-RUNBOOK-2026-06-07.md) | 2026-06-07 | **Partial** — pointer to 2026-06-06 Sarah capture |

### Swept — no additional Sarah chrome requirements

| Doc | Why checked |
|-----|-------------|
| `docs/handoff/whiteboard-regression-net-design-2026-05-30.md` | Viewport oracle / CI gate — no new Sarah UX |
| `docs/handoff/RETURN-RUNBOOK-2026-06-06-PM.md` | Recording smoke methodology |
| `docs/handoff/MORNING-SMOKE-RUNBOOK-2026-06-06.md` | Identity smoke; redesign pointers only |
| `docs/handoff/recording-rearchitecture-design-2026-06-05.md` | Toolbar pause recording — transport, not chrome layout |
| `docs/UX-AND-A11Y-SPEC.md` | Whiteboard keyboard exception §6.3 — no new Sarah asks |
| `docs/WHITEBOARD-ROADMAP-NEXT.md` | Superseded archive |
| `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md` | **On `master` only** (not yet on `v1-redesign` at sweep time) — Andrew settings-smoke notes; no new Sarah WB chrome |

### Net-new from sweep vs original hand-listed cross-refs

**Docs surfaced by sweep that were NOT in the original cross-ref list:**

1. **`docs/whiteboard-smoke-log.md`** — Sarah **2026-04-24** PDF page picker, phone photos, separate pages
2. **`docs/SARAH-CALL-PREP.md`** — 2026-06-07 feasibility lock for toolbar/palette
3. **`docs/handoff/whiteboard-sync-redesign-2026-05-27.md`** — 2026-06-07 custom-chrome API correction
4. **`docs/handoff/pdf-page-picker-and-per-page-boards-bootstrapper.md`** — page-strip section UX
5. **`docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md`** — mobile dispatch context
6. **`docs/PHASE-2-IOS-SMOKE-MATRIX.md`** — iOS toolbar clip, touch undo
7. **`docs/handoff/ORCHESTRATOR-STATE.md`** + **`MORNING-RUNBOOK-2026-06-07.md`** — triage pointers only

**Net-new requirements contributed by those docs (not in first consolidation pass):**

| ID | Requirement | Source doc |
|----|-------------|------------|
| TB-08 | Wyzant-style PDF page subset picker | whiteboard-smoke-log Apr 24 |
| TB-09 | Phone-photo image insert in toolbar | whiteboard-smoke-log Apr 24 |
| TB-10 | Desmos/graph toolbar affordance | orchestrator Q1 + smoke-log |
| TB-11 | Visible Undo/Redo in Mynk chrome | BACKLOG Apr 24 undo row |
| PU-04 | PDF insert modal chrome | pdf-page-picker bootstrapper |
| PP-05 | Single restore story vs Excalidraw recovery modal | BACKLOG + smoke-log |
| DD-05 | PDF zoom-to-fit default (tutor vs student TBD) | BACKLOG PDF-fit row |
| TM-06 | iOS touch undo/redo verify | BACKLOG + iOS matrix |
| TM-07 | iOS touch drawing / palm rejection | iOS matrix §7 |
| TM-08 | Eraser cursor alignment | BACKLOG + sync-redesign |
| SR-10 | Page strip PDF section headers | smoke-log + pdf bootstrapper |
| SR-11 | Page insert order UX | BACKLOG smoke 2026-05-30 |
| SR-12 | iOS toolbar clip / dvh | iOS matrix §7 |
| ST-06 | Student page strip mirrors section grouping | pdf bootstrapper |
| TU-07 | "Share link" label | 2026-06-06 (in first pass indirectly; now explicit) |
| TU-08 | Mic meter + picker in workspace chrome | whiteboard-smoke-log W-audio |
| TU-09 | Session bar + bottom controls visual system | v1 §5 (expanded) |
| TU-10 | Eraser/delete discoverable | Sarah-Chat L8 |
| TU-12 | Theme parity — Mynk chrome + Excalidraw follow app toggle | BACKLOG § V1 redesign; V1-COMPONENT-LIBRARY §2.11 |
| TU-13 | Whiteboard-local theme toggle on chrome | Audit NR-04 ratified 2026-06-08 |
| TU-14 | Every-function-has-a-button + PDF deepest-z z-order | Audit ratification 2026-06-08 |
| TM-10 | Full touch parity for all chrome controls | Audit ratification 2026-06-08 |

---

## Cross-links

- **Design (ratified 2026-06-07):** [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) — hybrid layout, forks, phasing, POC gate
- Implementation status: [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) § Sarah UX asks + custom chrome decision
- Backlog rows: [`docs/BACKLOG.md`](../BACKLOG.md) § Whiteboard — implementation / design queue
- Excalidraw API constraint: [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §7.5
- Student mobile layout shell: [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) §5.7
- Mobile viewport architecture: [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) Surface 5

---

## Requirement count

| Category | Distinct requirements |
|----------|----------------------:|
| Toolbar / tool-set & ordering | 11 |
| Pulldown / consolidation | 4 |
| Properties palette | 5 |
| Drawing defaults | 5 |
| Touch / mobile-tablet | 10 |
| Screen real estate / responsive | 12 |
| Student-WB-specific | 6 |
| Tutor-WB-specific | 14 |
| Performance / draw latency | 1 |
| **Total** | **68** |
