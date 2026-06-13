# Phase 1 — WB Reliability Floor: Detailed Executable Plan

> **Branch:** `phase1/wb-reliability-floor` (off `v1-redesign`)  
> **Program:** Experience-Driven Wedge — Phase 1 is the **GATE**; nothing above it ships until this is solid.  
> **Authored:** 2026-06-13 (planning pass — no source modified)  
> **Strategy root:** [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](../research/continuity-wedge-brainstorm-2026-06-12.md)  
> **Program roadmap:** `~/.cursor/plans/experience-driven_wedge_ae2776e1.plan.md`

---

## Context: what is and isn't done

The engine is already wired end-to-end. What Phase 1 is NOT is a rebuild. What it IS:

| Workstream | Status |
|---|---|
| Two-way live sync (tutor ↔ student) | ✅ Wired — unvalidated post-redesign |
| FSM + outbox + atomic end-session | ✅ Wired (Pillar 1/2/3) |
| In-shell review flip (A3) | ✅ Wired |
| Lazy replay + TutorNote reduce | ✅ Wired |
| Audio-clock surrogate (`performance.now()`) | ⚠️ KNOWN DEBT — documented in `WhiteboardWorkspaceClient.tsx` L306-311 |
| Waiting room (`mode="waiting"`) | 🔲 RESERVED STUB — comment says "future Phase" |
| `bothConnectedAt` timer-on-admit | ⚠️ WRONG — stamped at student link-open, not admit |

---

## Pre-existing test failure (do not count as a regression)

`sync-client.test.ts > broadcastSignal bypasses the scene throttle` fails deterministically (expects 1 broadcast, gets 2). `git diff 300ef0b HEAD src/lib/whiteboard/**` is empty — this predates the redesign and is NOT a Phase 1 task. Route to the WB-sync/live-AV thread.

---

## Workstream 1a — Baseline validation

### Purpose

Establish a known-good baseline for the post-redesign wired flow before building anything. Find any regressions that the `v1-design-system` chrome work may have introduced into the live session engine.

### What can be covered by automated harnesses

| Test | Tool | Notes |
|---|---|---|
| `npm run test:wb-sync` | Jest + Playwright hermetic relay | Verifies real-browser two-way sync invariants; currently green on Playwright half; one Jest failure pre-exists (see above) |
| Event log integrity (events < 500KB, `schemaVersion` present, `t` monotonic) | Jest (existing: `useWhiteboardRecorder.test.ts` + `event-log.test.ts`) | Run `npx jest --testPathPatterns "whiteboard"` |
| FSM state-machine invariants | Jest (`lifecycle-machine.test.ts`) | Pure function, no DOM |
| Outbox dedupe + drain | Jest (`upload-outbox.test.ts` — run `--runInBand`) | Pre-existing flakiness in parallel mode; use `--runInBand` |
| `endWhiteboardSession` atomic action | Jest (`endWhiteboardSession.test.ts`) | Needs local Neon/Postgres; skip on CI without DB |
| In-shell mode flip (live → review) | Jest DOM (`WhiteboardWorkspaceEnd.dom.test.tsx`) | Already covers the E1 no-navigation fix |

**Agent-runnable pre-check command:**
```
npx jest --runInBand --testPathPatterns "whiteboard|recording|lifecycle|outbox|upload"
```
Expected: all pass except the one pre-existing `broadcastSignal` failure.

### What REQUIRES Andrew's 2-device hardware smoke

The following CANNOT be covered by jsdom or the hermetic Playwright relay alone — they require real WebRTC, real microphone, real student device:

1. Tutor draws on one device → student sees stroke on another (real browser ↔ real browser via live Fly.io relay)
2. Student draws → tutor sees (asymmetric v2/v3 wire)
3. Tutor ends session → in-shell review mode flips → notes generate → save completes → replay available
4. Session timer starts when student opens link and shows correctly on tutor's screen
5. Both themes (light + dark) verified on the live workspace and review mode

### Smokebook stub

