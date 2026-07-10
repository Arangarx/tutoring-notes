# W1 Audio durability — orchestrator handoff report

> **Status:** DESIGN COMPLETE — 2026-05-27
> **Authored by:** Sonnet subagent, commissioned by Opus orchestrator
> **Design doc:** [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)
> **Git state:** uncommitted on master (Andrew commits as part of post-Wave-A doc cleanup)

---

## Context summary

Three audio-durability BLOCKER-PRODs from `docs/BACKLOG.md` reliability gaps audit (2026-04-23) — still open as of master HEAD. All three share the same IDB layer and the same user guarantee:

> *"Audio is durable on this device, even if not yet uploaded."*

| BLOCKER | Short description | Design surface |
|---|---|---|
| BACKLOG #1 | In-memory `chunksRef` dies on browser crash / refresh / OOM | Surface 1 — draft store |
| BACKLOG #2 | Upload retry exhaustion = blob dies on navigation | Surface 2 — outbox stuck semantics |
| BACKLOG #7 | `track.onended` unsubscribed; silent capture after device loss | Surface 3 — `ondevicechange` |

The reliability redesign pass (`docs/RELIABILITY-REDESIGN-2026-05-27.md` § Surface 1) also left two open questions that this design resolves:
- **IDB store architecture** → separate `tutoring-notes-recording-draft` store (not outbox extension)
- **`ondevicechange` detection on Safari/Chrome** → yes for Chrome desktop + macOS Safari; no for iOS BT; use RMS heuristic fallback

---

## Decisions locked

| Decision | Value |
|---|---|
| Partial-segment persistence | Separate IDB store `tutoring-notes-recording-draft` (not outbox extension) |
| Draft store key | `"${sessionId}:${streamId}"` — last-write-wins; one draft per stream per session |
| Draft checkpoint cadence | Every 30s via `setInterval` + on `MediaRecorder.stop()` + best-effort on `pagehide` |
| Outbox retry termination | 12 attempts (~8 min) → `stuck` (not `permanent-fail`; blob stays in IDB) |
| `finalizeOutboxAfterEnd` | Skip rows where `status !== "uploaded"` — only drop uploaded rows |
| Hot-swap policy | **Always user-prompted, never automatic.** Track replacement creates a segment boundary; user must confirm. |
| `ondevicechange` detection | `track.onended` + `ondevicechange` + `AudioContext.onstatechange` (see design doc browser matrix) |
| iOS BT fallback | 30s RMS silence heuristic → non-blocking banner (no auto-pause) |
| New log prefixes | `dft` (draft store), `dvc` (device events) — must be registered in `AGENTS.md` + `RECORDER-LIFECYCLE.md` |

---

## Open questions — ratification status

