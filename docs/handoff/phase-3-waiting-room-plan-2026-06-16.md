# Phase 3 — Mutual waiting room + retire consent click: Detailed Executable Plan

> **Branch:** `phase3/wb-waiting-room` (fork off `v1-redesign` **after** P2 smoke PASS + `merge --no-ff`)  
> **Program:** Live-session floor — [`live_session_floor`](../../../.cursor/plans/live_session_floor_2e662852.plan.md) P3 (largest / highest-risk floor phase)  
> **Authored:** 2026-06-16 (planning pass — **no P3 production code in this commit**)  
> **Parent context:** [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md); P2 [`phase-2-student-on-new-shell-plan-2026-06-16.md`](phase-2-student-on-new-shell-plan-2026-06-16.md) + [`docs/WHITEBOARD-P2-STATUS.md`](../WHITEBOARD-P2-STATUS.md) (on `phase2/wb-student-new-shell` until merged)  
> **Design refs:** [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md); [`whiteboard-session-shell-design-2026-06-08.md`](whiteboard-session-shell-design-2026-06-08.md); shell mock [`docs/brand-previews/whiteboard-session-shell-mock-2026-06-08.html`](../brand-previews/whiteboard-session-shell-mock-2026-06-08.html)  
> **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)  
> **Status:** Planning complete — **5-axis review follows separately**; **EXECUTION GATED** on (a) P2 smoke PASS + merge and (b) explicit Andrew greenlight. **Destructive Neon test-account migration must NOT run unattended.**

---

## ⛔ EXECUTION GATES (read first)

| Gate | Requirement |
|---|---|
| **G1 — P2 landed** | `phase2/wb-student-new-shell` smokebook PASS + `merge --no-ff` into `v1-redesign`. P3 builds on P2's unified shell (`WhiteboardSessionShell` student union, `StudentLiveWorkspaceClient`, `LiveBoardChrome`). |
| **G2 — Andrew greenlight** | Explicit go before **any** P3 code, **any** shared Neon destructive migration, or deleting `CONSENT_ENFORCEMENT`. |
| **G3 — 5-axis review** | Independent adversarial review of **this plan** completes; BLOCKERs folded into §8 acceptance before executor dispatch. |
| **G4 — Destructive DB** | Test-account forward-migration (§6) runs only after dry-run + Andrew confirms inventory row-by-row. Never on production Sarah data paths without explicit keep-list. |

---

## ⛔ HARD CONSTRAINT — extend don't rewrite

**Tutor live engine (`WhiteboardWorkspaceClient.tsx`) is ADDITIVE-ONLY for P3 waiting→live.**

P3 adds **waiting mode** around the live subtree; it does **not** rewrite sync, `pageDataRef`, recorder FSM wiring, or v3 wire.

| Allowed | Forbidden |
|---|---|
| New `WaitingRoomWorkspace.tsx` / `WbWaitingRoomChrome.tsx` composing `useLiveAV` preview + consent UI | Rewriting page switch, recording FSM, or sync paths inside `WhiteboardWorkspaceClient.tsx` |
| Additive `WhiteboardSessionShell` `mode === "waiting"` branch + `sessionPhase` props | Behavioral changes to tutor page switch, v3 apply chain, or `handleEndSession` ordering |
| Server `startSession` / admit endpoint + schema columns | Mounting Excalidraw live engine while `sessionPhase === "pending"` |
| Gate FSM `tutorWantsRecording` + `shouldCaptureWB` on `sessionPhase === "active"` | Mid-session learner swap UI (deferred P4+; schema `activeSwapId` may land additively but swap UX is out of scope) |

**Executor pre-flight:** `git diff` on `WhiteboardWorkspaceClient.tsx` must be **surgical** (new props/guards only; zero behavioral edits to existing live paths unless a P3 bug forces a one-line guard).

---

## 1. Goal + scope

### Goal

Implement the **mutual waiting room** (tutor + student both present before live board mounts), backed by a real **session lifecycle state machine** (`pending` → `active`), **unconditional consent enforcement** (retire tutor consent click + `CONSENT_ENFORCEMENT` flag), and **timer realignment** (billable clock starts at synchronized waiting→live, not student link-open).

### Baked-in decisions (from [`live_session_floor`](../../../.cursor/plans/live_session_floor_2e662852.plan.md) — do not re-litigate)

| ID | Decision |
|---|---|
| **P3-a** | Add `sessionPhase` (`pending` \| `active`) + `sessionMode` (`live` \| `in_person`); server `start`/admit endpoint is **source of truth** for waiting→live. |
| **P3-b** | **Block all capture** while `sessionPhase === "pending"` (audio FSM, whiteboard replay events, notes generation). Live stroke sync + live A/V transport in waiting room = essential (preview), not capture. |
| **P3-c** | Shell `mode === "waiting"` = mutual waiting room: A/V device preview (`useLiveAV`), consent assessment (`SessionConsentSnapshot`), in-person declaration (tutor-only capture; project student privacy toggles onto tutor side for in-person). |
| **P3-d** | **Synchronized start** — both sides transition to live only after server admits; `[wtr]` / `[slc]` logging; timer realigned to admit moment. |
| **P3-e** | **Delete `CONSENT_ENFORCEMENT`** — enforcement unconditional; feature branch is rollback. Wire parent-edit POST + whiteboard-recording gate. |
| **P3-f** | **No backwards-compat / no unclaimed fallback** — require `Student.learnerProfileId` + `ConsentRecord` to run a session. One-time destructive forward-migration of shared Neon **test** accounts (§6). |
| **P3-g** | Retire tutor consent click (`StartWhiteboardSession.tsx` modal, `createWhiteboardSession` `consentAcknowledged` gate, `workspace/page.tsx` re-check). |
| **P3-h** | **`allowEducationalUse` toggle = DEFER** (schema may exist from B2; no new UI/enforcement surface in P3). |
| **(c)** | Keep `/w/[joinToken]` hybrid backup path (Andrew 2026-06-14). P3 changes student entry from straight-to-live → waiting-first, not URL retirement. |
| **(e)** | Student self-view ON default (P2; unchanged in waiting room preview). |

### In scope

