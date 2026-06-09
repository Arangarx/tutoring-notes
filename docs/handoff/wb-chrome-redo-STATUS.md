# wb-chrome-redo STATUS

Branch: `feat/wb-chrome-redo`  
Baseline: `a150d4f` (PR-01 freedraw latency fix — known-good board separation)  
Commit: `008fb4e`  
Date: 2026-06-09

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
| npx next build exit 0 | ✅ Done | 37s build, route table printed |
| npx jest | ✅ Done | 1985 pass, 4 pre-existing failures (auth/2fa/identity-p2a at baseline) |
| npm run test:wb-sync | ⏳ Pending | Docker relay required |
| Real-browser smoke | ⏳ Pending | Andrew needs to start dev server and verify |
| Merge to master | ⏳ Pending | After smoke pass |

## Gate status

- `npx next build`: ✅ exit 0
- `npx jest`: ✅ 1985/1985 (4 pre-existing failures unchanged from baseline)
- `npm run test:wb-sync`: ⏳ pending (requires Docker relay)
- Board separation: ⏳ pending real-browser verification
- Interactive controls: ⏳ pending real-browser verification

## Key files changed

| File | Change type |
|------|-------------|
| `src/.../workspace/WhiteboardWorkspaceClient.tsx` | Extended with chrome + A4 |
| `src/.../workspace/whiteboard-chrome.css` | New — full chrome CSS |
| `src/.../workspace/WhiteboardWorkspaceAudioBridge.tsx` | Added `showPanel` prop |
| `src/components/whiteboard/chrome/BoardTabStrip.tsx` | New |
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
| `src/styles/token-values.ts` | EXCALIDRAW_STROKE_HEX + palette |
| Insert buttons (3) | Added `chrome` prop for icon-only mode |

## Smoke checklist (Andrew to run)

1. `npm run dev` → open tutor whiteboard workspace
2. Verify full-viewport chrome layout (no card/scroll layout)
3. Click each tool strip button → verify active state highlights
4. Shapes ▾ dropdown → opens and selects shape tools
5. ••• overflow menu → z-order + delete + hand work
6. Share ▾ → dropdown opens; "Copy student join link" works
7. Mic ▾ → device picker opens
8. Camera button → requests cam on first click (no double-toggle)
9. Theme toggle → switches between light/dark themes
10. Undo/Redo buttons work
11. PDF/Math/Desmos icon buttons open their respective flows
12. Board tab strip footer → switching pages works (board separation intact)
13. End session button → finalizes session
14. Open student join link in second tab → student sees whiteboard

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
