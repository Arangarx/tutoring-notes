# Consent wave plan — re-review 2 (Sonnet, 2026-10-29)

Reviewer: [Sonnet re-review](8c9af630-1350-4100-b5aa-1dc07b64be2d), read-only, against `feat/org-qol` @ `9253ae24`.

**Verdict: NEEDS-ANOTHER-PASS.** Five blockers. Each is a plan-text fix, not a redesign. Andrew's six locked decisions, Q1/Q2 and the no-record lock are implemented faithfully. R2, R3, R4 and F1–F8 are mostly sound. R1's premise is wrong (see wrong claims).

## BLOCKERS

1. **The reaper and purge share the cron route with the transcription sweep, with no isolation.** `src/app/api/cron/transcribe-sweep/route.ts` awaits `runTranscribeSweep()` only. `maxDuration` is 300, and `vercel.json` has two crons. § 3.3 chains reaper → purge → transcription with no try/catch isolation and no total budget. A throwing or slow reaper or purge row skips or kills the transcription sweep, which is Sarah's notes-durability backstop. Fix: give the reaper and purge their own route and `vercel.json` entry, or isolate each job in its own try/catch with budgets that sum to less than 300 s minus a margin. Test: a throwing reaper still lets transcription run.
2. **The reaper can end a live session, with no recovery.** `stale-session-stamp.ts:17–36` guards only `endedAt: null`. § 3.9 checks idleness at scan time and never re-checks it in the End transaction. A false positive is permanent and, if the session's whiteboard recording is off, purges the board. `ScheduledSession.endAt` is nullable, so "appointment endAt in the past" is undefined when it is null. Fix: re-check idleness inside the transaction (a conditional update with the idle predicate), define the null-`endAt` rule, and ship a first-deploy dry run (`would_reap`) or a kill switch. Test G12: activity lands between scan and stamp, and the session is not ended.
3. **The Start/End/reaper race tests cannot go red deterministically.** S1, S5 and S8 ("repeated N times") rely on concurrent server-action calls, and only W11 has a hold seam. Fix: reuse C0's `holdPoint` in three places — in `startSessionTx` between the consent read and the conditional update, in the End transaction before its update, and in the reaper between scan and stamp. Write each test as arm, park, release.
4. **How the learner learns the mode and capabilities after Start is unspecified.** § 4.1 item 6 says the learner knows the mode from `sessionMode`, but nothing reads it. `src/app/join` never references `sessionMode`, and `join/[sessionId]/page.tsx:315–316` passes only `initialSessionPhase`. The learner's capabilities prop is stale from page load, the same B5 problem. `useLiveAvCoordinator.ts:111–153` bootstraps the learner at sync-connect, before Start. On touch devices it uses a bundled `requestMicAndCam()`, which must be split. Fix: name the transport, defer learner audio until the mode arrives, and test it. Test: a learner is waiting, then the tutor Starts in person with audio off; zero audio `getUserMedia` calls, and the camera still works.
5. **Two waves put Grok on fragile files.** C0 changes the `checkpoint/route.ts` hold seam, `assemble-persisted-state.ts` (~106), `blob.ts:20` and `blob-inventory.ts:103–122`, which are the persistence and erasure paths. C7 changes the banner in `WhiteboardWorkspaceClient.tsx:1621` and the waiting room. Fix: Sonnet executes the production-file portions; Grok writes only spec skeletons, helpers and editor copy. Optional: C2a and C4c are over-tiered at Opus, and Sonnet clears both.

## SHOULD-FIX

1. **Start transaction.**
   - Start aborts if `freezeConsentSnapshotTx` finds no effective record inside the transaction.
   - § 2.6 step 2 must call `sessionEntryState` rather than inline the live-off rule (D3).
   - `assertConsentRecordExists` becomes the `no_record` reason in that same function.
