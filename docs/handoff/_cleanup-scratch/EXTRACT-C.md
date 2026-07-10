# BATCH C extraction — wb-wave5 + unify handoff docs

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources:** 14 handoff docs under `docs/handoff/` (wb-wave5 execution queue + 13 smokebooks/plans/bootstrappers).

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **WS-X — PDF board stroke leak via v3 broadcast tombstone resurrection** | Whiteboard sync / apply-path | **P1** | Execution queue WS-T #5: fingerprint guard insufficient; leak path = `applyRemoteToCanvas` tombstone → v3 broadcast does **not** filter `isDeleted` (`useTutorLiveDocumentWire.ts` filters only degenerate linear elements, not tombstones). WIP branch `wb-wave5-ws-x-wip` preserved; 2nd fix attempt hard-stopped. | `wb-wave5-execution-queue.md` |
| **WS-T #9 — gate-only End IDB crash blocks review overlay** | Whiteboard IDB / review | **P1** | `wb-review-overlay-3paths.spec.ts` gate path `test.fixme` — intermittent "IDB object store not found" when gate End without prior live mount. | `wb-wave5-execution-queue.md` |
| **WS-T #8 — roster End shows replay CTA when `recording-count===0`** | Review overlay / finalize | **P1** | Execution queue WS-T #8: `assertOverlayAffordanceMatchesDb` expects `wb-review-no-recording` when count=0; roster path test still active (not fixme). `canReplay` uses `hasAudio \|\| eventCount>0` (`SessionReviewMode.tsx:126-127`) — may disagree with DB recording-count oracle. | `wb-wave5-execution-queue.md` |
| **SMOKE-BLOCK-1 — reachability under-reports connected peer (Start dead)** | Live A/V / waiting room | **P1** | WS-U-FRAGILE 1.2 = same as BACKLOG SMOKE-BLOCK-1. A/V works but `reachableParticipants` stays 0 → Start disabled + student "Connecting…". | `wb-wave5-execution-queue.md`, `wb-wave5-next-session-bootstrap.md` |
| **CLIENT-AUDIO-CONSENT-GATE — shallow client consent enforcement** | Recorder / consent | **P1** | BACKLOG: denied audio still captured/uploaded/transcribed client-side; Sarah-merge blocker. Consent perms smokebook ratified modal removal but enforcement path is snapshot-driven. | `wb-wave5-consent-perms-2026-06-30.md`, BACKLOG |
| **PRESARAH-1 — always-on recording; remove recording-intent toggles** | Recorder FSM / UX | **P1** | BACKLOG locked decision; unify smoke item 2 notes Start/Pause absent. Paradigm change not fully landed per backlog. | `wb-unify-stabilize-smokebook-2026-06-17.md`, BACKLOG |
| **WS-N5 — resume FSM `armed` window drops stroke capture after reopen** | Recorder FSM | **P1** | Execution queue: on reopen FSM re-enters `armed` → `wbCaptureActive` false → strokes render but aren't logged until `recording`. Same family as solo/in-person stroke gap. | `wb-wave5-execution-queue.md` |
| **WS-N — `pagehide` in-progress segment flush to durable store** | Outbox / tab-kill durability | **P1** | Execution queue WS-N: N1–N3 landed; **pagehide flush** listed as backlog supporting fix, not done. `useAudioRecorder.ts` has pagehide for draft; full in-progress segment flush at kill boundary still called out. | `wb-wave5-execution-queue.md` |
| **WS-I-PRESTART-MUTE — verify on integrated tip** | Recorder audio-graph | **P1** | BACKLOG lists branch-only defect; **code shows fix** (`WbTopBarMicControl.tsx:65-68` mute-before-acquire; `wb-tutor-recording-mute.spec.ts` "mute before graph ready"). **CARRY = confirm green + remove stale BACKLOG row**, not re-implement. | `wb-wave5-execution-queue.md` WS-T #10, BACKLOG |
| **Phone student A/V — bidirectional audio/video broken** | Live A/V hardware | **P1** | Wave5 polish smokebook item 19 FAIL: no student audio on phone, tiles missing, disconnect on rotate, no mic control on phone landscape. PLAYWRIGHT-GAP (real WebRTC). | `wb-wave5-polish-smokebook-2026-06-21.md` |
| **WS-M — two-device hardware smoke before master merge** | Live A/V | **P1** | Execution queue: student publish graph shipped (`createMicPublishGraph`) but requires real two-device smoke (tutor hears student). | `wb-wave5-execution-queue.md` |
| **WS-V / Part-2 site-wide mechanical test buildout** | Test infra | **P1** | `part2-test-buildout-plan.md` referenced; P1-J1+ in execution. Inventory floor ≠ ceiling. | `wb-wave5-execution-queue.md`, `wb-wave5-next-session-bootstrap.md` |
| **WS-A F-1 — outbox register-failure attempt cap** | Upload outbox | **P2** | Execution queue deferred: unbounded retries on persistently-failing register; ~10-line fix + 5-axis before v1-redesign merge. | `wb-wave5-execution-queue.md`, `wb-wave5-next-session-bootstrap.md` |
| **WS-Q config slice — tutor-configurable time-alert defaults** | Settings / recorder | **P2** | Copy slice shipped; **deferred:** configurable interval, chime on/volume defaults, `AdminUser` settings columns, chime-fire-on-session-elapsed hook. | `wb-wave5-execution-queue.md` |
| **WS-U-FRAGILE 1.3 — in-person waiting copy + presentation** | Recorder FSM presentation | **P2** | FOR-ANDREW-U13: wrong "Waiting for your student…" when IN_PERSON; design recommends blank banner + `Starting…` grey pill. `derivePresentation` has `inPersonMode` for recording pill but armed-banner copy may still leak (BACKLOG SMOKE-BUG-10). | `wb-wave5-execution-queue.md` |
| **SMOKE-BUG-10 — in-person "waiting for student" banner** | UX copy | **P2** | BACKLOG: `sessionMode` not consulted for banner; same root as old SMOKE-BLOCK-5 family. FSM now records in IN_PERSON (`inPersonMode` @ `lifecycle-machine.ts:438-441`) but banner copy may persist in other states. | BACKLOG, `wb-wave5-execution-queue.md` |
| **SMOKE-BUG-11 — tutor mic picker UI not initialized from persisted device** | A/V device picker | **P2** | BACKLOG: capture restores mic but `useLiveAV.pickedMicSlot` not bridged from `tn-mic-device-id`. Waiting-polish notes "doesn't go to her working mic by default." | BACKLOG, `wb-wave5-waiting-polish-smokebook-2026-06-28.md` |
| **DEVICE-PICKER-DEDUPE / WB-DEVICE-PICKER-DUPES** | A/V device picker | **P2** | Duplicate entries + hotplug audio not hooking; wave5 polish item 20 notes pickers "wonky"; unify plan deferred ID. | `wb-unify-stabilization-plan-2026-06-17.md`, `wb-wave5-polish-smokebook-2026-06-21.md`, BACKLOG |
| **WB-IMAGE-IMPORTER — image insert missing** | Whiteboard assets | **P2** | Unify smoke item 4 regression note; long-standing omission. | `wb-unify-stabilize-smokebook-2026-06-17.md`, BACKLOG |
| **Thin-viewport top-bar compaction — controls leave viewport before ⋯** | Chrome responsive | **P2** | Part1 checkpoint PARTIAL: buttons go off-screen instead of compacting to More; End Session should stay visible. Liveboard smoke: over-compaction deferred. | `wb-wave5-polish-part1-checkpoint-smokebook.md`, `wb-wave5-liveboard-chrome-smokebook-2026-06-29.md`, BACKLOG `WB-STUDENT-TOPBAR-CONTRACTION` |
| **Student desktop mic level meter missing (item 15 FAIL)** | Chrome / A/V | **P2** | Wave5 polish smokebook item 15: "Bars not there at all" on student desktop top bar. Liveboard 8c PARTIAL (DOM present; tutor regression noted then fixed in later addenda). | `wb-wave5-polish-smokebook-2026-06-21.md` |
| **Dark theme native device picker contrast (item 18 FAIL)** | Chrome / a11y | **P2** | Wave5 polish smokebook item 18 FAIL; Playwright exists but hardware still failed. | `wb-wave5-polish-smokebook-2026-06-21.md` |
| **Student `[student-apply]` console spam (item 17 PARTIAL)** | Observability | **P2** | `[pvs]` quieted but `[student-apply]` spam remains per Andrew note. Cross-ref BACKLOG `WB-STUDENT-CONSOLE-NOISE`. | `wb-wave5-polish-smokebook-2026-06-21.md` |
| **Verify-email success copy missing** | Auth UX | **P2** | Polish confirm item 3 PASS-but: wants "successfully verified" style copy vs silent landing. | `wb-wave5-polish-confirm-2026-06-29.md` |
| **WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4** | Auth / join | **P2** | Waiting-polish item 7 FAIL notes; B1 won't-fix; stale-cookie path improved (confirm item 1 PASS) but quickwins item 6 still FAIL on wrong-PIN-then-self-learner 404. BACKLOG WB-ADULT-JOIN-ENABLEMENT. | `wb-wave5-waiting-polish-smokebook-2026-06-28.md`, `wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md`, `wb-wave5-polish-confirm-2026-06-29.md` |
| **Parent→self-learner toggle after account creation** | Auth / product | **P2** | Waiting-polish item 7 note: no way to toggle account to self-learner post-create. | `wb-wave5-waiting-polish-smokebook-2026-06-28.md` |
| **Claim flow: self-learner shouldn't see child PIN setup** | Auth / claim | **P2** | Waiting-polish item 7: adult self-learner claim asks learner name/PIN inappropriately. | `wb-wave5-waiting-polish-smokebook-2026-06-28.md` |
| **Recovered-audio prompt — always keep, no Discard** | Recorder UX | **P2** | Part1 checkpoint item 3 note: banner asks recover vs discard; Andrew prefers always keep. Maps WS-U 1.5 (confirm before discard) — partial overlap. | `wb-wave5-polish-part1-checkpoint-smokebook.md` |
| **WS-H non-blocking follow-ups NB-1–NB-5** | Mic persistence | **P2** | Execution queue: per-attempt timeout, log enumerate error, success warn with device, clear stale groupId, groupId-collision test — tracked not done. | `wb-wave5-execution-queue.md` |
| **WS-J / WS-K / WS-G prod migration apply** | DB / deploy | **P2** | Migrations authored (`20260705140000_wsj_billable_rounding`, `20260705000000_wsk_live_reduce_watermark`, concat cols); prod apply = Andrew greenlight HARD STOP. | `wb-wave5-execution-queue.md` |
| **SEC — `tutor-asset/route.ts` any-origin blob URL** | Security | **P2** | Execution queue deferred: SSRF-adjacent; pin allowed blob origin. | `wb-wave5-execution-queue.md` |
| **SEC — `/api/test/whiteboard/*` gate hardening** | Security / test routes | **P2** | Execution queue FOR-ANDREW: pin `PLAYWRIGHT_TEST_SECRET` in prod, `VERCEL` belt, shared helper, unit test. | `wb-wave5-execution-queue.md` |
| **RELAY-MARATHON-SHARDS** | CI infra | **P2** | ~20min serial marathon → false reds; shard runner exists (BACKLOG notes merge bug fixed `fb3c039`). Follow-up: operational shard gate. | `wb-wave5-execution-queue.md`, BACKLOG |
| **JEST-ISOLATION-CLASS-2** | CI infra | **P2** | `--workers=1` gate; F1 truncate failed; eliminate fire-and-forget DB stragglers. | `wb-wave5-execution-queue.md`, BACKLOG |
| **SMOKE-PERF-1 — Finalizing slow on short sessions** | End-session pipeline | **P2** | BACKLOG: awaited snapshot on blocking path; Andrew 2026-07-08 rated tolerable not Sarah blocker. | BACKLOG |
| **Exit→rejoin A/V slow / ghost (unify item 21 FAIL)** | Live A/V | **P2** | Unify W1-3 smoke item 21 FAIL; R3 N/A (no two-device). Re-smoke R1/R2 PASS but R3/R4 not re-proven on hardware. | `wb-unify-stabilize-smokebook-2026-06-17.md` |
| **AV-REFRESH-LOSS — student hard-refresh loses A/V** | Live A/V | **P2** | Student shell triage AV-REFRESH-LOSS; not proven fixed in later waves. | `wb-student-shell-smoke-triage-2026-06-17.md` |
| **WB-STUDENT-BOARD-TABS — student sees only Board 1 tab** | Chrome parity | **P2** | Unify smoke items 1/3/17 PARTIAL; BACKLOG entry. Strokes sync but tab strip incomplete. | `wb-unify-stabilize-smokebook-2026-06-17.md`, BACKLOG |
| **WB-LINE-END-TOUCH — finish multi-segment line on touch** | Touch UX | **P2** | Wave4 R2-1 note; BACKLOG. | `wb-wave4-responsive-smokebook-2026-06-19.md`, BACKLOG |
| **WB-HAND-TOOL-MISSING** | Tools | **P3** | Wave4 smoke item 2; BACKLOG. | `wb-wave4-responsive-smokebook-2026-06-19.md`, BACKLOG |
| **Mobile AV pip position (bottom-right not top-right)** | Mobile chrome | **P3** | Mobile portrait smokebook Section E FAIL; BACKLOG SR-16 deferred. | `wb-mobile-phone-portrait-smokebook-2026-06-10.md`, BACKLOG |
| **WS-U-BATCH taste/IA items (2.8–2.15)** | UX polish | **P3** | Student Exit confirm, admin "Outbox" rename, notes "N segments" wording, consent-denied next step, theme icon, etc. | `wb-wave5-execution-queue.md` |
| **Known issues page — placement/tone Andrew review** | Product comms | **P3** | Draft + in-app page shipped (`/admin/settings/known-issues`); execution queue FOR-ANDREW placement/tone still open. | `wb-wave5-execution-queue.md`, `known-issues-and-roadmap-DRAFT.md` |
| **vad-min-tune — lower VAD_MIN_SEGMENT_SECONDS after concat** | Recorder tuning | **P3** | Execution queue + bootstrap backlog; 25s→8–10s after WS-G. | `wb-wave5-execution-queue.md` |
| **SMOKE-POST-3 — tutor "Start anyway" degraded mode** | Waiting room | **P3** | BACKLOG post-Sarah; depends on SMOKE-BLOCK-1 fix first. | BACKLOG |
| **WB-SCREEN-WAKE-LOCK / WB-THUMBNAIL-GRAPH / WB-OLD-PHONE-PERF** | Platform | **P3** | Unify plan out-of-scope table. | `wb-unify-stabilization-plan-2026-06-17.md` |
| **Agentic audit pipeline / learner sign-out shared device / duplicate email** | Process / auth | **P3** | Bootstrap BACKLOG section only. | `wb-wave5-next-session-bootstrap.md` |
| **Test-helper duplication (`installControllableUploadStub`)** | Test debt | **P3** | Execution queue phase-2 follow-up (c). | `wb-wave5-execution-queue.md` |
| **RECORDER-LIFECYCLE.md preview-before-Start doc drift** | Docs | **P3** | Execution queue notes ended sessions mount `SessionReviewMode` not preview component. | `wb-wave5-execution-queue.md` |
| **Consent modal removal — Andrew legal comfort sign-off** | Legal / product | **P2** | Consent perms smokebook header: Andrew must verify comfortable before approving; smoke items unchecked. | `wb-wave5-consent-perms-2026-06-30.md` |
| **Vercel Skew Protection enablement** | Deploy infra | **P2** | WS-P: Andrew dashboard action; deliverables 1/3/4 shipped but Skew Protection not enabled per queue. | `wb-wave5-execution-queue.md` |

