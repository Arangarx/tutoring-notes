# EXTRACT-J1 — Strategic plan archive extraction (Batch J1)

**Generated:** 2026-07-09  
**Source plans:** `C:\Users\arang\.cursor\plans\` (12 files, read in full)  
**Cross-verify worktree:** `tutoring-notes-merge-audio` (`src/` + `docs/BACKLOG.md` + `docs/RELEASE-ROADMAP.md`)  
**Purpose:** Pull every still-open item before these plans are archived; classify against shipped reality.

**Priority key:** P0 = Sarah breakage / ship blocker · P1 = important pre-release · P2 = enhancement / wedge · P3 = someday / post-pilot

---

## CARRY table (open → carry forward)

| Item | Area | Priority | Evidence | Source plan |
|------|------|----------|----------|-------------|
| **CLIENT-AUDIO-CONSENT-GATE** — end-to-end client consent projection (capture/upload/IDB/transcription); in-person = no audio when off; remote = tutor-only mixdown | Consent / recording | **P0** | `docs/BACKLOG.md` § Consent — **Ship-to-Sarah blocker**; `consent-scope.ts` has mode-aware deny but BACKLOG says shallow enforcement + `enqueueChunkTranscriptionAction` ungated | `whiteboard_reliability_remaining` p2a / Block B; `live_session_floor` P3 consent |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** + **LIVE-SESSION-CONSENT-COPY** — hide dead toggles; honest `allowLiveSession` copy | Consent UX / legal | **P0** | `docs/BACKLOG.md` § Consent design pass; `RELEASE-ROADMAP.md` Gate B parent consent | `whiteboard_reliability_remaining` Block B |
| **CONSENT-COLLECTION-COMPLETENESS (CC-1/CC-2)** — no session without claimed student; claim requires explicit consent choice | Consent / join | **P0** | `docs/BACKLOG.md` **RATIFIED SARAH-MERGE BLOCKER** | `whiteboard_reliability_remaining` (implicit); master plan identity threads |
| **PRESARAH-1** — always-on recording; remove `StudentRecordingDefaultToggle` / `userWantsRecording` vestige | Recorder lifecycle | **P0** | `docs/BACKLOG.md` § Pre-Sarah phone-smoke; `WhiteboardWorkspaceClient.tsx` still threads `userWantsRecording` | Durability / reliability plans (recording gates) |
| **SSG-2 / PRESARAH-2 / student-detail End → End-and-review** — no silent `endStaleWhiteboardSession` data loss | End-session UX | **P0** | `docs/BACKLOG.md` **Ship-to-Sarah blocker**; `ActiveWhiteboardSessionsList.tsx` path | `live_session_floor` P1 review routing; `go_to_sarah` WS-C |
| **SMOKE-BLOCK-5** — in-person/solo sessions capture no strokes → no replay (FSM `armed` gates `wbCaptureActive`) | Whiteboard capture | **P0** | `docs/BACKLOG.md` § wb-wave5-polish hardware-smoke; `audio-capture-policy.ts` + `lifecycle-machine.ts` | `go_to_sarah` bugs; `whiteboard_reliability_remaining` in-person |
| **SMOKE-NOTES-1** — skeleton overlay during post-End generation (form must stay visible) | Notes UX | **P0** | `docs/BACKLOG.md` **REOPEN** after hardware regression @ `3cffbb7` | `whiteboard_reliability_remaining` p3-incremental-map acceptance |
| **SMOKE-UX-1** — replay auto-play jumps to scrubber end | Replay | **P0** | `docs/BACKLOG.md` **REOPEN**; `MASTER-CUT-2026-07-09` waived related `test:wb-sync` REAL-FAIL | `whiteboard_reliability_remaining` p3-replay-scrub |
| **WS-I-PRESTART-MUTE** — tutor mute before audio graph arms records at full gain | A/V recording | **P0** | `docs/BACKLOG.md` § wb-wave5 branch-only; `wb-tutor-recording-mute.spec.ts` | `whiteboard_reliability_remaining` Part 1 A/V |
| **BUG-8** — reconnect media-transport not rebuilt after peer leave/rejoin | Live A/V | **P0** | `docs/BACKLOG.md` **FRAGILE — deferred**; `peer-mesh.ts` / `useLiveAV.ts` | `go_to_sarah` E3; reliability remaining p1a-reconnect residual |
| **Gate A5 — live bidirectional sync completeness** (incl. **ST-05** laser/pointer never built) | Whiteboard sync | **P1** | `docs/BACKLOG.md` § V1 redesign — **not yet started**; `RELEASE-ROADMAP.md` Gate A item 6 | `experience-driven_wedge` 1a; `whiteboard_mvp` Phase 1 sync blockers (shipped subset only) |
| **Gate A6 — replay fidelity + AV/timer sync** (comprehensive enumerated pass) | Replay | **P1** | `docs/BACKLOG.md` Gate A6 **not yet started** + regression note; partial tests only | `experience-driven_wedge` 1b; `whiteboard_reliability_remaining` p3-clock hardware oracle |
| **WB-COMPONENTS-PASS** — unified chrome components; kill `whiteboard-chrome.css` monolith / `!important` reach-ins | Chrome / tech debt | **P1** | `docs/BACKLOG.md`; no `WbTopBar.tsx`; partial `WbTopBarMicControl*` only | `whiteboard_reliability_remaining` p1b-chrome-wbtopbar, p1c-css |
| **useRecordingCoordinator** extraction (FSM + mixdown reconcile) | Recorder architecture | **P1** | No `useRecordingCoordinator.ts` in merge-audio; logic still in `WhiteboardWorkspaceClient.tsx` | `whiteboard_reliability_remaining` p1b-recording-coordinator |
| **SMOKE-PERF-1** — "Finalizing…" fixed overhead (de-await snapshot PNG, reduce blob re-fetch) | End-session perf | **P1** | `docs/BACKLOG.md` § v1-redesign durability-wave user-smoke | `go_to_sarah` integrated gate follow-up |
| **Wave 1 BLOCKER-PRODs** — audio IDB crash recovery (#1), upload-failure persistence (#2), hot-swap mic (#7) | Recorder reliability | **P1** | `docs/RELEASE-ROADMAP.md` Wave 1; `docs/BACKLOG.md` § Reliability gaps | `tutoring_notes_pilot_ready_master_plan` Phase 2; `whiteboard_mvp` cross-cutting-recorder-audit follow-ups |
| **Phase 2 continuity engine V1** — structured deltas, **"would you agree?"**, carryover panel, evidence atoms | Wedge / notes | **P2** | `docs/BACKLOG.md` § Program mapping — **most not yet backlog rows**; spec in `docs/research/continuity-wedge-brainstorm-2026-06-12.md` | `experience-driven_wedge` phase2-* |
| **Phase 3 note-quality engine** — rubric, eval harness, disagree-signal loop | Wedge / AI | **P2** | `docs/RELEASE-ROADMAP.md` overlay; `docs/BACKLOG.md` notes-quality rows | `experience-driven_wedge` phase3-*; `whiteboard_reliability_remaining` p3-model-abstraction eval flywheel |
| **SMOKE-NOTES-2** — live/progressive notes during session (`p3-incremental-map` live reduce) | Notes UX | **P2** | `docs/BACKLOG.md` **DEFERRED post-Sarah** (Andrew 2026-07-02) | `whiteboard_reliability_remaining` p3-incremental-map |
| **Whiteboard Phase 2 surfaces** (collab essay, collab code, Office docs, Wolfram) — **gated on Sarah 3-session demo** | Wyzant parity | **P2** | `docs/WHITEBOARD-STATUS.md` Phase 1→2 demo gate **unchecked**; `RELEASE-ROADMAP.md` Backlog | `whiteboard_mvp` / `match_wyzant` gate-phase2, phase2-on-demand |
| **p3-video-seam** — per-participant video finalize/replay data model (capture NOT built) | Recording / replay | **P2** | Plan explicit post-Sarah; no video MediaRecorder path in src | `whiteboard_reliability_remaining` p3-video-seam |
| **Scheduling + external calendar** | Tutor workflow | **P2** | `docs/RELEASE-ROADMAP.md` Wave 3 + Gate B item 9; `docs/BACKLOG.md` § Scheduling | `tutoring_notes_pilot_ready_master_plan` (post-V1) |
| **Phase 4 instrumentation** — first-party, learner-type-keyed (sub-learner zero 3rd-party egress) | Observability | **P2** | `docs/RELEASE-ROADMAP.md` near-immediate post-master + Backlog Phase 11a reframe | `experience-driven_wedge` phase4-* |
| **WB-MENU-CLICK-THROUGH** — menu dismiss must not fall through to canvas | Chrome UX | **P2** | `docs/BACKLOG.md`; deferred post-Sarah in reliability plan | `whiteboard_reliability_remaining` deferred table |
| **WB-IDLE-SESSION-GUARD** — session-level idle auto-end / cost guard | Cost safety | **P2** | `docs/BACKLOG.md`; VAD helps but full idle guard open | `whiteboard_reliability_remaining` deferred |
| **WB-INPERSON-AUDIO-SUBTOGGLE** — context-scoped audio when general consent off | Consent granularity | **P3** | `docs/BACKLOG.md` **not pilot scope** | `whiteboard_reliability_remaining` Block B |
| **WB-SESSION-CONSENT-OVERRIDE** — per-session waiting-room override | Consent | **P3** | `docs/BACKLOG.md` **won't build for Sarah** | `whiteboard_reliability_remaining` |
| **TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE** — real multi-instance integration harness | Test infra | **P3** | `docs/BACKLOG.md` post-master-stable | `whiteboard_reliability_remaining` deferred |
| **Operator: scoped test-data wipe** + **orphaned blob sweep** | Operator tooling | **P3** | `docs/BACKLOG.md` § Operational follow-ups; no `operator:wipe` in `package.json` | `phase_0_hardening` Part B; master plan Phase 8 partial |
| **Master plan Phases 7–12** (status model, Stripe, org MVP, PostHog, etc.) | Platform / GTM | **P3** | `docs/RELEASE-ROADMAP.md` Waves 4–5 + Backlog deferred | `tutoring_notes_pilot_ready_master_plan` phase-7..12 |
| **Pricing / Stripe / marketplace / Whisper abstraction** | Commerce | **P3** | `recorder_refactor_wrap` "NOT in this plan"; `RELEASE-ROADMAP.md` Wave 5 | `recorder_refactor_wrap` deferred list |
| **Desmos live-state capture (Phase 1.5)** | Whiteboard embed | **P3** | `docs/RELEASE-ROADMAP.md` Backlog; `WHITEBOARD-STATUS.md` follow-up | `whiteboard_mvp` phase1-graphing caveat |
| **Formal eval harness for map/reduce** (post-Sarah iteration flywheel) | AI ops | **P3** | Ratified post-Sarah in reliability plan; `ai-models.ts` gives env lever only | `whiteboard_reliability_remaining` p3-model-abstraction |
| **Debounced-disconnect pause trigger** — confirm ~6s `PEER_EVICTION_TIMEOUT_MS` vs transient blips | Clock / disconnect | **P3** | Plan § Open for Andrew — **OPEN at p3-clock execution**; `session-clock.ts` implements pause/freeze | `whiteboard_reliability_remaining` |
| **p-test-account-reset** at master cut (preserve Andrew + Sarah admins) | Ops / data | **P3** | Plan todo still pending; master cut happened 2026-07-09 with waive docs — reset not evidenced in src | `whiteboard_reliability_remaining` p-test-account-reset |
| **phase0-stop** — deliberate break + Vercel deploy-abort verification | Test gate | **P3** | `db448af5` phase0f partial (`test:regression` exists); full visual gate per original spec unverified | `see_the_existing_plan_file...db448af5` phase0-* |

---

## Already-captured (in BACKLOG and/or RELEASE-ROADMAP — do not re-derive from plans)

| Theme | Where captured |
|-------|----------------|
| Experience-Driven Wedge program overlay + founding principle | `BACKLOG.md` § Program mapping; `RELEASE-ROADMAP.md` § Strategic refresh 2026-06-12 |
| Gate A / B / V1 sequencing tiers | `RELEASE-ROADMAP.md` § Wave 3; `BACKLOG.md` § V1 redesign — pre-master |
| Part 3 spine (clock, per-speaker, VAD, finalize) — status + smoke findings | `BACKLOG.md` § Part 3 hardware-smoke, wb-wave5-polish, v1-redesign durability-wave |
| Consent lattice IDs (`WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME`, `WB-NOTES-DIVORCE-EMAIL-STATES`, `WB-CONSENT-UNCONDITIONAL`, `CONSENT-UX-REDESIGN`, etc.) | `BACKLOG.md` § Consent design pass |
| Post-Sarah UX backlog (ghost viewport, in-app chat, device picker dedupe, replay phone layout, …) | `BACKLOG.md` § Post-Sarah / future; usersmoke quicklists |
| Wave 1–6 item tables (reliability, polish, brand, admin, pitch, replay) | `RELEASE-ROADMAP.md` Waves 1–6 + Backlog section |
| PLAYWRIGHT-GAPs for hardware-only A/V | `BACKLOG.md` § Whiteboard A/V reliability floor — PLAYWRIGHT-GAPs |
| Go-to-Sarah durability pillars A–D + bug list E1–E6 | Shipped in merge-audio src; residual bugs triaged in `BACKLOG.md` (not re-listed as plan todos) |
| `MASTER-CUT-2026-07-09` waive + known post-cut cleanup | `BACKLOG.md` row + orchestrator state |

---

## Shipped / obsolete (do not carry as plan work)

| Item | Evidence |
|------|----------|
| **Entire `tutoring_notes_release_plan_781d48c1`** — audit + Vercel/Neon deploy + Section A/B/C | Plan header **SUPERSEDED 2026-05-27**; all todos `completed` |
| **`whiteboard_-_match_wyzant_cc1eb419.plan.md`** stub | **SUPERSEDED 2026-05-27**; points to `RELEASE-ROADMAP` + `WHITEBOARD-STATUS`; Phase 1 todos `completed` |
| **`whiteboard_mvp_phased_plan_2be643b4` Phase 1 (1.1–1.13)** — schema, event-log, adapter, sync host, workspace, PDF, math, Desmos, replay, tests | Todos `completed`; `docs/WHITEBOARD-STATUS.md` phase table shipped |
| **`live_session_lifecycle_and_authed_join_85ab15e4`** — schema, `/join`, waiting overlay, capture re-gate | All plan todos `completed`; `src/app/join/[sessionId]/`, `SessionParticipant`, `WaitingRoomOverlay.tsx` |
| **`live_session_floor_2e662852` P1–P3** — in-frame review, student unified shell, waiting room + consent hook-in | Absorbed into wave5 / v1-redesign; superseded by lifecycle + durability plans |
| **`recorder_refactor_wrap_and_sarah_unblock_8301e036` Phases 4–6 + B1–B5** | Todos `completed` (smoke `in_progress` is process-only) |
| **`phase_0_hardening_2d24ddb5` doc todos** — backlog operator entries + plan file edit | Todos `completed`; operator **implementation** remains backlog-only |
| **`go_to_sarah_durability_cut_4d5e7c76` pillars A–D** | `WhiteboardEventBatch`, VAD/`transcriptionOnly`, `session-clock.ts`, `useRemoteMicRecorders.ts`, `finalize-whiteboard-session-client.ts`, `assemble-persisted-state.ts` in merge-audio |
| **`whiteboard_reliability_remaining` Part 0, 2A/2B core, Part 3 design pass** | Documented landed in plan "Already landed" + BACKLOG smoke PASS for Part 3 spine |
| **`p1b-av-coordinator`** | `src/hooks/useLiveAvCoordinator.ts` + tests |
| **`p3-clock`** | `src/lib/recording/session-clock.ts` |
| **`p3-perspeaker-capture` / VAD lanes** | `remote-stream-recorder.ts`, `useRemoteMicRecorders.ts`, `wb-vad-per-speaker-durability.spec.ts` |
| **`p3-model-abstraction` (config lever)** | `src/lib/ai-models.ts` env-driven TRANSCRIBE/MAP/REDUCE models |
| **`see_the_existing_plan_file...db448af5` Phase 1 multi-recording** | `SessionRecording.orderIndex` + `@@unique([whiteboardSessionId, orderIndex])`; `noteId` on recording |
| **Phases 2–5 of db448af5** (layout grid, admin notes history, session times, share seen-tracking) | `NoteView` model, `mark-seen` route, `/admin/students/[id]/notes`, `startTime`/`endTime` on `SessionNote` |
| **Phase 0a regressions folder** | `src/__tests__/regressions/` + `npm run test:regression` |
| **Cross-cutting reliability-bar + recorder audit** | `.cursor/rules/reliability-bar.mdc` (agenticPipeline); BACKLOG reliability gaps section |
| **`tutoring_notes_pilot_ready_master_plan` Phases 0, 1, 4** | Plan status `completed`; LIVE-AV + recorder lifecycle docs |
| **Phantom-stroke bug, CONSENT_ENFORCEMENT flag, anonymous `/w` join (retired to redirect)** | Marked done in reliability remaining plan |

---

## Per-plan archive notes

### `whiteboard_reliability_remaining_b082882.plan.md`
**Status:** Active through Jul 2026; **most Part 3 shipped** on merge-audio tip; **Sarah merge / master cut executed 2026-07-09** with explicit `test:wb-sync` waive.

**Still-relevant strategic content for backlog/roadmap:**
- End-to-end session arc acceptance (auth join → waiting → live A/V → end → notes in seconds) remains the **north-star smoke shape** even though merge happened.
- Tap-before-mix / transcription-lane vs mixdown-replay invariant (#6) — **document in `LIVE-AV.md`** if not already fully reflected post-implementation.
- Block B consent honesty is **still P0** in BACKLOG despite Part 3 capture shipping.
- Remaining **structural** debt: `useRecordingCoordinator`, unified `WbTopBar`, scoped CSS split — fold under **WB-COMPONENTS-PASS**, not a reopen of the whole plan.
- **Unique open micro-item:** debounced-disconnect pause trigger confirmation (plan § Open #2).

**Safe to archive:** Execution kickoff (branch `wb-wave5-polish`, worktree paths), checkpoint merge discipline, Part 3 design-pass gate (approved 2026-06-30), resolved decision tables (stream topology, t=0, etc.).

---

### `whiteboard_mvp_phased_plan_2be643b4.plan.md` + `whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_cc1eb419.plan.md`
**Status:** Phase 1 **complete**; stub file superseded 2026-05-27.

**Still-relevant:**
- **Phase 2 demo gate** (3 real Sarah sessions → which Wyzant gap she reaches for) — **only unchecked strategic gate** in `WHITEBOARD-STATUS.md`.
- Four Phase 2 candidate surfaces (TipTap essay, Monaco code, Office→PDF, Wolfram) — keep as **on-demand wedge backlog**, not a build queue.
- Sarah Q&A verbatim + 4 guardrails — **already in `WHITEBOARD-STATUS.md`**; archive plan without copying.
- Adversarial review #10–21 follow-ups (orphan session cleanup cron, storage ledger, etc.) — mostly in BACKLOG/Wave 6 or informational.

**Obsolete:** All Phase 1 implementation todos, STOP markers, tier assignments.

---

### `experience-driven_wedge_ae2776e1.plan.md`
**Status:** Strategic compass; **rolling-wave** — detailed tasks intentionally not in plan file.

**Still-relevant (ensure ROADMAP/BACKLOG stay aligned):**
- **Phase 2 continuity + Phase 3 note-quality** are the **moat** — not fully backlog-rowed; brainstorm doc is spec (`docs/research/continuity-wedge-brainstorm-2026-06-12.md`).
- **Founding principle** (total honesty, evidence-derived claims) — elevate in AGENTS/rule if not done; already bannered in BACKLOG.
- **Design-compatible-for** list (engagement surfaces, marketplace, parent arc) — matches RELEASE-ROADMAP Backlog deferrals.
- Phase 1 floor = Gate A2/A5/A6 + audio clock — **partially shipped**, **A5/A6 comprehensive passes still open**.

**Obsolete:** Thin waiting room on anonymous token (superseded by authed join + `WaitingRoomOverlay`).

---

### `tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Status:** **SUPERSEDED 2026-05-27** → `RELEASE-ROADMAP.md` is sequencing source.

