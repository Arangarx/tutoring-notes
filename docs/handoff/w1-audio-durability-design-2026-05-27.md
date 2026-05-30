# W1 Audio durability + upload-failure persistence — design doc

> **Design date:** 2026-05-27
> **Authored by:** Sonnet subagent, commissioned by Opus orchestrator
> **Companion handoff:** [`docs/handoff/w1-audio-durability-orchestrator-report.md`](w1-audio-durability-orchestrator-report.md)
> **Prerequisite reads:** [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md), [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md)
> **Git state:** uncommitted, on master. Andrew commits as part of post-Wave-A doc cleanup.

---

## Scope — three coupled surfaces

| Surface | Backlog ref | Status |
|---|---|---|
| 1. Audio crash / refresh durability | BACKLOG #1 — BLOCKER-PROD | In-memory `chunksRef` dies on browser crash; no IDB safety net |
| 2. Upload-failure persistence | BACKLOG #2 — BLOCKER-PROD | Retry exhaustion = blob dies on navigation; `finalizeOutboxAfterEnd` drops all rows |
| 3. `ondevicechange` reliability | BACKLOG #7 — BLOCKER-PROD | `track.onended` unsubscribed; silent capture after device loss |

All three share the same IDB layer and the same user guarantee: **audio is durable on this device even if not yet uploaded**.

---

## Surface 1 — Audio crash / refresh durability

### Architecture decision: separate draft store (not outbox extension)

**Decision: add a new IDB store `tutoring-notes-recording-draft`. Do NOT extend the outbox.**

Rationale: the outbox contract is "completed segments, ready to upload." A draft entry is "live chunks from an in-progress MediaRecorder that may never reach `stop()`." Mixing them requires the outbox worker to skip draft rows — an invariant violation. The draft store is simpler: no worker, no upload scheduling, no serial/parallel guarantee. Just checkpoint-on-interval + assemble-on-recovery.

This answers the open Q from `docs/RELIABILITY-REDESIGN-2026-05-27.md` § Surface 1: **separate store**.

### Draft store schema

```ts
// IDB store: "tutoring-notes-recording-draft"
// Key path: "key" (string, unique)
interface DraftSegmentRow {
  key: string          // `${sessionId}:${streamId}` — one draft per stream per session
  sessionId: string
  streamId: string
  segmentId: string    // the segmentId that will be used when this segment finalizes
  mimeType: string
  chunks: Blob[]       // ordered by arrival from MediaRecorder.ondataavailable
  chunkCount: number
  firstChunkMs: number // Date.now() on first chunk
  lastChunkMs: number  // Date.now() on last checkpoint
  checkpointedAt: number
}
```

Key is `"${sessionId}:${streamId}"` — last-write-wins within a session. Only one recording can be active per stream per session; a second tab recording the same `(sessionId, streamId)` overwrites (correct — dual-recording is invalid).

### Checkpoint cadence

1. Every 30s via `setInterval` in `useAudioRecorder` (started when `MediaRecorder.start()` fires, cleared on `stop()`)
2. Immediately on `MediaRecorder.stop()` — flush before assembling the segment
3. On `visibilitychange → hidden` / `pagehide` / `beforeunload` — best-effort IDB write

### FSM state recovery path

No new FSM states. Recovery is host-level at workspace mount:

```
WhiteboardWorkspaceClient mount
  │
  ↓
draftStore.findInProgress(sessionId, "tutor:mic")
  │  found?
  ↓
Show recovery banner:
  "Audio was interrupted at [HH:MM]. We saved [N:NN] of recording on this device."
  [Keep and resume]  /  [Discard interrupted audio]
  │
  ├── Keep → assemble chunks into Blob → outbox.enqueue(segment) → draft row cleared
  └── Discard → draft row cleared
```

The outbox sees a newly enqueued completed segment — the FSM sees `inFlightStreamCount > 0` — no FSM changes. The session carries on normally.

### Recovery UX

