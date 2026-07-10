# Phase 3 — Mutual Waiting Room: 5-Axis Adversarial Reliability Review

> **Reviewer:** Independent adversarial pass (Sonnet 4.6)
> **Date:** 2026-06-17
> **Branch:** `v1-redesign` (clean)
> **Plan reviewed:** [`docs/handoff/phase-3-waiting-room-plan-2026-06-16.md`](phase-3-waiting-room-plan-2026-06-16.md) @ commit `58ca872`
> **Grounded against:** `src/lib/consent-scope.ts`, `src/app/admin/students/[id]/whiteboard/actions.ts`, `src/app/api/whiteboard/[sessionId]/active-ping/route.ts`, `src/app/api/whiteboard/[sessionId]/checkpoint/route.ts`, `src/app/w/[joinToken]/page.tsx`, `src/lib/recording/lifecycle-machine.ts`, `docs/RECORDER-LIFECYCLE.md`, `docs/handoff/session-lifecycle-consent-design-2026-05-31.md`, reliability-bar.mdc
> **Format template:** [`docs/handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md`](phase-2-student-on-new-shell-5axis-2026-06-16.md)
> **Verdict:** **NOT READY TO EXECUTE** — 5 BLOCKERs folded into acceptance; 6 MAJORs to address before merge; plan architecture is sound.

---

## Executive summary

The plan's three-pillar architecture (lifecycle state machine → waiting room UI → consent hook-in) is correctly sequenced, the FSM/outbox/atomic-end invariants are understood, and the "extend don't rewrite" constraint is properly scoped. The highest-risk decisions (synchronized start gates FSM arming; timer stamped only post-admit; consent enforcement unconditional in Pillar 3) are all correct.

However, five concrete failures survive every specified acceptance criterion without detection:

1. The migration backfill SQL silently updates **zero rows** because Prisma fills new enum columns with the `@default` value ('pending'), not NULL. All pre-migration sessions remain in `pending` state after deploy — Sarah's workspace breaks for every existing session.
2. The `CONSENT_ENFORCEMENT` flag is deleted from one of two functions that read it. The second function (`assertConsentFromLiveRecord`, notes email path) is not in the plan's inventory, becoming undefined behavior post-deletion.
3. Step 2 creates pending sessions unconditionally (no flag gate), while Step 8 adds the flag only for UI routing. With the flag off in production, `workspace/page.tsx` computes `initialMode: 'waiting'` and routes every new session to the waiting room — breaking the flag-off "legacy straight-to-live" invariant.
4. The `active-ping` route stamps `bothConnectedAt` and accumulates `activeMs` without reading `sessionPhase`. The plan's client-side timer guard is necessary but not sufficient; a single client-side bug starts the billable clock during the waiting period, silently overbilling Sarah.
5. The pending-cancel path (tutor cancels from waiting room) is described at the design level but has no specified execution path, no named server action, no `finalEventsBlobUrl` contract, and no unit test. An executor who guesses wrong leaves sessions that can't be closed.

None of these require architectural rework. Each needs a 1–5 line addition to an existing acceptance criterion or a clarifying sentence in a step specification.

---

## Findings by axis

---

### Axis 1 — Data loss / durability

#### [BLOCKER] P3-B1 — Backfill SQL `WHERE "sessionPhase" IS NULL` is a silent no-op; all pre-migration sessions stay `pending`

**Risk.** Plan §4 Step 1 backfill:

```sql
UPDATE "WhiteboardSession"
  SET "sessionPhase" = 'active',
      "sessionMode" = 'live'
  WHERE "sessionPhase" IS NULL;  -- or use DEFAULT + UPDATE all
```

When Prisma generates the migration for `sessionPhase SessionPhase @default(pending)`, it runs:

```sql
ALTER TABLE "WhiteboardSession"
  ADD COLUMN "sessionPhase" "SessionPhase" NOT NULL DEFAULT 'pending';
```

PostgreSQL fills all existing rows with `'pending'` **immediately** on the ALTER. There are zero NULL rows. The `WHERE "sessionPhase" IS NULL` predicate matches nothing. The backfill is a silent no-op.

