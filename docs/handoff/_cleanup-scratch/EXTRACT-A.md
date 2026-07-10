# EXTRACT-A — recording/audio/lifecycle

Batch A doc-cleanup extraction (2026-07-09). Worktree: `tutoring-notes-merge-audio` @ `chore/doc-cleanup-master` (master post-cut). Code-verify via `src/` grep unless noted.

## CARRY (open, not in backlog)

| Item | Area | Priority | Evidence (why still open) | Source doc |
|---|---|---|---|---|
| **`network_offline` FSM input not wired** | Recorder lifecycle | P1 | FSM supports `network_offline` (`lifecycle-machine.ts` ~278–445) but host passes `networkOk: true` hardcoded (`WhiteboardWorkspaceClient.tsx` ~1881, ~2547). Pause-disconnect analysis §2 flags this. | `pause-disconnect-code-analysis-2026-06-04.md` |
| **W1 Ship B — `finalizeOutboxAfterEnd` drops all IDB rows** | Outbox / end-session | P0 | `upload-outbox.ts` `finalize()` deletes every row for session (~1030–1052); no `status === "uploaded"` filter. W1 design § Surface 2 BLOCKER: stuck rows silently lost at End. BACKLOG #2 covers blob-on-retry-exhaustion, not this finalize path. | `w1-audio-durability-design-2026-05-27.md`, `PHASE-1B-STATUS.md` |
| **W1 Ship B — `stuck` semantics + UX vs `permanent-fail@50`** | Outbox | P1 | Design: 12 attempts → `stuck`, blob retained, Retry UI, skip on finalize. Code: `PERMANENT_FAIL_AFTER_ATTEMPTS = 50`, observer `state = "failed"`, no stuck banners / End-session "Retry upload" copy. | `w1-audio-durability-design-2026-05-27.md` |
| **`deviceHealth` FSM input + `dvc` logging** | Device / capture | P1 | W1 Ship C design adds `deviceHealth?: "ok"\|"ended"\|"silent"\|"interrupted"` host→FSM bridge + `dvc` logs. No `deviceHealth` / `dvc` in `src/`. Adjacent to BACKLOG #7 (`track.onended`) but not the same spec. | `w1-audio-durability-design-2026-05-27.md`, `w1-audio-durability-orchestrator-report.md` |
| **Outbox permanent-failure Datadog/Sentry breadcrumbs** | Observability | P2 | `obx=` console logs exist; no Datadog/Sentry emission on permanent fail. PHASE-1B follow-up #3; not a named BACKLOG row. | `PHASE-1B-STATUS.md` |
| **macOS `ondevicechange` debounce — unvalidated** | Device | P3 | W1 design § Surface 3: 500ms debounce on macOS Safari unvalidated (no MacBook). Open Q in orchestrator report. | `w1-audio-durability-design-2026-05-27.md`, `w1-audio-durability-orchestrator-report.md` |
| **Live transcription (LTX) spike — not on master** | Transcription | P2 | No `useLiveTranscription`, `NEXT_PUBLIC_LIVE_TRANSCRIPTION`, or `src/lib/ltx-*` on master. Spike STATUS: P0 timeline assembly gap (naive concat). TESTING-COVERAGE mentions gap only. | `live-transcription-spike-STATUS.md`, `pause-disconnect-code-analysis-2026-06-04.md` |
| **Unified wall-clock session timeline (`timelineStartMs`)** | Clock / replay / LTX | P1 | `getAudioMs` still freeze-on-pause (`useAudioRecorder` / pause-disconnect §2). No `timelineStartMs` on outbox/chunks. Re-arch D3/D4 + pause-disconnect §5–6 unresolved on master. BACKLOG mentions "audio-clock fix" in spine intro only. | `pause-disconnect-code-analysis-2026-06-04.md`, `recording-rearchitecture-design-2026-06-05.md` |
| **`audioStartedAtMs` ordering bug (Phase 2)** | Outbox / segments | P2 | Re-arch design: fix `audioStartedAtMs: Date.now()` at enqueue. Field still written from segment start (`upload-outbox.ts` ~896; `remote-stream-recorder.ts` ~225). Phase 1 tolerates `createdAt` ordering. | `recording-rearchitecture-design-2026-06-05.md` |
| **Custom `SessionAudioPlayer` (D10) + stitch-path retirement** | Replay | P2 | Re-arch Phase 4: unified player after consolidation. `replay-audio-timeline.ts` still used; no `SessionAudioPlayer`. Partial relief via `concatBlobUrl` + `buildReplayAudioPayload` but D10 not built. | `recording-rearchitecture-design-2026-06-05.md` |
| **Sarah forward-migration at re-arch cutover** | Data migration | P2 | Re-arch Q6 ratified: forward-migrate real sessions once; no dual-read. No migration tooling on master. | `recording-rearchitecture-design-2026-06-05.md` |
| **Wire-level mute coordination** | Live A/V | P3 | 4b/4c: tutor mute is local `track.enabled` only; remote still receives RTP. Post-v1 per plan; no BACKLOG row. | `PHASE-4B-STATUS.md`, `PHASE-4C-STATUS.md` |
| **Remote video track recording** | Recording | P3 | 4b: `remote-stream-recorder` audio-only; video recording deferred. No BACKLOG row. | `PHASE-4B-STATUS.md` |
| **SFU for N>5 peers** | Live A/V | P3 | 4a: mesh only; SFU deferred until load problem. No BACKLOG row (TURN is backlogged separately). | `PHASE-4A-STATUS.md` |
| **Large-mesh CPU profiling (≤5 peers)** | Live A/V | P3 | 4b/4c: parallel per-peer `MediaRecorder`; no Chromebook profiling. No BACKLOG row. | `PHASE-4B-STATUS.md`, `PHASE-4C-STATUS.md` |
| **End-session replay: per-student-mic mix UX** | Replay | P2 | 4c: segments land but playback mixing is post-v1 workstream. No BACKLOG row. | `PHASE-4C-STATUS.md` |
| **Cost observability Phase 2** | Ops / billing | P2 | Design § Phase 2: OpenAI `/v1/usage` reconciliation cron, monthly blob storage cron, `VERCEL_COMPUTE` via Vercel API. Phase 1 admin dashboard shipped (`src/app/admin/cost/page.tsx`); Phase 2 items not in BACKLOG. | `cost-observability-design-2026-06-06.md` |
| **OpenAI vendor ops checklist (DPA / ZDR / prod path)** | Legal / ops | P2 | Retention memo § counsel handoff: confirm executed DPA, prod uses only `/v1/audio/transcriptions`, pursue ZDR approval, settings screenshots. `CONSENT-LEGAL-CONSULT` is broader counsel; not this ops checklist. | `openai-data-retention-2025-05-31.md` |
| **`scripts/smoke-long-form-transcribe.mjs` headless harness** | Test / smoke | P2 | Tier-1 orchestrator report + `SMOKE-LONG-FORM-TRANSCRIBE.md` § companion: optional headless entry point never built; UI Server Action only. | `long-form-transcribe-tier-1-orchestrator-report.md`, `SMOKE-LONG-FORM-TRANSCRIBE.md` |
| **`registerWhiteboardSessionAudioSegmentAction` deprecation** | API cleanup | P3 | Legacy segment register still in `actions.ts`; PHASE-1B follow-up #6. No BACKLOG row. | `PHASE-1B-STATUS.md` |
| **`waitForPendingUploads` debug surface removal** | Test / cleanup | P3 | Still on `WhiteboardWorkspaceAudioBridge` for tests/ops; PHASE-1B follow-up #5. No BACKLOG row. | `PHASE-1B-STATUS.md` |
| **`upload-outbox.test` parallel-race flake** | Test infra | P3 | PHASE-1B follow-up #4: 50ms sleep concurrency test flaky under parallel jest. JEST-ISOLATION mentions upload-outbox flakes but different root cause. | `PHASE-1B-STATUS.md` |
| **Playwright `e2e` audio-rollover not in CI gate** | Test | P3 | `tests/e2e/audio-rollover.spec.ts` opt-in (`AUDIO_ROLLOVER_E2E=1`); RECORDER-REFACTOR-STATUS open issue. BACKLOG notes shipped but not gate enrollment. | `RECORDER-REFACTOR-STATUS.md` |