2. **End idempotency.**
   - The End update at `actions.ts:1214` is unconditional, and the ended-check sits outside the transaction (`:1071`). Use `updateMany where endedAt null`, and write the snapshot and the purge intent only when `count` is 1.
   - Set `boardPurgeRequestedAt` only if it is null.
   - Make the `boardPurgeFirstPassAt` stamp conditional.
   - Two concurrent `runBoardPurge` calls (`after()` and the sweep) need the same care.
3. **D1 overstates the recovery window.** With no IndexedDB checkpoint, the board can lose everything since the last successful server save (`useWhiteboardRecorder.ts:167–170`). That is unbounded during a network drop. → ANDREW.
4. **Surface these to Andrew explicitly:**
   - A reaped whiteboard-on session has an empty replay until REAPER-ASSEMBLE is built.
   - A child's restriction no longer hides an existing replay after End.
   - `/join` is always online, so a learner device in an in-person room is blocked when online sessions are off.
   - A learner who is already connected is not evicted when the tutor Starts in person with online off.
5. **`validUntil` sizing.** Size it against the slowest legitimate PDF or image upload. The harness mint (`blob-harness.ts:213–248`) models no expiry, so real token behavior needs a PLAYWRIGHT-GAP and a BACKLOG entry.
6. **C4b gate order.** C4b's gate lists W13 arm B and the W14 reaper arm, but both depend on C4c, which lands later.
7. **Q1 "Share session".** The save at `notes-actions.ts:331–335` and `:354–355` sets `aiGenerated: true` and a prompt version even when no AI ran. A blank READY note would show to the family. Fix both and add a test.
8. **`CapabilityFields` must cover mic, transcript and replay.** Today `offEffect` plus bespoke logic splits that behavior across two places.
9. **Replay inventory.** The seven-site list omits the tutor-authenticated reads:
   - `/api/whiteboard/[sessionId]/events`
   - `/snapshot`
   - `/concat-audio`
   - `loadSessionReviewPayload`

   List them, or state that they rely on the data being absent.
10. **Org stamp lock time.** `org-scope.ts:670` and `:1081` stamp inside `withOrgRowLock` in a loop. The new per-session consent reads and freeze lengthen that lock, so bound them.

## Wrong code claims

- **R1 premise.** `createWhiteboardSessionCore` calls `assertConsentRecordExists` before insert (`create-session-core.ts:149–160`), so new unclaimed or no-record sessions are refused at create. `join/[sessionId]/page.tsx:198–203` treats snapshot-less claimed sessions as grandfathered pre-CC-1. Snapshot-less sessions are therefore legacy only. The upsert stays harmless, but S6 must seed a legacy PENDING row, and R1 needs restating.
- **S9/S10.** These are not red on the server today, because the refusal already exists (`actions.ts:241–252`, `create-session-core.ts:149`). Only the visible-reason assertion is red. Split the characterization part from the red part.
- **`listCheckpointBlobsForSession`.** It is module-private (`blob-inventory.ts:103`), so C0 must move or export it.
- **Concat audio location.** `concat-audio.ts:197` writes concat audio under `whiteboard-sessions/<adminUserId>/<studentId>/…`. That is safe against the session prefix, but the "never prefix-delete above session level" guard must name it.

## Missing tests

- Reaper idle re-check, and the null-`endAt` case.
- Cron failure isolation.
- Concurrent End, and concurrent purge.
- Learner mode adoption when the learner is open before Start, and the touch GUM split.
- Start aborting when the freeze finds no record.
- A learner already connected at an in-person Start with online off.
- Notes-off "Share session" provenance.

## ADDED items

- **C2a:** keep, executed by Sonnet.
- **C4a/C4b/C4c split:** keep all three. Add the kill switch to C4c.
- **`boardPurgeAttemptedAt`:** keep, low confidence. Per-row try/catch already covers a single poison row. The column matters only when more rows fail than fit in one batch. It is cheap, and it makes W25 testable.