**Consequence:** every pre-migration session (Sarah's real session, all test sessions) has `sessionPhase = 'pending'` post-migration. `workspace/page.tsx` computes `initialMode: sessionPhase === 'pending' ? 'waiting' : 'live'` and routes them all to `WaitingRoomWorkspace`. Sarah's workspace for every past session breaks. The timer-anchor route returns `startedAt: null`. All review surfaces show waiting-room UI.

The comment "-- or use DEFAULT + UPDATE all" acknowledges the uncertainty but leaves resolution to the executor, who will likely test only on a fresh DB (no existing rows) and miss the failure.

**Fix required in plan:** Step 1 migration must use `WHERE "sessionPhase" = 'pending'` (the Prisma-assigned default), not `WHERE "sessionPhase" IS NULL`. Or more robustly: `UPDATE "WhiteboardSession" SET "sessionPhase" = 'active', "sessionMode" = 'live' WHERE "endedAt" IS NOT NULL OR "startedAt" IS NOT NULL` (all historically-started sessions), then for any active sessions at migration time: `SET "sessionPhase" = 'active' WHERE "endedAt" IS NULL`. Simplest safe version: `UPDATE "WhiteboardSession" SET "sessionPhase" = 'active', "sessionMode" = 'live'` (no WHERE — set all existing rows to active; only sessions created post-migration start as `pending`).

**Acceptance criterion addition:** "Before merging: run the migration against a copy of the production Neon branch (or equivalent with existing rows). Verify zero existing sessions have `sessionPhase = 'pending'` post-migration. Verify the `SELECT COUNT(*) FROM "WhiteboardSession" WHERE "sessionPhase" = 'pending'` returns 0 after backfill on a DB with pre-existing rows."

---

#### [BLOCKER] P3-B2 — `assertConsentFromLiveRecord` omitted from `CONSENT_ENFORCEMENT` flag-deletion inventory

**Risk.** Plan §4 Step 9 says: "Delete `isConsentEnforcementEnabled`, `CONSENT_ENFORCEMENT` branches. `assertEffectiveConsent`: no snapshot → throw (claimed learner)."

Grounding the actual code (`src/lib/consent-scope.ts`): `isConsentEnforcementEnabled()` is called in **two** functions:
- `assertEffectiveConsent` (L94) — plan addresses this
- `assertConsentFromLiveRecord` (L283) — **not mentioned anywhere in the plan**

`assertConsentFromLiveRecord` is the session-less consent check used by the notes email path. Currently at L283: `if (!isConsentEnforcementEnabled()) { return; }`. If the flag function is deleted without updating this function:

- **If deleted as a compile error:** the build fails on merge.
- **If the flag check is left as dead code (referencing a deleted export):** TypeScript compile error surfaces only if the export is actually deleted (likely).
- **If the executor updates it by removing the fast-path without replacing the unclaimed-student pass:** any tutor who tries to send a note email for a student without a `ConsentRecord` (historical pilot accounts, self-learners during a transition period) gets a `ConsentError` thrown from `assertConsentFromLiveRecord` L336 — the notes email silently fails.
- **If the executor replaces the unclaimed-student pass with a throw:** self-learners with `isSelfLearner=true` but no `ConsentRecord` (the self-learner bypass path is in `assertEffectiveConsent` via `consentRecordId`, not in `assertConsentFromLiveRecord`) break at this path.

The exact correct behavior for `assertConsentFromLiveRecord` post-flag-deletion depends on the intended consent model for self-learners on the session-less path. The design doc §6.2 specifies the snapshot-scoped path but not the session-less live-record path.

**Fix required in plan:** Step 9 acceptance criteria must add: "Audit ALL callsites of `isConsentEnforcementEnabled()` — there are currently two in `consent-scope.ts` (L94 `assertEffectiveConsent` and L283 `assertConsentFromLiveRecord`). Both must be updated. For `assertConsentFromLiveRecord`: the unclaimed fast-path becomes `throw ConsentError` (unclaimed = no consent = no notes email); the self-learner fast-path becomes `return` (self-learner check via `profile.isSelfLearner` already present at L316). Remove the flag check entirely. Verify `consent-b2.test.ts` covers `assertConsentFromLiveRecord` with and without flag."

---

#### [MAJOR] P3-M-A — Checkpoint route has no session-phase gate; defense-in-depth gap for WB events during pending

**Risk.** `POST /api/whiteboard/[sessionId]/checkpoint` calls `assertOwnsWhiteboardSession` and `assertTutorApproved` only. There is no `sessionPhase` check. If `useWhiteboardRecorder` starts recording during pending state (e.g., due to a bug in the `tutorWantsRecording` guard or a stale value from a prior session), partial checkpoint JSON is uploaded to Vercel Blob and persisted. Unlike audio segments (which have server-side phase rejection per Step 4), WB event checkpoints have no server-side gate.

The plan's primary defense is the FSM (`shouldCaptureWB = recordingActive` → false when `tutorWantsRecording` is forced false). This is a necessary defense. But the checkpoint route having no server-side guard means a single bug in the client-side pending guard creates a silent, hard-to-detect WB capture during the waiting period. Since whiteboard checkpoints are not the canonical `eventsBlobUrl` (they're separate blob URLs), they could persist unnoticed.

**Fix required in plan:** Add to Step 4 acceptance criteria: "The checkpoint route returns 400/403 when `sessionPhase !== 'active'`." Add unit test in `session-phase.test.ts`: "checkpoint upload during pending session → 400."

---

#### [MAJOR] P3-M-B — `startedAt` nullable audit absent from plan; non-null assertion sites could throw at runtime

**Risk.** The plan changes `startedAt` from `@default(now())` to `DateTime?` (nullable). This is correct. But the plan does not mandate an audit of all existing `session.startedAt` read sites. The workspace, timer-anchor route, billing calculations, and session review surface all currently treat `startedAt` as non-nullable (it always had a value). There are likely `session.startedAt!` non-null assertions or `new Date(session.startedAt)` calls that throw `Invalid Date` when `startedAt` is null.