- Additive Prisma migration: `sessionPhase`, `sessionMode`, nullable `startedAt` semantics, `SessionParticipant` model, optional `activeSwapId` (schema only; swap UX deferred).
- Server actions/routes: `createWhiteboardSession` creates **pending** sessions; new `startWhiteboardSession` / `POST /api/whiteboard/[id]/start` admit endpoint.
- Block capture while pending (FSM precondition + server assertions).
- `WhiteboardSessionShell` third mode: `"waiting"` (tutor + student).
- Waiting room UI per shell design + mock (A/V preview, consent display, in-person declaration, synchronized start affordance).
- Presence: tutor sees student arrived; student sees tutor ready; polling or sync presence for admit signal.
- Timer: stop stamping `bothConnectedAt` on student link-open; start `activeMs` accumulation only after `sessionPhase → active`.
- Consent: delete flag; hard-require learner profile; wire `POST /api/account/children/[id]/consent` (or server action equivalent); gate `allowWhiteboardRecording` on events upload path.
- Retire consent click UI + server gates.
- Destructive test-account migration script with dry-run (§6).
- Register `wtr` + `slc` in `AGENTS.md` (same commit as first log line).
- `docs/WHITEBOARD-P3-STATUS.md` + smokebook at Step 9.
- Unit + `test:wb-sync` scenarios + two-device smoke matrix (§7).

### Out of scope (P4+)

