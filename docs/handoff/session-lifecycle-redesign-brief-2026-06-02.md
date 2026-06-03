# Session lifecycle redesign — design brief (2026-06-02)

**Status:** DESIGN BRIEF — **not yet built**  
**Authors:** Andrew ↔ orchestrator co-design (2026-06-02)  
**Product:** Mynk (tutoring-notes)  
**Purpose:** Lock architectural decisions for a **future** session-lifecycle redesign so they are not lost from chat. Implementation is a separate Sonnet design pass + Opus review.

**Related (existing, ratified):**

- [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) — waiting room, learner swap, tiered consent (Identity Phases 3–4)
- [`consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) — capture attestation / effective-consent enforcement
- [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM, outbox, atomic end-session (sacred pillar)

---

## Executive summary

Three concepts must stay **distinct** going forward:

| Concept | Definition | Driver |
|---------|------------|--------|
| **Session active** | Engaged presence — including **chat-only** when A/V is down | Presence (both parties connected) |
| **Session timer** | Objective wall-clock duration for billing/trust | Presence only — **never** tutor/student controllable |
| **Recording** | Capturing media to the session timeline | Session-active **AND** media available **AND** consent |

Recording should **auto-follow** whenever it physically can. The tutor's explicit Start/Pause intent toggle largely dissolves into automatic behavior (Pause may remain for exceptions). The compliance gate is **consent at session-create**, not toolbar Start.

---

## Locked decisions

### Decision C — recording-as-consequence (reframe)

**Whiteboard recording stops being a manual tutor choice** in the happy path.

Once:

1. **Capture consent** is given at session-create (`consentAcknowledged` on `StartWhiteboardSession` / `createWhiteboardSession`), and  
2. A **student is present**, and  
3. **Media is available**,

→ **recording auto-runs**. The tutor's explicit Start/Pause intent toggle (`userWantsRecording`) largely dissolves into automatic behavior. A **Pause for exceptions** may remain.

This matches Andrew's instinct: *"it should just be automatic."*

#### Today (read-only investigation, 2026-06-02)

| Surface | Role today |
|---------|------------|
| Session-create modal + `createWhiteboardSession` | **Real compliance gate** — `consentAcknowledged` |
| Toolbar Start/Pause | Sets **`userWantsRecording`** (load-bearing intent) |
| Student-page `recordingDefaultEnabled` checkbox | Per-student **convenience default** for that intent — **NOT consent** |
| `RecordingControlPanel` Start | Second overlapping record affordance |

**Consolidation goal:** merge toolbar intent + `RecordingControlPanel` Start into the automatic model; preserve consent-at-create and the student default's *workflow* role (see brand/copy queue below).

---

### Principle — session-timer integrity

The session timer/clock must be **presence-driven and objective**:

- **Both parties connected → timer runs**
- **Neither side may start, stop, or skew the clock**

Session duration is a **billing/trust record**. Anything either party can game is untrustworthy.

---

### Semantics — session-active vs recording (and the chat caveat)

- **Session active** = engaged presence, **including chat-only** when A/V is down.  
  - *Sarah input:* in-session chat as fallback when A/V isn't working — session must stay "live."
- **Recording** = session-active **AND** media available **AND** consent.

They **converge** on the happy path and **legitimately diverge** in the A/V-fallback case:

- Session keeps running on chat → timer continues  
- Recording pauses → no media to capture  

**This is correct semantics, not a bug.**

**Design goal:** timer follows presence; recording auto-follows whenever it physically can.

---

### INVARIANT (P0) — single wall-clock timeline

**REQUIREMENT — currently UNVERIFIED.** Whether today's system actually upholds this invariant is **unknown**. Per the reliability bar, treat it as **broken until proven on real hardware**. Andrew explicitly walked back an earlier "it works as far as I remember" — that is a soft memory signal, **not evidence**, and must not be recorded as fact.

Every captured track (audio now, whiteboard events, video later) must be anchored to a **single session wall-clock timeline**.

When recording pauses while the session continues:

1. The timeline must accrue a **real-duration gap** (silence/empty) at the correct offset.  
2. Resumed audio must be placed at its **TRUE wall-clock position** — **NEVER** concatenated onto the last pre-pause sample.  
3. The timeline must **never be compressed**.

**Audio drifting out of sync with the whiteboard is a P0 reliability failure.**

#### Untested scenario (named hardware test case)

**"Tutor draws on the whiteboard while the student is disconnected and the session timer is stopped."**

This scenario hides **two separable latent failure points** — either alone breaks audio↔whiteboard alignment:

1. **Stroke capture + stamping** — Are the tutor's strokes during the disconnected interval even being captured? If so, stamped against what timeline (wall-clock? a paused clock? not captured at all)?
2. **Audio resume placement** — When audio resumes, does it land at true wall-clock (gap preserved as silence) or get concatenated onto the pre-pause audio (which would shove everything after it out of alignment)?

The disconnect-while-drawing case is precisely where these failures would surface. **This test must pass on real tutor+student hardware before the redesign ships.**

#### Corollary — live transcription

Each transcript segment must carry **wall-clock start/end offset** and be assembled **by timestamp**, never by naive concatenation.

#### Design input — spike verification confirms LTX violates P0 (2026-06-03)

Verification on `spike/live-transcription` @ **`c3c627f`** proves the spike **does not** meet this corollary today. Detail: [`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md) § VERDICT: P0 INVARIANT GAP.