Confirmed affected sites (from grep): `src/app/api/whiteboard/[sessionId]/timer-anchor/route.ts` references `bothConnectedAt` and the timer; `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx` L42 takes `bothConnectedAtIso: string | null` — but `startedAt` is a different field. The `workspace/page.tsx` L85 loads `bothConnectedAt: true` but may also load `startedAt` for billing/timer display.

**Fix required in plan:** Add to Step 1-2 acceptance criteria: "Audit all files that read `WhiteboardSession.startedAt`. Every read site must handle `null` as 'session not yet started' — no `!` assertions, no bare `new Date(session.startedAt)` without null check. The join-timer route must return `activeMs: 0` and `startedAt: null` when `sessionPhase === 'pending'`; callers must display `--:--` (see Step 7). Acceptance test: TypeScript compiles with `strictNullChecks` at all `startedAt` read sites."

---

### Axis 2 — Concurrency / sync correctness

#### [BLOCKER] P3-B3 — Pending-create flag-scope ambiguity: Step 2 creates pending sessions unconditionally; "flag off = legacy" invariant in Step 8 is broken

**Risk.** Plan Step 2 changes `createWhiteboardSession` to create sessions with `sessionPhase: "pending"`, `startedAt: null` — **with no flag gate**. Plan Step 8 introduces `NEXT_PUBLIC_WB_WAITING_ROOM=1` for "flag on → waiting room path; flag off → legacy straight-to-live." These two steps contradict each other.

After P3 merges to `v1-redesign` and eventually `master` with the flag off:
1. `createWhiteboardSession` creates `pending` sessions (no flag check).
2. `workspace/page.tsx` computes `initialMode: sessionPhase === 'pending' ? 'waiting' : 'live'` — routes to waiting mode.
3. Shell renders `WaitingRoomWorkspace` (this component was shipped in Step 5).
4. **The waiting room is live even with the flag off.** Sarah sees the waiting room before the flag is enabled.

The plan relies on the flag gate but doesn't specify whether the flag also gates the pending create in `createWhiteboardSession`. An executor reading the plan would implement Step 2 without a flag check and Step 8 with a flag check only on UI rendering, producing the broken state above.

**Fix required in plan:** Add to Step 2: "`createWhiteboardSession` creates `pending` sessions ONLY when `NEXT_PUBLIC_WB_WAITING_ROOM === '1'`. When flag is unset, sessions are created with `sessionPhase: 'active'`, `startedAt: new Date()` (legacy behavior preserved)." And to Step 8: "The flag gates BOTH the pending-create behavior in Step 2 AND the shell's `waiting` mode rendering. Flag off = legacy `createWhiteboardSession` → active sessions → `initialMode: 'live'`. Verify regression: with flag unset, creating + opening a session goes straight to live board without waiting room."

---

#### [BLOCKER] P3-B4 — `active-ping` route has no server-side `sessionPhase` check; billable timer stamps during pending

**Risk.** `src/app/api/whiteboard/[sessionId]/active-ping/route.ts` currently: (a) reads `bothConnectedAt` from the DB (L93), (b) stamps `bothConnectedAt` if `update.bothConnectedAtMs !== null AND before.bothConnectedAt === null` (L126-131), (c) accumulates `activeMs` (L138). None of these operations check `sessionPhase`.

The plan's Step 6 removes the `bothConnectedAt` stamp on student link-open (`w/[joinToken]/page.tsx` L88-99). Step 7 says "Set on first post-admit dual-presence `active-ping`." But the `active-ping` route itself is not given a phase check. The only guard is client-side: the waiting room components presumably don't emit `bothConnectedAtMs` in their pings.

**Why this is a BLOCKER:** (a) the student in the waiting room is still on a page that polls, (b) the `active-ping` route stamps `bothConnectedAt` based on what the client sends, (c) if the client-side guard is wrong (e.g., a bug in the `sessionPhase` propagation to the ping component, a stale `sessionPhase` read, or the legacy student client path still running), the timer starts during the waiting period and Sarah's billable clock diverges from "both in room" reality. This is the primary timer-correctness BLOCKER — the plan's fix is entirely on the client side with no server-side defense.

**Confirmed from `w/[joinToken]/page.tsx` L88-99**: The current stamp-on-link-open IS being removed by the plan. But the active-ping stamp path (which fires on every positive ping cycle) remains unguarded.

**Fix required in plan:** Add to Step 7 acceptance criteria: "The `active-ping` route reads `sessionPhase` from the DB before processing any timer-related field. If `sessionPhase !== 'active'`: do NOT stamp `bothConnectedAt`, do NOT accumulate `activeMs`, return current values as-is. Unit test: `active-ping` called with a `pending` session → response contains `bothConnectedAt: null`, `activeMs: 0`; DB row is unchanged." Add to §7.1 automated tests: `join-timer-phase.test.ts` covers `active-ping` phase guard.