## Already in backlog (no action)

- **60–90 min long-form transcribe smoke (BLOCKER-PROD watch)** — BACKLOG § Recording — long sessions item 5; `SMOKE-LONG-FORM-TRANSCRIBE.md` §8 empty.
- **Tier 2 transcribe queue (VAD / background job)** — BACKLOG § Recording item 6 (deprioritized unless item 5 fails).
- **Speaker diarization (Phase 6 task 6)** — BACKLOG § Recording item 6 cross-ref; `PHASE-6-TIER-1-STATUS.md` deferred.
- **W1 Ship A partial (workspace draft store only)** — BACKLOG § Reliability gaps #1 + 1a (surface A lower priority).
- **W1 Ship B upload-failure blob persistence** — BACKLOG § Reliability gaps #2 (broader than finalize/stuck UX above).
- **Cross-session stuck/orphaned draft surfacing** — BACKLOG § Reliability gaps 1b.
- **Recovery banner stacking (audio + WB + disconnect)** — BACKLOG § Reliability gaps 1c.
- **Draft `clear()` / `handleReset` edge cases** — BACKLOG § Reliability gaps 1d, 1e.
- **Hot-swap mic / unplug silent** — BACKLOG § Reliability gaps #7; mic hot-plug refresh asymmetry (B1-B4 smoke).
- **iOS Safari real-hardware matrix** — BACKLOG § Reliability gaps #10.
- **`rid=` / lifecycle log coverage** — BACKLOG § Reliability gaps #13, #14.
- **True pause (D5)** — BACKLOG § Recorder capture reliability Phase 2 deferred #2.
- **Recording clock anchor / drop 10s blind gate (D3)** — BACKLOG § Recorder capture reliability Phase 2 deferred #3.
- **On-page recording-permissions removal** — BACKLOG § Recorder capture reliability Phase 2 deferred #1.
- **Map/reduce notes accuracy + abstain path** — BACKLOG § Recording re-architecture — Phase 1 follow-ups.
- **S3 notes-reduce lock, N1–N4** — BACKLOG § Slice-3 notes-bridge deferred findings.
- **SSG-1 / SSG-3 multi-segment replay + monolithic retire** — BACKLOG § V1 pre-master / ship-to-Sarah.
- **SMOKE-PERF-1 end-session finalize slowness** — BACKLOG § 2026-07-08 smoke findings.
- **WB-IDLE-SESSION-GUARD** — BACKLOG § cost-safety.
- **TURN (A4 Slice-C)** — BACKLOG § Whiteboard A/V.
- **Slow first peer connect / STUN-only** — BACKLOG § Live-A/V (May 15 + A4).
- **Whisper CJK / language pin** — BACKLOG § Live-A/V May 15 evening.
- **Duplicate tile, per-peer recording mute (shipped 4d)** — BACKLOG pilot items (done).
- **Cost-event durability (`tutorKey`, `isTestFixture`) + recent events table** — BACKLOG § Cost observability — V1-gating.
- **Snapshot multi-page / discoverability / preview-before-Start wipe** — BACKLOG § Phase 1c follow-ups.
- **CONSENT-LEGAL-CONSULT (transcription of minor audio)** — BACKLOG § consent (counsel).
- **LTX spike (testing gap only)** — BACKLOG § TESTING-COVERAGE teeth gaps (not product backlog).
- **Sync-reconnect mid-negotiation hardware** — BACKLOG `WB-AV-GAP-3` (jest surrogate shipped).