| Finding | Implication |
|---------|-------------|
| Assembly = `transcripts.join("\n\n")` by `segmentIndex` only | No `timelineStartMs` at capture, persist, or assembly |
| `totalDurationSeconds` sums audio durations | 30s pause between 5s segments → timeline shows 10s, not 40s |
| Six RED tests @ `c3c627f` (`ltx-timeline-assembly.test.ts`) | Executable spec; fix is **blocked on this brief's timeline decision** |

**The LTX assembly fix DEPENDS on resolving the timeline pause-semantics question below** — audio and whiteboard must anchor to the **same** clock.

#### Open question (MUST resolve in design pass) — freeze vs advance on pause

Whiteboard events today anchor to **`getAudioMs()`**, which **freezes during pause**. So the canonical whiteboard timeline itself may **compress pauses** (same class of bug as naive LTX concat, different layer).

The design pass **must** decide:

- **Freeze-during-pause** — session timeline compresses gaps (clock stops with recording); or  
- **Advance on wall-clock** — session timeline preserves real-duration gaps (clock runs while session continues).

Audio **and** whiteboard must use **one** chosen semantics. The concrete untested scenario remains: **tutor draws while student disconnected / timer stopped** — where do those strokes and the next audio segment land on the timeline? (Named hardware test case above.)

Until this is locked, do **not** implement the four-part LTX fix outline in the spike STATUS doc (stamp `timelineStartMs` → persist → assemble by timestamp → gap-inclusive coverage).

#### Verification

**Real-hardware only.** jsdom is blind to timeline/sync math — see [AGENTS.md](../../AGENTS.md) § Hard-won lessons (layout / coordinates — jsdom blind spot).

#### Hard acceptance gate

**Preserving the wall-clock gap under pause** — verified by the draw-during-disconnect hardware test above — is a **HARD acceptance gate** for this redesign, in the same "prove it on hardware" class as the live-transcription spike's **B1** (primary recording byte-unaffected). No jsdom or unit-test-only sign-off substitutes for this gate.

---

### Sarah's in-session chat — related input

Chat is both:

1. A **presence signal** (keeps session active when A/V fails), and  
2. Its **own feature** to design (messaging thread in [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) § messaging scope).

Treat as a **dependency / related thread** for this redesign — not in scope to fully spec here.

---

## Sequencing

| Step | Owner | Notes |
|------|-------|-------|
| **0. Live-transcription spike** | Done (P0 gap known) | Landed @ `7671a25`; **verified P0 assembly gap** @ `c3c627f` — [`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md) |
| **1. Empirically determine pause / disconnect / draw-during-disconnect behavior** | Sonnet design pass | **FIRST** — at code level **and** on real tutor+student hardware; **lock freeze-vs-advance timeline semantics** (`getAudioMs()` behavior today). LTX concat gap is **confirmed in code**; whiteboard stamping may share the same pause-compression failure mode. |
| **2. Design around preserving P0** | Sonnet + Opus review | High blast radius — recorder FSM is the sacred pillar ([`RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md)); design only after step 1 |
| **3. Implement LTX timestamp-anchored assembly** | Executor + hardware | **After** step 2 decision + hardware gate — not concat; see spike STATUS fix outline |

This redesign was **deliberately deferred** until the live-transcription spike stopped modifying the same FSM.

---

## Acceptance criteria (seed)

- [ ] **Presence-driven timer** — neither party controls clock; runs when both connected  
- [ ] **Recording auto-follows** — after consent + student present + media available  
- [ ] **Chat-fallback handled** — pause recording, keep session live; timer uninterrupted  
- [ ] **P0 wall-clock invariant proven** — gaps at correct offset; no concat compression; **draw-during-disconnect** hardware test PASS (hard gate, same class as LTX B1)  
- [ ] **Record-affordance consolidation** — single mental model; no duplicate Start paths  

