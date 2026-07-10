# Part 3 — executor briefing (notes-reliability spine)

> **Recommended model: Sonnet** (Part 3 touches fragile surfaces — FSM, outbox, peer-mesh, whiteboard engine paths — with concurrency/ordering contracts; Composer 2.5 is fine for zero-doubt mechanical follow-ups *after* a Sonnet-designed wave lands). Escalation criteria: [`AGENTS.md`](../../AGENTS.md) § Model usage protocol.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh chat, your instructions are below — start by reading the files in **Read first**, then execute **`p3-clock` FIRST** in dependency order. **Do not ask for catch-up.**

---

## Paste-in prompt (Andrew: paste this block OR `@` this file)

You are the **Part 3 executor** for the tutoring-notes **notes-reliability spine** on branch `wb-wave5-polish`. **Do NOT ask Andrew for catch-up.** Read these first, in order:

1. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — HEAD + **Session-experience build status** table + **Open Andrew-confirms**
2. [`../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md) — Part 3 task list + **Resolved (Andrew)** section
3. [`docs/LIVE-AV.md`](../LIVE-AV.md) — peer-mesh, `useLiveAV`, `mic-recorder-audio`, participants-reconcile, `PEER_EVICTION_TIMEOUT_MS`
4. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM `lifecycle-machine.ts`, upload-outbox, atomic `endWhiteboardSession`, log-prefix registry

Use `git log wb-wave5-polish` for commit truth. **Start at `p3-clock`.**

---

## Branch / worktree / commit protocol

| Rule | Value |
|---|---|
| **Worktree** | `tutoring-notes-polishwt` only |
| **Branch** | `wb-wave5-polish` only — do NOT switch branches |
| **Main checkout** | `tutoring-notes` on `v1-redesign` is **NOT** current |
| **Merge** | **NO interim merge.** Single `git merge --no-ff wb-wave5-polish → v1-redesign` only after **full live-session arc both-themes hardware smoke** (FINAL Sarah gate) |
| **Shell** | Windows PowerShell 5.x — use `;` not `&&` |
| **DB tests** | **Mandatory override** before any DB-touching jest: `$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_test" ; $env:DIRECT_URL=$env:DATABASE_URL` — verify host is `127.0.0.1`, **never Neon** |

**Commit via temp file** (PS 5.x mangles `-m`):

```powershell
$msg = "<subject>`n`n<body>"
$gitdir = git rev-parse --absolute-git-dir
$tmp = Join-Path $gitdir COMMIT_MSG_DRAFT.txt
[System.IO.File]::WriteAllText($tmp,$msg,(New-Object System.Text.UTF8Encoding $false))
git add <files>
git commit -F $tmp
```

Delete `$tmp` in a **SEPARATE sequential command** (never parallel with commit); then `git push origin wb-wave5-polish`.

---

## Execution order (locked)

```text
p3-clock
  → p3-perspeaker-capture
  → p3-vad-chunking
  → p3-consent-recording   (extends Block B — see build status)
  → p3-incremental-map
  → p3-model-abstraction
  → p3-finalize
  → p3-replay-scrub
  → p3-video-seam           (design-only — NOT built for Sarah)
```

---

## Part 3 task sequence

| Task | Intent (one line) | Key files | Fragile? |
|---|---|---|---|
| **`p3-clock`** | Single monotonic session clock from `MediaRecorder` elapsed-ms; thread into WB `t`, FSM `audioClockMs`, outbox `audioStartedAtMs`, transcription `recordingTimeOffsetMs`; disconnect pause/freeze | `WhiteboardWorkspaceClient.tsx` (`useAudioMsClock`, lifecycle `audioClockMs`), `useAudioRecorder.ts`, `useWhiteboardRecorder.ts`, `lifecycle-machine.ts` (read `wbClockMs` passthrough only) | **YES** — FSM + clock threading |
| **`p3-perspeaker-capture`** | Tap-before-mix: per-speaker `MediaRecorder` lanes (transcription only); mixdown unchanged (sole replay); tag `streamId`+`speakerId`+`recordingTimeOffsetMs`; update LIVE-AV invariant #6 | `mic-recorder-audio.ts`, `useRemoteMicRecorders.ts`, `remote-stream-recorder.ts`, `WhiteboardWorkspaceClient.tsx` (reconcile ~L2417+), `upload-outbox.ts`, `LIVE-AV.md` | **YES** — peer-mesh / audio graph / outbox |
| **`p3-vad-chunking`** | Per-speaker VAD silence chunking replaces 50-min rollover | `segment-policy.ts`, `useAudioRecorder.ts`, per-speaker recorder flush path | Medium |
| **`p3-consent-recording`** | Per-participant per-modality consent gates on per-speaker recorders (extends Block B) | `useRemoteMicRecorders.ts`, FSM `inputStreams`, consent projection (`deriveAudioCapturePolicy`) | Medium (auth/consent boundary) |
| **`p3-incremental-map`** | Map consumes speaker-labeled chunks; skeleton → real notes at End | `notes-actions.ts`, map/reduce pipeline, `TutorNotesSection.tsx` (`SkeletonNotes`) | Low–medium |
| **`p3-model-abstraction`** | Config-swappable transcription + map + reduce models; strong initial prompts | `src/lib/ai.ts` (or equivalent), env/config surface | Low |
| **`p3-finalize`** | Merge transcripts by `recordingTimeOffsetMs`; ffmpeg gapless mixdown; `finalizeOutboxAfterEnd` only after success | `upload-outbox-instance.ts`, `actions.ts` (`endWhiteboardSession`), server ffmpeg mix | **YES** — atomic end-session + outbox |
| **`p3-replay-scrub`** | Continuous-stream replay; scrub-drag no-regress; neutralize legacy multi-segment stitch | `WhiteboardReplay`, Playwright scrub guard | Medium |
| **`p3-video-seam`** | Design seam for post-Sarah video — data model + docs only | `RECORDER-LIFECYCLE.md`, schema comments | No (docs/design) |

**Sequencing hard rule:** `p3-clock` **MUST** land before `p3-perspeaker-capture` (shared `recordingTimeOffsetMs` contract).

---

## Ratified inputs — DO NOT RE-LITIGATE

| Decision | Contract |
|---|---|
| **t=0 anchor** | FSM `recording` entry / `MediaRecorder.start()` — same gate = same epoch for all streams + WB clock |
| **WB↔audio sync oracle** | Hardware-validated: spoken word + simultaneous stroke have **no human-noticeable delta** on replay ("I'm drawing a dot…NOW" test) — jsdom insufficient |
| **Disconnect behavior** | Audio **pauses** + clock **freezes**; WB **continues** stamping events at **frozen** timestamp; reconnect resumes clock; gap strokes **collapse to pause instant** (accepted) |
| **Disconnect trigger** | Debounced stable disconnect ~**6s** (`PEER_EVICTION_TIMEOUT_MS` in `useLiveAV.ts`) — **see OPEN confirm below** |
| **3+-peer cap** | Per-speaker for all peers up to **≤3–4**; **NO mixdown fallback** for transcription lanes |
| **Tap-before-mix** | Per-speaker lanes = **transcription only**; mixdown = **SOLE replay source**; merge by `recordingTimeOffsetMs` **NEVER** `createdAt` |
| **Reverses rollback [`89e0fe1`](https://github.com/Arangarx/tutoring-notes/commit/89e0fe1)** | Safe via sync-metadata contract — document in LIVE-AV.md invariant #6 during `p3-perspeaker-capture` |
| **Notes quality** | **PRE-MERGE bar** — genuinely good first-pass map/reduce on labeled per-speaker transcripts + model abstraction ("good notes, not exists-needs-editing") |
| **Deferred post-master** | Formal eval harness + flywheel iteration loop only |
| **Block B consent** | Client audio-consent projection **BUILT** (see build status); `p3-consent-recording` **extends** to per-speaker lanes — do not rebuild Block B |

---

## ⚠️ OPEN Andrew-confirm — STOP before wiring

| Item | Action |
|---|---|
| **Debounced-disconnect pause trigger** | Recommended default: stable disconnect ~**6s** (`PEER_EVICTION_TIMEOUT_MS`). **Confirm with Andrew before implementing disconnect→pause/freeze in `p3-clock`.** Do not wire on silence or assumption. |

All other Part 3 architecture decisions are **APPROVED (Andrew 2026-06-30)**. Standing confirms (WB-LABEL-PARENT-SIGNIN, Sarah device, etc.) live in [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) § Open Andrew-confirms.

---

## Fragile-surface guardrails

**ADDITIVE-only** on these surfaces — no rewrites:

- `lifecycle-machine.ts`
- `upload-outbox.ts` / `upload-outbox-instance.ts`
- atomic `endWhiteboardSession` (`actions.ts`)
- `peer-mesh.ts` / `useLiveAV.ts` / `mic-recorder-audio.ts`
- `src/lib/whiteboard/` (sync/apply/viewport)
- `WhiteboardWorkspaceClient.tsx` **engine paths** (page switch, scene data flow, recording FSM wiring)

**Tripwires:**

1. **2nd failed attempt** at same root cause → STOP → plan mode (do not attempt #3)
2. **Design fork** with real trade-offs → STOP → plan mode
3. **Fragile change workflow:** dispatch read-only `explore` to root-cause **FIRST** → implement → Sonnet **5-axis review** of diff **AFTER**
4. **New per-session log prefix** → register in [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) + emit on every state transition

**Whiteboard chrome rule:** extend don't rewrite ([`AGENTS.md`](../../AGENTS.md) hard-won lesson).

---

## Testing contract

Ship the test in the **SAME wave** as the code. **Red-before / green-after** or it doesn't count.

| Class | Coverage |
|---|---|
| **Deterministic (automate)** | Clock math, FSM transitions, chunk boundaries, merge-by-offset sort, model-abstraction dispatch, consent gating, outbox row shape |
| **Smokebook ONLY** | jsdom-blind / hardware / perceptual: stroke↔audio replay **ALIGNMENT**, real-audio mixdown, WebRTC peer audio, VAD on real speech, disconnect→resume timing |

**Green gate before declaring a wave smoke-ready:**

1. `npm run test:wb-jest` (inner loop)
2. `npx jest` (full suite)
3. `npx next build` (any build-surface change)
4. `npm run test:wb-sync` (any wb-surface touch — **merge-boundary**, not per-commit)
5. Playwright e2e for the touched flow

**DB:** always local `tutoring_notes_test` override (see protocol above). Never write to Neon without explicit Andrew greenlight.

---

## PROPOSED `p3-clock` design — ⚠️ REVIEW BEFORE EXECUTING

> **FLAG:** This section is a **proposal for Opus/Andrew review**, not settled implementation. Do not treat as ratified until confirmed at execution kickoff (especially the disconnect trigger — see OPEN confirm).

### Current wiring (tip `b7c88ac` / CF-2.1)

| Surface | Today |
|---|---|
| **Clock source** | `useAudioMsClock(wbSignal)` — `performance.now()` surrogate accumulating across pauses (`WhiteboardWorkspaceClient.tsx` ~L393–410) |
| **`wbSignal`** | `audioCapturePolicy !== "none" ? recordingActive : wbEventsActive` — audio modes track FSM pause; IN_PERSON (`policy=none`) keeps WB events active for replay (CF-2/MB-4) |
| **FSM `audioClockMs`** | Hardcoded **`0`** passed to `evaluateLifecycle` (~L2342) — not yet threaded |
| **Viewport anchor** | `useEffect` on `wbSignal` fires `recorder.recordViewport` at recording start (~L2922–2948) |
| **Recorder hook** | `useWhiteboardRecorder({ getAudioMs, recordingActive: wbSignal })` (~L2867–2874) |

### Proposed t=0 anchor

1. **Authority:** `useAudioRecorder` segment elapsed-ms at `MediaRecorder.start()` (replace `performance.now()` surrogate).
2. **Single session epoch:** moment FSM enters `recording` (same gate as mixdown start + audio-flow gate per LIVE-AV invariant #10).
3. **Threading:**
   - `getAudioMs()` ← recorder elapsed (pause-aware)
   - `evaluateLifecycle({ audioClockMs })` ← same value
   - Outbox enqueue `audioStartedAtMs` ← offset at segment start
   - WB events `t` via existing `getAudioMs` in `useWhiteboardRecorder`
   - Transcription `recordingTimeOffsetMs` ← same clock at chunk flush
4. **Log:** `[rid] rid=<id> wbsid=<id> action=clock_start t0=<ms>` at anchor.

### Proposed disconnect pause/freeze (pending Andrew confirm on trigger)

1. **Trigger:** When a remote peer stays disconnected/failed for **`PEER_EVICTION_TIMEOUT_MS` (6_000)** — reuse existing eviction timer in `useLiveAV.ts` (~L2006) rather than inventing a parallel debounce.
2. **On trigger:** pause mixdown `MediaRecorder` + freeze shared clock (accrued ms stops advancing); FSM → `paused` / `recordingActive=false` for audio paths.
3. **WB during gap:** `wbSignal` for WB events stays active (or a dedicated frozen-clock branch) — strokes stamp at **last frozen offset** (not wall clock).
4. **On reconnect:** resume recording + clock advance from frozen accrued position.
5. **Replay artifact:** gap strokes appear at pause instant — **accepted**.

### Proposed WB↔audio hardware sync oracle

| Test | Method |
|---|---|
| **"Dot…NOW" alignment** | Tutor speaks cue + draws dot simultaneously; replay scrub to moment; stroke audio delta ≤ human-noticeable (~250ms over 50 min is the drift bar) |
| **Why not jsdom** | Layout/coordinates + real MediaRecorder timing are jsdom-blind ([`AGENTS.md`](../../AGENTS.md) hard-won lesson) |
| **Harness option** | On-device debug HUD logging `getAudioMs()` vs latest WB event `t` on each stroke; or Playwright + real audio on relay hardware |

---

## Current build status — do NOT rebuild shipped work

| Layer | Status |
|---|---|
| **Schema** | **BUILT** — `TranscriptChunk`, `TranscriptChunkExtraction`, `SessionRecording.streamId` in [`prisma/schema.prisma`](../../prisma/schema.prisma) |
| **Partial pipeline** | **SHIPPED** — 50-min time-based segments (`segment-policy.ts` `SEGMENT_MAX_SECONDS`); per-segment transcribe + incremental map; `enqueueChunkTranscriptionAction`; `SkeletonNotes` shimmer in [`TutorNotesSection.tsx`](../../src/components/whiteboard/TutorNotesSection.tsx) |
| **Block B (CLIENT-AUDIO-CONSENT-GATE)** | **BUILT** @ commits `d180ef1`→`bded52e` — `deriveAudioCapturePolicy` → `full` / `tutor_only` / `none`; gates mixdown attach, upload, IDB, transcription; honest tutor banner. **`p3-consent-recording` extends to per-speaker lanes — do not redo Block B.** |
| **CF-2 / CF-2.1** | **SHIPPED** — mode-aware `wbSignal` decouples WB event capture from audio policy (IN_PERSON replay fix) |
| **Mixdown (replay)** | **BUILT** — single mixdown via `addRemoteAudio` → `recordingDest` (~L2417–2477); LIVE-AV invariant #6 |
| **Per-speaker hook** | **DORMANT scaffold** — [`useRemoteMicRecorders.ts`](../../src/hooks/useRemoteMicRecorders.ts) exists; **not wired** for Sarah-path transcription lanes yet |
| **Tap attach point** | Remote `participants[i].audioStream` reconciled in `WhiteboardWorkspaceClient` **before** `workspaceAudio.addRemoteAudio` — Part 3 taps **before** mixdown attach |
| **Part 3 spine** | **UNBUILT** — VAD per-speaker capture, model abstraction, high-quality map/reduce, finalize/ffmpeg continuous replay, replay-scrub guards |
| **Spike branch** | [`spike/live-transcription` @ `7671a25`](https://github.com/Arangarx/tutoring-notes/tree/spike/live-transcription) — flag OFF, unmerged, not Sarah-path |

### Standing gaps (not Part 3 blockers — document/limit)

| Gap | ID |
|---|---|
| Orphan audio blobs not walked by erasure inventory | **ERASURE-ORPHAN-AUDIO-BLOBS** |
| Client IDB/sessionStorage unreachable by server erasure | **ERASURE-CLIENT-STORE-UNREACHABLE** |

### Pre-existing test quarantine

| Suite | Status |
|---|---|
| `src/__tests__/dom/StudentLiveWorkspaceClient.dom.test.tsx` | **`describe.skip`** — `WB-TESTENV-IDB-STUDENT-SUITE` (unmocked IndexedDB in jsdom; pre-existing, not Part 3 scope) |

---

## Wrap-up per wave

1. One concern per commit; push `origin wb-wave5-polish` after each substantive wave
2. Update [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) head on every material state change
3. Do **not** merge to `v1-redesign` — checkpoint + Part 3 + full-arc hardware smoke come first
4. **MCP write-safety:** read-only default; name writes and wait for Andrew "go"
5. **Smokebook dispatches:** follow [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guessed)

---

## Stop conditions

- Andrew has not confirmed debounced-disconnect trigger → **do not wire pause/freeze**
- 2nd failed attempt on same bug → STOP → plan mode
- Fragile-surface change without explore-first + 5-axis review after → STOP
- Attempting to rebuild Block B / schema / 50-min pipeline / mixdown replay → STOP (extend only)
- Any temptation to `merge --no-ff` before full-arc both-themes hardware smoke → STOP

**Start:** read sources above → confirm `wb-wave5-polish` tip via `git log -1` → **get Andrew confirm on disconnect trigger** → execute `p3-clock`.
