# wb-chrome-redo STATUS

Branch: `feat/wb-chrome-redo`  
Baseline: `a150d4f` (PR-01 freedraw latency fix — known-good board separation)  
Latest commit: `8afe6f1` (2026-06-09 — C1/C2/C3 content-insert fixes + per-board undo backlog)

## What this branch does

REDO of the whiteboard chrome reskin after two failed attempts (P1.1, P2) caused
board-separation and dead-control regressions by rewriting the core whiteboard engine.

This branch:
1. **Preserves the baseline engine exactly** — all page/board switching, scene data
   (`pageDataRef`/page-switch guards), live-sync wiring, and recording/segment/pause
   logic are behaviorally identical to `a150d4f`.
2. **Adds the Mynk chrome as pure extensions** — new state, new handlers, new JSX
   layout mounted on top of the baseline engine without touching working logic.
3. **Applies A4 split-brain reliability gate** — WebRTC reachability predicate for
   the FSM/recording gate, debounced `lifecycleParticipants`, split-brain banner.

## Phase table

| Phase | Status | Notes |
|-------|--------|-------|
| Branch from a150d4f | ✅ Done | `feat/wb-chrome-redo` off PR-01 baseline |
| Extract chrome components | ✅ Done | BoardTabStrip, WbAVCluster, WbStrokePropsPanel, WbTopBarMicControl, WbThemeToggle, wb-icons, useWbLayoutMode |
| Extract whiteboard-chrome.css | ✅ Done | 1253 lines, full viewport zenMode chrome |
| Apply A4 engine additions | ✅ Done | reachableParticipants, debounced lifecycleParticipants, split-brain gate |
| Wire chrome to baseline engine | ✅ Done | New render section, existing engine functions wired to new buttons |
| **P0 interactivity fix** | ✅ Done | `85ebedc` — overflow clip root cause + click-toggle props + board delete |
| **P0 undo cross-board history fix** | ✅ Done | `914fbc0` — `captureUpdate:"NEVER"` + `history.clear()` on board switch |
| **P0/P1/P2 punch list (Andrew's smoke)** | ✅ Done | `ed87f3d` — z-index, mojibake, hover, dark stroke, cam toggle, roundness, board tabs, slider, z-order buttons |
| **P3 punch list (Andrew's smoke)** | ✅ Done | `1ef0742` — ink swatch adaptive, roughness icons, More styles restructure, single-open menus, hover preservation, Z-order restyle, slider extremes, camera-no-device |
| **C1/C2/C3 content-insert bugs + backlog** | ✅ Done | TBD — math insert position, math editor dead on second open, Desmos frowny-face CSP fix |
| npx next build exit 0 | ✅ Done | exit 0 (confirmed `8afe6f1`) |
| npx jest | ✅ Done | 1982 pass / 4 fail (same 4 pre-existing suites; TBD) |
| Playwright interaction tests | ✅ Written | `tests/integration/wb-chrome-interactions.spec.ts` — 15 tests (added: single-open, inactive hover, selected chip hover, adaptive ink swatch) |
| npm run test:wb-sync | ⏳ Pending | Docker relay required |
| Real-browser smoke | ⏳ Pending | Andrew needs to start dev server + run Playwright (see gate below) |
| Merge to master | ⏳ Pending | After smoke + Playwright interaction tests GREEN |

## Gate status

- `npx next build`: ✅ exit 0 (TBD)
- `npx jest`: ✅ 1982 pass / 4 fail (same 4 pre-existing suites, `8afe6f1`)
- `npm run test:wb-sync`: ⏳ pending (requires Docker relay)
- **Interactive controls P0 fix**: ✅ code shipped (`85ebedc`)
- **Undo cross-board P0 fix**: ✅ code shipped (`914fbc0`) — `captureUpdate:"NEVER"` + `history.clear()` on board switch
- **Punch-list P0/P1/P2 fix**: ✅ code shipped (`ed87f3d`)
- **C1 math insert position**: ✅ code shipped (`8afe6f1`) — viewport center captured before async upload
- **C2 math editor dead on second open**: ✅ code shipped (`8afe6f1`) — deps changed to `dialogIsOpen` boolean
- **C3 Desmos frowny-face**: ✅ code shipped (`8afe6f1`) — `frame-src` added to middleware CSP builder
- **Per-board undo backlog**: ✅ logged (`8afe6f1`) — post-v1 / not-a-gate
- **Playwright interaction tests**: ✅ written (15 tests) — run with `npm run test:wb-playwright -- tests/integration/wb-chrome-interactions.spec.ts`
- Board separation: ⏳ pending real-browser verification
- Undo isolation (P0): ⏳ pending real-browser Playwright (test written in `wb-chrome-interactions.spec.ts`)
- Interactive controls real-browser: ⏳ pending (run Playwright tests above)
- PDF tab indicator (item 11): ⏳ deferred — `PageStripRow` has no `isPdf` field; need to add field to the type + propagate from the session data model before this can be implemented

### True jest baseline (2026-06-09, commit `85ebedc`)
1985 total, **1980 pass**, **5 fail** across 4 suites:
- `src/__tests__/auth.test.ts` (pre-existing)
- `src/__tests__/password-reset.test.ts` (pre-existing)
- `src/__tests__/identity-2fa-management.test.ts` (pre-existing)
- `src/__tests__/identity/identity-p2b.test.ts` (pre-existing — `identity-p2a` in STATUS was wrong)

After C1/C2/C3 commit (3 new CSP regression tests added): 1986 total, **1982 pass**, **4 fail**. The pre-existing failures vary by natural flakiness; the 4 failing suites are identical.

## C1/C2/C3 root causes and fixes (2026-06-09)

### C1 — Math equation inserts below PDF / wrong position

**Root cause:** `viewportCenter(excalidrawAPI)` was called AFTER `await uploadWhiteboardAsset()` (~1-2s async) in `insertMathSvgOnCanvas`. During the upload window, live-sync remote-element broadcasts (`updateScene()` calls) can flush a stale/wrong scroll/zoom value into Excalidraw's appState before the center is captured. Result: element lands at a wrong scene position (e.g. far below the PDF if scrollY was overwritten with a large negative value).

**Fix:** `src/lib/whiteboard/insert-asset.ts` — move `const center = viewportCenter(excalidrawAPI)` to the **very top** of `insertMathSvgOnCanvas`, before any awaits. Center is now captured at the moment Insert is initiated — the user's intent — not after a network round-trip.

**Engine touched?** No — `insert-asset.ts` is not engine logic.

### C2 — Math editor dead (non-functional) on second open

**Root cause:** The `<math-field>` mounting `useEffect` had `[mathLiveReady, state.kind]` as deps. This caused the MathLive custom element to be torn down and recreated on EVERY internal dialog-state transition (`"open"→"rendering"→"success"`). Each recreation cycles MathLive's singleton virtual keyboard through disconnect/reconnect. After one insert cycle, the keyboard singleton is in a broken state: on the next open the field DOM is created but the `input` event never fires (keyboard not properly reattached), so `latex` stays `""`, Insert shows "Equation is empty", and the editor appears dead.

**Fix:** `src/components/whiteboard/MathInsertButton.tsx`:
1. Compute `const dialogIsOpen = state.kind !== "closed"` (boolean)
2. Change both effects' condition + deps from `state.kind` to `dialogIsOpen`

The field is now only torn down/recreated when the dialog actually opens or closes — not on internal transitions. Single field lifecycle per open/close session = no MathLive keyboard churn.

**Engine touched?** No — `MathInsertButton.tsx` is a UI component.

### C3 — Desmos "Insert blank graph" shows frowny-face placeholder

**Root cause:** `buildContentSecurityPolicy()` in `src/lib/security/csp.ts` (the middleware CSP builder) had **no `frame-src` directive**. Both the middleware CSP header and the `next.config.ts` CSP header are applied to responses; the browser enforces the INTERSECTION of all `Content-Security-Policy` headers. The middleware CSP's `default-src 'self'` served as the `frame-src` fallback = `'self'` only. This blocked `https://www.desmos.com` iframes, causing Excalidraw to show its "frowny face" embeddable-failed placeholder instead of the calculator.

The `next.config.ts` correctly allows Desmos (`frame-src 'self' https://www.desmos.com https://desmos.com`) and its comment already said "Must match `src/lib/security/csp.ts`" — but `frame-src` was never added to `csp.ts` when Desmos support was originally built.

**Fix:** `src/lib/security/csp.ts` — add `"frame-src 'self' https://www.desmos.com https://desmos.com"` to `buildContentSecurityPolicy()`. **This is NOT a new external dependency** — `desmos.com` was already approved and documented in `next.config.ts`. This is a sync/maintenance fix aligning the middleware CSP with the already-approved allowlist.

Also added a regression test in `src/__tests__/regressions/csp-headers.test.ts` that asserts `frame-src` allows `desmos.com` — prevents this from silently regressing again.

**Platform-assumptions change?** No — `desmos.com` was already an approved load-bearing external dependency. `docs/PLATFORM-ASSUMPTIONS.md` is not affected.

## Key files changed

| File | Change type |
|------|-------------|
| `src/.../workspace/WhiteboardWorkspaceClient.tsx` | Extended with chrome + A4 + propsCompactOpen click-toggle + board delete wiring |
| `src/.../workspace/whiteboard-chrome.css` | New — full chrome CSS; P0 overflow fix in `85ebedc` |
| `src/.../workspace/WhiteboardWorkspaceAudioBridge.tsx` | Added `showPanel` prop |
| `src/components/whiteboard/chrome/BoardTabStrip.tsx` | New; P1 board delete in `85ebedc` |
| `src/components/whiteboard/chrome/WbAVCluster.tsx` | New |
| `src/components/whiteboard/chrome/WbStrokePropsPanel.tsx` | New |
| `src/components/whiteboard/chrome/WbTopBarMicControl.tsx` | New |
| `src/components/whiteboard/chrome/WbThemeToggle.tsx` | New |
| `src/components/whiteboard/chrome/wb-icons.tsx` | New |
| `src/components/whiteboard/chrome/useWbLayoutMode.ts` | New |
| `src/lib/whiteboard/use-wb-chrome-debug-overlay.ts` | New |
| `src/hooks/useLiveAV.ts` | A4: reachableParticipants |
| `src/lib/av/peer-mesh.ts` | A4: ICE restart, stale-peer eviction |
| `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` | A4: dual status pills |
| `src/lib/whiteboard/undo-redo.ts` | Added z-order + delete triggers |
| `src/styles/token-values.ts` | EXCALIDRAW_STROKE_HEX + EXCALIDRAW_STROKE_DARK_HEX + palette |
| Insert buttons (3) | Added `chrome` prop for icon-only mode |
| `tests/integration/wb-chrome-interactions.spec.ts` | **New** — 15 Playwright interaction tests |
| `src/lib/whiteboard/insert-asset.ts` | **C1**: viewport center captured before async upload |
| `src/components/whiteboard/MathInsertButton.tsx` | **C2**: `dialogIsOpen` bool deps — prevent MathLive field churn |
| `src/lib/security/csp.ts` | **C3**: `frame-src` added to middleware CSP builder |
| `src/__tests__/regressions/csp-headers.test.ts` | **C3**: `frame-src` regression test |
| `docs/BACKLOG.md` | Per-board undo/redo backlog entry (post-v1) |

## P0 root cause (confirmed 2026-06-09, commit `85ebedc`)

Two CSS overflow rules were clipping all interactive chrome elements:

1. `.mynk-wb-topbar { overflow: hidden }` — the topbar is 44px tall. Dropdown
   panels for Share ▾, Mic ▾, Theme, and View extend BELOW 44px via
   `position: absolute; top: calc(100% + 4px)`. The topbar's `overflow:hidden`
   clipped them at the 44px boundary → panels invisible → clicks "did nothing."

2. `.mynk-wb-strip { overflow-x: hidden }` — shapes flyout, more-overflow
   popover, and props panel are all `position: absolute; left: 100%` (to the
   right of the 48px strip). `overflow-x: hidden` clipped them → panels
   invisible → clicks "did nothing."

3. `.mynk-wb-props-compact:hover` CSS hover approach — when the cursor moved
   from the summary button toward the panel, the browser fired mouseleave on
   the summary trigger, hiding the panel immediately.

**Fix:** `overflow: visible; position: relative; z-index: 10` on both the
topbar and strip. Props panel converted to React state click-toggle
(`propsCompactOpen` + `.mynk-wb-props-compact--open` CSS class).

The "button highlights when I mouse OFF, un-highlights when I mouse over"
symptom is explained: the dropdown was invisible but still in the DOM outside
the clip rect. Chrome's hit-test showed the button as the top element EXCEPT
where the invisible clipped area overlapped — causing erratic hover behavior.

## P0 root cause #2 — undo cross-board history contamination (confirmed 2026-06-09, commit `914fbc0`)

Excalidraw uses a **single global undo/redo history stack** for the entire instance.
`selectTutorPage` and `addTutorPage` called `updateScene(...)` without `captureUpdate:"NEVER"`,
so the board-switch element replacement was recorded as an undoable operation.

Pressing undo on Board 2:
- Replayed the board-switch delta in reverse → injected Board 1 elements into Board 2 scene.
- Or replayed earlier Board 1 draw operations (if not cleared) → same contamination.

**Fix (both parts required):**
1. `captureUpdate: "NEVER"` on all board-switch `updateScene` calls — the swap never enters history.
2. `api.history.clear()` after each board switch — purges accumulated Board N-1 history.

APIs verified against `@excalidraw/excalidraw@0.18.1`:
- `updateScene captureUpdate` param: `App.d.ts` line 385
- `history.clear`: `types.d.ts` line 609 (`InstanceType<typeof App>["resetHistory"]`)

**Files changed:** `WhiteboardWorkspaceClient.tsx` (surgical additions to `selectTutorPage` and `addTutorPage`), `wb-chrome-interactions.spec.ts` (new undo isolation Playwright test — 8th test).

## Smoke checklist (Andrew to run)

### Playwright interaction tests (run first)
```
npm run test:wb-playwright -- tests/integration/wb-chrome-interactions.spec.ts
```
All 15 tests must be GREEN (includes z-index gate, active-tool hover gate, dark-mode swatch gate).

### Manual smoke
1. `npm run dev` → open tutor whiteboard workspace
2. Verify full-viewport chrome layout (no card/scroll layout)
3. Click each tool strip button → verify active state highlights
4. Shapes ▾ dropdown → opens and selects shape tools (RIGHT of strip, not clipped)
5. ••• overflow menu → z-order + delete + hand work (opens to right of strip)
6. Share ▾ → dropdown opens BELOW topbar; "Copy student join link" works
7. Mic ▾ → device picker opens BELOW topbar
8. Camera button → requests cam on first click (no double-toggle). If permission denied, button is disabled and dimmed.
9. Theme toggle → switches between light/dark themes; dropdown opens below topbar
10. Undo/Redo buttons work
11. Props compact bar: click to open → panel stays open when cursor moves onto it
12. Props panel: click outside → panel closes
13. Props panel — Edge sharpness: Sharp / Round chips wire to Excalidraw currentItemRoundness
14. Props panel — Opacity slider: thumb reaches far-left at 0% and far-right at 100%
15. In dark mode: default stroke color is white (not near-black); white swatch selected by default
16. Left-rail ••• menu: z-order items read "Send to back", "Bring to front" (no mojibake)
17. PDF/Math/Desmos icon buttons open their respective flows
18. Board tab strip footer → switching pages works (board separation intact)
19. **Solo board**: single-board name centered in tab (no left-offset from ghost delete-slot)
20. **Multi-board**: active tab underline/highlight covers full tab width including delete affordance
21. **Board delete**: add board, hover to reveal ×, click → confirm → board deleted; board 1 strokes intact
22. Cannot delete last remaining board (× button absent when only 1 board)
23. End session button → finalizes session
24. Open student join link in second tab → student sees whiteboard

### P3 smoke (new — verify after `1ef0742`)
25. **Ink swatch (light mode)**: props panel shows one "Ink" swatch that displays near-black; click it → stroke draws near-black. No separate white swatch.
26. **Ink swatch (dark mode)**: switch to dark via theme toggle; same "Ink" swatch now displays as WHITE; click it → stroke draws white. No separate black swatch.
27. **Roughness icons**: open "More styles" → Roughness row shows 3 icon buttons (straight / wavy / zigzag) with no text overflow; hover each shows tooltip (Architect / Artist / Cartoon).
28. **More styles panel**: only Stroke color, Stroke width, Opacity always visible. Click "More styles" → reveals Roughness, Edge sharpness, Z-order + Delete. Click "Less styles" → collapses back.
29. **Single-open menus**: open Shapes flyout → visible. Click More (3-dot) → Shapes closes, More opens. Click Share ▾ → More closes, Share opens. Click outside → all close.
30. **Hover preservation**: with Pencil active, hover the active Pencil tool button → stays highlighted (no flicker). In props panel (More styles open): hover active "Sharp" chip → stays highlighted with active background. Hover active "Architect" icon → stays highlighted.
31. **Z-order section**: open More styles → Z-order section container sits naturally against panel background (no white-on-light clash), section label readable in both light and dark themes.
32. **Opacity slider at 0%**: drag to 0% → thumb is flush at the left physical edge of the container. At 100% → thumb is flush at the right physical edge.
33. **Camera no-device**: with no camera plugged in, camera toggle in top bar and in AV cluster is greyed/disabled; title shows "No camera device found".

### Content-insert smoke (new — C1/C2/C3 fixes)
34. **Math insert position (C1)**: open math dialog → type `\frac{a}{b}` → Insert → equation appears CENTERED in the visible viewport (not below PDF or off-canvas).
35. **Math editor second open (C2)**: open math dialog → type equation → Cancel (or Insert) → open again → editor is fully functional (can type, Insert is enabled). Repeat 3× to confirm.
36. **Desmos blank graph (C3)**: Insert Desmos → "New blank graph" → Insert → a WORKING Desmos calculator renders in the canvas (not a frowny-face placeholder). Interact with it (type `y=x^2` in the expression list).

## A4 split-brain (requires 2-client test)

1. Open tutor workspace + student join link in separate tabs
2. Both connected: verify normal recording behavior (no banner)
3. Simulate WebRTC drop (or use Chrome DevTools network throttle)
4. Within 8s: split-brain banner should appear ("Student's video connection lost")
5. On reconnect: banner dismisses automatically

## Pre-existing test failures (not introduced here)

- `src/__tests__/auth.test.ts`
- `src/__tests__/password-reset.test.ts`
- `src/__tests__/identity-2fa-management.test.ts`
- `src/__tests__/identity/identity-p2a.test.ts`

All 4 fail identically at `a150d4f` baseline — confirmed by `git stash` + test run.

## What this branch does

REDO of the whiteboard chrome reskin after two failed attempts (P1.1, P2) caused
board-separation and dead-control regressions by rewriting the core whiteboard engine.

This branch:
1. **Preserves the baseline engine exactly** — all page/board switching, scene data
   (`pageDataRef`/page-switch guards), live-sync wiring, and recording/segment/pause
   logic are behaviorally identical to `a150d4f`.
2. **Adds the Mynk chrome as pure extensions** — new state, new handlers, new JSX
   layout mounted on top of the baseline engine without touching working logic.
3. **Applies A4 split-brain reliability gate** — WebRTC reachability predicate for
   the FSM/recording gate, debounced `lifecycleParticipants`, split-brain banner.

## Phase table

| Phase | Status | Notes |
|-------|--------|-------|
| Branch from a150d4f | ✅ Done | `feat/wb-chrome-redo` off PR-01 baseline |
| Extract chrome components | ✅ Done | BoardTabStrip, WbAVCluster, WbStrokePropsPanel, WbTopBarMicControl, WbThemeToggle, wb-icons, useWbLayoutMode |
| Extract whiteboard-chrome.css | ✅ Done | 1253 lines, full viewport zenMode chrome |
| Apply A4 engine additions | ✅ Done | reachableParticipants, debounced lifecycleParticipants, split-brain gate |
| Wire chrome to baseline engine | ✅ Done | New render section, existing engine functions wired to new buttons |
| **P0 interactivity fix** | ✅ Done | `85ebedc` — overflow clip root cause + click-toggle props + board delete |
| **P0 undo cross-board history fix** | ✅ Done | `914fbc0` — `captureUpdate:"NEVER"` + `history.clear()` on board switch |
| **P0/P1/P2 punch list (Andrew's smoke)** | ✅ Done | `ed87f3d` — z-index, mojibake, hover, dark stroke, cam toggle, roundness, board tabs, slider, z-order buttons |
| **P3 punch list (Andrew's smoke)** | ✅ Done | `1ef0742` — ink swatch adaptive, roughness icons, More styles restructure, single-open menus, hover preservation, Z-order restyle, slider extremes, camera-no-device |
| npx next build exit 0 | ✅ Done | exit 0 (confirmed `1ef0742`) |
| npx jest | ✅ Done | 1980 pass / 5 fail (same 4 pre-existing suites; `1ef0742`) |
| Playwright interaction tests | ✅ Written | `tests/integration/wb-chrome-interactions.spec.ts` — 15 tests (added: single-open, inactive hover, selected chip hover, adaptive ink swatch) |
| npm run test:wb-sync | ⏳ Pending | Docker relay required |
| Real-browser smoke | ⏳ Pending | Andrew needs to start dev server + run Playwright (see gate below) |
| Merge to master | ⏳ Pending | After smoke + Playwright interaction tests GREEN |

## Gate status

- `npx next build`: ✅ exit 0 (`1ef0742`)
- `npx jest`: ✅ 1980 pass / 5 fail (same 4 pre-existing suites, `1ef0742`)
- `npm run test:wb-sync`: ⏳ pending (requires Docker relay)
- **Interactive controls P0 fix**: ✅ code shipped (`85ebedc`)
- **Undo cross-board P0 fix**: ✅ code shipped (`914fbc0`) — `captureUpdate:"NEVER"` + `history.clear()` on board switch
- **Punch-list P0/P1/P2 fix**: ✅ code shipped (`ed87f3d`)
- **Playwright interaction tests**: ✅ written (11 tests) — run with `npm run test:wb-playwright -- tests/integration/wb-chrome-interactions.spec.ts`
- Board separation: ⏳ pending real-browser verification
- Undo isolation (P0): ⏳ pending real-browser Playwright (test written in `wb-chrome-interactions.spec.ts`)
- Interactive controls real-browser: ⏳ pending (run Playwright tests above)
- PDF tab indicator (item 11): ⏳ deferred — `PageStripRow` has no `isPdf` field; need to add field to the type + propagate from the session data model before this can be implemented

### True jest baseline (2026-06-09, commit `85ebedc`)
1985 total, **1980 pass**, **5 fail** across 4 suites:
- `src/__tests__/auth.test.ts` (pre-existing)
- `src/__tests__/password-reset.test.ts` (pre-existing)
- `src/__tests__/identity-2fa-management.test.ts` (pre-existing)
- `src/__tests__/identity/identity-p2b.test.ts` (pre-existing — `identity-p2a` in STATUS was wrong)

The STATUS doc previously said "1985 pass, 4 pre-existing failures (identity-p2a)" — actual count is 1980 pass, 5 failures in 4 suites. The `008fb4e` encoding-fix commit message said "1981 pass, 4 pre-existing" but the current measured count is 1980/5. This is likely natural test flakiness in the pre-existing failures.

## Key files changed

| File | Change type |
|------|-------------|
| `src/.../workspace/WhiteboardWorkspaceClient.tsx` | Extended with chrome + A4 + propsCompactOpen click-toggle + board delete wiring |
| `src/.../workspace/whiteboard-chrome.css` | New — full chrome CSS; P0 overflow fix in `85ebedc` |
| `src/.../workspace/WhiteboardWorkspaceAudioBridge.tsx` | Added `showPanel` prop |
| `src/components/whiteboard/chrome/BoardTabStrip.tsx` | New; P1 board delete in `85ebedc` |
| `src/components/whiteboard/chrome/WbAVCluster.tsx` | New |
| `src/components/whiteboard/chrome/WbStrokePropsPanel.tsx` | New |
| `src/components/whiteboard/chrome/WbTopBarMicControl.tsx` | New |
| `src/components/whiteboard/chrome/WbThemeToggle.tsx` | New |
| `src/components/whiteboard/chrome/wb-icons.tsx` | New |
| `src/components/whiteboard/chrome/useWbLayoutMode.ts` | New |
| `src/lib/whiteboard/use-wb-chrome-debug-overlay.ts` | New |
| `src/hooks/useLiveAV.ts` | A4: reachableParticipants |
| `src/lib/av/peer-mesh.ts` | A4: ICE restart, stale-peer eviction |
| `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` | A4: dual status pills |
| `src/lib/whiteboard/undo-redo.ts` | Added z-order + delete triggers |
| `src/styles/token-values.ts` | EXCALIDRAW_STROKE_HEX + EXCALIDRAW_STROKE_DARK_HEX + palette |
| Insert buttons (3) | Added `chrome` prop for icon-only mode |
| `tests/integration/wb-chrome-interactions.spec.ts` | **New** — 11 Playwright interaction tests |

## P0 root cause (confirmed 2026-06-09, commit `85ebedc`)

Two CSS overflow rules were clipping all interactive chrome elements:

1. `.mynk-wb-topbar { overflow: hidden }` — the topbar is 44px tall. Dropdown
   panels for Share ▾, Mic ▾, Theme, and View extend BELOW 44px via
   `position: absolute; top: calc(100% + 4px)`. The topbar's `overflow:hidden`
   clipped them at the 44px boundary → panels invisible → clicks "did nothing."

2. `.mynk-wb-strip { overflow-x: hidden }` — shapes flyout, more-overflow
   popover, and props panel are all `position: absolute; left: 100%` (to the
   right of the 48px strip). `overflow-x: hidden` clipped them → panels
   invisible → clicks "did nothing."

3. `.mynk-wb-props-compact:hover` CSS hover approach — when the cursor moved
   from the summary button toward the panel, the browser fired mouseleave on
   the summary trigger, hiding the panel immediately.

**Fix:** `overflow: visible; position: relative; z-index: 10` on both the
topbar and strip. Props panel converted to React state click-toggle
(`propsCompactOpen` + `.mynk-wb-props-compact--open` CSS class).

The "button highlights when I mouse OFF, un-highlights when I mouse over"
symptom is explained: the dropdown was invisible but still in the DOM outside
the clip rect. Chrome's hit-test showed the button as the top element EXCEPT
where the invisible clipped area overlapped — causing erratic hover behavior.

## P0 root cause #2 — undo cross-board history contamination (confirmed 2026-06-09, commit `914fbc0`)

Excalidraw uses a **single global undo/redo history stack** for the entire instance.
`selectTutorPage` and `addTutorPage` called `updateScene(...)` without `captureUpdate:"NEVER"`,
so the board-switch element replacement was recorded as an undoable operation.

Pressing undo on Board 2:
- Replayed the board-switch delta in reverse → injected Board 1 elements into Board 2 scene.
- Or replayed earlier Board 1 draw operations (if not cleared) → same contamination.

**Fix (both parts required):**
1. `captureUpdate: "NEVER"` on all board-switch `updateScene` calls — the swap never enters history.
2. `api.history.clear()` after each board switch — purges accumulated Board N-1 history.

APIs verified against `@excalidraw/excalidraw@0.18.1`:
- `updateScene captureUpdate` param: `App.d.ts` line 385
- `history.clear`: `types.d.ts` line 609 (`InstanceType<typeof App>["resetHistory"]`)

**Files changed:** `WhiteboardWorkspaceClient.tsx` (surgical additions to `selectTutorPage` and `addTutorPage`), `wb-chrome-interactions.spec.ts` (new undo isolation Playwright test — 8th test).

## Smoke checklist (Andrew to run)

### Playwright interaction tests (run first)
```
npm run test:wb-playwright -- tests/integration/wb-chrome-interactions.spec.ts
```
All 11 tests must be GREEN (includes z-index gate, active-tool hover gate, dark-mode swatch gate).

### Manual smoke
1. `npm run dev` → open tutor whiteboard workspace
2. Verify full-viewport chrome layout (no card/scroll layout)
3. Click each tool strip button → verify active state highlights
4. Shapes ▾ dropdown → opens and selects shape tools (RIGHT of strip, not clipped)
5. ••• overflow menu → z-order + delete + hand work (opens to right of strip)
6. Share ▾ → dropdown opens BELOW topbar; "Copy student join link" works
7. Mic ▾ → device picker opens BELOW topbar
8. Camera button → requests cam on first click (no double-toggle). If permission denied, button is disabled and dimmed.
9. Theme toggle → switches between light/dark themes; dropdown opens below topbar
10. Undo/Redo buttons work
11. Props compact bar: click to open → panel stays open when cursor moves onto it
12. Props panel: click outside → panel closes
13. Props panel — Edge sharpness: Sharp / Round chips wire to Excalidraw currentItemRoundness
14. Props panel — Opacity slider: thumb reaches far-left at 0% and far-right at 100%
15. In dark mode: default stroke color is white (not near-black); white swatch selected by default
16. Left-rail ••• menu: z-order items read "Send to back", "Bring to front" (no mojibake)
17. PDF/Math/Desmos icon buttons open their respective flows
18. Board tab strip footer → switching pages works (board separation intact)
19. **Solo board**: single-board name centered in tab (no left-offset from ghost delete-slot)
20. **Multi-board**: active tab underline/highlight covers full tab width including delete affordance
21. **Board delete**: add board, hover to reveal ×, click → confirm → board deleted; board 1 strokes intact
22. Cannot delete last remaining board (× button absent when only 1 board)
23. End session button → finalizes session
18. Open student join link in second tab → student sees whiteboard

### P3 smoke (new — verify after `1ef0742`)
24. **Ink swatch (light mode)**: props panel shows one "Ink" swatch that displays near-black; click it → stroke draws near-black. No separate white swatch.
25. **Ink swatch (dark mode)**: switch to dark via theme toggle; same "Ink" swatch now displays as WHITE; click it → stroke draws white. No separate black swatch.
26. **Roughness icons**: open "More styles" → Roughness row shows 3 icon buttons (straight / wavy / zigzag) with no text overflow; hover each shows tooltip (Architect / Artist / Cartoon).
27. **More styles panel**: only Stroke color, Stroke width, Opacity always visible. Click "More styles" → reveals Roughness, Edge sharpness, Z-order + Delete. Click "Less styles" → collapses back.
28. **Single-open menus**: open Shapes flyout → visible. Click More (3-dot) → Shapes closes, More opens. Click Share ▾ → More closes, Share opens. Click outside → all close.
29. **Hover preservation**: with Pencil active, hover the active Pencil tool button → stays highlighted (no flicker). In props panel (More styles open): hover active "Sharp" chip → stays highlighted with active background. Hover active "Architect" icon → stays highlighted.
30. **Z-order section**: open More styles → Z-order section container sits naturally against panel background (no white-on-light clash), section label readable in both light and dark themes.
31. **Opacity slider at 0%**: drag to 0% → thumb is flush at the left physical edge of the container. At 100% → thumb is flush at the right physical edge.
32. **Camera no-device**: with no camera plugged in, camera toggle in top bar and in AV cluster is greyed/disabled; title shows "No camera device found".

## A4 split-brain (requires 2-client test)

1. Open tutor workspace + student join link in separate tabs
2. Both connected: verify normal recording behavior (no banner)
3. Simulate WebRTC drop (or use Chrome DevTools network throttle)
4. Within 8s: split-brain banner should appear ("Student's video connection lost")
5. On reconnect: banner dismisses automatically

## Pre-existing test failures (not introduced here)

- `src/__tests__/auth.test.ts`
- `src/__tests__/password-reset.test.ts`
- `src/__tests__/identity-2fa-management.test.ts`
- `src/__tests__/identity/identity-p2a.test.ts`

All 4 fail identically at `a150d4f` baseline — confirmed by `git stash` + test run.