---

## Already-in-backlog list

Cross-check `docs/BACKLOG.md` — these OPEN items from BATCH C sources are **already tracked** (do not duplicate as new backlog rows):

| BACKLOG ID / section | Overlaps BATCH C item |
|---------------------|----------------------|
| **SMOKE-BLOCK-1** (`wb-wave5-polish hardware-smoke`) | WS-U-FRAGILE 1.2 reachability / Start latch |
| **SMOKE-BLOCK-5** | IN_PERSON/solo stroke+audio capture — **BACKLOG text stale**: `inPersonMode` FSM + `wb-in-person-audio-start.spec.ts` landed; update backlog to reflect partial fix + remaining stroke/banner gaps |
| **SMOKE-BUG-10** | In-person waiting banner |
| **SMOKE-BUG-11** | Tutor mic picker not restored in UI |
| **WS-I-PRESTART-MUTE** (`wb-wave5 full-suite baseline`) | Likely **resolved in code** — backlog should be closed after gate green |
| **WS-E2-APPLY-REMOTE-PDF-STROKE-LEAK-SPEC** | Test-only — **RESOLVED** `abfbe9a` (distinct from product WS-X) |
| **RELAY-MARATHON-SHARDS** | Playwright marathon exhaustion |
| **JEST-ISOLATION-CLASS-2** | Jest parallel flake |
| **CLIENT-AUDIO-CONSENT-GATE** | Client consent projection blocker |
| **PRESARAH-1**, **PRESARAH-2** | Recording paradigm + end copy |
| **SMOKE-PERF-1** | Finalizing latency |
| **SMOKE-END-WINDDOWN** | Merged 2026-07-09 — **not CARRY** |
| **WB-ADULT-JOIN-ENABLEMENT**, **WB-JOIN-ADULT-LEARNER** | Adult self-learner join gaps |
| **WB-PARENT-JOIN-AS-CHILD** | Parent join picker (post-Sarah) |
| **DEVICE-PICKER-DEDUPE** | Device picker duplicates |
| **WB-IMAGE-IMPORTER** | Missing image importer |
| **WB-STUDENT-BOARD-TABS** | Student page strip |
| **WB-STUDENT-TOPBAR-CONTRACTION** | Student top-bar progressive compaction |
| **WB-WAVE5-CHROME-POLISH** | Wave4-deferred chrome — **mostly shipped** in wave5; backlog row may be stale |
| **WB-DEVICE-PICKER-DUPES** | Same as DEVICE-PICKER-DEDUPE family |
| **WB-LINE-END-TOUCH**, **WB-HAND-TOOL-MISSING** | Touch/desktop tool gaps |
| **WB-AV-GAP-1**, **WB-AV-GAP-2** | PLAYWRIGHT-GAP hardware oracles |
| **WB-STUDENT-CONSOLE-NOISE** | Student console spam |
| **CH-SMOKE-STUDENT-MIC-PERSIST** | Mic not remembered across sessions |
| **SMOKE-BUG-2** | Stale "Call Reconnecting" pill |
| **SMOKE-BUG-5** | Replay board-tab context |
| **SMOKE-BUG-7** | Student mic persist across sessions |
| **TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE** | Strategic harness (post-master) |
| **Mobile AV pip — SR-16** | Pip drag/resize mobile |
| **ERASURE-CLIENT-STORE-UNREACHABLE** | Client IDB not server-purgeable |

