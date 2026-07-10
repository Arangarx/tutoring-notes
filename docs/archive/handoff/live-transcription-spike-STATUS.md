# Live Incremental Transcription — Spike Status

> **Branch:** `spike/live-transcription` (off `master`)
> **Verified @:** `c3c627f` (2026-06-03 — P0 gap confirmed; see VERDICT below)
> **Date:** 2026-06-02 (spike landing); 2026-06-03 (P0 invariant verification)
> **Design doc:** [`live-transcription-design-2026-06-02.md`](live-transcription-design-2026-06-02.md)
> **Lifecycle brief:** [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) (timeline pause-semantics decision gates the fix)
> **Feature flag:** `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED` (default: `false`)

---

## VERDICT: P0 INVARIANT GAP (2026-06-03)

**The live-transcription spike violates the P0 wall-clock invariant.** Verification on `spike/live-transcription` @ **`c3c627f`** (docs captured on `identity-p2-multitutor`; code unchanged on spike branch).

### What is broken

- **Transcript assembly is naive `segmentIndex` text concatenation** — `transcripts.join("\n\n")` in `src/lib/ltx-actions.ts`. There is **no timeline anchor** at capture, persist, or assembly time.
- Segments carry only `segmentIndex` + `durationSeconds`. There is no session-relative `timelineStartMs` on the outbox row, `TranscribeSegmentInput`, or the `IncrementalTranscriptSegment` schema.
- **Gaps are collapsed:** `totalDurationSeconds` sums audio durations (e.g. 10s for two 5s segments), **not** the wall-clock span (e.g. 40s including a 30s pause). On resume after a pause, the next segment gets `segmentIndex+1` placed contiguously after the prior text — the pause never appears on the timeline.

### Executable spec (intentionally RED)

Six requirement-not-implementation tests in `src/__tests__/ltx/ltx-timeline-assembly.test.ts` @ `c3c627f` — **committed intentionally RED** as the executable spec of the gap (independent oracle: per-segment `timelineStartMs`; asserts segment B at t=35s after a 30s gap; offset-invariance across 30/60/120s pauses; gap-inclusive span). Existing ltx B3/B4 tests remain **7/7 green**; full regression **87/87 green**.

### Fix outline (do not build yet)

**Design-gated** (timeline pause-semantics — see lifecycle brief) **+ hardware-gated** (draw-during-disconnect + gap preservation):

1. Stamp each segment with session-relative `timelineStartMs` at VAD-open, from the **same clock** as whiteboard events (per the product decision on pause semantics).
2. Persist through outbox row + `TranscribeSegmentInput` + `IncrementalTranscriptSegment` schema (additive migration).
3. Assemble by `timelineStartMs`; emit placements + gap-inclusive `timelineSpanMs`.
4. Compute coverage against timeline span, not summed audio durations.

---

## What was built

A demo-grade feasibility spike of live in-session incremental transcription.
This is NOT the production default — it is a bonus layer behind a flag.
The existing end-of-session batch transcription remains the floor and the
fallback for all sessions.

### Files added / modified

| File | Type | Description |
|---|---|---|
| `prisma/schema.prisma` | Modified | Added `IncrementalTranscriptSegment` model + `IncrementalTranscriptState` enum + relation on `WhiteboardSession` |
| `prisma/migrations/20260602120000_ltx_incremental_transcript_segment/migration.sql` | New | Purely additive SQL migration (new table + enum only) |
| `src/lib/recording/ltx-outbox.ts` | New | IDB-backed ltx outbox (mirrors upload-outbox.ts; B2 persist-before-network) |
| `src/lib/recording/ltx-outbox-instance.ts` | New | Browser singleton wrapper for ltx outbox |
| `src/lib/ltx-actions.ts` | New | Server actions: `transcribeSegmentForSession` (B4 ownership, cost logging, Whisper-1 only) and `assembleIncrementalTranscript` |
| `src/hooks/useLiveTranscription.ts` | New | React hook — ltxDest fan-out, VAD, segment lifecycle, drain-for-end-session |
| `src/lib/mic-recorder-audio.ts` | Modified | Exposed `analyserNode` and `audioContext` on `MicAudioGraph` for ltx tap |
| `src/hooks/useAudioRecorder.ts` | Modified | Exposed `ltxAudioGraph` on return type |
| `src/app/api/upload/blob/route.ts` | Modified | Added `ltx-audio` upload kind (same auth path as `whiteboard-*`) |
| `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` | Modified | Added `useLiveTranscription` mount (behind flag), ltx remote-audio reconcile effect, FSM-state observer effect, step 7b (best-effort assembly) |
| `src/__tests__/ltx/ltx-actions.test.ts` | New | B3 drain-timeout + B4 ownership tests |
| `AGENTS.md` | Modified | Added `ltx` prefix to per-session ID logging table |
| `docs/BACKLOG.md` | Modified | Added post-V1 reliability items: offline session recovery + cross-device recovery |