**Still-relevant:**
- Phase-level **intent** for pending phases 2–3, 5–12 maps 1:1 to RELEASE-ROADMAP waves — **do not duplicate**; use roadmap tables.
- North star quote + multi-stream FSM philosophy — lives in `AGENTS.md` / `RECORDER-LIFECYCLE.md`.
- Stale plan items table in RELEASE-ROADMAP § "Stale plan items — do NOT re-execute" — **authoritative** vs plan body.

**Obsolete:** 2026-05-19 status block, per-phase implementation detail (~257KB), most completed phase specs.

---

### `tutoring_notes_release_plan_781d48c1.plan.md`
**Status:** **SUPERSEDED**; historical audit + zero-budget deploy.

**Archive note:** Audit findings section useful as **2026-04 archaeology** only. All execution todos completed. No carry items.

---

### `live_session_lifecycle_and_authed_join_85ab15e4.plan.md`
**Status:** **Fully executed** (plan todos all `completed`).

**Archive note:** Ratified decisions (Option A `#k=` fragment, overlay-not-remount, Start oracle) are **institutional** — captured in `docs/handoff/authed-session-access-design-2026-06-10.md` and session-lifecycle consent design. **Out-of-scope** items (Plan #2 consent teeth, mid-session swap) correctly landed in later plans/BACKLOG.

---

### `live_session_floor_2e662852.plan.md`
**Status:** **Superseded by execution** on v1-redesign / wave5 branches.

**Archive note:** Root-cause narrative (RSC refresh destroying in-shell review) informed fixes; **P1 review routing largely shipped**. Waiting room + consent items **forked** into lifecycle plan + reliability remaining. Keep **SSG-2 / End-and-review** linkage when archiving — student-detail End is **still open** (BACKLOG).

---

### `go_to_sarah_durability_cut_4d5e7c76.plan.md`
**Status:** **Substantively shipped**; master cut 2026-07-09 with documented waivers.

**Still-relevant:**
- **Testing discipline** paragraph (Playwright-to-spec, merge-boundary `test:wb-sync`) — process, not product.
- Post-cut **REAL-FAIL triage** list in BACKLOG (`MASTER-CUT-2026-07-09`) supersedes plan gate checklist.
- Locked decisions (video out, notes prompt as-is, 1:1 LearnerProfile attribution) — still valid.

**Obsolete:** Wave 0 migration todo (landed), pillar A–D build todos, NEON migration count (~19) as active work.

---

### `recorder_refactor_wrap_and_sarah_unblock_8301e036.plan.md`
**Status:** **Historical** (Apr 2026 refactor + Sarah unblockers).

**Archive note:** Documents **B1–B5** fixes (client-direct blob upload, tab-switch keep-mounted, 5-section notes, gapless rollover) — all shipped. "What's NOT in this plan" (Stripe, marketplace, templates) — still deferred per RELEASE-ROADMAP. Manual 7-step smoke checklist = **superseded** by Playwright + Andrew smokebooks.

---

### `phase_0_hardening_+_operator_cleanup_2d24ddb5.plan.md`
**Status:** **Meta-plan completed** (edited db448af5 + BACKLOG operator stubs).

**Still-relevant:**
- Operator wipe/sweep **full guard spec** in BACKLOG — implementation still open.
- Phase 0 **implementation** on db448af5 plan — **partially shipped** (regressions + visual Playwright exist; not all 14 baseline snapshots / Vercel abort-verify proven).

---

### `see_the_existing_plan_file._this_update_reorders_to_put_multi-recording_(phase_1,_was_phase_5)_right_db448af5.plan.md`
**Status:** **Mostly shipped** (Phases 0–5 features exist in merge-audio).

**Still-relevant:**
- **phase0-stop** verification ritual (break CSS → deploy abort) — optional process debt.
- Plan ordering rationale (multi-rec before UX waves) — historical only.

**Obsolete:** Individual Phase 1–5 implementation todos.

---

## Cross-verify summary (merge-audio vs plans)

| Plan claim | merge-audio reality |
|------------|---------------------|
| Part 3 per-speaker + VAD + monotonic clock | **Shipped** — `session-clock.ts`, VAD overrides in tests, `transcriptionOnly` in outbox |
| Coordinator extraction | **Partial** — `useLiveAvCoordinator` yes; `useRecordingCoordinator` no |
| Unified WbTopBar | **Not shipped** — fragmented chrome controls only |
| Client consent projection | **Incomplete** — BACKLOG blockers remain |
| Gate A5 / A6 comprehensive audits | **Not started** per BACKLOG (despite partial Playwright invariants) |
| Experience wedge Phases 2–4 | **Roadmap overlay only** — minimal implementation |
| Whiteboard Phase 2 (Wyzant gaps) | **Gated** — awaiting Sarah usage signal |
| Master cut / Sarah gate | **Executed 2026-07-09** with waivers — plan's "no interim merge" discipline moot |

---

## Recommended archive actions

1. **Do not resurrect** superseded plan files as execution sources — use `RELEASE-ROADMAP.md` + `BACKLOG.md` + `ORCHESTRATOR-STATE.md`.
2. **Promote to explicit BACKLOG rows** (if missing): continuity engine Phase 2 bullets from `experience-driven_wedge` (currently banner-only).
3. **Close plan todos mentally** for shipped pillars; **keep CARRY table P0 rows** on active burn-down.
4. Preserve **Sarah Q&A, guardrails, adversarial review** in `WHITEBOARD-STATUS.md` — already done; plans can go to cold archive.
5. On archive: link this file from `docs/archive/ARCHIVE-LEDGER.md` when Andrew runs doc-cleanup merge (out of scope for this extraction).
