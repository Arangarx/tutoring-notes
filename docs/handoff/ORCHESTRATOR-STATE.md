# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-07-01 CF-2 review found HIGH clock-desync in LIVE audio modes → CF-2.1 mode-aware wbSignal fix in flight (base @ 3c326d9)

> **Active branch:** [`wb-wave5-polish`](https://github.com/Arangarx/tutoring-notes/tree/wb-wave5-polish) @ [`3c326d9`](https://github.com/Arangarx/tutoring-notes/commit/3c326d9) (+ state-doc commit on top). **Worktree:** `tutoring-notes-polishwt` (default `tutoring-notes` checkout is on `v1-redesign` — NOT current). **All remaining Sarah-gate work lands here; single `merge --no-ff` to `v1-redesign` at the FINAL full-arc gate only (no interim merge — Andrew reaffirmed 2026-07-01).** Integration base remains **`v1-redesign` @ [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc)**.
>
> **2026-07-01 — pre-merge smoke verdict: NOT PASS.** Andrew ran smoke against tip `8e38935` (code through [`e66c177`](https://github.com/Arangarx/tutoring-notes/commit/e66c177)). Annotations captured [`f85af03`](https://github.com/Arangarx/tutoring-notes/commit/f85af03)..[`e47f41a`](https://github.com/Arangarx/tutoring-notes/commit/e47f41a); triage [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md). **Six merge-blockers** (MB-1..MB-6). Andrew ratified **safe-then-merge** + **reversible tombstone** (Option A). **5-axis reliability review COMPLETE** — 9 BLOCKERs + Option A folded into [`consent-honesty-safe-erasure-plan.md`](consent-honesty-safe-erasure-plan.md). Consent fixes **CF-1** ([`183f09b`](https://github.com/Arangarx/tutoring-notes/commit/183f09b)) + **CF-3** ([`7a9514f`](https://github.com/Arangarx/tutoring-notes/commit/7a9514f)) shipped.
>
> **Execution order (single consistent sequence — no interim merge):** (1) consent/erasure **9 BLOCKERs** + remaining **CF-2** / **CF-4**; (2) **checkpoint re-smoke** (NOT a merge trigger); (3) **Part 3 reliability spine on the SAME branch** `wb-wave5-polish` (fresh chat OK); (4) **full live-session arc both-themes hardware smoke** (FINAL Sarah gate); (5) **`merge --no-ff wb-wave5-polish → v1-redesign`**. Consent/erasure + erasure work stays unmerged until step 5. **POST-SARAH-PRE-RELEASE backlog** (out of mini-phase scope): C-1 replay Play/Pause overlaps Board tab; C-2 student mic-boost parity — see findings §C.

| Field | Value |
|---|---|
| **Last action completed** | **CF-2 5-axis review DONE — HIGH regression confirmed** in commit [`853bba4`](https://github.com/Arangarx/tutoring-notes/commit/853bba4): repointing `getAudioMs=useAudioMsClock(wbEventsActive)` for ALL modes desyncs stroke↔audio replay in LIVE audio-recording modes — on FSM auto-pause (participant disconnect) the audio MediaRecorder pauses but `wbEventsActive` stays true, so the clock advances & strokes get `t` ahead of the (paused) audio track (late strokes fall past audio end). IN_PERSON fix itself is correct. **Prescribed fix (dispatched CF-2.1):** mode-aware `wbSignal = audioCapturePolicy !== "none" ? recordingActive : wbEventsActive` threaded through the 3 call sites (clock, recorder `recordingActive` prop, viewport-anchor dep) — additive, no engine edits. Clock alignment itself = hardware/real-browser smoke item (jsdom can't catch). — — — **Prior:** CF-2/MB-4 @ `853bba4` + CF-4/MB-5 @ [`3c326d9`](https://github.com/Arangarx/tutoring-notes/commit/3c326d9) shipped (`triggerNotesGenerationAction` returns `{ok,error?}` + surfaces failure; tutor_only→TutorNote test); Erasure FEATURE COMPLETE (Step 5/6 @ [`51e5bfd`](https://github.com/Arangarx/tutoring-notes/commit/51e5bfd) + backend A–I). |
| **Next action(s)** | **CF-2.1 fix (in flight)** — apply mode-aware `wbSignal = audioCapturePolicy !== "none" ? recordingActive : wbEventsActive` at the 3 call sites in `WhiteboardWorkspaceClient.tsx` (~2359 add intermediate, ~2549 clock, ~2872 recorder prop, ~2918/2943 viewport-anchor); keep the 2 CF-2 jsdom tests + ADD a deterministic clock-SOURCE-selection test (policy!=none → recorder tracks `recordingActive`/pauses; policy=none → tracks `wbEventsActive`). Green gate local-DB jest + `next build`. → **re-confirm MB-1/CF-1** (Start regression) → **Workstream C** Playwright e2e (consent CC-1/CC-2 + erasure cancel-restore/access-suspension) → **checkpoint re-smoke (NO merge)** — smokebook hardware item: **LIVE participant-disconnect→resume, verify strokes replay ALIGNED with audio** (jsdom-blind) + IN_PERSON replay; **run `npm run test:wb-sync` at merge boundary** (WhiteboardWorkspaceClient is a wb-surface) → **Part 3** spine → **full-arc both-themes hardware smoke** → single `merge --no-ff → v1-redesign`. **All DB-test runs override `DATABASE_URL`/`DIRECT_URL` to local `tutoring_notes_test` (never Neon).** |
| **Open Andrew-confirms** | **NEW — erasure UX defaults surfaced 2026-07-01 (proceeding on defaults unless Andrew redirects; all additive to change later):** (1) **Cancel is operator-only** (Admin→Erasure) — tutors see pending/suspended state + "contact operator", no tutor cancel button (no ADMIN role); (2) **no parent self-service deletion UI** — erasure is operator-mediated only, ER-6 "parent" copy became operator guidance; (3) post-purge roster badge reads "Deleted"; (4) suspended student-detail Start CTA → status text. **Resolved (2026-07-01):** remaining execution (Part 3 + erasure wave) runs in a **fresh chat on the same branch** `wb-wave5-polish`; Sarah merge gate = full live-session arc 100% reliable, then **single merge — no interim merge**. **Resolved (2026-07-01):** first-pass notes **quality** is a real Part 3 pre-merge acceptance bar (strong map/reduce leveraging per-speaker labeled transcripts + model abstraction); **only** the eval harness + flywheel iteration loop is deferred post-master. **Standing (unchanged):** debounced-disconnect pause trigger (confirm at `p3-clock`); **WB-LABEL-PARENT-SIGNIN**; **Sarah primary device** ([`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)); **Ship-to-Sarah gate**; **iOS student WB/A/V** ([`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION**). |
| **In-flight subagents** | **1 (Composer):** CF-2.1 mode-aware `wbSignal` fix. CF-2 5-axis review DONE (HIGH desync confirmed, fix prescribed). |
| **Uncommitted / unmerged** | **`wb-wave5-polish` @ [`3c326d9`](https://github.com/Arangarx/tutoring-notes/commit/3c326d9)** (pushed; state-doc commit on top) — **NOT merged** to `v1-redesign`; single merge only after full-arc both-themes hardware smoke (FINAL gate). Migration `20260701120000_learner_credential_disabled` applied to **preview-dev**; **production apply still Andrew-gated** (not needed until master cut). **`v1-redesign` @ `7397abc`** unchanged. **⚠️ THROWAWAY UNTRACKED COPIES in main `tutoring-notes` (v1-redesign) working tree:** `docs/handoff/{consent-honesty-premerge-smoke-index, wb-block-b-consent-gate-smokebook-2026-06-30, cc1-cc2-consent-gate-smokebook, erasure-smokebook}.md` — delete before merge. Tracked authoritative copies on `wb-wave5-polish`. |

**Strategic posture (unchanged):** Experience-driven wedge — WB + reliability = **ground floor (GATE)**; the win = accreting honest tutor-first continuity. [`experience-driven_wedge_ae2776e1.plan.md`](../../../../.cursor/plans/experience-driven_wedge_ae2776e1.plan.md). **Ship-to-Sarah gate** still governs cut to `v1-redesign → master` — see condensed block below.

**Process directives (standing):** preview links in **pairs** (Vercel MCP `branchAlias` + `https://preview.usemynk.com` when repointed); agent-runnable validation harnesses over manual smoke where possible; Opus-default for this reliability effort, Composer 2.5 only for zero-doubt mechanical tasks per active plan.

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Current program:** Complete the **live-session arc** (auth join → waiting room → live A/V whiteboard → end → per-speaker capture → transcription → review) as one reliable unit on `wb-wave5-polish`, then **single merge** to `v1-redesign` (the Sarah merge).

---

## Branch layering

```
master  ←  v1-redesign  (integration base @ 7397abc; Wave 4 merged; held for Sarah gate + master cut)
              ↑
              └── wb-wave5-polish @ 05a4b79  (ALL remaining work; worktree tutoring-notes-polishwt; NO interim merge)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; Wave 4 student responsive parity merged @ [`a166f6c`](https://github.com/Arangarx/tutoring-notes/commit/a166f6c); subsequent doc commits through [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc) | Not yet merged to `master` — held for Gate A + Ship-to-Sarah + comprehensive re-smoke |
| **`wb-wave5-polish`** | **Active execution branch** — Wave 5 chrome/polish + reliability floor (Parts 1–3 of active plan); worktree `tutoring-notes-polishwt` | [`05a4b79`](https://github.com/Arangarx/tutoring-notes/commit/05a4b79) |

**Merge discipline (ratified):** All remaining work stays on `wb-wave5-polish`. **Single `merge --no-ff` to `v1-redesign`** at the final Sarah gate only. No interim merge.

Decisions ledger: [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

---

## Current Wave focus

**Active plan:** [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md) — supersedes archived [`whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md).

**Done on branch (Parts 0, 1A mostly, 2A, 2B mostly):** guardrails, A/V bug fixes (enumerate-mutex, audio-reneg), waiting-room overlay, auth-join, lifecycle/consent unconditional enforcement, phantom-stroke fix, per-speaker investigation.

**Remaining (execution order):**

```mermaid
flowchart TD
  CE["⬜ Consent/erasure: 9 BLOCKERs + CF-2/CF-4"]
  CP["⬜ Checkpoint re-smoke — NO merge"]
  P3["⬜ Part 3 spine (same branch)"]
  GATE["FINAL Sarah gate: full arc both themes"]
  MERGE["single merge --no-ff → v1-redesign"]
  CE --> CP --> P3 --> GATE --> MERGE
```

| Phase | Key todos | Notes |
|---|---|---|
| **Consent-honesty + erasure (first)** | 9 BLOCKERs + CF-2 + CF-4 + Workstreams B/C/D | Block B + CC-1 + CC-2 shipped; erasure execution in flight. **Checkpoint re-smoke is NOT a merge trigger.** |
| **Checkpoint** | Workstream D re-smoke + build/jest gates | **NO merge** — quality gate before Part 3 execution |
| **Part 3 spine** | `p3-clock` → `p3-perspeaker-capture` → `p3-vad-chunking` → `p3-consent-recording` → `p3-incremental-map` → `p3-model-abstraction` → `p3-finalize` → `p3-replay-scrub` → `p3-video-seam` | **APPROVED (Andrew 2026-06-30)**; same branch `wb-wave5-polish`; fresh chat OK; tap-before-mix; disconnect pause/freeze in `p3-clock`. **Acceptance (Andrew 2026-07-01):** first-pass notes **quality** is pre-merge — strong map/reduce on labeled transcripts + model abstraction; eval harness + flywheel only post-master |
| **Final gate** | Full live-session arc both themes; `p-test-account-reset` | Auth join → waiting room → live A/V WB → end → per-speaker capture → transcription → map/reduce notes → review; then **single merge** |

---

## Session-experience build status (2026-07-01)

So future chats do not treat shipped schema/pipeline as unbuilt or lost:

| Layer | Status |
|---|---|
| **Schema (BUILT)** | `TranscriptChunk`, `TranscriptChunkExtraction`, `SessionRecording.streamId` in `prisma/schema.prisma` — chunked audio + per-chunk transcription + map-extraction + video-ready `streamId` |
| **Partial pipeline (SHIPPED on branch)** | 50-min time-based segments; per-segment transcribe + incremental map; `SkeletonNotes` shimmer UI in `TutorNotesSection.tsx` |
| **Part 3 (UNBUILT)** | VAD per-speaker continuous capture; model abstraction; **first-pass high-quality map/reduce** (labeled transcripts + strong initial prompt — Sarah bar: genuinely good notes, not "exists, needs editing"). **Deferred post-master:** eval harness + flywheel iteration toward near-100% |
| **Spike branch (unmerged, flag OFF)** | [`spike/live-transcription` @ `7671a25`](https://github.com/Arangarx/tutoring-notes/tree/spike/live-transcription) — live transcription experiment; not lost, not Sarah-path |

**Standing erasure coverage gaps** (also in [`BACKLOG.md`](../BACKLOG.md)): (a) **ERASURE-ORPHAN-AUDIO-BLOBS** — audio uploaded to Vercel Blob whose `TranscriptChunk` enqueue failed is not walked by erasure inventory; (b) **ERASURE-CLIENT-STORE-UNREACHABLE** — recording-draft / upload-outbox / whiteboard-checkpoint IndexedDB + sessionStorage scene drafts unreachable by server-side erasure — document limitation or add client-purge-on-erasure signal.

---

## Latest committed state (`wb-wave5-polish` @ `05a4b79`)

| Commit | Summary |
|---|---|
| [`8c9f68b`](https://github.com/Arangarx/tutoring-notes/commit/8c9f68b) | **Branch tip** — chore(repo): untrack accidentally-committed props-flyout debug screenshot |
| [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882) | fix(tests): upsert ConsentRecord in allowLiveSession denial test (relay harness fix) |
| [`c70e191`](https://github.com/Arangarx/tutoring-notes/commit/c70e191) | Quarantine 2nd-session AV-tile presence test as pre-existing flake |
| [`f0a2b72`](https://github.com/Arangarx/tutoring-notes/commit/f0a2b72) | Phantom-stroke: extend degenerate filter to live-sync broadcast path |
| [`29d9fe9`](https://github.com/Arangarx/tutoring-notes/commit/29d9fe9) | Merge phantom fix (adapter + action-sheet backdrop) |
| [`5acfb10`](https://github.com/Arangarx/tutoring-notes/commit/5acfb10) | Unconditional consent — remove `CONSENT_ENFORCEMENT` flag |
| [`2faecd8`](https://github.com/Arangarx/tutoring-notes/commit/2faecd8) | Remove per-session tutor attestation modal |
| [`63719b4`](https://github.com/Arangarx/tutoring-notes/commit/63719b4) | `allowNoteSending` gate on auto notes trigger |
| [`ab60bf5`](https://github.com/Arangarx/tutoring-notes/commit/ab60bf5) | `sessionPhase=ACTIVE` server guards |
| [`274f21a`](https://github.com/Arangarx/tutoring-notes/commit/274f21a) | `allowLiveSession=false` blocks learner join |
| [`c8265b1`](https://github.com/Arangarx/tutoring-notes/commit/c8265b1) | Phantom-stroke: drop degenerate line/arrow in `toCanonical` |
| [`3429b94`](https://github.com/Arangarx/tutoring-notes/commit/3429b94) | Merge liveboard-chrome student parity + tutor mic-meter fix |
| [`652ab46`](https://github.com/Arangarx/tutoring-notes/commit/652ab46) | Merge waiting-polish quick-wins + join-timer fixes |

Full history: `git log --oneline -25 wb-wave5-polish`.

**Smokebooks (recent):** [`wb-wave5-consent-perms-2026-06-30.md`](wb-wave5-consent-perms-2026-06-30.md), [`wb-wave5-liveboard-chrome-smokebook-2026-06-29.md`](wb-wave5-liveboard-chrome-smokebook-2026-06-29.md), [`wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md`](wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md).

---

## Queued dispatches (in order)

1. **Consent/erasure completion** — 9 BLOCKERs + CF-2 + CF-4; erasure Workstreams B/C; Playwright e2e (Workstream C).
2. **Checkpoint re-smoke** — build + jest + consent/erasure smoke (**NO merge**).
3. **Part 3 spine** — on **same branch** `wb-wave5-polish` (fresh chat OK): `p3-clock` (incl. disconnect pause/freeze) → per-speaker capture through replay-scrub; video seam design-only.
4. **`p-final-gate`** — **full live-session arc** both themes hardware smoke (FINAL Sarah gate).
5. **`merge --no-ff` `wb-wave5-polish` → `v1-redesign`** — after step 4 PASS; `test:wb-sync` on final tip immediately before merge.
6. **`p-test-account-reset`** — at master cut, preserve Andrew + Sarah admin accounts.

---

## Ship-to-Sarah gate (CONFIRMED by Andrew 2026-06-16 — still governing)

Andrew wants Sarah on the `v1-redesign` line once **waiting room → WB → end session is stable for tutor AND student — backend data pipeline INCLUDED**. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** (1) notes — legacy monolithic generate path gone; per-chunk auto-notes only; (2) End/Continue on student-detail open-sessions never silently deletes recording; (3) single-segment seek works at every review entry point. Multi-segment seek → backlog SSG-3 only. **(4) Consent UI honesty — `CONSENT-HONESTY-SARAH-MERGE-BLOCKER` (NEW, Andrew 2026-06-30):** minimal honesty fix ships **with** the Sarah merge — hide dead `allowWhiteboardRecording` toggle; rewrite `allowLiveSession` copy to honestly cover live A/V **and** whiteboard capture (see **LIVE-SESSION-CONSENT-COPY**); sweep consent UI for any other shown-but-unenforced toggles. Fuller guided-setup / affordance pass (**CONSENT-UX-REDESIGN**) is fast-follow, **not** a blocker. Rationale: Sarah merge = first no-going-back moment with real families; we do not ship dishonest consent UI. Cross-ref: [`BACKLOG.md`](../BACKLOG.md) **CONSENT-HONESTY-SARAH-MERGE-BLOCKER**.

**Pre-master smoke deferral ledger:** [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

---

## Open decisions — Andrew confirms

### Live gate (Part 3)

| # | Question | Status |
|---|---|---|
| **Part 3 design pass** | Overall Part 3 architecture/sequencing — review and approve before any p3-* execution | **✅ APPROVED (Andrew 2026-06-30)** — p3-* execution unblocked on same branch |
| **Notes quality vs merge scope** | Is first-pass map/reduce quality a pre-merge bar, or deferred? | **✅ RESOLVED (Andrew 2026-07-01)** — first-pass notes **quality** is Part 3 pre-merge acceptance; **only** eval harness + flywheel iteration deferred post-master |

Ratified **inputs**: t=0 = FSM `recording` entry / `MediaRecorder.start()` + WB↔audio hardware sync oracle; 3+-peer per-speaker ≤3–4 cap NO mixdown fallback; first-pass notes quality pre-merge (labeled transcripts + map/reduce); eval harness + flywheel post-master only; session-scoped consent override won't build for Sarah (`WB-SESSION-CONSENT-OVERRIDE`).

### Standing (from prior threads)

| Item | Notes |
|---|---|
| **WB-ADULT-JOIN-ENABLEMENT B1** | Thread B product confirm |
| **WB-LABEL-PARENT-SIGNIN** | New term confirm |
| **Sarah primary device** | Assumed Windows desktop Chromium |
| **iOS student WB/A/V** | Zero coverage — [`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION** |
| **B2 consent Step 6** | Parent per-tutor consent management UI — deferred past V1 |

---

## Recent architectural decisions (2026-06-30)

| Decision | Status |
|---|---|
| **CC-1 + CC-2 API EXECUTED (2026-06-30)** | ✅ commits [`35147ef`](https://github.com/Arangarx/tutoring-notes/commit/35147ef)→[`5d6d196`](https://github.com/Arangarx/tutoring-notes/commit/5d6d196). B2 create-time live-reject removed (ratified all-off-passes). Held: CC-2 parent UI copy + Block B 5b copy. |
| **Block B EXECUTED (2026-06-30)** | ✅ 7 commits `d180ef1`→`bded52e`, verified 13 suites/146 tests. Held: 5b parent copy (Andrew sign-off), 3b mixdown hardware verify. |
| **5-axis adversarial review (consent-honesty blocker)** | ✅ **COMPLETE (2026-06-30)** — Sonnet review: 8 BLOCKER / 6 HIGH / 6 MEDIUM / 5 LOW; architecture validated, no rework; findings folded into Phase-1 acceptance addenda on all three plans. Review: [`consent-blocker-5axis-review-2026-06-30.md`](consent-blocker-5axis-review-2026-06-30.md). |
| **Consent enforcement unconditional** | ✅ `CONSENT_ENFORCEMENT` deleted; always-on |
| **Per-speaker tap-before-mix** | ✅ Design-around ratified — transcription lanes only; mixdown = sole replay source; merge by `recordingTimeOffsetMs` never `createdAt` |
| **Reverses prior rollback [`89e0fe1`](https://github.com/Arangarx/tutoring-notes/commit/89e0fe1)** | ✅ With sync-metadata contract — document in LIVE-AV.md invariant #6 during `p3-perspeaker-capture` |
| **No interim merge** | ✅ All work on `wb-wave5-polish`; single merge at Sarah gate |
| **t=0 clock anchor** | ✅ **RATIFIED (2026-06-30)** — FSM `recording` / `MediaRecorder.start()`; WB↔audio hardware sync oracle in `p3-clock`; disconnect pause/freeze acceptance folded in. |
| **Part 3 design-pass gate** | ✅ **APPROVED (Andrew 2026-06-30)** — Block B + Block C (C1–C5) ratified; p3-* execution unblocked. |
| **CLIENT-AUDIO-CONSENT-GATE (Block B)** | ✅ **RATIFIED Sarah-merge BLOCKER (2026-06-30)** — client consent projection: load `SessionConsentSnapshot` into workspace; gate capture/upload/IDB/transcription end-to-end. In-person: student audio off = no session audio; remote: keep tutor, drop student from mixdown + transcription; live hearing never gated. Honest tutor indicator. Build once for `p3-consent-recording`. Cross-ref Block A: **LIVE-SESSION-CONSENT-COPY**, **CONSENT-HONESTY-SARAH-MERGE-BLOCKER**. Impl plan: [`wb-block-b-consent-gate-plan.md`](wb-block-b-consent-gate-plan.md) @ `843ba19`. |
| **7a fail-closed-universal (no snapshot)** | ✅ **RATIFIED (Andrew 2026-06-30)** — when no `SessionConsentSnapshot` / no `ConsentRecord` (any cause), audio is **not** captured/uploaded/persisted/transcribed ("no consent record = assume no consent"). No minor-vs-adult classification at capture time; self-learners get all-`true` snapshot via `isSelfLearner`. Whiteboard unconditional; live session **not** gated by 7a. Tutor gets unmistakable "no consent on file → recording & notes off" affordance (Block B blocker scope). |
| **CC-1 — ConsentRecord-exists gate (learner,tutor)** | ✅ **RATIFIED Sarah-merge BLOCKER (Andrew 2026-06-30, fork session)** — session gate criterion = **ConsentRecord exists for (learner,tutor)**; subsumes claimed-only and closes claim-finalized-before-consent bail window. Tutor cannot start/create a session without consent on file. Closes hole (3) unclaimed tutor-created Student + hole (2) parent-create-no-consent paths lacking a record. [`BACKLOG.md`](../BACKLOG.md) `CONSENT-COLLECTION-COMPLETENESS`. |
| **CC-2 — mandatory consent choice to exit claim setup** | ✅ **RATIFIED Sarah-merge BLOCKER (Andrew 2026-06-30, fork session)** — **mandatory consent choice to exit claim setup**: Save OR explicit decline; decline writes ALL-OFF `ConsentRecord`; **no restructure** of the claim-completion transaction. Closes hole (1) claim-complete-without-consent. Warning copy when claim leads to active session invite (DRAFT — Andrew approval pending). Claim flow: `app/claim/[token]/setup` + complete route. |
| **Self-learner parental-consent exemption** | ✅ **RATIFIED (Andrew 2026-06-30, fork session)** — self-learners (emancipated-adult / self-manage carve-out) **EXEMPT** from the mandatory parental-consent gate; all-true snapshot via `isSelfLearner` unchanged. |
| **Data erasure path (pre-Sarah)** | ✅ **RATIFIED (Andrew 2026-06-30, fork session)** — learner/family-level erasure ships **pre-Sarah**. **Option A + headless-preserve:** destroy PII **content** (notes, transcripts, tutor notes, recordings) + ALL blobs; redact identity (`AccountHolder`/`LearnerProfile` tombstone, scrub `Student.name`/`parentEmail`); **PRESERVE** headless de-identified business/legal/audit rows (`WhiteboardSession` billing fields, `CostEvent`, `ConsentRecord`, `SessionConsentSnapshot`, claim/impersonation audit) — still queryable as a "redacted learner" bucket for future cost-vs-billed tooling. Principle: follow the law completely, delete no more than compliant. Impl plan: [`learner-erasure-plan.md`](learner-erasure-plan.md) @ `1eb5c45` (resumable `ErasureJob` state machine, tombstone-first fail-closed, `ers` log prefix, 8-commit sequencing E1–E8). |
| **Consent-honesty impl plans (Block B + CC-1/CC-2 + erasure)** | ✅ **AUTHORED + COMMITTED (2026-06-30)** — all three pre-Sarah consent-honesty plans on `wb-wave5-polish`: Block B audio capture gate [`wb-block-b-consent-gate-plan.md`](wb-block-b-consent-gate-plan.md) @ `843ba19`; CC-1/CC-2 [`cc1-cc2-consent-gate-plan.md`](cc1-cc2-consent-gate-plan.md) @ `ccbedd3`; learner erasure [`learner-erasure-plan.md`](learner-erasure-plan.md) @ `1eb5c45`. Sonnet 5-axis adversarial review in flight before execute. |
| **Live-minor-join gating** | ✅ **RESOLVED (auto, 2026-06-30)** — CC-1 + CC-2 ensure snapshot always exists post-claim; existing join gate (`join/[sessionId]/page.tsx`) enforces `allowLiveSession` (all-off → denied). No separate live-gating mechanism needed. |
| **Consent-collection reachability (investigation)** | ✅ **Superseded by CC-1 + CC-2 ratification (2026-06-30)** — three paths to no-record session documented in reachability finding; holes (1)+(3) closed by CC-2/CC-1; hole (2) parent-create-no-consent **RESOLVED (Andrew 2026-06-30)** — pilot path covered by CC-2; B2 Step 6 not in blocker. [`BACKLOG.md`](../BACKLOG.md) `CONSENT-COLLECTION-COMPLETENESS`. |
| **B2 Step 6 / parent-initiated tutor scope** | ✅ **RESOLVED (Andrew 2026-06-30)** — B2 Step 6 (standalone parent per-tutor consent editor) NOT in blocker — CC-2 claim-screen choice covers pilot path; parent-initiated tutor assignment is a future feature (**PARENT-INITIATED-TUTOR-REQUEST**). Hard rule: never assume consent for non-emancipated minor; no consent bypass without explicit self-manage (adult/emancipated) account declaration. |
| **Part 3 C1–C5 (Block C)** | ✅ **APPROVED (Andrew 2026-06-30)** — C1: transcription-only per-speaker lanes, mixdown replay, merge by `recordingTimeOffsetMs`; C2: VAD live chunking replaces 50-min rollover; C3: ffmpeg single continuous replay at End; C4: build order locked; C5: video designed-for, not built for Sarah. |
| **Disconnect/pause requirement** | ✅ **RATIFIED (2026-06-30)** — on student disconnect: audio pauses + clock freezes; WB continues at frozen timestamp; reconnect resumes. Gap strokes collapse to pause instant (accepted). Trigger: debounced stable disconnect ~6s (`PEER_EVICTION_TIMEOUT_MS`) — **final confirm at p3-clock execution**. |
| **WB disconnect behavior FINAL** | ✅ Keep-as-is (WB usable during disconnect; strokes cluster at pause instant); disable-WB + gap-marker considered & deferred (`WB-DISCONNECT-GAMIFICATION-DEFERRED`) — revisit only if gaming becomes a problem |
| **WB-MENU-CLICK-THROUGH** | Deferred post-Sarah → [`BACKLOG.md`](../BACKLOG.md) |
| **Test data reset at master cut** | Preserve Andrew + Sarah admin; reset disposable learners (`p-test-account-reset`) |
| **WB-CONSENT-UNCONDITIONAL** | ✅ **RATIFIED (2026-06-30)** — whiteboard recording is **unconditional** for Sarah merge (not separately gated). `allowWhiteboardRecording` toggle **hidden** from consent UI (mirrors `WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME`); Prisma + `SessionConsentSnapshot` fields **retained** (no migration). WB capture covered by `allowLiveSession` consent + privacy policy/ToS. Re-introducing real enforcement later is additive (D-1 access-gate, already mapped) pending legal consult. Resolves D-1 vs D-2 fork for Sarah: unconditional capture, honest copy = legal cover. |
| **LIVE-SESSION-CONSENT-COPY** | ✅ **RATIFIED (2026-06-30)** — `allowLiveSession` toggle copy MUST honestly state BOTH (a) student seen/heard live AND (b) whiteboard is recorded. Clear+honest copy = "fairly covered" pending counsel; anti-dark-pattern guarantee. Literal final copy string drafted for Andrew approval — never auto-shipped. |
| **CONSENT-DEFAULTS-OPT-IN** | ✅ **RATIFIED (2026-06-30)** — consent toggle defaults stay **OFF** / affirmative opt-in. Child-related consent must be affirmative (GDPR pre-ticked invalid; COPPA affirmative parental consent — confirm specifics with counsel). Opt-out defaults violate founding no-dark-patterns principle. Andrew "default-on?" question = **NO**. |
| **CONSENT-PRESENTATION-NO-TRICKS** | ✅ **RATIFIED direction (2026-06-30)** — fix low activation via **presentation**, not defaults: OFF-but-recommended toggles feel unfinished/attention state; value-first microcopy; guided-setup + completion indicator; distinguish required-for-feature (live session) from recommended (audio→notes). Must not go even one step toward anything construable as a "trick." Execution = fast-follow **CONSENT-UX-REDESIGN**, not Sarah blocker. |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** | ✅ **RATIFIED (2026-06-30)** — consent UI honesty is a **Sarah-merge blocker** (not fast-follow). **Minimal honesty fix** ships with merge: hide dead `allowWhiteboardRecording` toggle; rewrite `allowLiveSession` copy; sweep for other shown-but-unenforced toggles. **CONSENT-UX-REDESIGN** (full presentation pass) = fast-follow only. |
| **CONSENT-LEGAL-CONSULT** | Backlog — when affordable: validate with counsel (a) live-session consent + privacy policy sufficiency for minor WB capture, (b) whether minor WB needs own affirmative gate, (c) child-consent opt-in requirements, **(d) transcription of minor audio**. [`BACKLOG.md`](../BACKLOG.md). |
| **WB-SELECTIVE-REDACTION** | Backlog — **FUTURE, explicitly NOT pilot**: possible redaction of personal artifacts (homework PDFs/images) from WB capture while keeping strokes; content-classification + legal problem. Pilot = all-or-nothing unconditional WB. [`BACKLOG.md`](../BACKLOG.md). |

Full locked decisions: active plan § "Resolved (Andrew)".

---

## Hard-won lessons (durable)

### New (2026-06-30)

**lesson-codified-hack — tutor/student waiting-room mic delta mis-scoped twice:** First codified a chip-hack; then flattened tutor's full `MicControls` dropdown to match student's stripped control. **Tell:** student/tutor asymmetry. Echoes "branch decisions ≠ ratified intent" + "confirm material UX deltas explicitly."

**lesson-deferred-relay — relay specs authored with suite run DEFERRED had harness bugs jest couldn't catch:** Both phantom-stroke spec (wrong URL/auth + naive absence oracle) and consent-denial spec (`consentRecord.create()` unique-constraint) failed only at integration relay. **NEW RULE:** new wb-regression specs should get **≥1 targeted relay run** before declaring done, even when full suite run is deferred.

**data-reset-at-master-cut:** At `v1-redesign → master` cut, reset test data but **preserve Andrew + Sarah admin accounts**; re-confirm with Sarah then. Concrete todo: `p-test-account-reset`.

**no-interim-merge:** Ratified — single `merge --no-ff` at final Sarah gate only.

### Still load-bearing (do not forget)

**Plans ≠ ratified intent (2026-06-17):** Material product/UX decisions must be surfaced to Andrew explicitly — silence is not consent.

**Missed prompt ≠ consent (2026-06-17):** Re-surface material decisions; never infer from inaction.

**Subagent git safety (2026-06-10):** Never `git restore`/`reset --hard` to unblock checkout when uncommitted user work exists.

**Whiteboard chrome — extend don't rewrite (2026-06-09):** ADDITIVE ONLY on `WhiteboardWorkspaceClient.tsx` engine paths.

**Layout/coordinates — jsdom blind spot (2026-05-30):** Prove geometry on real browser; requirement-not-code tests.

**Flag-gated feature + test-injected flag = synthetic green (2026-06-17):** Green on flagged test path ≠ production default wired.

**Tombstone resurrection (2026-06-18):** Reconcile baseline must use `getSceneElementsIncludingDeleted()`.

**MediaStream id blocks video remount (2026-06-18):** Fresh `MediaStream` on reconnect.

**Mobile backgrounding ≠ full mesh rebuild (2026-06-18):** Deliberate leave vs transient suspend.

**Doc-heavy merges → add/add conflicts (2026-06-18):** Union-merge; preserve Andrew's smoke notes.

**RSC cookie-write no-op (2026-06-14):** Never write cookies from RSC render.

**CSS `@layer` cascade (2026-06-12):** Legacy unlayered base CSS beats Tailwind utilities.

**Secret egress (2026-05-31):** No plaintext secrets to third-party URLs (2FA QR lesson).

---

## Pilot context (Sarah)

Latest capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md). Call prep: [`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md).

Sarah remains on production `master` ("old & busted") until Ship-to-Sarah gate passes on merged `v1-redesign` line.

---

## Parked threads (after Sarah merge)

| Thread | Notes |
|---|---|
| **Experience-driven wedge Phases 2–4** | Continuity engine, note quality, instrumentation — post this merge |
| **WB-COMPONENTS-PASS** | Full shadcn migration — incremental on touched surfaces only for now |
| **VIDEO recording capture** | Design seam in Part 3; build post-Sarah |
| **WB-MENU-CLICK-THROUGH** | Desktop popover click-through |
| **iOS per-speaker MediaRecorder** | Documented untested for Sarah merge |
| **`docs/phase3-consent-model` @ `4f9dbcd`** | Awaits union-merge to `v1-redesign` (conflict risk on handoff docs) |
| **A6-1 multi-segment replay** | Obviated by continuous-stream finalization in Part 3; legacy path neutralized not deleted |

---

## Housekeeping (pending — do not act until merge confirmed)

Worktree cleanup after integration merged: `tutoring-notes-polishwt`, `fixwt`, `liveboardwt` (+ consent/phantom satellite worktrees). See `git worktree list`.

---

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol"
- **Dispatch boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff`; WB sync → `npm run test:wb-sync` at merge boundary; build-surface → `npx next build`
- **Smokebooks:** [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guessed)
- **Commits on Windows/PowerShell:** `.git/COMMIT_MSG_DRAFT.txt` + `git commit -F`

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file) — **HEAD first**
3. **Active plan:** [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md)
4. [`docs/LIVE-AV.md`](../LIVE-AV.md) — before any A/V or per-speaker work
5. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before FSM/outbox/end-session
6. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
7. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md)
8. [`docs/BACKLOG.md`](../BACKLOG.md)
9. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
10. [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)
11. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md)

Archived superseded plan (audit only): [`whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md).

---

## Open questions still in flight

| Question | Status |
|---|---|
| Map/reduce notes accuracy | **✅ RESOLVED (2026-07-01)** — first-pass quality is Part 3 pre-merge bar (labeled transcripts + model abstraction); eval harness + flywheel deferred post-master. Baseline today still poor until Part 3 ships. |
| Two-way calendar sync | Unresolved — [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) |

Resolved 2026-06-30: **Part 3 design pass APPROVED**; t=0 anchor; 3+-peer cap ≤3–4 no mixdown fallback; session-scoped consent override won't build. Resolved 2026-07-01: Sarah merge gate = full arc + single merge, no interim merge; remaining execution in fresh chat on same branch. Resolved 2026-07-01: first-pass notes **quality** is pre-merge (Part 3); eval harness + flywheel only post-master.

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).

Deep history: `git log --oneline wb-wave5-polish`, `git log --oneline v1-redesign`.

---

## Overall result

*(Orchestrator checkpoint — 2026-07-01: Sarah merge gate reaffirmed; execution order consistent; Part 3 APPROVED; tip 05a4b79.)*