---

## BLOCKERs status

| # | Blocker | Status |
|---|---|---|
| **P0** | Wall-clock timeline assembly (gaps, timestamp anchoring) | **KNOWN-BROKEN** @ `c3c627f` — naive concat; see [VERDICT: P0 INVARIANT GAP](#verdict-p0-invariant-gap-2026-06-03). Fix **design-gated + hardware-gated**; do not build until timeline pause-semantics decided. |
| **B1** | Real-browser verification: primary recording unaffected with ltx tap active | **HARDWARE-PENDING** — cannot be tested in jsdom. See smoke checklist below. Assembly smoke (coverage / pre-populated transcript) is **not meaningful for timeline correctness** until P0 fix ships. |
| **B2** | IDB persistence-before-upload in `ondataavailable` | **BAKED IN** — `ltx-outbox.ts` writes to IDB in `ondataavailable` handler before any network call. Follows Pillar 2 pattern. |
| **B3** | End-session 10s hard timeout on ltx drain | **BAKED IN + UNIT-TESTED** — `drainForEndSession` races a hard `Promise.race` timeout guard in `handleEndSession` step 7b. Test in `src/__tests__/ltx/ltx-actions.test.ts` simulates a hanging drain and asserts it resolves within budget. |
| **B4** | `assertOwnsSession` in `transcribeSegmentForSession` (positive + negative tests) | **BAKED IN + UNIT-TESTED** — `assertOwnsWhiteboardSession` is called FIRST in `transcribeSegmentForSession`. Positive test verifies transcript is returned for owner. Negative tests verify non-owner and stale-session are rejected without calling Whisper. |
| **B5** | All `ltx=` log lines present for every segment lifecycle transition | **BAKED IN** — All log lines from design doc §8 are implemented. Verify in smoke (see checklist). |

---

## Feature flag

**Name:** `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED`

**Default:** `false` (not set in `.env` or Vercel env)

**To enable for a demo:**

```
# .env.local (for local dev)
NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED=true
```

Or set in Vercel environment variables for a preview deployment.

With the flag `false`, the workspace is byte-for-byte identical to the pre-spike
behavior. The ltx hook mounts but immediately returns no-op state. No IDB is
created, no AudioContext nodes are added, no server actions are called.

---

## Migration status

**Migration:** `20260602120000_ltx_incremental_transcript_segment`

**Type:** PURELY ADDITIVE — new table (`IncrementalTranscriptSegment`) + new enum
(`IncrementalTranscriptState`). No existing tables or columns modified.

**Applied to:** LOCAL DEV only (via `npx prisma migrate dev`).

**NOT applied to:** `preview-dev` / production.

**Orchestrator gate required before production deploy.**

To apply locally:
```
npx prisma migrate dev
```

---

## Real-hardware smoke checklist (B1 + B5)

Andrew needs to run this on real Chrome/Safari hardware before declaring
the spike demo-ready.

**Setup:**
1. Set `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED=true` in `.env.local`
2. Run `npx prisma migrate dev` to apply the migration
3. Start dev server: `npm run dev`

**B1 — Primary recording unaffected:**
- [ ] Open browser DevTools console
- [ ] Start a whiteboard session (with ltx flag on)
- [ ] Speak for ~3 minutes, pause occasionally (let VAD fire)
- [ ] Click End
- [ ] On the review page, listen to the audio playback
- [ ] Verify: audio duration matches the session, no audio dropouts, sound quality unchanged vs. flag-off
- [ ] Compare: run again with flag OFF, record the same material, compare file sizes in Vercel Blob dashboard
- [ ] **Pass criterion:** Audio is byte-for-byte functionally identical (same duration ±1s, no missing audio, same quality)

**B5 — ltx= log lines present:**
- [ ] In console, filter by `[ltx]`
- [ ] Verify you see: `action=start`, `action=segment_open`, `action=vad_silence` (at pauses), `action=segment_close`, `action=segment_enqueued`, `action=segment_uploaded`, `action=drain_start`, `action=drain_complete` (or `drain_timeout`)
- [ ] Verify server console (Vercel logs) shows: `action=segment_transcribed` with `durationSeconds` and `segmentId`

**Assembly check (timeline correctness deferred):**
- [ ] After End, check the review page: if ltx coverage ≥ 80%, the transcript may be pre-populated — **contiguous text only; gaps after pause are NOT preserved** until P0 fix (see VERDICT)
- [ ] Check Vercel logs for: `action=assembly_query assembled=<N>segments`

**VAD tuning (empirical):**
- [ ] The default `SILENCE_THRESHOLD=0.01` may need tuning on your hardware
- [ ] Check console for `action=segment_close` events — they should fire at natural pauses
- [ ] If no segments close after 90s, the VAD threshold may be too low (too much background noise)

**Cost tracking:**
- [ ] Check the `CostEvent` table after the session: there should be one row per segment
- [ ] Each row should have `kind=WHISPER_TRANSCRIPTION`, `model=whisper-1`, `whiteboardSessionId` set

---

## Architecture notes

### Why the primary recording is sacred (B1 / non-negotiable constraint 1)

```
micSource → gain → analyserNode ──→ recordingDest  (PRIMARY — UNCHANGED)
                              └──→ ltxDest         (SPIKE — fan-out)
```

`ltxDest` is a SECOND `MediaStreamAudioDestinationNode`. Web Audio fan-out
is additive by spec — connecting a second destination does not modify the
first. The primary `recordingDest` and its `MediaRecorder` are structurally
untouched.

**What this means for B1:** jsdom cannot test this because jsdom returns 0
for all Audio API node outputs. Real-browser verification is the only proof.
The architecture guarantee is sound by spec; the hardware smoke is confirmation.

### FSM unchanged (non-negotiable constraint 2)

`evaluateLifecycle` is untouched. `useLiveTranscription` is an external
observer: a `useEffect` in `WhiteboardWorkspaceClient` keyed on `lifecycle.state`
calls `ltx.start()` / `ltx.stop()`. No new FSM states, inputs, or outputs.

### Off-by-default (non-negotiable constraint 3)

`LTX_ENABLED` is `false` unless `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED=true`.
When false, the entire ltx code path is a no-op: the hook returns early, no
IDB opens, no AudioContext nodes are added, no server actions are registered.

### Endpoint guardrail (non-negotiable constraint 5)

`transcribeSegmentForSession` calls ONLY `transcribeAudio()` → `/v1/audio/transcriptions`
(whisper-1). The OpenAI Realtime API is EXPLICITLY NOT USED. See design doc §7.2.

---

## Post-spike gate criteria (from design doc §10.6)

Live transcription becomes the production default ONLY when:

1. All B1–B5 BLOCKERs pass on Sarah's real hardware (macOS, Chrome or Safari, home WiFi)
2. Sarah has run ≥3 real sessions with the feature and has not reported any audio issues
3. Primary recording audio quality confirmed unchanged (Sarah listens to playback)
4. End-session latency has not increased (wall-clock from End click to review page)
5. Orchestrator sign-off

Until all five conditions are met, `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED` stays `false` in production.

---

## Open questions (deferred from design doc §11)

- **Q-LTX-3** — VAD threshold tuning: defaults are empirical. Tune on hardware before demo.
- **Q-LTX-4** — Coverage threshold for skip-re-transcription: current implementation uses 80%.
- **Q-LTX-6** — ltx blob retention: segment blobs accumulate in Vercel Blob (~1MB/min). Add to blob cleanup CLI post-spike.
- **Q-LTX-1** — OpenAI Realtime API: explicitly deferred, requires DPA re-vet.