This stub conforms to [`docs/handoff/SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md).  
**Preview URL:** Must be fetched via Vercel MCP before smoke — `list_deployments` matching `meta.githubCommitRef=phase1/wb-reliability-floor`. Do not guess the hash.

---

# Phase 1a — WB Baseline Smoke Runbook (STUB)

**Branch:** `phase1/wb-reliability-floor`  
**Tip commit:** `[run git log -1 --format=%H to fill]`  
**Preview:** `<unverified — fetch from Vercel MCP: list_deployments → meta.githubCommitRef=phase1/wb-reliability-floor → https://<meta.branchAlias>>`

---

### 1. Automated harness — all green before smoke

**Action:** In a terminal on the branch, run:
```
npx jest --runInBand --testPathPatterns "whiteboard|recording|lifecycle|outbox|upload"
```

**Expect:** All pass except the one pre-existing `broadcastSignal` failure in `sync-client.test.ts`. Zero new failures.

**Ignore this run:** Pre-existing `broadcastSignal bypasses the scene throttle` failure (predates redesign, not a Phase 1 regression — confirmed by `git diff 300ef0b HEAD src/lib/whiteboard/**` = empty).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Start + live sync — tutor draws, student sees (light theme)

**Action:** As tutor on device A (desktop Chrome), navigate to the Preview URL. Sign in as the pilot tutor account. Open a student and start a whiteboard session (consent acknowledged). Copy the student join link. On device B (phone or second desktop), open the student join link. On tutor device: draw 3 strokes on different areas of the canvas.

**Expect:** Within 1-2s, all 3 strokes appear on the student screen in approximately the same position. No console errors containing "CSP" or "sync". The sync indicator on the tutor toolbar shows connected.

**Ignore this run:** Laser position (L2/L3 deferred — re-smoke after WB interface unified). Student-to-tutor student-wand sync deferred.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Student draws, tutor sees (light theme)

**Action:** Continuing from item 2. On student device B, draw 2 strokes on the canvas.

**Expect:** Within 1-2s, student strokes appear on tutor's canvas in a visually distinct color (tutor and student strokes are attributed differently). No freeze or blank-canvas events.

**Ignore this run:** Exact stroke position pixel-accuracy (viewport-sync regression bar is 5/5 PASS on `master` @ `750d494`; this item checks rough presence, not coordinate precision).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Start + live sync — both themes

**Action:** Repeat items 2 and 3 with the app switched to **dark** theme (use the theme toggle in the top bar). Then switch back to **light** and confirm both themes work.

**Expect:** Canvas background, toolbar, and chrome update to dark theme. Stroke recording and sync still work. No "unreadable" text or blank areas introduced by the `@layer base` CSS fixes.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. End session → in-shell review flip

**Action:** From an active session on the Preview, click **End session**. Observe what happens to the workspace tab.

**Expect:** The workspace tab does NOT navigate away. The tab URL stays the same. The view flips in-place to the review mode showing the session notes panel and a "Generate notes" / session info section. No window.confirm or browser alert. Console shows `[nsi]` log lines for the session-note transition.

**Ignore this run:** Phase B polish (loading state, end-confirmation modal) — both deferred per ORCHESTRATOR-STATE.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. AI notes generation + save

**Action:** After the in-shell review flip (item 5), click "Generate notes" (or equivalent — the `triggerNotesGenerationAction` trigger). Wait for the notes to appear. Edit one word. Click Save.

**Expect:** Notes appear in the panel within ~30s (Whisper transcription + reduction). Edit is reflected. Save succeeds (no error toast). Navigating to the student's session detail page (outside the workspace) shows the saved note.

**Ignore this run:** Note quality (accuracy of the reduction — this is a Phase 3 concern, not a Phase 1 blocker). The `durationMs null on Vercel` known issue (ffmpeg probe in serverless) may affect some metadata display — not a blocker.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Lazy replay

**Action:** After the session note is saved (item 6), scroll to the "Replay" section of the review page (inside the shell). Click the replay play button.

**Expect:** Replay starts. Strokes appear on the canvas in time with the audio. Audio plays. Scrubbing works (approximate — the R1/R2 multi-segment player regression is a separate thread). For a short session with a single audio segment, audio + strokes stay in sync throughout.

**Ignore this run:** R1/R2 multi-segment scrub regression (dedicated fix thread, not Phase 1). Drift measurement requires a separate 50-min harness (1b task).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Session timer — starts on student join, survives student disconnect

**Action:** Start a fresh session. Observe the session timer on the tutor's workspace. Have the student open the join link. Observe the timer start. Have the student briefly close and reopen the tab.

**Expect:** Timer shows "Waiting for student" until the student opens the link. Timer starts counting after the student joins. When the student briefly disconnects and reconnects, the timer does NOT reset — it continues from where it was (per Sarah's explicit stated expectation: "I've just never had the counter start over").

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL

---

*(End of 1a smokebook stub)*

---

## Workstream 1b — Audio-clock fix (REVISED 2026-06-13)

> **Superseded approach:** the original plan proposed using `AudioContext.currentTime` as the clock source. The 5-axis adversarial review (B1) ruled this out: iOS Safari suspends AudioContext instances when tabs are backgrounded, causing `currentTime` to freeze just as `performance.now()` throttles — no improvement. Additionally, WebKit bug 263627 can freeze `currentTime` while `state === "running"`, so `onstatechange` cannot even detect the problem. **The chosen approach (Andrew approved "do it right") is a frame-counting node inserted into the audio graph.**

### Why frame counting solves the problem cleanly

The frame-counting node sits between the gain node and `recordingDest` in the existing graph. It counts every audio frame that physically passes through the recording path — the same frames that `MediaRecorder` encodes. This creates a strict identity:

**frames counted ≡ samples encoded ≡ samples decoded at replay**

When the AudioContext is suspended (iOS background, phone call, any interruption), the graph stops producing frames. The frame counter freezes AND `MediaRecorder` receives no more data AND the encoded file is short by exactly that amount. Replay's `audio.currentTime` also won't advance past the short file. So `t` stays aligned through every failure mode automatically — not because we compensate for drift, but because the clock and the encoder are the same signal path.

This is strictly better than `performance.now()` (which keeps ticking while audio freezes) and `AudioContext.currentTime` (which can freeze while the encoder has already committed frames). The frame counter CANNOT drift relative to the encoded audio because it IS the encoded audio.

### Graph topology

Current graph (from `createMicAudioGraph`, `mic-recorder-audio.ts:118–159`):
```
source → gainNode → recordingDest   (MediaRecorder input)
               ↓
         publishDest   (WebRTC)
               ↓
           analyser    (level meter)
```

New graph after 1b — insert `frameCounterNode` between `gainNode` and `recordingDest`:
```
source → gainNode → frameCounterNode → recordingDest   (MediaRecorder input)
               ↓
         publishDest   (WebRTC — unchanged)
               ↓
           analyser    (level meter — unchanged)
```

`publishDest` and `analyser` still connect directly from `gainNode` (no change). Only the recording path goes through the counter. Remote audio sources (`remoteSource → remoteGain → recordingDest`) are unchanged — the counter does NOT need to count remote frames because any frame flowing through the local mic path proves the AudioContext is alive.

### Implementation: AudioWorklet preferred, ScriptProcessorNode fallback

**Why not just use ScriptProcessorNode?** ScriptProcessorNode is deprecated and blocks the main thread. Where AudioWorklet is available, it runs in the audio rendering thread and is the correct long-term approach.

**Why not just use AudioWorklet?** AudioWorklet requires async `addModule()` and communicates via async `port.postMessage`. Since `getAudioMs()` must be synchronous (called inline in `flushPendingDiff` → `getAudioMsRef.current()`), we need a synchronous read path. For the AudioWorklet, we use a short (every ~1024 frames ≈ 23ms @ 44100 Hz) postMessage cadence to keep the main-thread ref current; the max read lag is ~23ms, well within the 250ms budget.

**Fallback trigger:** ScriptProcessorNode is used when:
- `audioContext.audioWorklet` is undefined (older browsers)
- `audioContext.audioWorklet.addModule()` throws (e.g. CSP blocks `blob:` URLs)
- Any other AudioWorklet init error

The fallback is logged: `[mic-recorder-audio] avx=${sid} frame-counter=script-processor`.

**iOS note:** Both AudioWorklet and ScriptProcessorNode stop firing when iOS suspends the AudioContext. This is correct behavior — the counter and the encoder both freeze simultaneously, maintaining alignment. The `audioContext.onstatechange` handler (see File 1 below) surfaces this to logs for post-hoc debugging.

### File 1: `src/lib/mic-recorder-audio.ts`

**Interface additions** (after line 104, `swapLocalMicSource`):
```typescript
/**
 * Frame-accurate recording clock. Returns elapsed recording-active
 * milliseconds: frames counted while setActive(true), converted via
 * sampleRate. Monotonic. Cumulative across rollovers (never resets).
 * Freezes if the AudioContext is suspended (e.g. iOS background).
 */
frameClockGetMs: () => number;
/**
 * Gate the frame counter. Call true on recording start/resume,
 * false on pause/stop. Only frames counted while active contribute
 * to the clock — matches the MediaRecorder's recording/paused state.
 */
frameClockSetActive: (active: boolean) => void;
```

**Implementation inside `createMicAudioGraph`**, after line 119 (`await audioContext.resume()`):

```typescript
// Observability: log AudioContext state changes for iOS debugging.
audioContext.onstatechange = () => {
  console.log(
    `[mic-recorder-audio] avx=${sid} event=audiocontext-state-change state=${audioContext.state}`
  );
};

// Frame counter — accumulates only while frameClockActive=true.
let frameClockActive = false;
let accumulatedFrames = 0;
let lastWorkletFrames = 0; // updated by AudioWorklet postMessage

// Worklet code inlined as blob URL (avoids an extra static file and
// keeps the module self-contained). The unique suffix on the processor
// name avoids name collisions if multiple AudioContexts are created.
const workletName = `frame-counter-${sid}-${Date.now()}`;
const workletCode = `
  class FrameCounterProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._active = false;
      this.port.onmessage = (e) => {
        if (e.data?.type === 'setActive') this._active = e.data.active;
      };
    }
    process(inputs, outputs) {
      if (this._active && inputs[0]?.[0]?.length) {
        // Count frames and report every 1024 frames (~23ms @ 44100).
        globalThis.__fcFrames = (globalThis.__fcFrames ?? 0) + inputs[0][0].length;
        if (globalThis.__fcFrames % 1024 < inputs[0][0].length) {
          this.port.postMessage({ frames: globalThis.__fcFrames });
        }
      }
      if (outputs[0]?.[0] && inputs[0]?.[0]) {
        outputs[0][0].set(inputs[0][0]); // passthrough
      }
      return true;
    }
  }
  registerProcessor('${workletName}', FrameCounterProcessor);
`;
```

> **Implementation note:** The `globalThis.__fcFrames` pattern above uses a shared global in the worklet scope. A cleaner approach is an instance-level `_frames` counter on the processor. Use an instance field:

```typescript
// Corrected worklet (use in actual implementation):
const workletCode = `
  class FrameCounterProcessor extends AudioWorkletProcessor {
    constructor() { super(); this._active = false; this._frames = 0;
      this.port.onmessage = e => { if (e.data?.type === 'setActive') this._active = e.data.active; };
    }
    process(inputs, outputs) {
      const ch = inputs[0]?.[0];
      if (this._active && ch?.length) {
        this._frames += ch.length;
        if (this._frames % 1024 < ch.length) this.port.postMessage({ frames: this._frames });
      }
      const out = outputs[0]?.[0];
      if (out && ch) out.set(ch);
      return true;
    }
  }
  registerProcessor('${workletName}', FrameCounterProcessor);
`;
```

