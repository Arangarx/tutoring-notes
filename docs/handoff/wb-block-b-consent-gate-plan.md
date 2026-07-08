# Block B — Client audio-consent gate implementation plan

> **Status:** Implementation plan (design doc only)  
> **Branch:** `wb-wave5-polish`  
> **Authored:** 2026-06-30  
> **Sarah-merge blocker:** `CLIENT-AUDIO-CONSENT-GATE` / `CONSENT-HONESTY-SARAH-MERGE-BLOCKER`  
> **Ratified behavior (do not re-litigate):** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) § Recent architectural decisions — Block B row; [`BACKLOG.md`](../BACKLOG.md) `CLIENT-AUDIO-CONSENT-GATE`.

**Goal:** When a student has **not** consented to audio (`SessionConsentSnapshot.allowAudioRecording === false`), their audio is **never** captured, uploaded, persisted (IDB / Blob), or transcribed. **Off means off.** Build once so Part 3 `p3-consent-recording` (per-speaker per-modality gating) extends this spine cleanly.

---

## Scope expansion (2026-06-30): consent-honesty blocker

Andrew ratified **CC-1** and **CC-2** (2026-06-30); consent-collection completeness is now a **Sarah-merge BLOCKER** alongside Block B. The expanded **consent-honesty blocker** has three parts:

| Part | Decision | Surface (indicative) |
|---|---|---|
| **(a) Block B capture gate** | `CLIENT-AUDIO-CONSENT-GATE` + 7a fail-closed-universal | This plan — workspace SSR + client gates + server defense |
| **(b) CC-1 session-start-requires-claimed** | No session without claimed `Student` | Session create/start in [`admin/students/[id]/whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) |
| **(c) CC-2 claim-consent-choice** | Claim requires explicit consent choice; always writes `ConsentRecord` + warning copy | Claim flow in [`app/claim/[token]/setup`](../../src/app/claim/[token]/setup) + complete route |

**CC-1 + CC-2 auto-resolve** the previously-open live-minor-join gating question: once a snapshot always exists post-claim, the existing join gate enforces `allowLiveSession` (all-off → live join denied) — no separate mechanism needed.

**Follow-up pass (not in this doc):** detailed hook-point planning for **(b)** and **(c)** is a short follow-up before execution. This plan remains scoped to **(a) Block B** only.

Cross-ref: [`BACKLOG.md`](../BACKLOG.md) `CONSENT-COLLECTION-COMPLETENESS`; [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) CC-1/CC-2 rows.

---

**Prerequisite reads:** [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md), [`src/lib/consent-scope.ts`](../../src/lib/consent-scope.ts), [`consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md).

---

## Executive summary

