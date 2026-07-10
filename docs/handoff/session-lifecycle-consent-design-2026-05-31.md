# Session Lifecycle + Tiered Consent — Architecture Design Doc

> **Design date:** 2026-05-31
> **Authored by:** Sonnet 4.6 subagent, commissioned by Opus orchestrator
> **Deliverable type:** Design document only — no production code, no migrations applied
> **Prerequisite reads (in order):**
> 1. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — SPINE (all LOCKED decisions; authoritative)
> 2. [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) — identity/accounts/consent/auth architecture
> 3. [`docs/handoff/consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) — consent-gates-capture principle, Phase-3 enforcement, §9 open questions
> 4. [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) — IA/URL layer (session-centric routes)
> 5. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — recorder FSM, outbox, atomic end-session
> 6. `AGENTS.md` — conventions (log prefixes, additive migrations, ownership assertions)
>
> **Superseded by:** Nothing. This is additive to the above docs.
> **Executor reads:** Sections C, E, G for direct schema/assertion specs; Section B for mid-session swap implementation.

---

## §1. Executive Summary

This document is the session-lifecycle + tiered-consent design layer for Mynk v1. It completes the V1 epic's design corpus:

| Doc | Layer |
|---|---|
| `v1-component-redesign-design-2026-05-31.md` | Visual / IA / URL |
| `session-identity-access-design-2026-05-31.md` | Identity / auth / accounts |
| `consent-gates-capture-design-2026-05-31.md` | Consent enforcement / capture gating |
| **This document** | **Session lifecycle + tiered consent model + mid-session swap** |

### What this adds

1. **Session lifecycle flow** — waiting room, session start/invite, participant join, live session, end — mapped onto the locked IA routes and identity model.
2. **Mid-session learner-swap** — the full design for the headline new requirement (frictionless back-to-back student switching with seamless consent-context swap and recorder-Pillar reliability).
3. **Tiered consent model** — PROPOSED exact essentials-vs-optional split (Andrew ratifies), with data model, freeze semantics, and VPC-for-minors spec.
4. **§9 open-question resolutions** — all 6 questions from `consent-gates-capture-design-2026-05-31.md` §9 resolved with recommendations.
5. **Server-side enforcement design** — `assertEffectiveConsent` placement, consent failure paths, integration with `endWhiteboardSession` split.
6. **5-axis adversarial reliability review** — BLOCKERs folded into Phase-1/3 acceptance.
7. **Sequencing and new log prefixes** — where this design slots against Identity Phases 1–3; two new log-prefix introductions (`slc`, `wtr`).

---

## §2. Session Lifecycle Flow

### 2.1 Session states

A `WhiteboardSession` row moves through these logical states (the existing schema uses `endedAt` as the sole state marker; this document proposes naming them for clarity in the design — executor: see §2.5 for schema additions):

```
pending   → active → ending → ended
                ↑
          (learner join
           happens here)
```

| State | Condition | What's possible |
|---|---|---|
| `pending` | `startedAt = null, endedAt = null` (NEW column — see §2.5) | Waiting room pre-launch; invite link generated; NO capture |
| `active` | `startedAt ≠ null, endedAt = null` | Live session; capture per consent; learner can join |
| `ending` | End sequence in progress (client-side only; no DB state) | FSM stopping, outbox draining, `endWhiteboardSession` pending |
| `ended` | `endedAt ≠ null` | Read-only; replay; notes; sharing |

### 2.2 Full lifecycle flow

```
═══════════════════════════════════════════════════════════════════════════
TUTOR SIDE                              LEARNER / PARENT SIDE
═══════════════════════════════════════════════════════════════════════════

[Dashboard /students/[id]]
  • Sees student card with consent status
  • Clicks "Start session"
        │
        ▼
[POST /api/sessions]
  • assertOwnsStudent(tutor, studentId)
  • Creates WhiteboardSession {
      startedAt: null,           ← pending state
      studentId,
      tutorId,
    }
  • If student claimed:
      – reads latest ConsentRecord
      – creates SessionConsentSnapshot (frozen)
      – logs: [cns] action=frozen
  • If student unclaimed:
      – consentSnapshot = null
      – all capture features disabled
  • Generates join link (Phase 4+: authenticated;
    Phase 2 transition: WhiteboardJoinToken)
  • logs: [slc] slc=<sessionId> action=session_created
        │
        ▼
[Tutor: /sessions/[wsid]/workspace]
  • Session state = pending
  • Workspace loads in "waiting room" mode:
      – Whiteboard canvas ready (tutor can draw)
      – Capture controls hidden/disabled until
        startedAt is set AND learner joins
      – "Waiting for [Student Name]…" pill shown
      – Invite link displayed for copy/share
        │
        │──────────── Tutor shares /join/[token] with learner ──────────▶
        │
        │                               [Learner: /join/[token]]
        │                                 • Token validated server-side
        │                                 • Phase 4+: asserts LearnerDeviceSession
        │                                 • assertIsSessionParticipant (or creates
        │                                   SessionParticipant row on first join)
        │                                 • Checks consentSnapshot.allowLiveSession
        │                                 • If allowed → waiting room page:
        │                                     "Your session is starting..."
        │                                     [live A/V connect attempt begins]
        │                                 • logs: [wtr] wtr=<waitId>
        │                                         action=learner_arrived
        │
        ◀───────── WebRTC signaling / presence event arrives ──────────
        │
  • Tutor sees: "Student A has joined" notification
  • Tutor clicks "Begin" (or auto-admit for 1:1)
        │
        ▼
[POST /api/sessions/[wsid]/start]
  • assertOwnsSession(tutor, wsid)
  • Sets WhiteboardSession.startedAt = now()
  • logs: [slc] slc=<sessionId> action=session_started tutorId=<id>
        │
        │                               [Learner: /join/[token] → workspace]
        │                                 • Waiting room transitions to live session
        │                                 • logs: [wtr] wtr=<waitId>
        │                                         action=learner_admitted
        │
        ▼
══════════════════════════════════════════════════════════
  LIVE SESSION
  • Whiteboard sync active (live stroke rendering = ESSENTIAL)
  • Live A/V transport active (WebRTC = ESSENTIAL)
  • Recording: armed/recording only if consentSnapshot.allowAudioRecording=true
  • FSM in "armed" or "recording" state (per RECORDER-LIFECYCLE.md Pillar 1)
══════════════════════════════════════════════════════════
        │
        │ [Optional: Mid-session learner swap — see §3]
        │
        ▼
[Tutor clicks "End Session"]
  • handleEndSession() begins (existing Pillar 3 flow)
  • Step 1: setUserWantsRecording(false)       ← FSM stops
  • Step 2: drainOutboxOrTimeout(wbsid, 15s)   ← uploads land
  • Step 3: assembleEndSessionSegments(wbsid)
  • Step 4: uploadWhiteboardEvents(...)
  • Step 5/5b: snapshot (best-effort)
  • Step 6: endWhiteboardSession(wbsid, ...)   ← consent-gated audio
  • Step 7: finalizeOutboxAfterEnd(wbsid)      ← IDB rows dropped
  • Step 8: router.replace(/sessions/[wsid])   ← review page
  • logs: [slc] slc=<sessionId> action=session_ended
        │
        │                               [Learner: workspace closes]
        │                                 • "Session ended" screen
        │                                 • Links to session review (if consented)
        │
        ▼
[/sessions/[wsid]] — Session review
  • Tutor sees: notes, recording, replay (all per consent)
  • Parent (AccountHolder) sees: same, per snapshot consent
  • Student (LearnerProfile) sees: read-only per consent
```

### 2.3 Tutor-initiated start vs. learner arrival order

Two common scenarios:

**Scenario A — Tutor starts first, learner joins:**
1. Tutor opens workspace → session in `pending`
2. Tutor shares join link
3. Learner clicks link → waiting room
4. Tutor admits → session transitions to `active`

**Scenario B — Learner arrives before tutor opens workspace:**
- This can happen if the join link was shared in advance.
- `/join/[token]` is always valid for an unexpired token, regardless of whether the tutor has opened the workspace.
- Learner lands in waiting room: "Your tutor is setting up..."
- When the tutor opens workspace and clicks "Admit," the waiting room resolves.
- **No learner data is captured in `pending` state** — the consent snapshot gate applies to ALL capture, and `startedAt = null` sessions have no active recording.

### 2.4 Parent-side join (Phase 4+: AccountHolder view)

Parents do not join live sessions in v1. They have read-only access to session data after-the-fact via `/account/students/[id]/sessions`. The parent-facing share link (`/share/[token]`) continues to work in transition, pointing to the review page for ended sessions.

### 2.5 Schema additions (additive)

Two new nullable columns on `WhiteboardSession`:

```prisma
// ADD to existing WhiteboardSession model:

/// Timestamp when the tutor explicitly started the session (admitted learner).
/// Null = session created but not yet started (pending/waiting room).
/// Set once; never updated.
startedAt     DateTime?

/// The active learner swap ID, if a swap is in progress.
/// Used for optimistic locking during mid-session swap (see §3).
/// Cleared after swap completes.
activeSwapId  String?
```

Migration SQL (additive):
```sql
ALTER TABLE "WhiteboardSession" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "WhiteboardSession" ADD COLUMN "activeSwapId" TEXT;
```

**Executor note:** `startedAt` is separate from the existing session creation timestamp (which today is implicit in the first whiteboard event). The new column is the explicit "session is live" marker for the waiting-room-to-live transition.

### 2.6 Waiting room gating rules

The following are BLOCKED in `pending` state (server-enforced):
- Setting `tutorWantsRecording = true` (FSM gate: recording toggle disabled)
- Calling `endWhiteboardSession` (session must be started before it can end — server validates `startedAt != null` OR allows End to clean up a pending session without audio)
- Any capture actions (assertEffectiveConsent also checks `startedAt` — a pending session blocks capture)

**Exception:** the whiteboard canvas is WRITABLE in `pending` state. The tutor can prepare the canvas while waiting. These strokes are captured in the events stream and preserved in the session. This is consistent with live stroke rendering = essential (not capture).

---

## §3. Mid-Session Learner Swap — Full Design

> This section is the primary new mechanical design. Read carefully before touching any swap-related code.

### 3.1 The requirement (from spine, verbatim)

Back-to-back students on one computer/account is common (Sarah). Switching must be:
- **FRICTIONLESS** even mid-live-session
- Students-facing: a simple "switch learner" affordance
- Under the hood: FULL seamless consent-context swap

Must satisfy:
- **(a)** Enforce the NEW learner's consent (their parent didn't consent to recording → recording stops/doesn't start)
- **(b)** Cleanly finalize the PRIOR learner's recorder segment before starting the next (recorder-Pillar reliability)
- **(c)** Attribute subsequently-saved content to the newly-selected learner
- **(d)** The prior learner's already-captured segment stays attributed to them

### 3.2 Design decision: atomic silent session handoff

**The swap is implemented as: atomic end of Session A + atomic start of Session B, surfaced to the tutor as a smooth "switch learner" UX.**

This is the cleanest approach because:
- It reuses the proven Pillar 3 end-session flow (no new recorder failure modes)
- Each session has a single learner with a single frozen consent snapshot (clean data model)
- Attribution is unambiguous: Session A rows → Student A; Session B rows → Student B
- The whiteboard canvas state is carried forward in memory (not via DB) to preserve continuity

**Rejected alternatives:**
- *Multi-learner WhiteboardSession*: would require a SessionConsentSnapshot per learner-segment, blurring session boundaries and complicating all downstream queries (notes, billing, replay)
- *In-place participant swap without session close*: would leave Session A's `endedAt` unset, causing orphan sessions and breaking the recorder's finalization invariants

### 3.3 Session continuity — what carries forward

| Data | Carry forward? | How |
|---|---|---|
| Whiteboard canvas (in-memory Excalidraw state) | **YES** | Client-side state in the React tree — no DB hop needed |
| Audio recording | **NO** — Session A audio is finalized and attributed to A; Session B recording starts fresh | FSM reset; new `sessionId` propagated to outbox |
| SessionConsentSnapshot | **NO** — Session A's snapshot is frozen and stays with A; Session B gets a new snapshot | `startWhiteboardSession` creates a new snapshot for Student B |
| WhiteboardSession.eventsBlobUrl | **NO** — Session A events are finalized; Session B starts a new event stream | New session = new events.json |
| SessionParticipant | **NO** — Session A's participant record is closed; Session B's is created fresh | `leftAt` set on Session A participant; new row for Session B |
| Live A/V WebRTC peer connection | **DEPENDS** — if the learner is still physically at the computer, the WebRTC session can optionally be preserved; if not (they left), the peer mesh resets | Server signals "swap in progress" to the peer mesh; peer connection is re-identified with the new learner's profile |

**Canvas carry-forward detail:** The workspace keeps the Excalidraw instance alive during the swap sequence. After Session B starts, the existing in-memory scene is used as Session B's initial state. The first whiteboard event in Session B's `events.json` is a full-scene snapshot of the inherited canvas state. This is a clean design because:
1. The session events for Session B accurately represent what was on the whiteboard when Session B began (the tutor's work is preserved)
2. Session A's events end at the moment of swap (its final `eventsBlobUrl` captures the canvas state up to that point)
3. No replay data is lost

**OPEN QUESTION (H-1):** Does Andrew want Session B to carry forward the canvas state, or start with a blank canvas? The carry-forward is the expected behavior for back-to-back students on the same topic, but some tutors may prefer a fresh start. Design assumes carry-forward; Andrew confirms.

### 3.4 The swap sequence — step by step

```
[Tutor clicks "Switch Learner" in workspace]
        │
        ▼
[Client: show SwapLearnerModal]
  • Lists Sarah's other students (filtered: only claimed + allowLiveSession=true)
  • Tutor selects Student B
  • Tutor clicks "Switch"
        │
        ▼
[Client: Pre-swap validation (server round-trip)]
  POST /api/sessions/[wsidA]/validate-swap
    { targetStudentId: studentBId }
  Server:
    assertOwnsStudent(tutor, studentAId)    ← must own current session
    assertOwnsStudent(tutor, studentBId)    ← must own target student
    latestConsentB = getLatestConsentRecord(studentBId, tutorId)
    if (latestConsentB.allowLiveSession === false):
      return { error: "LEARNER_NOT_AUTHORIZED", message: "Student B's account holder has not authorized live sessions." }
    return { valid: true, studentBName, consentB: { allowAudio, allowNotes, ... } }
        │
        │ [Modal updates: "Switching to [Student B]... finalizing [Student A]'s session"]
        │
        ▼
[Client: Phase 1 — Finalize Session A (EXACTLY the existing handleEndSession flow)]
  Step 1: setUserWantsRecording(false)          ← FSM stops capture
  Step 2: drainOutboxOrTimeout(wsidA, 15s)      ← all in-flight uploads land
          [if timeout: abort swap, show error: "Could not finalize [Student A]'s audio.
           Please try again or end the session manually."]
  Step 3: segments = assembleEndSessionSegments(wsidA)
  Step 4: uploadWhiteboardEvents(wsidA, ...)    ← Session A events.json (includes canvas state)
  Step 5: snapshotBlobUrl = generateAndUploadSnapshot() [best-effort, non-blocking]
  Step 6: result = endWhiteboardSession(wsidA, eventsBlobUrl, { segments, snapshotBlobUrl })
          [if error: abort swap, show error: "Could not close [Student A]'s session.
           Please try ending manually before switching."]
  Step 7: finalizeOutboxAfterEnd(wsidA)         ← IDB rows for Session A dropped
  logs: [slc] slc=<wsidA> action=swap_session_a_finalized
        │
        ▼
[Client: Phase 2 — Start Session B]
  POST /api/sessions/swap
    { fromSessionId: wsidA, toStudentId: studentBId }
  Server action (single transaction):
    assertOwnsSession(tutor, wsidA)            ← safety re-check: A is now ended
    assertOwnsStudent(tutor, studentBId)
    // Optimistic lock: set wsidA.activeSwapId
    // Create new WhiteboardSession for Student B
    wsidB = db.whiteboardSession.create({
      studentId: studentBId,
      tutorId,
      startedAt: now(),                        ← B starts immediately (no waiting room needed for swap)
    })
    // Freeze consent for Student B
    consentB = getEffectiveConsent(studentBId, tutorId)
    snapshotB = db.sessionConsentSnapshot.create({ whiteboardSessionId: wsidB.id, ...consentB })
    // Create SessionParticipant for Student B
    db.sessionParticipant.create({ whiteboardSessionId: wsidB.id, learnerProfileId: studentBLearnerProfileId, joinedAt: now() })
    // Close StudentA's participant record
    db.sessionParticipant.update({ where: { wsidA, studentAProfileId }, data: { leftAt: now() } })
    return { wsidB, consentB }
  logs: [slc] slc=<wsidB> action=swap_session_b_started fromSession=<wsidA> tutorId=<id>
        │
        ▼
[Client: Phase 3 — Restore workspace for Session B]
  • Update React state: whiteboardSessionId = wsidB
  • Propagate wsidB to outbox (new sessionId for future segments)
  • Propagate wsidB to FSM inputs
  • If consentB.allowAudioRecording = true:
      setTutorWantsRecording(true)             ← FSM arms for Session B
  • If consentB.allowAudioRecording = false:
      Recording toggle stays off; tooltip:
      "[Student B]'s parent has not enabled audio recording."
  • Canvas state is UNCHANGED (in-memory Excalidraw instance preserved)
  • First whiteboard event in Session B = full scene snapshot of inherited canvas
  • Modal shows: "Now in session with [Student B]"
  logs: [slc] slc=<wsidB> action=swap_workspace_restored consent=<allowAudio|deny>
        │
        ▼
[Normal live session with Student B continues]
```

### 3.5 Recorder-FSM interaction — prove no wedge or audio loss

The recorder lifecycle has three invariants that the swap must not violate:

**Invariant 1 (Pillar 1 — Pure FSM):** `evaluateLifecycle` must not be called with mixed-session state.
- Protection: `setUserWantsRecording(false)` in Phase 1 Step 1 moves the FSM to `idle` BEFORE any swap. The FSM never sees a state where `tutorWantsRecording=true` but `sessionId` is changing. The FSM is re-armed (if consent permits) only after `wsidB` is fully set in Phase 3.

**Invariant 2 (Pillar 2 — Outbox):** IDB rows are keyed by `(sessionId, streamId, segmentId)`. Session A rows and Session B rows never collide.
- Protection: `wsidB` is set in the outbox's `sessionId` key space only after Phase 2 completes. `finalizeOutboxAfterEnd(wsidA)` in Phase 1 Step 7 drops all Session A rows from IDB before Session B arms.
- If Phase 2 fails AFTER Phase 1 Step 7: Session A is finalized, Session B doesn't exist. The workspace is in a "session ended" state. No IDB corruption. Tutor must start a fresh session for Student B manually.

**Invariant 3 (Pillar 3 — Atomic end):** `endWhiteboardSession` sets `endedAt` atomically.
- Protection: Phase 1 Steps 1–7 are the IDENTICAL sequence as a normal session end. No modifications to `endWhiteboardSession` are needed for the swap. The swap adds a Phase 2 server action AFTER the existing end-session is complete.

**Audio loss analysis:**
- Can Session A audio be lost? Only if `drainOutboxOrTimeout` times out (Phase 1 Step 2). If timeout: swap is ABORTED. Session A remains open. Tutor must resolve manually (wait for uploads, then retry or end normally). IDB rows for Session A are intact.
- Can Session B audio be double-counted? No — Session B's outbox context uses `wsidB` which was created in Phase 2. No outbox rows for Session A can accidentally be registered to Session B (different `sessionId` key).
- Can a segment span the session boundary? No — `setUserWantsRecording(false)` in Step 1 fires a `MediaRecorder.stop()`, which generates a final segment and flushes it to the outbox. The drain in Step 2 waits for that segment to land. No in-progress segment exists when Session B starts.

### 3.6 Waiting room interaction during swap

If Student B is already in the waiting room (they arrived before the swap):
- The waiting room's join token (or authenticated session) is valid for Session B once it's created.
- The server swap action creates `SessionParticipant` for Student B with `joinedAt = now()` — no separate admit step needed (the swap implies the tutor's intent to start with Student B).
- The waiting room page detects the session start via server state and transitions to live session.

If no learner is present (solo/whiteboard-only mode):
- The swap still works — it finalizes Session A (even with no participants) and starts Session B.
- **OPEN QUESTION (H-2):** Is a mid-session learner swap allowed in solo mode (no learner joined Session A at all)? Design allows it (a tutor might have been warming up the whiteboard before switching to a different student's context). Andrew confirms.

### 3.7 Error states and recovery

| Error in swap | Server state after | Client state after | Recovery path |
|---|---|---|---|
| `drainOutboxOrTimeout` timeout (Step 2) | Session A still open (startedAt set, endedAt null) | Modal shows error; swap aborted | Tutor waits for network, retries swap OR ends session A normally |
| `endWhiteboardSession` error (Step 6) | Session A still open | Modal shows error; swap aborted | Tutor retries End-session or retry swap |
| Session B start fails (POST /api/sessions/swap error) | Session A ended; Session B NOT created | Workspace shows "Session A ended — failed to start Session B" | Tutor manually starts new session for Student B from dashboard |
| Network loss between Phase 1 and Phase 2 | Session A ended (durable); Session B not created | Workspace reloads; detects Session A is ended | Tutor starts new session for Student B manually |
| Consent check fails for Student B (`allowLiveSession=false`) | No state change; swap never initiated | Modal shows "Student B's parent has not authorized live sessions" | Tutor resolves consent with parent before switching |

**No wedge scenario possible:** the worst case (Phase 2 failure after Phase 1 success) results in Session A cleanly ended and no Session B. The tutor must navigate to Student B's card and start a new session. This is recoverable and not a data-loss scenario — Session A's audio and events are fully registered.

### 3.8 UI affordance

The "Switch Learner" button lives in the workspace header alongside the existing session controls. In the workspace's top bar:

```
[Mynk logo]  [Student A ▾]  ●● REC  [00:42:17]     [End Session]
                   ↑
             Clicking Student A opens SwapLearnerModal
             (only for tutors; not visible to learner side)
```

The `[Student A ▾]` affordance:
- Only visible when `startedAt ≠ null` (not in `pending` state)
- Dropdown shows other students (filtered: claimed only, `allowLiveSession=true`)
- Each student in the list shows their consent status: `● Audio` / `○ Audio` (whether audio recording is consented)
- Selecting a student opens a confirmation dialog with: "Finalize [Student A]'s session and switch to [Student B]? This will end [Student A]'s session recording."

---

## §4. Tiered Consent Model

### 4.1 PROPOSED: Essentials-vs-optional split

> **🚩 PROPOSED — awaiting Andrew ratification.** The Opus orchestrator has designed this split per the spine's "exact essentials-vs-optional split → Opus PROPOSES in the design pass for Andrew approval." Mark each cell; Andrew ratifies.

| Data processing activity | Proposed tier | Justification | Consent mechanism |
|---|---|---|---|
| Live whiteboard collaboration (stroke rendering, canvas sync, session presence) | **ESSENTIAL** | IS the service — conducting tutoring is impossible without this | Service contract / ToU agreement |
| Live A/V transport (WebRTC connection for real-time audio/video communication) | **ESSENTIAL** | Required to conduct the session (tutor and student must be able to communicate in real time) | Service contract / ToU agreement |
| Session existence and duration metadata (`startedAt`, `endedAt`, `billedDurationMin`) | **ESSENTIAL** | Required for billing and business records; cannot operate without it | Service contract / ToU agreement |
| AccountHolder account data (email, auth, display name) | **ESSENTIAL** | Required to maintain the account | Service contract / ToU agreement |
| LearnerProfile identity (display name, optional email) | **ESSENTIAL** | Required to associate the learner with sessions | Service contract / ToU agreement |
| **Audio recording** (creating a stored audio artifact for later review) | **OPTIONAL** | Recording is NOT required to conduct the session; it creates a new stored artifact beyond essential service delivery | Explicit UNCHECKED opt-in toggle (`allowAudioRecording`); RECOMMENDED with clear messaging |
| **Whiteboard-activity recording** (stroke replay for later review — distinct from live rendering) | **OPTIONAL** | Replay creates a stored artifact; live rendering is essential but the recording of it for later replay is not | Explicit UNCHECKED opt-in toggle (`allowWhiteboardRecording`) |
| **Notes and transcripts** (AI-generated notes, session summaries shared beyond tutor's private view) | **OPTIONAL** | Creating and sharing text content derived from a session is a new data processing activity | Explicit UNCHECKED opt-in toggle (`allowNoteSending`) |
| **Educational use** (using session content for tutor's own educational purposes, note-taking, lesson planning beyond standard session delivery) | **OPTIONAL** | Beyond the core service; creates a new purpose for data | Explicit UNCHECKED opt-in toggle (`allowEducationalUse`) |
| **In-app messaging** (tutor↔parent/student direct messaging thread) | **OPTIONAL** | Messaging creates a stored communication record; not required to deliver tutoring | Explicit UNCHECKED opt-in toggle (`allowMessaging`) |
| **Camera/video recording** (actual webcam/camera capture — POST-V1 fast-follow) | **OPTIONAL** | Highest-sensitivity data; requires explicit consent; NOT built in V1 | Forward-compat toggle (`allowVideoRecording`); always `false` until V1+video ships |

**Data-minimization justification for the essential set:**
The essential set is intentionally narrow. Regulators (FTC, EU DPA) scrutinize over-bundled "required" processing. The test is: "could you deliver the tutoring session without processing this data?" For audio recording, whiteboard replay, and notes — yes, you could conduct a session without them. They are value-adds, not necessities. For live whiteboard sync and live A/V transport — no, you cannot conduct the session without them.

**Why "Live A/V transport" is essential but "audio recording" is not:**
Live A/V transport creates a real-time peer connection. No stored artifact is created by the connection itself. Audio recording creates a persistent stored artifact (a file) that outlasts the session. These are meaningfully different from a data-processing and privacy perspective.

**VPC for minors (COPPA compliance):**
- Essentials for minors: still require explicit Verifiable Parental Consent (VPC) per COPPA §312.5 — the "it's part of the ToU" shortcut applies ONLY to adults. For minors, the essential-tier processing (live whiteboard, live A/V, session metadata) is disclosed in the consent form and the parent's act of claiming the profile + agreeing to the terms is the VPC mechanism. The claim flow IS the VPC mechanism.
- Optional toggles for minors: each must be affirmatively opted into by the parent (unchecked by default). The parent's VPC covers the optional toggles they enable.

### 4.2 New toggle: `allowWhiteboardRecording`

The spine and consent-gates-capture design treat whiteboard-activity recording (stroke replay) as a consent-gated capture type distinct from live rendering. The existing schema (`ConsentRecord`, `SessionConsentSnapshot`) has no column for this yet. It must be added.

**Schema addition (to `ConsentRecord` and `SessionConsentSnapshot`):**

```prisma
// ADD to ConsentRecord model:
allowWhiteboardRecording  Boolean  @default(false)  // tutor may record strokes for replay

// ADD to SessionConsentSnapshot model:
allowWhiteboardRecording  Boolean  // effective value at session start

// ADD to ConsentRestriction model:
restrictWhiteboardRecording  Boolean  @default(false)  // child can restrict
```

**Enforcement:** `assertEffectiveConsent(wsid, 'allowWhiteboardRecording')` is called before registering whiteboard-activity recordings for replay (distinct from the live sync which is always allowed).

**Executor note:** The existing `shouldCaptureWB` FSM output controls whether whiteboard events are written to the replay event stream. With consent gates, `shouldCaptureWB` is gated on `consentSnapshot.allowWhiteboardRecording`. If `false`, the whiteboard renders live (essential) but events are NOT captured for replay.

**`allowEducationalUse` addition:**

```prisma
// ADD to ConsentRecord and SessionConsentSnapshot:
allowEducationalUse  Boolean  @default(false)  // content may be used for tutor's educational purposes
```

This toggle was locked by Andrew on 2026-05-31 (spine §"New consent toggle"). Enforcement: checked before any action that shares session content with third parties for educational-use purposes (e.g., a future "share with curriculum tool" feature). In v1, this is a forward-compat toggle with no enforcement surface yet (note: must still be DISCLOSED — the parent is consenting to it even if v1 doesn't use it).

### 4.3 Updated toggle inventory (consolidated)

| DB column | Default | Parent-facing label | Recommended? | V1 enforced? |
|---|---|---|---|---|
| `allowAudioRecording` | `false` | "Record audio of sessions for [Student]'s review" | **YES — highly recommended** | ✅ Phase 3 |
| `allowWhiteboardRecording` | `false` | "Save whiteboard activity for replay review" | Yes — recommended | ✅ Phase 3 |
| `allowNoteSending` | `false` | "Generate and share session notes and transcripts" | Yes — recommended | ✅ Phase 3 |
| `allowEducationalUse` | `false` | "[Tutor] may use session content for their own educational and lesson-planning purposes" | Neutral | ⬜ Enforce when surface ships |
| `allowMessaging` | `false` | "Allow [Tutor] to send you in-app messages about [Student]'s sessions" | Yes | ✅ Phase 5 |
| `allowVideoRecording` | `false` | "Record video of [Student]'s sessions" | N/A — NOT in V1 | ⬜ Post-V1 |
| `allowLiveSession` | `true` | (not a toggle — it's the "suspend access" mechanism; `false` = parent suspended the student's access to this tutor) | N/A | ✅ Phase 3 |

**`allowLiveSession` design note:** This is not really a consent "opt-in" — it's a "suspend access" kill switch. The parent does NOT consent to each session individually; `allowLiveSession=true` is the steady state and the parent sets it to `false` to revoke access. This should be presented in the UI as "Account access: Active / Suspended" rather than as a consent toggle. The underlying DB boolean remains as-is.

### 4.4 Consent collection: where, when, how

**For claimed students (parent is AccountHolder):**
1. **Initial consent**: Step 5a of the claim flow (`/claim/[token]/setup` wizard)
   - Essentials: shown in an information panel ("These are required to use Mynk")
   - Optional toggles: shown as unchecked checkboxes with labels and sub-labels
   - Audio and whiteboard recording get an explicit "RECOMMENDED — [Student] can review recordings later" badge
   - VPC mechanism: parent's account creation + email verification + explicit toggle interaction = verifiable parental consent
2. **Consent changes**: `/account/students/[id]/consent`
   - Same toggle UI
   - `CRITICAL_ACTION` email confirmation required for any change
   - New `ConsentRecord` version created on each change
3. **Child narrowing**: `/profile/preferences` (older students with LearnerProfile login)
   - Only "restrict further" options visible
   - Cannot widen parent ceiling

**For self-learners (`isSelfLearner = true`):**
1. During account creation (sign-up or first-session setup)
2. Same toggle UI but framed as "your preferences" not "parent consent"
3. No `CRITICAL_ACTION` email gate (self-managed; they can change freely)
4. Self-learner consent path: see §9 Q-CGC-1 resolution

**For unclaimed students (pilot transition):**
- All optional capture disabled
- Interim attestation gate (`att=`) as bridge (implemented on `interim-capture-attestation` branch)
- Until Phase 3 ships, tutor attestation is the only gate

### 4.5 Data model: consent versioning and freeze

The full schema is specified in `session-identity-access-design-2026-05-31.md` §2.3. This section adds only the new fields (`allowWhiteboardRecording`, `allowEducationalUse`) and the mid-session-swap additions.

**Consent freeze on session start (updated for mid-session swap):**

```typescript
// In startWhiteboardSession (and in the swap server action):
async function freezeConsentSnapshot(
  tx: PrismaTransaction,
  whiteboardSessionId: string,
  learnerProfileId: string | null,
  tutorId: string,
): Promise<SessionConsentSnapshot> {

  if (learnerProfileId === null) {
    // Unclaimed student — no consent snapshot (Phase 3 blocks capture for these)
    return null;
  }

  const latestConsent = await getLatestConsentRecord(tx, learnerProfileId, tutorId);
  const restrictions = await getConsentRestriction(tx, learnerProfileId);

  const effective = {
    allowLiveSession:           latestConsent?.allowLiveSession ?? false,
    allowAudioRecording:        (latestConsent?.allowAudioRecording ?? false)
                                  && !(restrictions?.restrictAudioRecording ?? false),
    allowWhiteboardRecording:   (latestConsent?.allowWhiteboardRecording ?? false)
                                  && !(restrictions?.restrictWhiteboardRecording ?? false),
    allowNoteSending:           (latestConsent?.allowNoteSending ?? false)
                                  && !(restrictions?.restrictNoteSending ?? false),
    allowEducationalUse:        latestConsent?.allowEducationalUse ?? false,
    allowMessaging:             (latestConsent?.allowMessaging ?? false)
                                  && !(restrictions?.restrictMessaging ?? false),
    allowVideoRecording:        false, // always false until video ships in post-V1
  };

  // Self-learner override: isSelfLearner → all toggles pass if no explicit restriction
  const accountHolder = await tx.accountHolder.findUnique({
    where: { id: latestConsent?.setByAccountHolderId ?? '' },
  });
  if (accountHolder?.isSelfLearner) {
    // Self-learner: treat all toggles as true unless explicitly restricted
    Object.assign(effective, {
      allowAudioRecording:      !(restrictions?.restrictAudioRecording ?? false),
      allowWhiteboardRecording: !(restrictions?.restrictWhiteboardRecording ?? false),
      allowNoteSending:         !(restrictions?.restrictNoteSending ?? false),
      allowEducationalUse:      true,
      allowMessaging:           !(restrictions?.restrictMessaging ?? false),
    });
  }

  return await tx.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId,
      ...effective,
      consentRecordId:      latestConsent?.id ?? null,
      consentRecordVersion: latestConsent?.version ?? null,
      frozenAt:             new Date(),
    },
  });
}
```

**Key invariants of the freeze:**
- The snapshot is created atomically inside the session-start transaction
- No `UPDATE` or `DELETE` endpoint exists for `SessionConsentSnapshot` (immutable post-creation)
- The `consentRecordId` and `consentRecordVersion` provide the audit trail linking which consent record contributed to the snapshot
- A swap creates a NEW snapshot for Session B via the same `freezeConsentSnapshot` function — the prior snapshot (Session A) remains untouched

### 4.6 PII/business-record separation compliance

Per the locked principle: `SessionConsentSnapshot` rows reference `LearnerProfile` only via `whiteboardSessionId → WhiteboardSession → Student → learnerProfileId?`. When a `LearnerProfile` is deleted (tombstoned), the snapshot rows are retained (they are legal records), but the `learnerProfileId` in `Student` is nulled (`onDelete: SetNull`). The snapshot becomes a record of "a session occurred with a now-deleted learner profile." The `billedDurationMin` and session-occurred facts survive the deletion. This is correct per both COPPA §312.6(c) and the business-record separation principle.

---

## §5. Resolve §9 Open Questions (consent-gates-capture-design)

> **All recommendations below are "Opus/design recommendation — Andrew ratifies."** Per spine: these were delegated to "recommend-and-proceed; Andrew ratifies later." Each recommendation is marked PROPOSED.

### Q-CGC-1: Self-learner consent model

**Question:** Use simplified null-consentRecord + isSelfLearner bypass, or require a formal `ConsentRecord` even for self-learners?

**PROPOSED recommendation: Simplified null-consentRecord + isSelfLearner bypass, WITH one audit addition.**

Use the bypass in `assertEffectiveConsent` (already specified in `consent-gates-capture-design-2026-05-31.md` §2.5) — if `isSelfLearner = true` AND `consentRecordId = null` on the snapshot, all toggles pass (except those explicitly restricted by the learner themselves via a `ConsentRestriction` row).

**Rationale:** A self-referential `ConsentRecord` (where the learner is their own consent-giver) is an awkward implementation of a logically simple concept: "I consent to my own capture." The bypass is cleaner. For audit purposes: the `SessionConsentSnapshot` row still exists (created at session start), records `consentRecordId = null`, and the `AccountHolder.isSelfLearner = true` flag in the DB provides the paper trail. COPPA does not apply to 18+ adults, so the VPC-evidence concern is absent.

**One audit addition:** when creating a snapshot for a self-learner, set a `selfLearnerConsent = true` boolean on the snapshot row (schema addition):

```prisma
// ADD to SessionConsentSnapshot:
selfLearnerConsent  Boolean  @default(false)  // true when isSelfLearner shortcut applied
```

This makes audits unambiguous: any snapshot with `consentRecordId = null AND selfLearnerConsent = true` is a self-managed adult, not a consent-bypass.

### Q-CGC-2: `allowNoteSending` rename

**Question:** Keep current name or rename to `allowTextExport` / `allowNotesAndTranscripts`?

**PROPOSED recommendation: Keep `allowNoteSending` as the DB column; display it to parents as "Allow [Tutor] to generate and share session notes and transcripts with you."**

**Rationale:** The column name is implementation-internal. Renaming at this stage (before Phase 3 executes) requires updating schema, migrations, and all references in the consent UI and assertions. The cost of renaming is real; the benefit (clearer column name) is marginal since consumers read the parent-facing label, not the column name. The label "Generate and share session notes and transcripts" is clear, accurate, and covers the full scope of text content export.

**Implementation note:** If the consensus shifts to rename before Phase 3 executor runs, `allowNotesAndTranscripts` is the preferred target name (more descriptive than `allowTextExport`). Make this call before Phase 3 dispatch; renaming after Phase 3 ships is a multi-step migration.

### Q-CGC-3: Sunset window for unclaimed real students post-V1

**Question:** Proposed 60 days (§4.4 of consent-gates-capture design). Shorter (30 days) is more aggressive on compliance; longer (90 days) is more pilot-friendly.

**PROPOSED recommendation: 90-day sunset window after V1 launch.**

**Rationale:** Sarah's pilot context makes the compliance risk during the window manageable: one tutor, known families, interim attestation gate in place, no anonymous public access. The 90-day window gives Sarah's families realistic time to complete the claim flow (families have competing priorities; a 60-day hard cutoff would likely result in disruption for real families who are slow to adopt). The 90-day window is still a meaningful deadline that creates urgency. After 90 days, unclaimed real students move to strict "no capture" mode — tutor is prompted to send a claim invite before any capture is re-enabled.

**Implementation:** a cron job (or admin dashboard filter) identifies students where:
- `Student.learnerProfileId = null` (unclaimed)
- At least one `WhiteboardSession` exists with `startedAt` within the last 90 days (recently active)
- V1 launch date is known

Tutor receives in-app notification at: 30 days, 14 days, 7 days, and cutoff.

### Q-CGC-4: Orphaned audio admin path

**Question:** Should there be an admin path to retroactively register IDB-preserved audio to a session if audio was captured before consent and the parent later grants consent?

**PROPOSED recommendation: Build a minimal admin-only path, but defer to post-Phase-3.**

**Rationale:** The IDB-preserved audio represents tutor effort that shouldn't be silently discarded if the consent situation is later resolved. An admin path preserves this optionality. However, the path is constrained by a practical reality: IDB data lives in the tutor's browser and expires if the browser is cleared. This makes the window of opportunity narrow and the path inherently manual. **Scope for the admin path:** a restricted API endpoint (`/api/admin/sessions/[wsid]/register-orphaned-audio`) callable only with ADMIN role, that accepts a list of audio segment descriptors (blob URLs already uploaded to Vercel Blob), verifies current consent is valid for the session's learner, and calls `SessionRecording.createMany`. The admin (Andrew) manually retrieves blob URLs from the tutor's IDB (via browser dev tools or a one-time export tool) and calls the endpoint.

**Phase-3 exclusion:** this admin path is NOT required for Phase-3 acceptance. It goes to the post-Phase-3 backlog. The primary value is a comfort feature for the pilot edge case.

### Q-CGC-5: Soft poll for mid-session consent change

**Question:** Should the workspace optionally poll effective consent every ~5 minutes and show a soft banner when parent revokes mid-session?

**PROPOSED recommendation: Defer indefinitely unless Sarah asks for it.**

**Rationale:** COPPA §312.6 keys "future collection" to the next collection event (next session start), not an in-flight session. The `SessionConsentSnapshot` freeze invariant is the legally defensible position. Adding a mid-session poll increases complexity, adds a network request on the hot path, and risks confusing Sarah during live tutoring (a banner mid-session would be alarming without context). If Sarah ever asks "can I know immediately when a parent changes consent?", revisit. Until then: no poll, no banner.

### Q-CGC-6: `captureAttestationAt` legacy column post-Phase-3

**Question:** After Phase 3 ships and the interim gate is retired, should `captureAttestationAt` be retained or dropped?

**PROPOSED recommendation: Retain permanently.**

**Rationale:** The column is a single nullable timestamp — negligible schema overhead. It provides an auditable trail of the pre-V1 pilot period during which tutor attestation was the sole consent mechanism. In a COPPA audit or a legal dispute about a session that occurred during the pilot, this record proves the tutor acknowledged their consent obligation at the time of capture. The cost of dropping it (a non-trivial migration with data-loss concerns) is higher than the cost of retaining it (essentially zero). Tag it in a schema comment: `// Legacy: pre-V1 pilot interim consent attestation. Retained as audit history post-Phase-3.`