**Init sequence** (try AudioWorklet, fall back to ScriptProcessorNode):

```typescript
// Disconnect direct gainNode→recordingDest before inserting the counter.
gainNode.disconnect(recordingDest);

let useWorklet = false;
let workletNode: AudioWorkletNode | null = null;
let scriptNode: ScriptProcessorNode | null = null;

if (audioContext.audioWorklet) {
  try {
    const blob = new Blob([workletCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    workletNode = new AudioWorkletNode(audioContext, workletName);
    workletNode.port.onmessage = (e) => {
      if (e.data?.frames !== undefined) lastWorkletFrames = e.data.frames;
    };
    workletNode.port.onmessage({ data: { type: 'setActive', active: false } }); // init
    gainNode.connect(workletNode);
    workletNode.connect(recordingDest);
    useWorklet = true;
    console.log(`[mic-recorder-audio] avx=${sid} frame-counter=audioworklet`);
  } catch (err) {
    console.warn(`[mic-recorder-audio] avx=${sid} AudioWorklet init failed; falling back:`,
      (err as Error)?.message ?? String(err));
    gainNode.connect(recordingDest); // restore direct connection before ScriptProcessor setup
  }
}

if (!useWorklet) {
  // ScriptProcessorNode: deprecated but widely supported, runs on the
  // main thread (no IPC needed for synchronous getAudioMs reads).
  try {
    scriptNode = audioContext.createScriptProcessor(256, 1, 1);
    scriptNode.onaudioprocess = (e) => {
      if (frameClockActive) accumulatedFrames += e.inputBuffer.length;
      const inCh = e.inputBuffer.getChannelData(0);
      const outCh = e.outputBuffer.getChannelData(0);
      outCh.set(inCh); // passthrough
    };
    gainNode.connect(scriptNode);
    scriptNode.connect(recordingDest);
    console.log(`[mic-recorder-audio] avx=${sid} frame-counter=script-processor`);
  } catch (err) {
    console.warn(`[mic-recorder-audio] avx=${sid} ScriptProcessorNode init failed; frame clock unavailable:`,
      (err as Error)?.message ?? String(err));
    gainNode.connect(recordingDest); // restore so recording still works
  }
}

const sampleRate = audioContext.sampleRate; // 44100, 48000, etc.

const frameClockGetMs = (): number => {
  if (useWorklet) {
    return Math.floor(lastWorkletFrames * 1000 / sampleRate);
  }
  return Math.floor(accumulatedFrames * 1000 / sampleRate);
};

const frameClockSetActive = (active: boolean): void => {
  frameClockActive = active;
  if (useWorklet && workletNode) {
    try { workletNode.port.postMessage({ type: 'setActive', active }); } catch {}
  }
};
```

**In `dispose()`** (after `void audioContext.close()`):
```typescript
try { workletNode?.disconnect(); } catch {}
try { scriptNode?.disconnect(); } catch {}
```

**Return additions** in the factory return object:
```typescript
frameClockGetMs,
frameClockSetActive,
```

### File 2: `src/hooks/useAudioRecorder.ts`

**New option** (in `UseAudioRecorderOptions`, after `recordingDraft`):
```typescript
/**
 * TEST-ONLY: inject a fake MicAudioGraph so unit tests can control
 * the frame clock without a real AudioContext. In production this
 * is always undefined; the hook creates the real graph via
 * createMicAudioGraph. Must implement at minimum:
 * frameClockGetMs, frameClockSetActive, recordingStream, dispose,
 * getLevel, setGain, addRemoteAudio, setRemoteGain, swapLocalMicSource.
 */
_graphOverride?: MicAudioGraph;
```

**New return field** (in `UseAudioRecorderReturn`, after `flushPendingUploads`):
```typescript
/**
 * Frame-accurate, pause-aware audio clock. Returns elapsed
 * recording-active milliseconds. Zero before recording starts.
 * Monotonically increasing while recording, frozen while paused.
 * Cumulative across auto-rollovers — do NOT reset on rollover.
 *
 * Backed by the frame-counting node in the Web Audio graph.
 * Falls back to performance.now() deltas if the graph is null
 * (e.g. mic not yet acquired).
 *
 * This is the authoritative source of truth for WB event `t`.
 */
getAudioMs: () => number;
```

**New options** (in `UseAudioRecorderOptions`):
```typescript
/**
 * Called when the recording watchdog detects a potential stall:
 * neither the frame clock nor the chunk list has advanced in the
 * last 30s while the recorder is nominally active.
 * Workspace surfaces this as a warning banner. Type:
 * - 'stall': frame counter frozen mid-session (iOS interrupt, encoder wedge)
 * - 'empty-rollover': rollover produced a 0-byte segment (existing console-only warning)
 */
onWatchdogAlert?: (type: 'stall' | 'empty-rollover') => void;
```

**New refs** (in `useAudioRecorder`):
```typescript
// Performance.now() fallback for getAudioMs before graph is built.
const perfFallbackAccruedRef = useRef(0);
const perfFallbackStartRef = useRef<number | null>(null);
// Watchdog state for stall detection.
const watchdogLastFrameMsRef = useRef(0);
const watchdogLastChunkCountRef = useRef(0);
```

**`getAudioMs` implementation** (stable callback, reads from graph or perf fallback):
```typescript
const getAudioMs = useCallback((): number => {
  const graph = graphRef.current;
  if (graph?.frameClockGetMs) {
    return graph.frameClockGetMs();
  }
  // Fallback: performance.now() deltas (pre-graph-build only).
  // The fallback only accumulates while the recorder is active —
  // same gate as frameClockSetActive — so t=0 for pre-recording events.
  if (perfFallbackStartRef.current === null) {
    return Math.floor(perfFallbackAccruedRef.current);
  }
  return Math.floor(
    perfFallbackAccruedRef.current + (performance.now() - perfFallbackStartRef.current)
  );
}, []);
```

**Gate calls** (activate/deactivate the frame counter alongside MediaRecorder state):

In `startMediaRecorder()`, after `setRecordState("recording")`:
```typescript
graphRef.current?.frameClockSetActive(true);
// Fallback: mark perf start only if graph unavailable.
if (!graphRef.current?.frameClockGetMs) {
  perfFallbackStartRef.current = performance.now();
}
```

In `pauseRecording()`, before `mediaRecorderRef.current.pause()`:
```typescript
graphRef.current?.frameClockSetActive(false);
if (perfFallbackStartRef.current !== null) {
  perfFallbackAccruedRef.current += performance.now() - perfFallbackStartRef.current;
  perfFallbackStartRef.current = null;
}
```

In `resumeRecording()`, after `mediaRecorderRef.current.resume()`:
```typescript
graphRef.current?.frameClockSetActive(true);
if (!graphRef.current?.frameClockGetMs) {
  perfFallbackStartRef.current = performance.now();
}
```

In `stopAndUpload()`, after `stopTimer()`:
```typescript
graphRef.current?.frameClockSetActive(false);
if (perfFallbackStartRef.current !== null) {
  perfFallbackAccruedRef.current += performance.now() - perfFallbackStartRef.current;
  perfFallbackStartRef.current = null;
}
```

**Rollover:** `rolloverSegmentGapless()` does NOT call `frameClockSetActive(false/true)`. The counter must keep accumulating continuously through the rollover handoff — recording never pauses, neither should the clock. The display timer (`elapsedRef.current = 0` at line 714 of `useAudioRecorder.ts`) resets independently; the frame clock is cumulative for the session.

> **CRITICAL executor note:** `elapsedRef.current = 0` on rollover resets the per-segment display timer. The frame clock (`frameClockGetMs`) must never be reset on rollover. These are two different counters with different semantics. Any PR that adds `frameClockSetActive(false); frameClockSetActive(true)` around the rollover boundary is a bug.

**`_graphOverride` wiring**: if `opts._graphOverride` is defined, skip `createMicAudioGraph` and set `graphRef.current = opts._graphOverride` immediately. This lets unit tests control the frame clock without a real AudioContext.