- **Banner:** `"Audio recording was interrupted. We recovered [N:NN] of audio from before the interruption."`
- **Keep and resume:** assembles chunk array into a single Blob, enqueues to outbox with the saved `segmentId`. Recording resumes; draft store cleared.
- **Discard:** draft store row cleared; recording starts with a fresh segment.
- Recovery banner shown above the recording controls, below the End button. Dismissed on either action.

### iOS Safari constraint — BLOCKER

iOS Safari with `audio/mp4` may not emit `ondataavailable` events on `timeslice` intervals (platform limitation — see `PLATFORM-ASSUMPTIONS.md` §8.1). **The 30s checkpoint cadence depends on `timeslice` events firing during recording.** Before shipping draft store, validate on real iPhone (Andrew's) that `MediaRecorder(stream, { mimeType: 'audio/mp4', timeslice: 30000 })` emits intermediate events. Fallback if not: checkpoint only on `stop()` — guards against the finalization-race but not a mid-recording crash. Document the finding in `PLATFORM-ASSUMPTIONS.md` §8.1.

### New source files

| File | Purpose |
|---|---|
| `src/lib/recording/recording-draft-store.ts` | IDB singleton: `getOrCreate`, `findInProgress`, `checkpoint(chunks)`, `clear`, `assemble → Blob` |
| `src/lib/recording/recording-draft-store.test.ts` | Unit tests: CRUD, chunk assembly, multi-tab overwrite |

New log prefix: **`dft`** — register in `AGENTS.md` § Conventions and `RECORDER-LIFECYCLE.md` § Cheat Sheet.

---

## Surface 2 — Upload-failure persistence

### Outbox retry policy (revised)

Current: 1s → 2s → 5s → 15s → 60s; permanent-fail at 50 attempts (~49 min at max backoff — excessive).

**New policy:**

| Attempts | Delay | Cumulative |
|---|---|---|
| 1–3 | 1s / 2s / 5s | ~8s |
| 4–7 | 15s each | ~68s |
| 8–12 | 60s each | ~8 min |
| 13+ | → **`stuck`** | — |

After 12 failed attempts (~8 min wall-clock), transition to `stuck`. Blob stays in IDB indefinitely.

### `stuck` vs `permanent-fail` semantics

| State | Blob in IDB? | Worker retries? | Path out |
|---|---|---|---|
| `retrying` | Yes | Yes (scheduled) | Upload succeeds |
| `stuck` | Yes | No (worker paused) | Explicit user retry OR workspace re-mount |
| `permanent-fail` | — | — | **Removed** |

`stuck` is not data loss. It is "durable locally, not yet on server."

### `finalizeOutboxAfterEnd` — critical behavior change (BLOCKER)

**Current behavior:** drops **all** IDB rows for the session after `endWhiteboardSession` succeeds.

**Required behavior:** drop only rows where `status === "uploaded"`. Leave `stuck` rows in IDB.

This is a data-loss BLOCKER. If unchanged, a stuck row is silently dropped and the audio segment is permanently lost even though `endWhiteboardSession` registered only the uploaded segments. The executor MUST change this before shipping Surface 2.

### UX: upload state surfacing

**During retrying:** Recording pill shows "Saving…" with spinner. No retry count shown.

**When a row turns `stuck`:**
- End-session button shows: "1 audio segment couldn't upload. [Retry upload]"
- Banner below recording controls: "Audio saved on this device but couldn't reach the server. Tap Retry to upload."
- Banner survives within-tab navigation.

**On workspace re-mount with existing `stuck` rows for this session:**
- Outbox `observe(sessionId)` subscription picks them up immediately.
- Banner: "You have [N] audio segment(s) from this session that couldn't upload. [Retry now]"
- [Retry now] re-arms the worker for `stuck` rows; worker picks them up using the normal upload path.

**Observability:** `[outbox] obx=<id> stuck retries=12 sizeBytes=<N>` on stuck transition. Include `obx=<id>` in a dev-console hint on the banner.

### Cross-session orphaned rows

Stuck rows from past sessions remain in IDB until the original session's workspace is reopened. `blob-cleanup.mjs` does not touch IDB — only Vercel Blob orphans. Acceptable for v1; add multi-session stuck-row surfacing on the student page if it becomes a pain point.

---

## Surface 3 — `ondevicechange` reliability

### Answering the open Q from the reliability redesign

> "Can `MediaDevices.ondevicechange` + `AudioContext.onstatechange` detect the theft event reliably on Safari and Chrome?"

**Answer: partially yes, with an important iOS exception.**

### Cross-browser support table

| Event | Chrome desktop | Safari desktop (macOS) | iOS Safari | Notes |
|---|---|---|---|---|
| `MediaStreamTrack.onended` | Fires on unplug ✓ | Fires on unplug ✓ | Fires on explicit remove ✓ | Most reliable event |
| `MediaDevices.ondevicechange` | Reliable ✓ | Fires, may fire 2× ✓ | **Does NOT fire** for BT route changes ✗ | Debounce 500ms on macOS Safari |
| `AudioContext.onstatechange` | Fires on system interrupt ✓ | Fires on system interrupt ✓ | Fires on alarm / phone call ✓ | Use for iOS interruption path |
| Bluetooth route change (BT headset → speaker) | `ondevicechange` fires ✓ | `ondevicechange` fires (may delay) ✓ | **Nothing fires** ✗ | RMS heuristic fallback on iOS |

**Conclusion:** Chrome desktop and macOS Safari support automatic event-driven detection. iOS Bluetooth route changes require a 30s RMS silence heuristic. **Recovery should always be user-prompted, never fully automatic** (see below).

### FSM integration — host-translates-deviceHealth pattern

Add one typed input to `LifecycleInputs`:

```ts
deviceHealth?: "ok" | "ended" | "silent" | "interrupted"
// "ended"       — track.onended fired (device physically gone)
// "silent"      — RMS < threshold for >30s (iOS BT fallback heuristic)
// "interrupted" — AudioContext suspended (iOS alarm / phone call)
// "ok"          — nominal; default when omitted
```

The FSM does **not** add new states. The host translates `deviceHealth` → `inputStreams` health:

```ts
// In WhiteboardWorkspaceClient useEffect:
useEffect(() => {
  if (deviceHealth && deviceHealth !== "ok") {
    setInputStreams(prev => new Map(prev).set("tutor:mic", "failed"));
    // show device banner
  } else {
    setInputStreams(prev => new Map(prev).set("tutor:mic", "ok"));
  }
}, [deviceHealth]);
```

The FSM already handles `inputStreams.get("tutor:mic") === "failed"`: excludes the stream from `shouldCapture`, does not alone push to `paused` — correct behavior (participant/network conditions control `paused`, not device health alone). The recording pill shows degraded state via `uiPillKind`.

### ondevicechange policy matrix

| Browser × Scenario | Event(s) that fire | Action |
|---|---|---|
| Chrome/Safari desktop — USB mic unplugged | `track.onended` | host sets stream `"failed"` → FSM gates capture; banner: "Mic disconnected. Reconnect or change device to continue." |
| Chrome/Safari desktop — headset plugged in while track alive | `ondevicechange` + track still `readyState === "live"` | Non-blocking banner: "New audio device detected. [Switch to [device name]?]" |
| Chrome/Safari desktop — device becomes OS default | `ondevicechange` | Non-blocking banner: "Your microphone may have changed. [Switch?]" |
| macOS Safari — any device event | `ondevicechange` (may fire 2×) | Debounce 500ms before acting |
| iOS Safari — alarm / phone call | `AudioContext.onstatechange → "suspended"` | host sets stream `"interrupted"` → FSM gates capture; banner: "Recording paused — audio interrupted by system." |
| iOS Safari — BT headset → speaker | **Nothing fires** | RMS silence heuristic (see below) → non-blocking banner: "Check your mic — audio seems quiet." |
| Any — Discord / system steals mic | `track.onended` (maybe) | If fires: device-disconnected path. If not: RMS heuristic catches it within 30s. |

### Hot-swap policy: always user-prompted, never automatic

**Auto-swap is not implemented.** Rationale:
1. A track replacement creates a segment boundary mid-recording — breaks the seamless audio guarantee for the in-flight segment.
2. Users cannot consent to the swap without knowing it happened.
3. Cross-browser, we cannot reliably determine intent (plugging in headset to charge ≠ "record on headset").

**When user taps [Switch] on the device banner:**
1. Current in-progress segment is finalized and enqueued to outbox
2. Draft store row for old segment cleared; new draft row started
3. `getUserMedia` called for selected device
4. New `MediaRecorder` started on new stream; new `segmentId`

**When user does not tap [Switch]:** recording continues on the original track (if still alive). Banner persists until dismissed.

**When `track.onended` fires (device gone — no choice):** segment finalization runs immediately (same enqueue path as above, without user action). Banner prompts user to reconnect or change device.

### FSM state diagram for device change scenarios

```
[recording]
  │ track.onended → host sets tutor:mic "failed"
  │ FSM: shouldCapture("tutor:mic") = false
  ↓
[recording] + DeviceDisconnected banner
  │ user selects new device + [Reconnect]
  ↓
[recording] (new MediaRecorder on new device, new segmentId)

[recording]
  │ ondevicechange + current track still "live"
  ↓
[recording] + DeviceChanged banner (non-blocking; recording continues)
  │ user taps [Switch]              │ user dismisses
  ↓                                 ↓
[recording] (switched, new segment)  [recording] (unchanged)

[recording]
  │ AudioContext.onstatechange → "suspended" (iOS)
  │ host sets tutor:mic "interrupted"
  ↓
[recording] + SystemInterrupt banner
  │ AudioContext resumes / user taps [Resume]
  ↓
[recording] (same track resumes if still live, else reconnect path)
```

### RMS silence heuristic (iOS Bluetooth fallback)

The existing Web Audio `GainNode` + RMS meter in `useAudioRecorder` is already wired. Extend:

- Track `silenceWindowMs` counter: incremented every 100ms when `rms < 0.005`; reset when `rms >= 0.005`
- If `silenceWindowMs > 30_000` (30s): set `deviceHealth = "silent"`
- Host shows **non-blocking** banner: "Check your mic — audio seems quiet." (does NOT pause recording; `"silent"` maps to stream `"degraded"` not `"failed"`, so `shouldCapture` still returns `true`)
- Banner auto-dismissed when `silenceWindowMs` resets

The 30s window avoids false positives during normal silent moments (tutor thinking, student writing at a math problem). A non-blocking banner avoids interrupting the session.

New log prefix: **`dvc`** — register in `AGENTS.md` § Conventions and `RECORDER-LIFECYCLE.md` § Cheat Sheet.

---

## 5-axis adversarial review — this design

### Axis 1 — Data durability

| Surface | Risk | Severity | Mitigation |
|---|---|---|---|
| Draft store | iOS Safari timeslice may not emit → no mid-recording checkpoint | **BLOCKER** (Phase-1 acceptance gate) | Validate on real iPhone; fallback: checkpoint only on `stop()` |
| Draft store | Crash during IDB write → partial blob | Low | IDB transactions are atomic; partial write rolls back |
| Outbox `stuck` | `finalizeOutboxAfterEnd` drops stuck rows | **BLOCKER** | Change to skip rows where `status !== "uploaded"` — code review gate |
| Device disconnect | Segment boundary on user-triggered hot-swap loses <1s of audio | Acceptable | User explicitly initiates; document |

### Axis 2 — Clock + ordering

| Surface | Risk | Mitigation |
|---|---|---|
| Draft recovery | Chunks in assembled Blob may have a gap at the crash boundary | Acceptable; `audioStartedAtMs` ordering in `endWhiteboardSession` handles segment gaps |
| Hot-swap | New segment's `audioStartedAtMs` has a gap vs previous segment's last timestamp | Correct by design; atomic action sorts by `audioStartedAtMs ASC` |
| Outbox stuck retry on re-mount | Re-entering stuck rows into worker queue races with `drainOutboxOrTimeout` on End | `drainOutboxOrTimeout` is serial-within-stream; stuck rows rejoin normally |

### Axis 3 — Race conditions

| Surface | Risk | Mitigation |
|---|---|---|
| Draft store | Two browser tabs writing same `(sessionId, streamId)` simultaneously | IDB key uniqueness; last-write-wins — only one tab should record |
| `ondevicechange` | Fires 2× rapidly (macOS Safari) | Debounce 500ms in host event handler |
| Stuck row retry + End-session | User taps End while a row is `stuck` → `drainOutboxOrTimeout` blocks on stuck row | Stuck rows re-enter the retry queue before drain; existing 15s timeout applies; error banner on drain timeout (unchanged existing behavior) |

### Axis 4 — Cross-platform parity

| Platform | Gap | Mitigation |
|---|---|---|
| iOS Safari | `timeslice` may not emit mid-recording | **BLOCKER gate** — validate before shipping |
| iOS Safari | `ondevicechange` missing for BT route changes | RMS 30s heuristic; non-blocking banner |
| iOS Safari | IDB ITP eviction after 7 days inactivity | Acceptable for intra-day sessions; document in `PLATFORM-ASSUMPTIONS.md` §8.5 |
| iOS Safari | `AudioContext` suspended on alarm/phone call | `onstatechange` → host sets `"interrupted"` → stream `"failed"` |
| macOS Safari | `ondevicechange` fires 2× | 500ms debounce |

### Axis 5 — Observability

| Prefix | Surface | Key transitions logged |
|---|---|---|
| `dft` (new) | Draft store | found-on-mount, chunk-checkpoint, keep-and-enqueue, discard |
| `obx` (existing) | Outbox stuck | stuck transition (retries=N, sizeBytes=S), user retry |
| `dvc` (new) | Device events | `ondevicechange` fired, `track.onended`, `AudioContext.onstatechange`, RMS-silence threshold crossed |

---

## BLOCKERs — Phase-1 acceptance criteria

These must be verified before the executor's branch is declared smoke-ready:

1. **iOS Safari `timeslice` validation** — record with `timeslice: 30000` on real iPhone; confirm `ondataavailable` fires at least once at 30s before `stop()`. If not: switch to stop-only checkpoint and document in `PLATFORM-ASSUMPTIONS.md` §8.1.
2. **`finalizeOutboxAfterEnd` skip-stuck** — code review confirms the method only drops `status === "uploaded"` rows. A test asserting a `stuck` row survives finalization must be added.
3. **Draft store IDB schema additive** — opening the draft store must not conflict with the existing `tutoring-notes-upload-outbox` store name. Validated by inspection of `upload-outbox.ts` store name constant.
4. **New log prefixes registered** — `dft` and `dvc` appear in `AGENTS.md` § Conventions and `RECORDER-LIFECYCLE.md` § Cheat Sheet before the PR merges.

---

## Platform assumptions to update

- `PLATFORM-ASSUMPTIONS.md` §8.1 — extend with `timeslice` behavior finding (BLOCKER item 1 above)
- `PLATFORM-ASSUMPTIONS.md` §8.5 — note that IDB draft store is also subject to iOS Safari ITP 7-day eviction; intra-day sessions are safe

---

## Ratification (Andrew 2026-05-30)

1. **Recovery banner copy** — approved as-is for now ("plain copy seems fine for now").
2. **Cross-session stuck/orphaned drafts** — **backlogged** (not this ship). Durable principles for Ship B + any surface-A work: **(a)** never delete any recording/draft without explicit user confirmation; **(b)** attempt auto-recovery on anything orphaned that is tied to the tutor — leave it recoverable until pilot feedback says auto-recovery is annoying. Exact copy + metadata to surface TBD; expected edge cases.
3. **`ondevicechange` debounce / macOS Safari** — unvalidated (Andrew has no MacBook); leave open.
4. **iOS Safari divergence** — **not a release gate.** No evidence modern Safari behaves differently from modern Chrome; track iOS validation for Sarah sessions or when a test device is acquired. Resolves BLOCKER #1 above as **backlogged risk**, not Phase-1 acceptance. Blockers #2–#4 needed no Andrew input.
