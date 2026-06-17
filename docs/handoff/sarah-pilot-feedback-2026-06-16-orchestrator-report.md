---
status: CAPTURE COMPLETE — 2026-06-16 Discord chat (post-session bugs on prod/master)
authored_by: Composer 2.5 subagent dispatch (orchestrator scope blob — capture-only, no production code)
source: Sarah chat (Discord) with Andrew; real session on `master`/prod ("old & busted" build)
---

# Sarah pilot feedback capture — 2026-06-16 (prod session bugs)

> **Source.** Discord chat between Andrew and Sarah (`malmesae`),
> 2026-06-16, immediately after a **real tutoring session** on
> **`master`/production** — the build Sarah is still on today ("old &
> busted" relative to the in-flight `v1-redesign` / Phase 1 line).
>
> **Strategic trigger (Andrew).** Ship the `v1-redesign` / Phase 1
> branch to Sarah to replace `master` once the **waiting room →
> whiteboard → end session** flow is stable for **both tutor and
> student** (P2 + P3). This capture documents three bugs she hit on
> prod that inform the **ship-to-Sarah gate** below.
>
> **Method.** Verbatim-first where Sarah quoted; orchestrator
> investigation verdicts with file:line evidence. Status columns
> compare **prod/`master`** vs branch **`phase1/wb-review-correct`**
> at investigation time (2026-06-16).
>
> **Generalization caveat (n=1).** Same as prior Sarah captures —
> single pilot user; prod-session evidence is real but not
> statistically generalizable.
>
> **Complements**
> [`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md)
> (desktop live session) and
> [`sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md)
> (evening call + iPhone smoke).

---

## 1. Sarah's feedback — three bugs (verbatim + verdict)

### Bug 1 — Notes generation fails ("recording too large")

#### Sarah's words

> Still having problems with generating notes on the computer.

**Screenshot context (Andrew):** review page error — *"This recording is
too large to split automatically — the audio processor couldn't prepare
it for transcription. Try uploading the recording in two shorter parts,
or paste a text summary instead. Ref: 8b4f0cfc"*; buttons **"Generate
notes from session"** / **"Create blank note for this session"**;
`wbsid=ba7832d0` schema v1.

#### What it means

Sarah tried to generate session notes from a whiteboard session review
surface and hit a hard transcription failure. The UI still exposes a
**monolithic** "Generate notes from session" path that can fail when a
single audio buffer exceeds Whisper/ffmpeg split limits.

#### Investigation verdict

| | |
|---|---|
| **Root cause** | Error string in `src/lib/transcribe.ts` ~196–204; trigger = audio buffer **>25 MiB** (`WHISPER_MAX_BYTES`, `src/lib/transcribe-constants.ts`) and ffmpeg split throw / **>240s**. Originates from legacy monolithic `generateNotesFromWhiteboardSessionAction` (`src/app/admin/students/[id]/whiteboard/actions.ts` ~951–1091) plus manual transcribe UIs (`WhiteboardNotesPanel.tsx`, `AiAssistPanel.tsx`). |
| **New path** | Per-chunk auto-notes (`notes-worker.ts`, `transcribe-chunk.ts`) avoids the monolithic error, but a **single >25 MB segment chunk** can still fail → partial notes. Chunk infra landed on current tree; >25 MB ffmpeg path unchanged. |
| **Branch delta** | No phase branch fixes the >25 MB ceiling. |

#### Status

| Surface | Status |
|---------|--------|
| **prod / `master`** | **OPEN** — monolithic button + error path still reachable |
| **`phase1/wb-review-correct`** | **PARTIAL** — per-chunk auto-notes path exists; >25 MB single-segment risk remains; confirm legacy monolithic button removed from new review surface |

---

### Bug 2 — "End session" looked like save but deleted recordings

#### Sarah's words

> Also if I just exit the videos without saving them, [a prompt] popped up
> under where I would go to connect to the white board. It gave me the
> option of continuing or ending. I thought ending would end video and
> save, but it did not. It looks like it just deleted them. Maybe just
> make those options more clear, like save or delete?

#### What it means

Sarah exited A/V without an explicit save, saw a resume/end prompt near
the whiteboard connect affordance, chose **End**, and expected that to
**save** the session recording. Instead the recording was **lost** (no
persisted audio). Copy conflates "end the session" with "save your
work."

#### Investigation verdict

| | |
|---|---|
| **Resume-gate path** | `WorkspaceResumeGate.tsx` ~94–148 — **"End session"** → `endStaleWhiteboardSession` (`actions.ts` ~760–859) only stamps `endedAt`; does **NOT** flush outbox / save audio. |
| **Contrast (correct path)** | Top-bar **End** in `WhiteboardWorkspaceClient.tsx` ~2914–3024 — stops + flushes + drains + `endWhiteboardSession`. |
| **Related backlog** | BACKLOG **F1** "Stop and delete" — Sarah previously asked for explicit discard; this is the **inverse failure**: End **without** save semantics. Not in P2 plan B2/B3. |
| **Branch delta** | Unchanged on both branches at investigation time. |

#### Status

| Surface | Status |
|---------|--------|
| **prod / `master`** | **OPEN** |
| **`phase1/wb-review-correct`** | **OPEN** |

---

### Bug 3 — Replay scrubber not proportional / seek broken

#### Sarah's words

> when playing back the video it isn't very good about allowing you to
> play it back from a certain point the playback bar is not proportional
> to the length of video.

> I pulled the little toggle back to play it from the start and it
> started playing right when it was 11 minutes in; it showed the toggle
> was at the end of the video. However, the video was still playing.
> Which means I wouldn't be able to toggle or remove the video forward
> to see anything after that. I would just have to wait for it to play
> out.

**Andrew note:** was **NOT** a paused-and-resumed session per Sarah.

#### What it means

On session replay, the custom audio scrubber does not map UI position to
wall-clock playback time. Dragging to "start" can jump to a late offset;
the thumb can sit at the end while audio continues; forward seek after
that point is impossible — tutor must wait for natural playback to finish.

#### Investigation verdict

| | |
|---|---|
| **Single-segment fixes (phase branch)** | `8559ae9` — `measuredTotalMs` single-segment fallback in `replay-audio-timeline.ts` ~72–82; `f3a525e` — first-play + drag seek-storm fix for single-segment null-duration on `phase1/wb-review-correct`. |
| **Multi-segment gap** | `measuredTotalMs` fallback applies only when `segments.length === 1`; multi-segment null-`durationSeconds` still collapses; `resolvedMaxMs` grows per played segment. **A6-1** multi-segment boundary deferred. |
| **Legacy player (unfixed)** | Standalone `WhiteboardReplay.tsx` ~696–699 still uses 2-arg mapping; mounted on `[whiteboardSessionId]/page.tsx` ~293–299 — unfixed on phase branch. |
| **v1-redesign / master** | Fixes **not merged** = OPEN on prod. |

#### Status

| Surface | Status |
|---------|--------|
| **prod / `master`** | **OPEN** |
| **`phase1/wb-review-correct`** | **PARTIAL** — single-segment scrub fixes landed; multi-segment + legacy standalone player still broken |

---

## 2. Ship-to-Sarah gate (proposed)

> **PROPOSED — pending Andrew's confirmation.** Conditions Andrew wants
> true before swapping Sarah off `master` onto the `v1-redesign` /
> Phase 1 line.

| # | Gate | Rationale (this capture) |
|---|------|--------------------------|
| **a** | **End never silently deletes** — save-then-end or explicit **Discard** copy that names data loss | Bug 2 — `WorkspaceResumeGate` End path; cross-ref BACKLOG **F1** / **SSG-2** |
| **b** | **Multi-segment replay mapping correct** + Sarah lands on the **fixed in-frame review surface**; legacy standalone `WhiteboardReplay` retired or not reachable | Bug 3 — A6-1 + legacy player; cross-ref Gate **A6** / **SSG-3** |
| **c** | Confirm legacy monolithic **"Generate notes from session"** button is **gone** from the new surface; **per-chunk auto-notes** is the path; residual **>25 MB-per-segment** risk documented / hardened where feasible | Bug 1 — cross-ref **SSG-1** |
| **d** | **Waiting room → WB → end session** stable **both sides** (tutor + student) | P2 + P3 — prerequisite Andrew stated for the cut; not re-derived here |

---

## 3. Backlog cross-links

| Item | BACKLOG / gate reference |
|------|--------------------------|
| Bug 1 notes / >25 MB | **SSG-1** (new); `## Recording — long sessions, Whisper limits` |
| Bug 2 End / save-delete | **F1** (existing) — **elevated** ship-to-Sarah via **SSG-2** |
| Bug 3 replay scrubber | Gate **A6**; **A6-1** in [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — **SSG-3** |
| Strategic cut | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) pre-master gates; P2 + P3 waiting-room / end-session stability |

---

## 4. Open follow-ups

| Item | Status |
|------|--------|
| Andrew confirms ship-to-Sarah gate (§2) | **PENDING** |
| Sarah on `phase1` preview after gate passes | **BLOCKED** on §2 |
| Re-smoke Bugs 1–3 on branch preview after fixes | **QUEUED** |

---

## Changelog

- **2026-06-16:** Initial capture — three prod bugs from Discord;
  investigation verdicts; proposed ship-to-Sarah gate; BACKLOG
  cross-links (**SSG-1** / **SSG-2** / **SSG-3**).