### iOS timeslice truncation: analysis and resolution

**The conflict (code confirmed):**

`useAudioRecorder.ts` lines 13-16 (invariant comment at top):
> *"iOS Safari MP4 fragmentation guard: `recorder.start()` is called with NO timeslice argument. Chunked output (`start(1000)`) makes iOS Safari emit fragmented MP4 pieces that don't concatenate into a playable / Whisper-decodable file."*

`useAudioRecorder.ts` lines 1131-1145 (workspace draft path):
```typescript
if (recordingDraft) {
  try {
    recorder.start(DRAFT_TIMESLICE_MS); // 30_000ms timeslice
  } catch {
    recorder.start();
  }
}
```

**These are contradictory.** The invariant warns against timeslice. The workspace draft path uses timeslice. The comment at line 88-89 acknowledges this: `"/** MediaRecorder timeslice when draft durability is enabled (iOS may not fire — see PLATFORM-ASSUMPTIONS §8.1). */"`

**Tradeoff:**

| | Draft durability (with timeslice) | iOS playability (no timeslice) |
|---|---|---|
| Crash recovery | Coarser: only data flushed at last `pagehide` / `stop()` | Stop-only: at most one 30s checkpoint interval of data lost in crash |
| iOS playability | ❌ May produce fragmented MP4 Whisper can't decode | ✅ Single clean blob |
| Desktop playability | ✅ WebM/Opus fragmented blobs concatenate fine | ✅ |

**Proposed resolution: iOS-conditional no-timeslice**

Detection heuristic: use the selected MIME type as the proxy. `chooseMimeType()` returns `audio/mp4` (or an `audio/mp4`-prefixed string) on iOS Safari — the same signal the rest of the codebase already uses for iOS-specific logic. This avoids UA string parsing.

```typescript
// In startMediaRecorder() and rolloverSegmentGapless(), replace:
if (recordingDraft) { try { recorder.start(DRAFT_TIMESLICE_MS); } catch { recorder.start(); } }

// With:
if (recordingDraft) {
  const mightBeIOS = (recorder.mimeType || chooseMimeType() || '').startsWith('audio/mp4');
  if (mightBeIOS) {
    // iOS Safari: timeslice fragments MP4 — use stop-only checkpoints.
    // Crash recovery is coarser but the final file is Whisper-decodable.
    recorder.start();
    console.warn(`[useAudioRecorder] rid=? event=ios-no-timeslice mimeType=${recorder.mimeType}`);
  } else {
    try { recorder.start(DRAFT_TIMESLICE_MS); } catch { recorder.start(); }
  }
}
```

**What the iOS no-timeslice path loses:** if iOS crashes the browser mid-session (not just backgrounds it — actual Safari crash or OOM kill), and the last `pagehide` handler didn't fire, at most 30 seconds of audio can be unrecoverable from IDB. For a pilot-stage tool used synchronously with a student this is acceptable: the tutor can restart the session.

**What REQUIRES Andrew's iOS hardware to confirm:**
1. That `chooseMimeType()` returning `audio/mp4` reliably identifies iOS Safari (not macOS Safari, which also supports mp4 but handles timeslice correctly)
2. That the stop-only + `pagehide` checkpoint correctly fires on iOS background/foreground
3. That the final audio blob without timeslice is Whisper-decodable (smoke: 5-min iOS recording → notes generation succeeds)

If `audio/mp4` also fires on macOS Safari where timeslice IS safe, add an explicit UA check for `iPhone|iPad|iPod` in addition.

### Silent wedge watchdog: design

**The gap (code confirmed):**

`useAudioRecorder.ts` lines 759-766 (rollover empty segment — console-only):
```typescript
if (blob.size === 0) {
  console.warn("[useAudioRecorder] rollover: old segment was empty, skipping upload");
  rolloverInProgressRef.current = false;
  return;
}
```

Lines 1247-1253 (final stop empty blob — surfaces error):
```typescript
if (blob.size === 0) {
  setError("Recording appears empty. Please try again.");
  // ...
}
```

Intermediate encoder stalls (no new chunks between timeslice events) are fully invisible.

**Watchdog design:**

The watchdog piggybacks on the existing `DRAFT_CHECKPOINT_INTERVAL_MS = 30_000` interval in `startDraftCheckpointScheduling()`. Every 30 seconds it checks:

1. Is `mediaRecorderRef.current?.state === 'recording'`? (If paused/stopped, no stall.)
2. Has `frameClockGetMs()` advanced since the last check?
3. Has `chunksRef.current.length` increased since the last check?

If (2) AND (3) are both false while (1) is true: the encoder is stalled. Fire `onWatchdogAlert('stall')`.

```typescript
// Add to the existing checkpoint interval callback in startDraftCheckpointScheduling:
if (opts.onWatchdogAlert) {
  const recorderState = mediaRecorderRef.current?.state;
  if (recorderState === 'recording') {
    const currentFrameMs = graphRef.current?.frameClockGetMs?.() ?? 0;
    const currentChunkCount = chunksRef.current.length;
    if (
      currentFrameMs === watchdogLastFrameMsRef.current &&
      currentChunkCount === watchdogLastChunkCountRef.current
    ) {
      console.warn(
        `[useAudioRecorder] event=watchdog-stall frameMs=${currentFrameMs} chunks=${currentChunkCount}`
      );
      opts.onWatchdogAlert('stall');
    }
    watchdogLastFrameMsRef.current = currentFrameMs;
    watchdogLastChunkCountRef.current = currentChunkCount;
  }
}
```

Also: upgrade the empty-rollover branch (lines 759-766) to call `onWatchdogAlert('empty-rollover')` in addition to the existing `console.warn`.

**Workspace surface (File 3 concern):** the workspace component receives `onWatchdogAlert` and uses it to display a persistent warning banner: `"Recording may have stopped — please check your microphone and try ending/restarting."` The banner stays visible until the tutor ends or resets the session (not auto-dismissing). This preserves the honesty axis: we never silently ship truncated/desynced replay.

### File 3: `src/components/whiteboard/WhiteboardWorkspaceClient.tsx`

**Delete** `useAudioMsClock` (lines 305-330) — it becomes dead code.

**Replace** at line 1860:
```typescript
// Before:
const getAudioMs = useAudioMsClock(recordingActive);

// After:
const getAudioMs = workspaceAudio.getAudioMs;
```

`workspaceAudio` is the `useAudioRecorder(...)` return at line 1118-1130. `getAudioMs` is consumed at line 2192 in `useWhiteboardRecorder`. This is a one-line change.

**Add** `onWatchdogAlert` to the `useAudioRecorder` call (lines 1118-1130):
```typescript
const workspaceAudio = useAudioRecorder({
  // ... existing props ...
  onWatchdogAlert: (type) => {
    console.warn(`[WhiteboardWorkspaceClient] watchdog alert type=${type}`);
    setRecordingStallWarning(true); // new state: drives a visible warning banner
  },
});
```

### Multi-segment behavior: frame counter is cumulative

Replay positions WB events via `segmentLocalToGlobalMs(segmentIndex, audio.currentTime * 1000, timeline)`, where `segmentStartsMs[N]` = sum of Whisper `durationSeconds` for segments 0..N-1.

The frame counter MUST accumulate cumulatively across rollovers so that `t` at the start of segment N matches `segmentStartsMs[N]`. This is automatic because:
- `frameClockSetActive` is NOT called false/true around `rolloverSegmentGapless()` — the counter runs uninterrupted
- The rollover only resets `elapsedRef.current` (the per-segment display timer), not the frame counter