> **✅ RATIFIED 2026-05-30** — full rulings in design doc § [Ratification (Andrew 2026-05-30)](w1-audio-durability-design-2026-05-27.md#ratification-andrew-2026-05-30). Summary:
>
> 1. Recovery copy — approved as-is.
> 2. Cross-session stuck/orphaned drafts — **backlogged**; principles: never delete without explicit confirm; auto-recover tutor-tied orphans.
> 3. macOS debounce — unvalidated (no MacBook); leave open.
> 4. iOS `timeslice` — **not a release gate**; backlogged risk, validate on Sarah sessions or when test device acquired.

Original questions (archived):

1. **Recovery UX copy** — Design proposes two-button: "Keep and resume" / "Discard interrupted audio." Is this copy right for Sarah? Alternative: "Recover [N:NN] of audio" / "Start fresh." Low stakes; Andrew picks.

2. **Stuck-row multi-session surfacing** — Stuck rows from a prior session only surface when the user reopens that specific session's workspace. If Sarah never returns to the stuck session, the blob sits in IDB indefinitely. Should there be a top-level notification (e.g. on the student page or dashboard) that says "You have unsaved audio from a session on [date]"? Recommend YES for Sarah — she opens different sessions regularly. If yes, this adds a small amount of scope to the workspace client (cross-session IDB scan on student-page mount). **Andrew's call.**

3. **`ondevicechange` debounce on macOS Safari** — Design uses 500ms. If Andrew's MacBook fires device events differently, this may be too short. Validate during smoke on macOS Safari and adjust if needed. Not a design-ratification question — just flag to the executor.

4. **`timeslice` on iOS — BLOCKER gate before ship** — The executor must run a real-iPhone test before merging. Andrew owns this gate (he has the iPhone). If `timeslice` doesn't fire, the executor falls back to stop-only checkpoint; design doc describes both paths.

---

## Sequenced executor briefings

### Dispatch A — Audio crash / refresh durability (Surface 1)

**When:** Immediately (independent; no dependencies).

**Model:** `composer-2.5`. **Tier:** Composer (IDB pattern is additive; RECORDER-LIFECYCLE.md is the guide).

**Scope blob:**

> Read `docs/RECORDER-LIFECYCLE.md`, `docs/handoff/w1-audio-durability-design-2026-05-27.md`, and `src/lib/recording/upload-outbox.ts` (for IDB patterns) before writing any code.
>
> **Task:** Implement Surface 1 (audio crash / refresh durability) per the design doc.
>
> 1. Create `src/lib/recording/recording-draft-store.ts` — IDB singleton using store name `"tutoring-notes-recording-draft"`. Implement: `checkpoint(row: DraftSegmentRow): Promise<void>`, `findInProgress(sessionId, streamId): Promise<DraftSegmentRow | null>`, `clear(sessionId, streamId): Promise<void>`, `assemble(row): Blob` (concat chunks array). Use the same `idb` library pattern as `upload-outbox.ts`.
> 2. In `src/lib/recording/useAudioRecorder.ts` (or the whiteboard workspace recorder hook): on `MediaRecorder.ondataavailable`, accumulate chunks AND write a checkpoint to the draft store every 30s. Clear the draft row on segment finalization (after enqueuing to outbox).
> 3. In `WhiteboardWorkspaceClient.tsx`: on mount, call `draftStore.findInProgress(sessionId, "tutor:mic")`. If found, show the recovery banner ("Audio was interrupted at [time]. We recovered [N:NN]." with "Keep and resume" / "Discard" buttons). Keep: assemble blob → `outbox.enqueue(...)` → clear draft. Discard: clear draft.
> 4. Log prefix `dft=<shortId>` on: found-on-mount, checkpoint-written, keep-and-enqueue, discard.
> 5. Unit tests for draft store CRUD + chunk assembly in `recording-draft-store.test.ts`.
> 6. **BLOCKER before branch is smoke-ready:** validate on a real iPhone that `MediaRecorder(stream, { mimeType: 'audio/mp4', timeslice: 30000 })` emits intermediate `ondataavailable` events. If not: skip the `setInterval` checkpoint; only checkpoint on `stop()`. Document finding in `PLATFORM-ASSUMPTIONS.md` §8.1.
>
> **Branch:** `feat/audio-draft-store`
> **Do NOT change:** outbox schema, FSM, `endWhiteboardSession`, or any upload path.

---

### Dispatch B — Upload-failure persistence (Surface 2)

**When:** After Dispatch A is smoke-passed, OR in parallel on a separate branch (files don't conflict).

**Model:** `composer-2.5`.

**Scope blob:**

> Read `docs/RECORDER-LIFECYCLE.md`, `docs/handoff/w1-audio-durability-design-2026-05-27.md`, and `src/lib/recording/upload-outbox.ts` before writing any code.
>
> **Task:** Implement Surface 2 (upload-failure persistence) per the design doc.
>
> 1. In `upload-outbox.ts`: change retry termination from `permanent-fail` at 50 attempts to `stuck` at 12 attempts. Retry schedule: 1s/2s/5s (attempts 1-3), 15s×4 (attempts 4-7), 60s×5 (attempts 8-12), then `stuck`. A `stuck` row stays in IDB indefinitely. Remove `permanent-fail` status (or keep as unreachable dead code for backwards-compat).
> 2. Change `finalizeOutboxAfterEnd(sessionId)` in `upload-outbox-instance.ts` to only delete rows where `status === "uploaded"`. Add a test asserting that a `stuck` row survives `finalizeOutboxAfterEnd`.
> 3. The outbox `observe(sessionId)` subscription already reports `state` — ensure `stuck` rows are visible in the observer output. The workspace drives the "1 segment couldn't upload. [Retry upload]" UI from this subscription.
> 4. In `WhiteboardWorkspaceClient.tsx`: when the outbox observer reports a `stuck` row, show the stuck banner and a [Retry upload] button. The button re-arms the stuck rows for retry (set `status` back to `queued`, let the worker pick them up).
> 5. Log `[outbox] obx=<id> stuck retries=12 sizeBytes=<N>` on stuck transition.
> 6. Test: outbox retry exhaustion at attempt 13 → `stuck`; `finalizeOutboxAfterEnd` skips the stuck row.
>
> **Branch:** `feat/audio-upload-stuck`
> **Do NOT change:** draft store, FSM, `endWhiteboardSession` transaction, or the upload route itself.

---

### Dispatch C — `ondevicechange` reliability (Surface 3)

**When:** After Dispatch A smoke-passed (shares `useAudioRecorder` file). Can run in parallel with B.

**Model:** `composer-2.5`. (Device event subscriptions are straightforward hook extensions; no auth-boundary or concurrency reasoning needed beyond the debounce.)

**Scope blob:**

> Read `docs/RECORDER-LIFECYCLE.md`, `docs/handoff/w1-audio-durability-design-2026-05-27.md`, and `src/lib/recording/mic-recorder-audio.ts` before writing any code.
>
> **Task:** Implement Surface 3 (`ondevicechange` reliability) per the design doc.
>
> 1. In `useAudioRecorder` (or `mic-recorder-audio.ts`): subscribe to `MediaStreamTrack.onended` on the active track. On fire: set `deviceHealth = "ended"`.
> 2. Subscribe to `MediaDevices.ondevicechange`. On fire: debounce 500ms, then re-enumerate devices, check if current `deviceId` still present. If yes and track still `readyState === "live"`: set `deviceHealth = "ok"` and emit "New device detected" banner event (non-blocking). If no (device gone): set `deviceHealth = "ended"`.
> 3. Subscribe to `AudioContext.onstatechange`. On `"suspended"`: set `deviceHealth = "interrupted"`. On `"running"` again: if track still live, set `deviceHealth = "ok"`.
> 4. RMS silence heuristic: using existing RMS meter, track `silenceWindowMs` counter (reset on rms ≥ 0.005). If `silenceWindowMs > 30_000`: set `deviceHealth = "silent"` (maps to stream `"degraded"`, not `"failed"` — does not stop capture).
> 5. In `WhiteboardWorkspaceClient.tsx`: in a `useEffect` keyed on `deviceHealth`, translate to `inputStreams`: `"ended"` and `"interrupted"` → `"failed"`; `"silent"` → `"degraded"`; `"ok"` → `"ok"`. Show appropriate banner per the policy matrix in the design doc.
> 6. New FSM input field: `deviceHealth?: "ok" | "ended" | "silent" | "interrupted"` — the host uses this to drive `inputStreams`; the FSM itself does not branch on it.
> 7. Log prefix `dvc=<shortId>` on: `ondevicechange` fired, `track.onended`, `AudioContext.onstatechange`, RMS-silence threshold crossed.
>
> **Branch:** `feat/audio-device-health`
> **Do NOT change:** FSM logic, outbox, draft store, or the atomic end-session action.

---

## Smoke acceptance per reliability bar

Each dispatch branch must pass before merge:

- [ ] **Dispatch A smoke:** Record 60s → crash tab → reopen workspace → recovery banner shows with correct duration → "Keep and resume" → recording resumes → End session → audio plays back correctly in review
- [ ] **Dispatch A iOS gate:** Real iPhone validates `timeslice` → `ondataavailable` events mid-recording (or fallback documented)
- [ ] **Dispatch B smoke:** Simulate upload failure (DevTools → block upload endpoint) → segment turns `stuck` → banner appears → [Retry] after unblocking → segment uploads → End session → audio in review
- [ ] **Dispatch B test:** `finalizeOutboxAfterEnd` with a `stuck` row → row survives → unit test passes
- [ ] **Dispatch C smoke (Chrome):** Unplug USB mic during recording → banner appears → reconnect (or select internal mic) → recording resumes → audio has no gap at device-switch boundary
- [ ] **Dispatch C smoke (iOS Safari):** Put phone in airplane mode mid-recording → observe RMS banner within 30s → restore connection → banner clears → End session → audio intact
- [ ] All three branches: `npx jest` passes, `tsc --noEmit` passes, `eslint` clean
- [ ] `dft` and `dvc` prefixes in `AGENTS.md` § Conventions + `RECORDER-LIFECYCLE.md` § Cheat Sheet