---

#### [MAJOR] P3-M-C — Presence mechanism allows relay-only presence; not durable through relay restart

**Risk.** Plan Step 6 specifies the presence mechanism as: "set presence flag (`studentJoinedAt` DB column OR sync presence event OR `SessionParticipant.joinedAt` — pick one; prefer `SessionParticipant.joinedAt`)." The "OR sync presence event" option allows the executor to implement presence via the relay's connected-peer event, which is not durable.

If the relay restarts between the student arriving and the tutor checking presence, the relay-based presence signal is lost. The tutor's waiting room shows "No student yet" even though the student is waiting. The tutor waits; the student waits; nobody admits. This breaks the waiting room's core UX contract.

The `AGENTS.md` north star: "If a tutor would need to run a backup recorder alongside our app, the feature is not done." A waiting room that silently loses the student's arrival is equivalent — Sarah can't trust what she sees.

**Fix required in plan:** Step 6 must specify: "Student presence MUST be server-durable. Implementation: on first render of `StudentWaitingRoomWorkspace` (or `w/[joinToken]` page component mount in waiting mode), fire a server action or API call that writes `SessionParticipant.joinedAt = now()` for the student's learner profile. The tutor's waiting room polls the `/session-status` or `join-timer` route which reads `SessionParticipant.joinedAt` from the DB. Relay-based presence MAY supplement for real-time feel but MUST NOT be the sole source of 'student arrived' truth. Verify: relay restart in the middle of the waiting period — tutor's UI still shows 'Student has joined' on next poll."

---

### Axis 3 — Failure recovery / resilience

#### [BLOCKER] P3-B5 — Pending-cancel execution path underspecified; no named server action, no `finalEventsBlobUrl` contract, no unit test

**Risk.** Plan §5.4 says: "Tutor Cancel or End from waiting room: Skip FSM drain if never armed. `endWhiteboardSession` with zero segments — must succeed (extend if today assumes active). Log `[slc] action=session_ended phase=cancelled_from_pending`."

This describes the desired outcome but specifies nothing about the execution path. The following questions are unanswered:

1. **Which component triggers cancel?** `WaitingRoomWorkspace.tsx` (a new file). It calls what server action?
2. **Is `handleEndSession` (the 7-step `WhiteboardWorkspaceClient` flow) reused?** If yes, step 1 (`setUserWantsRecording(false)`) is a no-op; step 2 (`drainOutboxOrTimeout`) returns immediately; step 4 (`uploadWhiteboardEvents`) uploads an empty events log. This works but wastes 3 server round-trips.
3. **If a new `cancelPendingSession` server action is written:** what `finalEventsBlobUrl` is passed to `endWhiteboardSession`? It must be the placeholder URL from create (the DB row has it). If the executor passes `null` or `undefined`, `endWhiteboardSession` throws (non-null contract on `WhiteboardSession.eventsBlobUrl`).
4. **Does `endWhiteboardSession` today assert `startedAt !== null`?** From the grep, `endWhiteboardSession` does NOT check `startedAt` — but the plan says "(extend if today assumes active)" which implies the executor must verify this. No explicit "read the source" pre-flight is mandated.
5. **Join token revocation:** `endWhiteboardSession` (Pillar 3 atomic action) DOES revoke join tokens (step 5 of the atomic txn). But if the executor writes a custom `cancelPendingSession` that doesn't call `endWhiteboardSession` (e.g., just sets `endedAt` directly), tokens are not revoked. The student's join URL stays valid for a cancelled session.

**Fix required in plan:** Add to §5.4: "Pending-cancel execution: `WaitingRoomWorkspace.tsx` calls a `cancelPendingSession(whiteboardSessionId)` server action (NEW — add to file touch map). This action: (1) calls `assertOwnsWhiteboardSession`, (2) reads the session's existing `eventsBlobUrl` placeholder (from the DB row — no new upload), (3) calls `endWhiteboardSession(wbsid, session.eventsBlobUrl, { segments: [] })` — this revokes join tokens, sets `endedAt`, and preserves the existing placeholder URL without overwriting. Pre-flight: read `endWhiteboardSession` source and verify no `startedAt !== null` assertion. Unit test: `cancelPendingSession` on a session with `startedAt: null, endedAt: null` → `endedAt` is set; join tokens revoked; no `SessionRecording` rows created."

---

#### [MAJOR] P3-M-D — Tutor-side waiting room missing DOM test guard for `WhiteboardWorkspaceClient` non-render

**Risk.** Plan Step 5 exit criterion: "DOM tests: waiting mode renders `data-mode='waiting'`; no `student-whiteboard-canvas-mount` in waiting tree."

The `student-whiteboard-canvas-mount` check is the student-side guard. There is no equivalent tutor-side guard. If `WhiteboardSessionShell` in `mode='waiting'` accidentally renders `WhiteboardWorkspaceClient` (e.g., missing `else` branch, incorrect conditional, wrong ternary), the tutor's sync client connects to the relay, `useWhiteboardRecorder` mounts, and the FSM can arm — all while the shell is supposed to be in waiting mode.