**Codec priming offset:** AAC (iOS MP4) has ~2112 priming samples at the start of each segment. ffprobe typically reports these as part of the container duration. The frame counter counts ALL frames including priming. If Whisper's `durationSeconds` includes the priming frames, alignment is perfect. If Whisper's `durationSeconds` excludes them, there is a ~47ms undercount per rollover boundary. Over 6 segments, this is ~280ms — barely outside the 250ms budget. Mitigation: zero the frame counter at first `ondataavailable` per segment, which skips priming frames that will also be skipped by the decoder. Flag for the executor to implement and verify against a multi-segment smoke.

### Test strategy (agent-runnable)

**The jsdom constraint:** `new AudioContext()` throws in jsdom. The `_graphOverride` escape hatch in `UseAudioRecorderOptions` (test-only) bypasses `createMicAudioGraph` entirely.

**Fake graph helper** (add to `src/__tests__/recording/helpers/fakeMicAudioGraph.ts`):
```typescript
export class FakeMicAudioGraph implements Pick<MicAudioGraph,
  'frameClockGetMs' | 'frameClockSetActive' | 'recordingStream' | 'dispose' |
  'getLevel' | 'setGain' | 'addRemoteAudio' | 'setRemoteGain' | 'swapLocalMicSource'
> {
  private _active = false;
  private _ms = 0;
  recordingStream = new MediaStream(); // or mock
  frameClockGetMs = () => this._ms;
  frameClockSetActive = (a: boolean) => { this._active = a; };
  /** Advance the fake clock — only accumulates when active. */
  advance(ms: number) { if (this._active) this._ms += ms; }
  getLevel = () => 0;
  setGain = (_g: number) => {};
  addRemoteAudio = (_s: MediaStream) => () => {};
  setRemoteGain = () => {};
  swapLocalMicSource = () => {};
  dispose = () => {};
}
```

**Test file 1: `src/__tests__/recording/audio-clock-alignment.test.ts`**

Oracle: the injected fake graph controls the clock independently of `jest.fakeTimers`. The test proves `getAudioMs()` follows the frame counter, not wall time.

```typescript
it('getAudioMs follows frame clock, not performance.now drift', async () => {
  const fakeGraph = new FakeMicAudioGraph();
  const { result } = renderHook(() =>
    useAudioRecorder({ studentId: 's1', onRecorded: jest.fn(), _graphOverride: fakeGraph })
  );

  await act(() => result.current.handleStartRecording());
  // Advance frame clock by 10,000ms
  fakeGraph.advance(10_000);
  // Advance wall clock by a DIFFERENT amount (simulates iOS throttling)
  jest.advanceTimersByTime(11_500);

  // getAudioMs must follow the frame clock, not wall clock
  expect(result.current.getAudioMs()).toBe(10_000);
});

it('getAudioMs accumulates correctly across pause/resume', async () => {
  const fakeGraph = new FakeMicAudioGraph();
  const { result } = renderHook(() =>
    useAudioRecorder({ studentId: 's1', onRecorded: jest.fn(), _graphOverride: fakeGraph })
  );
  await act(() => result.current.handleStartRecording());
  fakeGraph.advance(5_000); // 5s recording
  act(() => result.current.pauseRecording());
  fakeGraph.advance(3_000); // 3s paused — should NOT count
  act(() => result.current.resumeRecording());
  fakeGraph.advance(2_000); // 2s more recording
  // Total recording-active = 5 + 2 = 7s
  expect(result.current.getAudioMs()).toBe(7_000);
});

it('getAudioMs does NOT reset on auto-rollover', async () => {
  const fakeGraph = new FakeMicAudioGraph();
  const { result } = renderHook(() =>
    useAudioRecorder({ studentId: 's1', onRecorded: jest.fn(), _graphOverride: fakeGraph })
  );
  await act(() => result.current.handleStartRecording());
  // Simulate a rollover boundary
  fakeGraph.advance(SEGMENT_MAX_SECONDS * 1000);
  jest.advanceTimersByTime(SEGMENT_MAX_SECONDS * 1000); // triggers auto-rollover timer
  // elapsedRef resets to 0 (display timer), but getAudioMs stays cumulative
  fakeGraph.advance(1_000);
  expect(result.current.getAudioMs()).toBeGreaterThan(SEGMENT_MAX_SECONDS * 1000 + 900);
});
```

**The independent oracle:** `fakeGraph.advance(10_000)` is the oracle. It is completely separate from the implementation's internal time tracking. The test CANNOT accidentally pass by asserting the implementation's own formula back at itself — the oracle is an external counter, not derived from the code under test.

**Test file 2: `src/__tests__/recording/watchdog.test.ts`**

```typescript
it('watchdog fires stall alert when frame clock does not advance', async () => {
  const fakeGraph = new FakeMicAudioGraph();
  const onWatchdogAlert = jest.fn();
  const { result } = renderHook(() =>
    useAudioRecorder({ studentId: 's1', onRecorded: jest.fn(), _graphOverride: fakeGraph, onWatchdogAlert })
  );
  await act(() => result.current.handleStartRecording());
  fakeGraph.advance(1_000); // initial advance
  // 30s pass but NO more advancement (stall)
  jest.advanceTimersByTime(30_000);
  expect(onWatchdogAlert).toHaveBeenCalledWith('stall');
});
```

**Test file 3: `src/__tests__/recording/ios-timeslice.test.ts`**

```typescript
it('iOS-conditional no-timeslice: audio/mp4 mimeType triggers start() without timeslice', async () => {
  jest.spyOn(require('@/lib/recording/mime'), 'chooseMimeType').mockReturnValue('audio/mp4');
  // ... setup recorder with recordingDraft ...
  const startSpy = jest.spyOn(MockMediaRecorder.prototype, 'start');
  await act(() => result.current.handleStartRecording());
  // Should call start() with NO argument (undefined timeslice)
  expect(startSpy).toHaveBeenCalledWith(); // no args
  expect(startSpy).not.toHaveBeenCalledWith(expect.any(Number));
});
```

### Agent-runnable vs Andrew-hardware split

**Agent-runnable (CI-safe, no hardware):**
- `audio-clock-alignment.test.ts` — fake graph, oracle independent of implementation
- `audio-clock-pause-resume.test.ts` — accumulation across state transitions
- `audio-clock-rollover.test.ts` — frame clock does NOT reset on auto-rollover
- `watchdog.test.ts` — stall alert fires correctly
- `ios-timeslice.test.ts` — `audio/mp4` mimeType triggers no-timeslice path
- `grep audit: useAudioMsClock` — must return 0 matches after the change
- `grep audit: performance\.now` in `getAudioMs` call path — must return 0 matches
- `npx jest --runInBand --testPathPatterns "whiteboard|recording"` — no regressions

**REQUIRES Andrew's iOS hardware (cannot be verified by jsdom or Playwright relay):**
1. **iOS background-suspend alignment:** On iOS Safari, start a session. At the 4-minute mark, background Safari for 3 minutes. Return to foreground. End session. In replay: strokes at the 4-minute mark must appear visually simultaneous with the corresponding spoken word (< 250ms subjective tolerance). Also verify `[mic-recorder-audio] event=audiocontext-state-change state=suspended` appears in console after backgrounding.
2. **iOS phone call interrupt + watchdog:** Receive an incoming call mid-session (or use "Airplane mode" toggle to simulate). Verify either: (a) the watchdog banner appears within 30s of the interruption, OR (b) the session resumes cleanly when the call ends (AudioContext resumes, frame counter continues).
3. **iOS timeslice playability:** Record a 5-minute session on iOS Safari. End session. Verify notes generation succeeds (Whisper can decode the mp4). Confirm `event=ios-no-timeslice` appears in console.
4. **`audio/mp4` heuristic accuracy:** Confirm the `chooseMimeType() === audio/mp4` heuristic correctly identifies iOS Safari and does NOT trigger on macOS Safari (where timeslice is safe). If macOS Safari also returns `audio/mp4`, add UA check for `iPhone|iPad|iPod` in addition.
5. **Long-session drift (50 min):** Record a ~50-minute session (can use auto-rollover). Replay from start. Verify strokes at the 45-minute mark are visually in sync with audio (< 250ms subjective). This confirms the cumulative-across-rollover behavior is correct in production.