- Mid-session learner swap UI + `/api/sessions/swap` (design in [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §3; BLOCKERs listed in [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — **not P3**).
- Authenticated `/join/[sessionId]` learner route (Phase 4 access-control swap; P3 keeps anonymous `/w/[joinToken]` as primary student entry).
- `allowEducationalUse` UI + enforcement.
- Retiring `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL` / legacy `StudentWhiteboardClient` (P2 Step 9 — separate gate).
- Backend spine: A6-1 multi-segment replay, `phase1/wb-reliability-floor` 1b clock merge, note-quality map/reduce (parked until floor P1–P3 smokeable).
- Waiting room 10-minute learner timeout (design §2.6 — optional P3.1 if time; default defer unless 5-axis mandates).
- Parent mid-session consent poll / banner (design §5 Q-CGC-5 — defer).

---

## 2. Current state

> **Branch note:** Line refs below are `v1-redesign` @ planning time. P2 shell files (`StudentLiveWorkspaceClient`, student union on `WhiteboardSessionShell`) live on `phase2/wb-student-new-shell` @ `93d71ca` until merged — P3 executor rebases onto post-P2 `v1-redesign`.

### Session lifecycle (no waiting room today)

| Piece | Location | Behavior today |
|---|---|---|
| Session create | [`createWhiteboardSession`](../../src/app/admin/students/[id]/whiteboard/actions.ts) L73–246 | Creates row with `startedAt @default(now())` → **immediately "active"**; `consentAcknowledged` required; freezes `SessionConsentSnapshot` in same transaction; redirects straight to workspace **live**. |
| Tutor consent click | [`StartWhiteboardSession.tsx`](../../src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx) L31–198 | Modal checkbox → `consentAcknowledged` form field. |
| Workspace re-check | [`workspace/page.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx) L71–73 | `notFound()` if `!consentAcknowledged`. |
| Shell modes | [`WhiteboardSessionShell.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx) L8–10, L34 | `live` \| `review` only; comment: `waiting` reserved. |
| Student join | [`w/[joinToken]/page.tsx`](../../src/app/w/[joinToken]/page.tsx) L88–99 | Stamps `bothConnectedAt` on first link-open → **timer starts too early**. Renders straight to live board (legacy or P2 shell). |
| Timer API | [`join-timer/route.ts`](../../src/app/api/whiteboard/[sessionId]/join-timer/route.ts) L88–108 | Returns `activeMs` / `lastActiveAt`; no `sessionPhase` awareness. |
| Active ping | [`active-ping/route.ts`](../../src/app/api/whiteboard/[sessionId]/active-ping/route.ts) L126–132 | Stamps `bothConnectedAt` on first positive ping — must align with new admit semantics. |
| Prisma session row | [`schema.prisma`](../../prisma/schema.prisma) L266–344 | `startedAt DateTime @default(now())`; `consentAcknowledged Boolean`; `bothConnectedAt DateTime?`; **no** `sessionPhase` / `sessionMode`. |
| Visual stubs | [`LearnerWaitingRoom.tsx`](../../src/components/student/LearnerWaitingRoom.tsx) L23–24 | `state` prop visual-only; no presence/admit. [`join/page.tsx`](../../src/app/join/page.tsx) L34–36 — `?preview=admitted` dev toggle only. |

### Consent (implemented but dormant)

> **Consent consolidation (Andrew 2026-06-17):** the P3 waiting room is the SINGLE consent surface for BOTH tutor and student. Interim (pre-P3): student A/V auto-enables with NO new in-app consent dialog — only the browser permission dialog + the existing recording-disclosure line. When P3 lands: the waiting room owns consent AND the EXISTING tutor consent dialog is REMOVED (do not keep two consent surfaces). (Resolves M1 from the parity adversarial review as proceed-as-is.)

| Piece | Location | Behavior today |
|---|---|---|
| Flag | [`consent-scope.ts`](../../src/lib/consent-scope.ts) L56–59 | `isConsentEnforcementEnabled()` reads `CONSENT_ENFORCEMENT`; **default OFF**. |
| Session assert | [`consent-scope.ts`](../../src/lib/consent-scope.ts) L90–159 | Flag OFF → void; no snapshot → **pass** (unclaimed fallback); self-learner auto-pass. |
| Snapshot freeze | [`consent-scope.ts`](../../src/lib/consent-scope.ts) L176–256 | Always runs on create; skipped when `!learnerProfileId` or no `ConsentRecord`. |
| Live session block | [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) L134–156 | `allowLiveSession` check **only when flag ON**. |
| Audio register | [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) L1273, L601 | `assertEffectiveConsent(..., allowAudioRecording)` — flag-gated. |
| Notes generate | [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) L977 | `assertEffectiveConsent(..., allowNoteSending)` — flag-gated. |
| **Whiteboard replay gate** | — | **`allowWhiteboardRecording` NOT wired** to events.json upload or FSM `shouldCaptureWB` (BLOCKER-D2 from lifecycle design). |
| Parent edit save | [`ParentConsentEditor.tsx`](../../src/app/account/children/[id]/consent/ParentConsentEditor.tsx) L137–139, L269 | `handlePreviewSave` sets local state only; toast says visual-first. |
| Claim flow POST | [`api/claim/[token]/setup/route.ts`](../../src/app/api/claim/[token]/setup/route.ts) | Working reference for consent POST shape. |
| B2 schema | [`schema.prisma`](../../prisma/schema.prisma) L1039–1098 | `ConsentRecord`, `ConsentRestriction`, `SessionConsentSnapshot` **exist** (merged B2). |
| Participant stub | [`session-participant-scope.ts`](../../src/lib/session-participant-scope.ts) L36–47 | Always `notFound()` — `SessionParticipant` **not in schema**. |

### Recorder pillars (must survive sync-start)

| Piece | Location | Behavior today |
|---|---|---|
| FSM | [`lifecycle-machine.ts`](../../src/lib/recording/lifecycle-machine.ts) L320, L506 | `shouldCaptureWB` = `recordingActive`; no `sessionPhase` input. |
| Workspace integration | [`WhiteboardWorkspaceClient.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) ~L1680 | `tutorWantsRecording` drives FSM; recording can arm on workspace mount. |
| End session | [`RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) | Pillar 3 atomic sequence unchanged; P3 adds **precondition** that admit happened before arming. |

### P2 foundation (post-merge)

| Piece | Location | Behavior today (P2 branch) |
|---|---|---|
| Student shell | `phase2` → `StudentLiveWorkspaceClient.tsx` | `LiveBoardChrome`, `useLiveAV`, `useStudentWhiteboardCanvas`, straight-to-**live**. |
| Shell union | `phase2` → `WhiteboardSessionShell.tsx` L46–62 | `role: "student"` \| `"tutor"` discriminated union. |
| Flag | `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL` | Gates new vs legacy student client. |

### Gap summary

| Gap | Impact |
|---|---|
| No `pending` state | Session is live + capturable before mutual ready. |
| Timer on link-open | Billable clock diverges from Sarah's "both in room" expectation. |
| Consent flag + unclaimed fallback | COPPA gap; tutor click substitutes for parent toggles. |
| No waiting UI in shell | Student/tutor land on board immediately (P2). |
| WB replay not consent-gated | Strokes captured without `allowWhiteboardRecording`. |
| No parent consent POST | Parents cannot change toggles after claim. |

---

## 3. Target architecture

### State machine (server source of truth)

```
createWhiteboardSession
        │
        ▼
  sessionPhase = pending
  sessionMode  = live | in_person  (tutor selects at create)
  startedAt    = null
  capture      = BLOCKED
        │
        │  both sides in waiting room (A/V preview, consent display)
        │
        ▼
POST startWhiteboardSession / admit
  (preconditions: assertOwnsSession; bothPresent OR tutor solo-start policy;
   consentSnapshot.allowLiveSession; learnerProfile required)
        │
        ▼
  sessionPhase = active
  startedAt    = now()   (first time only)
  activeMs clock may begin (bothConnectedAt / active-ping policy §5)
  capture      = per snapshot toggles
        │
        ▼
  shell mode = live  →  WhiteboardWorkspaceClient / StudentLiveWorkspaceClient
```

### Shell contract (three modes)

```typescript
type ShellMode = "waiting" | "live" | "review";

// Tutor: server passes initialMode from sessionPhase + endedAt
// Student: join page passes "waiting" until join-timer/admit poll says active

// WhiteboardSessionShell (additive):
//   waiting → WaitingRoomWorkspace (role=tutor|student)
//   live    → existing P2 paths
//   review  → SessionReviewMode (tutor only)
```

### Mode transitions

| From | To | Trigger |
|---|---|---|
| `waiting` | `live` | Server admit success + client poll observes `sessionPhase === "active"` |
| `live` | `review` | Existing `handleEndSession` → `onSessionEnded` (tutor) |
| `waiting` | ended | Cancel / End while pending — special case: end without capture (§5.4) |

> **Waiting room is an OVERLAY, not a separate page (Andrew 2026-06-17):** the `waiting` -> `live` transition MUST be an in-place **overlay dismiss that smoothly REVEALS the already-mounted whiteboard** -- NOT a route change or a separate page that then loads the board. Same flowing-experience model as the notes hero/docked transition (compose its overlay/transition approach -- no bespoke, per `.cursor/rules/composition-no-duplication.mdc`). Implications: (a) the whiteboard workspace mounts with the waiting-room overlay layered on top; admit = fade/dismiss the overlay, NOT navigate; (b) because there is no page transition, **enabling/disabling audio & video happens in the same mounted context** -- A/V toggles never trigger navigation and media/session state persists across the waiting->live reveal (the on-mount A/V acquisition the student shell already does stays put -- win/win); (c) applies to BOTH tutor and student waiting-room experiences. **This refines the Shell contract + Mode transitions above:** prefer a single mounted workspace with a `waiting` overlay layer over swapping `WaitingRoomWorkspace` <-> `WhiteboardWorkspaceClient` as distinct mounted route trees.

### Logging registry (extend [`AGENTS.md`](../../AGENTS.md) in implementation commit)

| Prefix | Scope | Example |
|---|---|---|
| **`slc`** | Session lifecycle | `[slc] slc=<wbsid> action=session_created phase=pending mode=live` |
| **`slc`** | Admit | `[slc] slc=<wbsid> action=session_started startedAt=<iso>` |
| **`wtr`** | Waiting room | `[wtr] wtr=<wbsid:8> action=tutor_waiting_mount role=tutor` |
| **`wtr`** | Presence | `[wtr] wtr=<wbsid:8> action=student_arrived joinToken=<tok:8>` |
| **`wtr`** | Admit | `[wtr] wtr=<wbsid:8> action=both_admitted` |
| `cns` | (existing) | Consent checks — now unconditional |

Full event catalog: [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §7.5 (BLOCKER-O1).

---

## 4. Three-pillar implementation sequence

**Why this order:** Pillar 1 (schema + server state) is prerequisite for every other surface — UI cannot honest-show "waiting" without `sessionPhase`, and capture gates must be server-enforced before deleting consent click. Pillar 2 (waiting room UI) validates the lifecycle on real devices before the irreversible Pillar 3 (flag deletion + destructive migration + consent click retirement).

```
Pillar 1 ──► Pillar 2 ──► Pillar 3
(migration +    (waiting      (consent hook-in +
 state machine)  room UI)      click retirement + DB migration)
```

---

### Pillar 1 — Session lifecycle state machine (Steps 0–4)

#### Step 0 — Pre-flight + design reconciliation spike

| Action | Detail |
|---|---|
| Rebase | Fork `phase3/wb-waiting-room` from post-P2-merge `v1-redesign`. |
| Read | [`RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md), [`LIVE-AV.md`](../LIVE-AV.md) § workspace integration, shell mock waiting page. |
| Spike | Document how `useLiveAV` runs **without** mounting Excalidraw (preview-only waiting room). Confirm sync client may connect for presence without scene capture. |

**Exit:** Spike note in `WHITEBOARD-P3-STATUS.md` — preview-only A/V path confirmed or escalated.

---

#### Step 1 — Additive migration + backfill

**New enums + columns on `WhiteboardSession`:**

```prisma
enum SessionPhase {
  pending
  active
}

enum SessionMode {
  live
  in_person
}

// WhiteboardSession additions:
sessionPhase   SessionPhase @default(pending)  // NEW sessions only after deploy
sessionMode    SessionMode  @default(live)
startedAt      DateTime?    // REMOVE @default(now()) — set on admit only
activeSwapId   String?      // schema for future swap; no UX in P3
```

**New model `SessionParticipant`** (from [`authed-session-access-design-2026-06-10.md`](authed-session-access-design-2026-06-10.md) §4.1):

```prisma
model SessionParticipant {
  id                  String            @id @default(uuid())
  whiteboardSessionId String
  whiteboardSession   WhiteboardSession @relation(...)
  learnerProfileId    String
  learnerProfile      LearnerProfile    @relation(...)
  joinedAt            DateTime?
  leftAt              DateTime?
  @@unique([whiteboardSessionId, learnerProfileId])
}
```

**Backfill SQL (single migration, additive only):**

```sql
-- 1. Add nullable columns with defaults that preserve current behavior
ALTER TABLE "WhiteboardSession" ADD COLUMN "sessionPhase" ...;
ALTER TABLE "WhiteboardSession" ADD COLUMN "sessionMode" ...;
-- 2. Backfill existing rows: treat all historical sessions as already active.
--    ⚠️ [5-axis BLOCKER 1 folded] USE "sessionPhase" = 'pending' NOT IS NULL.
--    Prisma fills existing rows with the @default value ('pending') when the
--    column is added — there are zero NULL rows. IS NULL silently updates nothing,
--    leaving all pre-migration sessions in pending state and breaking Sarah's workspace.
UPDATE "WhiteboardSession"
  SET "sessionPhase" = 'active',
      "sessionMode" = 'live'
  WHERE "sessionPhase" = 'pending';  -- matches ALL pre-migration rows
-- startedAt: existing rows KEEP their current startedAt (already set)
-- 3. Partial unique index (BLOCKER-C2) — one non-ended session per student
CREATE UNIQUE INDEX ... ON "WhiteboardSession" ("studentId") WHERE "endedAt" IS NULL;
```

**Invariants:**

- No column drops/renames.
- `consentAcknowledged` column **retained** through Pillar 1–2; dropped or deprecated in Pillar 3 only after click retirement.
- `eventsBlobUrl` still required at create (existing invariant).

**Exit:** Migration applies cleanly on local test DB; `prisma generate` + `tsc` green.

> **[5-axis BLOCKER 1 folded] Mandatory backfill verification:** Run migration against a staging DB that has existing rows (copy of production Neon branch or equivalent). After migration, `SELECT COUNT(*) FROM "WhiteboardSession" WHERE "sessionPhase" = 'pending'` must return 0 — all pre-migration sessions are active. A test DB with no existing rows will pass even with wrong backfill SQL; the staging verification is non-optional.

---

#### Step 2 — `createWhiteboardSession` → pending sessions

| File | Change |
|---|---|
| [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Create with `sessionPhase: "pending"`, `sessionMode` from form (default `live`), **`startedAt: null`**. Still freeze snapshot. Create `SessionParticipant` row when `learnerProfileId` set. Log `[slc] action=session_created`. |
| [`StartWhiteboardSession.tsx`](../../src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx) | **Pillar 3** removes consent modal; Pillar 1 may add session mode selector (`live` / `in_person`) here or on student detail. |
| [`workspace/page.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx) | Load `sessionPhase`, `sessionMode`, snapshot; pass `initialMode: sessionPhase === "pending" ? "waiting" : "live"`. |

**Hard requirement (Pillar 1 partial):** Reject session create when `!student.learnerProfileId` **only after Pillar 3** — OR gate behind interim check in Pillar 1 if Andrew prefers early fail. **Plan default:** enforce in Pillar 3 together with migration (avoid bricking unmigrated test accounts mid-branch).

> **[5-axis BLOCKER 3 folded] Flag-gate the pending create:** `createWhiteboardSession` MUST create `sessionPhase: 'pending'` / `startedAt: null` ONLY when `NEXT_PUBLIC_WB_WAITING_ROOM === '1'`. When the flag is unset, `createWhiteboardSession` uses legacy behavior: `sessionPhase: 'active'`, `startedAt: new Date()`. Similarly, `workspace/page.tsx` `initialMode` computation is flag-gated: flag unset → always `'live'` regardless of `sessionPhase`. This ensures "flag off = legacy straight-to-live" (Step 8 invariant) holds end-to-end, not just in the UI routing layer.

**Exit:** New sessions land in waiting mode (with flag on); existing sessions unchanged. With flag off, new sessions still land straight to live board (legacy behavior verified).

> **[5-axis BLOCKER 3 folded] Regression test:** With `NEXT_PUBLIC_WB_WAITING_ROOM` unset, `createWhiteboardSession` creates `sessionPhase: active` session; `workspace/page.tsx` passes `initialMode: 'live'`; shell renders live board directly. No `WaitingRoomWorkspace` renders in this path.

---

#### Step 3 — Admit / start endpoint (source of truth)

**New server action** `startWhiteboardSession(whiteboardSessionId)` (or `POST /api/whiteboard/[sessionId]/start`):

| Check | Action |
|---|---|
| `assertOwnsWhiteboardSession` | Tutor only |
| `sessionPhase === "pending"` | Idempotent: if already `active`, return success + current `startedAt` |
| `endedAt` null | Reject ended |
| `SessionConsentSnapshot.allowLiveSession` | Throw `ConsentError` if false (unconditional in Pillar 3; optional in Pillar 1 behind flag) |
| Presence (see §5.2) | Policy: require student presence signal OR explicit tutor "Start without student" for solo warmup |
| Transaction | Set `sessionPhase = active`, `startedAt = now()`, log `[slc] action=session_started` |
| Join tokens | Already issued at create; do not revoke on admit |

**Student-side observation:** extend `join-timer` (or new `session-status` route) to return `{ sessionPhase, startedAt, activeMs, live: boolean }` so student waiting UI polls admit without mounting board.

**Exit:** Unit tests: admit transitions phase; double-admit idempotent; ended session rejected.

> **[5-axis BLOCKER 3 folded] Startup audit also:** Ensure `startedAt` nullable read sites are null-safe before Step 3 ships. `startedAt` moves from `@default(now())` → `DateTime?`. Audit all files that read `session.startedAt` — no `!` non-null assertions, no bare `new Date(session.startedAt)` without null check. Timer and billing display must handle null as "not yet started."

---

#### Step 4 — Block capture while pending

| Surface | Gate |
|---|---|
| FSM inputs | Add `sessionPhase` to workspace; force `tutorWantsRecording` effective false while `pending`; `shouldCaptureWB` false while `pending`. |
| `registerWhiteboardSessionAudioSegmentAction` | Reject when `sessionPhase !== "active"`. |
| `endWhiteboardSession` audio path | Already consent-gated; add phase check. |
| Events.json / recorder | `useWhiteboardRecorder` or upload path: no replay event persistence while `pending`. |
| `generateNotesFromWhiteboardSessionAction` | Reject when pending. |
| `active-ping` | **[5-axis BLOCKER 4 folded]** Read `sessionPhase` from DB before processing any timer field. If `sessionPhase !== 'active'`: skip `bothConnectedAt` stamp, skip `activeMs` accumulation, return current values unchanged. Client-side guard alone is insufficient — server must enforce. |
| Checkpoint route (`POST /api/whiteboard/[sessionId]/checkpoint`) | Return 400/403 when `sessionPhase !== 'active'` — defense-in-depth for WB event capture during pending. |

**Exit:** Unit tests: pending session → audio register 403; FSM `shouldCaptureWB === false`; after admit → capture follows consent snapshot.

> **[5-axis BLOCKER 4 folded] Timer unit tests:** `active-ping` with `sessionPhase = pending` → `bothConnectedAt` NOT stamped; `activeMs` NOT incremented; DB row unchanged. `active-ping` with `sessionPhase = active` (first positive ping) → `bothConnectedAt` stamped if null. Add both cases to `join-timer-phase.test.ts`.

> **[5-axis BLOCKER 5 folded] Pending-cancel server action:** Add `cancelPendingSession(whiteboardSessionId)` server action to `actions.ts` (add to file touch map). Implementation: (1) `assertOwnsWhiteboardSession`; (2) read `session.eventsBlobUrl` from DB (the placeholder from create — no new upload needed, the recorder was never armed); (3) call `endWhiteboardSession(wbsid, session.eventsBlobUrl, { segments: [] })` — sets `endedAt`, revokes join tokens, registers zero segments; (4) log `[slc] action=session_ended phase=cancelled_from_pending`. Pre-flight: verify `endWhiteboardSession` has no `startedAt !== null` assertion (confirmed from source — it does not). Unit test in `session-phase.test.ts`: `cancelPendingSession` with `startedAt: null, endedAt: null` → `endedAt` set; join tokens revoked; zero `SessionRecording` rows; no throw.

---

### Pillar 2 — Waiting room UI (Steps 5–8)

#### Step 5 — `WaitingRoomWorkspace` + shell wiring

**New files:**

| File | Role |
|---|---|
| `src/app/admin/.../workspace/WaitingRoomWorkspace.tsx` | Tutor waiting: `useLiveAV` preview, consent panel from snapshot, in-person declaration, student presence pill, **Start session** → calls admit action. |
| `src/app/w/[joinToken]/StudentWaitingRoomWorkspace.tsx` | Student waiting: same chrome frame as P2 but **no Excalidraw**; A/V preview; disclosure; poll admit. |
| `src/components/whiteboard/chrome/WbWaitingRoomChrome.tsx` | Layout per shell mock `page-waiting` — reuse `LiveBoardChrome` tokens without tool strip. |

**Extend [`WhiteboardSessionShell.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx):**

```typescript
type ShellMode = "waiting" | "live" | "review";
// tutor: if mode==="waiting" → WaitingRoomWorkspace
// student (P2 union): if waiting → StudentWaitingRoomWorkspace
```

**`useLiveAV` reuse:** Request mic/cam in waiting room per [`useLiveAV.ts`](../../src/hooks/useLiveAV.ts) contract (inert until `requestMic`/`requestCam`). Do **not** mount peer mesh for board sync until `live` unless presence requires lightweight sync connection — document in STATUS.

**In-person mode (`sessionMode === "in_person"`):**

- Tutor UI captures declaration: "Student is present in person."
- Display student's effective privacy toggles (from snapshot) on tutor side — read-only projection.
- Student anonymous join may be suppressed or simplified (tutor starts when ready).

**Exit:** DOM tests: waiting mode renders `data-mode="waiting"`; no `student-whiteboard-canvas-mount` in waiting tree.

---

#### Step 6 — Presence + synchronized transition

| Mechanism | Detail |
|---|---|
| Student arrive | On `/w/[joinToken]` load in waiting: log `[wtr] action=student_arrived`; set presence flag (DB column `studentJoinedAt` **or** sync presence event **or** `SessionParticipant.joinedAt` — pick one; prefer `SessionParticipant.joinedAt` update on first waiting mount). |
| Tutor UI | Show "Student has joined" when presence true. |
| Admit poll | Both clients poll `join-timer` / status every 2–5s; on `sessionPhase === "active"`, atomically flip shell `mode` to `live`. |
| Sync start | **Do not** race: client flips only after server confirms; server admit is authoritative. |
| Logging | All transitions emit `wtr` + `slc` per catalog. |

**Remove** [`w/[joinToken]/page.tsx`](../../src/app/w/[joinToken]/page.tsx) L88–99 `bothConnectedAt` stamp on link-open — defer to post-admit path (§5.3).

**Exit:** Integration test: admit flips API response; student poll triggers mode transition mock.

---

#### Step 7 — Timer realignment

| Piece | Change |
|---|---|
| `bothConnectedAt` | Set on **first active ping after admit**, not link-open. |
| `activeMs` / `lastActiveAt` | Accumulate only when `sessionPhase === "active"` AND both sides present (existing Wyzant-style rules). |
| `join-timer` | Return `startedAt` / `sessionPhase`; student timer displays zero or "Waiting…" until active. |
| Tutor timer | `WhiteboardWorkspaceClient` / waiting chrome: same rule. |

**Open semantics (Andrew confirm §9):** whether pre-admit waiting time is visible anywhere (recommend: hidden; timer shows `--:--` until active).

**Exit:** Unit test on `active-time.ts` + join-timer route with phase fixtures.

---

#### Step 8 — Flag-gated waiting room rollout (interim)

| Env var | Semantics |
|---|---|
| `NEXT_PUBLIC_WB_WAITING_ROOM=1` | New pending→waiting→live path. |
| unset | **Recommend:** after P3 merge, production stays off until smoke PASS (parallel to P2 flag). |

Document in [`PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md).

**Exit:** Flag off → legacy straight-to-live (post-P2 behavior); flag on → waiting room path.

---

### Pillar 3 — Consent hook-in + click retirement + data migration (Steps 9–12)

> **⚠️ Destructive / irreversible on shared Neon.** Run §6 only after Pillar 1–2 smoke on Preview with **migrated test accounts**, then Andrew greenlight.

#### Step 9 — Unconditional consent enforcement

| File | Change |
|---|---|
| [`consent-scope.ts`](../../src/lib/consent-scope.ts) | **Delete** `isConsentEnforcementEnabled`, `CONSENT_ENFORCEMENT` branches. `assertEffectiveConsent`: no snapshot → **throw** (claimed learner); unclaimed → **throw** at create time. Remove unclaimed pass paths in `assertConsentFromLiveRecord`. |
| [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | `createWhiteboardSession`: require `learnerProfileId` + `ConsentRecord`; block `allowLiveSession=false` **unconditionally**. |
| [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Wire `assertEffectiveConsent(wbsid, 'allowWhiteboardRecording')` before events blob finalization / replay registration (BLOCKER-D2). |
| [`WhiteboardWorkspaceClient.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | Pass `consentSnapshot.allowAudioRecording` to disable recording toggle (Layer 1 UI gate). |
| Tests | Update [`consent-b2.test.ts`](../../src/__tests__/identity/consent-b2.test.ts) — remove flag toggling; always enforce. |
| Env | Remove `CONSENT_ENFORCEMENT` from docs/smokebooks/PLATFORM-ASSUMPTIONS. |

**Exit:** Without consent record, session create fails with actionable error for tutor.

> **[5-axis BLOCKER 2 folded] `assertConsentFromLiveRecord` must also be updated:** There are **two** functions in `consent-scope.ts` that call `isConsentEnforcementEnabled()`: `assertEffectiveConsent` (L94) and `assertConsentFromLiveRecord` (L283, used by the notes email path). Both must be updated when the flag is deleted. For `assertConsentFromLiveRecord` post-deletion: remove the flag fast-path; the unclaimed-student fast-path (`!learnerProfileId`) becomes `throw ConsentError`; the self-learner fast-path stays. Step 9 exit must include: `rg 'isConsentEnforcementEnabled' src/` returns zero results; `consent-b2.test.ts` tests `assertConsentFromLiveRecord` without the flag.

---

#### Step 10 — Parent consent POST

| File | Change |
|---|---|
| **New** `POST /api/account/children/[learnerId]/consent` or server action | `assertOwnsLearnerProfile`; versioned `ConsentRecord` insert (mirror claim setup); upsert `ConsentRestriction`; `CRITICAL_ACTION` email if required by B2 design. |
| [`ParentConsentEditor.tsx`](../../src/app/account/children/[id]/consent/ParentConsentEditor.tsx) | Replace `handlePreviewSave` with real POST; remove visual-only toast. |
| Tests | API route tests: version increment, ownership denial, restriction merge. |

**Exit:** Parent can change toggles; next session snapshot reflects new record.

---

#### Step 11 — Retire tutor consent click

| File | Change |
|---|---|
| [`StartWhiteboardSession.tsx`](../../src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx) | Remove consent modal → simple "Start session" (+ mode picker). Or inline button calling `createWhiteboardSession` without checkbox. |
| [`actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Remove `consentAcknowledged` form validation; stop writing `consentAcknowledged: true` (column optional deprecate — keep for audit history). |
| [`workspace/page.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx) | Remove `consentAcknowledged` re-check (replace with `learnerProfileId` + snapshot presence check). |
| [`createWhiteboardSession.test.ts`](../../src/__tests__/whiteboard/createWhiteboardSession.test.ts) | Rewrite consent tests → learner-profile + `allowLiveSession` tests. |

**Exit:** No tutor checkbox; consent = parent toggles + waiting room assessment display.

---

#### Step 12 — Destructive Neon test-account migration (§6)

Run **after** Step 9–11 code is on Preview; **not** in same deploy as first prod cut without Andrew.

**Exit:** Dry-run log reviewed; Andrew signs inventory; execute; verify Sarah tutor account untouched.

---

## 5. Reliability — design details

### 5.1 Synchronized start vs recorder pillars

| Invariant | P3 protection |
|---|---|
| Pillar 1 — FSM purity | `sessionPhase` is a **precondition input** to `evaluateLifecycle`, not inside FSM side effects. |
| Pillar 2 — Outbox | No `registerUpload` for session audio until `active`. Outbox `sessionId` unchanged across waiting→live (same `wbsid`). |
| Pillar 3 — Atomic end | Unchanged; pending cancel/end uses shortened path (no segments expected). |
| Admit race | Server transaction sets `sessionPhase`; clients poll — no client-only admit. |
| Double Start click | Admit endpoint idempotent. |

### 5.2 Waiting → live race matrix

| Scenario | Expected behavior |
|---|---|
| Student polls active before tutor UI flips | Student mounts live board; tutor follows on next poll — acceptable brief asymmetry |
| Tutor admit while student offline | Policy: allow (solo start) OR block with message — **Andrew confirm §9** |
| Student refreshes in waiting | Re-enter waiting; presence re-stamped idempotently |
| Tutor refresh in waiting | Same waiting state; no capture |
| Admit during end-session | Server rejects admit on `endedAt != null` |
| Pending End / Cancel | End session allowed without audio; `endedAt` set; no capture registration; revoke tokens |

### 5.3 Timer semantics (proposed)

1. **Link-open does nothing** to `bothConnectedAt` / `activeMs`.
2. On admit: set `startedAt` (canonical session start).
3. On first **post-admit** dual-presence `active-ping`: stamp `bothConnectedAt` if null; begin `activeMs` accumulation per existing [`active-time.ts`](../../src/lib/whiteboard/active-time.ts).
4. Student join-timer displays `activeMs` only when `sessionPhase === "active"`.

### 5.4 Pending session end

Tutor **Cancel** or **End** from waiting room:

- Skip FSM drain if never armed.
- `endWhiteboardSession` with zero segments — must succeed (extend if today assumes active).
- Log `[slc] action=session_ended phase=cancelled_from_pending`.

### 5.5 5-axis BLOCKERs to fold (TBD — reviewer adds specifics)

Reference lists (do not defer):

**From [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) session-lifecycle:**

| ID | Summary |
|---|---|
| BLOCKER-D2 | `allowWhiteboardRecording` gates events.json replay upload |
| BLOCKER-C2 | Unique partial index one active session per student |
| BLOCKER-O1 | All `slc` / `wtr` events emit |

**From consent-gates-capture design (still in force):**

| ID | Summary |
|---|---|
| (reviewer) | Note write without `allowNoteSending` → 403 |
| (reviewer) | Session close never wedged by consent failure |
| (reviewer) | No plaintext consent bypass via direct API |

**Swap BLOCKERs (D1, R1, C1, A1, A2):** **Out of P3 scope** — note in 5-axis as N/A unless reviewer disagrees.

---

## 6. Destructive Neon test-account migration

> **NOT unattended. Dry-run mandatory. Reversible only where noted.**

### 6.1 Policy (Andrew directive)

- **No backwards-compat** for unclaimed students — after migration + P3, every `Student` must have `learnerProfileId` + effective `ConsentRecord`.
- Accounts with **no learners** → create **solo learner** (`isSelfLearner=true`) with all capture toggles **on**.
- Otherwise **delete** disposable test rows (sessions, students, orphan accounts).

### 6.2 Account inventory (confirm with Andrew)

| Account / identity | Action | Notes |
|---|---|---|
| **Sarah — tutor (operator)** | **KEEP** | Production pilot; real data |
| **Sarah — student standalone** | **DELETE** (disposable) | Master-era unclear model; student re-signs up as real learner if continuing |
| **Sarah's single prior session** | **DELETE** (disposable) | Orphan session data acceptable loss |
| **`arangarx` family test** | Solo-migrate **or** delete | Andrew pick per row |
| **`shaltinelis` family test** | Solo-migrate **or** delete | Andrew pick per row |
| **`daniel` family test** | Solo-migrate **or** delete | Andrew pick per row |
| **`lilah` family test** | Solo-migrate **or** delete | Andrew pick per row |
| **Admin accounts with zero `LearnerProfile` children** | **Solo-learner migrate** | `isSelfLearner=true`, all toggles on, link to default `Student` row |
| **Unclaimed `Student` rows (no `learnerProfileId`)** | **Delete** after backup **or** force-claim | No production unclaimed real students (Andrew) |

### 6.3 Script requirements

**New** `scripts/forward-migrate-p3-test-accounts.ts` (or SQL + TS wrapper):

1. **`--dry-run`** (default): print JSON plan — no writes.
2. **`--execute`**: requires `P3_MIGRATION_CONFIRM=yes` env + stdin typing account email.
3. Per-row actions logged to stdout with `[p3m]` prefix.
4. **Backup step:** `pg_dump` relevant tables OR export CSV to `docs/handoff/artifacts/p3-migration-dry-run-<date>.json` before execute.
5. **Reversibility:** solo-learner migrate reversible manually; deletes **not** reversible — dry-run is the control.

### 6.4 Execution gate checklist

- [ ] P3 Preview smoke PASS with migrated Preview DB clone first
- [ ] Andrew reviews dry-run output line-by-line
- [ ] Sarah tutor account explicitly listed KEEP in dry-run
- [ ] Execute window agreed (low-traffic)
- [ ] Post-migrate: tutor can create pending session for Sarah student with consent

---

## 7. Verification plan

### 7.1 Automated (merge gate)

| Command | When |
|---|---|
| `npx jest` (targeted + regression) | Every commit |
| `npx jest src/__tests__/identity/consent-b2.test.ts` | After Pillar 3 |
| **`npm run test:wb-sync`** with `NEXT_PUBLIC_WB_WAITING_ROOM=1` + `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` | **Mandatory** — waiting + admit + live sync |
| `npx next build` | CSS/chrome/build surface changes |

**New test files (minimum):**

| Suite | Coverage |
|---|---|
| `session-phase.test.ts` | create pending; admit; idempotent admit; block audio when pending |
| `join-timer-phase.test.ts` | `sessionPhase` in response; no timer before active |
| `consent-unconditional.test.ts` | no flag; no unclaimed pass |
| `WaitingRoomWorkspace.dom.test.tsx` | no canvas mount; A/V preview shell |
| `WhiteboardSessionShell.dom.test.tsx` | `waiting` branch tutor + student |

### 7.2 Two-device smoke matrix (outline)

Author `docs/handoff/phase-3-waiting-room-smokebook-2026-06-16.md` per [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP.

| # | Title | Summary |
|---|---|---|
| 0 | Flag off regression | P2 straight-to-live still works when `NEXT_PUBLIC_WB_WAITING_ROOM` unset |
| 1 | Tutor create → waiting | Tutor lands waiting; no board tools; no recording arm |
| 2 | Student join → waiting | Student sees waiting chrome; self-view; disclosure; no Excalidraw |
| 3 | A/V preview both sides | Mic/cam preview works; no live board |
| 4 | Consent display | Tutor sees snapshot toggles; denied audio → recording toggle disabled post-admit |
| 5 | In-person mode | Tutor selects in-person; declaration + projected toggles |
| 6 | Presence | Tutor sees student arrived (`wtr` in console) |
| 7 | Synchronized start | Tutor Start → both flip live within 5s; `slc` + `wtr` logs |
| 8 | Timer | Timer zero/hidden in waiting; starts at admit; matches both sides |
| 9 | Live sync post-admit | Draw sync works after admit |
| 10 | Recording post-admit | With `allowAudioRecording=true`, record + end session succeeds |
| 11 | Consent deny audio | With `allowAudioRecording=false`, toggle disabled; end session still closes |
| 12 | Pending cancel | End from waiting; no audio registered; student sees ended |
| 13 | Parent POST | Change consent on `/account/children/[id]/consent`; next session reflects |
| 14 | No consent click | Start session without tutor checkbox |
| 15 | Themes | Repeat 1–14 in **light** and **dark** (per pre-master smoke template: every in-scope item in both themes) |
| 16 | P2 tutor regression | Tutor live path unchanged with waiting flag off |

### 7.3 `test:wb-sync` scenarios (flag on)

- Student joins waiting → tutor admits → stroke sync (extend existing spec).
- Assert `sessionPhase` via API helper before/after admit.
- No `student-whiteboard-canvas-mount` until admit.

---

## 8. Acceptance criteria

### P3 merge gates (5-axis BLOCKERs folded)

| ID | Criterion |
|---|---|
| P3-G1 | P2 merged; `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL` on in test env |
| P3-G2 | `sessionPhase` / `sessionMode` migration applied; backfill leaves historical sessions active |
| P3-G3 | New sessions start `pending`; admit is server-authoritative |
| P3-G4 | Capture blocked while `pending` (audio + WB replay + notes + checkpoint route) |
| P3-G5 | Waiting room UI both roles; synchronized transition |
| P3-G6 | Timer aligned to admit — not link-open |
| P3-G7 | `CONSENT_ENFORCEMENT` deleted; enforcement unconditional |
| P3-G8 | Parent consent POST works |
| P3-G9 | Tutor consent click retired |
| P3-G10 | `allowWhiteboardRecording` gates replay upload (BLOCKER-D2) |
| P3-G11 | `slc` + `wtr` registered and emitted (BLOCKER-O1) |
| P3-G12 | Destructive migration dry-run reviewed; execute only with Andrew go |
| P3-G13 | `npm run test:wb-sync` green with waiting flag AND student-new-shell flag both set |
| P3-G14 | Two-device smokebook overall PASS |
| **P3-A1** | **[5-axis BLOCKER 1]** Migration backfill verified on staging DB with pre-existing rows — zero sessions have `sessionPhase = 'pending'` post-migration |
| **P3-A2** | **[5-axis BLOCKER 2]** `assertConsentFromLiveRecord` updated alongside `assertEffectiveConsent` in Step 9; `rg 'isConsentEnforcementEnabled' src/` returns zero hits post-deletion |
| **P3-A3** | **[5-axis BLOCKER 3]** `NEXT_PUBLIC_WB_WAITING_ROOM` flag gates pending-create in `createWhiteboardSession` AND `initialMode` in `workspace/page.tsx`; flag-off path creates active sessions straight to live board (verified in smoke item 0 + flag-off regression test) |
| **P3-A4** | **[5-axis BLOCKER 4]** `active-ping` route reads `sessionPhase` before processing timer fields; unit test: pending session ping → no `bothConnectedAt` stamp, no `activeMs` increment |
| **P3-A5** | **[5-axis BLOCKER 5]** `cancelPendingSession` server action exists, calls `endWhiteboardSession` with placeholder `eventsBlobUrl`, sets `endedAt`, revokes join tokens with zero segments; unit test passes |

**Sarah-trust framing:** If Sarah must keep Zoom open because the waiting room lies about readiness, capture starts early, or consent is unclear — P3 is not done.

---

## 9. Open questions for Andrew

| ID | Question | Default if silent |
|---|---|---|
| **Q1** | **Destructive migration inventory:** confirm table §6.2 row-by-row (especially `arangarx` / `shaltinelis` / `daniel` / `lilah` — solo-migrate vs delete). | Solo-migrate all family test accounts; delete only Sarah standalone student |
| **Q2** | **Delete `CONSENT_ENFORCEMENT` vs keep kill-switch** on Preview only? Live plan says delete. | Delete (branch = rollback) |
| **Q3** | **Waiting room flag:** ship `NEXT_PUBLIC_WB_WAITING_ROOM` gated, or always-on immediately after merge? | Flag-gated; Preview on until smoke PASS |
| **Q4** | **Timer display in waiting:** show `--:--` / "Starts when session begins", or hide timer entirely? | Hidden until active |
| **Q5** | **Admit without student present:** can tutor force-start from waiting (solo warmup), or block until student presence? | Allow force-start (log `wtr action=admit_solo`) |
| **Q6** | **Session mode picker placement:** student detail at create vs inside waiting room? Shell design favors pre-session. | Mode selected in `StartWhiteboardSession` before create |
| **Q7** | **Require learner at create (Pillar 1) vs Pillar 3 only?** Early fail bricks unmigrated accounts on branch. | Enforce at Pillar 3 with migration |
| **Q8** | **`consentAcknowledged` column:** deprecate in place vs additive migration to nullable? | Keep column; stop writing; audit history |
| **Q9** | **Authenticated `/join` waiting:** wire `LearnerWaitingRoom` to real session polling in P3, or defer to Phase 4? | Defer authed join; P3 focuses on `/w/[joinToken]` + tutor workspace |
| **Q10** | **[5-axis new]** `workspace/page.tsx` unclaimed-student error: when `!student.learnerProfileId` post-consent-click-removal (Step 11), use `notFound()` (current: 404 with no context) or redirect to student detail page with an actionable error message? | Redirect to `/admin/students/[id]?error=requires_claim` with tutor-visible message (not bare 404) |
| **Q11** | **[5-axis new]** §6.4 Neon migration backup: is `pg_dump` / CSV export of affected tables a hard gate in §6.4 execution checklist, or executor discretion? | Hard gate — add `- [ ] Backup confirmed` to §6.4 before Andrew can approve execute |
| **Q12** | **[5-axis new]** `CONSENT_ENFORCEMENT` env var in Vercel: confirm the env var is deleted from Vercel project settings (production + preview) in the same sprint as Step 9, or is it acceptable to leave it as a harmless dangling var post-code-deletion? | Delete from Vercel env vars in same deploy to keep the environment clean |

---

## File touch map (quick reference)

| Path | Role |
|---|---|
| `prisma/schema.prisma` | `SessionPhase`, `SessionMode`, `SessionParticipant`, `startedAt` nullable |
| `prisma/migrations/*_p3_session_lifecycle/` | Additive migration + backfill |
| `src/app/admin/students/[id]/whiteboard/actions.ts` | Pending create; admit; consent unconditional; `cancelPendingSession` (new — BLOCKER 5) |
| `src/app/admin/.../workspace/page.tsx` | Phase-based `initialMode`; drop consent re-check (P3) |
| `src/app/admin/.../WhiteboardSessionShell.tsx` | `waiting` mode branch |
| `src/app/admin/.../WaitingRoomWorkspace.tsx` | **New** — tutor waiting |
| `src/app/w/[joinToken]/page.tsx` | Waiting entry; remove early `bothConnectedAt` |
| `src/app/w/[joinToken]/StudentWaitingRoomWorkspace.tsx` | **New** — student waiting |
| `src/components/whiteboard/chrome/WbWaitingRoomChrome.tsx` | **New** — layout |
| `src/lib/consent-scope.ts` | Delete flag; hard enforcement |
| `src/lib/session-participant-scope.ts` | Real implementation |
| `src/app/api/account/children/[id]/consent/route.ts` | **New** — parent POST |
| `src/app/account/children/[id]/consent/ParentConsentEditor.tsx` | Wire save |
| `src/app/admin/students/[id]/whiteboard/StartWhiteboardSession.tsx` | Remove consent modal (P3) |
| `src/app/api/whiteboard/[sessionId]/join-timer/route.ts` | Phase-aware status |
| `src/app/api/whiteboard/[sessionId]/active-ping/route.ts` | Phase-aware accumulation |
| `src/lib/whiteboard/active-time.ts` | Pending guards |
| `src/lib/recording/lifecycle-machine.ts` | Document phase precondition (caller-side) |
| `scripts/forward-migrate-p3-test-accounts.ts` | **New** — dry-run migration |
| `AGENTS.md` | `slc`, `wtr` registry |
| `docs/PLATFORM-ASSUMPTIONS.md` | Waiting room flag |
| `docs/WHITEBOARD-P3-STATUS.md` | **New** — STATUS handoff |
| `docs/handoff/phase-3-waiting-room-smokebook-2026-06-16.md` | **New** — at Step 9 |

---

## Sequencing summary (for reviewers)

```
P2 smoke + merge
       │
       ▼
Pillar 1: migration + pending create + admit API + block-capture-while-pending
       │
       ▼
Pillar 2: waiting room UI + presence + sync admit + timer realign + flag
       │
       ▼
Pillar 3: delete CONSENT_ENFORCEMENT + parent POST + WB replay gate
          + retire consent click + destructive Neon migration
       │
       ▼
5-axis PASS + Andrew smoke + merge --no-ff
```

**Highest-risk areas for 5-axis scrutiny:**

1. **Synchronized start × recorder pillars** — admit race must not arm FSM early or split outbox across pseudo-states.
2. **Timer realignment** — `bothConnectedAt` / `activeMs` / `join-timer` triple consistency across tutor + student + server.
3. **Unconditional consent + destructive migration** — wrong row in §6.2 deletes Sarah data; dry-run discipline is the control.
4. **Block-capture-while-pending** — every capture path (audio register, WB replay events, notes, end-session segments) must be enumerated; one leak = COPPA failure.
5. **P2 integration** — waiting mode must not regress P2 student shell (`StudentLiveWorkspaceClient` mounts only after admit).

---

*End of plan — execution gated on P2 smoke + merge and explicit Andrew greenlight.*