## Shipped / obsolete (drop)

- **Phase 1b outbox + atomic end-session** — `upload-outbox.ts`, `upload-outbox-instance.ts`, `finalizeOutboxAfterEnd`, `endWhiteboardSession` txn (`prisma` + actions).
- **Phase 1c snapshot PNG** — `generateSessionSnapshotPng`, `WhiteboardSession.snapshotBlobUrl` (`schema.prisma` ~352; workspace end path ~4368).
- **Phase 4a–4d live A/V pillar** — `peer-mesh.ts`, `useLiveAV.ts`, `mic-recorder-audio.ts`, `LIVE-AV.md`; 4d per-peer mute via GainNode.
- **Device hot-swap (mic)** — `useLiveAV.ts` `devicechange` listener (~1659) + `swapMicDevice` wired from workspace recorder (supersedes 4b "no devicechange" deferral for mic).
- **Recorder refactor + gapless rollover (B5)** — `useAudioRecorder.rolloverSegmentGapless()`; `RECORDER-REFACTOR-STATUS.md` phases 1–5 done.
- **Tier 1 parallel transcribe** — `WHISPER_TARGET_CHUNK_SECONDS`, inner/outer concurrency (`transcribe.ts`, `PHASE-6-TIER-1-STATUS.md` @ `5ccf1c7`).
- **Recording re-arch Phase 1 core** — `TranscriptChunk`, `TutorNote`, `transcription-worker.ts`, `notes-worker.ts`, `chunk-transcribe-enqueue.ts`, `notes-enqueue.ts`, cron `transcribe-sweep`, `gpt-4o-mini-transcribe` (`transcribe-chunk.ts`).
- **Per-chunk map extraction (during session)** — `extract-chunk.ts` + `extractChunkMap` from `transcription-worker.ts` (~238). Supersedes re-arch Q4 "map in Phase 4 only" as **shipped** (quality tuning remains in BACKLOG).
- **Audio consolidation (ffmpeg concat)** — `concat-audio.ts`, `concat-audio-enqueue.ts`, `WhiteboardSession.concatBlobUrl`, `buildReplayAudioPayload`.
- **VAD silence-boundary segmenting** — `segment-policy.ts` + `mic-recorder-audio.ts` (Tier 2 "VAD chunking" in BACKLOG is transcribe-speed variant, not capture VAD).
- **W1 Ship A workspace draft store** — `recording-draft-store.ts` + `recordingDraft` opt-in in workspace `useAudioRecorder`.
- **Cost observability Phase 1 admin dashboard** — `src/app/admin/cost/page.tsx`, `rate-card.ts`, `cost-queries.ts`, `CostEvent` model (`schema.prisma` ~854).
- **Phase docs "awaiting merge/smoke" checklists** — historical; features above on master post-cut.
- **`long-form-transcribe-tier-1-orchestrator-report.md` "uncommitted executor" framing** — superseded banner; code merged `5ccf1c7`.
- **W1 "do not dispatch Ship B until smoke lands"** — BACKLOG item 5 downgraded 2026-05-30 (upload treated working); Ship B deprioritized not deleted.
- **Live-transcription spike branch code** — never merged; not shipped (see CARRY).