Today `allowAudioRecording` is enforced **only** at end-session `SessionRecording` registration ([`actions.ts:665-681`](../../src/app/admin/students/[id]/whiteboard/actions.ts)). Upstream paths are ungated: mic capture, Blob PUT, IndexedDB draft checkpoints, and mid-session OpenAI transcription all run before any check. Block B adds a **session-frozen consent projection** into the tutor workspace and a **minimal gate set** — primary control as early as possible (don't start capture), server paths as defense-in-depth with **mode-aware** semantics for remote vs in-person.

**No schema migration expected.** `SessionConsentSnapshot` and all consent booleans already exist ([`prisma/schema.prisma:1114-1128`](../../prisma/schema.prisma)).

---

## 1. Consent load into the client

### Recommendation: **SSR prop via `page.tsx`** (not client fetch)

| Approach | Verdict |
|---|---|
| **SSR prop** | **Preferred.** Snapshot is frozen at session creation; immutable for session lifetime. Matches existing SSR pattern (`sessionPhase`, `sessionMode`, `recordingDefaultEnabled`). Zero client waterfall; no extra server action surface. |
| Client fetch | Rejected for primary path. Extra round-trip, race on first paint, duplicates ownership assert already done in `page.tsx`. Acceptable only as fallback if SSR plumbing is blocked — not needed here. |

### Data flow

```
page.tsx (SSR)
  → WhiteboardSessionShell (pass-through)
    → WhiteboardWorkspaceClient (derive AudioCapturePolicy)
      → WhiteboardWorkspaceAudioBridge, lifecycle FSM inputs, mixdown reconcile
```

### Exact SSR change — `page.tsx`

**File:** [`src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx)

**Verified:** lines **69–111** load session detail but **not** consent. Current `select` (lines 73–88) omits `SessionConsentSnapshot`.

**Add to the existing `db.whiteboardSession.findUnique` `select`:**

```typescript
consentSnapshot: {
  select: {
    allowAudioRecording: true,
    consentRecordId: true, // distinguishes "snapshot exists" vs skipped
  },
},
```

**Ownership:** `assertOwnsWhiteboardSession(whiteboardSessionId)` at line 63 already runs before the detail query — reuse; no new assert helper required.

**Props to thread (new):**

| Prop | Type | Meaning |
|---|---|---|
| `initialAllowAudioRecording` | `boolean \| null` | `null` = no snapshot (unclaimed / no ConsentRecord); `true` / `false` = frozen effective value |
| `initialHasConsentSnapshot` | `boolean` | `consentSnapshot != null` — when `false`, policy is fail-closed-universal (§7a RATIFIED) |

Pass through [`WhiteboardSessionShell.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx) (tutor branch, lines 130–145) into `WhiteboardWorkspaceClient` `Props` (currently ends ~line 288).

**Whose consent:** The **session's student** — `SessionConsentSnapshot` is created for `(learnerProfileId, adminUserId)` at `createWhiteboardSession` ([`actions.ts:200-207`](../../src/app/admin/students/[id]/whiteboard/actions.ts) → [`consent-scope.ts:153-232`](../../src/lib/consent-scope.ts)). Tutor's own consent is unconditional (not snapshotted per tutor).

**Do not import `consent-scope.ts` on the client** — it is server-only (line 13). Pass plain booleans from SSR only.

---

## 2. Gating strategy — minimal gate set

Introduce a small **client-only** projection (new helper, e.g. `src/lib/recording/audio-capture-policy.ts`):

```typescript
type AudioCapturePolicy =
  | "full"           // consented — tutor + student in mixdown (remote) or single mic (in-person)
  | "tutor_only"     // remote, student audio consent denied — tutor mic + mixdown, student excluded
  | "none";          // in-person, student audio consent denied — no capture at all
```

**Derivation:**

| `initialAllowAudioRecording` | `sessionMode` | Policy |
|---|---|---|
| `true` | any | `full` |
| `false` | `IN_PERSON` | `none` |
| `false` | `LIVE` | `tutor_only` |
| `null` (no snapshot) | any | **`none` — fail-closed-universal** (§7a RATIFIED 2026-06-30) |

`sessionMode` is already client state from SSR ([`WhiteboardWorkspaceClient.tsx:1387-1388`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx)); use **activated** mode (persisted at Start). If tutor flips mode in waiting room before Start, activation writes final mode ([`actions.ts:257-281`](../../src/app/admin/students/[id]/whiteboard/actions.ts)).

### Hook-point gate matrix

| # | Hook | File:lines (verified) | Gate? | What it reads | Role |
|---|---|---|---|---|---|
| **A** | Recording start orchestration | [`WhiteboardWorkspaceAudioBridge.tsx:162-183`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge.tsx) | **YES — primary** | `policy !== "none"` AND `userWantsRecording` AND `recordingActive` | Don't call `handleStartRecording()` when `none`. For `tutor_only` / `full`, existing logic unchanged. |
| **B** | FSM `tutorWantsRecording` input | [`WhiteboardWorkspaceClient.tsx:2237-2248`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES — primary** | `policy !== "none"` AND `userWantsRecording && phaseActive` | Prevents `recordingActive` from going true when in-person denied. |
| **C** | `lifecycleInputStreams` tutor stream | [`WhiteboardWorkspaceClient.tsx:2046-2052`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES — primary** | `policy !== "none"` before `map.set(TUTOR_MIC_STREAM_ID, …)` | FSM `shouldCapture` never true for tutor mic when `none`. |
| **D** | `useAudioRecorder` `recordingDraft` option | [`WhiteboardWorkspaceClient.tsx:1750-1757`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES — primary** | Pass `recordingDraft: policy !== "none" ? { sessionId, streamId } : undefined` | Prevents IDB checkpoint scheduling at source ([`useAudioRecorder.ts:1215-1219`](../../src/hooks/useAudioRecorder.ts)). |
| **E** | Mixdown attach remote streams | [`WhiteboardWorkspaceClient.tsx:2315-2353`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES — remote surgical** | `policy === "full"` before `addRemoteAudio(p.audioStream)`; for `tutor_only`, skip attach OR attach with gain 0 immediately | Student never enters recording graph. **Note:** comment at 2316-2317 claims B2 enforcement here — **it is not implemented** (misleading comment only). |
| **F** | `setRemoteRecordingGain` reconcile | [`WhiteboardWorkspaceClient.tsx:2385-2398`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES — remote surgical** | `policy === "tutor_only"` → force gain `0` for all student streams; compose with `mutedPeerIdsInRecording` (OR muted set) | Wires existing unwired moderation path to consent. Live `<audio>` playback unaffected (invariant per 2379-2383). |
| **G** | `onWorkspaceAudioRecorded` outbox enqueue | [`WhiteboardWorkspaceClient.tsx:1669-1698`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **Defense-in-depth** | `policy !== "none"` | Should never fire when primary gates work; guard anyway. |
| **H** | Transcription enqueue (client) | [`WhiteboardWorkspaceClient.tsx:1726-1730`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **Defense-in-depth** | `policy !== "none"` (in-person); `policy !== "none"` (remote — tutor-only mixdown is OK to transcribe) | Same guard as G; remote `tutor_only` **should** enqueue (tutor speech only in blob). |
| **I** | IDB draft checkpoint | [`useAudioRecorder.ts:527-573`](../../src/hooks/useAudioRecorder.ts) | **Covered by D** | No `recordingDraft` → `startDraftCheckpointScheduling` never runs | Optional belt: early return in `checkpointDraftToStore` if a `consentAllowsCapture` ref is passed. |
| **J** | Blob upload on segment stop | [`useAudioRecorder.ts:1415-1471`](../../src/hooks/useAudioRecorder.ts) | **Covered by A** | MediaRecorder never started when `none` | Belt-and-suspenders: optional `onRecorded` no-op / abort upload if policy flipped mid-session (shouldn't happen — snapshot frozen). |
| **K** | Draft recovery scan / keep | [`WhiteboardWorkspaceClient.tsx:1772-1808`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx), [`1791-1822`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | **YES** | Skip scan when `policy === "none"`; on mount if denied, `draftStore.clear(…)` | Prevents re-upload of pre-fix drafts. |
| **L** | `enqueueChunkTranscriptionAction` | [`actions.ts:1465-1515`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | **YES — server defense** | Mode-aware: reject when `IN_PERSON` + snapshot `allowAudioRecording === false`; **allow** when `LIVE` + false (tutor-only path) | Today **no consent check** — confirmed. |
| **M** | `endWhiteboardSession` segment registration | [`actions.ts:665-681`](../../src/app/admin/students/[id]/whiteboard/actions.ts), [`736`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | **FIX — mode-aware** | Today blanket `assertEffectiveConsent` skips **all** segments when false — **wrong for remote** (blocks tutor-only mixdown). Replace with: `IN_PERSON` + false → skip; `LIVE` + false → **register** (client already excluded student). | |
| **N** | `registerWhiteboardSessionAudioSegmentAction` | [`actions.ts:1385-1386`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | **Same as M** | Unused in prod path but keep consistent | |
| **O** | `/api/upload/audio` route | [`src/app/api/upload/audio/route.ts`](../../src/app/api/upload/audio/route.ts) | **Optional defense** | Session-scoped check if `sessionId` added to token payload | Lower priority — browser PUT has no session id today; client gates are primary. Defer unless cheap. |

**FSM `shouldCapture`:** [`lifecycle-machine.ts:495-500`](../../src/lib/recording/lifecycle-machine.ts) — no change to machine; gates feed **inputs** (`inputStreams`, `tutorWantsRecording`) so `shouldCapture` stays a pure health predicate.

**Path correction vs prior investigations:** `lifecycle-machine.ts` lives at **`src/lib/recording/lifecycle-machine.ts`** (not `src/lib/lifecycle-machine.ts`). `TUTOR_MIC_STREAM_ID` / `studentMicStreamId` at **765-773**.

---

## 3. Remote-surgical mechanism (pre–Part 3)

### Today

- Single **mixdown** blob per session ([`WhiteboardWorkspaceClient.tsx:2287-2306`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx)).
- All remote `audioStream`s are attached via `addRemoteAudio` (2315-2353).
- `setRemoteRecordingGain(stream, 0|1)` exists (2385-2398) but is only driven by manual `mutedPeerIdsInRecording` (2029-2041) — **not wired to consent**.

### Block B (remote, `allowAudioRecording === false`)

1. **Do not attach** student stream to `recordingDest`, **or** attach with gain `0` from first frame (prefer **skip attach** + gain reconcile as backup — less graph work).
2. **Do not** add student streams to transcription-sensitive paths (client enqueue only fires for tutor-only mixdown segments).
3. **Live hearing unchanged** — `useLiveAV` / AVTile `<audio>` paths are independent of recording graph (see 2379-2383).

### Transcription lane

Mid-session chunks are the **mixed** recording stream. With student excluded from mixdown, OpenAI receives tutor-only audio — acceptable under remote-surgical semantics. Server `enqueueChunkTranscriptionAction` must **not** use blanket `assertEffectiveConsent(false)` — use mode-aware allow (§2 hook L).

### Composition with Part 3 `p3-consent-recording`

| Block B (now) | Part 3 (later) |
|---|---|
| Session-level `AudioCapturePolicy` from snapshot + mode | Per-speaker, per-modality lanes |
| Single mixdown; student excluded via gain 0 / no attach | Separate `MediaRecorder` or lane per speaker; consent matrix per stream |
| `streamId: TUTOR_MIC_STREAM_ID` hardcoded in outbox (1691) | `studentMicStreamId(peerId)` per peer; consent filters which streamIds enqueue |
| Mode-aware end-session registration | Per-stream consent on each `SessionRecording` row |

**Build-once rule:** Centralize policy in one module (`audio-capture-policy.ts`). Part 3 replaces internals but keeps the same **call sites** (bridge, lifecycle inputs, mixdown reconcile, `onRecorded`).

---

## 4. In-person all-or-nothing

When `sessionMode === "IN_PERSON"` and `allowAudioRecording === false`:

1. `AudioCapturePolicy = "none"`.
2. **Never** start tutor `MediaRecorder` (gates A, B, C, D).
3. Force honest UX: tutor must see that audio is off **before** expecting recording (§5).
4. `userWantsRecording` may still be true from `recordingDefaultEnabled` — **do not** silently record; either auto-clear intent on mount when `none` or keep toggle on but show banner that recording is blocked (prefer **banner + disabled recording state** over silent ignore).
5. End-session: no `SessionRecording` rows (existing skip path, correct for in-person).
6. Whiteboard capture / live A/V continue — only audio persistence is blocked.

**Rationale:** One physical mic captures both voices; inseparable → no session audio.

---

## 5. Honest tutor indicator

### Problem

End-session silently skips DB registration today (665-677) with only a server log — tutor sees normal recording UX while audio is discarded.

Also: `derivePresentation` computes `pillLabel` / `pillColor` ([`lifecycle-machine.ts:583-752`](../../src/lib/recording/lifecycle-machine.ts)) but the tutor top bar **does not use them** — it shows a hardcoded **"LIVE"** badge ([`WhiteboardWorkspaceClient.tsx:5751-5754`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx)).

### Recommendation (additive-only)

**Primary surface — banner stack** (existing pattern at 6116-6127):

Add a persistent `Banner` when `policy === "none"` OR (`policy === "tutor_only"` and phase active):

| Policy | Copy (draft — tune at implementation) |
|---|---|
| `none` (denied consent) | **Audio not recorded** — {studentName}'s parent has not allowed session audio. Whiteboard and live conversation continue. |
| `none` (no snapshot — §7a) | **Recording & notes off** — no audio consent on file for this student. Whiteboard and live conversation continue. Parent setup may be required before audio can be saved. |
| `tutor_only` | **Student audio not recorded** — only your microphone is included in the recording and notes. |

- `data-testid="wb-audio-consent-banner"`
- Tone: `warning` (matches autopause banners)
- Show in waiting room + active session (tutor only)

**Secondary surface (optional same commit or fast-follow):**

- Wire `presence.pillLabel` into top bar instead of hardcoded "LIVE" when `policy !== "full"` — e.g. pill "No audio" / "Tutor only". **Additive** change to JSX at 5751-5754 only; do not rewrite top bar layout.

**Do not** modify `evaluateLifecycle` / FSM states for consent — keep consent presentation **adjacent** to `derivePresentation` output in workspace JSX to honor whiteboard engine additive-only rule.

---

## 6. Copy drafts (DRAFT — Andrew approval required)

> **DRAFT** strings below are for approval only — **never auto-ship** per `LIVE-SESSION-CONSENT-COPY` / `CONSENT-HONESTY-SARAH-MERGE-BLOCKER`.

### `allowLiveSession` (covers live A/V **and** whiteboard recording)

**Surfaces to update:**

| Surface | File:lines |
|---|---|
| Parent consent editor | [`ParentConsentEditor.tsx:50-55`](../../src/app/account/children/[id]/consent/ParentConsentEditor.tsx) |
| Claim setup | [`ConsentSetupForm.tsx:16-18`](../../src/app/claim/[token]/setup/ConsentSetupForm.tsx) |

**DRAFT label:** Allow live tutoring sessions

**DRAFT description:** Your child can join real-time video and audio with this tutor, and everything drawn on the shared whiteboard during the session is saved for later review.

### `allowAudioRecording` (modality-agnostic — remote + in-person)

| Surface | File:lines |
|---|---|
| Parent consent editor | [`ParentConsentEditor.tsx:57-62`](../../src/app/account/children/[id]/consent/ParentConsentEditor.tsx) |
| Claim setup | [`ConsentSetupForm.tsx:21-23`](../../src/app/claim/[token]/setup/ConsentSetupForm.tsx) |

**DRAFT label:** Allow session audio recording

**DRAFT description:** Allows this tutor to record session audio for notes and review. For in-person sessions, one microphone captures everyone in the room. For online sessions, your child's voice is recorded separately from the tutor's. Live conversation is always available when live sessions are allowed — this toggle only controls what is saved.

### Hide `allowWhiteboardRecording` toggle

**Verdict (Block A):** Permission is **not enforced** in product — hide from UI.

| Surface | File:lines | Mechanism |
|---|---|---|
| Parent consent editor | [`ParentConsentEditor.tsx:64-70`](../../src/app/account/children/[id]/consent/ParentConsentEditor.tsx) in `PERMISSION_TOGGLES`; rendered **194-203** | Filter out `allowWhiteboardRecording` from mapped toggles (schema field retained) |
| Claim setup | [`ConsentSetupForm.tsx:26-28`](../../src/app/claim/[token]/setup/ConsentSetupForm.tsx) in `TOGGLES`; rendered **99-120** | Remove from `TOGGLES` array (keep `allowWhiteboardRecording: false` in POST body default) |

---

## 7. Open decisions for Andrew

### 7a. Fail-open vs fail-closed when there is **no** `SessionConsentSnapshot`

> **✅ RATIFIED (Andrew 2026-06-30): FAIL-CLOSED-UNIVERSAL on audio.** When a session has **no** `SessionConsentSnapshot` / no `ConsentRecord` (any cause), audio is **not** captured, uploaded, persisted, or transcribed — **"no consent record = assume no consent."** No minor-vs-adult classification is needed at capture time: properly-claimed adult self-learners receive an all-`true` snapshot (via `isSelfLearner`) so their audio still records; everyone without a record gets no audio. **Whiteboard stays unconditional**; the live session itself is **not** gated by this decision (see reachability finding below).

**Current behavior (pre-Block B):** [`assertEffectiveConsent`](../../src/lib/consent-scope.ts) lines **93-97** — no snapshot → **void (allow)**. Snapshot skipped when unclaimed (`consent-scope.ts:159-163`) or no ConsentRecord (`175-179`).

| Option | Client policy when `initialHasConsentSnapshot === false` | Pros | Cons |
|---|---|---|---|
| **Fail-open (status quo)** | Treat as `full` / allow capture | Unclaimed pilot students keep working; matches server `no_snapshot` pass | Minor audio may be captured before parent claims — COPPA risk; dishonest if we later enforce claim |
| **Fail-closed** | Treat as `none` (universal) | Honest; aligns with consent-gates-capture principle; closes all no-record paths uniformly | Unclaimed / no-record sessions lose audio + notes until consent is on file |

**Plan-author recommendation (superseded):** ~~Fail-open for Sarah pilot merge, with loud tutor banner.~~ **Overturned — Andrew ratified fail-closed-universal.**

**Blocker scope (added):** Tutor must get an unmistakable **"no consent on file → recording & notes off"** affordance when `initialHasConsentSnapshot === false` (banner per §5; distinct from denied-consent copy).

#### Reachability finding (2026-06-30)

Investigation overturned the assumption that *"you can't create a child learner without saving privacy toggles."* A minor's whiteboard session **can** exist with **no** consent record via three reachable paths:

1. **Claim completion without consent save** — claim links `Student`→`LearnerProfile` but does **not** write a `ConsentRecord`; consent save is a separate optional POST (`/api/claim/[token]/setup` `action="consent"`). A parent can finish claim without ever saving consent.
2. **Parent-create-learner** — `createChildLearnerAction` writes **no** `ConsentRecord`; dashboard `ParentConsentEditor` is preview-only / not wired (B2 Step 6 deferred).
3. **Highest pilot likelihood** — tutor creates a `Student` and runs a session **before** parent claims → no `learnerProfileId` → snapshot skipped (`consent-scope.ts:159-163`) → system **cannot** classify the student as a minor at session-create (no DOB/age on `Student`, no `isSelfLearner`). Unclaimed is indistinguishable from adult self-learner.

**Additional exposure (live join, not audio capture):** join gate ([`join/[sessionId]/page.tsx:219-228`](../../src/app/join/[sessionId]/page.tsx)) only denies a minor's **live** join when a snapshot **exists** and `allowLiveSession=false`; a **missing** snapshot → join **allowed**. An unconsented minor can currently **join** a live session. Fail-closed (7a) protects **recording**, not live streaming.

**Impact:** 7a fail-closed-universal closes the **audio-capture** exposure through all three holes. **CC-1 + CC-2 ratified 2026-06-30** — consent-collection completeness is now a Sarah-merge **BLOCKER** (holes (1)+(3) closed; live-minor-join auto-resolved). Remaining sub-item: parent-created-learner / B2 Step 6 scope — **PENDING Andrew** (see [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) HEAD; [`BACKLOG.md`](../BACKLOG.md) `CONSENT-COLLECTION-COMPLETENESS`).

### 7b. Other forks (confirm, do not assume)

| Topic | Current code | Plan assumption |
|---|---|---|
| **Self-learner adults** (`isSelfLearner`) | Snapshot created with all `true` ([`consent-scope.ts:183-198`](../../src/lib/consent-scope.ts)); `assertEffectiveConsent` auto-pass ([113-118](../../src/lib/consent-scope.ts)) | SSR receives `allowAudioRecording: true` — no special client branch |
| **Tutor's own consent** | Not modeled — tutor is account holder | Unconditional; tutor mic always eligible in remote `tutor_only` |
| **Mode flip after Start** | Mode persisted at activation | Policy uses **DB `sessionMode` at SSR**; if tutor changes mode only in waiting room, activation persists final choice — OK. Mid-session mode flip is **not supported** today — no open decision |
| **End-session vs remote-surgical** | Blanket deny blocks tutor audio | **Must fix** in Block B (§2 hook M) — otherwise remote fix is incomplete |

---

## 8. Test plan

### Hard-won lesson

A fail-closed negative test alone can hide a **wiring bug** on the success path. Every denial test must be paired with a **positive-path test** that asserts capture/upload/enqueue **does** fire when consented.

### Negative path (`allowAudioRecording: false`)

| Assertion | Where |
|---|---|
| No `MediaRecorder` start / `handleStartRecording` | Jest DOM: mock `useAudioRecorder`, mount workspace with `policy none` |
| No Blob PUT | Mock `uploadAudioDirect` — expect zero calls |
| No IDB draft write | Mock `getOrCreateRecordingDraftStore().checkpoint` — zero calls |
| No `enqueueChunkTranscriptionAction` | Mock server action — zero calls |
| No `SessionRecording` row | Existing [`consent-b2.test.ts`](../../src/__tests__/identity/consent-b2.test.ts) pattern + end-session integration |

### Positive path (`allowAudioRecording: true`)

| Assertion | Where |
|---|---|
| `handleStartRecording` called when `recordingActive` | Jest DOM |
| `uploadAudioDirect` called on segment stop | Unit / DOM |
| `enqueueChunkTranscriptionAction` invoked | Mock spy |
| `SessionRecording` rows created on end | Integration / existing consent tests |

### Remote-surgical (`LIVE`, denied, tutor consented implicitly)

| Assertion | Where |
|---|---|
| Tutor mic records; `addRemoteAudio` not called OR gain 0 | Jest + **Playwright / real browser** for Web Audio graph |
| Transcription enqueue **fires** (tutor-only blob) | Mock spy — **must pass** |
| End-session **registers** segments | Server test with `sessionMode: LIVE` |

### In-person (`IN_PERSON`, denied)

| Assertion | Where |
|---|---|
| No audio capture at all | Jest DOM |
| Consent banner visible | `data-testid="wb-audio-consent-banner"` |
| End-session skips segments | Server test |

### Runtime requirements

| Layer | Tool |
|---|---|
| Policy derivation, FSM inputs, action guards | **Jest** (`src/__tests__/recording/audio-capture-policy.test.ts` — **new named regression**) |
| DOM bridge / banner | **Jest jsdom** |
| Mixdown gain / Web Audio attach | **Playwright** (`tests/integration/…`) or hardware smoke — jsdom blind spot |
| Full session lifecycle | **`npm run test:wb-sync`** at merge boundary |

---

## 9. Commit sequencing + blast radius

### Suggested commits (one concern each)

| # | Commit | Files (indicative) | Blast radius |
|---|---|---|---|
| 1 | `feat(consent): SSR load SessionConsentSnapshot into workspace` | `page.tsx`, `WhiteboardSessionShell.tsx`, `WhiteboardWorkspaceClient.tsx` props | Low — read-only SSR additive |
| 2 | `feat(consent): audio capture policy + primary client gates` | `audio-capture-policy.ts`, `WhiteboardWorkspaceClient.tsx`, `WhiteboardWorkspaceAudioBridge.tsx` | **High** — recording start path |
| 3 | `feat(consent): remote-surgical mixdown + mode-aware server registration` | mixdown effects 2315-2398, `actions.ts` end-session + transcription | **High** — server + Web Audio |
| 4 | `feat(consent): honest tutor audio-consent banner` | workspace banner JSX ~6116 | Low — UI only |
| 5 | `feat(consent): hide WB recording toggle + DRAFT copy` | `ParentConsentEditor.tsx`, `ConsentSetupForm.tsx` | Low — consent UI |
| 6 | `test(consent): Block B audio-capture-policy regression suite` | new tests | None prod |

### Extended later by `p3-consent-recording`

- Per-speaker `streamId` in outbox (replace 1691 hardcode)
- Per-lane MediaRecorder / VAD chunking
- Per-stream consent matrix (student video, separate mics)
- Replay scrub per speaker

**Do not** merge Block B with Part 3 execution — land Block B first as Sarah blocker.

### Constraints checklist

| Constraint | Plan compliance |
|---|---|
| Additive-only whiteboard engine | Consent gates are new inputs + JSX banners; no FSM rewrite |
| No migration | Confirmed — snapshot exists |
| `assertOwnsStudent` / `assertOwnsWhiteboardSession` on server mutations | Hooks L, M, N |
| No secret egress | Denied path must not call OpenAI — gate H, L |
| Playwright on fix | Mixdown / gain tests in integration spec |
| Composition over duplication | Single `audio-capture-policy.ts` reused at all gate sites |

---

## Appendix — hook-point verification log

| Prior reference | Verified @ `wb-wave5-polish` | Delta |
|---|---|---|
| `page.tsx:69-111` no consent | **Correct** | — |
| `consent-scope.ts:153-232` snapshot | **Correct** | — |
| `actions.ts:200-207` create snapshot | **Correct** | — |
| `WhiteboardWorkspaceAudioBridge.tsx:162-183` | **Correct** (path under `workspace/`) | — |
| `WhiteboardWorkspaceClient.tsx:2237-2257` recordingActive | **Correct** (2248 evaluate, 2257 assign) | — |
| `useAudioRecorder.ts:1415-1471` upload before gate | **Correct** | — |
| `WhiteboardWorkspaceClient.tsx:1669-1698` outbox | **Correct** | — |
| `useAudioRecorder.ts:527-573` IDB draft | **Correct** | — |
| `WhiteboardWorkspaceClient.tsx:1772-1808` draft recovery | **Correct** | — |
| `WhiteboardWorkspaceClient.tsx:1726-1730` transcription | **Correct** | — |
| `actions.ts:1465-1515` no consent on txc | **Correct** | — |
| `actions.ts:665-681` end-session gate | **Correct** but **insufficient for remote** | Needs mode-aware fix |
| `WhiteboardWorkspaceClient.tsx:2385-2398` gain | **Correct**, unwired | Wire to consent |
| `lifecycle-machine.ts:495-500` | **Path corrected** → `src/lib/recording/lifecycle-machine.ts` | — |
| `WhiteboardWorkspaceClient.tsx:2316-2317` "enforced here" | **Wrong** — comment only, no gate | Fix comment + implement |

---

## References

- [`BACKLOG.md`](../BACKLOG.md) — `CLIENT-AUDIO-CONSENT-GATE`, `CONSENT-HONESTY-SARAH-MERGE-BLOCKER`, `LIVE-SESSION-CONSENT-COPY`
- [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — Block B ratification 2026-06-30
- [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — three pillars
- [`consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) — enforcement stack (UI + server + snapshot)

---

## Phase-1 acceptance addendum — 5-axis review (2026-06-30)

The following findings from the Sonnet 5-axis adversarial review are **folded into Phase-1 acceptance** for this plan. See [`consent-blocker-5axis-review-2026-06-30.md`](consent-blocker-5axis-review-2026-06-30.md) for full detail and remediations.

- **B-5** — `enqueueChunkTranscriptionAction` mode-aware consent check
- **B-6** — `endWhiteboardSession` mode-aware — do NOT drop tutor's own audio on LIVE+student-denied
- **H-6** — `registerWhiteboardSessionAudioSegmentAction` same mode-aware fix, same commit as B-6
- **H-4** — IDB draft cleared not re-uploaded when policy=none
- **M-3** — waiting-room policy re-derived from locally-selected mode
- **M-6** — `endWhiteboardSession` fail-closed when no snapshot for claimed learner
- **L-3** — BACKLOG: `allowWhiteboardRecording` frozen-false schema debt

**Required new tests:** T-new-D, T-new-E, T-new-G