From the P2 adversarial review precedent (BLOCKER 3, `WbAVCluster` context): this exact class of bug — "wrapper component accidentally renders child that requires missing context" — is how P2 had a BLOCKER. P3 is the same pattern on the tutor side.

**Fix required in plan:** Add to Step 5 acceptance criteria: "DOM test: `WhiteboardSessionShell` with `initialMode='waiting'` (tutor role) — assert `data-testid='whiteboard-workspace-client'` (or equivalent tutor-workspace testid) is NOT rendered in the waiting tree; recording toggle is absent; sync client status pill is absent."

---

#### [MAJOR] P3-M-E — `CONSENT_ENFORCEMENT` env var removal checklist incomplete; Vercel + docs gaps

**Risk.** Plan Step 9 removes `CONSENT_ENFORCEMENT` from `consent-scope.ts` but the inventory stops there. The env var may exist in:
- Vercel project settings (production env vars)
- Vercel Preview env vars
- `.env.example` (if present)
- `docs/PLATFORM-ASSUMPTIONS.md` (plan Step 9 says "Remove `CONSENT_ENFORCEMENT` from docs/smokebooks/PLATFORM-ASSUMPTIONS" — this is correct but vague)
- `AGENTS.md` conventions (if it's referenced there)

If the Vercel production env still has `CONSENT_ENFORCEMENT=true` or `CONSENT_ENFORCEMENT=1` after the code that reads it is deleted, the result is harmless (an unused env var). But if it's `false` or `0`, the old code with the flag off was never blocking consent violations — and now the unconditional enforcement is live regardless. The transition from flag-off → unconditional is the correct intended behavior, but it must be explicit.

More practically: if `CONSENT_ENFORCEMENT` stays set in Vercel env and the code that checks it is deleted, a future engineer adding a feature might add `isConsentEnforcementEnabled()` back (copy from git history) and have it silently re-enabled. Remove the env var everywhere.

**Fix required in plan:** Add to Step 9 acceptance criteria: "Env var removal checklist: (1) `CONSENT_ENFORCEMENT` removed from Vercel project env vars (production + preview) via Vercel dashboard — confirm with Andrew before deploy; (2) removed from `.env.example` or any `.env` doc files; (3) `PLATFORM-ASSUMPTIONS.md` table row for this env var updated to 'Deleted in P3'; (4) grep `CONSENT_ENFORCEMENT` in repo → zero occurrences in source code (docs-only references are acceptable)."

---

### Axis 4 — Auth / ownership boundaries

#### [MAJOR] P3-M-F — Unclaimed student `notFound()` replacement post-consent-click-retirement not actionable

**Risk.** Plan Step 11 says: "Remove `consentAcknowledged` re-check [in `workspace/page.tsx`] (replace with `learnerProfileId` + snapshot presence check)."

Currently `workspace/page.tsx` L71-73: `if (!session.consentAcknowledged) { notFound(); }`. After Step 11, this becomes something like:

```typescript
const student = await db.student.findUnique({ where: { id: session.studentId }, select: { learnerProfileId: true } });
if (!student?.learnerProfileId) { notFound(); }
const snapshot = await db.sessionConsentSnapshot.findUnique({ where: { whiteboardSessionId: session.id } });
if (!snapshot) { notFound(); }
```

`notFound()` in Next.js renders the 404 page. For a tutor who hasn't migrated a student (e.g., in the early P3 rollout period before the Neon migration runs), this gives Sarah a 404 with no explanation.

The more secure and user-friendly behavior: if `!learnerProfileId`, redirect to the student detail page with a query param that shows "This student needs to be linked to a learner profile before starting a session." This is especially important because Sarah will encounter this state during the Pillar 3 rollout before the destructive migration runs.

**Fix required in plan:** Add to Step 11 acceptance criteria: "The `workspace/page.tsx` re-check replacement MUST NOT use bare `notFound()` for the `!learnerProfileId` case. Instead: redirect to `/admin/students/[id]?error=requires_claim` with a tutor-visible error message. `notFound()` is acceptable for the `!snapshot` case (session in inconsistent state — genuinely unexpected)."

---

#### [MINOR] P3-M11 — `assertOwnsWhiteboardSession` ownership boundary for the admit endpoint

**Note.** Plan Step 3: `assertOwnsWhiteboardSession` — tutor only. This is correct and consistent with all other session mutations. The design doc §6.5 confirms. No gap.

---

### Axis 5 — Security / consent / ownership

#### [MINOR] P3-M12 — `allowLiveSession = false` admit rejection: timing between snapshot freeze and admit

The plan has the admit endpoint check `SessionConsentSnapshot.allowLiveSession`. This snapshot was frozen at `createWhiteboardSession`. If a parent sets `allowLiveSession = false` AFTER the session is created but BEFORE the tutor admits, the snapshot has the old `allowLiveSession = true` and the admit succeeds. The design doc §4.5 and §6.5 document this as intentional (snapshot freeze = immutable). No blocker. Noting for documentation.

---

#### [MINOR] P3-M13 — Smoke item 15 (both themes) covers items 1–9 only; items 10–14 missing from theme requirement

Plan §7.2 smoke item 15: "Repeat 1–9 in light and dark." Per the pre-master smoke template rule ([`.cursor/rules/smokebook-template.mdc`](../../.cursor/rules/smokebook-template.mdc)): the pre-master comprehensive smoke MUST exercise every in-scope item in both themes. Items 10–14 (recording post-admit, consent deny audio, pending cancel, parent POST, no consent click) are absent from the theme coverage spec.

This is a smoke-documentation gap, not a code gap. The smoke author should extend item 15 to "Repeat 1–14 in light and dark" or move the theme-coverage note to a per-item sub-note.

---

#### [MINOR] P3-M14 — `shouldCaptureWB` gate via `tutorWantsRecording` is correct; verify FSM doesn't carry state across shell mode flip

The plan's FSM guard approach (force `tutorWantsRecording` effective false while `sessionPhase === 'pending'` → `shouldCaptureWB = recordingActive = false`) is correct per the lifecycle machine (`lifecycle-machine.ts` L506: `shouldCaptureWB: recordingActive`). One subtle risk: if the shell flips from `waiting` to `live` and mounts `WhiteboardWorkspaceClient`, the workspace initializes its own `tutorWantsRecording` state. If this state is initialized from `consentSnapshot.allowAudioRecording` (which could be `true`), recording arms immediately on mount — which is the correct post-admit behavior. But verify: the workspace does NOT inherit `tutorWantsRecording` state from the waiting room component (which had it forced to false). These are separate React trees with separate state. No cross-contamination risk from the FSM.

---

### Sync-start × recorder pillars (plan's highest-risk area #1)

**Assessment: Safe as designed, with B3/B4 caveats above.**

The plan's Pillar 1 invariant protection is correct: `sessionPhase` is a precondition input to the workspace (not inside FSM side effects); the FSM cannot arm until the workspace mounts; the workspace mounts only after the shell's `mode` flips to `live`; `mode` flips only after the client observes `sessionPhase === 'active'` from the server poll; the server sets `sessionPhase = active` only via the admit endpoint (atomic transaction). The glare window (admit fires → server sets active → client polls → shell flips → workspace mounts) is clean because `tutorWantsRecording` is initialized fresh on workspace mount, not inherited from the waiting room.

Outbox invariant: same `wbsid` across waiting→live is correct (Step 3: "Outbox `sessionId` unchanged across waiting→live (same `wbsid`)"). No IDB collision.

Atomic end: unchanged. Pending-cancel shortened path must go through `endWhiteboardSession` (not bypass it) to preserve Pillar 3 token revocation — this is the B5 blocker above.

---

### Timer triple-consistency (plan's highest-risk area #2)

**Assessment: Correct intent, B4 breaks execution.**

The plan's intended semantics (§5.3) are correct: link-open stamps nothing; admit sets `startedAt`; first post-admit dual-presence ping stamps `bothConnectedAt`; `activeMs` accumulates only when active. The implementation gap is that `active-ping/route.ts` has no `sessionPhase` check (B4). The join-timer route needs to return `startedAt: null` for pending sessions (the plan mentions this in Step 7 for the student join-timer display but doesn't add it as an acceptance criterion for the route). Step 7 exit criterion "Unit test on `active-time.ts` + join-timer route with phase fixtures" is the right direction but needs to include the `active-ping` route explicitly.