---

## Live-transcription spike landing (reference)

**Branch:** `spike/live-transcription` @ **`c3c627f`** (verified 2026-06-03; landed @ `7671a25`)  
**Status:** Built, gates green, **P0 assembly gap confirmed**, **NOT merged** to `master` / V1 epic  
**Detail doc:** [`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md) (VERDICT, smoke checklist, architecture)

### Gates (2026-06-02)

| Gate | Result |
|------|--------|
| `tsc` | 0 errors |
| `npx next build` | exit 0 |
| `npm run test:regression` | 131 suites / 1358 tests |
| `auth.test.ts` DB connectivity | Pre-existing failure on `master` (not spike regression) |

### BLOCKERs baked in

| ID | Summary | Status |
|----|---------|--------|
| **B2** | IDB persist-before-network | Baked in |
| **B3** | 10s end-session drain timeout (unit-tested) | Baked in |
| **B4** | Ownership assertion (+/- tested) | Baked in |
| **B5** | `ltx=` observability prefix | Baked in |
| **B1** | Primary recording byte-unaffected with LTX tap active | **HARDWARE-PENDING** (jsdom-blind); smoke checklist in STATUS doc |

### Feature flag & schema

- **Flag:** `NEXT_PUBLIC_LIVE_TRANSCRIPTION_ENABLED` — **OFF by default**
- **Migration:** `20260602120000_ltx_incremental_transcript_segment`  
  - New table `IncrementalTranscriptSegment` + enum  
  - **NOT applied** to preview/prod at spike landing

### Migration-ordering watch item

Spike migration folder `20260602120000_ltx_incremental_transcript_segment` shares the **`20260602120000`** timestamp prefix with multitutor migration `20260602120000_identity_p2_multitutor` on branch `identity-p2-multitutor`.

- Different branches + different folder names → **no hard collision today**
- **Re-check ordering** if both ever land on the same branch before merge

### Constraint — in-person LTX

**In-person live-transcription must NOT ship** before the capture-attestation gate lands on `master` (see § In-person consent gap below).

---

## In-person consent gap (cross-reference)

On **`master`**, the in-person note recorder can call `getUserMedia` **without** a capture-attestation gate (whiteboard has one at session-create).

**Fix:** branch `interim-capture-attestation` — awaiting Andrew `migrate deploy` + smoke + `merge --no-ff` to `master`.

Recognized in consent-gates-capture design and this redesign backlog. **Blocks** in-person LTX until gate ships.

---

## Brand / copy decisions — QUEUED (not in this brief's build scope)

Recorded on `identity-p2-multitutor` for the batched copy/UX pass on **`feature/phase-d-landing-about`** — do not edit Phase D branch files from this checkpoint; **intent only**.

| Item | Locked copy / behavior |
|------|------------------------|
| **Commission line** | *"Mynk doesn't take a cut of what you charge."* — present tense; **no** "during the pilot" hedge; **no** "100%/forever" vow |
| **How it works / Hit record** | Split: **WHITEBOARD** — consent at session-create; recording runs while tutor + student connected; pause anytime. **IN-PERSON** — manual "Start recording." Blanket "Hit record" accurate for in-person only |
| **Record button** | **Load-bearing** — keep |
| **`recordingDefaultEnabled` checkbox** | Convenience default, **NOT consent** — keep or rework; do not silently delete (regresses "student declined recording" workflow) |
| **Session-create consent modal** | **THE compliance gate** — keep |

---

## Orchestrator queue (serial)

After Andrew smokes (multitutor preview, Phase D preview, spike B1 on real hardware):

1. Batched copy/UX pass on `feature/phase-d-landing-about` (commission + hit-record split)  
2. In-session-audio privacy clarification ([`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md))  
3. **This redesign** — Sonnet design pass + Opus review (empirically verify pause/disconnect/draw-during-disconnect first)  
4. Implement LTX timestamp-anchored assembly — **after** timeline pause-semantics locked (P0 gap @ `c3c627f`; see spike STATUS)  

---

## Open questions (for design pass — not locked here)

- Exact FSM transitions when auto-recording meets Pause-for-exception  
- How `recordingDefaultEnabled` maps in the auto model (default intent vs removed)  
- UI copy for "session live, recording paused (no A/V)" state  
- Interaction with Phase-3 `SessionConsentSnapshot` per capture type  

---

*End of brief. Implementation tracking: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) lightweight head + [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md).*