### Acceptance criteria for 1b (revised)

**Frame-counter clock:**
- [ ] `audio-clock-alignment.test.ts` green — `getAudioMs()` follows injected fake clock, not wall time
- [ ] Pause/resume accumulation test green — 7s total from 5s + 3s-paused + 2s
- [ ] Rollover non-reset test green — frame clock is cumulative across segment boundary
- [ ] `useAudioMsClock` deleted from `WhiteboardWorkspaceClient.tsx` (grep returns 0)
- [ ] `performance.now` not in `getAudioMs` call path (grep returns 0)
- [ ] `[mic-recorder-audio] event=audiocontext-state-change` logged on AudioContext state change (verify in a desktop browser session)
- [ ] `[mic-recorder-audio] frame-counter=audioworklet` OR `frame-counter=script-processor` logged on graph init

**iOS timeslice:**
- [ ] `ios-timeslice.test.ts` green — `audio/mp4` triggers no-timeslice `recorder.start()`
- [ ] iOS hardware smoke: 5-min recording produces a Whisper-decodable mp4 (Andrew hardware)
- [ ] `audio/mp4` heuristic accuracy confirmed on Andrew's device (Andrew hardware)

**Watchdog:**
- [ ] `watchdog.test.ts` green — `onWatchdogAlert('stall')` fires after 30s of no advancement
- [ ] Workspace component wires `onWatchdogAlert` to a visible warning banner (visual smoke)
- [ ] Empty-rollover path calls `onWatchdogAlert('empty-rollover')` (not just console.warn)

**Regression:**
- [ ] `npx jest --runInBand --testPathPatterns "whiteboard|recording"` — all green (no regressions)

**Hardware (Andrew):**
- [ ] iOS background-suspend smoke: strokes at 4-min mark align within 250ms after 3-min background
- [ ] iOS phone-call interrupt: watchdog fires OR session resumes cleanly
- [ ] 50-min drift check: strokes at 45-min mark visually in sync

### Founding-constraint audit for 1b

- **No schema changes.** All changes are in-browser. `MicAudioGraph` interface extension is backward-compatible (new fields only).
- **No new egress.** The AudioWorklet worklet code is a blob URL, never sent to an external server. No CSP change needed.
- **No new DB columns.**
- **CSP consideration:** `blob:` URLs for the AudioWorklet `addModule()` are same-origin and do not require changes to `Content-Security-Policy`'s `script-src` directive when using blob URLs — these are generated in-page by the browser, not loaded from a remote origin. Verify in smoke that AudioWorklet init succeeds (no CSP errors in console).

### Decisions still open for Andrew

1. **AudioWorklet vs ScriptProcessorNode as primary:** the plan implements AudioWorklet-preferred with ScriptProcessorNode fallback. If Andrew prefers simplicity over future-proofing (ScriptProcessorNode only, TODO to upgrade), say so — it saves ~30 lines of worklet code. The clock behavior is identical.
2. **`_graphOverride` test API:** adds a private hook to `UseAudioRecorderOptions`. Alternative approach: module-level mock of `createMicAudioGraph`. Andrew's preference on test architecture.
3. **Codec priming offset per rollover (~47ms per segment):** do we zero the frame counter at first `ondataavailable` to skip priming frames, or accept ≤47ms per boundary and note it's within budget for < 6 segments? (For 7+ segments, accumulated priming could exceed 250ms.) Recommendation: zero at first `ondataavailable` per segment. But this adds complexity. Andrew's call.
4. **Watchdog UI surface:** where does the stall warning appear in the workspace? Banner above the whiteboard? The workspace chrome is Andrew's domain — confirm the right surface before the executor builds it.

---

## Workstream 1c — Thin waiting room

### What "thin" means here

Authenticated learner login and session invite management are **explicitly deferred**. The thin waiting room stays on the existing **anonymous-token flow** (`/w/[joinToken]`) — the student's auth story doesn't change. What we're fixing:

1. **Student lands in a visual "waiting" state** before the tutor admits them
2. **`bothConnectedAt` is stamped at admit, not at link-open** (currently stamped the moment the student opens the URL — this is incorrect per Sarah's timer expectation)
3. **Tutor gets an "Admit" affordance** in the workspace before starting the session
4. **Timer starts on admit** — the already-wired `GET /api/whiteboard/[id]/timer-anchor` polling mechanism just works once `bothConnectedAt` is set at the right time

### Current behavior (code confirmed)

`src/app/w/[joinToken]/page.tsx`, lines 93-99:
```typescript
// Stamps bothConnectedAt the moment the student opens the link.
// This is WRONG for a waiting room — it should be stamped at admit.
await db.whiteboardSession.updateMany({
  where: { id: tokenRow.whiteboardSessionId, bothConnectedAt: null },
  data: { bothConnectedAt: now },
});
```

### Proposed architecture (4-file change surface)

**Signaling approach:** DB polling (not relay-based).  
Rationale: Using the sync relay for admit signaling would require the student to connect to the relay room BEFORE being admitted, which would flip `everHadParticipants` in the FSM prematurely. DB polling with a 3s interval avoids this entirely — student joins the relay room only after the tutor admits.

#### Step 1: Remove the premature `bothConnectedAt` stamp

**File: `src/app/w/[joinToken]/page.tsx`**

Remove lines 93-99 (the `db.whiteboardSession.updateMany` that stamps `bothConnectedAt`). The student page no longer stamps the timestamp — only the tutor's admit action does.

Pass a new prop to `StudentWhiteboardClient`: `isAdmitted: false` initially.

#### Step 2: Student waiting room UI

**File: `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`**

Add a "waiting" display mode. When `isAdmitted = false`, the student sees a waiting screen ("Your tutor will let you in shortly"). The student polls `GET /api/whiteboard/[sessionId]/admission-status` every 3 seconds. When the endpoint returns `{ admitted: true }`, the student transitions to the live board (connects to sync relay, full Excalidraw loads).

**New API route: `src/app/api/whiteboard/[sessionId]/admission-status/route.ts`**

Auth: gated by the joinToken (sent as a query param or header) — the student is not an authenticated user. Returns `{ admitted: boolean }` based on whether `bothConnectedAt` is set on the session row.

**Security note:** the student's knowledge of the joinToken already proves they're the intended student. This endpoint only reveals whether the session has been admitted, not any PII — safe to gate on token.

#### Step 3: Tutor waiting room + Admit button

**File: `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx`**

Current:
```typescript
type ShellMode = "live" | "review";
```

New:
```typescript
type ShellMode = "waiting" | "live" | "review";
```

The shell detects "is there a student waiting?" by reading from a prop or polling the admission status endpoint. Tutor's initial mode is determined by server-fetched `bothConnectedAt === null`:

- `bothConnectedAt === null && !sessionEnded` → `mode = "waiting"`
- `bothConnectedAt !== null && !sessionEnded` → `mode = "live"` (direct start, or already admitted)
- `sessionEnded` → `mode = "review"`

The **waiting mode render** (replaces the current `"waiting"` stub comment):
- Shows a minimal "Student is waiting to be admitted" panel
- Has an **Admit** button
- The `WorkspaceResumeGate` / `WhiteboardWorkspaceClient` are NOT mounted yet (key for FSM: `everHadParticipants` stays false, recording not armed)

**Admit button handler:** calls `admitStudentAction(whiteboardSessionId)` (new server action), then transitions `mode → "live"`.

#### Step 4: New server action

**File: `src/app/admin/students/[id]/whiteboard/actions.ts`**

```typescript
export async function admitStudentAction(whiteboardSessionId: string) {
  const session = await assertOwnedSession(whiteboardSessionId); // ownership check
  await db.whiteboardSession.update({
    where: { id: whiteboardSessionId },
    data: { bothConnectedAt: new Date() },
  });
  console.log(`[nsi] wbsid=${whiteboardSessionId} action=student_admitted`);
}
```

**Ownership assertion:** `assertOwnedSession` must run `assertOwnsStudent(adminUserId, session.studentId)` — same pattern as all other whiteboard server actions.

### FSM / timer perturbation analysis

| FSM Input | Current behavior | After 1c | Risk |
|---|---|---|---|
| `participants` | Flips to non-empty when student joins relay (at link-open) | Stays empty until after admit (student joins relay only after admit) | ✅ Correct — `everHadParticipants` latch does not flip prematurely |
| `everHadParticipants` latch | Flips at student link-open | Flips at student relay-join (post-admit) | ✅ No regression — just delayed |
| `audioClockMs` / `wbClockMs` | Starts when FSM enters `recording` | Unchanged — FSM doesn't change | ✅ No regression |
| `bothConnectedAt` (session timer) | Stamped at student link-open | Stamped at tutor admit action | ✅ This IS the fix — timer now starts at the right moment |
| `endWhiteboardSession` step order | Steps 1-8 per RECORDER-LIFECYCLE.md | Unchanged — tutor can End from waiting mode (session never started recording) | ⚠️ See note below |

**End from waiting mode:** if the tutor clicks End Session while in `mode="waiting"` (before admitting), the `handleEndSession` flow runs. Since `WhiteboardWorkspaceClient` was never mounted, `userWantsRecording` was never set to true. The outbox is empty. `drainOutboxOrTimeout` returns immediately. `assembleEndSessionSegments` returns []. `endWhiteboardSession` runs with no segments — valid (just stamps `endedAt`, no audio to register). The shell transitions to `mode="review"`. This is safe and correct.

**One concern (flag, don't block):** the current DB schema has `bothConnectedAt` as nullable, set on first student join. A waiting room where the tutor admits means `bothConnectedAt` can now be set by the TUTOR (via `admitStudentAction`) rather than only by the student's page. This is a semantic change in who sets it — architecturally fine, but worth noting in the commit message.

### Consent input thread

The waiting room shell (`mode="waiting"`) is shown BEFORE `WhiteboardWorkspaceClient` mounts. The `StartWhiteboardSession` consent modal (which gates session creation) has already fired BEFORE the tutor shares the join link — session creation requires consent acknowledgment. So the waiting room is AFTER consent and AFTER session creation. No consent perturbation.

### Engagement-ready schema flag (founding constraint)

Phase 1 thin waiting room doesn't add new schema, but flag this for Phase 4 (instrumentation): the time delta between `studentJoinedAt` (when student opened the link) and `bothConnectedAt` (when tutor admitted) is a useful **waiting room latency metric**. If Phase 4 wants this, it needs a `studentJoinedAt` column added (additive migration). Phase 1 doesn't need it, but don't foreclose it — if implementing the admission-status API, consider logging `[nsi] wbsid=... action=student_arrived_waiting` as a soft signal without a new DB column for now.

### CSP note

The new `/api/whiteboard/[sessionId]/admission-status` route is same-origin. No new external origins. No CSP change.

### New per-session ID logging

Add `wt=<short>` prefix (waiting-room transition) for the admit lifecycle:
- `[wt] wbsid=<id> action=student_arrived` (when student enters waiting poll)
- `[wt] wbsid=<id> action=student_admitted tutor=<adminId>` (when admit action fires)
- `[wt] wbsid=<id> action=student_transitioned_to_live` (when student poll detects admitted)

Register `wt` in the AGENTS.md prefix registry.

### Test/verification strategy for 1c

**Agent-runnable:**
- Server action test: `admitStudentAction` stamps `bothConnectedAt` and asserts ownership (extends `endWhiteboardSession.test.ts` pattern)
- API route test: `GET /api/whiteboard/[sessionId]/admission-status` returns `{ admitted: false }` when `bothConnectedAt === null`, `{ admitted: true }` after
- DOM test: `WhiteboardSessionShell` renders waiting mode when `bothConnectedAt === null`, transitions to live mode after admit (mock the server action)

**Requires Andrew's 2-device smoke:**
- Student opens join link → sees waiting UI
- Tutor clicks Admit → session timer starts → student transitions to live board
- Session timer on tutor side starts after admit (NOT at link-open)
- End session from waiting mode: session ends cleanly with no audio, no error

### Acceptance criteria for 1c

- [ ] Student sees "waiting" UI when they open the join link
- [ ] Tutor sees "Student is waiting" affordance and Admit button
- [ ] Session timer starts only after Admit (not at link-open)  
- [ ] `bothConnectedAt` is null until Admit fires (confirmed in DB)
- [ ] FSM `everHadParticipants` latch is not prematurely set (no relay join before admit)
- [ ] End from waiting mode works cleanly (no error, no audio loss, session ends)
- [ ] Ownership assertion in `admitStudentAction` verified (test)
- [ ] No regression in `npx jest --runInBand --testPathPatterns "whiteboard|shell"`

---

## Workstream 1d — Validate save segmentation + same-WB-page notes review

### Status: ALREADY WIRED — confirm, don't rebuild

The save segmentation + in-shell notes review is the combined Phase 1b (outbox + atomic end) + A3 (in-shell flip) work that was shipped to `v1-redesign` in smoke round 1. Per RECORDER-LIFECYCLE.md, `handleEndSession` steps 1-8 are load-bearing and ordered.

**DO NOT reorder `handleEndSession` steps.** The order is:
1. `setUserWantsRecording(false)` → FSM stops capture
2. `drainOutboxOrTimeout(wbsid, 15s)` → all in-flight uploads land
3. `assembleEndSessionSegments(wbsid)` → deterministic segment list
4. `uploadWhiteboardEvents({...})` → canonical events.json to Vercel Blob
5. `generateSessionSnapshotPng(api)` → best-effort, never blocks step 6
6. `endWhiteboardSession(wbsid, eventsBlobUrl, { segments, snapshotBlobUrl? })` → atomic DB transaction
7. `finalizeOutboxAfterEnd(wbsid)` → drop IDB rows
8. `onSessionEnded?.()` → shell flips `mode="review"`

### What to verify (agent-runnable)

All existing tests for these flows should still be green after Phase 1b and 1c changes:

```
npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"
```

Expected: all pass (these were green at smoke round 1 merge `5922c6f` + `27ac5db`).

### What to verify (2-device hardware smoke, part of 1a smoke)

Items 5 and 6 of the 1a smokebook above cover this:
- Item 5: end → in-shell flip (no navigation)
- Item 6: notes generate → save → persisted

Additional targeted check:

**Segmentation verification:** After a session with ≥ 2 auto-rollover segments (record for > the segment max duration), the review page should show all audio segments playable in sequence. Confirm `SessionRecording` rows in DB match the number of segments.

**Same-WB-page notes review:** the in-shell review renders the notes panel alongside a read-only view of the final whiteboard state (the `WorkspacePreviousSessionPreview` or equivalent in `SessionReviewMode`). Confirm: notes panel is visible; whiteboard canvas shows the last-frame state; no blank canvas.

### Acceptance criteria for 1d

- [ ] `npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"` green
- [ ] 2-device smoke: end → in-shell flip → notes → save → persisted (items 5-6 of 1a smokebook)
- [ ] Session with ≥ 2 segments plays all audio in sequence
- [ ] `handleEndSession` step order NOT changed (lint: read the function before any edit)

---

## Founding-constraint audit (cross-cutting)

These are the constraints that must not be foreclosed by any Phase 1 decision, per the program roadmap's "Founding constraints":

| Constraint | Phase 1 status | Notes |
|---|---|---|
| Record portable to future/next tutor | ✅ Not foreclosed | Schema has `adminUserId` + `studentId` separately; `endWhiteboardSession` writes per `whiteboardSessionId`; no tutor-specific lock-in |
| Account/record persists free through dormancy | ✅ Not foreclosed | Phase 1 adds no forced-expiry or paused-account deletion logic |
| Event schema engagement-ready (effort/coverage signals from session 1) | ⚠️ Partial — flag | Stroke events carry `clientId` tags (author attribution) and `t` (timing) — enough for effort/coverage analytics. 1c's `bothConnectedAt` at admit-time gives a real session-duration anchor. **Flag:** Phase 4 instrumentation should use `bothConnectedAt` - `endedAt` delta as the canonical session-length signal. |
| Egress keyed on learner type | ✅ Not affected | Phase 1 adds no analytics egress |
| Migrations additive | ✅ Honored | No schema changes in 1a/1b/1d. 1c makes no DB schema changes (only behavior change in when `bothConnectedAt` is set) |
| Server actions assert ownership | ✅ Required | `admitStudentAction` (1c) MUST call `assertOwnsStudent` — this is in the plan above |
| CSP stays tight | ✅ No new origins | 1a-1d add no external origins |

**One potential foreclosure risk (flag, not block):** if Phase 4 wants `studentJoinedAt` (time the student opened the link, separate from `bothConnectedAt` which is now admit-time), Phase 1 no longer records that. Consider logging `[wt] wbsid=... action=student_arrived` without a DB column as a soft signal that Phase 4 can later persist if the metric proves useful. **Do not add the column in Phase 1 — wait for Phase 4's instrumentation design.**

---

## 5-Axis reliability review (Phase 1 acceptance gate)

Per `docs/WHITEBOARD-STATUS.md` adversarial review and the `reliability-bar.mdc` rule:

| Axis | Workstream 1b | Workstream 1c | Overall risk |
|---|---|---|---|
| **Data loss** | Low — clock fix doesn't affect the outbox/atomic-end pipeline | Low — End from waiting mode drains an empty outbox cleanly | Low |
| **Crash recovery** | No change to IDB checkpoint logic | No change — waiting mode is pre-session, no checkpoint to recover | Low |
| **Sync fidelity** | No change to sync client | Student deferred from relay until admitted — net improvement (no phantom peers) | Low |
| **Replay accuracy** | HIGH GAIN — fixes the core drift source | No change | High gain, low risk |
| **Availability (tutor flow)** | Low — clock fix is opt-in fallback path; if AudioContext null → falls back to performance.now() | Medium — new code path for admit; test thoroughly | Monitor with 2-device smoke |

**BLOCKERs that must be resolved before 1c ships:**

1. **B1c-1:** `admitStudentAction` ownership assertion must pass the same ownership model as `endWhiteboardSession`. Test first.
2. **B1c-2:** student polling must not create an observable "admission denial" race where the student connects to the relay before the FSM has finished transitioning. Enforce: student ONLY connects to relay after the admission-status endpoint returns `admitted: true` AND the `bothConnectedAt` DB write has committed. (The DB write is synchronous in `admitStudentAction` before it returns — this is safe with polling; not safe if using push/websocket with optimistic update.)
3. **B1c-3:** the 3s poll interval adds a maximum 3s admission latency. Acceptable for a pilot-stage thin waiting room. Flag in the smoke runbook as expected behavior.

---

## Sequencing recommendation

### HARD sequencing constraint

**1a → 1b → 1c (in order). Do NOT start 1c before 1a smoke confirms a known-good baseline.**

Rationale:

- **1c modifies the session initiation flow** (`/w/[joinToken]/page.tsx` + `WhiteboardSessionShell.tsx`). These files are coupled to the FSM, timer, and end-session flow. Any pre-existing regression that 1c masks would be invisible without a prior baseline.
- **1b is safer to run in parallel with 1a baseline prep** because the clock fix is isolated to 3 files (`mic-recorder-audio.ts`, `useAudioRecorder.ts`, `WhiteboardWorkspaceClient.tsx`) and adds only new code paths with fallback.
- **1d runs concurrently with 1a verification** — it's validation, not new code. The 1d tests should be green before 1a smoke to confirm the save pipeline is working.

### Recommended execution order

```
Night 1 (agent-runnable, no hardware):
  1. Run automated baseline: npx jest --runInBand --testPathPatterns "whiteboard|recording"
  2. Build + lint check: npx next build (verify no build regressions on branch)
  3. 1b: implement audio-clock fix (3 files) + new tests
  4. Confirm 1d existing tests still green

Night 2 (requires Andrew's 2-device smoke):
  5. Andrew runs 1a smokebook items 1-8 on the Preview
  6. Andrew confirms 1d (items 5-6 of 1a smoke)
  7. If 1a + 1d PASS: proceed to 1c build

Night 3 (agent-runnable + hardware):
  8. 1c: implement thin waiting room (4 files) + server-action tests
  9. Andrew runs 1c hardware smoke (waiting room → admit → live → end)
```

**CRITICAL:** If 1a smoke reveals regressions (e.g. broken two-way sync, broken in-shell flip), STOP and fix regressions before 1b or 1c work begins. The baseline must be clean.

---

## Summary and execution checklist

### What this plan covers

| | |
|---|---|
| **1a** | Baseline validation — 2-device hardware smoke + automated harness. Defines the known-good floor. |
| **1b** | Audio-clock fix — replaces `performance.now()` surrogate with `AudioContext.currentTime`. Three files, agent-runnable unit tests, < 250ms drift proof. |
| **1c** | Thin waiting room — adds `"waiting"` shell mode, admit button, corrects `bothConnectedAt` timing. Four files, FSM/timer fully analyzed. |
| **1d** | Save segmentation + notes review validation — confirm existing pipeline, no code changes. |

### Safe to execute tonight (agent, no hardware)

1. `npx jest --runInBand --testPathPatterns "whiteboard|recording"` — baseline check (10min)
2. `npx next build` — build-surface sanity (5min)
3. **1b implementation:** `src/lib/mic-recorder-audio.ts` + `src/hooks/useAudioRecorder.ts` + `WhiteboardWorkspaceClient.tsx` + 2 new test files — clock fix + drift proof
4. **1d test pass:** `npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"` — confirm save pipeline green
5. Commit the above to branch with message referencing this plan

### Must wait for Andrew's 2-device hardware smoke

- All 8 items in the 1a smokebook (items 2-8 require real devices + live relay)
- 1d segmentation + notes-review validation (items 5-6 of 1a smokebook)
- 1c hardware smoke (waiting room → admit → session timer → end)

### Open decisions for Andrew

1. **1c scope: sync-relay vs. DB-poll for admit signaling.** This plan proposes DB polling (3s interval). Alternative: tutor broadcasts "admit" via the sync relay and student receives it. DB-poll is simpler and avoids the premature-relay-join FSM risk. Recommend: go with DB-poll unless Andrew wants sub-second admit latency (pilot stage doesn't need it).

2. **1c scope: should the waiting room show a live "student is here" indicator on the tutor side?** Currently proposed: the `WhiteboardSessionShell` detects `bothConnectedAt === null` at page load (server-rendered). If the student arrives AFTER the tutor has already loaded the workspace, the tutor's waiting screen won't update until either (a) the tutor refreshes, or (b) the tutor-side also polls. For a thin waiting room, option (a) is acceptable at pilot scale. Flag this if Sarah complains the tutor can't tell when a student has arrived.

3. **1b: AudioContext fallback threshold.** The plan says: fall back to `performance.now()` if the AudioContext graph is not yet built (pre-mic-acquire). This covers the edge case where a session starts recording before the mic is acquired (unlikely but possible in the FSM's `solo` mode). Confirm this fallback behavior is acceptable.

4. **1a smoke: should the baseline smoke include PDF upload, math editor, Desmos embed?** These are wired in the engine and were smoked in smoke round 1. This plan focuses 1a smoke on the sync+record+end flow. The broader regression test (including PDF/math/Desmos) should be part of the pre-master comprehensive smoke, not the Phase 1a targeted smoke. Confirm.