---

### Exhaustive capture-path enumeration (plan's highest-risk area #4)

**Assessment: All major paths covered; checkpoint route gap identified (M-A).**

The plan's Step 4 table enumerates: FSM `shouldCaptureWB`, `registerWhiteboardSessionAudioSegmentAction`, `endWhiteboardSession` audio path, events.json recorder, `generateNotesFromWhiteboardSessionAction`, `active-ping` accumulation. These are the correct paths.

**Missed path:** `POST /api/whiteboard/[sessionId]/checkpoint` (grounded: `src/app/api/whiteboard/[sessionId]/checkpoint/route.ts`) — no consent check, no phase check. Only `assertOwnsWhiteboardSession` + `assertTutorApproved`. See M-A above.

**Session-less notes path:** `assertConsentFromLiveRecord` (notes email) — see B2. Not a pending-state capture risk per se (email sends happen post-session), but a flag-deletion risk.

**No additional uncovered capture paths found.** The `notes-actions.ts` notes generation, the audio segment registration, the events upload, and the session recording creation are all gated.

---

### Destructive Neon migration (plan's highest-risk area #3)

**Assessment: Policy and dry-run discipline correct; one gap.**

§6.2 inventory, §6.3 script requirements, §6.4 execution gate checklist are well-specified. The `P3_MIGRATION_CONFIRM=yes` + stdin account email guard is appropriate. The dry-run-first requirement is correct.