**Not in BACKLOG (net-new CARRY candidates):**

- **WS-X** product bug (v3 `isDeleted` broadcast) — only in execution queue
- **WS-T #8** roster overlay dishonesty vs `recording-count`
- **WS-T #9** gate-only IDB crash
- **WS-N5** resume armed stroke window
- **WS-N pagehide** in-progress flush (sub-item of WS-N)
- **WS-H NB-1–NB-5** mic persistence follow-ups
- **WS-Q** config/DB slice (time-alert settings)
- **WS-A F-1** register attempt cap
- **SEC** tutor-asset + test-route hardening rows (queue says "promote to BACKLOG" — may be missing)
- **Verify-email success copy** (polish confirm)
- **Recovered-audio always-keep** (part1 checkpoint note)
- **Phone student A/V regressions** (wave5 polish item 19) — partial overlap WB-AV-GAP-* but not the full phone regression cluster

---

## Shipped / obsolete list

| Item | Evidence | Source doc |
|------|----------|------------|
| **WB unification — delete `StudentLiveWorkspaceClient`** | `StudentLiveWorkspaceClient.tsx` absent; students route through `WhiteboardWorkspaceClient` with `data-role`. | `wb-unify-stabilization-plan-2026-06-17.md` |
| **Unify Wave 1–3 engine fixes (bleed, eraser, undo)** | Re-smoke R1/R2 PASS @ `c0d80bd`. | `wb-unify-stabilize-smokebook-2026-06-17.md` |
| **WS-I tutor mute in recording** | Shipped per execution queue; `setTutorRecordingMute` + tests. | `wb-wave5-execution-queue.md` |
| **WS-N tab-kill durability (N1–N3, F-2)** | Commits `32c95a7`, `6799aa4` per queue. | `wb-wave5-execution-queue.md` |
| **WS-N4 gate/roster finalize `extraSegments`** | `finalize-whiteboard-session-client.ts` + `0df4bf3`. | `wb-wave5-execution-queue.md` |
| **WS-L scrubber multi-segment** | Shipped per queue. | `wb-wave5-execution-queue.md` |
| **WS-G seamless replay concat** | `concat-audio.ts`, `concatBlobUrl` column, `d20ea9a`. | `wb-wave5-execution-queue.md` |
| **WS-K live reduce notes ≤2–3s** | `notes-worker.ts` live reduce + watermark migration; Race A fix `5a211f68`. | `wb-wave5-execution-queue.md` |
| **WS-O board-tab overflow scroll** | `BoardTabStrip.tsx` scroll buttons + tests. | `wb-wave5-execution-queue.md` |
| **WS-F waiting-room exit** | `7bff936` Cancel/Leave. | `wb-wave5-execution-queue.md` |
| **WS-H mic persistence hardening (core)** | `c26f7ce` groupId correlate + OverconstrainedError path. | `wb-wave5-execution-queue.md` |
| **WS-J billable time rounding** | `src/lib/billing/*`, settings UI. | `wb-wave5-execution-queue.md` |
| **WS-M student-side mic boost** | `createMicPublishGraph` in `useLiveAV.ts`. | `wb-wave5-execution-queue.md` |
| **WS-Q copy slice** | "Time alert volume:" + hint. | `wb-wave5-execution-queue.md` |
| **WS-R pencil roughness UI hide** | Chrome-only hide for freedraw. | `wb-wave5-execution-queue.md` |
| **WS-W replay auto-start at ~7.3s** | Fixed `610ee90` — `audioDurationSettled` gates on WebM resolve. | `wb-wave5-execution-queue.md` |
| **WS-P deliverables 1/3/4 + deliverable 2** | `build-identity.ts`, `/api/version`, `chunk-load-error.ts`, `DeployClientGuards`, `useDeployFreshness.ts`, `capture-defer-registry.ts`. Queue said 2 parked — **code shows shipped**. | `wb-wave5-execution-queue.md` |
| **WS-U-COPY wave (9 items)** | `dfe1bf4` — jargon copy, beforeunload, review error link, etc. | `wb-wave5-execution-queue.md` |
| **WS-U 2.4/2.5 LIVE badge + sync pill** | `65f6a93` presentation binding. | `wb-wave5-execution-queue.md` |
| **IN_PERSON audio starts without peer** | `lifecycle-machine.ts` `inPersonMode`; `wb-in-person-audio-start.spec.ts`. Addresses WS-T #6 / old SMOKE-BLOCK-5 audio class. | `wb-wave5-execution-queue.md` |
| **Waiting-polish quick wins 2a/1a/1b/3b/7b** | Resmoke PASS items 1–3, 5; remote initials PASS. | `wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md` |
| **Tutor waiting-room mic dropdown layout (addendum 4–9)** | PASS @ `70fb158` — on-page picker + dropdown boost/chime. | `wb-wave5-polish-confirm-2026-06-29.md` |
| **Adult stale-cookie join (confirm item 1)** | PASS on combined confirm @ `f649c62` / later tips. | `wb-wave5-polish-confirm-2026-06-29.md` |
| **Consent modal removed; durable consent model** | Code + consent perms smokebook spec; server defaults `consentAcknowledged`. | `wb-wave5-consent-perms-2026-06-30.md` |
| **Wave5 chrome Playwright coverage (items 1–13 many)** | Part1 smokebook: "Do NOT re-smoke (automated)" list. | `wb-wave5-polish-part1-checkpoint-smokebook.md` |
| **Wave4 R2-1/R2-2 mobile styles + shapes** | PASS @ `17dc8d4`. | `wb-wave4-responsive-smokebook-2026-06-19.md` |
| **Wave4 R2-4 single connection pill** | PASS. | `wb-wave4-responsive-smokebook-2026-06-19.md` |
| **Wave4 R3-2 student phone-portrait inline controls** | PASS @ `3814234`. | `wb-wave4-responsive-smokebook-2026-06-19.md` |
| **Wave4 R4-1 sheet × mouse close** | PASS @ `f73b52d`. | `wb-wave4-responsive-smokebook-2026-06-19.md` |
| **Wave4 R6-3/R6-4 student portrait/landscape** | PASS @ `64108cf`. | `wb-wave4-responsive-smokebook-2026-06-19.md` |
| **Mobile portrait Phases 0–3 tutor touch chrome** | Section A–D all PASS @ `40a3e94`. | `wb-mobile-phone-portrait-smokebook-2026-06-10.md` |
| **Unify plan Wave 5 polish items (a–d) view lock, coral Exit, grid icon** | Absorbed into wave5 polish + Playwright; design Q (a)(b) resolved 2026-06-21. | `wb-unify-stabilization-plan-2026-06-17.md` |
| **Student shell triage items "eliminated by construction"** | Laser receive, right-click end-line, dark-bg, divergent sync paths — unified shell. | `wb-unify-stabilization-plan-2026-06-17.md` |
| **WS-T #7 waiting-room cancel redirect** | Fixed `9450906` hard-nav. | `wb-wave5-execution-queue.md` |
| **Admin multi-segment audio loss (AudioInputTabs)** | `2278013` inline upload. | `wb-wave5-execution-queue.md` |
| **Keystone blob harness** | `a1cc2bd` — blob-gated specs run hermetically. | `wb-wave5-execution-queue.md` |
| **auth.setup flake** | `8a381ce` API-credentials login. | `wb-wave5-execution-queue.md` |
| **BUILD-GREEN tsc clusters** | Resolved per queue 2026-07-04 pass. | `wb-wave5-execution-queue.md` |
| **Duplicate solo_recording plan files** | Process cleanup note only. | `wb-wave5-execution-queue.md` |
| **wb-wave5-next-session-bootstrap** | Superseded by later queue state; historical bootstrap only. | `wb-wave5-next-session-bootstrap.md` |
| **Execution queue as live backlog index** | Superseded by BACKLOG + ORCHESTRATOR-STATE for ongoing work; snapshot frozen 2026-07-06 era. | `wb-wave5-execution-queue.md` |

