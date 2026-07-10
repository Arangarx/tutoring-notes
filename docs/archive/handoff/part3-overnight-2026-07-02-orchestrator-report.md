# Part 3 overnight run — orchestrator report (2026-07-02)

**Branch:** `wb-wave5-polish` (worktree `tutoring-notes-polishwt`)
**Tip at report time:** [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c92b7c9dc7bd6ce731e8acd7188c385bfe) (+ this doc + state-head commit on top)
**Executor:** Sonnet, autonomous overnight run (Andrew asleep; mandate = maximal SAFE progress, test everything jest/Playwright-testable, do not gamble fragile unsmoked changes into the hardware-smoke tree)
**Companion doc:** [`part3-notes-reliability-spine-smokebook.md`](part3-notes-reliability-spine-smokebook.md) — the hardware smoke Andrew runs next.

---

## TL;DR

Part 3 (the notes-reliability spine) is **landed and green as far as it can go without hardware + without one design confirm from Andrew.** Three of the p3 waves shipped with red-before/green-after tests; the per-speaker *live wiring* (sub-step C) and everything downstream of it is **deliberately deferred** behind an explicit Andrew design-fork confirm — not skipped, not forgotten. All automated gates are green on tip. The branch is ready for the Part 3 hardware smoke.

**What Andrew asked for vs. what shipped:**

- ✅ *"Session experience seamless start to end"* — single monotonic pause-aware clock (`p3-clock`) is the mechanical backbone; the *seamless feel* is item 1 of the smokebook (hardware/subjective).
- ✅ *"Blur skeleton generates within seconds"* — the existing chunk-during-session transcription path is intact and unregressed; stronger prompts landed. Actual latency is item 2 (hardware — depends on live OpenAI/network).
- ✅ *"Everything jest/Playwright-testable that you touch is tested"* — full `npx jest` 2742 pass, `next build` 0, `test:wb-sync` relay green (107/2/1-known-flake). No mechanical failures should surface in smoke.
- ⚠️ *"By the time you're done with Part 3…"* — Part 3 is **not fully done**: per-speaker capture (the feature that would let notes distinguish tutor vs. student) is **deferred on a genuine design fork** (see below). This is the one thing that needs Andrew before it can proceed.

---

## What shipped (each with tests, gates, push)