---

## §6. Server-Side Enforcement Design

### 6.1 The enforcement stack (unchanged from consent-gates-capture design — restated for completeness)

```
Layer 1 — UI precondition gate
  • Recording toggle disabled if consentSnapshot.allowAudioRecording = false
  • Whiteboard-recording disabled if allowWhiteboardRecording = false
  • Notes/share disabled if allowNoteSending = false
  ↓
Layer 2 — assertEffectiveConsent (server action / API route)
  • Throws ConsentViolationError (HTTP 403) if permission absent
  ↓
Layer 3 — SessionConsentSnapshot (immutable, frozen at session start)
  • Authoritative court of record; no UPDATE endpoint
```

### 6.2 `assertEffectiveConsent` — complete signature (updated for new toggles)

```typescript
/**
 * Asserts that the given WhiteboardSession has a frozen SessionConsentSnapshot
 * with the specified permission set to true.
 *
 * Throws ConsentViolationError (HTTP 403) if:
 *   - No SessionConsentSnapshot exists for the session AND session has a claimed learner
 *   - The snapshot has the specified permission set to false
 *
 * Self-learner shortcut: if snapshot.selfLearnerConsent = true, all permissions
 * pass (adults self-manage; no COPPA concern).
 *
 * Unclaimed student (no snapshot): treated as "consent absent" → throws for
 * any capture permission; does NOT throw for allowLiveSession checks
 * (session can still run, just without capture).
 *
 * Logs: [cns] cns=<snapshotId|-> action=consent_check permission=<key>
 *       result=granted|denied sessionId=<id> reason=<no_snapshot|toggle_false|self_learner>
 */
async function assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: keyof Pick<SessionConsentSnapshot,
    | 'allowLiveSession'
    | 'allowAudioRecording'
    | 'allowWhiteboardRecording'
    | 'allowNoteSending'
    | 'allowEducationalUse'
    | 'allowMessaging'
    | 'allowVideoRecording'
  >
): Promise<void>
```