---

## Per-doc archive note table

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `wb-wave5-execution-queue.md` | **Yes** (after CARRY merged) | WS-T defect tally (#5 WS-X, #8/#9 review paths), WS-N5/pagehide, WS-A F-1, SEC items, test doctrine (false-green rules), DB-SAFETY `.env`→preview-dev incident, FOR-ANDREW decision log → fold OPEN rows into BACKLOG; SHIPPED→release notes or `ORCHESTRATOR-STATE` history |
| `wb-wave5-polish-confirm-2026-06-29.md` | **Yes** | Andrew PASS/FAIL on combined polish; verify-email copy gap → BACKLOG UX; tutor mic dropdown layout **resolved** (addendum 9 PASS) — keep as smoke audit trail only |
| `wb-wave5-polish-smokebook-2026-06-21.md` | **Yes** | Hardware FAIL/PARTIAL cluster (phone A/V item 19, student meter item 15, dark picker 18, student-apply spam 17) → CARRY + WB-AV-GAP; automated items N/A per smokebook |
| `wb-wave5-polish-part1-checkpoint-smokebook.md` | **Yes** | WB-AV-GAP-1/2/3 human results; thin-viewport compaction note; recover-audio-always-keep → CARRY; "do not re-smoke" automated list → point to Playwright spec names in test-selection docs |
| `wb-wave5-liveboard-chrome-smokebook-2026-06-29.md` | **Yes** | Over-compaction deferred judgment → `WB-STUDENT-TOPBAR-CONTRACTION`; tutor meter regression **superseded** by later confirm addenda |
| `wb-wave5-waiting-polish-smokebook-2026-06-28.md` | **Yes** | Adult-join FAIL cluster + auth divergence notes → `WB-ADULT-JOIN-ENABLEMENT`; dual-device takeover PARTIAL → human-only; live-board regression notes **historical** (pre-merge) |
| `wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md` | **Yes** | Stale-cookie 404 still FAIL (item 6) vs later confirm PASS — document **tip-dependent** fix timeline in BACKLOG WB-ADULT-JOIN; quick-win PASS items = shipped |
| `wb-wave5-consent-perms-2026-06-30.md` | **Partial** | Legal callout (modal removal) + Andrew sign-off **still open** if not ratified; automated coverage citations → playwright-on-fix mapping; keep until Andrew signs consent approach |
| `wb-wave5-next-session-bootstrap.md` | **Yes** | Historical orchestrator bootstrap; invariants restated in AGENTS.md + queue; no unique OPEN items beyond queue |
| `wb-unify-stabilization-plan-2026-06-17.md` | **Yes** | Architecture decision (unified shell) → `docs/WHITEBOARD-STATUS.md` or AGENTS hard-won lesson; out-of-scope IDs already in BACKLOG; wave breakdown **completed** |
| `wb-unify-stabilize-smokebook-2026-06-17.md` | **Yes** | W1-3 hardware gate results + re-smoke R1/R2 PASS; item-level FAIL notes mapped to BACKLOG (image importer, board tabs, rejoin); 11 backlog IDs in global ignore list |
| `wb-student-shell-smoke-triage-2026-06-17.md` | **Yes** | Pre-unify symptom catalog — **superseded** by unify plan + BACKLOG tier table; keep ledger reference in `docs/archive/` only |
| `wb-mobile-phone-portrait-smokebook-2026-06-10.md` | **Yes** | Phase 0–3 PASS record; AV pip bottom-right FAIL → BACKLOG SR-16; merge bar scope statement |
| `wb-wave4-responsive-smokebook-2026-06-19.md` | **Yes** | Round-by-round compaction saga → `WB-STUDENT-TOPBAR-CONTRACTION`; R6 student desktop PARTIAL notes (coral Exit, grid-in-more, dropdown direction) → BACKLOG polish; follow-toggle centering **still open** (R6-5 FAIL) |

---

## Classification notes

1. **BACKLOG staleness:** `SMOKE-BLOCK-5`, `WS-I-PRESTART-MUTE`, and `WB-WAVE5-CHROME-POLISH` describe pre-fix reality. Source code on this worktree shows fixes landed — update BACKLOG on next docs pass, don't re-open as new work.

2. **WS-P deliverable 2:** Execution queue says "parked on WS-P-A/B" but `useDeployFreshness.ts` + `capture-defer-registry.ts` + tests exist. Treat as **shipped** unless Andrew explicitly reverted.

3. **Smokebook PASS/FAIL is time-stamped:** Prefer latest confirm smokebook (`wb-wave5-polish-confirm-2026-06-29.md`) over earlier waiting-polish FAILs when they conflict (e.g. stale-cookie join).

4. **PLAYWRIGHT-GAP:** Phone student A/V (item 19), WB-AV-GAP-1/2 hardware oracles, and subjective audio quality remain human-only per execution queue TEST COVERAGE INVENTORY.
