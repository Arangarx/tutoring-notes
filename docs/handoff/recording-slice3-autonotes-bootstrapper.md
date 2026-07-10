# Recording P1 Slice 3 — auto-notes + map-reduce — executor briefing

> **Recommended model: Sonnet** (or careful Composer 2.5 only if scope stays tightly bounded). This slice touches **guarded Pillar-3 `handleEndSession`**, concurrent chunk/notes state, and tutor-facing post-session UX — auth-boundary + concurrency + high blast radius per [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol" escalation criteria. A 5-axis adversarial reliability review is **required** before merge (not deferred). If you spawn on Composer, escalate to Sonnet for the review pass.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh chat, your instructions are below — start by reading `AGENTS.md` + the files in the "Read first" section, then proceed through the deliverables in order. No further confirmation needed; begin work.

## Workspace + branch discipline

- **Repo:** `tutoring-notes` (standalone app repo).
- **Base branch:** `v1-redesign` (clean post-transport merge @ `234d05b`).
- **Feature branch:** `feat/recording-p1-slice3-autonotes` (or equivalent descriptive name) off `v1-redesign`.
- **Serial discipline:** one recording slice in flight on the shared tree; do not parallelize with other `handleEndSession` / outbox / lifecycle writers.
- **MCP write-safety:** Neon DDL / Vercel env mutations require Andrew greenlight — state SQL/env changes in chat first.
- **Commit + push** substantive work to `origin`; report Vercel Preview URL + smoke checklist.

## What's already done (do not rebuild)

Transport + transcription pipeline are **live on `v1-redesign`**:

| Layer | SHA | Capability |
|---|---|---|
| Schema | `6abbc30` | `TranscriptChunk`, `TranscriptChunkExtraction`, `TutorNote` tables + `transcript-store.ts` |
| Slice 2a | `359bd16` | `transcribe-chunk.ts`, idempotent worker, queue-consumer route |
| Slice 2b | `758230f` | `enqueueChunkTranscriptionAction` + client fire-and-forget on segment upload |
| Fixes | `93157d5` | Private-blob auth, `gpt-4o-mini-transcribe` `json` format, ffmpeg duration probe |
| Transport | `234d05b` | DB-as-queue (`pending` upsert) + cron sweep `/api/cron/transcribe-sweep` |

**Gates cleared:** Q1 transcript quality PASS (real 2-voice math lesson); sweep validated on deployed preview.

**Intentionally deferred to this slice:** end-session sweep (kick non-`done` chunks at session end).

Chunks are created and transcribed at runtime but **output is not tutor-consumed until this slice**.

## Read first (mandatory order)

1. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — **read completely before editing `handleEndSession`**, outbox, or end-session paths. Three pillars (FSM, outbox, atomic end-session) are sacred.
2. [`docs/handoff/recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md) — D7 (auto-notes), D8 (map-reduce), Phase 1 scope §, Q1–Q8 ratified answers, 5-axis review section.
3. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — current head + known follow-ups.
4. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) — §1.6 cron; Vercel 300s ceiling.
5. Existing implementation: `src/lib/recording/transcription-worker.ts`, `transcribe-chunk.ts`, `enqueueChunkTranscriptionAction`, `transcript-store.ts`, workspace review UI (manual transcribe button location).

## Scope — one shippable unit

Deliver **all four** as a single careful change set:

### (a) End-session sweep

When `handleEndSession` / atomic end-session completes, **kick any non-`done` `TranscriptChunk` rows** for the session (re-enqueue or direct worker invoke) so transcription finishes before or during the notes reduce step.

- Must not wedge session close (outbox + FSM invariants preserved).
- Reuse existing worker idempotency (`pending`→`transcribing`→`done`/`failed`).
- Log prefix: `txc` on every state transition.

### (b) Map phase — incremental extraction

As each chunk reaches `status=done`, run a **cheap per-chunk extraction** (`gpt-4o-mini`) into `TranscriptChunkExtraction` rows (topics, student questions, corrections, follow-ups — see design D8).

- Target: map during session as chunks complete (hidden from tutor).
- Idempotent: re-run safe if extraction already exists for chunk.
- Log prefix: `tnt` for notes pipeline events.

### (c) Reduce phase — session-end synthesis

On session end (after seal + completion gate), synthesize extractions → coherent `TutorNote` via `gpt-4o-mini` (escalate to `gpt-4o` only on quality signal / pilot feedback).

- **Completion gate:** notes only after session sealed AND all produced chunks transcribed — never notes on partial transcript. **5-min timeout** (ratified Q5): then reduce on available + flag `partial` / surface honest UX.
- **Session not sealed guard:** worker checks `WhiteboardSession.endedAt` before reducing.
- Cost events: log via existing `cev` patterns; watch for FK issues (see follow-ups).

### (d) Post-session UX — retire manual button

- **Remove** "Transcribe and generate notes" from review UI.
- **Auto-show** notes section with skeleton/blurred loading until `TutorNote.status = done` (typical ~2–4s; 5-min max before failure/partial UX).
- Keep **"Regenerate notes"** as rare escape hatch (not primary path).
- Recording player + notes together on post-session screen (design D7).

## Ratified design answers (binding)

| Q | Answer |
|---|---|
| Q1 | `gpt-4o-mini-transcribe` primary; whisper-1 fallback |
| Q5 | 5-min skeleton timeout before defeat/partial |
| Q6 | Forward-migrate Sarah data at cutover (not in this slice unless trivial hook) |
| Q7 | `gpt-4o-mini` reduce first; quality-check; escalate if needed |
| Q8 | `txc`/`tnt` prefixes |

Map-reduce is the **target** (D8); single-reduce-at-end is an **accepted fallback** only if map layer cannot ship in timeline — document which path you shipped.

## Known follow-ups — address or consciously defer

| Item | Guidance |
|---|---|
| **`durationMs` null on Vercel** | ffmpeg probe fails in serverless; offsets currently wall-clock approx. Fix in slice 3 if low-cost; else defer with explicit log + STATE update — ties to D3/D4 recording clock later. |
| **Cost-event FK on `whiteboardSessionId`** | Verify `logCostEvent` during worker on real preview session; fix ordering or nullable FK if reproduced. |
| **Cost durability hardening** | [`cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md) §3.2.4 — **out of slice 3 scope** unless trivial additive cols; do not block slice 3 on full build. |
| **Preview cron** | Production cron auto-fires; preview requires manual authenticated sweep — not a slice 3 blocker. |

## Guard warnings (non-negotiable)

- **`handleEndSession` is Pillar 3** — minimal diff; no drive-by refactors; preserve atomic end-session + outbox ordering documented in RECORDER-LIFECYCLE.md.
- **Ownership assertions** on every server mutation (`assertOwnsStudent` / session ownership equivalents).
- **Additive migrations only** — production Neon; never drop/rename without multi-step plan.
- **No plaintext secret egress** to third parties (QR, analytics, etc.).
- **Per-session ID logging:** `wbsid=`, `txc`, `tnt`, `obx` as applicable on every transition.

## Acceptance bar

### Functional

- [ ] New session with 2+ audio segments: notes appear on post-session screen **without manual click**, within 5s typical (skeleton visible, resolves cleanly).
- [ ] End-session sweep kicks straggler chunks; notes wait for completion gate (or 5-min partial path).
- [ ] One chunk transcription failure: retry/isolation; completion gate prevents garbage notes on partial transcript.
- [ ] Manual transcribe button **removed** from primary UI; regenerate escape hatch works.
- [ ] No single Vercel function handles full transcribe+notes sequence (300s cliff avoided).

### Automated (prefer over manual smoke)

- [ ] Unit/integration tests for: completion gate, map idempotency, reduce with mock OpenAI, end-session sweep enqueue, timeout/partial path.
- [ ] Agent-runnable E2E or harness where possible (Andrew 2026-06-07 directive) — exemplar: transcription E2E + cron sweep validation patterns from transport slice.
- [ ] `npx tsc`, eslint, `npm run test:regression` green.
- [ ] If touching build surface: `npx next build` green.

### Reliability (required before merge)

- [ ] **5-axis adversarial review** per [`reliability-bar.mdc`](../../../agenticPipeline/.cursor/rules/reliability-bar.mdc) — fold BLOCKERs into acceptance; dispatch Sonnet if Composer authored the diff.
- [ ] Review axes: data loss, silent failure, recovery, tutor trust, cost/runaway.

## Wrap-up

1. Push branch; report Preview URL.
2. Smoke checklist (automated results + any manual steps Andrew must run).
3. List conscious deferrals (durationMs, cost FK, etc.).
4. Update [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) head when handing back to orchestrator.
5. **Do not merge** — Andrew/orchestrator smoke then `merge --no-ff` to `v1-redesign`.

## Stop conditions

- Any change that weakens atomic end-session or outbox ordering → **stop**, escalate to orchestrator.
- Map-reduce scope explosion (consolidation D6, capture changes D5, playback D9) → **out of scope**; slice 3 is notes + sweep + UX only.
- Neon migration needed → draft SQL, await greenlight before apply.
