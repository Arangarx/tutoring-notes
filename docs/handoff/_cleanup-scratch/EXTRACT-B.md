# EXTRACT-B — Whiteboard chrome / sync / replay / PDF (doc-cleanup batch B)

**Worktree:** `chore/doc-cleanup-master` @ `tutoring-notes-merge-audio`  
**Extracted:** 2026-07-09  
**Sources:** 17 handoff/status docs in batch B scope + `docs/handoff/whiteboard-chrome-requirements.md` (protected reference only) + `docs/BACKLOG.md` grep + `src/` verification.

---

## CARRY table

Open items that still need tracking. **Excluded** when already captured in `docs/BACKLOG.md` (see next section) or verified shipped.

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| Ghost viewport **bounds** overlay (dashed rectangle + role label), not label-only stub | Chrome / viewport | **P1** | CSS comment `/* bounds rendering deferred */` + label-only DOM `data-testid="wb-ghost-viewport-label"` at `WhiteboardWorkspaceClient.tsx:7322-7329`; no bounds geometry render | `whiteboard-session-shell-design-2026-06-08.md` §5.3; `whiteboard-chrome-design-2026-06-07.md` Q11 |
| Gate **A5** — enumerated bidirectional live sync audit (all action types + hardware relay) | Sync | **P1** | `docs/BACKLOG.md` row "Live bidirectional whiteboard sync completeness" still says "not yet started"; design invariants in sync-redesign | `whiteboard-sync-redesign-2026-05-27.md`; `whiteboard-regression-net-design-2026-05-30.md` |
| Laser/wand **per-role colors + bidirectional visibility** polish (ST-05); backlog text stale vs wire code | Sync / chrome | **P1** | `broadcastPointer` + `useCollaboratorPointers` shipped (`WhiteboardWorkspaceClient.tsx:1773,4804-4814`; `sync-client.ts:2225`); BACKLOG still says "never built" — **verify + close or update**; color asymmetry row `WB-LASER-ICON-CONTRAST` | `wb-laser-sync-smokebook-2026-06-11.md`; `whiteboard-chrome-requirements.md` ST-05 |
| **SSG-3 / A6-1** multi-segment replay scrubber mapping + retire legacy `WhiteboardReplay` for Sarah paths | Replay | **P1** | `docs/BACKLOG.md` SSG-3; `wb-replay-a6-slice-smokebook-2026-06-11.md` §2 A6-1 TODO | `phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` deferred A6-1 |
| In-person / solo sessions: strokes not captured → no replay (**SMOKE-BLOCK-5**) | Recording + replay | **P1** | `SessionReviewMode.tsx:127` gates on `hasAudio \|\| eventCount > 0`; FSM `armed/awaiting_first_participant` + `deriveWbCaptureActive` path documented in BACKLOG | `PHASE-PDF-SMOKE-1.md` smoke-4 gate narrative; `phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md` |
| Replay scrub drag → **429** + frozen scene during drag | Replay | **P1** | `docs/BACKLOG.md` "Replay scrub drag — 429s + frozen scene"; smoke-1 #11 / S2-4 | `PHASE-PDF-SMOKE-1.md` #11 |
| **SMOKE-UX-1** replay Play jumps to scrubber end on hardware | Replay | **P1** | `docs/BACKLOG.md` SMOKE-UX-1 REOPEN | `phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md` item 4 (still FAIL notes) |
| **Hide replay** must pause audio (Andrew 2026-06-14 smoke item 5 clarification) | Replay UX | **P2** | Smokebook FAIL: audio continued when replay hidden; product rule: hide = pause | `phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md` §5 |
| Tutor-vs-student **insert origin** (viewport-center mismatch for assets) | PDF / assets | **P2** | `insert-asset.ts` `viewportCenter` reads local Excalidraw state; no shared deterministic anchor | `PHASE-PDF-SMOKE-1.md` S3; `PHASE-PDF-STATUS.md` deferred |
| **PDF position lock / pan-clamp** design spike (#2) | PDF | **P2** | Deferred in `PHASE-PDF-STATUS.md` §Deferred; no dedicated BACKLOG row (only mentioned under shipped PDF follow-ups) | `PHASE-PDF-SMOKE-1.md` #2 |
| Promote **math insert** to main toolbar + investigate Excalidraw **library persistence** (S4) | Chrome | **P2** | Math remains popover-only (`MathInsertButton.tsx`); library disposition DROP in audit | `PHASE-PDF-SMOKE-1.md` S4 |
| **Student waiting room** screen design (Q2) | Session shell | **P2** | Open question table §12 Q2 — tutor side designed, student not | `whiteboard-session-shell-design-2026-06-08.md` |
| **Session type selection UX** — where tutor declares in-person vs remote (Q1) | Session shell | **P2** | Open question §12 Q1 | `whiteboard-session-shell-design-2026-06-08.md` |
| **Asymmetric viewport** when follow OFF — smaller viewport peer experience (Q7) | Viewport | **P2** | Open question §12 Q7 — needs Andrew decision | `whiteboard-session-shell-design-2026-06-08.md` |
| Student **default AV: peer-only** (self-view off pending Sarah confirm) | Chrome / AV | **P2** | Design §7.5.1; code still `defaultShowLocalVideo: true` in `src/components/whiteboard/chrome/wb-role.tsx:41,56` | `whiteboard-session-shell-design-2026-06-08.md` §7.5.1 |
| **TM-09** tutor-mobile expectations notice + host-time desktop gate | Chrome / product | **P2** | `docs/BACKLOG.md` TM-09 rows | `whiteboard-chrome-design-2026-06-07.md` Fork 2 |
| **Replay page strip with PDF section grouping** (#9) — basic tabs shipped, sections not | Replay / PDF | **P2** | `deriveReplayPageListFromLog` sets `isPdf: false` always (`event-log.ts:408-420`); live `PageStrip` has sections | `PHASE-PDF-STATUS.md` #9; `PHASE-PDF-SMOKE-1.md` #9 |
| **Event log + replay multi-page** (A6-6) — flat stream, no `pageSwitch` in log | Replay | **P2** | `docs/BACKLOG.md` "Event log + replay: multi-page"; plan defers fake board tabs | `phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` |
| **WB-REVIEW-THUMBNAIL-PDF** — hero thumbnail placeholder for PDF boards | Replay / review | **P2** | `docs/BACKLOG.md` WB-REVIEW-THUMBNAIL-PDF | `PHASE-PDF-STATUS.md` replay grouping note |
| Re-enable Playwright **invariant 8** (PDF center+fit) after sync-wait fix | Test gate | **P2** | `whiteboard-live-sync-regression.spec.ts:568-571` `test.skip(true, …findFirstImageElementId null)` | `whiteboard-regression-net-design-2026-05-30.md` § inv 8 |
| **TU-11** keyboard-shortcut routing parity (tutor desktop + student mobile) | Chrome | **P2** | Open Q8 in chrome design §7; req TU-11 in requirements — no standalone BACKLOG row | `whiteboard-chrome-design-2026-06-07.md` Q8 |
| **NR-07** confirm transform handles visible with native chrome hidden | Chrome / verify | **P2** | Audit NR-07 OPEN; Phase 1 acceptance in audit | `whiteboard-excalidraw-function-audit-2026-06-08.md` |
| **Eraser cursor vs delete path** (TM-08) + mobile pointer-transform hit offset | Chrome / mobile | **P2** | `docs/BACKLOG.md` eraser cursor + post-sync smoke (d) | `whiteboard-chrome-design-2026-06-07.md` Phase 3 |
| **relayShowsCollaborator** optional tutor-presence copy parity (A2-M4) | Presence | **P3** | Listed open in `WHITEBOARD-P2-STATUS.md`; no `relayShowsCollaborator` symbol in `src/` | `WHITEBOARD-P2-STATUS.md` |
| **PDF large imports on mobile Safari** (picker memory) | PDF | **P3** | Manual-only gap in `PHASE-PDF-STATUS.md` | `PHASE-PDF-STATUS.md` |
| Rename FSM input `everHadAudioFlow` → `everHadSessionActivity` (smoke-4 refactor) | Recording | **P3** | Smoke-4 follow-up table | `PHASE-PDF-SMOKE-1.md` smoke-4 |
| Replay empty-state copy: surface `armedReason` vs generic "nothing recorded" | Replay UX | **P3** | Smoke-4 follow-up | `PHASE-PDF-SMOKE-1.md` smoke-4 |
| **NR-09** optional shortcuts help (`?`) in Mynk overflow | Chrome | **P3** | Audit NR-09 OPEN | `whiteboard-excalidraw-function-audit-2026-06-08.md` |
| **NR-12** ongoing verify native S/G/Shift+F color popups survive zen+CSS hide | Chrome / POC | **P3** | Audit NR-12; POC green 2026-06-08 — periodic regression | `whiteboard-excalidraw-function-audit-2026-06-08.md` |
| **Q9** map every chrome control to v1 tokens (no one-offs) | Chrome / design | **P3** | Open Q9 | `whiteboard-chrome-design-2026-06-07.md` §7 |
| **Student tab crash** — IDB-backed `pageDataRef` if student-authored content grows | Sync | **P3** | Sync redesign failure-mode table; follow-up not BLOCKER | `whiteboard-sync-redesign-2026-05-27.md` §Axis 1 |
| Measure **wire bandwidth** on real session (delta payloads contingency) | Sync | **P3** | Sync redesign §5.6 / Phase 1 smoke add-on | `whiteboard-sync-redesign-2026-05-27.md` |
| **GitHub Actions** wb-regression workflow (Phase 2 gate) | Test infra | **P3** | Design §Gate recommendation Phase 2; not implemented | `whiteboard-regression-net-design-2026-05-30.md` |
| **Laser pointer in replay** (not in events.json) | Replay | **P3** | Plan smokebook Ignore; record-side change needed | `phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` |
| **Tutor scratchy audio (B4)** — record-side, not replay blocker | Recording | **P3** | Plan deferred; smokebook ignore | `phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` |
| **XPPen Star G640** hardware verification (TU-05 / TM-04) | Chrome / pen | **P3** | Residual risk until Sarah tests; generic tablet POC only | `whiteboard-chrome-design-2026-06-07.md` §8-9 |

---

## Already-in-backlog

Items found in source docs that already have a home in `docs/BACKLOG.md` (do not duplicate as new CARRY rows).

| Backlog anchor | Source doc item |
|----------------|-----------------|
| **SMOKE-POST-1** / ghost viewport (VP-01) | `whiteboard-session-shell-design-2026-06-08.md` §5.3; chrome design Q11 |
| **SMOKE-BLOCK-5** in-person/solo no replay | `PHASE-PDF-SMOKE-1.md` smoke-4 empty recording |
| **SSG-3**, **A6-1** multi-segment replay | `wb-replay-a6-slice-smokebook-2026-06-11.md`; replay plan |
| **SMOKE-UX-1**, **SMOKE-UX-3**, **SMOKE-BUG-5**, **WB-REPLAY-*** rows | Replay smokebooks; PDF smoke #11 |
| **WB-PDF-BLOB-TOKEN** (#8 bulk import) | `PHASE-PDF-STATUS.md` #8 (merged) |
| **WB-STROKE-BLEED** / page leakage | `PHASE-PDF-SMOKE-1.md` #3/#6/#7 (fixed in product; watch row) |
| **Live bidirectional sync / Gate A5** + laser rows | `whiteboard-sync-redesign-2026-05-27.md`; `wb-laser-sync-smokebook` |
| **WB-HAND-TOOL-MISSING** (NR-01 hand/pan discoverable) | `whiteboard-excalidraw-function-audit-2026-06-08.md` NR-01 |
| **TM-09**, tutor-mobile deferral | `whiteboard-chrome-design-2026-06-07.md` Fork 2 |
| **Video tile docking** (SR-04 follow-up) | `whiteboard-chrome-requirements.md` SR-04 |
| **PDF open — fit tutor vs student** (DD-05) | `whiteboard-chrome-design-2026-06-07.md` Q10 |
| **Scheduling** (session shell Q8) | `whiteboard-session-shell-design-2026-06-08.md` Q8 |
| **Per-board undo/redo** enhancement | `wb-chrome-redo-STATUS.md` (logged post-v1) |
| **WB-LEGACY-STUDENT-CLIENT-DELETE** ✅ | `WHITEBOARD-P2-STATUS.md` Step 9 / session shell §7.5.1 |
| **Whiteboard regression net — re-enable inv 8** | `whiteboard-regression-net-design-2026-05-30.md` |
| **Post–sync-redesign smoke findings** (page insert order, mobile hit offset, A/V) | `whiteboard-sync-redesign-2026-05-27.md` + chrome Phase 3 |
| **Gate A6** replay fidelity umbrella | `phase-1-wb-floor-replay-in-frame-*.md` |
| **WB-FINISH-REVIEW-COPY-CONTEXT**, **WB-REVIEW-DELETE-COPY**, **WB-TUTOR-REPLAY-PHONE-LAYOUT** | Replay smokebook polish notes |
| **MASTER-CUT-2026-07-09** waived `test:wb-sync` failures | Post-cut cleanup list |
| Phone-landscape left rail | `whiteboard-session-shell-design-2026-06-08.md` §7.5.1 mobile deferral → **shipped** per BACKLOG wave5 row |

---

## Shipped / obsolete

Verified in `src/` or superseded; safe to treat as historical in source docs.

| Item | Evidence | Source doc |
|------|----------|------------|
| PDF subset picker + per-page boards + section collapse | Shipped `9ff5b11`; `PdfImageUploadButton.tsx`, `PageStrip.tsx`, `insert-asset.ts` `commitPdfBatch` | `PHASE-PDF-STATUS.md`, `PHASE-PDF-SMOKE-1.md` |
| Page-data leakage (#3/#6/#7) + `tutorSwitchTokenRef` + `applyRemoteToCanvas` rewrite | `WhiteboardWorkspaceClient.tsx:697,3427+`; E4/E5 specs | `PHASE-PDF-SMOKE-1.md` smoke 2-4 |
| Picker dismiss (#1), Add Page placement (#5), First-N focus (S1) | `PdfImageUploadButton.tsx` pointer pair + focus | `PHASE-PDF-SMOKE-1.md` |
| Replay PDF bitmap hydration (#12) | `WhiteboardReplay.tsx` / replay pipeline `registerImageAssets` | `PHASE-PDF-SMOKE-1.md` #12 |
| KaTeX fonts same-origin | `MathInsertButton.tsx:201` → `/mathlive-fonts/`; `public/mathlive-fonts/` | `PHASE-PDF-SMOKE-1.md` smoke-4 |
| Audio-flow gate OR latches (smoke-4 #4) | `markWbActivity` + gate refs in `WhiteboardWorkspaceClient.tsx` ~5016-5022 | `PHASE-PDF-SMOKE-1.md` smoke-4 |
| **PR-01** freedraw latency Option A+E | Comment + ref assign `WhiteboardWorkspaceClient.tsx:4995-4997`; `flushThrottledFrameNow` wired | `whiteboard-chrome-design-2026-06-07.md` P1.1 gate |
| Phase 0 chrome POC **GREEN** | Verdict recorded | `POC-SMOKE-wb-chrome-2026-06-07.md` |
| Mynk chrome components + CSS (`feat/wb-chrome-redo` scope) | `whiteboard-chrome.css`, `chrome/*`, `BoardTabStrip` `isPdf` | `wb-chrome-redo-STATUS.md` |
| P0 overflow clip + undo cross-board (`captureUpdate:"NEVER"` + `history.clear()`) | `wb-chrome-redo-STATUS.md` commits; Playwright `wb-chrome-interactions.spec.ts` | `wb-chrome-redo-STATUS.md` |
| C1/C2/C3 math position, MathLive churn, Desmos CSP | `insert-asset.ts`, `MathInsertButton.tsx`, `csp.ts` | `wb-chrome-redo-STATUS.md` |
| Hermetic relay + `npm run test:wb-sync` scripts | `package.json:23,31`; `playwright.config` wb-regression | `whiteboard-regression-net-design-2026-05-30.md` |
| Invariants 1–7, 9–10 (except inv 8 skip) | `whiteboard-live-sync-regression.spec.ts` | `whiteboard-regression-net-design-2026-05-30.md` |
| Teeth-verify inv 4 protocol | Documented; smoke log referenced in design | `whiteboard-regression-net-design-2026-05-30.md` |
| A3 in-shell live→review flip | `WhiteboardSessionShell.tsx`, `SessionReviewMode.tsx` | `wb-end-session-review-smokebook-2026-06-11.md` |
| Laser wire protocol stages 1–3 | `sync-client.ts` pointer envelope; `useCollaboratorPointers`; student+tutor `broadcastPointer` | `wb-laser-sync-smokebook-2026-06-11.md` (Stage 4 note **obsolete** — student path exists in code) |
| A6-2 graph in replay | `WhiteboardReplay.a6-slice.dom.test.tsx` | `wb-replay-a6-slice-smokebook-2026-06-11.md` |
| In-frame replay architecture (Option B) + `useReplayTimelineController` | `src/hooks/useReplayTimelineController.ts`, `replay/*`, `SessionReviewMode.tsx` | `phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` |
| Lifted notes state + persist-once replay (BLOCKER-1/2) | `SessionReviewMode.tsx` controlled notes; smokebook items 6 PASS | `phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md` |
| Student on unified shell (hard switch) | `join/[sessionId]/page.tsx:313` `WhiteboardSessionShell role="student"`; no `StudentWhiteboardClient` in `src/` | `WHITEBOARD-P2-STATUS.md`; session shell §7.5.1 |
| **VP-02** canvas grid toggle | `wb-grid-toggle` + `gridModeEnabled` update `WhiteboardWorkspaceClient.tsx:5529-5557` | `whiteboard-session-shell-design-2026-06-08.md` §5.4 |
| Replay board tab strip (basic, no PDF sections) | `ReplayReadOnlyChromeSlots.tsx:224-245` `BoardTabStrip` | `PHASE-PDF-STATUS.md` #9 partial |
| Replay CTA gated on `hasAudio \|\| eventCount > 0` | `SessionReviewMode.tsx:127` | `phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md` NOTE-1 |
| Active-ping on replay 409 | `SMOKE-BUG-1` RESOLVED — tutor-only ping | `PHASE-PDF-SMOKE-1.md` S2-2 |
| P2 Steps 0–7 implementation (except Andrew smoke) | Status table all Done | `WHITEBOARD-P2-STATUS.md` |
| Chrome design forks Q1-Q3, Q5-Q7, Q12 resolved | §7 resolved table | `whiteboard-chrome-design-2026-06-07.md` |
| Audit dispositions NR-02–06, NR-10–11, TU-14, TM-10 ratified | §Summary + implications | `whiteboard-excalidraw-function-audit-2026-06-08.md` |
| wb-chrome-redo pending gates | Superseded by later merges to integration branch; status doc is 2026-06-09 snapshot | `wb-chrome-redo-STATUS.md` |

---

## Per-doc archive note

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `docs/WHITEBOARD-P2-STATUS.md` | **Yes** | Historical phase table (2026-06-26). Survives in: `WHITEBOARD-STATUS.md` + BACKLOG **WB-LEGACY-STUDENT-CLIENT-DELETE** ✅. Open: **relayShowsCollaborator** copy → CARRY P3 unless dropped. |
| `docs/PHASE-PDF-STATUS.md` | **Yes** (after CARRY) | Shipped model + `commitPdfBatch` narrative → `WHITEBOARD-STATUS` / PLATFORM-ASSUMPTIONS if needed. **Defer list** → CARRY + BACKLOG PDF follow-ups. |
| `docs/PHASE-PDF-SMOKE-1.md` | **Yes** | Root-cause archaeology for bleed/gate fixes — keep gist in `docs/whiteboard-smoke-log.md` or BACKLOG **WB-STROKE-BLEED** watch. Open deferrals → CARRY table. |
| `docs/handoff/whiteboard-sync-redesign-2026-05-27.md` | **Yes** (large) | Invariants P1–P8 / I1–I4 → `docs/WHITEBOARD-STATUS.md` + relay tests. Yjs contingency + IDB student crash → CARRY P3. Phase 1 acceptance → largely shipped; **Gate A5** audit → BACKLOG. |
| `docs/handoff/whiteboard-chrome-design-2026-06-07.md` | **Partial** | **Keep abstract** in `whiteboard-chrome-requirements.md` + `V1-COMPONENT-LIBRARY.md`. Archive OK for phasing/POC history. Open Q8–Q10 → CARRY / BACKLOG. |
| `docs/handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md` | **Yes** | Visual spec executed in `whiteboard-chrome.css` + chrome components. Ratified dispositions live in requirements + audit. |
| `docs/handoff/whiteboard-session-shell-design-2026-06-08.md` | **Partial** | Waiting room / review / consent → feature STATUS docs + BACKLOG. **Keep** open Q1/Q2/Q7 until closed. Ghost bounds spec → BACKLOG **SMOKE-POST-1**. HTML mock path stays in `docs/brand-previews/`. |
| `docs/handoff/whiteboard-excalidraw-function-audit-2026-06-08.md` | **Yes** | NR disposition table → requirements §audit cross-ref. NR-07/09/12 open → CARRY. DROP list is historical. |
| `docs/handoff/whiteboard-regression-net-design-2026-05-30.md` | **Yes** | Gate lives in `AGENTS.md`, `LOCAL-DEV.md`, `package.json`, `playwright.config.ts`. inv 8 quarantine → BACKLOG. Phase 2 CI → CARRY P3. |
| `docs/handoff/POC-SMOKE-wb-chrome-2026-06-07.md` | **Yes** | GREEN verdict only; Phase 1 unblocked. No open items. |
| `docs/handoff/wb-chrome-redo-STATUS.md` | **Yes** | 2026-06-09 branch journal; fixes merged. P0 root causes worth one paragraph in `WHITEBOARD-STATUS` hard-won lessons if not already there. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` | **Partial** | Architecture (Option B, two-state → later unified review) **still operative** for replay work; keep summary in `RECORDER-LIFECYCLE.md` or WHITEBOARD-STATUS replay section. Defer table → BACKLOG/CARRY. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md` | **Yes** | BLOCKERs folded into plan Rev 3; implementation shipped. Historical review only. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md` | **Yes** (after smoke) | Active hardware failures → CARRY (items 4–5). Template superseded by later `phase1/wb-review-correct` smokebook. |
| `docs/handoff/wb-replay-a6-slice-smokebook-2026-06-11.md` | **Yes** | A6-2 shipped; A6-1 characterization checklist → BACKLOG **SSG-3**. |
| `docs/handoff/wb-end-session-review-smokebook-2026-06-11.md` | **Yes** | Phase A shipped (`WhiteboardSessionShell`). Phase B polish → BACKLOG chrome/review rows. |
| `docs/handoff/wb-laser-sync-smokebook-2026-06-11.md` | **Yes** | Wire design appendix useful; enforcement → Gate A5 + **update stale BACKLOG laser row** to match code. |
| `docs/handoff/whiteboard-chrome-requirements.md` | **NO — PROTECTED** | Living requirement registry (68 reqs). Still-open Sarah chrome reqs: **ST-05** verify, **TM-09**, **SR-04** docking, **TU-11**, **VP-01/02**, student **TB-12** tier-1 tools. |

---

## Protected doc — still-open Sarah chrome reqs (quick scan)

From `whiteboard-chrome-requirements.md` vs code/BACKLOG (not exhaustive; see protected file):

| Req | Status | Notes |
|-----|--------|-------|
| **ST-05** wand/laser bidirectional + colors | **Partial** | Wire shipped; BACKLOG color/visibility polish + hardware verify |
| **VP-01** ghost viewport bounds | **Open** | Label stub only; BACKLOG **SMOKE-POST-1** |
| **VP-02** grid toggle | **Shipped** | `wb-grid-toggle` |
| **TM-09** tutor-mobile gate + copy | **Open** | BACKLOG |
| **SR-04** AV cluster top-right, drag/resize, both tiles | **Shipped** (docking deferred BACKLOG) |
| **TU-11** keyboard routing | **Open** | CARRY |
| **TB-12** student tier-1 tools on phone | **Verify** on student shell |
| **XPPen / TM-04** | **Open** | Sarah hardware smoke P3 |

---

## Extraction notes

- **BACKLOG staleness:** Rows "Tutor laser not visible" / Gate A5 "laser never built" conflict with `broadcastPointer` + `useCollaboratorPointers` in `WhiteboardWorkspaceClient.tsx`. Recommend backlog hygiene: mark wire **shipped**, keep **visibility/color/hardware** as open.
- **Ghost overlay:** Requirements + session-shell design describe full bounds; implementation is **label-only** (`whiteboard-chrome.css:1376` deferred comment). Do not archive VP-01 intent without BACKLOG **SMOKE-POST-1** remaining active.
- **No new BACKLOG rows created** in this extraction pass — CARRY table is the input for a follow-up backlog merge.
