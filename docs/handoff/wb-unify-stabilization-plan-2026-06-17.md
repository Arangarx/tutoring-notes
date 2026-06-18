# WB Unification + Stabilization Plan (2026-06-17)

> **Branch:** `wb-unify-stabilize` (fork off `phase2/wb-student-new-shell`, **not** bare `v1-redesign`)  
> **Authored:** 2026-06-17 (planning pass — **no unify production code in this commit**)  
> **Parent context:** [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md); smoke triage [`wb-student-shell-smoke-triage-2026-06-17.md`](wb-student-shell-smoke-triage-2026-06-17.md); raw smoke notes [`phase-2-student-new-shell-smokebook-2026-06-16.md`](phase-2-student-new-shell-smokebook-2026-06-16.md)  
> **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)  
> **Engine guardrail:** [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) + [`docs/LIVE-AV.md`](../LIVE-AV.md) — extend don't rewrite; baseline [`a150d4f`](https://github.com/Arangarx/tutoring-notes/commit/a150d4f)  
> **Status:** **APPROVED by Andrew 2026-06-17** — executor dispatch gated on tutor item-14 smoke at every wave.

---

## Context / why

Andrew smoked the Phase-2 student-on-new-shell build (`phase2/wb-student-new-shell`, deployed tip [`5a04689`](https://github.com/Arangarx/tutoring-notes/commit/5a04689)) on real hardware 2026-06-17. The run **FAILED** with a broad regression cluster. Full symptom catalog: [`wb-student-shell-smoke-triage-2026-06-17.md`](wb-student-shell-smoke-triage-2026-06-17.md).

Three read-only root-cause investigations confirmed the underlying problem: the student client (`StudentLiveWorkspaceClient.tsx`) is a **near-line-for-line COPY** of the tutor monolith (`WhiteboardWorkspaceClient.tsx`) that has **DRIFTED in both directions**:

| Direction | Example |
|---|---|
| **Tutor missing student delta** | Tutor lacks the `useCollaboratorPointers` laser-receive hook the student has → tutor cannot see student laser. |
| **Student has wrong delta** | Student has an extra **wrong** `viewBackgroundColor` push the tutor lacks → dark-bg bug (canvas background stays white after theme switch). |
| **Tutor has delta student lacks** | Tutor has `onContextMenuCapture` right-click-to-end-line; student does not. |

**Andrew approved (2026-06-17):** **UNIFY** the surfaces now — pull the WB composition/de-dup consolidation forward — rather than patch the divergent student copy. This is de-duplicating **one architecture that got copied**, not merging two independent designs — the lower-risk kind of unification.

---

## Architecture decision

**ONE shared role/capability-gated whiteboard component.**

| Layer | Rule |
|---|---|
| **Engine internals** | Page-switch, sync apply-path, recording FSM stay **INTACT** — gating is added **AROUND** them (additive extraction, per the repo "extend don't rewrite" / wb-chrome-redo hard-won lesson; baseline [`a150d4f`](https://github.com/Arangarx/tutoring-notes/commit/a150d4f)). |
| **Session-ownership layer** | Stays **tutor-gated:** recording FSM, End Session, upload outbox, share link, asset inserts (D6), page add/switch/delete authority. |
| **Student deltas** | Become **capability branches:** auto A/V request on mount, Exit (not End), follow-tutor toggle (default ON), student laser color, read-only page strip, no share link. |
| **Student copy** | `StudentLiveWorkspaceClient.tsx` is **DELETED**; students route through the unified component. |
| **Hard gate** | Tutor regression smoke (smokebook **item 14**) stays **green at every wave** — protect-gate against the fragile monolith. |

---

## Branch strategy

| Step | Action |
|---|---|
| **Fork point** | Create unify branch **OFF** `phase2/wb-student-new-shell` (**NOT** bare `v1-redesign`). Phase2 already has shared chrome extractions (`WbToolBtn`, `BoardTabStrip` readOnly, `WbTopBarMicControlLive`), `wb-role` capabilities, and the A/V cluster fixes ([`974fc87`](https://github.com/Arangarx/tutoring-notes/commit/974fc87) / [`574fae9`](https://github.com/Arangarx/tutoring-notes/commit/574fae9) / [`3b996ae`](https://github.com/Arangarx/tutoring-notes/commit/3b996ae)) that `v1-redesign` lacks. |
| **Suggested name** | `wb-unify-stabilize` |
| **Merge** | `merge --no-ff` to `v1-redesign` after Andrew smoke-pass. |
| **Note** | `v1-redesign` HEAD still uses the pre-`974fc87` `WbAVCluster`; branching off phase2 preserves the cluster work. |

---

## Eliminated by construction

Once unified, these issues need **no separate fix**:

| Issue | Why it drops |
|---|---|
| Tutor sees student laser | Shared `useCollaboratorPointers` receive hook |
| Right-click end-line for student | Shared `onContextMenuCapture` on canvas |
| Dark-bg wrong push | Student's erroneous `viewBackgroundColor` push removed |
| Eraser mount-bootstrap drift | Single mount path |
| Two divergent sync apply-paths | Collapse to one |
| Missing styles/shapes/undo + most chrome-overflow/mobile tier | Student inherits tutor chrome |
| "Student sees no video" (likely) | Student renders through tutor's working A/V path instead of divergent copy |

---

## Real fixes still needed (unified core, done ONCE post-unify)

These remain and are sequenced per wave below:

- A/V cluster paint/reflow rework
- Mesh graceful leave/rejoin
- Cross-page bleed guard hardening
- `captureUpdate:"NEVER"` on sync `updateScene`
- Undo under `zenMode`
- Student cold-start A/V ordering
- Laser role-distinct local colors

---

## Wave breakdown

Each wave = own commit(s). **Gates:** tutor smokebook **item 14** green every wave; **real-browser verification** mandatory (jsdom missed ALL of this); `npm run test:wb-sync` gate for any change touching `src/lib/whiteboard/`, `src/components/whiteboard/`, or `tests/integration/whiteboard*`.

### Wave 1 — UNIFY THE SHELL

| Task | Detail |
|---|---|
| Role/capability gate | Make `WhiteboardWorkspaceClient.tsx` role/capability-aware (consume `wb-role` capabilities). |
| Student routing | Route `/w/[joinToken]` students through it as `role=student`. |
| Delete copy | **DELETE** `StudentLiveWorkspaceClient.tsx`. |
| Sync apply-path | Collapse to a single apply-path; keep `useStudentWhiteboardCanvas` **ONLY** if the apply genuinely needs role divergence — prefer one path. |
| Ownership gate | Capability-gate the ownership layer + student deltas (auto A/V on mount, Exit not End, follow-tutor default ON, student laser color, read-only page strip, no share link). |
| Laser receive | Bring `useCollaboratorPointers` into the shared component (both roles render remote laser). |
| Dark-bg | Remove student's wrong `viewBackgroundColor` push. |
| Right-click | Add `onContextMenuCapture` to the shared canvas. |

**GATE:** tutor item-14 green; student renders full chrome; **NO engine behavioral change** (escalate to orchestrator before touching page-switch / recording-FSM / sync-apply internals).

---

### Wave 2 — A/V CLUSTER + MESH REWORK (unified core)

**`WbAVCluster`**

| Fix | Detail |
|---|---|
| Decouple paint from lock | Decouple video paint from the `data-auto-grow` lock. |
| Reflow key | Key reflow on **TILE COUNT** (`participants.length`), **NOT** `remoteVideoCount`. |
| Stable layout | Tiles get stable non-zero layout on mount. |
| Placeholder reflow | Reflow on placeholder (cam-off/initials) mount, not only `<video>`. |

Fixes student-no-video, no-cam-initials-blank, tile-flash, disconnect-no-shrink together — root cause of why [`974fc87`](https://github.com/Arangarx/tutoring-notes/commit/974fc87) failed: it keyed shrink on video count not tile count.

**`peer-mesh` / `useLiveAV`**

| Fix | Detail |
|---|---|
| Graceful leave | On Exit/leave call `removePeer` (sends `sendLeave`) **BEFORE** `dispose()`. |
| Tutor rejoin | Tutor force-new-PC (`removePeer` + `addPeer`) on presence re-add after graceful leave. |
| Same peerId rejoin | Handle rejoin with same peerId (why [`574fae9`](https://github.com/Arangarx/tutoring-notes/commit/574fae9) was insufficient — `dispose()` never sends leave; rejoin no-ops). |
| Student cold-start | Defer auto cam/mic request until `syncClient` + `encryptionKey` ready; serialize acquire. |
| Presence UX | Student call pill reflects `reachableParticipants`, not sync-alone (step-away split-brain). |
| `AVTile` stability | Stabilize participant identity / `audioStream` refs to stop flash + audio-indicator blink. |

**⛔ DO NOT:** simplify peer-mesh, remove perfect-negotiation, or merge recording/live publish ([`docs/LIVE-AV.md`](../LIVE-AV.md) invariants 2, 6, 7, 8).

**GATE:** wb-sync green; real 2-device hardware smoke.

---

### Wave 3 — ENGINE CORRECTNESS (unified apply-path)

**Cross-page bleed**

| Fix | Detail |
|---|---|
| `pageSwitchProgrammaticRef` | Extend across the **FULL** `commitPdfBatch` (increment at entry, hold through `addFiles` + `selectTutorPage` + the 2×rAF+timeout tail). |
| Flush | `flushThrottledFrameNow()` at `commitPdfBatch` start. |
| Generation counter | Add a board-generation counter bumped on every committed switch; reject `onChange` when generation != capture-time generation (mirror the `onChangePageId` async-image pattern). |

**`captureUpdate:"NEVER"`**

- Re-verify [`914fbc0`](https://github.com/Arangarx/tutoring-notes/commit/914fbc0) (`captureUpdate:"NEVER"` + `history.clear`) on all `updateScene` board-switch paths.
- Add `captureUpdate:"NEVER"` to **ALL** sync-driven `updateScene` (tutor `applyRemoteToCanvas` ~L797; student-hook applies if still present) — fixes undo history-poisoning + helps eraser.

**Undo/redo under `zenModeEnabled`**

- Make synthetic undo (`undo-redo.ts`) work (canvas focus / dispatch target) **or** restore native undo while keeping the zen toolbar hidden.

**Eraser**

- Confirm `setActiveTool("eraser")` fires on tutor click + add mount-bootstrap (student primes `selectTool` on mount, tutor doesn't).
- Audit tutor overlay `pointer-events` (`WbAVCluster` z-index 25, banners) for stuck `elementsPendingErasure`.

**New Playwright test**

- Draw Board 2 → import PDF → assert Board 3 scene has **ONLY** PDF element ids (no Board-2 stroke ids).
- Repeat after navigate-away-and-back (invariant 9 covers add-board isolation but **NOT** PDF import).

**GATE:** wb-sync green incl. new bleed test.

---

### Wave 4 — CHROME / RESPONSIVE + RESIDUAL WIRING

| Task | Detail |
|---|---|
| Laser local colors | Role-distinct **LOCAL** colors (`[data-role="student"]` vs `[data-role="tutor"]` CSS, or imperative `laserColor`) — fixes same-color + neither-is-red. Remote overlay already role-colored via `laser-colors.ts` (local trail force-coraled by `whiteboard-chrome.css` ~L38–46). |
| Responsive | Verify inherited tutor responsive layout covers student desktop+mobile; address residual overflow. |
| Mobile parity | Mobile rearrange parity (was smoke item 11). |

**GATE:** desktop + mobile student smoke.

---

### Wave 5 — POLISH

| Task | Detail |
|---|---|
| Exit button | Coral Exit button + exit icon (Andrew preference over plain "Exit"). |
| Match-view button | Smaller "Match tutor's view" button + better stay-synced vs one-time-sync iconography. |
| Design Q (a) | Highlight the non-clickable student board tab? — resolve + record decision. |
| Design Q (b) | Allow student graph-expression entry on embeds? — resolve + record decision. |
| View lock | Implement **WB-STUDENT-VIEW-LOCK-WHEN-SYNCED** — student cannot move view while synced (vs current move-then-snap-back). |

---

## Cross-cutting guardrails

- **Tutor item-14 smoke** is a hard gate **every wave**.
- **Real-browser verification** mandatory — jsdom blind spot (layout/coordinate bugs invisible to unit tests).
- **`npm run test:wb-sync`** gate on any whiteboard-touching change.
- **Engine internals additive-only** — escalate to orchestrator before behavioral rewrite of page-switch / recording-FSM / sync-apply.
- **Per-session ID logging** maintained (`wbsid` / `wba` / `avx` / `peer`).

---

## Out of scope / deferred (backlog)

| ID | Item |
|---|---|
| WB-SCREEN-WAKE-LOCK | Screen wake lock |
| WB-THUMBNAIL-GRAPH-PLACEHOLDER | Thumbnail graph placeholder |
| WB-OLD-PHONE-PERF | Old-phone performance |
| WB-DEVICE-PICKER-DUPES | Teams-style switch prompt on device hotload |
| SSG-3 | Multi-segment seek |
