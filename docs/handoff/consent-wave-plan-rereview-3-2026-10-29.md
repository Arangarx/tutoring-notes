# Consent wave plan — re-review 3 (Sonnet, 2026-10-29)

Reviewer: [Sonnet re-review 3](17586724-bd88-49aa-8123-4721052ec6d3), read-only, against `feat/org-qol` @ `a5d85140`.

**Verdict: NEEDS-ANOTHER-PASS.** There are two small plan-text blockers, and no redesign is needed. B1, B2, SF2–SF5 and SF7–SF9 are resolved. B3, B4, SF1, SF6 and SF10 are partial (see below). Nothing diverges from Andrew's locked decisions. The `/join` question is settled in favor of revision 3: `join/[sessionId]/page.tsx` 198–223 denies fail-closed on a claimed minor with no snapshot. Self-learners skip the block at line 206.

## BLOCKERS

1. **M11 and M12 cannot run on WebKit.**
   - The fake-media flags in `playwright.config.ts` 41–45 are Chromium-only, and the `mobile` project is smoke-only (line 136). M12's inbound-byte oracle would have no real tracks.
   - The touch path is already reachable in Chromium with `hasTouch: true` (`wb-wave5-polish.spec.ts` 261 and 663, `wb-session-lifecycle.spec.ts` 2411).
   - Fix: run M11 and M12 in `wb-regression` on Chromium with `hasTouch` and fake media. Keep WebKit only for spy-only rows (M10, M13) with a stubbed `getUserMedia`.
2. **C4b's gate lists K1, K2 and K3(b), but each one needs the C4c reaper.** Move them to C4c. C4b keeps K3(a), K4 and a purge-only isolation arm.

## SHOULD-FIX

- **SF-A. Seam tests are only red because the seam is missing.** Land the seam call sites as no-ops in a first commit, then record red for S1, S5, S8, W11, W18 and G12 on that commit.
- **SF-B. Hold seams and locks.**
  - A seam parked inside `withOrgRowLock` holds the org lock. Run S1, S5 and S8 on a plain-owned tutor, with at most one org arm using a single Start.
  - The 4 s cap is too close to Prisma's 5 s default. Use a 3 s cap, or pass an explicit transaction `timeout`.
  - Back the seam helper with `globalThis`, as `blob-harness.ts` 27–41 does.
  - S8(b) cannot prove lock ordering, because both orderings give the same final state. Drop or rescope that claim.
- **SF-C. Batch re-check.** Make the `endedAt` check or `FOR SHARE` the first statement of the checkpoint batch transaction, not something that runs after the upsert (`checkpoint/route.ts` 187–220).
- **SF-D. The learner's manual mic controls are not gated.** `handleTopBarMic` (`WhiteboardWorkspaceClient.tsx` ~5535), `AVPermissionsPrompt`, retry and the picker all call `requestMic`. Gate inside the hook's `requestMic` and `requestMicAndCam`, and add a test row that clicks the control.
- **SF-E. Org lock timeout.** `withOrgRowLock` is a bare `db.$transaction` with Prisma's 5 s default (`org-scope.ts` 204–211). It loops over every open session, and the per-session statement count grows. Set an explicit timeout on the two org callers, or move the PENDING freeze and the intent write out of the lock.
- **SF-F. Reaper clock.**
  - The reaper passes the last-activity time as `now`, which back-dates `boardPurgeRequestedAt` and `frozenAt`. That trips `board_purge_stuck` immediately.
  - Use real server time for the intent and `frozenAt`. Back-date only `endedAt` and the duration.
- **SF-G. Cron deadlines.** Compute each job's deadline from the route start time instead of using fixed budgets.
- **SF-H. C3a changes the atomic End transaction.** C3a adds the row lock, the count gate and the PENDING snapshot write, and §3.6 says that class of change is Opus. Orchestrator decision: the End half of C3a is executed by Opus.
- **SF-I. Smaller fixes.**
  - M11 and M12 depend on a poll of up to 3.5 s, so give them a retry window.
  - Add learner `online_off` eviction to both `JoinUnavailableReason` maps (1446–1454 and 1516–1521).
  - In the ACTIVE case, the join-timer should do a single snapshot read.
  - Size `validUntil` for multipart uploads, where each part request is checked.

## Wrong claims

- **S8 and §6j.** The Start update already has `sessionPhase: "PENDING"` and `endedAt: null` (`actions.ts` 279–283). S8 is red because End writes no snapshot, not because of the update's condition.
- **S12.** S12 is a characterization test, not a red test. Relabel it, and add a new red test for "the freeze finds no record, so Start rolls back". S12's number is also used for two different meanings; fix that.
- **§6 infra on `withDbRetry`.** `isTransientDbConnectionError` matches connection errors only (`db.ts` 30–52), not P2028. Fix the stated reason.
- **LIVE-AV citation.** The first offer carrying the mic is invariant #15, not #2.

## ADDED items

- **C3c:** keep. Note that it touches the auth-adjacent `join-timer` route.
- **S12:** keep, relabeled.
- **W26 and the fifth seam:** low value. Must not gate anything.
- **Cron offset:** fine.

None of the Q6–Q9 defaults is unsafe. Q7 (`REAPER-ASSEMBLE`) is acceptable on Sonnet only with the stop-and-escalate tripwire.