## Per-doc archive note

| Doc | Safe to archive? | Unique info that must survive (where captured) |
|---|---|---|
| `PHASE-1B-STATUS.md` | Yes | Shipped pillars → `RECORDER-LIFECYCLE.md`. Open: outbox observability, legacy register, test flake → CARRY + BACKLOG reliability. |
| `PHASE-4A-STATUS.md` | Yes | API/wire schema → `LIVE-AV.md`. TURN/SFU → CARRY + BACKLOG A4. |
| `PHASE-4B-STATUS.md` | Yes | Hook/outbox integration → `LIVE-AV.md` + `RECORDER-LIFECYCLE.md`. Deferred edges → CARRY (wire-level, video record, CPU). |
| `PHASE-4C-STATUS.md` | Yes | Mount/CSP hotfixes → `LIVE-AV.md`. Student-mic replay mix → CARRY. |
| `PHASE-4D-STATUS.md` | Yes | Smoke matrix + shipped fixes → `LIVE-AV.md`, BACKLOG pilot A/V rows. Out-of-scope list → BACKLOG. |
| `PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md` | Yes | Device-mgmt shipped; TURN only if field reports → BACKLOG A4. |
| `PHASE-6-TIER-1-STATUS.md` | Yes | Constants/concurrency → `transcribe.ts` + BACKLOG item 4 (shipped). Open smoke → BACKLOG item 5. |
| `RECORDER-REFACTOR-STATUS.md` | Yes | Refactor complete → code + BACKLOG line 740. E2E gate → CARRY. |
| `SMOKE-LONG-FORM-TRANSCRIBE.md` | **Keep until smoke run** | Procedure + §8 history; BLOCKER gate → BACKLOG item 5. After Andrew runs smoke, archive; keep BACKLOG + `scripts/make-test-audio.README.md`. |
| `recording-rearchitecture-design-2026-06-05.md` | **Keep as design ref** until Phase 2–4 CARRY cleared | Ratified decisions → `RECORDER-LIFECYCLE.md` + BACKLOG § Recording re-arch. Phase 2–4 open → CARRY + BACKLOG deferred rows. |
| `w1-audio-durability-design-2026-05-27.md` | Yes after CARRY Ship B/C folded to BACKLOG | Principles → BACKLOG W1 header + #1–#2. Stuck/finalize/deviceHealth detail → CARRY (should merge to BACKLOG #2). |
| `w1-audio-durability-orchestrator-report.md` | Yes | Dispatch context only; open Qs → CARRY / BACKLOG 1b. |
| `pause-disconnect-code-analysis-2026-06-04.md` | Yes after clock work tracked | P0 analysis → CARRY timeline + BACKLOG Phase 2 deferred #2–#3. |
| `live-transcription-spike-STATUS.md` | Yes | Verdict + RED spec path; product → CARRY LTX; counsel → openai memo + CONSENT-LEGAL-CONSULT. |
| `long-form-transcribe-tier-1-orchestrator-report.md` | Yes | Superseded; smoke → BACKLOG + `SMOKE-LONG-FORM-TRANSCRIBE.md`. |
| `long-session-smoke-scripts.md` | **Keep with smoke harness** | Field-coverage scripts for item 5 smoke; companion to `SMOKE-LONG-FORM-TRANSCRIBE.md`. |
| `openai-data-retention-2026-05-31.md` | Yes | Counsel handoff → CARRY ops checklist + `LEGAL-SYNC.md` / CONSENT-LEGAL-CONSULT. |
| `cost-observability-design-2026-06-06.md` | **Keep as design ref** | Phase 1 shipped → `COST-OBSERVABILITY.md` + admin UI. Phase 2 + Q11 hardening → BACKLOG § Cost observability + CARRY Phase 2. |