**Gap:** §6.4 execution gate checklist does not list "backup confirmed" as a gate item. §6.3 step 4 says "Backup step: `pg_dump` relevant tables OR export CSV to `docs/handoff/artifacts/p3-migration-dry-run-<date>.json` before execute." This is in the script requirements (step 4) but not in the final gate checklist. An executor running the script without the backup step would not be blocked by any checklist item.

**Fix required (MINOR):** Add to §6.4: "- [ ] Backup confirmed: `pg_dump` or CSV export of `WhiteboardSession`, `Student`, `AccountHolder` tables completed and accessible."

---

### P2 shell integration (plan's highest-risk area #5)

**Assessment: Correctly scoped; DOM test gap on tutor side (M-D above).**

"Do not mount Excalidraw live engine while `sessionPhase === 'pending'`" is in the hard constraint table. Step 5 creates separate components for waiting mode that do not include `WhiteboardWorkspaceClient`. The `useLiveAV` A/V preview in waiting is correct (reuses existing hook inertly). The sync client "may connect for presence without scene capture" is a design choice that needs documentation in the spike (Step 0) — connecting to the relay before admit is legitimate for presence signaling, but the relay connection itself is not a capture risk.

---

## Consolidated finding table

| # | Axis | Severity | Title |
|---|---|---|---|
| P3-B1 | Data loss | **BLOCKER** | Backfill SQL `WHERE "sessionPhase" IS NULL` matches zero rows; all pre-migration sessions stay `pending` |
| P3-B2 | Data loss / Consent | **BLOCKER** | `assertConsentFromLiveRecord` omitted from `CONSENT_ENFORCEMENT` flag-deletion inventory |
| P3-B3 | Concurrency | **BLOCKER** | Pending-create flag-scope ambiguity; Step 2 creates pending sessions unconditionally; flag-off "legacy" invariant broken |
| P3-B4 | Timer / Concurrency | **BLOCKER** | `active-ping` route has no server-side `sessionPhase` check; billable timer can stamp during pending |
| P3-B5 | Resilience | **BLOCKER** | Pending-cancel execution path underspecified; no named server action, no `finalEventsBlobUrl` contract, no unit test |
| P3-M-A | Data loss | **MAJOR** | Checkpoint route has no session-phase gate; WB events uploadable during pending if FSM guard fails |
| P3-M-B | Data loss | **MAJOR** | `startedAt` nullable audit absent; non-null assertion sites throw at runtime post-migration |
| P3-M-C | Concurrency | **MAJOR** | Presence mechanism allows relay-only presence; not durable through relay restart |
| P3-M-D | Resilience | **MAJOR** | Tutor-side waiting room missing DOM test guard; `WhiteboardWorkspaceClient` could render in waiting mode |
| P3-M-E | Security | **MAJOR** | `CONSENT_ENFORCEMENT` env var removal checklist incomplete; Vercel env + docs gaps |
| P3-M-F | Auth | **MAJOR** | Unclaimed student `notFound()` replacement is not actionable; Sarah gets a 404 with no explanation |
| — | Data | MINOR | §6.4 backup not in execution gate checklist |
| — | Smoke | MINOR | Theme coverage (smoke item 15) covers items 1–9 only; items 10–14 missing |
| — | Consent | MINOR | `allowLiveSession = false` timing window between create and admit (design-doc documented as intentional) |
| — | Security | MINOR | FSM state carry-across shell mode flip: no cross-contamination risk found (noted, no action needed) |

---

## BLOCKERs — must fold into P3 acceptance before executor receives plan

### BLOCKER 1 — Backfill SQL (Axis 1 / Data loss)

**Where to add:** Plan §4 Step 1 migration SQL + Step 1 Exit criteria.

**Required addition:**
> "Backfill SQL must use `WHERE "sessionPhase" = 'pending'` (NOT `WHERE "sessionPhase" IS NULL`). When Prisma generates `ADD COLUMN "sessionPhase" ... DEFAULT 'pending'`, PostgreSQL immediately fills all existing rows with `'pending'` — there are zero NULL rows, so the `IS NULL` clause silently updates nothing. SAFE form: `UPDATE "WhiteboardSession" SET "sessionPhase" = 'active', "sessionMode" = 'live' WHERE "sessionPhase" = 'pending'` (sets all pre-migration rows to active; only post-migration sessions start as pending). Step 1 exit criteria MUST add: Run migration against a staging DB with existing rows → `SELECT COUNT(*) FROM "WhiteboardSession" WHERE "sessionPhase" = 'pending'` returns 0."

---

### BLOCKER 2 — `assertConsentFromLiveRecord` flag-deletion (Axis 1 / Consent)

**Where to add:** Plan §4 Step 9 Changes table + Step 9 Exit criteria.

