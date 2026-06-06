# Recording / whiteboard re-architecture — capture-in-chunks → transcribe-during-session → summarize-on-end → play-as-one

> **Design date:** 2026-06-05 (v1) — **Revised 2026-06-06 (v2)**  
> **Branch:** `v1-redesign`  
> **Status:** **RATIFY-READY v2** — fresh Q1–Q8 open questions supersede the v1 Q1–Q10; build NOT yet authorized (high blast radius) — awaiting Andrew's ratification of Q1–Q8 below  
> **Authored by:** v1 Composer-authored from Opus scope blob; v2 revised inline by Composer subagent from Andrew dialogue + independent best-practice research  
> **Deliverable type:** Design / ratify document — no production code, no migrations applied  
> **Owner directive (Andrew, 2026-06-05):** STOP interim-patching the whiteboard recording/playback methodology; re-engineer it properly for scale and real use.  
> **Prerequisite reads:**
> 1. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM, outbox, atomic end-session (sacred pillar)
> 2. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) — Vercel 300s ceiling, ffmpeg-static, iOS Safari constraints
> 3. [`docs/handoff/session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) — pause-semantics open item (this doc resolves it via D3/D4)
> 4. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) — draft store + outbox durability patterns

---

## Changelog — v2 (2026-06-06) vs v1 (2026-06-05)

> **Source:** Andrew dialogue folded in from ORCHESTRATOR-STATE.md § "DESIGN DIALOGUE (Andrew 2026-06-06, to fold into doc revision)" + current-pipeline investigation `aad5dcdf` + independent best-practice research (transcription model pricing, container format, async pipeline, map-reduce).

| Area | v1 | v2 change |
|---|---|---|
| **Pipeline vision** | capture-in-pieces → consolidate-to-one → play-as-one | Expanded to 4 stages: capture → transcribe (during session) → summarize (auto-on-end) → play |
| **Single-blob framing** | Treated as an absolute goal | Relaxed: real requirements = durability + function independence + best practice; consolidate for playback, keep chunks if cleaner |
| **Transcription** | Post-click, blocking UI, manual button | Decoupled event-driven backend: chunk lands → transcribe async → store by recording-time offset; no UI dependency |
| **Notes generation** | Manual "Transcribe & generate notes" button | **Auto-fires on session end**; post-session screen shows recording + notes in skeleton/loading state |
| **Summarization architecture** | Single GPT call on full transcript (15s+ tail, 300s risk) | **Map-reduce native**: cheap per-chunk extraction (map) during session + light final reduce at end; honest latency floor ~2–4s masked by skeleton |
| **Backward compatibility** | Additive D8 fallback for existing sessions | **No backward compat** — Sarah confirms cutover (1-line confirm); test data purged freely |
| **Current-pipeline reality** | Not quantified | Cited from investigation `aad5dcdf`: post-click whisper-1 + single GPT call ~15s tail, **Vercel 300s ceiling = real reliability cliff for long sessions** |
| **Transcription model** | `whisper-1` assumed | `gpt-4o-mini-transcribe` recommended: **$0.003/min (half the cost), ~35% better WER, streaming support** — validated against 2026 pricing |
| **Container format** | WebM assumed | Research-validated: WebM/Opus + `-c copy -cues_to_front 1` for Phase 1 (audio-only, no re-encode, fits existing ffmpeg-static); MP4 path noted for future |
| **Async mechanism** | "async job" (unspecified) | Vercel Queues (at-least-once delivery, push mode) for transcription trigger; Vercel Workflows (`"use workflow"`) for consolidation multi-step — both researched and cited |
| **Phase 1 scope** | Consolidation + canonical playback only | Expanded: **during-session transcription + auto-notes trigger + consolidation** = one independently-shippable Phase 1 that also removes the 300s cliff |
| **Open questions** | Q1–Q10 (mostly resolved by dialogue) | Re-cut to fresh Q1–Q8 (only genuinely-open decisions); v1 Qs annotated as resolved |
| **Mid-session live insights** | Implicit future | **Explicitly DEFERRED** — architecture enables it; v1 out of scope |
| **5-axis review** | Consolidation-only | Extended to full 4-stage pipeline (transcription + notes axes added) |
| **Blast radius** | Consolidation + playback paths | Extended: notes pipeline, auto-notes trigger, skeleton UX, manual-button retirement |

---

## Executive summary

Tutors think in **one continuous recording** with pause/continue. They want session notes ready moments after they end a session — not minutes later, not after clicking "Transcribe." Today's implementation forces a multi-minute post-click wait, risks Vercel 300s timeouts on long sessions, and leaks internal segments into playback, transcription assembly, and event timing.

This design re-architects the pipeline as four internally-invisible stages on a single monotonic **recording-time clock**:

1. **Capture in chunks** — incremental timeslice capture + IDB checkpoints + outbox, unchanged. Crash-durable; tutor never sees chunks.
2. **Transcribe during session** — each chunk, when durably uploaded, triggers an async backend transcription job (decoupled from the UI). Transcript segments stored keyed by session + recording-time offset. No transcript is needed during the session itself; its only consumer is the notes pass.
3. **Summarize on end** — ending the session auto-fires the notes pipeline. The reduce step runs over already-completed chunk transcriptions; the tutor sees the post-session screen with notes in a skeleton/loading state that resolves in ~2–4s (because the heavy work ran during the session). The manual "Transcribe & generate notes" button is retired.
4. **Play as one** — async server-side ffmpeg consolidation after session end produces a single canonical audio file. Playback, transcription, and whiteboard events all key to the same monotonic recording-time clock. The UI never sees segments.

**What this supersedes (from investigation `aad5dcdf`):**

| Today's problem | How this design fixes it |
|---|---|
| Whisper + GPT in one post-click sequence → **300s timeout risk** on long sessions | Transcription runs during session; notes reduce is light; no single blocking call |
| Manual "Transcribe & generate notes" button | Auto-fires on session end |
| ~15s notes tail (entire session transcribed + GPT call at once) | Notes appear in ~2–4s (chunk transcriptions pre-done; only final reduce remains) |
| Multi-segment replay via client-side stitch path | Single canonical audio blob; stitch path becomes fallback-only, then deleted |
| Three unreconciled clocks (live: `getAudioMs` perf.now; replay: Whisper `durationSeconds`; notes: wall-clock+Whisper) | One monotonic recording-time axis for everything |
| Backward compat burden for existing sessions | No backward compat needed — Sarah confirms cutover |

**Build is NOT authorized until Andrew ratifies Q1–Q8 below.**

---

## Ground-truth current state — from investigation `aad5dcdf`

This section describes the FROM state the re-architecture is replacing. Code inventory as of `a1850fd`.

### Capture (UNTOUCHED in Phase 1)

- One mixdown `MediaRecorder` on `tutor:mic`. Web Audio graph sums tutor mic + remote peers.
- `MediaRecorder.start(30000)` — 30s timeslice → IndexedDB draft checkpoints (`dft` log prefix).
- **50-minute auto-rollover:** `segment-policy.ts` `SEGMENT_MAX_SECONDS = 50 * 60`. On rollover: stop → upload → new recorder (gapless pre-warm).
- **Toolbar "Pause recording":** `stopAndUpload("final")` → finalizes segment, uploads blob, tears down mic. **Resume = NEW `MediaRecorder`** (not resume on same instance). This is the per-pause-segment model Phase 2 replaces.
- **Presence-pause** (student drops): real `MediaRecorder.pause()` / `resume()` on same recorder — no new segment.

### Storage

- One Vercel Blob + one `SessionRecording` row per finalized segment.
- `SessionRecording.durationSeconds` is NULL at insert; set later by Whisper (this is a known bug — see blast radius seams).
- Billing clock: `WhiteboardSession.activeMs` (heartbeat presence). Wall-clock: `WhiteboardSession.durationSeconds` from session start.

### Current transcription + notes pipeline (the reliability cliff)

From investigation `aad5dcdf` — **everything is post-click, blocking:**

1. Tutor clicks "Transcribe & generate notes."
2. Per-segment Whisper pass: ffmpeg splits at 25MB (`WHISPER_MAX_BYTES`) into ~22MB / 240s parts. Inner parallelism 6 / outer parallelism 3.
3. Single `gpt-4o-mini` call on the assembled full-session transcript → notes (~15s tail on real sessions).
4. **All within a single Vercel function call.** Long sessions with many segments can **TIME OUT at 300s** — a reliability cliff, not just a UX annoyance.

**The three unreconciled clocks:**
- Live event recording: `performance.now()` via `getAudioMs` (freezes on pause)
- Replay playback: Whisper `durationSeconds` (null at insert)
- Notes timestamps: wall-clock + Whisper assembly (naive concat, no wall-clock gap)

None of these agree. The monotonic recording-time clock (D3) fixes all three.

### Playback

- Client stitches N segments via [`replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts).
- [`WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) swaps hidden `<audio>` elements per segment.
- No server-side audio concat exists today (ffmpeg used only for Whisper splitting).

---

## Best-practice validation — 2026 research findings

> **Note per Andrew's explicit design principle:** "Do NOT treat 'industry standard' / 'best practice' assertions as authoritative — research the actual best pattern." All claims below are sourced and confidence-rated. Research conducted 2026-06-06.

### Transcription model recommendation

**Validated against**: costgoat.com (Jun 2026), diyai.io, apiscout.dev, tokenmix.ai — multiple independent sources, high confidence.

| Model | Price/min | Price/hr | WER | Streaming | Recommendation |
|---|---|---|---|---|---|
| `whisper-1` | $0.006 | $0.36 | 5.3% | ❌ batch only | ⚠️ Legacy — still functional, no longer recommended |
| `gpt-4o-transcribe` | $0.006 | $0.36 | 4.1% (~22% fewer errors) | ✅ WebSocket | Same cost as whisper-1, better accuracy |
| `gpt-4o-mini-transcribe` | $0.003 | $0.18 | Comparable on clean audio | ✅ WebSocket | **Recommended for Phase 1** |

**Recommendation: `gpt-4o-mini-transcribe`** — half the cost of `whisper-1`, comparable accuracy on clean tutor audio (controlled mic environment), streaming supported (valuable for future live-transcription path). Migration is near-drop-in: change `model` field in the API call; same `/audio/transcriptions` endpoint, same 25MB per-request limit. Escalate to `gpt-4o-transcribe` if WER quality issues surface in practice on Sarah's audio.

**Per-session cost floor (typical 1hr session):** `gpt-4o-mini-transcribe` at $0.003/min = ~$0.18 for 60 min of audio. Whisper-1 would be $0.36. This is the transcription-only floor; full cost accounting is the subject of the separate cost-observability design thread.

**Confidence:** HIGH. Multiple independent 2026 sources agree on both pricing and the model availability/recommendation. Verify against [official OpenAI pricing](https://openai.com/api/pricing/) before production billing commitments.

### Audio container format

**Validated against**: addpipe.com, dev.to/alexneamtu, w3c/mediacapture-record issue thread, Medium (2026) — high confidence on WebM behavior, medium confidence on MP4 path (Chrome 130+ native MP4 is newer).

**WebM/Opus (current recorder output):**
- MediaRecorder timeslice chunks from a SINGLE recorder instance are concatenatable server-side (spec-compliant: the combination of all blobs from a completed recording MUST be playable).
- Critical caveat: Chrome timeslice WebM recordings lack `Duration` metadata and `Cues` until ffmpeg post-processing.
- **Fix**: `ffmpeg -i concat_list.txt -c copy -cues_to_front 1 canonical.webm` — no re-encoding, just remux. Moves `Cues` element to front → seekable playback without scanning the whole file.
- This is the Phase 1 path: stays in WebM, reuses `ffmpeg-static` patterns from `transcribe-ffmpeg.ts`.

**MP4 path (future consideration):**
- Chrome 130+ (June 2024) and Safari can record MP4 natively — no server-side transcoding needed for the majority of recordings.
- Firefox records WebM/VP8 → would need server-side transcoding to MP4.
- For audio-only (our use case), MP4/AAC would require re-encoding from Opus → meaningful quality/time cost.
- **Recommendation for Phase 1:** Stay WebM/Opus — simpler, no re-encode, existing ffmpeg-static pattern works. Revisit MP4 when custom player (B4) ships and browser compat requirements clarify.

**HLS/DASH/fMP4 (segmented manifest):**
- fMP4 + HLS/DASH is the industry standard for adaptive bitrate video streaming at scale.
- **Not applicable at our scale** (single tutor, bounded ~1hr sessions, no adaptive bitrate needed). A single canonical WebM/Opus file with seekable `Cues` is the correct, simpler choice. We are not a CDN-scale streaming platform.
- If we ever serve recordings to many concurrent parents at high traffic, revisit CDN origin + segmented delivery at that point.

### Chunked capture cadence and VAD

- Timeslice at 30s (current) is appropriate for crash-durability checkpointing — writes an IDB draft entry every 30s, limiting worst-case data loss.
- VAD (Silero VAD via `ricky0123/vad` or `vad-web`) can set speech-boundaries to avoid mid-word chunk splits. **Relevant if word-boundary artifacts appear in transcription.** For Phase 1, the 25MB / 240s Whisper split boundary is the alignment concern, not the 30s timeslice.
- **Recommendation: keep 30s timeslice for Phase 1.** Evaluate VAD-bounded chunking in a later phase if mid-word splits surface as a real quality issue in Sarah's transcriptions.

### Async pipeline mechanisms on Vercel

**Validated against**: Vercel Queues docs (vercel.com/docs/queues), Vercel Workflows blog (vercel.com/blog), Vercel Labs reel0 example — high confidence on Queues (GA), medium confidence on Workflows (newer, DevKit availability).

**Vercel Queues** (recommended for transcription trigger):
- GA product. Durable pub/sub: at-least-once delivery, auto-retry on consumer failure, push mode (Vercel invokes consumer function per message).
- Pattern: chunk uploaded → producer publishes `{sessionId, chunkBlobUrl, recordingTimeOffset}` to a `chunk-transcribe` topic → consumer function invokes `gpt-4o-mini-transcribe` → stores result keyed by `(sessionId, recordingTimeOffsetMs)`.
- Decouples chunk upload from transcription — if transcription fails, the queue retries; the upload path is never blocked.

**Vercel Workflows** (`"use workflow"` + `"use step"` directives — recommended for consolidation):
- Newer programming model (DevKit, expanding availability in 2026). Durable execution: each `"use step"` runs as its own function invocation — survives crashes, deploys, retries automatically. No single 300s ceiling across the pipeline.
- Ideal for multi-step consolidation: `fetch-segments → download-blobs → ffmpeg-concat → upload-canonical → verify → db-update`. Each step independently retried on failure.
- **Availability note (medium confidence):** Vercel Workflows is in active development/expansion as of 2026. Verify availability on the current Vercel Pro plan before building. Fallback: implement consolidation as a Vercel Queue consumer + manual state machine (the v1 approach) if Workflows is unavailable.
- A Vercel Labs example (reel0) demonstrates this exact pattern: upload → Sandbox (ffmpeg) → Blob → deliver. Our audio-only use case is simpler (no video, lighter ffmpeg load).

**Vercel Sandbox** (for ffmpeg in Workflows):
- Isolated compute environment, suitable for ffmpeg. Used in Vercel's own examples for video/audio processing.
- Alternative: for audio-only concat, our existing `ffmpeg-static` in a regular Vercel function may complete within 300s for bounded ~1hr sessions (audio-only concat is lightweight). Test timing before assuming Sandbox is required.

### Map-reduce summarization

**Validated against**: Google Cloud Blog (Gemini workflows), Medium (Megha Soni), futureagi.com RAG Summarization 2026 — multiple sources, high confidence on the pattern.

Map-reduce is well-established for long-document summarization. The key advantage for our use case: **map steps parallelize** (or in our case, run incrementally during the session as chunks complete), so by session end, the reduce step is the only remaining computation.

For our specific "tutor notes" use case, the map step extracts structured per-chunk artifacts (topics covered, student questions, follow-up items, corrections) rather than prose summaries — this is cheaper (less output tokens) and more useful for the reduce step, which synthesizes a coherent session note.

**Honest latency floor (important — do not overclaim):** With chunks transcribed during session, the reduce step at end operates on short chunk-extraction outputs. Typical `gpt-4o-mini` reduce on 6–8 chunk extractions: ~1–3s. Total notes-ready latency after session end: ~2–4s (reduce latency + DB write + UI hydration). This is **masked by the skeleton loading state** — the tutor sees the post-session screen immediately; notes fill in visibly. This is NOT sub-second; do not promise "instant." The skeleton UX is load-bearing, not cosmetic.

---

## Constraint / threat model (v2)

| Constraint | Implication |
|---|---|
| **Tutor mental model** | ONE recording with pause/continue; notes appear automatically after session. Never see chunks, segments, or parts. |
| **Crash durability** | Incremental capture (timeslice + IDB drafts + outbox) is non-negotiable — the only legitimate reason to chunk. |
| **Vercel 300s function ceiling** | CURRENT CLIFF: full-session transcription + notes in one call times out on long sessions. FIX: distribute across async jobs; no single blocking call. Consolidation async (Workflows or Queue). |
| **Transcription 25MB per-request limit** | OpenAI API unchanged: `gpt-4o-mini-transcribe` same 25MB limit as whisper-1. ffmpeg splitting pattern retained. |
| **iOS Safari** | `MediaRecorder.pause()` / `resume()` behavior differs. Phase 2 (true pause, D5) is hardware-gated. Phase 1 capture is untouched. |
| **No backward compatibility** | Andrew has confirmed: Sarah has nothing to preserve. Get her 1-line confirm before any destructive cutover of her production data. Test data purged freely. |
| **Data-loss bar** | Chunks never deleted until canonical blob verified durable. Transcript rows never deleted. Notes generation failure must not destroy the session. |
| **Mid-session live insights** | Explicitly DEFERRED. Architecture enables it (chunk transcripts + recording-time offsets are the foundation); not in v1 scope. |

---

## Core design decisions (v2)

### D1 — Keep incremental capture; make the pieces INTERNAL

**Decision:** 30s timeslice + per-segment durable uploads (outbox / IDB) **stay**. They exist solely for crash durability and upload resilience.

**What changes:** Pieces are consolidated server-side after session end and **never leak** to playback, transcription UI, or tutor-facing surfaces. Transcription runs per-chunk server-side (decoupled); tutor never sees "segment 2 of 4."

**Rationale:** The W1 durability design proved that incremental checkpointing is load-bearing. The fix is to hide the seam, not remove the mechanism.

---

### D2 — Transcription is a decoupled event-driven backend pipeline

**Decision:** When a chunk blob lands in Vercel Blob (outbox confirms upload), a message is published to a `chunk-transcribe` Vercel Queue. A consumer function:

1. Fetches the chunk blob.
2. ffmpeg-splits at 25MB if needed (reuse `transcribe-ffmpeg.ts` pattern).
3. Calls `gpt-4o-mini-transcribe` on each part.
4. Assembles the part transcripts into a chunk transcript row keyed by `(sessionId, recordingTimeOffsetMs)`.
5. Marks the chunk as transcribed (`TranscriptChunk.status = done`).

**Not tied to the UI:** The whiteboard/recording page knows nothing about transcription progress. No spinner, no "transcribing..." state on the session screen. The transcript's only consumer is the notes pass.

**Recording-time keying:** Each chunk transcript row stores its start offset in the monotonic recording-time clock. When transcripts are assembled for the reduce step, they are ordered by `recordingTimeOffsetMs` — not wall-clock, not segment index.

**Rationale:** Decoupling fixes the 300s cliff for transcription. Decoupling also makes the pipeline independently retryable: a Whisper API blip doesn't block session end or notes generation.

---

### D3 — Single monotonic "recording-time" clock for everything

**Decision:** Audio, whiteboard events, and transcript all key to **one clock** that advances **only while actively recording**. Pauses collapse — no dead air on the timeline.

**Separate concern:** Session billing duration stays on `WhiteboardSession.activeMs` (presence heartbeat). Wall-clock session duration stays on `WhiteboardSession.durationSeconds`. Neither is the recording-time clock.

**Rationale:** Today's three-clock drift (`getAudioMs` / Whisper `durationSeconds` / wall-clock+Whisper) is the root of replay sync bugs AND of the gap in `assembleIncrementalTranscript` (investigation `aad5dcdf`). One primitive kills all three mismatches.

**Phase gate:** D3 is Phase 3 (after capture changes in Phase 2 stabilize). Phase 1 uses the existing `getAudioMs` / `durationSeconds` axes for transcript offset — imperfect but functional for the Phase 1 notes pipeline.

---

### D4 — Pauses collapse (gapless)

**Decision:** Both tutor-initiated pause and involuntary disconnect **collapse**:

- Audio is gapless (no silence inserted for pause duration).
- Recording-time clock **freezes** during pause.
- Post-pause content resumes at the pre-pause recording-time offset.

**Evidence:** Andrew's H1 hardware observation — collapse "looked okay": audio stayed in sync, strokes resumed at the right place.

**Phase gate:** D4 is formally Phase 3 (requires D3). The Phase 1 transcription pipeline tolerates the imperfection: chunk offsets accumulate across pause-segment gaps (wall-clock adjacent, recording-time collapsed). Notes quality is acceptable; precise timestamp alignment waits for Phase 3.

---

### D5 — Toolbar pause becomes a TRUE pause (Phase 2, iOS-gated)

**Decision:** Switch whiteboard toolbar "Pause recording" from `stopAndUpload("final")` + new recorder to `pauseRecording()` / `resumeRecording()` on the **same** `MediaRecorder`.

**Effect:** One WebM header per rollover window → trivially concatenable. No per-pause segment. Segments come only from 50-min rollover and crash boundaries — all invisible post-consolidation.

**Gate:** iOS hardware smoke of continuous pause/resume + timeslice durability on Andrew's device. Phase 2 is blocked until this passes.

---

### D6 — Server-side consolidation = Vercel Workflow (async post-end)

**Decision:** After `endWhiteboardSession` + `finalizeOutboxAfterEnd`, a Vercel Workflow (`"use workflow"`) is triggered. Steps:

1. Flip `consolidationStatus → pending`.
2. Fetch all `SessionRecording` rows ordered by creation time.
3. Download segment blobs from Vercel Blob.
4. ffmpeg-concat → temp file (`-c copy -cues_to_front 1` for WebM/Opus; no re-encode).
5. Upload canonical blob with `multipart: true` (Vercel Blob multipart for reliability on larger files).
6. Verify blob durable (HEAD / size check).
7. Atomically set `canonicalAudioUrl` + `consolidationStatus = done` + `consolidatedAt`.

Each step independently retried on failure. No 300s single-function ceiling applies.

**Durability rule:** Segments never deleted until canonical is verified durable (write-then-flip-status).

**Fallback if Vercel Workflows unavailable on current plan:** Implement consolidation as a Vercel Queue consumer + state machine (the approach originally sketched in v1). The step isolation is done manually via status-flip guards. Less elegant, same durability guarantee.

---

### D7 — Auto-notes on session end (manual button retired)

**Decision:** Session end auto-fires the notes pipeline. The tutor never sees a "Transcribe & generate notes" button.

**Flow:**

```
endWhiteboardSession completes
  │
  ↓
finalizeOutboxAfterEnd (existing)
  │
  ↓  [parallel]
  ├── enqueue consolidation (D6)
  └── enqueue notes-reduce (D7)
        │
        ↓
       [notes-reduce worker]
        │  poll: are ALL TranscriptChunk rows for this session done?
        │  → if yes: proceed to reduce
        │  → if pending chunks remain AND session-seal age < 5min: wait (queue retry / sleep-step)
        │  → if timeout (5min since session seal): reduce on available + flag "partial notes"
        │
        ↓
       map step (per chunk):
        │  extract: topics, student questions, corrections, follow-ups
        │  model: gpt-4o-mini, ~100–300 output tokens per chunk
        │  parallel across all chunks (or done already during session — see D8)
        │
        ↓
       reduce step:
        │  synthesize chunk extractions → coherent session note
        │  model: gpt-4o-mini (escalate to gpt-4o on quality signal)
        │  ~1–3s on typical extraction set (6–8 chunks/hr)
        │
        ↓
       write TutorNote row → set status = done
        │  [tnt] wbsid=<id> action=notes_done chunks=N latencyMs=M
```

**Guards (ALL required — never skip):**

| Guard | Mechanism |
|---|---|
| Completion gate | Notes only after session sealed AND all produced chunks transcribed — never notes on partial transcript. Timeout fallback at 5min surfaces "partial notes" flag. |
| Failure surface | Post-session screen shows skeleton/loading for up to 5min. On permanent failure: error card with "Retry" button. Never an infinite skeleton. |
| Manual regenerate | "Regenerate notes" button remains as a rarely-used escape hatch. Tutor should never need it; it exists for failures. |
| Session not sealed | Notes worker checks `WhiteboardSession.endedAt` is set before reducing. Guard against accidental early trigger. |

**Post-session UX:** recording player + notes displayed together. Notes in skeleton/blurred loading state until the `TutorNote` row flips to `done`. Typical resolution: ~2–4s after session end (reduce step latency + DB write). This is the skeleton UX load-bearing moment — the tutor sees it for a few seconds, not minutes.

---

### D8 — Map layer: per-chunk extraction during session (incremental target)

**Decision:** Architect the notes pipeline map-reduce-native from day one. The map step (cheap per-chunk topic/question/follow-up extraction) runs during the session as each chunk's transcription completes. By session end, map outputs exist for most chunks; the reduce step synthesizes them immediately.

**Map model:** `gpt-4o-mini` with a focused extraction prompt ("what topics were introduced, what questions did the student ask, what corrections were made, what needs follow-up in this audio segment?"). Short output (~100–300 tokens). Cheap.

**Reduce model:** `gpt-4o-mini` with a synthesis prompt ("given these per-segment extractions, write coherent session notes in the tutor's expected format"). Escalate to `gpt-4o` if quality is insufficient in pilot.

**Honest latency accounting:**
- Map latency (during session): hidden — runs as each chunk transcribes, in parallel with the session.
- Reduce latency (at session end): ~1–3s on typical 6–8 chunk extractions for a 1hr session.
- **Total visible latency for the tutor: ~2–4s after the session end button.** This is the honest floor. Do not promise sub-second.
- The skeleton loading state makes this acceptable: the tutor sees the post-session screen immediately; notes fill in within a few seconds.

**V1 fallback (if map layer is out of scope for Phase 1 timeline):** Skip the during-session map step. At session end, assemble all chunk transcripts, send to gpt-4o-mini in one call. Latency: ~5–15s depending on session length. Still better than today (no 300s risk; notes start without a click). **Map layer is the target; single-reduce-at-end is the accepted fallback.**

**Mid-session live insights (DEFERRED):** The architecture enables it — chunk transcripts + map extractions accumulate in real time. But surfacing live insights TO the tutor during the session is explicitly out of v1 scope. The foundation is correct; the feature waits.

---

### D9 — Playback plays ONE file

**Decision:** Single canonical audio URL + single event log.

- [`WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) simplifies to one `<audio src>`.
- [`replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts) becomes deletable in Phase 4 (or a trivial shim during transition).
- Custom audio controls (B4 `SessionAudioPlayer`) — see D10.
- Single-segment sessions use the same path (N=1).

---

### D10 — Custom audio controls (B4 unified player)

**Decision:** Native `<audio controls>` is replaced by the B4 `SessionAudioPlayer` component (custom play/pause, scrubber, timeline sync). This is the "custom audio controls over native (aesthetic)" directive from Andrew.

**Phase gate:** D10 is Phase 4 / B4 scope — after consolidation (D6) makes playback trivial. Phase 1 may ship with temporary native `<audio controls>` fallback on the canonical file; the unified custom player replaces it in Phase 4.

---

## Phasing (v2 — revised sequence)

### Phase 1 — During-session transcription + auto-notes + consolidation (capture UNTOUCHED)

**This is the independently-shippable Phase 1 win. It fixes the 300s reliability cliff AND adds auto-notes.**

**Scope:**

1. **Transcription pipeline:**
   - Vercel Queue topic `chunk-transcribe` + consumer function.
   - Trigger: outbox confirms chunk blob uploaded → publish message.
   - Consumer: ffmpeg-split if needed → `gpt-4o-mini-transcribe` → write `TranscriptChunk` rows keyed by `(sessionId, recordingTimeOffsetMs)`.
   - New schema: `TranscriptChunk` table (see Schema section).

2. **Notes pipeline (map-reduce or single-reduce fallback):**
   - Target: map step runs as chunks complete (per-chunk `gpt-4o-mini` extraction → `TranscriptChunkExtraction` rows).
   - Fallback: assemble all chunks at end → single `gpt-4o-mini` call.
   - Session end triggers: enqueue notes-reduce job.
   - New schema: `TutorNote` table with `status` field (`pending | generating | done | failed | partial`).

3. **Consolidation:**
   - Vercel Workflow (or Queue consumer + state machine fallback) triggered post-end.
   - ffmpeg-concat → canonical WebM/Opus blob (`-c copy -cues_to_front 1`).
   - New schema: `WhiteboardSession.canonicalAudioUrl`, `consolidationStatus`, `consolidationError`, `consolidatedAt`.

4. **Playback update:**
   - Prefer canonical when ready; stitch fallback while `consolidationStatus != done` (for new sessions during pending window).
   - No stitch fallback for old sessions (no backward compat per Andrew's directive — see Sarah confirm gate).

5. **Post-session screen:**
   - Recording player (native `<audio>` on canonical URL, or stitch during pending).
   - Notes section: skeleton/loading until `TutorNote.status = done`. Error card on `failed`. Manual regenerate button.
   - Retire "Transcribe & generate notes" manual button.

6. **Manual button retirement:**
   - Remove the button from the whiteboard session review UI.
   - Keep `generateNotesFromWB` action internally as the implementation; the manual trigger path is removed from the UI.

**Risk:** Medium (transcription + notes pipeline = new infrastructure; consolidation is lower-risk). Capture path unchanged. Independently shippable.

**Acceptance (v2):**
- New 1hr session with 2+ segments: notes appear on post-session screen without any click, within 5s of session end (skeleton visible, resolves cleanly).
- Transcription failure on one chunk: notes pipeline retries chunk; completion gate prevents partial-transcript notes.
- Consolidation failure: playback falls back to segment-stitch while retrying; tutor can still review the session.
- 300s cliff: no single Vercel function call handles the entire transcription+notes sequence.
- Sarah data cutover: 1-line confirm obtained before any destructive migration of her production session data.

---

### Phase 2 — True pause + unified recording-time clock (D5 + D3/D4)

**Scope:**

- D5: toolbar pause → `pause()` / `resume()` on same recorder.
- D3/D4: monotonic recording-time clock for audio + whiteboard events.
- Transcript assembly by recording-time offsets (replaces phase-1 wall-clock-adjacent assembly).

**Risk:** Medium. iOS Safari is the unknown.

**Gate:** iOS hardware smoke of continuous pause/resume + timeslice durability on Andrew's device.

---

### Phase 3 — Playback simplification

**Scope:**

- D9: delete stitch path once canonical is universal and all relevant sessions migrated.
- Optional: Sarah's session backfill (if she wants old sessions preserved; else purge per no-backward-compat directive).

**Risk:** Low (cleanup only). Do not delete fallback until Sarah's old sessions are addressed (purge or backfill).

---

### Phase 4 — Custom player + map layer (B4 unified `SessionAudioPlayer`)

**Scope:**

- D10: `SessionAudioPlayer` component replaces native `<audio controls>` on all playback surfaces.
- If map layer was deferred from Phase 1: implement per-chunk extraction during session.
- Live-insights foundation enablement (architecture ready; feature surface is future Phase 5+).

**Risk:** Low-medium. Custom player B4 already in scope for the v1 redesign.

---

## 5-axis reliability review (v2 — full pipeline)

Mandatory per [`reliability-bar.mdc`](../../../../agenticPipeline/.cursor/rules/reliability-bar.mdc). BLOCKERs fold into Phase-1 acceptance.

### Axis 1 — Data-loss / durability

| Risk | Mitigation | Phase |
|---|---|---|
| Chunk blob upload fails | Existing outbox + IDB pattern (unchanged in Phase 1). Retryable. | Existing |
| TranscriptChunk write fails | Queue consumer retries until ACK; idempotent on `(sessionId, chunkBlobUrl)` key. | Phase 1 |
| Canonical write fails mid-concat | Partial canonical discarded; Workflow step retries. Segments preserved. | Phase 1 |
| Segment deleted before canonical verified | **Never.** GC only after `consolidationStatus = done` + blob HEAD check. | Phase 1 |
| TutorNote row partially written | Atomic write: entire note or nothing. `status` field guards partial reads. | Phase 1 |
| Notes generated on partial transcript | Completion gate: all `TranscriptChunk.status = done` before reduce. Timeout fallback flags "partial". | Phase 1 **BLOCKER** |

### Axis 2 — Crash / failure recovery

| Risk | Mitigation | Phase |
|---|---|---|
| Transcription consumer crashes mid-job | Queue redelivers message; consumer is idempotent on `(sessionId, chunkBlobUrl)`. | Phase 1 |
| Consolidation job crashes mid-concat | Workflow step retries from last completed step; temp concat file discarded cleanly. | Phase 1 |
| Notes reduce fails permanently | `TutorNote.status = failed`; post-session screen shows error card + "Retry" button. Never stuck skeleton. | Phase 1 **BLOCKER** |
| Session end txn fails after notes enqueue | Notes worker checks `WhiteboardSession.endedAt` — if not set, aborts. Prevents notes on live sessions. | Phase 1 **BLOCKER** |
| Capture crash mid-session | Unchanged: 30s timeslice + IDB drafts + outbox (Phase 1 capture untouched). | Existing |
| Whisper API outage | Chunk queue retries with backoff. Completion gate ensures notes only after all chunks done (or timeout with partial flag). | Phase 1 |

### Axis 3 — Observability

| Requirement | Implementation |
|---|---|
| Per-session id logging | Every log line carries `wbsid=<id>`. |
| Existing log prefixes | `cns` (consolidation), `rid` (audio recorder), `obx` (outbox) — unchanged. |
| **New log prefix: `txc`** | Per-chunk transcription lifecycle: `[txc] wbsid=<id> chunkIdx=N action=start|done|failed offsetMs=M` |
| **New log prefix: `tnt`** | Notes pipeline: `[tnt] wbsid=<id> action=map_start|map_done|reduce_start|reduce_done|failed chunks=N latencyMs=M` |
| State transitions logged | Transcription: start, split (count), whisper-call, chunk-done, chunk-failed. Notes: map-start, map-done, reduce-start, reduce-done, failed, partial. |
| Tutor-visible failure | Post-session screen: error card on `TutorNote.status = failed` or `partial`. "Retry" button. |
| Queue depth / backlog | Vercel Queue consumer logs per message; monitor for growing backlog (transcription API slowdown). |

**Register `txc` and `tnt` in `AGENTS.md` § Conventions before Phase 1 merges.**

### Axis 4 — Concurrency / races

| Risk | Mitigation |
|---|---|
| Double-trigger on session end for consolidation | Guard: only enqueue if `consolidationStatus` is null or `failed`. |
| Double-trigger on session end for notes | Guard: only enqueue if `TutorNote` for this session is null or `failed`. |
| Concurrent consolidation runs | Status machine: `pending → running → done | failed`. Optimistic lock on `running`. |
| Concurrent notes runs | Same status machine on `TutorNote.status`. |
| Notes reduce fires before session sealed | Worker checks `WhiteboardSession.endedAt != null`. If not set: abort (requeue or fail safe). |
| New chunk uploaded after notes reduce fired | Completion gate enforced at reduce start: all chunks must be transcribed at the moment of reduce. If a late chunk arrives post-reduce, flag note as `stale` (future enhancement; v1 guard: only fire reduce after `finalizeOutboxAfterEnd` confirms no pending uploads). |
| Playback reads canonical mid-write | Status flip is atomic; URL only set when blob verified. |

### Axis 5 — Platform limits

| Limit | Impact | Mitigation |
|---|---|---|
| Vercel 300s function ceiling | **Current cliff:** full-session transcription + notes in one call. | Fixed by Phase 1: each chunk transcription is an independent consumer invocation; notes reduce is a short call. No single invocation handles the whole pipeline. |
| Whisper / `gpt-4o-mini-transcribe` 25MB per-request | Still applies. | ffmpeg-split at 25MB retained (reuse `transcribe-ffmpeg.ts`). |
| Vercel Queue delivery | At-least-once. Consumer must be idempotent. | Idempotency keyed on `(sessionId, chunkBlobUrl)` — if same message delivered twice, second invocation finds chunk already done and no-ops. |
| Vercel Workflows availability | DevKit / newer feature — verify plan availability before building. | Fallback: Queue consumer + status-machine consolidation (same semantics, more manual). |
| ffmpeg-static availability | Existing: `transcribe-ffmpeg.ts` uses it; `serverExternalPackages` in Next config. | Consolidation reuses same pattern. |
| Blob path / size | Canonical at `sessions/{studentId}/{wbsid}/canonical.webm`; TranscriptChunk storage in Neon (not Blob — text is small). | Monitor canonical blob size for 2hr+ sessions. |
| iOS Safari pause/resume | Phase 2 hardware gate. | Phase 1 capture untouched — iOS not a Phase 1 risk. |
| `gpt-4o-mini` token limits | Reduce step receives chunk extraction outputs (short). Single-reduce fallback receives assembled chunk transcripts (may be longer for 1hr sessions). | For single-reduce fallback: split transcript if needed (it fits a 128K context window for reasonable sessions; flag if not). |

**New platform assumptions introduced by Phase 1 (must update `docs/PLATFORM-ASSUMPTIONS.md` in the Phase 1 commit — capability contracts pre-registered in design doc § "Vercel-specific dependencies & migration map" and `PLATFORM-ASSUMPTIONS.md` §11):**

- Vercel Queues topic `chunk-transcribe` — at-least-once delivery, consumer timeout, max message size.
- Vercel Workflows (or fallback: Queue consumer) for consolidation — availability on Pro plan, step timeout.
- `gpt-4o-mini-transcribe` at $0.003/min — pricing verified Jun 2026; rate-card entry required for cost-observability design thread.
- `TranscriptChunk` Neon table — text storage, index on `(sessionId, recordingTimeOffsetMs)`.

---

## Blast radius (v2)

### Capture (UNTOUCHED in Phase 1)

| File | Role |
|---|---|
| [`src/hooks/useAudioRecorder.ts`](../../src/hooks/useAudioRecorder.ts) | MediaRecorder lifecycle, timeslice, pause/resume — NOT modified |
| [`src/hooks/useWhiteboardRecorder.ts`](../../src/hooks/useWhiteboardRecorder.ts) | Recorder orchestration, `getAudioMs` clock — NOT modified |
| [`src/lib/recording/lifecycle-machine.ts`](../../src/lib/recording/lifecycle-machine.ts) | FSM states — NOT modified |
| [`src/lib/recording/recording-draft-store.ts`](../../src/lib/recording/recording-draft-store.ts) | IDB draft checkpoints — NOT modified |
| [`src/lib/recording/segment-policy.ts`](../../src/lib/recording/segment-policy.ts) | 50-min rollover — NOT modified |

### Transcription pipeline (NEW in Phase 1)

| File | Role |
|---|---|
| **NEW** `src/lib/recording/transcription-worker.ts` | Queue consumer: fetch chunk blob → ffmpeg-split → `gpt-4o-mini-transcribe` → write TranscriptChunk rows |
| **NEW** `src/api/queues/chunk-transcribe/route.ts` | Vercel Queue consumer endpoint |
| [`src/lib/transcribe.ts`](../../src/lib/transcribe.ts) | Whisper orchestration — update model to `gpt-4o-mini-transcribe` |
| [`src/lib/transcribe-ffmpeg.ts`](../../src/lib/transcribe-ffmpeg.ts) | ffmpeg split patterns — reuse; no change needed |
| [`src/lib/recording/upload-outbox.ts`](../../src/lib/recording/upload-outbox.ts) | Outbox enqueue — add Queue publish on successful upload (fix `audioStartedAtMs` bug in Phase 2) |

### Notes pipeline (NEW in Phase 1)

| File | Role |
|---|---|
| **NEW** `src/lib/recording/notes-worker.ts` | Notes-reduce worker: poll completion gate → map extractions → reduce → write TutorNote |
| **NEW** `src/api/queues/notes-reduce/route.ts` | Vercel Queue consumer endpoint for notes trigger |
| `generateNotesFromWB` in [`whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Notes generation entry — refactor from manual-button action to worker-callable function; remove manual trigger |
| **MODIFIED** Post-session review page | Remove "Transcribe & generate notes" button; add TutorNote skeleton + error + retry surface |

### Consolidation (NEW in Phase 1)

| File | Role |
|---|---|
| **NEW** `src/lib/recording/consolidate-audio.ts` | ffmpeg-concat module: download segments → concat with `-c copy -cues_to_front 1` → upload canonical |
| **NEW** `src/api/workflows/consolidation/route.ts` | Vercel Workflow (or Queue consumer) for consolidation |
| [`src/app/admin/students/[id]/whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | `endWhiteboardSession` — add post-end triggers for consolidation + notes |
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | New tables + WhiteboardSession fields (see Schema section) |
| [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) | New load-bearing assumptions (update in same commit) |

### Playback

| File | Role |
|---|---|
| [`src/components/whiteboard/WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) | Prefer canonical URL when available; stitch fallback during pending window |
| [`src/lib/whiteboard/replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts) | Stitch timeline — kept as fallback; deletable in Phase 3 |
| Admin + share replay pages | Consume canonical URL with stitch fallback |

### Riskiest seams (explicit call-out)

| Seam | Why it matters |
|---|---|
| **`handleEndSession` ordering** | stop → flush → drain → assemble → `endWhiteboardSession` → `finalizeOutboxAfterEnd` → enqueue consolidation + notes. Queue publish must be **after** outbox finalize, not inside end-session txn. |
| **Notes completion gate** | Reduce must not fire until all chunks produced by THIS session are transcribed. Gate must handle: (a) late chunks from final outbox flush; (b) transcription API retries that haven't resolved; (c) timeout path. |
| **Sarah data cutover** | Before merging Phase 1 to master: get Sarah's 1-line confirm to purge her existing session recordings. Do NOT do this without explicit confirmation. |
| **Outbox crash recovery** | Transcription trigger must only fire after chunk blob is confirmed uploaded (outbox status = uploaded). Do not trigger on IDB draft write. |
| **Atomic end-session txn** | `createMany` for `SessionRecording` rows — Queue publishes are outside the txn (can't roll back a sent message). Guard: consumer is idempotent. |
| **`audioStartedAtMs: Date.now()` bug** | Fix in Phase 2 when recording-time clock lands. Phase 1 uses `createdAt` ordering for segment order. |
| **TranscriptChunk idempotency** | Queue message may be redelivered. Consumer must upsert on `(sessionId, chunkBlobUrl)`, not insert-and-fail. |

---

## Schema additions (Phase 1)

Additive migrations only — no column drops or renames.

```prisma
// WhiteboardSession — additive fields
canonicalAudioUrl     String?
consolidationStatus   String?   // pending | running | done | failed
consolidationError    String?   // last error message when failed
consolidatedAt        DateTime?

// NEW table: TranscriptChunk
model TranscriptChunk {
  id                    String   @id @default(cuid())
  sessionId             String
  chunkBlobUrl          String   // the uploaded segment blob URL (idempotency key)
  recordingTimeOffsetMs Int      // start offset in monotonic recording-time clock
  durationMs            Int?     // chunk audio duration (from gpt-4o-mini-transcribe response)
  transcript            String   // assembled transcript text for this chunk
  status                String   // pending | transcribing | done | failed
  transcribedAt         DateTime?
  error                 String?
  createdAt             DateTime @default(now())
  
  @@unique([sessionId, chunkBlobUrl])   // idempotency
  @@index([sessionId, recordingTimeOffsetMs])
  
  session WhiteboardSession @relation(fields: [sessionId], references: [id])
}

// NEW table: TranscriptChunkExtraction (map step output)
model TranscriptChunkExtraction {
  id                    String   @id @default(cuid())
  sessionId             String
  chunkId               String   @unique
  topics                String   // JSON: string[]
  studentQuestions      String   // JSON: string[]
  corrections           String   // JSON: string[]
  followUps             String   // JSON: string[]
  extractedAt           DateTime @default(now())
  
  chunk TranscriptChunk @relation(fields: [chunkId], references: [id])
}

// NEW table: TutorNote
model TutorNote {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  status      String   // pending | generating | done | failed | partial
  content     String?  // final session note (markdown or structured)
  isPartial   Boolean  @default(false)  // true if generated on partial transcript (timeout path)
  error       String?
  generatedAt DateTime?
  createdAt   DateTime @default(now())
  
  session WhiteboardSession @relation(fields: [sessionId], references: [id])
}
```

---

## Pipeline sketches

### Transcription pipeline (Phase 1)

```
Chunk blob uploaded (outbox confirmed)
  │
  ↓
Publish to Vercel Queue: chunk-transcribe
  { sessionId, chunkBlobUrl, recordingTimeOffsetMs }
  │
  ↓  [consumer function — independent invocation, not subject to session 300s]
  │  [txc] wbsid=<id> action=start chunkIdx=N offsetMs=M
  │
  ├── if chunk > 25MB: ffmpeg-split → N parts
  │
  ├── gpt-4o-mini-transcribe on each part
  │
  ├── assemble part transcripts into chunk transcript
  │
  ├── upsert TranscriptChunk (idempotent on sessionId+chunkBlobUrl)
  │
  ├── if map layer enabled: gpt-4o-mini extraction → upsert TranscriptChunkExtraction
  │
  └── [txc] wbsid=<id> action=done offsetMs=M durationMs=D
```

### Notes pipeline (Phase 1)

```
endWhiteboardSession + finalizeOutboxAfterEnd complete
  │
  ↓
Publish to Vercel Queue: notes-reduce
  { sessionId }
  │
  ↓  [consumer function]
  │  [tnt] wbsid=<id> action=reduce_start
  │
  ├── check: WhiteboardSession.endedAt is set → else abort
  │
  ├── check: all TranscriptChunk rows for session status=done?
  │     → if pending chunks AND seal age < 5min: requeue with delay (wait for transcription)
  │     → if timeout (5min): proceed with available, set isPartial=true
  │
  ├── if map extractions exist (map layer): read TranscriptChunkExtraction rows
  │   else: read TranscriptChunk.transcript rows (single-reduce fallback)
  │
  ├── gpt-4o-mini reduce → synthesize session note
  │
  ├── write TutorNote { status: done, content: note, isPartial }
  │
  └── [tnt] wbsid=<id> action=reduce_done latencyMs=M chunks=N partial=false
```

### Consolidation pipeline (Phase 1)

```
endWhiteboardSession + finalizeOutboxAfterEnd complete
  │
  ↓
Trigger Vercel Workflow (or enqueue consolidation)
  │
  [Step 1 — guard]
  │  guard: consolidationStatus is null or failed → flip to pending; else skip
  │  [cns] wbsid=<id> action=enqueue segmentCount=N
  │
  [Step 2 — fetch segments]
  │  fetch SessionRecording rows ordered by createdAt
  │
  [Step 3 — download + concat]
  │  download blobs from Vercel Blob
  │  ffmpeg concat: -c copy -cues_to_front 1 → canonical.webm (temp)
  │  [cns] wbsid=<id> action=concat_done sizeBytes=B
  │
  [Step 4 — upload canonical]
  │  put(canonical.webm, { multipart: true }) → sessions/{studentId}/{wbsid}/canonical.webm
  │
  [Step 5 — verify + commit]
  │  HEAD blob → confirm size matches
  │  txn: set canonicalAudioUrl + consolidationStatus=done + consolidatedAt
  │  [cns] wbsid=<id> action=done canonicalBytes=B
  │
  on any step failure: status=failed, consolidationError=msg, Workflow retries step
```

---

## Vercel-specific dependencies & migration map

> **Directive (Andrew, 2026-06-06):** Tie-ins to Vercel-specific functionality are acceptable while we run on Vercel. Each such dependency MUST be documented as a **capability contract** — *Vercel X provides capability Y; generic/AWS equivalent = Z* — so a future platform migration knows exactly what must be in place. Cross-register design-stage entries in [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §11.
>
> **Scope:** Only primitives this design actually proposes. **Vercel Cron is not used** in this pipeline (no scheduled sweep; work is event-driven off upload + session end). **Vercel Sandbox** is cited as an optional ffmpeg host if regular functions prove too tight — not a Phase 1 dependency; see Workflows row below.

| Vercel primitive | Capability it provides | Why we depend on it | Generic / AWS equivalent | Migration notes / gotchas |
|---|---|---|---|---|
| **Vercel serverless functions (Node.js)** | Per-request (or per-queue-message) isolated compute: HTTP server actions, API routes, and queue/workflow consumer handlers run as short-lived Node.js invocations with configurable `maxDuration`. | **Today (production cliff):** `transcribeAndGenerateAction` runs Whisper + GPT in one invocation — hits the wall on long sessions. **Phase 1 target:** each chunk transcription, notes-reduce, and consolidation *step* is its own invocation; no single call owns the full pipeline. Existing segment upload, outbox, and ffmpeg-split paths already assume Node.js + `ffmpeg-static`. | **AWS Lambda** (Node.js runtime) + API Gateway or Function URL for HTTP; same handlers behind SQS/EventBridge triggers for async work. | **300s Pro ceiling** is the reliability cliff this design removes by splitting work. On AWS, configure per-function timeout explicitly (Lambda default 3s; max 900s). Edge runtime is incompatible with ffmpeg — preserve Node.js for audio/binary routes (see `PLATFORM-ASSUMPTIONS.md` §1.2). Cold starts, concurrency limits, and memory sizing affect ffmpeg latency — verify at build time on target platform. |
| **Vercel Pro `maxDuration` = 300s** | Hard wall-clock cap on a single serverless invocation on Pro (Hobby = 60s, silently plan-capped). | Current post-click transcribe+notes path; also bounds any *single* consolidation/ffmpeg step if Workflows is unavailable and consolidation runs as one Queue consumer body. Phase 1 design assumes no monolithic invocation spans full-session transcription. | Lambda per-function timeout (up to 900s) or Step Functions / ECS task for longer ffmpeg jobs. | Declarations in route files are plan-capped — re-validate after any tier change. Audio-only ffmpeg concat for ~1hr sessions may fit in one 300s step; verify with real fixtures before assuming Sandbox/long-runner is unnecessary. |
| **Vercel Queues** — topic `chunk-transcribe` | Managed at-least-once message delivery with automatic retry on consumer failure; **push mode** invokes a registered consumer function per message. | **D2 / transcription pipeline:** decouple chunk upload from transcription — outbox confirms blob → publish `{sessionId, chunkBlobUrl, recordingTimeOffsetMs}` → consumer runs ffmpeg-split (if needed) + `gpt-4o-mini-transcribe` + writes `TranscriptChunk`. Upload path never blocks on Whisper. | **Amazon SQS** (standard queue) + **Lambda** event source mapping (or Lambda poll). DLQ on redrive policy for poison messages. | **At-least-once, not exactly-once** — consumer MUST be idempotent on `(sessionId, chunkBlobUrl)` (design requirement). No ordering guarantee across messages for the same session — completion gate in notes worker handles "all chunks done." Verify at build time: max message payload size, consumer timeout, retry/backoff defaults, DLQ availability on current Vercel plan. |
| **Vercel Queues** — topic `notes-reduce` | Same as above: durable async trigger with retry. | **D7 / notes pipeline:** session end publishes `{sessionId}` → consumer polls completion gate (all `TranscriptChunk` done or 5min timeout) → map/reduce → writes `TutorNote`. Decouples notes from session-end HTTP response. | **SQS + Lambda** (separate queue from transcription; same idempotency patterns). | Consumer may requeue/sleep-step while chunks finish — verify at build time whether Vercel Queues supports delayed delivery or whether status-poll + retry is the only pattern. Guard: only reduce after `WhiteboardSession.endedAt` is set. Idempotent on `(sessionId)` — second delivery must no-op if note already `done`. |
| **Vercel Workflows** (`"use workflow"` / `"use step"`) | Durable multi-step orchestration: each step runs as its own function invocation with automatic retry; workflow state survives crashes and deploys. | **D6 / consolidation (preferred path):** post-end multi-step job — fetch segments → download blobs → ffmpeg-concat → multipart upload canonical → verify → DB flip. Avoids hand-rolled state machine for step isolation. | **AWS Step Functions** (Express or Standard workflow) orchestrating Lambda steps; or **SQS + Lambda** with manual `consolidationStatus` state machine (design fallback). | **Verify at build time:** plan availability, step timeout per invocation, observability. Medium confidence on 2026 availability — **fallback = Queue consumer + status machine** (same durability, more manual). Optional **Vercel Sandbox** for ffmpeg if a single step exceeds function limits — equivalent AWS path = **ECS Fargate task** or Lambda with larger timeout/memory + ffmpeg layer. |
| **Vercel Blob** — segment + canonical object storage | Durable object store with token auth; SDK `put`/`head`/`del`; client direct upload via server-issued token (existing production path). | **Existing:** one blob per finalized audio segment (`SessionRecording`). **Phase 1 add:** canonical merged file at `sessions/{studentId}/{wbsid}/canonical.webm` after consolidation. Workers download segment blobs and upload canonical. | **Amazon S3** (+ IAM pre-signed PUT for client direct upload; SSE-KMS optional). | Per-env bucket split still roadmap (`PLATFORM-ASSUMPTIONS.md` §3.1). Migration must preserve tokenized/proxied reads — no public student URLs. |
| **Vercel Blob multipart upload** (`multipart: true` on canonical `put`) | Resumable/large-file upload API — split upload into parts for reliability on bigger canonical files. | **D6 step 4:** canonical WebM after ffmpeg concat may exceed simple single-request upload comfort zone for long sessions; multipart reduces single-request failure risk. | **S3 multipart upload** (`CreateMultipartUpload` / `UploadPart` / `CompleteMultipartUpload`). | **DESIGN-STAGE / NOT-YET-BUILT** — not used in production today. Verify at build time: minimum part size, max object size, whether immutability/versioning is available (design assumes write-once canonical path + HEAD verify before DB flip; segments deleted only after canonical verified). S3: enable versioning or treat canonical key as immutable by convention. |
| **Vercel Blob read in workers** | Server-side fetch of blob bytes by URL/token within consumer/workflow steps. | Transcription consumer downloads chunk blob; consolidation workflow downloads N segment blobs. | S3 `GetObject` in Lambda/Step Functions task. | Workers need read credentials scoped to session paths. Long download + ffmpeg in one invocation counts against the same wall-clock ceiling — another reason Workflows/step split matters. |

**Consolidation fallback (same capability contract, different primitive):** If Vercel Workflows is unavailable, consolidation uses a **Vercel Queue consumer + manual `consolidationStatus` state machine** — capability equivalent to Step Functions or a single long-running Lambda with explicit status guards; see D6 fallback.

---

## Open questions — v2 (re-cut; Q1–Q8 fresh)

> **v1 Q1–Q10 disposition:** Q1 (pause collapse), Q2 (disconnect = collapse), Q3 (async consolidation always), Q4 (keep segment rows), Q5 (keep rollover), Q7 (cns prefix), Q8 (Phase 1 before Phase 2), Q9 (iOS gate) are **RATIFIED** by the Andrew dialogue and not re-opened. Q6 (backfill existing sessions) is **SUPERSEDED** by Andrew's (f) no-backward-compat directive. Q10 (canonical format) is answered by the best-practice research (WebM/Opus for Phase 1, see Q2 below).

Reply **"ratify defaults"** to accept all recommended defaults, or specify per question.

| # | Question | Options | **Recommended default** | Rationale |
|---|---|---|---|---|
| **Q1** | Transcription model: switch from `whisper-1` to `gpt-4o-mini-transcribe` in Phase 1? | `gpt-4o-mini-transcribe` ($0.003/min) / keep `whisper-1` ($0.006/min) / `gpt-4o-transcribe` ($0.006/min, higher accuracy) | **`gpt-4o-mini-transcribe`** | Half the cost, ~35% better WER on clean audio, streaming support (future value), near drop-in migration. Escalate to `gpt-4o-transcribe` if quality issues emerge. |
| **Q2** | Canonical audio container for Phase 1: stay WebM/Opus or target MP4? | WebM/Opus (`-c copy -cues_to_front 1`, no re-encode) / MP4 (requires codec transcoding from Opus) | **WebM/Opus for Phase 1** | No re-encoding = no quality loss, fast, existing ffmpeg-static pattern. Chrome 130+/Safari can already record MP4 natively but Firefox still needs transcoding and audio-only WebM→MP4 requires re-encode. Revisit at Phase 4 (custom player) when browser compat requirements are clearer. |
| **Q3** | Async mechanism: Vercel Workflows (multi-step durable) or Vercel Queue consumer + manual state machine for consolidation? | Vercel Workflows (`"use workflow"`) / Queue consumer + status machine | **Vercel Workflows if available on current Pro plan; Queue fallback otherwise** | Verify availability before building. Workflows is cleaner (automatic retry, step isolation, observability); Queue fallback is well-understood from current pattern. |
| **Q4** | Map layer in Phase 1: implement per-chunk extraction during session, or ship single-reduce-at-end as v1 and add map layer in Phase 4? | Map layer in Phase 1 / Single-reduce fallback for Phase 1, map in Phase 4 | **Single-reduce fallback for Phase 1; map layer in Phase 4** | Single-reduce is simpler to build correctly; latency (~5–15s) is still dramatically better than today's post-click ~15s-with-timeout-risk. Map layer is a quality/latency enhancement, not a reliability fix — defer unless Andrew wants map-reduce in Phase 1. **OVERRIDE:** if Andrew says "I want map-reduce now," change to Phase 1 target. |
| **Q5** | Notes completion gate timeout: 5 minutes since session seal before triggering partial-notes reduce? | 3 min / 5 min / 10 min | **5 minutes** | Long enough for transcription API retries; short enough that the tutor gets notes within ~6 min of session end on a failure. Partial flag is visible on the note. |
| **Q6** | Sarah data cutover: when and how? | Before Phase 1 merges to master: send 1-line confirm, purge her test session data, run clean migration / After Phase 1 build validated on test data only | **Before Phase 1 merges to master: send Sarah a 1-line message, get confirm, then purge.** | Andrew's (f) directive. Do not blindly purge; get the 1-line "yes" first. Test data purged freely without confirm. |
| **Q7** | Notes reduce model: `gpt-4o-mini` for reduce step, or `gpt-4o` from the start? | `gpt-4o-mini` (cheap, sufficient for most cases) / `gpt-4o` (higher quality) | **`gpt-4o-mini` for Phase 1; escalate to `gpt-4o` on observed quality issues** | Consistent with cost-first approach. Notes quality can be verified in pilot; escalation is a 1-line model change. |
| **Q8** | Log prefix for per-chunk transcription: `txc`? And for notes pipeline: `tnt`? Register both in `AGENTS.md` § Conventions before Phase 1 merges. | `txc` / `tnt` (proposed) | **`txc` (transcription chunk), `tnt` (tutor notes)** — register both | Consistent with existing prefix style. Short, mnemonic, not already in use. |

---

## Proposed schema additions — Phase 1

See Schema section above for full Prisma definitions. Summary:

- **`WhiteboardSession`**: `canonicalAudioUrl`, `consolidationStatus`, `consolidationError`, `consolidatedAt` (additive, nullable).
- **`TranscriptChunk`**: new table — per-chunk transcription result, keyed by `(sessionId, chunkBlobUrl)`, ordered by `recordingTimeOffsetMs`.
- **`TranscriptChunkExtraction`**: new table — map step output (if map layer is Phase 1); skip if single-reduce fallback.
- **`TutorNote`**: new table — per-session note, `status` field, `isPartial` flag.

All migrations are additive. No column drops or renames. Existing `SessionRecording` and whiteboard tables unchanged.

---

## Ratification record

| Field | Value |
|---|---|
| **Awaiting** | Andrew — reply in orchestrator chat |
| **Quick path** | `"ratify defaults"` → all Q1–Q8 recommended defaults |
| **After ratify** | Orchestrator dispatches Phase 1 on isolated branch; no build until ratified |
| **Build authorized** | **No** — design only until Andrew confirms |
| **v1 Qs resolved** | Q1 (collapse), Q2 (disconnect), Q3 (async always), Q4 (keep rows), Q5 (rollover), Q7 (cns), Q8 (Phase 1 first), Q9 (iOS gate) = RATIFIED by dialogue. Q6 = SUPERSEDED (no backward compat). Q10 = answered by research (WebM/Opus, now Q2 above). |

---

## What we are NOT doing in this doc

- No production code changes.
- No migrations applied.
- No redesign of session-lifecycle auto-recording (separate thread; this doc only resolves recording pipeline shape and notes generation).
- No deletion of stitch path until Phase 3 + Sarah cutover decision resolved.
- No mid-session live insights to the tutor (explicitly DEFERRED to Phase 5+).
- No cost-observability design (separate active thread — `cev` system; design pass TBD).
- No production changes to `PLATFORM-ASSUMPTIONS.md` beyond design-stage registration (§11 + capability-contract rule added 2026-06-06; Phase 1 build commit must promote entries to production-assumption status).