| Wave | Commit(s) | What | Tests |
|---|---|---|---|
| **p3-clock** | [`1572983`](https://github.com/Arangarx/tutoring-notes/commit/1572983) | Single monotonic pause-aware `createSessionMsClock`; threaded into WB `t`, FSM `audioClockMs` (was hardcoded 0), transcription `recordingTimeOffsetMs` (segment-start, captured synchronously at callback entry to dodge concurrent-callback offset inversion). `audioStartedAtMs` kept wall-clock by design (outbox sort key + draft-recovery). Freeze rides existing **8s `REACHABLE_LOSS_DEBOUNCE_MS`** (Andrew-confirmed, not the 6s peer-eviction the bootstrapper guessed). `deriveWbCaptureActive` keeps WB capture through the pause. Observability: `clock_start`/`clock_paused`/`clock_resumed`. | `session-clock.test.ts` + `wb-capture-gate.test.ts` (red→green); CF-2.1 titles updated. Sonnet 5-axis: SHIP-WITH-FIXES (H-1 logs + M-2 sync-capture + L-2/L-3 applied). |
| **p3-perspeaker A** | [`e92c9ac`](https://github.com/Arangarx/tutoring-notes/commit/e92c9ac) | Additive schema: `TranscriptChunk.streamId @default("tutor:mic")` + `speakerId String?` + index `[sessionId,streamId]` (migration `20260702120000_transcript_chunk_speaker_labels`). Threaded optional `streamId`/`speakerId` through enqueue → worker → store (tutor path unchanged via default). | Extended `enqueue-chunk-transcription-action` / `transcription-worker` / `transcript-store` tests for pass-through + defaults. |
| **p3-perspeaker B** | [`8638c86`](https://github.com/Arangarx/tutoring-notes/commit/8638c86), [`1df3258`](https://github.com/Arangarx/tutoring-notes/commit/1df3258) | Additive `transcriptionOnly?: boolean` on `OutboxRow` (persisted IDB); `assembleEndSessionSegments` **excludes** `transcriptionOnly` rows → per-speaker Whisper blobs can never become `SessionRecording` replay rows (structural prevention of the `89e0fe1`-class bug). LIVE-AV invariant **#6a** documents the tap-before-mix contract. | Extended `upload-outbox-instance.helpers.test.ts` (filter) + `upload-outbox.test.ts` (IDB round-trip). |
| **p3-model-abstraction** | [`f4cd9cb`](https://github.com/Arangarx/tutoring-notes/commit/f4cd9cb), [`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd) | New `src/lib/ai-models.ts` centralizes 6 model names, env-overridable (`OPENAI_*_MODEL`), defaults = current models (zero behavior change unless set). Wired transcribe/map/reduce/legacy call sites through it. **Stronger map/reduce prompts** (anti-fabrication, reaction→meaning, terseness); `REDUCE_PROMPT_VERSION` bumped. Documented env vars in PLATFORM-ASSUMPTIONS. | Updated `ai.test.ts`, `extract-chunk.test.ts`, `notes-worker.test.ts`, new `ai-models.test.ts`. |
| **p3-video-seam** | [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c) | Docs-only design seam in RECORDER-LIFECYCLE + BACKLOG pointer for post-Sarah video capture. Schema comment only; no fields/migrations. | N/A (docs). |

**Gates on tip `d299a6c`:** full `npx jest` **2742 pass** (only the 3 known pre-existing flaky suites: `upload-outbox` timing race + 2 shared-DB FK races — all pass in isolation, unrelated to Part 3 diffs); `npx next build` **exit 0**; `test:wb-sync` **107 passed / 2 skipped / 1 flaky** (flake = known `wb-session-lifecycle:1095` `ECONNRESET`-on-learner-login, passed on retry #1) — matches the exact `5dd1793` checkpoint baseline, so `WhiteboardWorkspaceClient` clock changes did **not** break live sync.

---

## The one thing that needs Andrew: `PERSPEAKER-C-TRANSCRIPTION-TRIGGER`

Per-speaker **live recorder wiring** (sub-step C) — mounting remote-mic recorders, stamping `recordingTimeOffsetMs`+`speakerId`, and enqueuing per-speaker transcription — is deferred because there's a **genuine design fork** on *how* per-speaker transcription is enqueued after the outbox worker uploads each student blob:

- **(a) worker-driven** *(recommended)* — the outbox drain fires `enqueueChunkTranscriptionAction` after a `transcriptionOnly` row uploads. Durable, fire-once tied to upload success, single path. **Touches the fragile outbox drain** (tripwire surface).
- **(b) outbox-observer-driven** — a client observer watches for uploaded `transcriptionOnly` rows and enqueues. Keeps the trigger client-side like the tutor path; needs dedup-by-`segmentId`.
- **(c) recorder self-uploads** then enqueues directly — duplicates upload logic, violates the composition rule. Least preferred.

Both (a)/(b) need `recordingTimeOffsetMs`+`speakerId` added to the outbox row (additive). **Also confirm the peer cap (≤3 vs ≤4).**

**Why deferred and not attempted overnight:** it's concurrency-sensitive on the fragile outbox/transcription-ordering path, and its correctness is **hardware-validated** (real per-speaker WebRTC audio) — exactly the "don't gamble fragile unsmoked changes into tomorrow's smoke tree" case. The A+B foundation was built specifically so C is a safe, well-scoped wire-up once the fork is confirmed. **Everything downstream of C** (`p3-vad-chunking`, `p3-consent-recording`, `p3-incremental-map`, then `p3-finalize` → `p3-replay-scrub`) is blocked on it.

---

## Also Andrew-gated (not auto-shipped)

- **Map/reduce prompt WORDING** ([`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd)) — the *mechanism* (model abstraction) is locked, but the exact prompt text is **PROPOSED**. Smokebook item 6 is the wording review. If Andrew wants changes, they're a trivial edit to `extract-chunk.ts` / `notes-worker.ts` (bump `REDUCE_PROMPT_VERSION` again).
- **`LIVE-SESSION-CONSENT-COPY`** string — still Andrew-gated (unchanged from prior).
- **Production migration apply** for `20260702120000_transcript_chunk_speaker_labels` — auto-applies to preview-dev on deploy; production apply stays Andrew-gated until the master cut.

---

## Decisions log (what I chose and why)

1. **Kept `audioStartedAtMs` wall-clock**, applied the monotonic clock only to `recordingTimeOffsetMs` — changing the outbox sort key to monotonic without reconciling the draft-recovery path was a consistency risk with no upside. Documented at the call site.
2. **Synchronous offset capture** at `onWorkspaceAudioRecorded` entry (before any `await`) — a 5-axis finding: concurrent callbacks across an await boundary could invert segment offsets.
3. **Deferred C rather than guess the trigger** — a fragile-surface + hardware-validated + real-design-fork combination is the textbook "surface to Andrew, don't assume" case (per the "a plan is not consent" / "missed prompt is not consent" hard-won lessons).
4. **Reordered `p3-model-abstraction` ahead of C's dependents** — it's the only remaining wave independent of per-speaker capture, low-risk, and directly serves the notes-quality pre-merge bar Andrew ratified.
5. **Authored the smokebook + this report directly** (executor holds the context) rather than dispatching — higher fidelity on exactly what changed and what needs eyeballing.

---

## Next-orchestrator checklist (resume cold)

1. **Get Andrew's `PERSPEAKER-C-TRANSCRIPTION-TRIGGER` answer** (recommend **(a)** worker-driven; confirm peer cap). Then wire sub-step C: additive outbox fields → recorder mount (`useRemoteMicRecorders`, `shouldCapture` gating, peer cap) → transcription enqueue on the chosen trigger → **5-axis on the C diff** (fragile) → deterministic tests where possible, flag the hardware-only residual.
2. **Then** the C-dependent waves in order: `p3-vad-chunking`, `p3-consent-recording`, `p3-incremental-map` → `p3-finalize` → `p3-replay-scrub`.
3. **Prompt wording**: fold Andrew's item-6 edits if any.
4. **Merge path unchanged**: single `merge --no-ff wb-wave5-polish → v1-redesign` only after the **full-arc both-themes hardware smoke** (the FINAL Sarah gate — separate from this Part 3 smokebook). No interim merge.
5. **Housekeeping**: the state-doc HEAD Last-action cell is bloated — **heavy restructure is due** (dispatch Composer from the template) at the next natural milestone/swap. Throwaway untracked smokebook copies still sit in the main `tutoring-notes` (v1-redesign) working tree — delete before merge (authoritative copies are on `wb-wave5-polish`).

---

## Testing-contract reminder (what smoke must catch that automation can't)

By the project's testing contract, these are **hardware-smoke-only** and are the substance of the smokebook: audio↔stroke replay alignment (jsdom geometry blind spot), real-WebRTC disconnect→freeze→resume timing, real-speech transcription latency + skeleton cadence, mixdown replay quality, and subjective notes quality. A green jest/Playwright run is **necessary but not sufficient** for any of these.