**Required addition:**
> "Step 9 `consent-scope.ts` changes: audit ALL occurrences of `isConsentEnforcementEnabled()`. There are **two** in the current codebase — `assertEffectiveConsent` (L94) and `assertConsentFromLiveRecord` (L283). Both must be updated when the flag is deleted. For `assertConsentFromLiveRecord` post-deletion: remove the flag fast-path; the unclaimed-student fast-path (`!learnerProfileId → return`) becomes `throw ConsentError` (no consent = no notes email for unclaimed); the self-learner fast-path stays (check `profile.isSelfLearner → return`). Step 9 exit: `rg 'isConsentEnforcementEnabled' src/` returns zero results; `consent-b2.test.ts` tests `assertConsentFromLiveRecord` without flag."

---

### BLOCKER 3 — Pending-create flag scope (Axis 2 / Concurrency)

**Where to add:** Plan §4 Step 2 Changes table + Step 8 + Step 2 Exit criteria.

**Required addition:**
> "Step 2 `createWhiteboardSession` pending creation MUST be gated on `NEXT_PUBLIC_WB_WAITING_ROOM === '1'`. When flag is unset: create session with `sessionPhase: 'active'`, `startedAt: new Date()` (legacy behavior preserved). `workspace/page.tsx` `initialMode` computation similarly gated: if flag off, always pass `initialMode: 'live'`. Step 8 clarification: 'The flag gates BOTH the pending-create behavior (Step 2) AND the shell's `waiting` mode routing (Step 5). Flag off = legacy path end-to-end.' Step 2 exit criteria: 'With `NEXT_PUBLIC_WB_WAITING_ROOM` unset, `createWhiteboardSession` creates `sessionPhase: active` sessions; workspace loads straight to live board.'"

---

### BLOCKER 4 — `active-ping` server-side phase check (Axis 2 / Timer)

**Where to add:** Plan §4 Step 7 Changes table + Step 7 Exit criteria + §7.1 automated tests.

**Required addition:**
> "Step 7 `active-ping/route.ts` change: before processing any timer field, read `sessionPhase` from the session row. If `sessionPhase !== 'active'`: skip `bothConnectedAt` stamp, skip `activeMs` accumulation, return current values unchanged. Step 7 exit criteria must add: 'Unit test: `active-ping` with `sessionPhase = pending` → response unchanged (`bothConnectedAt: null`, `activeMs: 0`); DB row unchanged. Unit test: `active-ping` with `sessionPhase = active` → `bothConnectedAt` stamped on first positive ping.' §7.1 new test file `join-timer-phase.test.ts` must cover both phase cases for the ping route."

---

### BLOCKER 5 — Pending-cancel execution path (Axis 3 / Resilience)

**Where to add:** Plan §5.4 + §4 Step 4 Changes table + §7.1 automated tests + file touch map.

**Required addition:**
> "§5.4 pending-cancel execution: `WaitingRoomWorkspace.tsx` calls a new server action `cancelPendingSession(whiteboardSessionId)` (add to file touch map: `src/app/admin/students/[id]/whiteboard/actions.ts`). This action: (1) `assertOwnsWhiteboardSession`; (2) reads `session.eventsBlobUrl` from the DB (the placeholder URL from create — no new upload); (3) calls `endWhiteboardSession(wbsid, session.eventsBlobUrl, { segments: [] })` — sets `endedAt`, revokes join tokens, registers zero segments. Pre-flight: verify `endWhiteboardSession` has no `startedAt !== null` assertion (confirmed from source: it does not). Unit test in `session-phase.test.ts`: `cancelPendingSession` with `startedAt: null, endedAt: null` → `endedAt` set; join tokens revoked; zero `SessionRecording` rows created; returns without throwing."

---

## Verdict

**NOT READY TO EXECUTE.**

Five BLOCKERs, each a targeted 1–5 sentence addition to existing acceptance criteria — none require architectural rework. The plan's overall architecture, pillar sequencing, FSM/outbox invariant analysis, and consent enforcement design are all sound. Once the BLOCKERs are folded in and the 6 MAJORs are addressed during execution, the plan is ready to hand to an executor.

**Top 3 risks after BLOCKERs are folded:**

1. **Backfill SQL (BLOCKER 1)** — the most dangerous because it fails silently on a staging DB with no existing rows, passes all pre-merge tests, and breaks production on deploy. The one-line fix (`IS NULL` → `= 'pending'`) is trivial; the risk is the executor not testing on a DB with real data.

2. **Pending-create flag scope (BLOCKER 3)** — invisible in smoke because Preview always has the flag on. Surfaces only when the branch merges to master with flag off and Sarah starts a new session. The fix requires a clear spec of which behavior is flag-gated.

3. **`active-ping` timer gap (BLOCKER 4)** — the only server-side integrity gap in the timer redesign. Everything else (link-open stamp removal, client-side `bothConnectedAt` zero display) can be correct while this one route still stamps the clock 2–5 seconds into the waiting period.

---

*Review authored 2026-06-17. Grounded against `v1-redesign` HEAD. Planner's self-flagged risks (BLOCKER-D2, BLOCKER-C2, BLOCKER-O1) reviewed and confirmed in scope — no additional architectural concerns beyond those already called out.*