### 6.3 Where each assertion sits in the request path

| Action | Assertion(s) | Placement |
|---|---|---|
| Start session (`startWhiteboardSession`) | `assertOwnsStudent` + `freezeConsentSnapshot` | Before any DB write; consent freeze is inside the start transaction |
| Start recording (client toggle) | Layer 1 (UI gate) — `consentSnapshot.allowAudioRecording` checked at client mount | Client-side; no server round-trip for the toggle itself |
| End session + audio upload (`endWhiteboardSession`) | `assertEffectiveConsent(wsid, 'allowAudioRecording')` BEFORE the transaction; session-close still runs if consent absent | See consent-gates-capture §3.3 for the exact split |
| Generate/share notes (`generateSessionNotes`) | `assertEffectiveConsent(wsid, 'allowNoteSending')` | Top of the server action |
| Generate AI transcript | `assertEffectiveConsent(wsid, 'allowNoteSending')` | Top of the server action |
| Register whiteboard replay event stream | `assertEffectiveConsent(wsid, 'allowWhiteboardRecording')` | Before writing events.json replay blob |
| Send in-app message | `assertEffectiveConsent(wsid, 'allowMessaging')` OR `assertConversationConsent(conversationId, 'allowMessaging')` | For session-linked messages: use wsid; for async messages: check latest ConsentRecord |
| Mid-session swap (create Session B) | `assertOwnsStudent(tutor, studentAId)` + `assertOwnsStudent(tutor, studentBId)` + `freezeConsentSnapshot` for B | In the `/api/sessions/swap` server action |
| Parent accesses session recording | `assertOwnsLearnerProfile(accountHolder, learnerProfileId)` + check `consentSnapshot.allowAudioRecording` | In the recording access route |

