# Part 3 — notes-reliability spine — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c92b7c9dc7bd6ce731e8acd7188c385bfe)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

---

## Scope + what changed (read before running)

This smokebook covers the **hardware-only / subjective residual** of Part 3 (the notes-reliability spine). Everything mechanically testable is already covered by jest + Playwright and is **green** (see automated-gate summary below) — those items are cited on a `**Coverage:**` line so you can mark them **N/A with notes** unless you want to eyeball them. The items that genuinely **need real hardware** are the geometry/timing and subjective-quality ones (the jsdom + relay blind spots): audio↔stroke replay alignment, real-WebRTC disconnect→freeze→resume timing, transcription latency on real speech, and notes-quality judgment.

**What landed on this branch (Part 3):**

- **`p3-clock`** ([`1572983`](https://github.com/Arangarx/tutoring-notes/commit/1572983)) — one **monotonic, pause-aware** session clock (`createSessionMsClock`). Threaded into WB event timestamps (`t`), FSM `audioClockMs` (was hardcoded `0`), and transcription `recordingTimeOffsetMs` (segment-start offset). Disconnect freeze rides the existing **8s `REACHABLE_LOSS_DEBOUNCE_MS` → FSM `paused`** trigger (the one you confirmed — not the 6s peer-eviction timer). `deriveWbCaptureActive` keeps WB capture running through the pause so gap strokes stamp at the frozen clock. New observability logs: `clock_start` / `clock_paused` / `clock_resumed`.
- **`p3-perspeaker-capture` A + B** ([`e92c9ac`](https://github.com/Arangarx/tutoring-notes/commit/e92c9ac), [`8638c86`](https://github.com/Arangarx/tutoring-notes/commit/8638c86)) — **pure additive foundation, no live-session runtime change.** Schema labels (`TranscriptChunk.streamId`/`speakerId`) + replay-isolation (`transcriptionOnly` outbox rows excluded from `SessionRecording` replay). **No per-speaker recorder is wired yet** (sub-step C is deferred pending your `PERSPEAKER-C-TRANSCRIPTION-TRIGGER` confirm), so there is nothing per-speaker to *see* this run — item 8 just guards that the tutor mic path is unregressed.
- **`p3-model-abstraction`** ([`f4cd9cb`](https://github.com/Arangarx/tutoring-notes/commit/f4cd9cb), [`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd)) — models are now config-swappable via `OPENAI_*_MODEL` env vars (defaults = **current** models, so no behavior change unless you set them), **plus stronger map/reduce prompts** (anti-fabrication, reaction→meaning inference, terseness). **⚠️ The prompt WORDING is PROPOSED and Andrew-gated** — item 6 is your wording review.
- **`p3-video-seam`** ([`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c)) — docs-only design seam. Nothing to smoke.

**Automated-gate summary (all green on tip):** full `npx jest` **2742 pass** (only the 3 known pre-existing flaky suites — `upload-outbox` timing race + 2 shared-DB FK races — all pass in isolation); `npx next build` **exit 0**; `test:wb-sync` (relay Playwright) **107 passed / 2 skipped / 1 flaky** — the flake is the known `wb-session-lifecycle:1095` `ECONNRESET`-on-learner-login network flake (passed on retry #1, tracked in BACKLOG), **not** a Part 3 regression.

**Migration note:** the `20260702120000_transcript_chunk_speaker_labels` migration auto-applies to the preview DB on deploy (the Vercel build runs `prisma migrate deploy` via `scripts/migrate-with-retry.mjs`, and preview-dev is migration-tracked). No manual apply needed for the preview. **Production apply stays Andrew-gated** (not needed until the master cut).

---

## When Andrew runs this (policy)

This is the **Part 3 feature smoke** — the one-pass hardware run of the notes-reliability spine + the seamless WB flow. It is **not** the comprehensive pre-master both-themes MASTER-CUT smoke (that remains a separate, later run — the FINAL Sarah gate before `merge --no-ff → v1-redesign`). Run this in your **primary theme**; theme parity is out of scope here.

---

## Feature smoke items

### 1. Full live-session arc — seamless start to end (tutor + student, real hardware)

**Action:** On the **Preview**, sign in as the pilot tutor on your primary device. Open a claimed student's whiteboard workspace and start a session. On a **second real device** (student's machine/browser), join via the student link, pass the waiting-room/consent gate, and connect A/V. With both connected: tutor clicks **Start**; draw several strokes on 2–3 pages; switch pages; talk back and forth for ~2–3 minutes; then tutor **End Session**. Watch the browser console on both roles for errors.

**Expect:** Join → waiting room → live A/V → Start → draw/sync → end flows with **no dead buttons, no auth loop, no error toast, no CSP/chunk console errors**. Strokes sync both directions; page switches hold. End Session completes and lands on the review/notes surface without hanging. The whole arc *feels* seamless (your judgment — this is the "confidence" bar).

**Ignore this run:** Per-speaker audio (not wired — sub-step C deferred). Any both-theme parity check (separate MASTER-CUT smoke). Marketing-site chrome.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › full PENDING→ACTIVE transition; whiteboard-live-sync-regression.spec.ts › sync invariants]` — `[human-only: subjective "seamless / confidence" feel across the full arc on real hardware]`

**Notes:**

### 2. Skeleton-within-seconds — live transcription latency

**Action:** During the item-1 session (or a fresh one), after Start, **speak a clear sentence or two** into the tutor mic and keep talking so audio chunks flush. Watch the session-notes surface (the review/notes panel that shows the generating skeleton). Note roughly how long after each chunk boundary the **blur skeleton** appears / updates.

**Expect:** As audio chunks upload and transcribe mid-session, the notes skeleton should populate within **a few seconds** of each chunk — you should *not* be waiting until end-of-session to see anything. Progressive, near-real-time skeleton growth.

**Ignore this run:** Exact per-chunk millisecond latency (depends on OpenAI + network). Final polished note wording (that's item 6). First-chunk warm-up delay if the very first request is slow.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real-speech transcription latency + skeleton-render cadence — depends on live OpenAI/network, not hermeticizable in Playwright]`

**Notes:**

### 3. Clock ↔ stroke/audio replay alignment (jsdom-blind geometry/timing)

**Action:** Record a session where you deliberately create **timestamp landmarks**: say "mark — drawing NOW" and immediately draw a distinctive stroke; repeat 2–3 times spread across the session (early, middle, late), including at least one stroke **shortly after** a page switch. End the session, wait for processing, then open the **replay**. Scrub to each spoken "NOW" and check where the matching stroke appears relative to the audio.

**Expect:** Each landmark stroke renders in replay **aligned to the moment you spoke** (within a small tolerance), for early, middle, and late marks alike — i.e. the single monotonic clock keeps audio and strokes on one shared `t=0` timeline with **no drift that grows over the session** and no offset jump after page switches.

**Ignore this run:** Sub-second jitter. Any per-speaker separation (not wired). Replay Play/Pause-over-Board-tab overlap (known `C-1` post-Sarah backlog item, not this).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: layout/coordinate + audio-timeline alignment is a documented jsdom blind spot — must be proven on a real browser/replay]`

**Notes:**

### 4. Disconnect → freeze → resume (8s debounce, real WebRTC)

**Action:** In a live recording session with tutor + student connected, **cut the student's network** (disable Wi-Fi / airplane mode) and hold it for **~15–20s**, then restore it. Keep the tutor drawing a stroke or two *during* the outage. Watch the tutor console for the clock logs (`action=clock_paused …` then `action=clock_resumed … gap_ms=…`). After reconnect, continue the session briefly and end it; check the replay.

**Expect:** After ~**8s** of unreachability the session goes to **paused**: audio capture pauses and the session clock **freezes** (console shows `clock_paused` with a `t_frozen` + reason). WB capture **keeps running** through the gap — strokes drawn during the outage are retained and stamped at the frozen timestamp (they should appear in replay clustered at the freeze point, not scattered). On reconnect the clock **resumes from the frozen value** (`clock_resumed` with a `gap_ms`), not jumping forward by the wall-clock outage duration. No lost session, no dead session.

**Ignore this run:** Exact debounce to the millisecond. Transient A/V "reconnecting…" pill flicker on rejoin (known A/V-reconnect flake, BACKLOG). Whether video re-negotiates instantly.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real-WebRTC reachability-loss timing + pause/freeze/resume — relay/jsdom cannot exercise true network loss + performance.now() freeze semantics]`

**Notes:**

### 5. Clock monotonicity across a pause (no wall-clock inflation)

**Action:** Run a session of at least ~5 minutes that includes the item-4 disconnect pause somewhere in the middle. End it and open the replay + (if convenient) skim the console `clock_*` logs. Sanity-check the total replay/session duration against the *active* time you spent, excluding the outage.

**Expect:** The session clock reflects **active recorded time**, not wall-clock — the ~15–20s outage should **not** inflate the timeline (the pre-`p3-clock` wall-clock offset would have counted it). Offsets are monotonic (never negative, never jump backward). Replay length ≈ active session length.

**Ignore this run:** A few seconds of tolerance around the pause boundary. Absolute wall-clock timestamps in logs (those are intentionally still wall-clock for the outbox sort key).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/recording/session-clock.test.ts › monotonic + freeze/resume semantics (unit-level)]` — `[human-only: end-to-end confirmation the real session timeline excludes the outage]`

**Notes:**

### 6. Notes quality — PROPOSED map/reduce prompt wording (Andrew-gated review)

**Action:** Using the notes generated by item 1/2's session (ideally one with a real teaching moment — a correction, a student question, an "almost! / got it" reaction, and a homework/next-step mention), read the final **assessment**, **topics**, **nextSteps**, **links** fields. Judge them as a parent would.

**Expect:** Notes are **terse** (scannable in <10s, phrases not paragraphs), **accurate to what was said** (no fabricated observations), and the **assessment synthesizes reactions into a standing picture** ("almost/try again" → wrestling; "yes/got it/perfect" → has it). `nextSteps` should include **all** follow-ups AND any assigned homework. Empty fields only when the session genuinely lacked that signal. **This is your call on whether the PROPOSED wording ([`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd)) is good enough to keep, or needs edits** — the wording is not locked.

**Ignore this run:** Transcription word-errors from the ASR itself (that's model/mic quality, not the prompt). Skeleton/loading states (item 2). The eval-harness/flywheel loop (explicitly deferred post-master).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/recording/extract-chunk.test.ts + notes-worker.test.ts › prompt/model wiring + JSON contract]` — `[human-only: subjective quality + final wording sign-off (Andrew-gated)]`

**Notes:**

### 7. End-session finalize + replay integrity (mixdown is sole replay)

**Action:** End a recorded session and let it fully process. Open the replay and confirm the recorded audio + whiteboard play back together. Confirm the session note transitions from DRAFT (skeleton) to a finalized READY note.

**Expect:** End-session completes atomically (no partial/orphaned state, no error toast). Replay plays the **mixdown** audio with synced strokes. Note finalizes DRAFT→READY. Because `p3-perspeaker` B excludes `transcriptionOnly` blobs from replay assembly — and no per-speaker blobs exist yet anyway — replay should be exactly the normal single mixdown, unchanged from before Part 3.

**Ignore this run:** Per-speaker replay lanes (not a feature yet). Any notes-*wording* judgment (item 6). Replay Play/Pause-over-Board-tab overlap (`C-1` backlog).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/recording/upload-outbox-instance.helpers.test.ts › assembleEndSessionSegments excludes transcriptionOnly; atomic end-session unit tests]` — `[human-only: real end-to-end finalize + replay playback on hardware]`

**Notes:**

### 8. Regression — tutor mic transcription path unaffected by schema labels

**Action:** This is a guard on the `p3-perspeaker A` additive schema. During any recorded session with tutor speech (covered by items 1/2), simply confirm transcription/notes are produced normally. If you have DB access and want to be thorough, spot-check that new `TranscriptChunk` rows have `streamId = "tutor:mic"` and `speakerId = null`.

**Expect:** Tutor transcription works exactly as before — chunks transcribe, notes generate. The new columns default correctly (`streamId="tutor:mic"`, `speakerId=null`); nothing about the tutor path changed behaviorally.

**Ignore this run:** Anything per-speaker (not wired). If you don't check the DB directly, PASS on "notes generated normally" is sufficient.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/whiteboard/enqueue-chunk-transcription-action.test.ts + transcription-worker.test.ts + recording/transcript-store.test.ts › streamId/speakerId default to tutor:mic/null, tutor path unchanged]` — `[human-only: end-to-end confirmation transcription still fires on real audio]`

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