### 6.4 Consent failure never wedges session-close

Per consent-gates-capture design §3.3, the `endWhiteboardSession` action is split:
1. Consent check (outside transaction) → if fails, log and proceed with `consentOkForAudio = false`
2. Session close transaction always runs (sets `endedAt`, revokes join tokens)
3. `SessionRecording.createMany` only runs if `consentOkForAudio = true`

**For the mid-session swap:** the same split applies in Phase 1 of the swap sequence. Session A always closes; audio registration is consent-gated but non-blocking for session close. If Session A's audio consent fails at swap time (edge case — should be unreachable if UI gate is correct), the swap proceeds: Session A closes without audio registration, Session B starts, and the tutor sees an error banner about the audio.

### 6.5 `allowLiveSession` gate — session admission

`allowLiveSession = false` is the "suspend access" state. The gate fires at:
1. **Session start** (`startWhiteboardSession`): if `effectiveConsent.allowLiveSession = false` for a claimed student, the session is NOT started. Error shown: "This student's account holder has suspended session access with you."
2. **Waiting room admission**: checked before `SessionParticipant.joinedAt` is set
3. **Mid-session swap**: checked in the pre-swap validation endpoint (if Student B's `allowLiveSession = false`, the swap is rejected before Phase 1 begins)

`allowLiveSession` does NOT block the tutor from viewing past sessions or accessing session notes/recordings (those are access-control questions, not session-start consent questions).

---

## §7. 5-Axis Adversarial Reliability Review

> This section is the mandatory adversarial review per AGENTS.md. BLOCKERs are folded into Phase-1/3 acceptance criteria.

### Axis 1 — Data Durability

| Risk | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Session A audio lost during mid-session swap (outbox timeout) | **BLOCKER** | Swap aborted if `drainOutboxOrTimeout` times out; IDB rows preserved; tutor shown error; no data lost | Phase 1/3 acceptance: test timeout path — confirm IDB rows NOT finalized on abort |
| Session B starts before Session A is fully closed (race) | **HIGH** | Phase 2 (Session B creation) is only initiated client-side AFTER Phase 1 Step 7 (`finalizeOutboxAfterEnd`) completes. Server-side: `endWhiteboardSession` sets `endedAt`; Phase 2 server action checks `wsidA.endedAt != null` before creating wsidB | Phase 3 acceptance: server validates Session A is ended before creating Session B |
| `SessionConsentSnapshot` for Session B lost if swap Phase 2 crashes mid-transaction | **HIGH** | `freezeConsentSnapshot` runs inside the swap server action's Prisma transaction. If the transaction rolls back, no Session B row exists. Client detects missing wsidB response and shows recovery error | Phase 3 acceptance: test transaction rollback path — confirm clean state |
| `allowWhiteboardRecording = false` but whiteboard events written for replay | **HIGH** | `assertEffectiveConsent(wsid, 'allowWhiteboardRecording')` must gate the events.json upload path (before writing replay blob) | Phase 3 acceptance: negative test — no events.json blob for replay if toggle false |
| `captureAttestationAt` column dropped prematurely | **MEDIUM** | Per Q-CGC-6 recommendation: retain permanently. Mark with schema comment | Architectural invariant |
| `selfLearnerConsent` column missing — self-learner bypass unauditable | **MEDIUM** | Add `selfLearnerConsent Boolean @default(false)` to `SessionConsentSnapshot` | Phase 3 acceptance |

**BLOCKER for Phase-3 acceptance (data durability):**
- `BLOCKER-D1:` Swap timeout path must NOT finalize Session A's IDB rows; must NOT create Session B. Test: simulate outbox timeout during swap → confirm IDB intact, Session A open, Session B not created.
- `BLOCKER-D2:` `allowWhiteboardRecording` must gate the events.json replay blob upload. Test: session with `allowWhiteboardRecording=false` → confirm no replay blob written.

### Axis 2 — Recovery / Durability

| Risk | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Swap Phase 2 fails (Session B creation error) after Session A is cleanly closed | **HIGH** | Workspace detects missing wsidB response and shows: "Session with [Student A] ended successfully. Failed to start session with [Student B]. Please navigate to [Student B]'s page to start manually." No data lost for Student A; Student B session starts manually | Phase 3 acceptance: test this path — confirm workspace in recoverable state |
| Network loss between Phase 1 Step 7 and Phase 2 (client side) | **HIGH** | Session A is durable (server has `endedAt`). On reconnect/reload, workspace detects `wsidA.endedAt != null` and shows the "Session ended" state. Tutor navigates to Student B manually | Architectural invariant (existing Pillar 3 durability applies) |
| Multi-tab: tutor has workspace open in two tabs, initiates swap from Tab 1 | **MEDIUM** | Tab 2 will attempt to interact with `wsidA` which is now ended. Tab 2 gets errors from the server (`endedAt != null` → read-only). Tab 2 shows "This session has ended" state. No data loss; tutor must reload Tab 2 | Phase 3 acceptance: test multi-tab scenario |
| Waiting room learner stuck if tutor never clicks "Admit" | **LOW** | Waiting room has a 10-minute timeout: if `startedAt` is not set within 10 minutes of learner arrival, learner sees: "Your session appears to be delayed. Please contact your tutor." No data stored for the pending session | Phase 3 design; implementation detail for executor |
| Consent snapshot read during high-load (stale read from replica) | **LOW** | `startWhiteboardSession` and the swap server action must read consent from the primary DB (Neon Prisma default is primary; ensure no read-replica routing for these mutations) | Architectural invariant — no read-replica routing for consent-freeze |

**BLOCKER for Phase-3 acceptance (recovery):**
- `BLOCKER-R1:` Swap Phase 2 failure path must leave workspace in a recoverable state (not stuck/hung). Test: mock Session B creation failure → confirm workspace shows recovery UI, not a hang.

### Axis 3 — Concurrency

| Race condition | Severity | Mitigation | Phase gate |
|---|---|---|---|
| Two simultaneous swap requests for the same session | **HIGH** | `WhiteboardSession.activeSwapId` column (§2.5) used as an optimistic lock. Swap server action first sets `activeSwapId = swapRequestId` (unique per request) in a conditional update (`WHERE activeSwapId IS NULL`). If the update hits 0 rows, another swap is in progress → 409 Conflict | Phase 3 acceptance |
| Consent change racing with mid-session swap (parent changes consent during swap sequence) | **LOW** | The consent freeze for Session B happens inside the swap server action (Phase 2). If the parent changes consent between the pre-swap validation (validate-swap endpoint) and the swap server action, the Phase 2 snapshot captures the LATEST consent (correct: the snapshot represents the actual consent at Session B's start time). The pre-swap validation result may show stale consent, but the actual snapshot is fresh | Architectural invariant — snapshot is always frozen at session-start time |
| Two sessions started for the same student simultaneously | **MEDIUM** | `WhiteboardSession` currently has no unique constraint preventing two active sessions for the same student. Add: unique partial index on `(studentId, endedAt IS NULL)` — only one active session per student | Phase 3 acceptance: add unique constraint |
| `endWhiteboardSession` called concurrently for the same session (double-click End) | **LOW** | Existing protection: `endedAt` is set in the transaction; a second call finds `endedAt != null` and is a no-op. The consent check before the transaction is idempotent. No new risk from the swap | Existing invariant |

**BLOCKER for Phase-3 acceptance (concurrency):**
- `BLOCKER-C1:` `activeSwapId` optimistic lock must prevent concurrent swaps. Test: simulate two simultaneous swap requests → second one must receive 409.
- `BLOCKER-C2:` Unique partial index on `(studentId, endedAt IS NULL)` to prevent two active sessions per student. Add migration.

### Axis 4 — Auth / Ownership Boundaries

| Boundary | Test required | Risk if broken |
|---|---|---|
| Tutor cannot swap a session they don't own to a student they don't own | Both `assertOwnsStudent(tutor, studentAId)` AND `assertOwnsStudent(tutor, studentBId)` must be called in the swap server action | Tutor A hijacks tutor B's session or students |
| `allowLiveSession=false` for Student B blocks swap | Pre-swap validation returns error; Phase 2 is never initiated | Minor's parent has suspended access; swap would bypass this |
| Session B's `SessionConsentSnapshot` must reflect Student B's consent, not Student A's | `freezeConsentSnapshot` called with `studentBId` explicitly, not derived from Session A's snapshot | Recording under wrong student's consent |
| `finalizeOutboxAfterEnd(wsidA)` must use wsidA, not wsidB | The swap sequence passes the correct wsid to finalize | Session A IDB rows leaking into Session B |
| Parent of Student A cannot access Session B's data (cross-student access) | `assertOwnsLearnerProfile(accountHolder, learnerProfileId)` gates session data access | Family A sees family B's session |
| `consentAcknowledged` (existing boolean) — does it gate the swap? | No — this is the tutor's UI-level checkbox, not the server-side gate. The server-side gate is `SessionConsentSnapshot`. The swap creates a new snapshot for Session B. | N/A — the existing boolean is orthogonal |

**BLOCKER for Phase-3 acceptance (auth):**
- `BLOCKER-A1:` Negative test for swap: tutor T1 cannot swap to a student belonging to tutor T2. Must return 403.
- `BLOCKER-A2:` Negative test: swap when `Student B.allowLiveSession = false` → must return 400/403 with clear error before Phase 1 begins.

### Axis 5 — Observability

All swap and consent events must emit structured log lines. Without this, debugging a mid-session consent failure in production is impossible.

| Event | Log line format | Prefix |
|---|---|---|
| Session created (pending) | `[slc] slc=<wsid> action=session_created studentId=<id> tutorId=<id>` | `slc` |
| Session started (waiting room → active) | `[slc] slc=<wsid> action=session_started` | `slc` |
| Learner arrives in waiting room | `[wtr] wtr=<waitId> wsid=<id> learnerProfileId=<id> action=learner_arrived` | `wtr` |
| Learner admitted from waiting room | `[wtr] wtr=<waitId> wsid=<id> action=learner_admitted` | `wtr` |
| Learner waiting room timeout | `[wtr] wtr=<waitId> wsid=<id> action=timeout elapsed_ms=<n>` | `wtr` |
| Mid-session swap initiated | `[slc] slc=<swapId> action=swap_initiated sessionA=<id> sessionB_pending studentA=<id> studentB=<id>` | `slc` |
| Swap Phase 1 complete (Session A finalized) | `[slc] slc=<swapId> action=swap_a_finalized wsidA=<id>` | `slc` |
| Swap Phase 2 complete (Session B started) | `[slc] slc=<swapId> action=swap_b_started wsidB=<id> allowAudio=<bool>` | `slc` |
| Swap aborted (outbox timeout) | `[slc] slc=<swapId> action=swap_aborted reason=outbox_timeout wsidA=<id>` | `slc` |
| Swap aborted (Session B creation failed) | `[slc] slc=<swapId> action=swap_aborted reason=session_b_failed wsidA=<id>` | `slc` |
| Session ended normally | `[slc] slc=<wsid> action=session_ended durationMs=<n>` | `slc` |
| Consent snapshot frozen | `[cns] cns=<snapshotId> action=frozen wsid=<id> allowAudio=<bool> allowWBRec=<bool>` | `cns` (existing) |
| Consent check granted | `[cns] cns=<snapshotId> action=consent_check permission=<key> result=granted` | `cns` (existing) |
| Consent check denied | `[cns] cns=<snapshotId\|-> action=consent_check permission=<key> result=denied reason=<no_snapshot\|toggle_false\|self_learner>` | `cns` (existing) |

**BLOCKER for Phase-3 acceptance (observability):**
- `BLOCKER-O1:` All `slc=` and `wtr=` log events above MUST be emitted before the session lifecycle feature ships to production. Without them, production debugging of a swap failure is impossible.

---

## §8. Sequencing + Log Prefixes

### 8.1 Where this design slots against Identity Phases

| Phase | Scope | Gate | New lifecycle/consent work |
|---|---|---|---|
| **Identity Phase 1** — Tutor 2FA | TOTP + backup codes + admin reset | BLOCKER: TOTP encrypted at rest | No lifecycle changes; no consent UI |
| **Identity Phase 2** — AccountHolder + LearnerProfile | Claim flow, auth, identity layer | BLOCKER: `assertOwnsLearnerProfile` exists + tested | `startedAt` column migration can ship here (non-breaking); waiting room UX can be scaffolded (behind a flag) |
| **Identity Phase 3** — Consent lattice | Full consent enforcement, `SessionConsentSnapshot`, consent UI | BLOCKER: Phase 2 complete; legal gate (consent toggle list confirmed) | **This design's Phase 3 additions:** `allowWhiteboardRecording`, `allowEducationalUse`, `selfLearnerConsent` columns; `freezeConsentSnapshot` logic; `assertEffectiveConsent` full implementation; waiting room admission gate; mid-session swap server action |
| **Identity Phase 4** — Access control swap | Replace anyone-with-link; `SessionParticipant`; authenticated join | Phase 3 complete | Waiting room: Phase 4 enables the authenticated join path; waiting room becomes fully functional (not just a polling stub) |

**Mid-session swap** is a Phase 3+ feature: it requires `SessionConsentSnapshot` to exist (Phase 3) and ideally `SessionParticipant` for the waiting-room join (Phase 4). The swap UI can be built in Phase 3 (using the `activeSwapId` optimistic lock and the swap server action) even before Phase 4's authenticated join — the swap itself doesn't require the learner to be present.

### 8.2 New log prefixes introduced by this design

| Prefix | Scope | Example log line | Register in |
|---|---|---|---|
| `slc` | Session lifecycle: created, started, ended, swap initiated/complete/aborted | `[slc] slc=<wsid> action=session_started` | `AGENTS.md` § Conventions + `RECORDER-LIFECYCLE.md` cheat sheet |
| `wtr` | Waiting room: learner arrived, admitted, rejected, timeout | `[wtr] wtr=<waitId> wsid=<id> learnerProfileId=<id> action=learner_arrived` | `AGENTS.md` § Conventions + `RECORDER-LIFECYCLE.md` cheat sheet |

**Collision check against existing registry:**
- Existing: `rid`, `wbsid`, `wba`, `obx`, `dft`, `snp`, `pvw`, `pvs`, `avx`, `cev`, `blb`, `brs`, `imp`, `att`, `ahx`, `lpr`, `clm`, `cns`, `tfa`, `msg`
- New: `slc`, `wtr`
- **No collision.**

---

## §9. Open Questions for Andrew

> This list is SHORT by design. All 6 consent-gates §9 questions are resolved above (§5). Only two genuinely require Andrew's decision and cannot be responsibly recommended-and-proceeded:

| # | Question | Gates | Context |
|---|---|---|---|
| **H-1** | **Canvas state on swap:** should Session B carry forward the tutor's in-memory whiteboard canvas state from Session A (recommended: YES), or start with a blank canvas? | Phase 3 mid-session swap UX | Carry-forward is the expected behavior for back-to-back same-topic students; fresh canvas is cleaner for topic switches. Sarah's workflow may vary. |
| **H-2** | **Swap in solo mode:** is a mid-session learner swap allowed when no learner has joined Session A yet (solo/whiteboard-only mode)? | Phase 3 mid-session swap UI | If YES, the swap is essentially "end an unused session and start a new one with a different student" — reasonable for tutor warming up the whiteboard. If NO, the "Switch Learner" button is hidden until a learner has joined. |

Everything else in this document is a PROPOSED recommendation for Andrew's ratification (specifically: the essentials-vs-optional split in §4.1, and the §5 resolutions).

---

## Appendix A — PROPOSED Essentials-vs-Optional Summary Table

For the orchestrator to surface to Andrew for quick ratification:

| Toggle | Tier | Default |
|---|---|---|
| Live whiteboard collaboration | **ESSENTIAL** (not a toggle) | N/A |
| Live A/V transport | **ESSENTIAL** (not a toggle) | N/A |
| Session metadata / billing | **ESSENTIAL** (not a toggle) | N/A |
| Account identity data | **ESSENTIAL** (not a toggle) | N/A |
| `allowAudioRecording` | **OPTIONAL** — RECOMMENDED | `false` (unchecked) |
| `allowWhiteboardRecording` | **OPTIONAL** — Recommended | `false` (unchecked) |
| `allowNoteSending` | **OPTIONAL** — Recommended | `false` (unchecked) |
| `allowEducationalUse` | **OPTIONAL** — Neutral | `false` (unchecked) |
| `allowMessaging` | **OPTIONAL** — Recommended | `false` (unchecked) |
| `allowVideoRecording` | **OPTIONAL** — NOT IN V1 | `false` (forward-compat only) |
| `allowLiveSession` | **Session access kill switch** (suspend-access, not a capture toggle) | `true` |

---

## Appendix B — Schema Additions Summary

All additions are additive; no drops or renames.

| Model | Addition | Purpose |
|---|---|---|
| `WhiteboardSession` | `startedAt DateTime?` | Pending → active state transition |
| `WhiteboardSession` | `activeSwapId String?` | Optimistic lock for concurrent swap prevention |
| `ConsentRecord` | `allowWhiteboardRecording Boolean` | Whiteboard replay recording consent |
| `ConsentRecord` | `allowEducationalUse Boolean` | Educational-use consent (spine-locked new toggle) |
| `SessionConsentSnapshot` | `allowWhiteboardRecording Boolean` | Frozen effective consent for replay recording |
| `SessionConsentSnapshot` | `allowEducationalUse Boolean` | Frozen effective consent for educational use |
| `SessionConsentSnapshot` | `selfLearnerConsent Boolean @default(false)` | Audit marker for self-learner bypass |
| `ConsentRestriction` | `restrictWhiteboardRecording Boolean @default(false)` | Child can restrict whiteboard replay |

---

## Appendix C — Invariants Verified as Preserved

| Invariant | Status |
|---|---|
| Pillar 1 (pure FSM) — no side effects inside `evaluateLifecycle` | ✅ Consent gate is a PRECONDITION before `tutorWantsRecording = true`; never inside the FSM |
| Pillar 2 (outbox) — `finalizeOutboxAfterEnd` only on confirmed server registration | ✅ Swap aborts if outbox drain fails; finalize only after successful `endWhiteboardSession` |
| Pillar 3 (atomic end-session) — session close never wedged by consent failure | ✅ Session close always runs; audio registration is consent-conditional but non-blocking for session close |
| Additive migrations only | ✅ All schema changes add columns; no drops or renames |
| Per-session ID logging mandatory | ✅ Two new prefixes: `slc`, `wtr` |
| Ownership assertions before any mutation | ✅ Both `assertOwnsStudent` calls in the swap server action; `assertOwnsLearnerProfile` for parent access |
| `SessionConsentSnapshot` immutability | ✅ No UPDATE endpoint; swap creates a new snapshot for Session B |
| PII/business-record separation | ✅ Session B creation uses `studentBId` FK only; LearnerProfile FK via Student; tombstoning path preserved |
| CSP tight | ✅ No new external origins introduced by this design |

---

*End of design document.*
