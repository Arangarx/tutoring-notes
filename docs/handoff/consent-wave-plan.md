# Consent wave — design plan

**Status:** DESIGN ONLY. Nothing here is built. First written 2026-10-29 on branch `feat/org-qol`. **Revised 2026-10-29 after the independent review** ([`docs/handoff/consent-wave-plan-review-2026-10-29.md`](consent-wave-plan-review-2026-10-29.md), verdict APPROVE-WITH-BLOCKERS) and the orchestrator decisions D1–D9 below. **Revised again 2026-10-29 after the re-review** (verdict NEEDS-ANOTHER-PASS, four blockers) with the orchestrator decisions R1–R4 and the folded items listed under "Re-review round" below. **Andrew's answers the same day:** Q1 and Q2 APPROVED 16:20; the stale-session reaper (Q3) APPROVED 16:17; no-record Start lock 16:23 (§ 2.6). Q4 (copy) and Q5 (prod migration) stay PENDING ANDREW. The re-review's ADDED items stay veto-able (§ 11).
**Authority:** [`docs/handoff/privacy-consent-review-brief-2026-10-28.md`](privacy-consent-review-brief-2026-10-28.md) (all six decisions LOCKED 2026-10-29). Where this plan and the brief disagree, the brief wins and this plan is wrong.
**Companion:** [`docs/handoff/org-ux-pass-plan.md`](org-ux-pass-plan.md) (entry-block table, glossary, W4/W9). Its W4 text was updated to match D3.

**How to read the evidence.** Every "today" claim below was checked against the working tree on 2026-10-29, and every claim in the review was re-checked against code before it went in. Line numbers move; re-grep the symbol before editing. **CORRECTION** marks a claim from the brief or from the first draft of this plan that turned out different in code. **UNVERIFIED** marks something I could not settle by reading; it names the red test that will settle it.

---

## Revision summary

### Orchestrator decisions (applied, not open)

| # | Decision | Where it lands |
|---|---|---|
| D1 | Whiteboard consent off: the tutor's IndexedDB stroke-log checkpoint is **never written** for that session (no recording to recover). Any leftover checkpoint for the session is also cleared at End. Privacy copy says "our servers" plus device data explicitly, and names backup retention (Neon point-in-time history, Vercel Blob delete semantics) honestly. | § 3.7, § 7c, W15–W16 |
| D2 | Board purge is durable: a purge-intent is written inside the End transaction **and** inside the one shared stale/forced End stamp helper (covers all four `stampStaleWhiteboardSessionEnd` callers plus End). **Amended by R2: the intent carries no blob URLs; the purge deletes by session prefix only.** Executed by `after()` and by a **separate purge sweep on the same cron**, not tied to the transcription sweep budget. Two-phase (delete, wait past the token and flush window, delete again, then stamp `boardPurgedAt`). Sweeps rows as well as blobs, re-checks `endedAt` inside the checkpoint batch transaction, and guards asset upload after End. Unreadable capability: never purge, retry. | § 3, § 5, W3–W25 |
| D3 | One rule, many callers. Org `sessionEntryState` is a pure rule with an online / in-person mode dimension, built in org W4. Every server enforcement site (Start, `/join`, bridge, schedule) calls it in place; control flow is not rerouted through a UI component. UI reads the same function. C5 wires the remaining callers. | § 2.4, org plan W4 |
| D4 | After End, replay reads **only the frozen snapshot**, never the live `ConsentRecord`. All seven replay decision sites go through one canonical replay-access function. C6 is Sonnet or Opus, never Grok. C2a, C4b and C4c are Opus; C4a is Sonnet. C1 is Sonnet. C2/C3 gates add `@wb-presence` and `@wb-sync`, or the full `test:wb-sync`. | § 2.9, § 8 |
| D5 | One switch table: `CAPABILITY_TABLE` and `CONSENT_SWITCHES` merge into one source that drives copy **and** enforcement. No temporary alias for `deriveAudioCapturePolicy` survives past the wave that introduces its replacement (C1). `isLearnerLane` absorbs the existing copies. `notesForbidden` reconciled with the notes capability. The `org-learner.ts` raw-record read that ignores `ConsentRestriction` is a live child-floor bug: fixed in C1 with a red test. | § 2.2, § 2.7, C1 |
| D6 | **APPROVED (Andrew 2026-10-29).** Q1 (16:20): notes off keeps the tutor review step, and the review screen ends with a "Share session" save that releases the replay to the family, same as notes today. If the tutor never finalizes, the family has nothing to access. Q2 (16:20): consent changes are forward only; the consent in force when the tutor presses Start governs the session; a mid-session or later change applies from the next session, and copy says so. The Start refreeze happens inside the same conditional PENDING→ACTIVE update on both code paths, `startWhiteboardSession` returns the refrozen capabilities, and the client adopts them before arming any recorder. | § 2.6, § 10 |
| D7 | Mic: defer acquisition until the mode is known; release the mic on a flip to in person; still settle `micAcquireSettled`; gate every opener, including the learner-side bootstrap; no `AudioContext` silent-stream idea. Tests: zero audio `getUserMedia` calls on each path; camera still works after a skipped mic. | § 4, M1–M10 |
| D8 | Transcript upsert never overwrites stored `streamId` / `speakerId`; kick and sweep pass lane identity; refused rows reach a terminal state so they never starve the sweep. The tampered-label limit is documented. | § 2.3, A8–A9, N6 |
| D9 | C0 builds the shared test infra first: blob-harness list by prefix, delete, fault injection. | § 6 infra, C0 |

### Re-review round (NEEDS-ANOTHER-PASS, four blockers) — decisions applied

Every claim below was re-checked against the working tree on 2026-10-29 before it went in. Where I deviated from the decision text or added something the decision did not name, the row says **ADDED** so it can be vetoed.

| # | Decision | Where it lands |
|---|---|---|
| R1 | The Start refreeze is an **UPSERT**: it creates the `SessionConsentSnapshot` row if missing. `createSessionConsentSnapshot` writes no row for an unclaimed learner or one with no record (`consent-scope.ts` 306–312, 326–332), so an update-only refreeze leaves a session that was created unclaimed with no snapshot, and a whiteboard-off family choice made after the claim would be ignored (the session reads as legacy and keeps the board). **One rule for a PENDING session ended without Start: the live record at End decides, and the End path writes the snapshot** (same upsert, inside the End transaction and the shared stale stamp), so the purge intent and `runBoardPurge` read the same source. Red tests S6, S7, S8. | § 2.6, § 3.2, § 6b, C3a, C4b |
| R2 | **`boardPurgeUrls` is dropped.** The purge deletes by session prefix only (`whiteboard-sessions/<studentId>/<sessionId>/` and `whiteboard-checkpoints/<sessionId>/`). **W19 (tutor-path prefix guard + `endedAt` guard on asset upload) is a prerequisite of C4 (the purge, C4b)** and ships first as C4a. Red test W23: End or finalize with a foreign or audio URL as `eventsBlobUrl` must not delete that blob. Migration list updated. | § 3.2–3.5, § 5, § 6e, C4a/C4b |
| R3 | **Sessions that never end:** a stale-session reaper on the existing cron ends sessions with no activity for 24 hours through the shared stale/forced stamp helper, **all** such sessions (one End semantics), with the purge following for whiteboard-off ones. **APPROVED (Andrew 2026-10-29 16:17).** The decline fallback in § 3.9 is historical and does not ship. Every effect of an automatic End on a whiteboard-on session is listed in § 3.9. **W13 depends on the reaper.** An "are you still there?" prompt is out of scope (backlog `WB-IDLE-STILL-THERE`). | § 3.9, § 6k, C4c, § 11 Q3 |
| R4 | W11 asserts **zero batch rows before any purge pass** via a **hold seam** between `assertActiveSession` (`checkpoint/route.ts` 63–110) and the batch transaction (:187), so it is red without the in-transaction re-check. A **pass-2 delay seam**: backdate `boardPurgeFirstPassAt` through the DB oracle helper, used in W8, W11, W12, W22. Blob token default lifetime is **one hour** (`@vercel/blob` 2.3.3 `client.d.ts` 349, 383); `validUntil` is unset anywhere in `src/`. C4b sets `validUntil` explicitly and derives the pass-2 delay from the same constant. | § 3.3, § 3.4, § 6 infra, § 6e |
| F1 | C0's gate also runs the erasure suites: C0 changes `deleteBlob` and the `list` call sites on the erasure path. | § 8 C0 |
| F2 | C1 and C2 run **strictly serial** with org W4 (all three edit `actions.ts`). | § 2.4, § 8 |
| F3 | `SessionCapabilities.entry` is **dropped**. Entry is org W4's `sessionEntryState` only. The `live` toggle leaves the capability input too, so there is one reader of it. | § 2.2 |
| F4 | `isLearnerLane` / `parseLane` absorb **every** lane builder and parser: `lifecycle-machine.ts` 780–789, `remote-stream-recorder.ts` 60–62 (an exact duplicate of the lifecycle-machine builder), `upload-outbox-instance.ts` 136–138, `perspeaker-identity.ts` 64–66, `notes-worker.ts` 249–253 and 519–524. `lifecycle-machine.ts` is edited only in an Opus-tier wave: **ADDED new wave C2a**. | § 2.3, § 2.7, § 8 |
| F5 | Single-resolver guard: `claim/[token]/setup/page.tsx` 68 is **fixed** (it re-derives the owner inline); `child-consent.ts` 189 is **fixed in C1** (behavior-preserving move of the read, display change stays in C7). Reasons in § 2.1. | § 2.1, § 6i |
| F6 | The purge sweep query excludes not-yet-eligible rows (pass-2 delay not elapsed, no `allowWhiteboardRecording = false` snapshot readable) so they cannot occupy the batch. **ADDED:** a fourth nullable column `boardPurgeAttemptedAt` so a row that keeps failing rotates to the back instead of starving the rest. Predicate-only would still let more than one batch of persistently failing rows starve; veto if you prefer three columns. | § 3.3, § 5 |
| F7 | `TUTOR_NOTE_STATUSES` (`transcript-types.ts` 20–26) gets `skipped` next to chunk `refused` (`TRANSCRIPT_CHUNK_STATUSES`, 5–10). The notes card (`TutorNotesSection.tsx` 193–204) treats any status other than pending/generating/done/partial/failed as nothing, so it also gets a `skipped` state. | § 2.3 |
| F8 | Sync relay: stores no board state (evidence in § 3.10); covered by test W24 and one copy line. | § 3.10 |

### Review items → where they landed

| Review item | Landed in |
|---|---|
| B1 purge not durable; client `events.json` survives; IndexedDB log | § 3.2–3.3, § 3.7, § 5 (intent columns), W13–W16 |
| B2 in-flight writes survive; sweep can't see rows | § 3.4, W11–W12, W19 |
| B3 lane rule fails open after retry | § 2.3, A8–A9, N6 |
| B4 in-person "no mic" targets wrong code | § 4.1, M1–M10 |
| B5 refreeze under-specified | § 2.6, S1–S4 |
| B6 test oracles don't exist | § 6 infra, C0 |
| B7 replay not pinned to what was recorded | § 2.9, R1–R6 |
| B8 real reliability bar not used | § 9 (rewritten) |
| SHOULD-FIX: end paths | § 3.5 |
| SHOULD-FIX: refused rows terminal | § 2.3, N6 |
| SHOULD-FIX: don't couple purge to sweep budget | § 3.3 |
| SHOULD-FIX: org W4 sequencing | § 2.4, org plan W4 |
| SHOULD-FIX: duplication | § 2.2, § 2.7 |
| SHOULD-FIX: tiering | § 8 |
| SHOULD-FIX: erasure regression risk | § 3.6, W21 |
| SHOULD-FIX: copy honesty | § 7c |
| "Plan claims that turned out wrong" (7 rows) | § 1c (all corrected in place) |
| Missing test cases (14) | § 6 (each has an ID; see the coverage line at the end of § 6) |

**Fragile surfaces this wave touches (tripwire #2 in `orchestrator-discipline.mdc`).** All of these are escalation territory, not Composer territory:

| Surface | What changes | Pillar impact |
|---|---|---|
| `endWhiteboardSession` (atomic end-session) | Deletes board rows and writes the purge intent inside the transaction when whiteboard consent is off; ignores client-supplied board URLs | **Changes Pillar 3 contents** (not its order). § 3. |
| `stampStaleWhiteboardSessionEnd` (4 callers, plus the reaper) | Writes the same purge intent; upserts the snapshot first when the session is still PENDING (R1) | Same Pillar 3 family. |
| Stale-session reaper (new caller of the stamp helper, APPROVED Andrew 2026-10-29) | Ends every open session with no activity for 24 h from the existing cron | Automatic End on a live commercial surface. § 3.9. Opus. |
| `startWhiteboardSession` | Snapshot **upsert** inside the conditional update, both code paths; returns capabilities | Fragile (check-then-act today). |
| Recorder FSM / outbox / mixdown | None to the FSM or outbox code. The policy input changes so fewer lanes are created. | No pillar change. Verified by test. |
| `useAudioRecorder` mic acquisition, learner A/V bootstrap | Acquisition deferred by mode; release on flip; every opener gated | A/V transport and effect wiring: Opus under the reliability-floor override. |
| Transcription store / worker / sweep / kick | Upsert stops overwriting lane identity; refusal states | Fragile (silent relabel today). |
| Live A/V (`useLiveAV`, `peer-mesh`) | None to mesh/signaling. Only the point where the local mic is requested. | Read `docs/LIVE-AV.md` first. |
| Whiteboard sync apply path | None. Board keeps working live exactly as now. | None. |
| `/join/[sessionId]` auth boundary, replay access (7 sites) | Entry check for every principal; one replay-access function | Auth-boundary change: Sonnet or Opus. |
| DB migration | Four additive nullable columns on `WhiteboardSession` (§ 5) | Prod migration needs Andrew's go. |
| Upload-token route (`api/upload/blob/route.ts`) | Tutor-path pathname prefix guard, `endedAt` refusal, explicit `validUntil` (C4a, C4b) | Auth boundary: Sonnet or Opus. |

---

## 0. The rules, restated as capabilities

Locked in the brief. Restated so the plan has one vocabulary.

| Switch (DB key unchanged) | New label | Meaning |
|---|---|---|
| `allowLiveSession` | **Allow online sessions** | Off blocks online Start and every remote join. In person stays allowed. |
| `allowAudioRecording` | Audio recording | Off: online saves the tutor's own track only; in person saves no audio. |
| `allowWhiteboardRecording` | Whiteboard recording | Off: board works live, deleted at session end. |
| `allowNoteSending` | Session notes | Off: no transcript, no drafted notes. |

Going forward only. No migration of existing data. No cleanup of existing sessions.

---

## 1. Current vs target

### 1a. Per switch

| Switch off | Today (evidence) | Target |
|---|---|---|
| **Online sessions** | Blocks online **Start** (`startWhiteboardSession` `refuseLive`, `actions.ts` ~297), schedule bridge for learner/AH principals only (`schedule-bridge.ts` 104–113), and the `/join` page for **children only** (`join/[sessionId]/page.tsx` ~199–217, inside `if (!isSelfLearner)` at 206). Self-learner (and, via `/w/[joinToken]` redirect, anyone holding an old link) is **not** checked at `/join`. `issueJoinToken` (`actions.ts` ~456) has no live check. Waiting room silently flips mode to in person (`WaitingRoomOverlay.tsx` ~167–174). "Open room" is blocked for the tutor when off (`OpenScheduledRoomButton.tsx` 11–16), but ad hoc Start reaches the same room by the waiting-room flip. | Blocks online Start, and **every** remote join for child, parent-as-child and self-learner. In person allowed through one explicit path with one answer from Start / Open room / resume / schedule. No silent mode flip. |
| **Audio** | Client policy `deriveAudioCapturePolicy` (`audio-capture-policy.ts` 15): `full` / `tutor_only` / `none`. One product call site (`WhiteboardWorkspaceClient.tsx` 1613; import at 78). Used for mixdown attach, gain, per-speaker lanes (~2735, ~2852, ~2919–2940). Server mirror `resolveModeAwareAudioRecordingConsent` (`consent-scope.ts` 174) gates segment registration (`actions.ts` 1899), **chunk enqueue** (`actions.ts` 2090), End (1128) and forced-end upload (756). **Gaps:** nothing on the server distinguishes a learner lane from a tutor lane; `kickSessionChunksAction`, the sweep, and `finalizeWhiteboardSessionFromBackend` do not read consent; the notes path never reads `allowNoteSending` for drafting. | Same three outcomes, enforced on both client (never capture) and server (never accept / transcribe / mix) from one capability answer. Learner voice never transcribed without audio consent, even transiently. |
| **Whiteboard** | Client: `deriveWbCaptureActive` — policy `none` still follows `wbEventsActive`, so strokes persist with no audio. Server: batches (`WhiteboardEventBatch`, schema 549), checkpoint blobs (`checkpoint/route.ts` 237), final events blob at End, snapshot PNG at End (`WorkspaceClient` ~4593–4635), asset blobs, and the tutor's IndexedDB checkpoint (`useWhiteboardRecorder.ts` 1088–1135) are written regardless of `allowWhiteboardRecording`. Replay gate reads consent only on the parent/child path (`loadWhiteboardReplayIdsForNotes.ts`); the tutor path and the share-link path have none. Snapshot image feeds notes. | Board works live including reload/rejoin (batches stay until End). At End: stroke log, batches, checkpoints, embedded assets, snapshot are deleted (durably, § 3); no IndexedDB checkpoint is ever written; no snapshot image goes into notes. On: saved and replayable. |
| **Notes** | `allowNoteSending` is checked for **emailing** a note. Transcription enqueue, `generateNotesFromWhiteboardSessionAction` (~1543), `enqueueNotesGeneration`, `notes-worker`, `transcribe-sweep` never read it for drafting. Finalize triggers transcription + notes unconditionally. `notesForbidden` (org "End it now, and no notes") gates only the SessionNote status change (`whiteboard-scope.ts` 117, `notes-actions.ts` 294, `NoteCardActions.tsx` 133); no read in `notes-worker` or `transcription-worker`. | Off: no transcript rows, no `TutorNote` draft, from any entry point including sweeps. Audio on still yields an audio replay. `notesForbidden` folds into the same capability (§ 2.2). |

### 1b. Per surface

| Surface | Today | Target |
|---|---|---|
| Tutor — Start (ad hoc) | `startWhiteboardSession` live-record check, outside the conditional update; org-blind check on student page (`students/[id]/page.tsx` 115–122 uses `adminUserId: scopedAdminUserId`, not the org record) | One `sessionEntryState` (org-ux W4) called in place; owner resolved by `consentOwnerFromStudent` |
| Tutor — Open room | Blocked if live off (`appointmentLiveEntryAllowed`, `upcoming-sessions.ts` 78–95) | Allowed if **either** mode is allowed; waiting room offers only permitted modes |
| Tutor — resume | No consent check | Same `sessionEntryState` |
| Tutor — org learner list | `org-learner.ts` 235–240 reads the raw `ConsentRecord`, ignores `ConsentRestriction` (**child-floor bug today**) | Calls the same function through the resolver; fixed in C1 |
| Child join | Snapshot live check at `/join` | Same; reason line from `ENTRY_BLOCK_COPY` |
| Parent-as-child join | `decideAhJoin` then no live check | Same check as child |
| Self-learner join | **No live check** (gap) | Same check |
| Waiting room | `liveAllowed = allowLiveSession !== false`; auto-flips to in person; Copy student link still shown | Shows permitted modes + one-line reason; no flip; no link for blocked online |
| In-session banner | Tutor-only, ad hoc strings | One notice component for tutor **and** learner (§ 2.5) |
| Learner in session | Nothing says what is off | Same notice, learner-worded |
| Tutor replay | Always available (no consent read) | Whatever was recorded, via the one replay-access function (§ 2.9) |
| Parent/child/self-learner replay | Note not DRAFT **and** (live record AND snapshot) whiteboard consent (`loadParentVisibleWhiteboardReplayIds`, `loadWhiteboardReplayIdsForNotes.ts` 147–274) | Whatever was recorded, read from the frozen snapshot only |
| Share link | No consent read (`parent-share-replay-access.ts` header: "Consent stays on the card loaders; this gate does not re-apply it") | Same replay-access function, nothing more |
| Child consent screen | `child-consent.ts` 132–134: `records.every(...)` — AND across all tutors/orgs | Per-owner truth, one function |
| Terms/Privacy | Several lines overclaim or omit (§ 7) | Match behavior |

### 1c. CORRECTIONS (to the brief, to the first draft of this plan, and per the review — all verified)

1. **DRAFT notes are not auto-created at reduce completion.** `sessionNote.create` exists only in tutor Save (`notes-actions.ts` 345), attach-to-note (`actions.ts` ~2201, creates DRAFT) and `students/[id]/actions.ts` 146. The AGENTS.md `nsi` description ("auto-creation at reduce completion") does not match code. **Consequence:** a family can replay only after a non-DRAFT `SessionNote` is linked. With notes off, nothing prompts the tutor to create one. See Q1 (APPROVED, Andrew 2026-10-29): the review step stays, and it ends with "Share session". If the tutor never finalizes, the family has nothing to access.
2. `audio-capture-policy.ts` is in `src/lib/recording/`, not `src/lib/whiteboard/`.
3. The consent snapshot is frozen at session **create** (`createSessionConsentSnapshot`, `consent-scope.ts` 303–350), but Start re-reads the **live record** (`actions.ts` 268–298) and the waiting room reads the snapshot. Two sources of truth for the same decision. Fixed in § 2.6.
4. `assertEffectiveConsent` (`consent-scope.ts` 78) has no product callers outside tests. **Also** `resolveRecordedConsent` (`consent-scope.ts` 662, raw toggles, no restriction) has no product callers. Both are deleted (§ 2.7), not reconciled.
5. `[cns]` is used throughout the code but is **not** in the AGENTS.md prefix registry. Add it in C0.
6. `deleteWhiteboardSessionAndDataAction` (`notes-actions.ts` ~415–495) deletes DB rows only, not blobs. Out of scope, but it shows no "delete session data incl. blobs" helper exists; § 3 builds one from the erasure inventory pieces.
7. **First draft said `enqueueChunkTranscriptionAction` "does not read consent". Wrong.** It calls `resolveModeAwareAudioRecordingConsent` (`actions.ts` 2090–2098). The real gaps are lane identity (it accepts any `streamId` when mode-aware consent is `allow`, which is true for online + audio off) and notes.
8. **First draft said `useLifecycleInputStreams` (~2439) opens the mic. Wrong.** No such hook exists. `lifecycleInputStreams` (`WhiteboardWorkspaceClient.tsx` 2434–2469) is a `useMemo` health map whose `tutor:mic` entry is already gated by `audioCapturePolicy !== "none"`. The real opener is the unconditional mount effect in `useAudioRecorder.ts` 575–596 (`acquireMic({ forRecording: false })`, `[]` deps), which then flips `micAcquireSettled` in a `finally`. Other openers: § 4.1.
9. **First draft said "6 import sites" for `deriveAudioCapturePolicy`. Wrong.** One product site (`WhiteboardWorkspaceClient.tsx` 78, 1613) plus its unit test (`audio-capture-policy.test.tsx`).
10. **First draft said embedded assets are reachable only through the events log. Wrong.** All client board blobs sit under `whiteboard-sessions/<studentId>/<sessionId>/` (events `upload.ts` 118, snapshot 135, assets `…/assets/` 168) and are prefix-listable. Audio is under `sessions/<studentId>/…` (`recording/upload.ts` 70), so a board-prefix delete cannot touch audio. The assembled blob written by finalize (`actions.ts` 939) is under `whiteboard-sessions/<adminUserId>/<studentId>/<ts>-events.json`: that prefix is **not session-scoped**, so it must never be prefix-deleted; skip assembly when `persist` is false instead.
11. **First draft said the blob harness could be the oracle. It cannot.** `blob-harness.ts` has `put`/`get`/`reset` and no list or delete. Worse, `deleteBlob` (`blob.ts` 20–22) calls `@vercel/blob` `del` directly and never checks the harness, so a purge test would call the real API with a harness URL. Fixed in C0.
12. **First draft marked "audio upload may receive a session id" UNVERIFIED. Settled: it does not.** The audio token carries `studentId` only (`api/upload/blob/route.ts` 125–147). The server backstop for audio-none is therefore segment registration and chunk enqueue, not token issue.
13. **First draft said the reliability-bar file was absent. Wrong.** It exists at `../agenticPipeline/.cursor/rules/reliability-bar.mdc`; its five axes are data durability, clock + ordering, race conditions on user input, cross-platform parity, observability. § 9 is rewritten on them.
14. **First draft's end-path list was incomplete.** `stampStaleWhiteboardSessionEnd` has four callers (`org-scope.ts` 670 and 1081, `org-force-end-touch.ts` 33, `actions.ts` 1410), and `acceptOrgForcedEndUpload` (`actions.ts` 756–781) writes `eventsBlobUrl` with no consent check. § 3.5.
15. **New, not in the review:** the tutor path of the upload-token route (`route.ts` 210–230, and the events/snapshot kinds) does **not** validate that `pathname` starts with `whiteboard-sessions/<studentId>/<sessionId>/`; the student and learner paths do (`whiteboard-scope.ts` 164, 203). A tutor-side upload can land outside the prefix the purge deletes. § 3.4 adds the guard.
16. **New, not in the review:** `TranscriptChunk.status` and `TutorNote.status` are plain strings (`schema.prisma` 605, 675). A terminal "refused" state needs **no migration**, only a new member of `TRANSCRIPT_CHUNK_STATUSES`, and the plan's `skipped` for notes needs a new member of `TUTOR_NOTE_STATUSES` too: today that list is `pending`, `generating`, `done`, `failed`, `partial` (`transcript-types.ts` 20–26) and has **no** `skipped`; `TRANSCRIPT_CHUNK_STATUSES` is `pending`, `transcribing`, `done`, `failed` (5–10) and has no `refused`. Both are added in C2 (§ 2.3).
17. **New (re-review):** the empty placeholder `events.json` created with the session is **not** under the session prefix: `create-session-core.ts` 169 writes `whiteboard-sessions/<adminUserId>/<studentId>/<ts>-events.json`, the same non-session-scoped shape as the assembled blob in item 10. It holds only the start timestamp, no board content, and the purge leaves it alone (it is the NOT NULL `eventsBlobUrl` value the row keeps). Erasure still deletes it by the row URL (`blob-inventory.ts` 183).
18. **New (re-review):** `studentMicStreamId` is defined **twice, byte for byte**: `lifecycle-machine.ts` 787–789 and `remote-stream-recorder.ts` 60–62 (the second one's doc comment says to use "this helper"). `TUTOR_MIC_STREAM_ID` lives at `lifecycle-machine.ts` 780 and is imported by six product files. Both are lane-format owners that § 2.3 now absorbs.
19. **New (re-review):** `endWhiteboardSession` accepts **any** absolute `http(s)` URL as the final events URL (`actions.ts` 1107; the same check at 744 on the forced-end path) and stores it in `eventsBlobUrl`, which the erasure inventory then deletes (`blob-inventory.ts` 183). That is why R2 forbids the purge from deleting anything named by a row or request URL. Validating that URL on the persist-true path is outside this wave; recorded as BACKLOG `EVENTS-URL-VALIDATE` in C4b.
20. **New (re-review):** the Start-time refreeze cannot be update-only. A session created while the learner is unclaimed, or claimed with no record yet, gets **no** snapshot row (`consent-scope.ts` 306–312, 326–332); `startWhiteboardSession` already requires a record at Start (`assertConsentRecordExists`, `actions.ts` 241), so the record can exist at Start while the row does not. § 2.6.

---

## 2. Design

### 2.1 One owner resolver (exists — extend, do not add)

`consentOwnerFromStudent` (`consent-scope.ts` 543) → `{ organizationId } | { adminUserId }` from the **Student row**. `resolveEffectiveConsentForStudent` (612) → `resolveEffectiveRecordedConsent` (642) returns `ceiling AND NOT restriction` via `effectiveConsentToggles` (272).

Rule that satisfies "org consent never covers private work": the owner is a property of the **Student row** (org-owned vs tutor-owned), never of the session's `adminUserId`. An instructor's org session on an org-owned student reads the org record. The same instructor's private student reads the tutor's own record. One learner profile linked to both has two Student rows and two answers.

Work in this wave:
- Every consent read in product code goes through `resolveEffectiveConsentForStudent` (or the frozen snapshot, § 2.6). Grep-guard test (`consent single resolver`, § 6i) fails if **any** file outside an explicit allowlist calls `consentRecord.find*` / `.count` / `.aggregate`, not only if it selects toggle columns (an id-only existence read re-derives the owner just as badly). The complete list of direct reads in `src/` on 2026-10-29 (`rg "consentRecord\.(find|count|aggregate)"`, tests excluded) and what happens to each:

| Site | What it reads | Decision | Wave |
|---|---|---|---|
| `consent-scope.ts` 512, 593 | The resolver itself | **Allowlisted** (it is the one reader) | n/a |
| `consent-write.ts` 76 | `aggregate` of max `version` on the **write** path | **Allowlisted**: a version counter for a write, not a consent decision | n/a |
| `account/children/[id]/consent/page.tsx` 121, 136 | The raw record the parent edits | **Allowlisted**: the editor of the raw record, not a decision | n/a |
| `students/[id]/page.tsx` 117 | Existence of a record for the Start card (org-blind, uses `scopedAdminUserId`) | **Fixed**: replaced by `sessionEntryState` | org W4 |
| `org-learner.ts` 235 | `allowLiveSession`, ignores `ConsentRestriction` (child-floor bug) | **Fixed** (E17) | C1 |
| `claim/[token]/setup/page.tsx` 68 | `select: { id: true }` only, for "consent already saved". Reads no toggle, but it re-derives the owner inline (`isOrgLearner ? organizationId : adminUserId` using the invite's `adminUserId`), the exact fork E10/E11 are about | **Fixed, not allowlisted.** Route through `resolveEffectiveConsentForStudent(profile.id, invite.student, invite.adminUserId)`; "saved" is `!== null`. Same semantics (the resolver returns null when no record exists), one owner rule. Reason: an allowlist entry here would be a standing second owner derivation; the fix is one line | C1 |
| `child-consent.ts` 189 | Every `ConsentRecord` for the learner, then its own `keepLatest` (109) and `andCeiling` (129) | **Fixed in C1, behavior-preserving.** Move the read and `keepLatest` into `consent-scope.ts` as one `readLatestConsentPerOwner(learnerProfileId)` (returns one latest row per tutor or org); `child-consent.ts` calls it and keeps today's AND, so `readChildConsentFacing` returns exactly what it does now (pinned by the five existing calls in `__tests__/identity/child-home.test.ts`). It also deletes a **second** `keepLatest` copy: `loadWhiteboardReplayIdsForNotes.ts` 117 has the same helper, which C6 deletes with that file's raw reads. **C7 only changes presentation** (a per-owner list instead of the AND). Not allowlisted: the AND across owners is the bug § 2.1 already names | C1 (read), C7 (display) |
| `loadWhiteboardReplayIdsForNotes.ts` 181, 197 | Live tutor and org records, ANDed with the snapshot | **Removed** wholesale (§ 2.9) | C6 |

Also `upcoming-sessions.ts` 85–95 already uses the resolver and folds into entry state (W4).
- **`org-learner.ts` 235–240 is a live child-floor bug (D5).** `db.consentRecord.findFirst({... select: { allowLiveSession: true }})` ignores `ConsentRestriction`, so a child who restricted live sessions still shows an org learner as startable on the scheduler card. **Fixed in C1** by routing it through the resolver, with a red test first: org learner whose `ConsentRestriction` forbids live but whose org `ConsentRecord` allows it must show `SCHEDULER_LIVE_SESSIONS_OFF`. (E17.)
- Delete `resolveRecordedConsent` and `assertEffectiveConsent` (no product callers).
- `child-consent.ts` 132–134 `records.every(...)`: keep the **restriction** logic (child floor), but the child's displayed `effective` must come per owner, not as an AND across owners. Parent editor already shows per-owner (`ParentConsentEditor` 293+). Child screen gets a per-owner list ("with Sarah: …", "with Acme: …") built from the same function.

### 2.2 ONE switch table, ONE capability answer per session

**One table (D5).** Today there are two tables for the same four switches: `CONSENT_SWITCHES` (copy: labels and descriptions, in `consent-toggle-copy.ts`) and the plan's earlier `CAPABILITY_TABLE` (behavior). They merge into **one** exported `CONSENT_SWITCHES`. Each entry carries both halves:

```ts
type ConsentSwitchEntry = {
  key: "allowLiveSession" | "allowAudioRecording" | "allowWhiteboardRecording" | "allowNoteSending";
  capability: "online" | "audio" | "whiteboard" | "notes";
  label: string;
  description: { parent: string; child: string; self: string };
  /** What turning it off does, per mode. Rendered by the notice, the editors, the decline dialog and the privacy page. */
  effectWhenOff: { online?: string; inPerson?: string; always?: string };
  /** Behavior: what the pure function applies when this switch is off. Absent for the online switch (F3): its behavior is `sessionEntryState` (org W4), which reads this entry's copy fields only. */
  offEffect?: {
    online?: Partial<CapabilityFields>;
    inPerson?: Partial<CapabilityFields>;
  };
};
```

`deriveSessionCapabilities` reads `offEffect` from this table; the copy surfaces read `effectWhenOff` from the same entries. Editing behavior and editing copy are the same edit in the same file. If C1 moves the table to a more neutral home (isomorphic, no `server-only`), it is a `git mv`; no second file is left behind.

**One capability function.** Grow `deriveAudioCapturePolicy` (`audio-capture-policy.ts` 15) into `deriveSessionCapabilities` and `git mv` the file to `src/lib/recording/session-capabilities.ts`. **There is no alias.** C1 replaces the one product call site (`WorkspaceClient` 1613) and the four server callers of `resolveModeAwareAudioRecordingConsent` (`actions.ts` 756, 1128, 1899, 2090) in the same wave, and deletes `deriveAudioCapturePolicy`, `modeAwareAudioDecision` and `resolveModeAwareAudioRecordingConsent`. The existing helper exports in the file that are not the policy (`deriveWbCaptureActive`, `shouldAttachRemoteStreamToRecordingMixdown`, `resolveRemoteRecordingGainLinear`) keep their behavior and take the capability value instead of the policy string.

```ts
type SessionCapabilityInput = {
  hasConsentSnapshot: boolean;          // false = legacy session (pre-B2); behaves as today
  // No `live` toggle here (F3): entry is org W4's `sessionEntryState`, the one reader of `allowLiveSession`.
  toggles: { audio: boolean; whiteboard: boolean; notes: boolean };
  sessionMode: "LIVE" | "IN_PERSON" | "UNKNOWN";   // UNKNOWN = waiting room before the mode is chosen
  notesForbidden: boolean;              // org "End it now, and no notes" (session flag)
};

// No `entry` field (F3): who may Start or join, and in which mode, is `sessionEntryState` (org W4) and nothing else.
type SessionCapabilities = {
  audio:      { mode: "full" | "tutor_only" | "none" };
  mic:        { acquire: "yes" | "defer" | "no" };      // see § 4.1
  transcript: { tutorVoice: boolean; learnerVoice: boolean };
  whiteboard: { persist: boolean };                     // also governs the IndexedDB checkpoint
  notes:      { draft: boolean };
  replay:     { audio: boolean; board: boolean };
  off:        Array<"audio" | "whiteboard" | "notes">; // drives the "recording_off" notice; "online off" is an entry block (`SessionEntryBlocked` kind "blocked")
};
```

Truth table (the single source; the Playwright matrix in § 6 is its independent mirror, with the brief's table typed into the spec as data):

| toggles (audio / wb / notes) | mode | audio.mode | mic.acquire | transcript tutor / learner | wb.persist | notes.draft | replay audio / board |
|---|---|---|---|---|---|---|---|
| on / on / on | LIVE or IN_PERSON | full | yes | yes / yes | yes | yes | yes / yes |
| off / on / on | LIVE | tutor_only | yes (live conversation needs it) | yes / **no** | yes | yes | yes (tutor track) / yes |
| off / on / on | IN_PERSON | none | **no** | no / no | yes | **no** (nothing to draft from) | no / yes |
| off / on / on | UNKNOWN | none until known | **defer** | no / no | yes | no | no / yes |
| on / off / on | any | full | yes | yes / yes | **no** | yes | yes / **no** |
| on / on / off | any | full | yes | **no / no** | yes | **no** | yes / yes |
| off / off / off | LIVE | tutor_only | yes | no / no | no | no | yes (tutor track) / no |

**The online switch is not a column here (F3).** Whether online or in person may be started or joined is `sessionEntryState` (org W4) and nothing in `SessionCapabilities`. The two compose without a second reader of `allowLiveSession`: with online off, `sessionEntryState` blocks online and allows in person, and an in-person session then gets the capabilities in the rows above for its other three toggles. The brief's table is typed into the Playwright matrix as data with the online column included (§ 6); only the pure function under test drops it.

`notesForbidden = true` forces `notes.draft = false` and both transcript flags false, whatever the consent toggles say. Today `notesForbidden` only blocks the SessionNote status change; this makes it stop drafting too, which is its stated purpose ("End it now, and no notes"). It does not change consent copy. Test N7.

`hasConsentSnapshot = false` (legacy): today's behavior is preserved, so existing sessions are not touched.

**Not covered by the table: `notes.draft` when audio is none and notes are on.** With no audio there is no transcript, so `notes.draft = false`. Today `notes-worker` makes a "placeholder note" when `totalChunks === 0` (~474). That path must not run when the capability says no draft. Test N5.

**Server projection.** In `consent-scope.ts`, add `resolveSessionCapabilities(whiteboardSessionId, client?)` that loads snapshot (or, while PENDING, the live record — § 2.6), persisted `sessionMode`, and `notesForbidden`, then calls the pure function. One DB read shared by every server gate. Accepts a transaction client (the resolver already takes a `ConsentReadClient`) so End, the stale stamp, and Start can call it inside their transactions.

**Client projection.** `page.tsx` for the tutor workspace and `join/[sessionId]/page.tsx` for the learner compute capabilities server-side and pass **one prop** (`sessionCapabilities`) to the shell. The three ad hoc props (`allowLiveSession`, `initialAllowAudioRecording`, `initialHasConsentSnapshot`) are replaced by it. The waiting room recomputes with the **selected** mode via the same pure function (mode is the only client-side input). **At Start the client replaces its capabilities with the ones `startWhiteboardSession` returns (§ 2.6) before arming any recorder.** No component derives anything from raw toggles.

### 2.3 Where each rule is enforced

Client = never capture. Server = never accept, store, transcribe or show. Both read the same `SessionCapabilities`.

| Rule | Client enforcement | Server enforcement | Choke point |
|---|---|---|---|
| Online off blocks Start | Waiting room hides Online, shows reason | `startWhiteboardSession` | `sessionEntryState` (org W4), called in place |
| Online off blocks every join | `/join` redirects to blocked page | `/join/[sessionId]/page.tsx` for **all** principals; `schedule-bridge.ts`; `issueJoinToken`; the `/w/<joinToken>` redirect lands on `/join` so it inherits | `sessionEntryState` |
| Audio-off learner lane never captured | `useRemoteMicRecorders` `enabled` only for `audio.mode === "full"` (exists) | `registerWhiteboardSessionAudioSegmentAction`, `enqueueChunkTranscriptionAction`: reject learner-lane streams unless `audio.mode === "full"` | `resolveSessionCapabilities` + `isLearnerLane` |
| In-person audio off: no mic at all | § 4.1 | Segment registration and chunk enqueue reject any audio | same |
| Learner never transcribed without audio consent | n/a | Transcription refuses learner lanes unless `transcript.learnerVoice`, at **every** entry: `enqueueChunkTranscriptionAction`, `kickSessionChunksAction`, the chunk-transcribe queue route, `transcribe-sweep`, and a re-check inside `processChunkTranscribeJob` | same |
| Notes off: no transcript, no draft | n/a | All transcription entry points, notes enqueue, `generateNotesFromWhiteboardSessionAction`, `triggerNotesGenerationAction`, the notes sweep, `notes-worker` | same |
| Whiteboard off: no replay data kept | Skip final events upload, snapshot PNG, **and the IndexedDB checkpoint** | End and the stale stamp write purge intent (§ 3); checkpoint route refuses after End | § 3 |
| Replay = what was recorded | Replay link uses `replay.*` | **One** replay-access function, seven callers (§ 2.9) | `replay-access.ts` |

**Learner-lane identification — one module (D5, F4).** Lane identity lives only in `streamId` (`tutor:mic`, `speaker:<id>[:transcript]`, `student:peer-<peerId>:mic`). The format is built and parsed in **six** places today, not three (checked 2026-10-29; the first draft and the D5 text undercounted):

| Site | Role |
|---|---|
| `lifecycle-machine.ts` 780 and 787–789 | `TUTOR_MIC_STREAM_ID` constant and the `studentMicStreamId(peerId)` builder (the FSM file) |
| `remote-stream-recorder.ts` 60–62 | A **second, identical** `studentMicStreamId` (`useRemoteMicRecorders.ts` and `WhiteboardWorkspaceClient.tsx` 116 import this one) |
| `perspeaker-identity.ts` 64–66 | `speakerTranscriptStreamId(speakerId)` builder |
| `upload-outbox-instance.ts` 136–138 | `peerIdFromStudentMicStreamId` parser (regex `^student:peer-(.+):mic$`) |
| `notes-worker.ts` 249–253 and 519–524 | Two copies of the parse of `tutor:mic` / `speaker:<id>[:transcript]` into a speaker label |
| `"tutor:mic"` string literals used as the default | `transcript-store.ts` 89, `notes-worker.ts` 249 and 519, plus the `?? TUTOR_MIC_STREAM_ID` defaults at `actions.ts` 1933 and 2063, `transcription-worker.ts` 101, `chunk-transcribe-enqueue.ts` 90 |

Replace all of them with **one** module, `session-capabilities.ts` (C1 creates it; pure and isomorphic, no `server-only`, so client recorder code and server gates import the same file): the constant, **one** builder per lane kind, and **one** parser `parseLane(streamId)` returning `tutor`, `learner` (with `speakerId` or `peerId`), or `unknown`. `isLearnerLane(streamId)` is `kind !== "tutor"` (**unknown fails closed as learner**). All six sites import from it; every local copy is deleted, and `lifecycle-machine.ts` / `remote-stream-recorder.ts` stop exporting `TUTOR_MIC_STREAM_ID` and `studentMicStreamId` (about eight import lines change, including one in `WhiteboardWorkspaceClient.tsx`, import-only). **No alias survives the wave** (D5).

**Tier (F4): `lifecycle-machine.ts` is edited only in an Opus-tier wave.** The change there is deleting a constant and a builder, not touching the FSM, but it is on the recorder lifecycle file the tripwire list names, so the whole absorb ships as one commit in new wave **C2a** (Opus exec, Sonnet review), **after C1 and before C2**, so that C2's server gates import a finished module and no two copies ever coexist. Tests: `isLearnerLane fails closed on unknown stream ids`; a unit that `parseLane(builder(x))` round-trips for every builder; and a guard test that fails if a `student:peer-` / `speaker:` / `tutor:mic` literal appears in `src/` outside `session-capabilities.ts` and tests.

**Lane identity must survive retries (B3, D8). Verified in code, and it fails open today.**
- `kickSessionChunksAction` (`notes-actions.ts` 77–82) and `processSweepChunk` (`transcribe-sweep.ts` 175–181) call the worker / `enqueueChunkTranscribe` **without** `streamId` or `speakerId`.
- `enqueueChunkTranscribe` (`chunk-transcribe-enqueue.ts` 90) and `processChunkTranscribeJob` (`transcription-worker.ts` 101–102) default a missing `streamId` to `tutor:mic` and `speakerId` to `null`.
- `upsertTranscriptChunk`'s **update** branch (`transcript-store.ts` 117–131) writes `streamId` and `speakerId` unconditionally. So a retried learner chunk is relabeled `tutor:mic`, and `isLearnerLane(stored.streamId)` can no longer be trusted. A learner voice chunk retried by the sweep would pass the tutor-lane gate.
- **Fix, three parts, all in C2:** (1) the update branch never touches `streamId` or `speakerId` (create sets them; update does not); (2) kick and sweep read the stored lane from the row and pass it explicitly; (3) `processChunkTranscribeJob` prefers the stored row's lane over the input when a row exists, and logs `lane_mismatch` if they differ. Red test A8: a swept learner chunk keeps its lane and is refused when audio is off.
- **Documented limit (D8):** a tampered tutor client can label learner audio `tutor:mic` when it registers a segment or enqueues a chunk (`actions.ts` ~1933 and ~2063 accept the payload's `streamId`). The server cannot distinguish them. The tutor is authenticated and already hears the learner in the room, so this does not widen access to a third party, but it does mean "learner never transcribed" is a guarantee about our client and server paths, not about a hostile tutor client. Recorded in `docs/BACKLOG.md` as `LANE-LABEL-TRUST` in C2; the privacy copy does not claim more.

**Refused rows reach a terminal state (D8).** A refusal that leaves the row `pending` re-enters the sweep forever: `findStaleTranscriptChunksForSweep` orders by `updatedAt asc` with `take`, and a refused row's `updatedAt` never moves, so it sits at the head and **starves newer rows**. The notes sweep has the same shape (`transcribe-sweep.ts` 111–127: oldest 10 pending `TutorNote` rows). So refusal writes a terminal status. **Both new members are named explicitly (F7):** `"refused"` is added to `TRANSCRIPT_CHUNK_STATUSES` (`transcript-types.ts` 5–10, today `pending`, `transcribing`, `done`, `failed`), and `"skipped"` is added to `TUTOR_NOTE_STATUSES` (`transcript-types.ts` 20–26, today `pending`, `generating`, `done`, `failed`, `partial`; **the first draft named `skipped` without adding it to this list**). Both columns are plain strings, so no migration (§ 1c item 16). The sweep predicate already excludes anything not `pending` / `transcribing` / retryable `failed` (chunks, `transcript-store.ts` 170–177) and not `pending` / `generating` (notes, `transcribe-sweep.ts` 116). **Consumers of the notes status:** `getTutorNoteStatusAction` passes `status` through as a plain `string`, and `TutorNotesSection.tsx` 193–204 branches only on pending, generating, done, partial and failed, so a `skipped` row would render as nothing. C2 adds the `skipped` branch (one line from the `CONSENT_SWITCHES.effectWhenOff` notes copy: "Notes are off for this session"), and the poll at 258 already stops on any status that is not pending or generating. Test N6 asserts both new statuses are terminal; a unit asserts every member of both lists has a handler in the notes card and the sweep predicates. `notes-worker` must treat `refused` as settled (it must not wait on it): red test N6 settles whether it does today. Outbox rows that hit a refusal are marked terminal-skipped, not "failed forever"; the refusal is logged `refused`, not `error`.

### 2.4 Entry state: one answer for Start / Open room / resume / schedule (D3)

Reuse org-ux-pass-plan W4: `sessionEntryState`, `EntryBlockReason`, `ENTRY_BLOCK_COPY`, `SessionEntryBlocked`. **None of these exist in code yet.** The earlier conflict is resolved:

- Org plan § 3 said `sessionEntryState` "adds no new gate — it explains gates the server already enforces", and W4 said "do not reroute the bridge's enforcement through the UI function". C5 collapses six enforcement checks into it. **Decision D3:** `sessionEntryState` **is** the rule. It is a pure function. Server sites call it in place: each loads its own inputs, calls the function, refuses on `!state[mode].allowed`. Nothing is routed through a UI component, so the "do not reroute" concern (moving control flow through a UI component in a fragile surface) is not triggered. The UI reads the same function, so UI and server cannot disagree.
- **The mode dimension is built in org W4**, not here: `sessionEntryState(inputs)` returns `{ online: EntryDecision; inPerson: EntryDecision }`, with `EntryDecision = { allowed: true } or { allowed: false; reason: EntryBlockReason }`. Online-off blocks `online` and leaves `inPerson` allowed. The org plan's W4 text now says so.
- **W4 wires** the UI components, `startWhiteboardSession` and the schedule bridge. **C5 wires the rest:** `/join` for every principal, `issueJoinToken`, the waiting room, resume, the org-learner list, the student-page main button. Until C5, `/join` for self-learners keeps its gap; E6 is red until then.
- Sequencing: **org W1, then org W4, then the consent waves that touch Start or entry.** C0 touches no `actions.ts` and may run after W1. **C1 and C2 run strictly serial with org W4 (F2):** all three edit `src/app/admin/students/[id]/whiteboard/actions.ts` (W4: `startWhiteboardSession`; C1: the four `resolveModeAwareAudioRecordingConsent` callers at 756, 1128, 1899, 2090; C2: segment registration 1899–1933 and chunk enqueue 2063–2098, plus `kickSessionChunksAction` in `notes-actions.ts`). Never two of them in flight at once, in either order; whichever merges second rebases on the integrated tip. C2a (one import line in the same file, line 36) joins the same serial chain. Default order: W4, C1, C2a, C2, then C3a. C3a edits `startWhiteboardSession`, which W4 also edits, so C3a and later wait for W4 to be merged on the integration tip. (Two plans editing one function in parallel is the Wave A clobber.)
- `appointmentLiveEntryAllowed` (`upcoming-sessions.ts` 78) is replaced by W4 and deleted there; any leftover caller is removed in C5.
- Child join, AH-as-child join, and self-learner join call it with `mode = online` (they are always remote).
- **The waiting-room auto-flip** (`WaitingRoomOverlay.tsx` ~167–174) is removed in C5. When online is blocked and in person allowed, the overlay shows the reason line and a single primary button "Start in person". When both are blocked (no record), the reason line only.
- The existing test `org booking calls the bridge › live start is refused when consent is off, and in-person start activates` (`tests/integration/wb-org-booking.spec.ts` 479) already encodes the **target**. It is currently red/timing out, which matches today's code. Another agent is triaging it. **This plan does not edit it.** After W4/C5 it should go green unchanged; if it does not, the implementation is wrong, not the test.
- Parity test (E16), table-driven over (toggle state × mode × principal): the pure rule's answer equals the actual accept/refuse of each server site (Start, bridge, `/join`, `issueJoinToken`), with the expected table typed into the spec from the brief.

### 2.5 Both sides can see what is off

One component, one input. **Not a new component:** the org W4 `SessionEntryBlocked` already renders a one-line or card reason from a copy table. C7 extends it with a `kind: "blocked" or "recording_off"` input (and the tutor/learner/self audience) rather than adding `RecordingStatusNotice`. If the V1 library review in C7 finds the two cannot share one primitive, that is surfaced to Andrew; the agent does not fork.

- Input: `SessionCapabilities.off` + `role` (`tutor`, `learner`) + `isSelfLearner`.
- Copy comes from `CONSENT_SWITCHES.effectWhenOff` (§ 2.2). No strings inline in the component.
- Replaces the ad hoc `audioConsentBannerMessage` string at `WhiteboardWorkspaceClient.tsx` ~1621–1650. Chrome work is **additive** (the banner slot exists). Do not restructure `WhiteboardWorkspaceClient.tsx` ([`AGENTS.md` § Whiteboard chrome]).
- Rendered: tutor waiting room, tutor in-session banner slot, tutor student-detail Start card, learner waiting room, learner in-session banner slot, family dashboard "Join" row.
- Mid-session consent changes do not alter the running session (D6/Q2, APPROVED Andrew 2026-10-29). The notice and the consent editors say "applies to the next session".

### 2.6 Snapshot meaning and refreeze at Start (B5, D6)

Problem (CORRECTION 3): snapshot frozen at create, live record re-read at Start.

**Decision (APPROVED, Andrew 2026-10-29 16:20, Q2): the snapshot means "consent in force when the tutor presses Start".** Consent changes are forward only. A change made mid-session or later applies from the next session.
- While a session is `PENDING` (nothing recorded yet), `resolveSessionCapabilities` reads the **live** record (via `resolveEffectiveConsentForStudent`), not the snapshot. A parent who flips Online on after the tutor opened the room is respected immediately, and a child who flips it off is respected immediately.
- **The refreeze is inside the same conditional update as PENDING→ACTIVE, on both code paths.** `startWhiteboardSession` has two paths today (`actions.ts` 300–337): the org-owned path inside `withOrgRowLock`, and the plain path. Both do the live-consent refusal check **outside** the conditional `updateMany` (a read, then a check, then the write), so a second Start or a second tab can interleave. New shape, one shared helper `startSessionTx(tx, …)` called from both paths:
  1. Inside one transaction: read effective consent via the resolver using `tx`.
  2. If `requestedMode !== "IN_PERSON"` and live is off and the session is still PENDING: refuse (`ConsentError`), as today.
  3. Run the conditional `updateMany` (`sessionPhase: "PENDING"`, `endedAt: null`).
  4. **Only if `count > 0`**, **upsert** the `SessionConsentSnapshot` row (R1): create it if missing, else update `consentRecordId`, `consentRecordVersion`, the four toggles and `frozenAt = now`. `SessionConsentSnapshot.whiteboardSessionId` is unique, so there is never a second row (`prisma upsert` on that key). **Why an upsert and not an update:** `createSessionConsentSnapshot` writes **no row** when the learner is unclaimed (`consent-scope.ts` 306–312, log `snapshot_skipped reason=unclaimed`) or has no effective record (326–332, `reason=no_record`). A session created in either state, then claimed and given a record by the family, reaches Start with no snapshot row. An update-only refreeze would touch zero rows, the session would read as legacy (`hasConsentSnapshot = false`, § 2.2), and the family's whiteboard-off choice would be silently ignored, board kept. Start already requires a record to exist (`assertConsentRecordExists`, `actions.ts` 241), so the upsert always has a record to freeze. If `count === 0` (already ACTIVE or ended), **do not touch the snapshot**. This is what stops a second Start or second tab from re-freezing an ACTIVE session.
  5. Return the capabilities derived from the row as it now stands (refrozen or, on a no-op, the existing frozen row).
- **One helper, three callers (R1).** The upsert is one function, `freezeConsentSnapshotTx(tx, whiteboardSessionId, now)` in `consent-scope.ts`, built on the existing `resolveEffectiveConsentForStudent(…, tx)` and replacing the insert in `createSessionConsentSnapshot` (which becomes a call to it, so create, Start and End share one writer). Callers: session create (as today), Start (step 4), and the End paths below.
- **A PENDING session ended without Start: the live record at End decides, and the End path writes the snapshot (R1).** A PENDING session has recorded nothing (the checkpoint route refuses a non-ACTIVE session, `checkpoint/route.ts` 63–110), so for the end-of-life decision there is exactly one source, the **live** effective record, read the same way § 2.6 reads it while PENDING. Therefore, inside the End transaction (`endWhiteboardSession`) **and** inside the shared stale stamp (`stampStaleWhiteboardSessionEnd`, so the four existing callers and the reaper too): read `sessionPhase` **inside** the transaction (today `endWhiteboardSession` reads `priorPhase` outside it, `actions.ts` 1085–1090, and `endStaleWhiteboardSession` likewise, 1394–1402); if it is `PENDING`, call `freezeConsentSnapshotTx` first; then `stampBoardPurgeIntent` (§ 3.2) reads that snapshot. The intent and `runBoardPurge` therefore read the same row, written in the same transaction as `endedAt`. An ACTIVE session's End never touches the snapshot (its consent was fixed at Start, D6). If there is no effective record at all, no row is written and the session is legacy-shaped: no intent, nothing purged, which is the same answer the PENDING session gave before this wave. The ordering against a racing Start is the row update itself: Start's conditional `updateMany` requires `endedAt: null` and `sessionPhase: "PENDING"`, and End's update sets `endedAt`; whichever commits first wins and the loser is a no-op for the snapshot (the End transaction takes the same session-row lock as W11, § 3.4, so its in-transaction phase read cannot go stale). Test S8 races them and asserts the snapshot equals the live record at the moment the winning transaction committed, never a mix.
- Log `[cns] wbsid=<id> action=refrozen_at_start created=<bool> changed=<keys|none> before=<toggles|none> after=<toggles>` (both values, because `frozenAt` is overwritten and the create-time value is otherwise lost; `before=none created=true` is the R1 path). On a no-op: `action=refreeze_skipped reason=already_active`. The End-time write logs `action=frozen_at_end phase=pending created=<bool> after=<toggles>`.
- **The client adopts the returned capabilities before arming any recorder (B5).** The tutor client holds capabilities from page load. If a parent flips audio off between page load and Start, a client acting on stale capabilities would record the learner lane and upload blobs that only the server then refuses, leaving orphan learner blobs. So `startWhiteboardSession` returns `{ ok, phase, sessionMode, capabilities }`, and the client sets its capabilities from the response, then arms the recorder, mic, lane recorders and IndexedDB checkpoint. Nothing arms from page-load capabilities after Start has been requested. Tests S3 (flip between page load and Start: no learner blob exists in the store, no `speaker:*` row), S1/S2 (double Start, ACTIVE flip is a no-op), and **S6 (R1 red test)**: a session created while the learner is unclaimed, the family claims and sets whiteboard recording off, the tutor Starts, the session ends, and the board is purged. S6 goes red on an update-only refreeze (no snapshot row exists, so no intent is written and the board survives) and on today's code; it goes green only with the upsert.
- Safe because a PENDING session has recorded nothing. `startWhiteboardSession` is fragile (`actions.ts` 214–361) and the change is a **Sonnet** design review + Sonnet verification, executor Sonnet or Opus (never Composer).
- Copy: "Changes apply to the next session, not one already started." (§ 7a.)

**No consent record at Start (LOCKED, Andrew 2026-10-29 16:23).** If no consent record exists when the tutor presses Start, the session cannot start — online or in person, no exception. The disabled Start shows the reason (decision 6: a disabled Start always gives a reason). Snapshot-less sessions must be impossible for any session that has started, before this goes public. Legacy snapshot-less rows are left as they are.

**Verified in code 2026-10-29 (no Start path skips the refusal).** `startWhiteboardSession` (`actions.ts` 214) calls `assertConsentRecordExists` at `actions.ts` 241–252. That call returns or throws before `requestedMode` is chosen (`actions.ts` 275, `sessionMode ?? "LIVE"`, so online and in person are the same gate) and before the ownership split (`orgOwned` at 276–277; org path inside `withOrgRowLock` at 300; plain path at 322). Both paths share one `pendingUpdate` that writes `sessionPhase: "ACTIVE"` (`actions.ts` 286), and that write is the only production assignment of ACTIVE. The only production caller is `activateSessionLive` (`WhiteboardWorkspaceClient.tsx` 4409–4420); the waiting room has one Start button (`WaitingRoomOverlay.tsx` 324–332) and passes the chosen mode into that function. C3a does not add a second existence check. `issueJoinToken` (`actions.ts` 481–484) and `createWhiteboardSessionCore` (`create-session-core.ts` 149–152) call the same helper; they are not the Start-to-ACTIVE path.

**What the waiting room does not do yet.** `overlayCanStart` (`WhiteboardWorkspaceClient.tsx` 6604–6606) disables online Start only until the student is connected, and leaves in-person Start enabled. A missing record is not itself the reason on that control. A refused click then sets `sessionStartError`, shown under the button at `wb-waiting-start-error` (`WaitingRoomOverlay.tsx` 315–322) via `formatConsentActionError`. Today's server message is `CONSENT_RECORD_REQUIRED_MESSAGE` (`consent-scope.ts` 353–354). S9 and S10 require that reason on the disabled Start control (decision 6), not only after a click. That presentation is part of C3a.

**Invariant.** Every session that reaches ACTIVE has a `SessionConsentSnapshot` row. Create still skips the row for an unclaimed learner or one with no record (`createSessionConsentSnapshot`, `consent-scope.ts` 309–314 and 329–333); the Start upsert (R1) is what writes it when Start is allowed to proceed. A Start with no record never reaches ACTIVE (S9, S10). Rows that are already snapshot-less stay snapshot-less.

### 2.7 Delete / consolidate duplicates (zero-duplication)

| Duplicate today | Action | Wave |
|---|---|---|
| `deriveAudioCapturePolicy` (client) + `modeAwareAudioDecision` / `resolveModeAwareAudioRecordingConsent` (server, `consent-scope.ts` ~125–250) | Both replaced by `deriveSessionCapabilities`; **no alias** | C1 |
| `CAPABILITY_TABLE` (new) vs `CONSENT_SWITCHES` | One table (§ 2.2) | C1 |
| Lane format built or parsed in six places (`lifecycle-machine.ts` 780/787–789, `remote-stream-recorder.ts` 60–62 (identical builder), `perspeaker-identity.ts` 64–66, `upload-outbox-instance.ts` 136–138, `notes-worker.ts` 249–253 and 519–524, `"tutor:mic"` literal defaults) | One lane module (`parseLane` / `isLearnerLane` + builders + the constant) in `session-capabilities.ts`; every local copy deleted (§ 2.3) | C2a |
| Consent snapshot writer (create) vs Start refreeze vs End-of-PENDING write | One `freezeConsentSnapshotTx` (§ 2.6) | C3a (create switches to it in the same commit) |
| `keepLatest` in `child-consent.ts` 109 and `loadWhiteboardReplayIdsForNotes.ts` 117; two raw `consentRecord` reads (§ 2.1) | One `readLatestConsentPerOwner` in `consent-scope.ts` | C1 (child-consent), C6 (loader deleted) |
| `assertEffectiveConsent`, `resolveRecordedConsent` (no product callers) | Delete | C1 |
| `appointmentLiveEntryAllowed`, `students/[id]/page.tsx` 115–122, `org-learner.ts` 235–240, bridge 104–113, `/join` 199–217, `startWhiteboardSession` 269–298 (six live checks) | All call `sessionEntryState` | W4 then C5 |
| `LIVE_RECORD_DENIAL_COPY`-style message tables in `consent-scope.ts` (~421) and `consent-action-error.ts` (60) vs `ENTRY_BLOCK_COPY` | One table: `ENTRY_BLOCK_COPY` for entry; denial text derives from the same keys | C5 |
| `ChildConsentSettings.CHILD_DESCRIPTION` (fork of two switch descriptions) | Delete; learner-worded descriptions are a field in `CONSENT_SWITCHES` | C7 |
| `ParentConsentEditor.CHILD_OFF_SWITCHES` (own labels) | Read labels from `CONSENT_SWITCHES` | C7 |
| `ParentConsentEditor.RESTRICTION_TOGGLES` ("Always block whiteboard replay") | Describe from `CONSENT_SWITCHES`; wording changes (§ 7) | C7 |
| `SelfLearnerConsentSettings` renders `CONSENT_SWITCHES` unchanged → parent wording ("your child") shown to self-learners | `description` has the `parent / child / self` audience variants | C7 |
| Replay decision logic in seven places | One replay-access function (§ 2.9) | C6 |
| `RecordingStatusNotice` (proposed) vs `SessionEntryBlocked` (org W4) | One component, `kind` input (§ 2.5) | C7 |
| Prefix listing of blobs: `listCheckpointBlobsForSession` (`blob-inventory.ts` 103–122, real `list`), `assemble-persisted-state.ts` ~110 (real `list`), and the new session-prefix listing the purge needs | One `listBlobsByPrefix` (C0, harness-aware); the purge calls it for `whiteboard-sessions/<studentId>/<sessionId>/` and reuses `listCheckpointBlobsForSession` unchanged. **Erasure's `enumerateLearnerFamilyBlobs` is not refactored** (it builds its list from row URLs, which the purge must not do, R2), so its only change in this wave is C0's list and delete routing | C0, C4b |
| Stale-end stamp vs End transaction (purge intent) | One shared `stampBoardPurgeIntent` (§ 3.2) | C4b |
| The reaper's End vs the four stamp callers | The reaper is a fifth caller of the same stamp helper, not a second implementation (G7 guard) | C4c |

### 2.8 Copy and enforcement side by side (anti-drift)

1. The merged `CONSENT_SWITCHES` (§ 2.2) carries `label`, `description` per audience, and `effectWhenOff`. The notice, the editors, the decline dialog and the privacy page all render those strings.
2. The privacy page "what turning a switch off does" list is **rendered from that data** (not typed prose), so editing behavior forces editing copy in the same file.
3. Test `consent copy covers every switch effect` (unit, ~ms): for each `CONSENT_SWITCHES` entry and mode, assert a copy string exists for every audience; fails if an effect has no string. Paired with the Playwright matrix that proves the behavior. Neither test reads the other's constants.
4. `tests/visual/legal-honesty.spec.ts` (exists) is extended to assert the privacy page renders every `effectWhenOff` string.

### 2.9 Replay access: one function, frozen snapshot only (B7, D4)

Principle 4 of the brief: replay shows **what was recorded**. Today `loadParentVisibleWhiteboardReplayIds` (`loadWhiteboardReplayIdsForNotes.ts` 147–274) ANDs the **live** `ConsentRecord` (plus `ConsentRestriction`) with the snapshot. A consent change **after End** therefore hides a board that was recorded, contradicting principle 4. Replay is decided in at least seven places:

1. `src/lib/share/loadWhiteboardReplayIdsForNotes.ts` (`loadParentVisibleWhiteboardReplayIds`, `loadWhiteboardReplayIdsByNoteIds`)
2. `src/lib/share/parent-share-replay-access.ts` (`parentShareReplayNoteIsHidden`, `parentShareAudioNoteIsHidden`)
3. `src/lib/share/learner-replay-access.ts` (`resolveLearnerWhiteboardReplay`)
4. `src/app/api/audio/[recordingId]/route.ts`
5. `src/lib/share/proxy-share-resource.ts` (`assertWhiteboardReplayRequestAccess`)
6. `src/app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx`
7. `src/app/join/notes/[whiteboardSessionId]/whiteboard/page.tsx`

(Plus callers of those loaders: `learner-home-notes.ts`, `s/[token]/page.tsx`, `s/[token]/all/page.tsx`.) **D4:** all seven go through **one** canonical function, `replay-access.ts`: `resolveReplayAccess(sessionIds): Map<sessionId, { audio: boolean; board: boolean; reason }>` (batch signature; a single session is a one-element batch). Rules:

- Session not ended: denied (as today; a live session's share URL 404s).
- Session ended **with** a snapshot: `audio` and `board` are `replay.audio` / `replay.board` from `deriveSessionCapabilities` applied to the **frozen snapshot only**. The live `ConsentRecord` and `ConsentRestriction` are never read after End (the restriction was already folded into the snapshot at freeze).
- Session ended **without** a snapshot (legacy, pre-B2): today's behavior, kept inside this one function and labeled legacy, so pre-wave sessions do not change. Going forward only.
- Principal and note-visibility rules (non-DRAFT note, ownership, unrelated family) stay where they are, but the `replay.*` flags come from here and nowhere else.

A grep-guard test fails if any replay decision site reads consent or snapshot columns outside `replay-access.ts`. Tier: **Sonnet or Opus, never Grok** (six-plus access-boundary sites).

**Q1 (APPROVED, Andrew 2026-10-29 16:20, D6):** with notes off, the tutor **still gets the review step**, and the review screen ends with a **"Share session"** save that releases the replay to the family, exactly as notes do today (tutor Save creates/links the non-DRAFT `SessionNote`; `notes-actions.ts` 345). Nothing new on the family side. If the tutor never finalizes, the family has nothing to access. C6 builds that label and save path. Tests R7 and R8 assert it.

---

## 3. Board deletion at session end (whiteboard consent off)

### 3.1 What exists for a session (inventory)

| Item | Where | Notes |
|---|---|---|
| Stroke/event rows | `WhiteboardEventBatch` (schema 549) | DB only. Used for live reload/rejoin hydrate. Written by the checkpoint route batch upsert (`checkpoint/route.ts` ~187–210). |
| Final events log (client) | `whiteboard-sessions/<studentId>/<sessionId>/<ts>-events.json` (`upload.ts` 118) | Uploaded by the client at End. Its URL reaches the server only in the End call, and **with whiteboard off that URL is never stored or acted on (R2)**: the blob is under the session prefix, so the prefix purge removes it without anyone naming it. |
| Final events log (server-assembled) | `whiteboard-sessions/<adminUserId>/<studentId>/<ts>-events.json` (`actions.ts` 939) | Written by `finalizeWhiteboardSessionFromBackend`. **Not session-scoped, not prefix-deletable.** Never created when `persist` is false (§ 3.5). |
| `WhiteboardSession.eventsBlobUrl` (NOT NULL) | Created as an empty placeholder at session creation (`create-session-core.ts` 169, **outside** the session prefix, § 1c item 17), replaced at End | Keep the placeholder; it contains no board content. Never deleted by the purge. |
| Checkpoint blobs | `whiteboard-checkpoints/<sessionId>/…` (`checkpoint/route.ts` 237) | Listable by prefix (`listCheckpointBlobsForSession`, `blob-inventory.ts` ~103). |
| Embedded assets | PDF pages, images, math SVG | **Prefix-listable**: `whiteboard-sessions/<studentId>/<sessionId>/assets/` (`upload.ts` 168). Student and learner token paths enforce that prefix; the tutor path does not yet (§ 3.4). |
| Snapshot PNG | `whiteboard-sessions/<studentId>/<sessionId>/<ts>-snapshot.png` (`upload.ts` 135) → `snapshotBlobUrl` | Generated client-side at End; also fed into note generation. |
| Tutor IndexedDB checkpoint | `checkpoint-store` via `useWhiteboardRecorder.ts` 1088–1135, 30 s cadence | **Device data, not a server blob.** § 3.7. |
| Tutor `sessionStorage` scene draft | `session-scene-draft.ts` | Device data, per tab, dies with the tab. § 3.7. |
| Replay audio / transcripts | Not part of "the board" | Untouched. `sessions/<studentId>/…` is a different prefix. |

### 3.2 What is written inside the transaction (purge intent, D2)

**One shared function** `stampBoardPurgeIntent(tx, whiteboardSessionId)` (no URL argument, R2) is called from **both** the `endWhiteboardSession` transaction and `stampStaleWhiteboardSessionEnd` (`stale-session-stamp.ts`). That covers End plus all four stamp callers (`org-scope.ts` 670 and 1081, `org-force-end-touch.ts` 33, `actions.ts` 1410) with one implementation. Inside the same transaction as `endedAt`:

0. **If the session is still PENDING, write the snapshot first (R1, § 2.6):** read `sessionPhase` inside the transaction and, for `PENDING`, call `freezeConsentSnapshotTx(tx, …)` so the live record at End becomes the frozen row. An ACTIVE session's snapshot is not touched.
1. Read the session's frozen capability via `resolveSessionCapabilities(sessionId, tx)`, which now reads the row step 0 just wrote when the session was PENDING. **If the snapshot is absent (legacy, or no effective record), do nothing: `persist` is true by definition.** If the read fails, the transaction fails and End is retried by the caller (End never records a half state). If `persist === true`, do nothing.
2. If `persist === false`:
   - `whiteboardEventBatch.deleteMany({ whiteboardSessionId })` (first pass of the row purge, atomic with closing).
   - **Do not** store a client-supplied `eventsBlobUrl` or `snapshotBlobUrl` on the row. The row keeps the empty placeholder events URL and a null snapshot URL. Readers already handle "empty log" and "no snapshot".
   - Write the **purge intent**: `boardPurgeRequestedAt = now`. **That is the whole intent (R2).** It stores no URL. Precedent for writing a durable intent inside this transaction: the `erasureShortCircuit` branch (`actions.ts` 1215–1223).
3. If the End request dies after commit, the intent is already durable. Nothing depends on the request surviving.

**Why no URLs are stored, and why the purge never deletes anything it was handed (R2).** The first draft kept `boardPurgeUrls` (the client's events and snapshot URLs, plus the old `eventsBlobUrl`) "as a belt to the prefix suspender". Dropped, for one reason that is now verified: **a URL that arrives in an End call or sits in a row is not trustworthy as a delete target.** `endWhiteboardSession` and the forced-end path accept any absolute `http(s)` URL as the final events URL (`actions.ts` 1107, 744; § 1c item 19), so a tutor-supplied value could name an audio recording, another student's blob or anything else in the store, and a purge that deleted "whatever the request named" would delete it. The same holds for the old `eventsBlobUrl` on the row, which can be a non-session path (the placeholder and the assembled log are both outside the session prefix, § 1c items 10 and 17). So **the purge deletes by session prefix only**: `whiteboard-sessions/<studentId>/<sessionId>/` (events, snapshot, assets) and `whiteboard-checkpoints/<sessionId>/`. Neither prefix can contain audio (`sessions/<studentId>/…`, § 1c item 10) and neither is shared with another session. For that to be complete, **every board upload must land under the session prefix, which is exactly what W19 (the tutor-path prefix guard and the `endedAt` guard at token mint) establishes. W19 is a prerequisite of C4 and ships first as C4a.** Red test **W23**: End and finalize (and the forced-end late upload) called with a foreign URL and an audio URL as `eventsBlobUrl` must leave both blobs in the store after both purge passes, while a blob under the session prefix is gone (the positive control, so the test cannot pass because nothing ran).

The sweep and `after()` run **from the intent**, not from "snapshot off AND `endedAt` after a deploy constant". The intent column replaces the deploy-time guard: sessions that predate the wave never get an intent, so they are never purged (test W17).

### 3.3 How the purge executes (after commit; two-phase; own sweep)

Blob deletes cannot be inside a DB transaction. They run from two triggers, both calling the same function `runBoardPurge(sessionId)`:
- **`after()`** from End and from the stale stamp's callers (`after()` is already used by `chunk-transcribe-enqueue.ts`), off the End critical path.
- **A separate purge sweep on the same cron** (`/api/cron/transcribe-sweep` today runs every 15 min, `vercel.json`). It is a **separate function** with its **own** batch limit and time budget, called from the same route handler **before** `runTranscribeSweep`. It is not a clause inside the transcription sweep and does not share `TRANSCRIBE_SWEEP_TIME_BUDGET_MS`, so a slow or timed-out transcription sweep cannot starve it. The route today is `GET` on `api/cron/transcribe-sweep/route.ts` (`maxDuration` 300), which calls only `runTranscribeSweep`; it will call, in order, `runStaleSessionReaper` (§ 3.9, if approved), `runBoardPurgeSweep`, then `runTranscribeSweep`, each with its own batch limit and budget.

  **The sweep query selects only rows that can make progress now, so rows that cannot never occupy the batch (F6).** Today's transcription sweep is the cautionary shape: `findStaleTranscriptChunksForSweep` orders `updatedAt asc` + `take`, so rows that cannot progress sit at the head and starve newer ones (§ 2.3). The purge sweep predicate is:

  ```
  boardPurgeRequestedAt IS NOT NULL
  AND boardPurgedAt IS NULL
  AND consentSnapshot.allowWhiteboardRecording = false          -- a readable "persist is false" capability exists
  AND ( boardPurgeFirstPassAt IS NULL
        OR boardPurgeFirstPassAt <= now() - BOARD_PURGE_SECOND_PASS_DELAY_MS )   -- pass 2 delay has elapsed
  ORDER BY boardPurgeAttemptedAt ASC NULLS FIRST, boardPurgeRequestedAt ASC
  LIMIT <BOARD_PURGE_SWEEP_BATCH_LIMIT>
  ```

  - **Delay not elapsed** (pass 1 done, pass 2 not yet due): excluded by the third `AND` arm, so it costs nothing until it is due.
  - **Unreadable capability** (no snapshot row, or one that does not say whiteboard off): excluded by the join predicate, so a row whose capability cannot be read is never selected, never deleted from, and never in the batch. A *read error* is different from a missing row: it throws, the run logs `board_purge_sweep_error` and stops, and the next cron run retries (nothing is stamped). `runBoardPurge` still re-reads the snapshot itself before any delete (step 1 below); the predicate is the fairness filter, the re-read is the safety.
  - **A row that keeps failing** (a blob delete that errors every run) stays eligible, so it would head the queue forever. Predicate-only does not fix that once there are more such rows than the batch. **ADDED:** `boardPurgeAttemptedAt` (fourth nullable column, § 5) is stamped on every attempt and the order is `boardPurgeAttemptedAt ASC NULLS FIRST`, so a failing row rotates to the back and every eligible row gets a turn. Test **W25**: more not-yet-due rows, unreadable-capability rows and persistently failing rows than the batch size, plus one eligible row, and the eligible row is purged in one run.
  - **Stuck reporting is a separate cheap query**, not part of the batch: every run logs `board_purge_stuck ageMin=<n>` for any intent older than 24 h that is still unpurged, **including** rows the predicate excludes (a missing snapshot is exactly the case that must be loud).

`runBoardPurge(sessionId)`:
1. **Re-read the capability.** Read the frozen snapshot (not a cached value). If it is **unreadable** (error, row missing) or says `persist` is true: **delete nothing**, log `board_purge_skipped reason=capability_unreadable` (or `capability_persist`), and leave the intent for the next sweep. Never purge on a capability the code cannot read.
2. **Pass 1** (when `boardPurgeFirstPassAt IS NULL`): delete, **by prefix only (R2)**, in this order: every blob under `whiteboard-sessions/<studentId>/<sessionId>/` (events, snapshot, embedded assets; listed with the C0 `listBlobsByPrefix`), then every checkpoint blob under `whiteboard-checkpoints/<sessionId>/` (`listCheckpointBlobsForSession`), then `whiteboardEventBatch.deleteMany` again. **Nothing is ever deleted by a URL taken from the row, from a request, or from a column** (`eventsBlobUrl` and `snapshotBlobUrl` are never read by the purge). Stamp `boardPurgeFirstPassAt = now`. `deleteBlob` already swallows 404, so every step is idempotent.
3. **Wait.** Pass 2 is eligible only when `now >= boardPurgeFirstPassAt + BOARD_PURGE_SECOND_PASS_DELAY_MS`. The delay is the longest time an in-flight write can still land after End: the upload-token lifetime (client tokens minted before End can still `PUT` after End; the student and learner paths refuse new tokens after End, the tutor path will after C4a) plus the checkpoint flush window (`SERVER_PERSIST_INTERVAL_MS` 1 s, `useWhiteboardRecorder.ts` 170) plus margin.
   - **Verified (R4):** `@vercel/blob` is 2.3.3 in this repo, and its `client.d.ts` documents `validUntil` as "Defaults to one hour from generation" (lines 349 and 383; the option is accepted from `onBeforeGenerateToken`, line 298). `rg validUntil src/` returns **no match**: nothing in this repo sets it, so every upload token minted today lives **one hour**, and the delay would have to be over an hour if we left it.
   - **C4b sets `validUntil` explicitly**, in `runOnBeforeGenerateToken` (`api/upload/blob/route.ts` 260–263) for the whiteboard kinds only (audio keeps its current behavior). One exported constant, `BLOB_UPLOAD_TOKEN_LIFETIME_MS`, is the value passed as `validUntil: Date.now() + BLOB_UPLOAD_TOKEN_LIFETIME_MS`, **and** the input to `BOARD_PURGE_SECOND_PASS_DELAY_MS = BLOB_UPLOAD_TOKEN_LIFETIME_MS + flush window + margin`. Two constants that must agree is the bug; one constant feeding both cannot disagree. The harness token mint (`blob-harness.ts` ~211, "after `onBeforeGenerateToken` auth succeeds") must honor the same option so tests exercise it. Recommended starting value: **short** (minutes, not the default hour), because the cron runs every 15 minutes and a one-hour lifetime pushes pass 2 to the first run after about 75 minutes; the executor picks the number against the largest board upload (a PDF page) and records it in `docs/PLATFORM-ASSUMPTIONS.md`. **UNVERIFIED:** whether a `PUT` that began before `validUntil` can finish after it; the margin covers it and W12 exercises a delayed `PUT` with a pre-End token.
   - Server clock only (§ 9, axis 2).
4. **Pass 2:** repeat step 2's deletes (the prefix lists are re-run, so they catch blobs that landed in the window) and stamp `boardPurgedAt = now`. Only then is the intent complete.
5. Each stage logs. A blob delete failure logs `board_purge_blob_failed urlHash=<h>` and leaves the stage unstamped, so the next sweep retries; the session itself is already closed (invariant: End never loses a session). Every attempt stamps `boardPurgeAttemptedAt` (F6).
6. **Rows as well as blobs.** The sweep deletes `WhiteboardEventBatch` rows for the session in both passes. A batch row that landed after End (§ 3.4) is therefore removed even though it is not a blob.

**Test seams for the delay (R4).** Waiting an hour (or even minutes) in a Playwright test is not acceptable, and a product clock injected for tests would be code the test then proves nothing about. The seam is on the **data**, not the clock: the C0 DB oracle helper gains `backdateBoardPurgeFirstPass(sessionId, ms)`, which writes `boardPurgeFirstPassAt = now - ms` straight to the row. C0 builds it as either a direct DB write from the test process or a test route next to the existing read-only `api/test/whiteboard/[sessionId]/db-state` route, locked by `isPlaywrightTestProductionLocked`; either way **no product code path reads a test clock or a test flag**. A pass-2 test then reads: run the sweep (pass 1 runs, `boardPurgeFirstPassAt` is stamped), call the helper with `BOARD_PURGE_SECOND_PASS_DELAY_MS + 1`, run the sweep again (pass 2 runs). A negative arm runs the second sweep **without** the backdate and asserts pass 2 did **not** run (blob landed in the window is still present), which is what proves the delay is real. **W8, W11, W12 and W22 all use this seam**, and the sweep is invoked through the cron route handler with the test `CRON_SECRET`, so the real predicate is under test.

Residual, accepted and recorded: a board blob that is **not** under the session prefix is unreachable by anyone who does not hold its URL and is never purged by this wave (the placeholder events blob, which has no board content, and the server-assembled log, which is never created when `persist` is false, § 3.5); the existing blob-cleanup CLI (`blb`) can sweep stragglers. C4a makes it impossible for new tutor uploads to land outside the prefix.

### 3.4 Guards against in-flight writes (B2)

1. **Batch upsert vs End.** `checkpoint/route.ts` checks `endedAt` and phase in `assertActiveSession` (63–110) and then, in a **separate** transaction (`db.$transaction`, ~187), upserts the batch. A batch that passed the check before End committed can upsert after End's `deleteMany`, leaving a row with `boardDocumentJson`. **Fix:** re-check inside the batch transaction under a row lock on the session (the End transaction updates that row, so the lock orders them): if `endedAt` is set and the frozen capability says `persist === false`, abort with 409 and write nothing. For `persist === true` behavior is unchanged (the late window stays). **UNVERIFIED:** the exact lock form (`SELECT … FOR SHARE` via `$queryRaw` inside the transaction vs reading `endedAt` through the `GREATEST` cursor update) is the executor's design choice in C4b.

   **W11 must be red without the in-transaction re-check, and it must not lean on the purge to be green (R4).** A test that waits for a purge pass and then counts rows passes with or without the re-check, because the purge's own `deleteMany` cleans up the stray row. So **W11 asserts zero `WhiteboardEventBatch` rows before any purge pass has run**, with a **hold seam** at the one place the race lives: between `assertActiveSession` (`checkpoint/route.ts` 63–110, the check) and `db.$transaction` (:187, the write), after the cursor read at 130–143 and the duplicate lookup at 146–160 and the JSON parse, i.e. immediately before the transaction. The seam is a no-op call `await holdPoint("checkpoint:batch:before_txn", sessionId)` that returns immediately unless `PLAYWRIGHT_TEST` is set and the test arms it through a test route (locked by `isPlaywrightTestProductionLocked`, the same lock `blob-harness.ts` and `playwright-test-route.ts` use); it carries no product behavior and exists once, in one shared helper (C0), so W12 or later tests reuse it. W11 sequence: (1) positive control: post batch 1, row count is 1; (2) arm the hold; (3) post batch 2, which passes `assertActiveSession` and parks at the seam; (4) End the session with whiteboard off (End deletes the batches and commits the intent); (5) release the hold; (6) **assert the batch-2 response is 409 and `WhiteboardEventBatch` count is 0, with no sweep having run and `boardPurgeFirstPassAt` still null**. Without the in-transaction re-check step 6 finds one row (red); with it, zero (green). A second arm runs the same sequence with whiteboard **on** and asserts the late batch **is** written (unchanged behavior). Then, separately, the pass-2 arm: backdate `boardPurgeFirstPassAt` (§ 3.3 seam), sweep, assert still zero.
2. **Asset uploads after End (part of W19, prerequisite C4a).** The tutor path in the upload-token route (`route.ts` 210–230, and the events/snapshot kinds) checks ownership but not `endedAt`. Add the `endedAt` refusal at token mint when `persist === false`. A token minted **before** End can still `PUT` afterwards, which is exactly what pass 2 exists to catch (test W12, which uses the pass-2 delay seam).
3. **Pathname scoping on the tutor path (W19, prerequisite C4a).** Validate that `pathname` starts with `whiteboard-sessions/<studentId>/<sessionId>/` for the whiteboard kinds, as `assertJoinTokenAllowsWhiteboardAssetUpload` (164) and `assertLearnerSessionAllowsWhiteboardAssetUpload` (203) already do. This makes "everything the client uploaded for this board is under one prefix" true, so the prefix-only delete is complete (R2). **W19 therefore covers both guards (prefix and `endedAt`) and is a prerequisite of C4b, not part of it:** it ships first as **C4a**, on its own commit and its own gate, because a purge that deletes by prefix is only as complete as the prefix guard, and the guard is an auth-boundary change that deserves its own review. Test W19 goes red on today's code for both arms (a tutor token for `whiteboard-sessions/other/other/x` is minted; a token is minted for an ended session) and green after.
4. **Checkpoint route after End** returns 409 for `persist === false` sessions once `endedAt` is set, including inside the org forced-end late window (`orgForcedEndUploadOpen`).

### 3.5 Other end paths (all go through the same intent)

| Path | Today | Change |
|---|---|---|
| `endWhiteboardSession` (1055–1346) | Atomic txn | § 3.2 inside the txn, including the PENDING snapshot write (step 0) |
| `stampStaleWhiteboardSessionEnd` — callers `org-scope.ts` 670, `org-scope.ts` 1081, `org-force-end-touch.ts` 33, `endStaleWhiteboardSession` `actions.ts` 1410, **and the reaper (§ 3.9)** | Stamp only; "Leaves eventsBlobUrl" | The helper writes the PENDING snapshot (R1) then calls `stampBoardPurgeIntent` in its own `tx`, in the same statement group as `endedAt`. Its existing idempotence ("a second call does not move `endedAt`") also means a second call writes no second intent. The callers then trigger `after(runBoardPurge)`; the reaper has no request, so it relies on the purge sweep alone. |
| `acceptOrgForcedEndUpload` (`actions.ts` 740–781) | Late client upload sets `eventsBlobUrl` with no consent check | Refuse board data when `persist === false`: do not set `eventsBlobUrl` and do not record the URL anywhere (R2; the blob is under the session prefix and the next purge pass removes it); accept audio per capability (already checked via the capability read at 756) |
| `finalizeWhiteboardSessionFromBackend` (811) | Assembles events from batches, writes `…/<adminUserId>/<studentId>/<ts>-events.json`, triggers transcription/notes | **Skip assembly when `persist === false`**: assembling would resurrect the board from batches before they are deleted, into a path the prefix purge cannot reach (§ 1c item 10). Transcription/notes triggers obey the capability (§ 2.3). |
| Client End flow | Uploads final events and snapshot PNG, then calls End | Skip both uploads when `persist === false` (client reads the Start-adopted capabilities). If a stale client uploads anyway, the blob is under the session prefix and the prefix purge covers it without anyone recording its URL (W13, W23). |

### 3.6 Interaction with the outbox, the recorder FSM, and erasure

- **Outbox (`upload-outbox`)** carries audio rows only; board events go through the sync/persist path. No outbox change. `finalizeOutboxAfterEnd` stays after the transaction.
- **FSM (`lifecycle-machine.ts`)** — no change. The client change is that final events upload and snapshot PNG are skipped when `persist === false`; they are already best-effort steps of the End flow ([`RECORDER-LIFECYCLE.md`] End flow). Step order is untouched.
- **PILLAR FLAG:** adding `whiteboardEventBatch.deleteMany`, "ignore client board URLs", the PENDING snapshot write and the intent write **inside** the atomic end-session and inside the shared stale stamp is a **Pillar 3 content change**. The order of steps does not change. It needs: plan-mode step-back, **Opus** design and execution (D4), Sonnet review before coding, Sonnet verification after, and the full `test:wb-sync` before merge.
- **Snapshot PNG feeds note generation.** With `persist === false` it must not be generated, uploaded, or passed to notes. The notes path reads `snapshotBlobUrl`; with it null there is nothing to feed. W5.
- **Erasure regression risk (revised, R2).** The first draft factored `enumerateSessionBoardBlobs` out of `enumerateLearnerFamilyBlobs`. With the purge now prefix-only, **that refactor is dropped**: erasure builds its list from row URLs (`blob-inventory.ts` 148–205), the purge must never do that, so the two share only the lister (`listBlobsByPrefix`, `listCheckpointBlobsForSession`) and nothing else. The erasure path is still touched, **by C0**: C0 makes `deleteBlob` (`blob.ts` 20–22) and the two real `list` call sites (`blob-inventory.ts` 107, `assemble-persisted-state.ts` ~110) harness-aware. So the erasure suites are pinned and run **in C0's gate** (F1) and again in C4b's: `blob-inventory.test.ts`, `process-erasure-job.test.ts`, `erasure-lifecycle.integration.test.ts`, `erasure-access-suspension.integration.test.ts`, `share-link-erasure-guard.integration.test.ts`. They must stay green and unmodified (W21: names listed in the PR note, run before and after each of the two waves). Same for `deleteWhiteboardEventBatchesForSessions` (`blob-inventory.ts` ~213).

### 3.7 Device-side data (D1)

With whiteboard consent off there is no recording, so there is nothing to recover. Therefore:

1. **The tutor's IndexedDB stroke-log checkpoint is never written for that session**, rather than cleared afterwards. `runCheckpoint` (`useWhiteboardRecorder.ts` 1090–1120) and its 30 s loop (`IDB_CHECKPOINT_INTERVAL_MS`, 167) are gated on the capability: write only when `whiteboard.persist === true` **and** the capability is known. **Unknown capability fails closed: no checkpoint write.**
2. **Leftover checkpoint cleared at End.** Today the normal End path clears it (`markPersisted`, `WorkspaceClient` ~4695, after `onSessionEnded`), and a re-opened ended session clears it (`useWhiteboardRecorder.ts` 1360–1362), and opening any workspace for the same student clears the latest ended-session checkpoint (1396–1412). **Gaps:** a stale or forced End by another actor, a closed or crashed tab, and a tutor who never reopens that student's workspace leave a checkpoint in IndexedDB (and, for the stale/forced cases, the log is the full board). Fix: (a) End clears it for `persist === false` unconditionally (the existing `markPersisted` call stays); (b) on **every** workspace mount, for the owner, a checkpoint whose session ended on the server **with `persist === false`** is cleared (extend the existing cross-session hygiene; it currently clears only the single latest and only for the same student); (c) because with item 1 it is never written for new sessions, (b) is only a backstop for checkpoints written before the consent was known to be off. Test W15.
3. **The `sessionStorage` scene draft** (`session-scene-draft.ts`) is a second device copy of board content. It is **kept** while the session is live (live reload must keep working, W2), is tab-scoped, and is already cleared at End (`WorkspaceClient` 4703). It is not written when the capability is unknown. For a stale/forced End it dies with the tab. Copy names it as "temporary storage in your browser".
4. **Live reload still works without IndexedDB.** Hydrate comes from server batches (`SERVER_PERSIST_INTERVAL_MS` 1 s). The cost is that the "IDB tail merge" (`hydrate_idb_tail`) is unavailable for these sessions, so a crash can lose up to about one second of strokes. Accepted: there is no recording to protect. Recorded in § 9, axis 1.
5. **Privacy copy (D1, § 7c):** says "deleted from **our servers** when the session ends" and, separately, names device data and backup retention. It does not say "deleted when the session ends" without qualification.

### 3.8 What the tutor sees after End with whiteboard off

The in-shell review (`loadSessionReviewPayload`, `notes-actions.ts` ~545) reads from the server, so it shows "no board saved". Copy for that empty state changes (§ 7) from "no strokes recorded" (implies nothing was drawn) to "The board was not saved because whiteboard recording was off." The distinction comes from the **frozen capability**, not from the purge columns. **Audio-only replay with the empty placeholder log:** `computeReplayTotalMs` (`replay-helpers.ts` 62–75) already takes the audio length when `hasAudio`; test W20 proves the scrubber spans the audio length in the real replay component (**UNVERIFIED** in the component path beyond the helper).

### 3.9 Sessions that never end: the stale-session reaper (R3) — APPROVED (Andrew 2026-10-29 16:17, Q3)

**The hole.** Everything in § 3.2–3.5 hangs off End. A session whose tab closes, or whose tutor never presses End, has `endedAt = null` indefinitely and keeps its board, so "deleted when the session ends" has no deadline. Nothing ends such a session today: `vercel.json` has two crons, `/api/cron/transcribe-sweep` (every 15 min) and `/api/internal/erasure/process` (every 6 h), and neither touches `endedAt`. The only automatic ends are lazy and org-only: `touchOrgForceEndIfDue` stamps "first read after the force-end deadline. **A row nobody reads stays unended**" (`org-force-end-touch.ts` 8–10), and the org status / member-removal paths stamp the sessions they find at that moment (`org-scope.ts` 670, 1081). The student page already lists open sessions with a Resume-or-End prompt (`students/[id]/page.tsx` 45, 146–182) because they accumulate.

**Design (APPROVED, Andrew 2026-10-29 16:17).** A background job ends any session with no activity for 24 hours, through the shared stale/forced End path, for every session. The whiteboard-off purge follows.
- **Where.** `runStaleSessionReaper(now)` on the **existing** cron route (`api/cron/transcribe-sweep/route.ts`, every 15 min), its own batch limit and time budget (same shape as `runTranscribeSweep(now)`, so it is testable the same way), called **first**, then the purge sweep, then the transcription sweep (§ 3.3). No new cron entry, no new `vercel.json` line.
- **Candidates.** `endedAt IS NULL` **and** last activity older than 24 h **and** (no linked appointment, or the linked `ScheduledSession.endAt` is in the past). `WhiteboardSession` has no `updatedAt` (checked, `schema.prisma` 375–547), so "last activity" is the greatest of the columns that already record it: `createdAt`, `activatedAt`, `lastActiveAt` (both-parties heartbeat; null when nobody is connected), the newest `WhiteboardEventBatch.createdAt` (the board writes about once a second while anyone draws; indexed `[whiteboardSessionId, createdAt]`), the newest `SessionRecording.createdAt`, and the newest `SessionParticipant.joinedAt`. No new column and no write on the hot path. Only open sessions are scanned, which is a small set at pilot scale; there is no `endedAt` index and none is added here.
- **Why 24 h.** It equals `JOIN_TOKEN_LIFETIME_MS` (`actions.ts` 385): by then every join link the tutor issued is already dead, so ending the session removes nothing a participant could still use.
- **Why the appointment condition.** A scheduled room is get-or-create by `scheduledSessionId` (unique), and `createWhiteboardSessionCore` returns the existing row **whether or not it has ended** (`create-session-core.ts` 114–121). A tutor can open a room ahead of the appointment (the bridge applies the join window to learners and AH principals only, `schedule-bridge.ts` 90–104). Reaping that session before the appointment would make the appointment's room permanently an ended session. Test G5.
- **How.** One transaction per candidate calls the **shared** `stampStaleWhiteboardSessionEnd` (the fifth caller; no second implementation, guard G7). **One End semantics: it ends every such session, not only whiteboard-off ones.** The helper already writes the PENDING snapshot (R1) and the purge intent (§ 3.2), so a whiteboard-off session gets its board purged by the sweep that follows on the same cron, and a PENDING session is handled by the same rule as a PENDING End. No `after()` (there is no request); the sweep is the executor.
- **`endedAt` for a reaped session.** The helper takes the instant as a parameter (`now`, `stale-session-stamp.ts` 9–14). Pass the **last-activity instant**, so `durationSeconds` (`now − startedAt`, 25–28) is the active span, not 24 h of silence. That is the recommended choice inside the design Andrew approved; he did not restate it as a separate answer. Detection time was the alternative and does not ship.
- **Logs.** `[slc] wbsid=<id> action=session_reaped phase=<pending|active> idleHours=<n> lastActivity=<iso> persist=<bool>`; plus `logProductEvent` `SESSION_ENDED` with `path: "reaper"` (`endWhiteboardSession` and `endStaleWhiteboardSession` write it, `actions.ts` 1301 and 1433; the org stamp callers do not).
- **Tier.** Opus execution, Sonnet design review before and Sonnet verification after: it ends sessions automatically on a live commercial surface, and a false positive ends a session someone is using (the 24 h bar and the appointment condition exist for that).

**Every effect of an automatic End on a whiteboard-ON session.** Verified in code 2026-10-29, and in view when Andrew approved the reaper. "Stamp-only" means the shared helper, which is all the reaper calls; the full `endWhiteboardSession` does more and only a tutor's client reaches it.

| # | Effect | What stamp-only does today (evidence) | Consequence for a reaped whiteboard-on session | Recommended |
|---|---|---|---|---|
| 1 | **Board replay** | The helper leaves `eventsBlobUrl` at the empty placeholder ("Leaves eventsBlobUrl", `stale-session-stamp.ts` 4). Only `finalizeWhiteboardSessionFromBackend` turns `WhiteboardEventBatch` rows into an events log, and `assembleBackendEventLog` has **one** product caller (`actions.ts` 872). The tutor-chosen stale End has the same property by design (`actions.ts` 1371–1375) | The board was recorded and the batches are in the DB, but the replay log is the empty placeholder, so replay shows nothing. **Recoverable, not lost**: batches stay until someone assembles them | **(d)** Stamp-only for the first version; BACKLOG `REAPER-ASSEMBLE`. A system-actor assemble means splitting the user-bound `assertOwnsWhiteboardSession` out of finalize, which is a fragile-surface change; do it deliberately, not as a side effect |
| 2 | **Notes generation** | `kickSessionChunksAction` and `triggerNotesGenerationAction` run only inside finalize (`actions.ts` 1000–1010). The notes sweep only retries `TutorNote` rows that already exist (`transcribe-sweep.ts` 111–122). The chunk sweep has **no** `endedAt` filter (`transcript-store.ts` 170–177) | Already-enqueued chunks still get transcribed by the cron, but no `TutorNote` is created, so no drafted note. The tutor can open the review and use the manual generate action (`generateNotesFromWhiteboardSessionAction`, `actions.ts` 1543); **UNVERIFIED** that they accept a stamped session (test G11) | Accept; tutor generates manually. Notes capability gates (C2) apply to the manual path as everywhere |
| 3 | **Outbox and audio** | Mid-session segment registration is refused once ended (`registerWhiteboardSessionAudioSegmentAction` 1833 returns `sessionEnded`, 1870–1872; the outbox logs `register_mid_session_skipped_ended`, `upload-outbox-instance.ts` 203–207). End-time registration throws "already ended" (`actions.ts` 1071–1083) **unless** the org forced-end window is open (`acceptOrgForcedEndUpload`, 725) | Segments already registered mid-session are kept. Segments still sitting in a tutor browser's outbox when the reaper fires are uploaded but **never become `SessionRecording` rows** (orphan blobs, no replay). For a session idle 24 h the outbox is normally empty; a crashed tab can leave rows | Accept and record. No late window for non-org sessions exists to reuse |
| 4 | **Billing time** | Full End freezes billing (`computeBillingFreezeFields`, `actions.ts` 1188–1205). The stamp helper does not, so `billedDurationMin`, `billedStartLocal/EndLocal`, `sessionDateLocal` stay null and review/share fall back (`billing/display.ts` 29–30). `durationSeconds` is wall-clock `now − startedAt` | More sessions end with no frozen billed duration (**already true for all four existing stamp callers**). `activeMs` (time both parties were connected) is untouched and accurate. Duration is the active span if (c) passes the last-activity instant, otherwise 24 h-plus | **(e)** Defer the billing freeze to BACKLOG `STAMP-BILLING-FREEZE` (it also fixes the four existing callers); do not widen this wave |
| 5 | **Family visibility** | A family sees a replay only for a **non-DRAFT** `SessionNote` linked to the session (§ 1c item 1). The stamp creates none. Join tokens are revoked and participants get `leftAt` (`stale-session-stamp.ts` 50–57); tokens last 24 h anyway | Nothing becomes visible to the family; a family member still on the page loses the session. The tutor's open-session row disappears (`students/[id]/page.tsx` 45). A reaped **PENDING appointment room** cannot be reopened as a fresh session (`create-session-core.ts` 114–121) | Covered by the appointment condition (G5); the rest is accepted |
| 6 | **Org forced-end paths** | Org status change and member removal stamp at the org's forced instant (`org-scope.ts` 670, 1081, may set `notesForbidden`); `touchOrgForceEndIfDue` stamps lazily on read. `orgForcedEndUploadOpen` (15 min, `org-session-access.ts` 10, 156–) opens **only** when `endedAt` equals that forced instant. `notesStillWritable` is 7 days from `endedAt` (`org-session-access.ts` 12, 55) | The reaper also ends org sessions nobody read (an improvement over "a row nobody reads stays unended"). A reaper stamp is **not** a forced instant, so no 15-minute late-upload window opens, and the 7-day notes window starts at the reaper's `endedAt` (shorter by about a day if (c) back-dates it). The reaper never sets `notesForbidden`. A later `touchOrgForceEndIfDue` on a reaped row is a no-op (the helper does not move `endedAt` twice) | Accept; test G10 |
| 7 | **Product events and logs** | The stamp helper writes no `SESSION_ENDED` event | The funnel would miss reaped ends unless the reaper logs it | Reaper logs `SESSION_ENDED` with `path: "reaper"` (above) |
| 8 | **Board purge for whiteboard-off** | n/a | Intent written by the helper in the same transaction; sweep purges; privacy copy is true for these sessions | The point of the reaper |

**What the approval covers (Q3).** (a) An automatic End, approved. (b) 24 h, approved. It applies to every session, through the shared stale/forced End path, and the whiteboard-off purge follows. The recommended choices inside that design ship with the approval; Andrew did not restate them separately: (c) `endedAt` is the last-activity instant; (d) whiteboard-on reaped sessions are stamp-only (replay empty until assembled; BACKLOG `REAPER-ASSEMBLE`); (e) the billing freeze stays deferred (BACKLOG `STAMP-BILLING-FREEZE`).

**Out of scope.** A future "are you still there?" prompt that ends an idle session sooner is backlog `WB-IDLE-STILL-THERE`. This wave does not build it.

**Historical — fallback if the reaper had been declined.** Andrew approved the reaper (2026-10-29 16:17). The three items below do not ship; they are kept so the rejected alternative is not lost.
1. **An explicit, named gap:** `GAP-NEVER-ENDED-SESSIONS`: a session that is never ended keeps its board until someone ends it. Recorded in `docs/BACKLOG.md` with the design above and this effects table, dated, as Andrew's explicit waiver (agents cannot self-authorize it, `exhaustive-testing-mandate.mdc`).
2. **Privacy copy scoped to "ended sessions":** the board-deletion sentence says "when the session ends", never "after the session", and adds "A session that is not ended (for example, a browser tab that was closed) is not ended automatically, so its board stays until the tutor ends it." (Copy approval applies.)
3. **Tests and waves:** C4c and tests G1–G11 are dropped; W13's closed-tab arm becomes a documented skip with a `// GAP-NEVER-ENDED-SESSIONS:` comment and the BACKLOG link; § 9 DUR-8 is recorded as an accepted residual risk with Andrew's waiver. Everything else is unchanged because the stamp helper's purge intent is independent of the reaper.

### 3.10 Does the sync relay store board state? (F8)

**Answer: no evidence that it does, and nothing in the repo's deployment for it to store state in.** Checked 2026-10-29:
- **What it is.** A separate repo, `whiteboard-sync/` (a sibling of this one; `package.json` `relay:build` builds `../whiteboard-sync`; `docs/PLATFORM-ASSUMPTIONS.md` § 5.1). Its `Dockerfile` clones `excalidraw-room` at the pinned SHA `03ff435860b508d7cd9e005cfc90f7977ae2a593`, runs `npm install` and `tsc`, and starts `node dist/index.js`. It adds **no code, no patch and no database client** of our own.
- **Where it could store state.** `fly.toml` has **no `[mounts]` volume** and no storage or database env: only `DEBUG` and `PORT`. The machine is `shared-cpu-1x`, 256 MB, `auto_stop_machines = 'stop'`, `min_machines_running = 0`, so an idle relay is stopped and any in-memory state is gone with it.
- **What it does with traffic.** Its documented protocol is pass-through only: `init-room`, `first-in-room`, `new-user`, `room-user-change`, `join-room`, `server-broadcast`, `server-volatile-broadcast`, `client-broadcast`, `disconnecting` (`whiteboard-sync/README.md`, "Updating the pinned upstream commit"). The payloads are end-to-end encrypted with a key the relay never sees (README trust model; `docs/WHITEBOARD-STATUS.md` 317–319; `docs/PLATFORM-ASSUMPTIONS.md` 666: "The relay itself still holds only ciphertext").
- **UNVERIFIED, and it is the one thing the repo cannot settle:** the upstream `excalidraw-room/src/index.ts` source is not vendored, so "does not persist or retain room history" is the documented behavior, not something I read in code. **Settled by** a read-only step in C0: clone the pinned SHA, grep the source for `fs`, `redis`, `sqlite`, `level`, `Map`/array room history, and write the result into `docs/PLATFORM-ASSUMPTIONS.md` § 5.1; plus test **W24**, which is behavioral and independent of the source: after a session has ended and every peer has left, a fresh `socket.io` client joining the same room id on the local relay receives `first-in-room` and **no** scene payload.
- **One more place bytes could sit: logs.** `fly.toml` sets `DEBUG = 'server,io,socket'` (line 13; also baked in the `Dockerfile`, line 35). Those `socket.io` debug namespaces can log event arguments, so ciphertext payloads may appear in Fly's log stream for as long as Fly retains it. **UNVERIFIED** (depends on the upstream's and `socket.io`'s log content and Fly's retention); the same C0 read settles what is logged, and the finding goes in § 5.1 of `docs/PLATFORM-ASSUMPTIONS.md`. It is ciphertext under a key the relay never sees, so it is not a plaintext-retention problem, but copy must not say "nothing is kept" unless it is true.
- **If the read or W24 finds retention** (not expected): content is ciphertext, but the decryption key for newer sessions is held by us (`WhiteboardSession.liveKeyEnc`, encrypted at rest, `PLATFORM-ASSUMPTIONS.md` 663–666), so the cover would be (1) a room-clear call at End for `persist === false`, and (2) clearing `liveKeyEnc` for that session at End. Neither is built unless the evidence requires it; the plan does not claim more than the evidence.
- **Copy.** One honest sentence in § 7c, added only after the C0 read confirms it.

---

## 4. Audio gating

### 4.1 In person, audio off: no mic capture at all (B4, D7)

**What the review found and I verified.** The FSM concern in the first draft was overstated. In policy `none`, `tutorWantsRecording` is already false and the `tutor:mic` input is already skipped (`lifecycleInputStreams`, `WorkspaceClient` 2434–2469). The `AudioContext` silent-stream fallback is dropped (D7): unnecessary and risky. The real problem is the code that **opens the mic**:

| Opener | Where | Today |
|---|---|---|
| Mount-time acquire | `useAudioRecorder.ts` 575–596, `[]` deps, `acquireMic({ forRecording: false })` | Runs on mount, **before** the waiting-room mode is chosen; its `finally` sets `micAcquireSettled` |
| `micAcquireSettled` consumer | `useLiveAvCoordinator.ts` 278 area, `WorkspaceClient` 2336 (`role === "tutor" ? workspaceAudio.micAcquireSettled : true`) | **Gates the camera request.** Skipping the acquire without settling wedges the camera coordinator |
| Top-bar mic control | `WbTopBarMicControlLive.tsx` (203 area) | Opens/re-opens the mic on click |
| Permission prompt | `AVPermissionsPrompt` / `requestMic` (`WorkspaceClient` ~5511, ~5537) | Opens the mic |
| Device pickers / swaps | `useAudioRecorder` `swapMicDevice` (1303–1340), `swapMicDeviceBySlot` (~1436–1464), `useLiveAV` pickers (~1145, ~2962) | Open a new `getUserMedia` stream |
| **Learner-side bootstrap** | `useLiveAvCoordinator.ts` 111–153: on sync connect, `requestMic()` / `requestCam()` / `requestMicAndCam()` | Opens mic and camera with **no consent check** |

**Design (all in C3b, Opus, plan-mode step-back first):**
1. A pure `micAcquire(capabilities)` in `session-capabilities.ts` returns `yes`, `defer`, or `no` (the `mic.acquire` field in § 2.2). `yes` when audio recording is on, or the mode is LIVE (a live conversation needs the mic even when recording is off); `no` when the mode is IN_PERSON and audio is off; **`defer` when the mode is UNKNOWN and audio is off**. When audio is on, the waiting-room preview proceeds as today in either mode, so behavior does not change for those sessions.
2. **Every opener above reads it.** No opener calls `getUserMedia({ audio })` unless it returns `yes`. One gate function, called from each opener; no per-opener copy of the rule (D5).
3. **Defer, then resume.** The mount effect does not acquire on `defer`. When the waiting room's selected mode (or the persisted `sessionMode` on resume, or the Start response) makes it `yes`, acquisition runs. On `no` it never runs.
4. **Release on a flip.** If the mic was acquired (mode LIVE selected, or audio was on) and the tutor flips to in person with audio off, the stream's tracks are stopped (`readyState === "ended"`) and the level meter stops, **before** Start is requested.
5. **Always settle.** On `defer` and on `no` the hook still sets `micAcquireSettled = true` (a skipped acquire is a settled one), so the camera coordinator proceeds. Test M6: the camera still works after a skipped mic (video track live, audio track absent).
6. **Learner side.** The student bootstrap calls the same gate. The learner knows the mode only after Start (the session row's `sessionMode`); with audio recording off and mode UNKNOWN, the audio part is deferred and the camera is not (the camera is not a consent switch). In an in-person session with audio off, no learner audio request happens at all.
7. **Waiting-room mic preview (level meter):** in `no` and `defer`, the mic permission is not requested and the meter is not shown. (Decision, not a question: a level meter that opens the mic while the product says "no audio is recorded" invites exactly the distrust this wave is meant to remove. The permission prompt itself is the signal.)
8. **Server backstop:** segment registration (`actions.ts` 1899) and chunk enqueue (2090) reject **any** audio when `audio.mode === "none"` (the audio upload token cannot know the session, § 1c item 12; it carries `studentId` only).
9. **Draft store (`recording-draft` IndexedDB, `dft`):** not opened when `no` (confirm; it is keyed off the mixdown stream).

### 4.2 Online, audio off: learner track out of capture, outbox, mixdown, transcription

Four independent keeps, each with its own test:

| Stage | Mechanism (exists unless noted) |
|---|---|
| Capture | `shouldAttachRemoteStreamToRecordingMixdown` false, `resolveRemoteRecordingGainLinear` 0 for non-`full` (`audio-capture-policy.ts` 71, 81) |
| Learner transcription lane | `useRemoteMicRecorders` is `enabled` only for `full` (WorkspaceClient ~2919–2940). The lane taps the **RAW** stream before mixdown, so gain-0 on the mixdown does **not** stop it; the `enabled` flag is the control. Must be asserted in a test. |
| Outbox | Lane rows carry `transcriptionOnly`; with no lane there are no rows. Server rejects stray learner rows (§ 2.3). |
| Mixdown / transcription | `tutor:mic` is the sole replay source. Server transcription refuses learner lanes unless `transcript.learnerVoice`, at every entry, with lane identity preserved across retries (§ 2.3). |

"Even transiently": the learner lane must not be created before capability is known. Because § 2.6 freezes capability at Start **and the client adopts the returned capabilities before arming** (B5), there is no window. Default for unknown is off. Test A2b: no learner lane before capability is known.

---

## 5. Migrations

**Additive only.** One migration, **nullable columns on `WhiteboardSession` only, no defaults, no backfill:**

| Column | Type | Purpose |
|---|---|---|
| `boardPurgeRequestedAt` | `DateTime?` | The purge intent. Set inside the End transaction / stale stamp (§ 3.2). Indexed (`@@index([boardPurgeRequestedAt])`) so the sweep predicate is cheap. Null on every existing row. |
| `boardPurgeFirstPassAt` | `DateTime?` | Pass 1 stamp; pass 2 is eligible `BOARD_PURGE_SECOND_PASS_DELAY_MS` later. The test seam backdates this column (§ 3.3). |
| `boardPurgeAttemptedAt` | `DateTime?` | **ADDED (F6, veto-able).** Stamped on every purge attempt; the sweep orders by it (`NULLS FIRST`) so a persistently failing row rotates to the back and cannot starve eligible rows (§ 3.3). Null until first attempt. |
| `boardPurgedAt` | `DateTime?` | Both passes done. |

**Four columns. `boardPurgeUrls` is gone (R2): the purge stores and deletes no URL.** This replaces and extends the first draft's single `boardPurgedAt`. The **reaper (§ 3.9) needs no migration**: it reads existing columns and the existing `WhiteboardEventBatch` index `[whiteboardSessionId, createdAt]` (`schema.prisma` 563). Nothing else:

| Change | Needed? | Why |
|---|---|---|
| `ScheduledSession.mode` | **No** | Mode is chosen at Start (waiting room); appointments do not carry it. Entry state answers per mode. |
| Consent tables | **No** | DB keys unchanged; labels are copy only. The `SessionConsentSnapshot` refreeze at Start is an **upsert** of existing columns, and PENDING-End writes the row if missing (R1): new rows, no new columns. |
| `TranscriptChunk.status` / `TutorNote.status` | **No** | Plain strings (`schema.prisma` 605, 675). `refused` / `skipped` are new values in the TypeScript lists only. |
| Existing data | **None** | Going forward only. The intent is written only by new code at End, so existing rows have `boardPurgeRequestedAt = null` and are never swept (W17). An old session that is **still open** when the wave deploys and later ends (by a tutor or the reaper) is treated by the new code like any other End. No deploy-time constant is needed. |

**Prod migration needs Andrew's go.** This plan does not authorize it. Local/test DB migration for development is fine. Neon MCP `prepare_database_migration` is a write: greenlight rule applies. Rollback: columns are nullable and unread by the old code; reverting the code leaves them harmless.

---

## 6. Playwright consent matrix

Layer rules (`exhaustive-testing-mandate.mdc`): behavior, sync, media, replay, entry and mic are **Playwright**. Pure unit tests cover the truth table, copy coverage and `parseLane`. Every test is red-before / green-after; "red evidence" is recorded in the PR note (the pre-change commit SHA the test failed on). **Every test is tagged `@wb-consent` plus the domain tags in its group header** ([`tests/test-tags.ts`](../../tests/test-tags.ts)); titles state the rule.

**Home (specs):**
- `tests/integration/wb-consent-matrix.spec.ts` — relay harness: audio, notes, whiteboard-live rows.
- `tests/integration/consent-entry.spec.ts` — no relay: entry, Start/refreeze, replay visibility, share link.
- `tests/integration/wb-consent-board-purge.spec.ts` — relay + extended blob harness: § 3 rows.
- `tests/integration/wb-consent-mic.spec.ts` — fake-media mic rows (spy on `getUserMedia` injected before load).
- `tests/integration/wb-consent-reaper.spec.ts` — § 6k (Q3 APPROVED, Andrew 2026-10-29).
- Student-on-WebKit rows (`E15`, `M10`) run in the WebKit (iPhone 13) project; per the 2026-10-11 lesson that project must be given these specs (today it matches `smoke/**` only).

Add all to the `wb-regression` project. **New tag `@wb-consent`** in `tests/test-tags.ts` with path mapping in `scripts/wb-test-select.cjs` for `consent-scope.ts`, `session-capabilities.ts`, `consent-toggle-copy.ts` (or its new home), `schedule-bridge.ts`, `stale-session-stamp.ts`, `replay-access.ts`, `transcript-store.ts`, `transcribe-sweep.ts`, `endWhiteboardSession`; adjacency → `@wb-recording`, `@wb-presence`, `@wb-sync`. Extend (do not duplicate) existing specs: `wb-self-learner-audio-off.spec.ts`, `wb-in-person-audio-start.spec.ts`, `wb-tutor-recording-mute.spec.ts`, `parent-child-notes-whiteboard-replay.spec.ts`, `wb-child-home.spec.ts`, `identity/consent-save.spec.ts`, `visual/legal-honesty.spec.ts`. Move their individual assertions into the matrix only if they restate a matrix rule.

**Shared test infrastructure — built first, in C0 (B6, D9).** Without it, W3, W4, W8 and every purge test have no oracle.
- **`blob-harness.ts`: `harnessStoreList(prefix)`** (keys + sizes), **`harnessStoreDelete(key)`**, and **fault injection** (`harnessFailNextDeletes(n)`, `harnessFailDeleteMatching(prefix)`), reset by `resetHarnessStore`. Exposed to Playwright through the existing test-route pattern (`/api/test/...`, locked in production by `isPlaywrightTestProductionLocked`).
- **`blob.ts` `deleteBlob`** routes to the harness when `isBlobHarnessActive() && isHarnessBlobUrl(url)`, as `fetchPrivateBlobBytes` already does. Today it would call the real `del` with a harness URL (§ 1c item 11).
- The inventory code that calls the real `list` (`blob-inventory.ts` 107, `assemble-persisted-state.ts` 110) goes through one `listBlobsByPrefix` that also honors the harness.
- Self-tests for the harness (jest, tiny) and a **positive control** helper: `expectBatchCount(sessionId, >0)` before End and `0` after (W10), so a purge test cannot pass because nothing was ever written.
- A `getUserMedia` spy helper (counts audio-constraint calls, exposes track `readyState`) for M1–M10.
- A DB oracle helper for `TranscriptChunk` / `SessionRecording` / `WhiteboardEventBatch` / `TutorNote` / `SessionNote` counts by `streamId`, **plus a seam to write the pass-2 clock: `backdateBoardPurgeFirstPass(sessionId, ms)`** (§ 3.3; used by W8, W11, W12, W22; no product code reads a test clock).
- **The checkpoint hold seam (R4):** one shared `holdPoint(name, sessionId)` helper, a no-op unless `PLAYWRIGHT_TEST` is set and armed through a `isPlaywrightTestProductionLocked` test route, placed once in `checkpoint/route.ts` between `assertActiveSession` and the transaction (§ 3.4). Used by W11, reusable by later race tests.
- **Cron driver:** a helper that calls the cron route handler with the test `CRON_SECRET`, so purge-sweep and reaper tests exercise the real predicate and ordering, not an imported function.
- **Relay probe (F8):** a tiny `socket.io` client helper that joins a room id on the local relay and reports the events it receives (W24).
- **The erasure suites run in C0's gate (F1):** C0 changes `deleteBlob` and the two `list` call sites that erasure uses, so `blob-inventory.test.ts`, `process-erasure-job.test.ts`, `erasure-lifecycle.integration.test.ts`, `erasure-access-suspension.integration.test.ts` and `share-link-erasure-guard.integration.test.ts` must pass **unmodified** at the end of C0, not only at C4b.

**Independent oracles (never derived from the code under test):** DB rows; harness store listings by prefix; HTTP status of replay URLs per principal; relay peer state; the `getUserMedia` spy; and the **literal rule table in the brief typed into the spec as data** (not imported from `session-capabilities.ts`).

### 6a. Entry (online switch) — tags `@wb-consent @wb-presence`

| # | Test title (states the rule) | Oracle |
|---|---|---|
| E1 | `online off: tutor Start Online is refused and Start in person works` | Server response; session `sessionMode` row |
| E2 | `online off: Open room works and offers only in person` | DOM: in-person button visible, online absent; no mode auto-flip event |
| E3 | `online off: resume of an open session gives the same answer as Start` | Same reason line text |
| E4 | `online off: child cannot join, sees a one-line reason` | Redirect + `ENTRY_BLOCK_COPY` text |
| E5 | `online off: parent joining as child cannot join` | Same |
| E6 | `online off: self-learner cannot join (the /join gap)` | Same; red today |
| E7 | `online off: old /w/<joinToken> link cannot join` | Lands on the blocked page, not a room |
| E8 | `online off: schedule Join button is disabled with a reason for every principal` | DOM |
| E9 | `online on: all of the above succeed` | Positive control |
| E10 | `org consent off, private consent on: org session blocked, private session allowed, same learner` | Two sessions, one learner profile |
| E11 | `org consent on, private consent off: private session blocked, org session allowed` | Same |
| E12 | `parent turns online on after the room was opened: child can join without a new session` | Live read while PENDING; `[cns]` log |
| E13 | `child turns online off after the room was opened: child is refused` | Same |
| E14 | existing `org booking calls the bridge › live start is refused when consent is off, and in-person start activates` | **Not edited here.** Expected to go green at W4/C5. |
| E15 | `online off: a WebKit (iPhone 13) student at /join is refused with the one-line reason` | Student on `devices["iPhone 13"]`; redirect + copy text |
| E16 | `one rule, every caller: Start, bridge, /join and issueJoinToken give the same answer for every (toggle, mode) fixture` | Accept/refuse of each site vs the brief's table typed into the spec |
| E17 | `child restriction forbids live: the org scheduler card shows live sessions off even when the org record allows it` | DOM on the scheduler card; the `org-learner.ts` child-floor bug; **red today, fixed in C1** |

### 6b. Start and refreeze (B5) — tags `@wb-consent @wb-presence @wb-sync`

| # | Title | Oracle |
|---|---|---|
| S1 | `double Start (two tabs): the second Start does not refreeze an ACTIVE session` | `SessionConsentSnapshot.frozenAt` and toggles unchanged after the second call; `[cns] refreeze_skipped` |
| S2 | `ACTIVE session: a consent flip changes nothing mid-session` | Capabilities unchanged; lanes unchanged; copy says "next session" |
| S3 | `consent flipped between page load and Start: Start returns the refrozen capabilities and no learner lane or blob is created` | Blob store listing has no learner-lane object; no `speaker:*` row in `SessionRecording` or `TranscriptChunk`; client adopted the response |
| S4 | `Start returns capabilities equal to the snapshot row it just wrote` | Response vs DB row |
| S5 | `Start refuses online when live is off even if the refusal read and the update interleave` | Two concurrent Start calls around a consent flip; at most one ACTIVE; refusal consistent |
| S6 | `session created while the learner is unclaimed, family claims and turns whiteboard off, tutor Starts, session ends: the board is purged` | Seed an unclaimed learner; assert **no snapshot row** after create (precondition); claim + set whiteboard off; Start; assert the snapshot row now exists with `allowWhiteboardRecording = false` and `created=true` in `[cns] refrozen_at_start`; board data present before End (positive control, W10 pattern); after End and the sweep, `WhiteboardEventBatch` = 0 and the harness listing is empty. **Red on an update-only refreeze** (no row to update, so the session reads as legacy and keeps the board). R1 |
| S7 | `PENDING session ended without Start: the live record at End decides, and the End path writes the snapshot` | Parametrized over tutor End (`endWhiteboardSession`) and the shared stale stamp (`endStaleWhiteboardSession`; the reaper is covered by G2). Family sets whiteboard off after create; End; assert the snapshot row exists (written at End, `[cns] frozen_at_end`), `boardPurgeRequestedAt` set, and the purge reads **the same row** (the sweep predicate selects it). Control arm: whiteboard on, no intent. R1 |
| S8 | `Start racing End on a PENDING session: the snapshot equals the live record at the moment the winning transaction committed` | Two concurrent calls around a consent flip, repeated N times; whichever wins, the snapshot is one coherent read of the record, never a mix; End winning leaves a session that cannot then be Started. R1 |
| S9 | `no consent record: online Start is refused, the reason is visible, session stays PENDING with no snapshot and no recording` | Tags `@wb-consent @wb-presence`. Seed a PENDING session with no `ConsentRecord` (and no snapshot). Online Start stays disabled and the reason is visible on the Start control (decision 6; today's message is `CONSENT_RECORD_REQUIRED_MESSAGE`, `consent-scope.ts` 353–354). Oracle: DB `sessionPhase` stays `PENDING`; no `SessionConsentSnapshot` row; no recording blobs and no `SessionRecording` rows. Andrew 2026-10-29 16:23 |
| S10 | `no consent record: in-person Start is refused, the reason is visible, session stays PENDING with no snapshot and no recording` | Same as S9, mode in person. Tags `@wb-consent @wb-presence`. Same oracle |

### 6c. Audio — tags `@wb-consent @wb-recording`

| # | Title | Oracle |
|---|---|---|
| A1 | `audio on: tutor and learner voices are both saved and transcribed (online)` | `TranscriptChunk` rows by `streamId` |
| A2 | `audio off, online: only the tutor's track is saved; learner voice is never transcribed` | No `speaker:*` rows in `SessionRecording` or `TranscriptChunk`; no learner upload request observed |
| A2b | `learner lane is not created before capability is known` | No lane recorder before the Start response is adopted |
| A3 | `audio off, in person: no audio is saved and the mic is never opened` | Spy count of audio `getUserMedia` = 0; no segments |
| A4 | `audio off, in person: waiting-room mic preview does not open the mic` | Same spy |
| A5 | `audio off: server rejects a learner-lane segment posted by a tampered client` | HTTP status + DB |
| A6 | `audio off: server transcription refuses a learner-lane chunk already in the outbox` | Queue route status; no `TranscriptChunk` |
| A7 | `audio on, in person: voices are captured on the tutor mic and transcribed` | Rows |
| A8 | `audio off: a swept or kicked learner chunk keeps its lane and is refused, not relabeled tutor:mic` | Stored `streamId` / `speakerId` unchanged after sweep and after `kickSessionChunksAction`; refused row status terminal |
| A9 | `transcript upsert never overwrites a stored lane` | Unit + DB: re-upsert with default args leaves `streamId`/`speakerId` as created |

### 6d. Mic openers (B4, D7) — tags `@wb-consent @wb-av @wb-recording`

| # | Title | Oracle |
|---|---|---|
| M1 | `in person, audio off: zero audio getUserMedia calls from waiting room through End` | Spy count = 0 |
| M2 | `in person, audio off: the top-bar mic control does not open the mic` | Spy count = 0 after click |
| M3 | `in person, audio off: the A/V permission prompt does not request the mic` | Spy count = 0 |
| M4 | `in person, audio off: the device picker and device swap do not open the mic` | Spy count = 0 |
| M5 | `flip to in person after the mic was open (online selected): the mic is released before Start` | Track `readyState === "ended"`; meter stopped |
| M6 | `camera still works after a skipped mic` | Video track live and audio track absent; `micAcquireSettled` true |
| M7 | `in person, audio off: the learner-side bootstrap opens no audio` | Learner spy count of audio constraints = 0; camera acquired |
| M8 | `online, audio off: the mic is still acquired for the live conversation but never recorded` | Positive control: spy count ≥ 1; no segments |
| M9 | `audio off, mode not yet chosen: mic acquisition is deferred` | Spy count = 0 until mode selected; then ≥ 1 for online, 0 for in person |
| M10 | `WebKit (iPhone 13) student: no audio request in an in-person audio-off session` | Spy on the WebKit project |

### 6e. Whiteboard — tags `@wb-consent @wb-sync @wb-strokes` (+ `@wb-assets` on W4, W12, W20)

| # | Title | Oracle |
|---|---|---|
| W1 | `whiteboard on: strokes persist and replay is available to tutor and family` | Replay HTTP 200 per principal |
| W2 | `whiteboard off: board works live, including a reload and a student rejoin` | Relay peer state; scene after reload |
| W3 | `whiteboard off: at End the stroke log, batches and checkpoints are deleted` | `WhiteboardEventBatch` count 0; harness listing has no `whiteboard-checkpoints/<id>/` keys; events URL serves an empty log |
| W4 | `whiteboard off: embedded image and PDF asset blobs are deleted at End` | Harness listing under `whiteboard-sessions/<studentId>/<sessionId>/` empty |
| W5 | `whiteboard off: no board snapshot image is stored or used in notes` | `snapshotBlobUrl` null; notes generation input has no image |
| W6 | `whiteboard off: tutor review shows the "board was not saved" state` | DOM |
| W7 | `whiteboard off: forced-end late upload cannot recreate the board` | Late POST refused (`acceptOrgForcedEndUpload` sets no `eventsBlobUrl`); a blob a stale client uploaded under the session prefix is gone after the sweep; **no URL is recorded anywhere** (R2) |
| W8 | `whiteboard off: a failed blob delete is retried by the purge sweep and boardPurgedAt is stamped` | Fault-injected delete; DB columns after each sweep; **uses the pass-2 backdate seam** (§ 3.3): sweep 1 fails and stamps `boardPurgeAttemptedAt`, sweep 2 passes pass 1, backdate, sweep 3 passes pass 2 and stamps `boardPurgedAt` |
| W9 | `whiteboard off: audio replay still works` | Audio scrubber 200 |
| W10 | `whiteboard off: batches exist before End and are gone after (positive control)` | Count > 0 before, 0 after; a purge test cannot pass on an empty store |
| W11 | `whiteboard off: a batch POST racing End leaves no WhiteboardEventBatch row` | **Zero rows asserted BEFORE any purge pass has run** (`boardPurgeFirstPassAt` still null), with the checkpoint hold seam parking the late batch between `assertActiveSession` and the transaction, so it is **red without the in-transaction re-check** (§ 3.4); 409 for the late batch; whiteboard-on control arm still writes it; then the backdate seam + sweep still shows zero |
| W12 | `whiteboard off: an asset PUT with a pre-End token that lands after End is removed by the second pass` | Token minted pre-End via the harness (with the explicit `validUntil`, § 3.3); PUT after End; listing **still has** the blob after pass 1 and **without the backdate** (negative arm: proves the delay is real); empty after the backdate seam + pass 2 |
| W13 | `whiteboard off: a client-uploaded events.json survives neither a failed End nor a closed tab` | Arm A: the End call fails after the upload (nothing from the client is trusted; the blob is under the prefix). Arm B: the tab closes and **no End ever arrives**: the reaper (§ 3.9, **depends on C4c**, APPROVED) ends the session after the idle bar and the sweep empties the listing. Harness listing empty after the sweep |
| W14 | `whiteboard off: stale end, forced end and org forced end each write a purge intent and purge` | Parametrized over the five stamp callers (`org-scope` ×2, `org-force-end-touch`, `endStaleWhiteboardSession`, the reaper); intent columns + listing |
| W15 | `whiteboard off: no IndexedDB checkpoint is written, and a leftover one is cleared at End` | IndexedDB contents via `page.evaluate`: no row for the session during the session; a pre-seeded checkpoint is gone after End and after the next workspace mount |
| W16 | `unknown capability does not purge and does not write a checkpoint` | Fault: snapshot unreadable → no deletes, intent retained, retry later; no IDB write |
| W17 | `sessions before this wave with a whiteboard-off snapshot are never purged` | Seeded old row: `boardPurgeRequestedAt` null; sweep leaves blobs and rows |
| W18 | `double End is a no-op and writes no second intent` | Second End returns idempotent; intent timestamps unchanged |
| W19 | `tutor-path whiteboard upload outside the session prefix, or after End on a whiteboard-off session, is refused at token mint` | HTTP error from the token route, two arms (prefix; `endedAt`); **prerequisite of C4b, ships first as C4a** (R2); red on today's code for both arms |
| W20 | `audio-only replay with the empty placeholder log scrubs to the audio length` | Scrubber max ≈ fixture audio duration (independent oracle: the fixture file's length) |
| W21 | `erasure behavior is unchanged after C0 (deleteBlob, listBlobsByPrefix) and after C4b` | The five existing erasure suites, listed by name in the PR note, run before and after **each** of C0 and C4b, unmodified (F1). No `enumerateSessionBoardBlobs` refactor exists any more (R2) |
| W22 | `crash between End commit and purge: the intent survives and the sweep finishes the job` | Kill the `after()` work (fault injection); intent present; sweep pass 1, backdate seam, sweep pass 2 stamps `boardPurgedAt` |
| W23 | `End or finalize with a foreign or audio URL as eventsBlobUrl never deletes that blob` | Seed an audio blob under `sessions/<studentId>/` and a blob under **another** student's session prefix; call End, `finalizeWhiteboardSessionFromBackend` and the forced-end accept with each URL as the events URL; run the sweep through both passes; assert both seeded blobs are **still in the harness store** and this session's own prefix is empty. **Red on any implementation that deletes by a URL it was handed** (R2) |
| W24 | `sync relay keeps no board state: a fresh client joining an emptied room gets first-in-room and no scene` | Relay probe (§ 3.10): after a session ended and every peer left, a new `socket.io` client joins the same room id on the local relay; it receives `init-room`, `first-in-room`, `room-user-change` and no scene payload. Independent of the relay source (F8) |
| W25 | `purge sweep is not starved: not-yet-due, unreadable-capability and persistently failing rows do not block an eligible row` | Seed more of each than `BOARD_PURGE_SWEEP_BATCH_LIMIT` plus one eligible row; one cron call purges the eligible row (F6); failing rows get `boardPurgeAttemptedAt` stamped and rotate |

### 6f. Notes — tags `@wb-consent @wb-recording`

| # | Title | Oracle |
|---|---|---|
| N1 | `notes off: no transcript rows and no drafted notes, even if audio is on` | `TranscriptChunk` = 0, `TutorNote` = 0 |
| N2 | `notes off, audio on: audio replay is still available` | Replay 200 |
| N3 | `notes off: manual generate-notes call is refused` | Server action result |
| N4 | `notes off: the transcribe sweep does not create transcripts` | Sweep run; rows |
| N5 | `audio off in person, notes on: no placeholder note is drafted` | `TutorNote` = 0 (the `totalChunks === 0` path) |
| N6 | `refused rows reach a terminal state and the sweep is not starved by them` | Seed more refused rows than the sweep batch; newer eligible rows still processed; refused status terminal; `notes-worker` does not wait on them |
| N7 | `org "no notes" session (notesForbidden): nothing is transcribed or drafted` | Rows = 0 even with all four toggles on |

### 6g. Replay per principal (B7, D4) — tags `@wb-consent @wb-assets @wb-presence`

For each of the four outcome shapes (full, audio-only, board-only, none) × principals tutor, self-learner, parent, child, share-link visitor, **and one unrelated signed-in family (must be denied)**:
- R1 `replay: {shape} is available to {principal}` — oracle: HTTP status of each replay URL plus DOM of the replay card ("audio scrubber only" for audio-only, board+audio for full, none link for none).
- R2 `replay: share link shows exactly what the family sees, nothing more` — compare the set of asset URLs reachable by token vs. by family.
- R3 `replay after consent revoked post-End: a recorded board is still replayable` — record with whiteboard on, End, then flip the live record off; replay still 200 (the frozen snapshot decides). Red today.
- R4 `replay after consent granted post-End: an unrecorded board stays unavailable` — the converse.
- R5 `all seven replay sites give the same answer for the same session` — table-driven across the loaders, learner/share/parent pages, the audio proxy, and the share proxy (HTTP/DOM per site; oracle is the brief's table, not `replay-access.ts`).
- R6 `legacy session without a snapshot keeps today's replay behavior`.
- R7 (APPROVED, Andrew 2026-10-29, Q1) `notes off: the review screen's "Share session" save releases the replay to the family`.
- R8 (APPROVED, Andrew 2026-10-29, Q1) `notes off: before "Share session" the family sees no replay`. If the tutor never finalizes, the family still has nothing to access.

### 6h. Visibility (both sides see what is off) — tags `@wb-consent @wb-chrome`

| # | Title | Oracle |
|---|---|---|
| V1 | `tutor sees which recordings are off before Start and during the session` | DOM text from literals in the spec (not the copy module) |
| V2 | `learner sees which recordings are off in the waiting room and in the session` | Same |
| V3 | `self-learner copy never says "your child"` | Grep over every consent surface DOM for the self-learner principal |
| V4 | `child consent screen shows each tutor/org separately` | DOM |

### 6i. Guards (cheap, fast, jest/grep)

- `consent single resolver`: no product file outside `consent-scope.ts` / the consent editor reads consent toggle columns, **and no file outside the allowlist calls `consentRecord.find*/count/aggregate`** (§ 2.1 table). Allowlist (exactly these, with the reason): `consent-scope.ts` (the one reader), `consent-write.ts` 76 (a version counter on the write path), and the parent editor page `account/children/[id]/consent/page.tsx` (the raw record the parent edits). **Both remaining direct readers are fixed, not allowlisted, in C1 (decided, with reasons in the § 2.1 table):** `claim/[token]/setup/page.tsx` 68 re-derives the owner inline, the exact fork E10/E11 are about, so an allowlist entry would be a standing second owner derivation; `child-consent.ts` 189 moves its read and `keepLatest` into `consent-scope.ts` as `readLatestConsentPerOwner` (behavior-preserving, pinned by `child-home.test.ts`). C7 changes only how the child screen presents the per-owner list.
- `lane literal guard` (C2a): no product file outside `session-capabilities.ts` contains the lane literals (`tutor:mic`, `speaker:`, `student:peer-`, the `:transcript` suffix) or calls `parseLane`/`isLearnerLane` implementations of its own; the six sites in § 2.3 import from it.
- `reaper is the fifth caller (G7)`: the reaper and the four existing callers all call the one shared `stampStaleWhiteboardSessionEnd`; grep guard that no other file writes `endedAt` with a stale/forced shape or calls `stampBoardPurgeIntent`/`freezeConsentSnapshotTx` outside the helper and the two End paths.
- `replay single decision function`: no replay decision site reads consent or snapshot columns outside `replay-access.ts`.
- `consent copy covers every switch effect` (§ 2.8).
- `capabilities truth table` unit test against the **brief's table typed as data in the test**.
- `isLearnerLane fails closed on unknown stream ids`; `parseLane classifies every stream-id format in the codebase`.
- `no alias survives`: grep that `deriveAudioCapturePolicy`, `resolveModeAwareAudioRecordingConsent`, `assertEffectiveConsent`, `resolveRecordedConsent`, `appointmentLiveEntryAllowed` have zero references after their wave.
- `[cns]` / `[slc]` / `[txc]` / `[tnt]` log lines are emitted (§ 8, observability).

### 6j. Red-before evidence, and coverage of the review's missing cases

Record, per test, the pre-change commit it fails on. Expected red today: E4–E7 (E6 especially), E15–E17, E12–E14, S1–S10, A2b–A6, A8, M1–M5, M7, M9, W3–W7, W10–W20, W22, W23, W25, N1, N3–N7, R3, R5, V1–V4, G1–G11. W21 and W24 are **characterization** tests (they pass today by design; W21 is the unchanged-erasure guard, W24 a relay probe): their red-before evidence is a deliberate break (a no-op `deleteBlob`, a relay stub that replays a scene), recorded in the PR note. Expected green today as controls: A1, A7, M8, W1, W2, W9, E9, R6.

Specific red-first notes (the four blockers): **S6** is red on an update-only refreeze; **W23** is red on any purge that deletes by a handed URL; **W11** is red without the in-transaction re-check because it asserts zero rows **before** any purge pass; **W19** is red on today's tutor upload route (no prefix guard, no `endedAt` refusal).

Coverage of the review's "Missing test cases": swept/kicked learner lane (A8); in-flight batch racing End (W11); late asset upload (W12); client `events.json` then failed End or closed tab (W13, and the reaper G1–G11); double Start and double End, ACTIVE flip no-op (S1, S2, W18); consent flipped between page load and Start (S3); replay after consent revoked post-End (R3); pre-wave sessions never purged (W17); zero audio `getUserMedia` across opener paths (M1–M4); camera after skipped mic (M6); IndexedDB checkpoint cleared (W15); unknown capability does not purge (W16); WebKit student `/join` with online off (E15); refused-row terminal state and unstarved sweep (N6, W25); relay stores nothing (W24); unclaimed-then-claimed (S6), PENDING ended without Start (S7), Start-vs-End race (S8); no consent record refuses online Start and in-person Start (S9, S10).

### 6k. Stale-session reaper (R3) — tags `@wb-consent @wb-presence` — **APPROVED (Andrew 2026-10-29, Q3)**

Spec: `tests/integration/wb-consent-reaper.spec.ts` (no relay needed for most rows; enrolled in `wb-regression`). The cron is driven through the route handler with the test `CRON_SECRET` (§ 6 infra). "Idle" is created by **seeding** the DB rows' timestamps (the DB oracle helper), never by waiting or by a product clock.

| # | Title | Oracle |
|---|---|---|
| G1 | `an ACTIVE session idle past the bar is ended by the cron, and an active one is not` | Seeded: A idle 25 h (no batch, no recording, no participant activity), B idle 23 h, C idle 25 h on its row but with a **recent batch**. After one cron call: A `endedAt` set; B and C untouched (positive controls) |
| G2 | `a PENDING session idle past the bar is ended and its snapshot is written at End` | Family set whiteboard off after create; after the cron: `endedAt` set, snapshot row exists (`frozen_at_end`), intent set, board purged after the sweep (S7's reaper arm) |
| G3 | `whiteboard-off reaped session: board purged; whiteboard-on reaped session: board kept` | Harness listing and batch counts, with a positive control before |
| G4 | `the reaper ends sessions with whiteboard on too (one End semantics)` | `endedAt` set for a whiteboard-on session; no intent; board data untouched |
| G5 | `a PENDING session with an appointment still in the future is not reaped` | Seeded appointment `endAt` in the future; session untouched after cron; reaped once the appointment is in the past |
| G6 | `reaping is idempotent and does not move endedAt` | Second cron call changes nothing; `endedAt` and intent timestamps identical |
| G7 | `reaper uses the one shared stamp helper` | Guard (§ 6i) |
| G8 | `a reaped session cannot be resumed, joined or checkpointed` | Checkpoint 409; `issueJoinToken` refused; open-session list omits it |
| G9 | `reaper batch is bounded and a failing row does not block the others` | More candidates than the batch; fault on one; the rest are ended in the run |
| G10 | `org session reaped before any forced-end read: notesForbidden unchanged, no late-upload window, a later touch is a no-op` | Row fields; `orgForcedEndUploadOpen` false; `touchOrgForceEndIfDue` leaves `endedAt` unchanged (§ 3.9 effect 6) |
| G11 | `after a reap, the tutor can open review and the manual generate action behaves as documented` | Settles the **UNVERIFIED** in § 3.9 effect 2: result recorded in the PR note and the effects table is updated to match |

---

## 7. Copy audit

**Every string below needs Andrew's approval before it ships.** "Current" is quoted from code on 2026-10-29. "Proposed" uses the glossary from `org-ux-pass-plan.md § Andrew answers (2026-10-28 evening) item 2` (term "online sessions"; "in person"; self-learner strings say "you"). If the glossary and a proposal disagree, the glossary wins.

### 7a. `src/lib/consent-toggle-copy.ts` (these strings become fields of the merged `CONSENT_SWITCHES`, § 2.2)

| Const | Current text (summary) | Proposed |
|---|---|---|
| `LIVE_SESSION_CONSENT_COPY` | Label says live sessions; description says the child can join live video and audio **and everything drawn is saved** | **Label:** "Allow online sessions". **parent:** "Your child can join online sessions with video and audio. In person sessions are not affected by this switch." **child:** "You can join online sessions. In person sessions are not affected." **self:** "You can join online sessions. In person sessions are not affected." |
| Whiteboard-saved sentence on the live switch | "Everything drawn on the shared whiteboard is saved" (also `ChildConsentSettings.CHILD_DESCRIPTION.allowLiveSession`) | **Delete from the online switch** (false when whiteboard recording is off). It belongs to the whiteboard switch. |
| `LIVE_SESSION_SCHEDULING_NOTE` | Scheduling sentence about live sessions being required for booking | "With online sessions off, online sessions cannot be started or joined. You can still meet in person." |
| `AUDIO_RECORDING_CONSENT_COPY` | Describes audio saved for notes | **parent:** "Session audio is recorded. If this is off, online sessions save the tutor's voice only, and in person sessions save no audio." **child/self:** same, "your voice". |
| `WHITEBOARD_RECORDING_CONSENT_COPY` | Describes saving whiteboard | "The board is saved and can be replayed. If this is off, the board still works during the session and is deleted from our servers when the session ends." |
| `SESSION_NOTES_CONSENT_COPY` | Describes notes | "Session notes are drafted from the audio. If this is off, nothing is transcribed and no notes are drafted." |
| `SELF_LEARNER_AUDIO_HELP` | Self-learner audio explanation | Update to the same two-mode sentence; "you", never "your child". |
| `SELF_LEARNER_AGREEMENT` | Agreement text | Check against the new recording rules; keep "you". |
| `CONSENT_DECLINE_WARNING.*` (title, `plain`, `pendingInvite`, `selfLearner`, `selfLearnerPending`) | Warns about not being able to start live | "Without online sessions on, you can still meet in person. Recording follows the other switches." Each variant keeps its audience. |
| `RECOMMENDED_CONSENT_NOTE` | Keep-on sentence for audio | Review: still true. |
| All four | No "applies to your next session" | Add one line under the editors: "Changes apply to the next session, not one already started." (D6/Q2, APPROVED Andrew 2026-10-29) |

### 7b. Other UI strings

| File | Current | Proposed |
|---|---|---|
| `ChildConsentSettings.tsx` 11–15 | Own copy for live and audio, "everything drawn … is saved" | Delete the fork (§ 2.7); use `CONSENT_SWITCHES` child audience |
| `ChildConsentSettings.tsx` 70 | "You can turn any of these off. A parent can turn one back on." | Keep; add "Applies to your next session." |
| `ParentConsentEditor.tsx` 63–76 | "Always block audio recording" / "Always block whiteboard replay … you cannot replay saved whiteboard sessions even when a tutor's setting above is on." | Whiteboard row: "Always block whiteboard recording. Boards are deleted from our servers when the session ends." ("replay" is wrong: the switch stops saving, not viewing). Audio row: "Always block audio recording. Online, the tutor's voice can still be saved; in person nothing is saved." |
| `ParentConsentEditor.tsx` 86–112 | "Live tutoring sessions", "Session audio recording", "Whiteboard recording", "Session notes" + "Your child turned this off. Turn it back on to allow it again." | Labels from `CONSENT_SWITCHES`. Sentence stays. |
| `SelfLearnerConsentSettings.tsx` 111 | Section "Session recording" using parent wording | Same `CONSENT_SWITCHES` with `self` audience |
| `WaitingRoomOverlay.tsx` | Online button hidden with no reason; auto-flip | Reason line from `ENTRY_BLOCK_COPY.live_off`; "Start in person" button; remove the flip |
| `WhiteboardWorkspaceClient.tsx` ~1621–1650 banner strings | Ad hoc | Replaced by the shared notice (§ 2.5), strings from `CONSENT_SWITCHES.effectWhenOff` |
| `/join` blocked page | "Your account does not have permission to join live whiteboard sessions" (verify exact text) | `ENTRY_BLOCK_COPY.live_off` family column |
| Review / replay empty states | "No board strokes recorded" / "No board content to replay." | Distinguish: "The board was not saved because whiteboard recording was off." vs "Nothing was drawn." (decided from the frozen capability, § 3.8) |
| Tutor review screen, notes off (Q1, APPROVED Andrew 2026-10-29) | Review step ends with the notes Save | Final button reads "Share session" when notes are off; releases the replay to the family. If the tutor never finalizes, the family has nothing to access |
| `ENTRY_BLOCK_COPY.live_off` (org-ux table) | Tutor: "Live sessions are off in {name}'s privacy settings." Family: "Live sessions are off in privacy settings." | Tutor: "Online sessions are off in {name}'s privacy settings. You can still meet in person." Family: "Online sessions are off in privacy settings." |

### 7c. `src/app/privacy/page.tsx` (last updated "October 12, 2026"; SYNCED FROM umbrella 2026-09-10 — these are **product-specific** sections, free to edit; bump the in-UI date and the top-of-file note per `docs/LEGAL-SYNC.md`)

| Lines | Current (quoted or summarized) | Problem | Proposed |
|---|---|---|---|
| 82 | "**Whiteboard session data:** timestamped stroke logs, optional PDF / image inserts, and a session snapshot used for the parent replay surface." | Says it is always kept | "…when whiteboard recording is on. When it is off, the board is deleted from our servers when the session ends." |
| 165 | Notes/replay shared with family "when you finalize a note" | Fine, but replay now depends on what was recorded | Add "what was recorded" |
| 264–268 | "When a whiteboard session is recorded, the audio is stored in Vercel Blob…" | OK | Keep |
| 270–276 | "Recordings are sent to OpenAI … for transcription as part of the note generation flow." | Omits that transcription only happens with notes on, and learner voice only with audio on | Add one sentence stating both conditions |
| 279–286 | "Online, if audio recording is off, the child's voice is left out of the saved recording. The tutor's microphone can still be saved and transcribed. In person, audio recording off saves nothing…" | **True after this wave** (today only partly: learner lane transcription not gated, lane identity lost on retry, in-person mic still opened) | Keep wording; the wave must make it true. Do not add "never" claims about a hostile tutor client (§ 2.3 documented limit). |
| 289–291 | Self-learner "can turn live sessions, audio recording, whiteboard recording, or notes off" | "live sessions" | "online sessions" |
| 293–295 | "If a whiteboard session was recorded, the signed-in parent or student can play that audio with the notes. There is no separate switch for including the audio." | Replay of the board is not mentioned; "with the notes" is false when notes are off | "The signed-in parent or student can play back what was recorded (audio, board, or both). Replay does not need notes to be on." |
| 360–372 | "Children": consent recorded before "a live session" | Wording | "before an online session"; add that in person sessions follow the same switches |
| 395–400 | Collected personal information list: "Session audio recordings… Session transcripts… Session notes…" | Missing the board data | Add "Whiteboard drawings, when whiteboard recording is on" |
| 457–460, 470–475 | "Turning a consent off stops that new collection." | Correct going forward | Keep; add the board-deletion sentence and "applies to the next session" |
| 484–490 | "Educational use by the tutor" | Mentions session recordings, transcripts and notes | Add the board |
| **New** | No statement about what each switch does | Gap | New short section "What each switch does" rendered from `CONSENT_SWITCHES.effectWhenOff` (§ 2.8) |
| **New** | No statement that the tutor and learner can see which recordings are off | Gap | One sentence |
| **New (D1) — what "deleted" means** | Nothing about device data or backups | Honesty hard rule: "deleted when the session ends" would overclaim | Say exactly: when whiteboard recording is off, the board is **deleted from our servers** when the session ends, shortly after (a short follow-up pass removes anything uploaded in the last moments). **Device data:** the tutor's browser keeps a temporary copy for the open tab only and does not save a recovery copy for that session. **Backups:** the database keeps point-in-time history for a limited period (Neon), and blobs deleted from Vercel Blob can remain retrievable for a limited period by how its storage and caching work. Write the real periods once confirmed. |
| **New (R3) — sessions that are not ended** | Nothing | **APPROVED (Q3):** "A session that has been idle for a day is ended automatically, and the board deletion above then applies." The decline wording is historical (§ 3.9) and does not ship. Never "after the session" |
| **New (F8) — the sync relay** | Nothing about live-drawing transit | **Only after the C0 relay read and W24 confirm** (§ 3.10): "While you draw together, the drawing passes through our sync server encrypted, and the sync server does not store it." If the read finds log or other retention, state exactly that instead. Not shipped on assumption |
| **Honesty (hard rule)** | Retention claims | "We do not retain children's personal information indefinitely" (line ~446) next to "Automated retention schedules may be introduced" — existing text; **not** in this wave's scope, but the board deletion is the first automated deletion. Do not describe it as a general retention policy. | Describe only the board deletion exactly |

**UNVERIFIED before C8 writes the numbers:** the production Neon project's point-in-time history window (read it with the Neon MCP `describe_project`, a read-only call) and Vercel Blob's documented delete and cache behavior for this private store. Copy states the figures only once read; until then it states that a limited period exists and does not guess.

### 7d. `src/app/terms/page.tsx`

| Lines | Current | Proposed |
|---|---|---|
| 195–230 "Children and parental consent" | "…consent is recorded in that Mynk account before a live session…" "Online, if audio recording is off, the tutor's microphone can still be saved…" | "online session"; add in-person line; add board deletion when whiteboard recording is off |
| 99 | "Record session audio or share whiteboard / audio replays without obtaining appropriate consent" | Fine |

Both pages: re-confirm that no sentence promises something this wave does not implement (`legal-honesty.spec.ts`).

---

## 8. Waves and commits

**Dependency: org W1 (the org-leak fix), then org W4 (the pure `sessionEntryState` rule with the mode dimension, plus its Start and bridge callers), then this wave's Start- and entry-touching waves (C3a onward).** C0 may run after org W1. **C1, C2a and C2 run strictly serial with org W4, not in parallel with it** (they share `actions.ts`; two agents editing it at once is the Wave A clobber): default order **W4, C1, C2a, C2, then C3a**. Entry is org W4's `sessionEntryState` only; this wave defines no entry rule. **C4c (the reaper) is APPROVED (Andrew 2026-10-29, Q3) and W13's closed-tab arm depends on it.** All on a new branch off the integrated tip. Each commit: Playwright for its rows first (red), then implementation, then green. Commit on the branch and push (AGENTS convention). Windows: commit messages via `-F` temp file, then delete in a separate call.

| Wave | Content | Tests that must go green | Gate (`test-selection.mdc`) | Tier (execute / review) |
|---|---|---|---|---|
| **C0** | **Shared test infra first (D9):** blob-harness list-by-prefix, delete, fault injection; `deleteBlob` routes to the harness; one `listBlobsByPrefix`; `getUserMedia` spy and DB oracle helpers (**incl. `backdateBoardPurgeFirstPass`**); the **checkpoint hold seam**, the **cron driver** and the **relay probe** (§ 6 infra); a read-only **relay source read** at the pinned SHA, recorded in `docs/PLATFORM-ASSUMPTIONS.md` § 5.1 (§ 3.10). Spec skeletons with every § 6 test as `test.fixme` (un-fixme per wave). `@wb-consent` tag + `wb-test-select.cjs` mapping. `[cns]` and the new `slc`/`txc`/`tnt` actions in the AGENTS.md registry. WebKit project enrollment for the student specs. | Harness self-tests; W24 (relay probe) | `npx jest` (harness) + `npm run test:wb-affected`; `npx next build` (touches `blob.ts`); **the five pinned erasure suites, unmodified and green (F1), because C0 changes `deleteBlob` and the two `list` call sites erasure uses** | Grok / Sonnet verify (`blob.ts` is production code) |
| **C1** | **Consent-scope.** Merge `CAPABILITY_TABLE` into `CONSENT_SWITCHES` (one switch table). `deriveSessionCapabilities` + `resolveSessionCapabilities` (snapshot, or live while PENDING); replace the one client call site and the four server callers; **creates `session-capabilities.ts`** (the home of `deriveSessionCapabilities` / `resolveSessionCapabilities` and, from C2a, the lane code); **fixes `claim/[token]/setup/page.tsx` 68** (reads through the resolver) and **`child-consent.ts` 189** (read and `keepLatest` move into `consent-scope.ts` as `readLatestConsentPerOwner`, behavior-preserving); neither is allowlisted (§ 2.1, § 6i); carries **no `entry` field** (entry is org W4's `sessionEntryState`); **delete** `deriveAudioCapturePolicy`, `modeAwareAudioDecision`, `resolveModeAwareAudioRecordingConsent`, `assertEffectiveConsent`, `resolveRecordedConsent` (no alias). `notesForbidden` folded in. **Fix `org-learner.ts` child-floor bug (E17 red first).** Pure unit tests. | Truth table unit, copy-coverage, single-resolver guard (widened), E17, A2b skeleton | `test:wb-affected:run` incl. `@wb-consent @wb-recording @wb-presence @wb-sync`; jest consent + recording; `npx next build` | **Sonnet** (design + review); executor Sonnet; never Composer |
| **C2a** | **ADDED (veto-able): lane identity, alone.** `parseLane` / `isLearnerLane` (unknown fails closed) in `session-capabilities.ts`, **absorbing every lane builder and parser**: `lifecycle-machine.ts` 788, `remote-stream-recorder.ts` 61, `upload-outbox-instance.ts` 137 and the three server-side copies (§ 2.3 table). Literal guard (§ 6i). `lifecycle-machine.ts` is a fragile surface, so these edits are the **Opus-tier** part of the wave; behavior-neutral, red-before on the fails-closed and literal-guard tests only | A9 (unit), lane literal guard, `parseLane` classifies every stream-id format | `test:wb-affected:run` + `@wb-recording @wb-av @wb-presence @wb-sync`; jest recorder + outbox | **Opus** exec (lifecycle FSM, outbox, A/V lane builders); Sonnet verify. **Plan-mode step-back required** |
| **C2** | **Server lane + notes gates** (after C2a). Segment registration, chunk enqueue, queue route, kick, sweep, worker re-check; **transcript upsert never overwrites lane**; kick/sweep pass lane; **`"refused"` added to `TRANSCRIPT_CHUNK_STATUSES` and `"skipped"` to `TUTOR_NOTE_STATUSES`** (`transcript-types.ts` 20–26; neither is in the lists today), with the **`TutorNotesSection` skipped-state branch** so a skipped tutor note renders (and does not spin); notes off gates every entry; `notes-worker` placeholder; `LANE-LABEL-TRUST` in BACKLOG | A2, A5, A6, A8, A9, N1–N7 | `test:wb-affected:run` + `@wb-recording @wb-presence @wb-sync` (or full `test:wb-sync`) | **Sonnet** exec; Sonnet independent verify (fragile surface #2) |
| **C3a** | **Start refreeze (needs org W4 merged).** Shared `startSessionTx`; **the refreeze is an UPSERT through the single `freezeConsentSnapshotTx` helper** (R1), inside the conditional PENDING→ACTIVE update on both paths, no-op when ACTIVE, returns capabilities; **create (`create-session-core.ts`) switches to the same helper** so snapshot writes have one writer; **the PENDING-End snapshot write** (`endWhiteboardSession` and the shared stamp, in-tx phase read) lands here so C4b's intent reads it; `[cns]` before/after incl. `created=` and `frozen_at_end`. **No-record Start (Andrew 16:23):** the refusal already runs on both modes and both ownership paths (§ 2.6), so C3a adds no second existence check. It does make the disabled Start show the reason (decision 6). Invariant: a session that reaches ACTIVE has a snapshot row; legacy snapshot-less rows are not backfilled | S1–S10 | `test:wb-affected:run` + `@wb-presence @wb-sync`; full sync at merge. S9/S10 are `@wb-consent @wb-presence` | **Sonnet** design + review; exec Sonnet or Opus |
| **C3b** | **Client mic and adoption.** Client adopts Start's capabilities before arming; `micAcquire` gate on every opener; defer / release / always-settle; learner bootstrap; IndexedDB checkpoint gated on `persist` (never written when off or unknown) | A2b, A3, A4, M1–M10, W15 (write half) | `test:wb-affected:run` + `@wb-recording @wb-av @wb-presence @wb-sync` (or full `test:wb-sync`); WebKit rows | **Opus** (A/V transport + effect wiring; reliability-floor override). **Plan-mode step-back required.** Sonnet verify |
| **C4a** | **Prerequisite: tutor-path upload guards (W19).** Prefix guard (`whiteboard-sessions/<studentId>/<sessionId>/`) and `endedAt` refusal at token mint on the tutor path of `api/upload/blob/route.ts`. Own commit, own gate: an auth-boundary change, and the prefix-only purge is only complete if this holds (R2) | W19 | `test:wb-affected:run` + `@wb-assets @wb-sync`; `npx next build` | **Sonnet** design + review (auth boundary); exec Sonnet |
| **C4b** | **Board purge (Pillar 3 contents; needs C0, C3a, C4a).** Migration (§ 5, four columns, **Andrew's go for prod**); `stampBoardPurgeIntent` (no URL argument) in End + `stampStaleWhiteboardSessionEnd`; `runBoardPurge` **prefix-only**, two-phase via `after()` and a separate purge sweep on the same cron with the § 3.3 predicate and `boardPurgeAttemptedAt` order; `BLOB_UPLOAD_TOKEN_LIFETIME_MS` set as `validUntil` and feeding `BOARD_PURGE_SECOND_PASS_DELAY_MS`; batch-transaction `endedAt` re-check; checkpoint refusal; `finalize…` skip; forced-end gating (no URL recorded); `docs/PLATFORM-ASSUMPTIONS.md` (token lifetime, sweep, relay finding). **No `enumerateSessionBoardBlobs` refactor** | W3–W18, W20–W25 | **Full** `test:wb-sync` (Pillar 3) + jest + `npx next build` + **the five pinned erasure suites** | **Opus** exec; Sonnet design review before coding, Sonnet verification after |
| **C4c** | **Stale-session reaper (APPROVED, Andrew 2026-10-29, Q3).** `runStaleSessionReaper` on the existing cron, shared stamp as the fifth caller, `SESSION_ENDED` `path: "reaper"`, `[slc] session_reaped`; no migration. Ends every session idle 24 h; the whiteboard-off purge follows. The decline fallback in § 3.9 is historical and does not ship. `WB-IDLE-STILL-THERE` is out of scope | G1–G11, W13 arm B, W14 reaper arm | `test:wb-affected:run` + `@wb-consent @wb-presence @wb-sync`; full `test:wb-sync` at merge | **Opus** exec (ends sessions on a live surface; fragile stamp helper); Sonnet design review before and verification after |
| **C5** | **Entry: remaining callers (D3).** `/join` for every principal, `issueJoinToken`, waiting room (no flip, "Start in person"), resume, org-learner list, student-page button; delete leftover entry checks; one denial-copy table | E1–E16 | `test:wb-affected:run` + `@wb-presence @wb-sync`; full sync at merge | **Sonnet** design + review (auth boundary) |
| **C6** | **Access boundary: one replay-access function (D4)** for the seven sites; frozen snapshot only after End; legacy rule kept inside; Q1 "Share session" review save (APPROVED, Andrew 2026-10-29); if the tutor never finalizes, the family has nothing to access; empty-state copy | R1–R8, W6, W20; **deletes the loader reads** (`loadWhiteboardReplayIdsForNotes.ts` 181, 197 and its second `keepLatest` copy, per the § 2.1 table; the replay decision goes through `replay-access.ts`) | `test:wb-affected:run` + `@wb-assets @wb-presence`; `npx next build` | **Sonnet or Opus, never Grok**; Sonnet independent verify |
| **C7** | Shared notice (`SessionEntryBlocked` `kind`), child per-owner screen, remove forked copy; all § 7a/7b strings **after Andrew approves them** | V1–V4, E-copy; **presentation only** for the per-owner child screen (the `child-consent.ts` read was fixed in C1) | `test:wb-affected:run`; visual spec for legal pages | Grok / Sonnet verify |
| **C8** | Privacy + Terms edits (after approval; Neon/Blob figures confirmed first); `LEGAL-SYNC.md` dates; AGENTS.md hard-won lesson if any | `legal-honesty.spec.ts` | Static pages gate | Grok / Sonnet verify (honesty) |
| **C9** | Close-out: remove `.fixme`s, `no alias survives` guard, final grep-clean; **no alias deletions left to do** (each was deleted in the wave that replaced it) | Whole matrix | **Merge to integration/master: full** `test:wb-sync` + `test:regression` + `npx next build` | Grok |

Independent verification (agentic-verification-pipeline.mdc): every wave is followed by a separate reviewer dispatch (tests-to-spec, soundness, no duplication). C1–C6 reviews are `claude-sonnet-5-5-high` readonly.

**New logging.** Reuse `cns` (consent decisions), `slc` (board purge), `txc` (transcription refusals), `tnt` (notes refusals), `wtr` (waiting room mode choice). No new prefix. New actions to log:
- `[cns] wbsid=<id> action=capabilities_resolved audio=<mode> wb=<persist> notes=<draft> online=<bool> mic=<yes|defer|no> source=snapshot|live`
- `[cns] wbsid=<id> action=refrozen_at_start changed=<keys|none> created=<bool> before=<toggles|none> after=<toggles>`, `action=refreeze_skipped reason=already_active`, and `action=frozen_at_end source=end|stale|reaper before=none after=<toggles>` (PENDING ended without Start)
- `[cns] action=entry_denied surface=start|open_room|resume|join|schedule principal=<type> reason=<EntryBlockReason> mode=online|in_person`
- `[cns] wbsid=<id> action=learner_lane_refused surface=segment|chunk|queue|kick|sweep streamId=<id>` and `action=lane_mismatch stored=<id> input=<id>`
- `[cns] wbsid=<id> action=replay_access audio=<bool> board=<bool> source=snapshot|legacy principal=<type>`
- `[txc] wbsid=<id> action=refused reason=audio_off|notes_off|notes_forbidden`
- `[tnt] wbsid=<id> action=skip reason=notes_off|no_audio|notes_forbidden`
- `[slc] wbsid=<id> action=board_purge_intent source=end|stale|forced|reaper` (no URL count; R2)
- `[slc] wbsid=<id> action=board_purge_pass1_done rows=<n> blobs=<n>` / `board_purge_pass2_done rows=<n> blobs=<n>` / `board_purge_done`
- `[slc] wbsid=<id> action=board_purge_blob_failed urlHash=<h>` / `board_purge_skipped reason=capability_unreadable|capability_persist` / `board_purge_stuck ageMin=<n>` (every sweep once the intent is older than 24 h)

---

## 9. Adversarial review — reliability blindspots

Axes from the real bar: [`../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../../../agenticPipeline/.cursor/rules/reliability-bar.mdc) (data durability; clock + ordering; race conditions on user input; cross-platform parity; observability). The first draft used the five axes as the org plan paraphrases them, which are different (B8); this section replaces it. Privacy/access, silent failure and data integrity concerns from the first draft are kept as risks under the axis they belong to.

**Sarah-trust framing.** Sarah must be able to turn a switch off and believe it: nothing recorded that she switched off, a board she never wanted kept actually gone, and a session that never loses her work when she wants it kept. If a tutor needed a backup recorder to be sure a switched-off thing was off, this wave is not done.

Ranked by reliability impact; every `[BLOCKER]` is folded into wave acceptance in § 9f, not listed and left.

### 9a. Axis 1 — Data durability

1. **[BLOCKER] DUR-1 End commits but the purge never runs (request dies, function killed, tab closed).** Intent (`boardPurgeRequestedAt`; no URLs, R2) is written inside the End transaction and the shared stale stamp, after the PENDING snapshot write (R1); the purge sweep runs from the intent, not from a request. Acceptance: W13, W14, W22, S6, S7.
2. **[BLOCKER] DUR-2 A client-uploaded `events.json` is not referenced by the row and survives (review B1).** The purge deletes **by session prefix only** (R2): the client-uploaded events blob is under that prefix, and the **tutor-path prefix guard (W19, prerequisite C4a)** is what makes "everything is under the prefix" true. No URL from a request or a row is ever a delete target, so a foreign or audio URL cannot be deleted (W23). Acceptance: W13, W19, W23.
3. **[BLOCKER] DUR-3 In-flight batch or asset write after End leaves board data (review B2).** Batch transaction re-checks `endedAt` under a row lock; token mint refuses after End; pass 2 removes what a pre-End token still lands; the sweep removes rows as well as blobs. **W11 asserts zero rows before any purge pass, through the hold seam, so it is red without the in-transaction re-check (R4).** Acceptance: W11, W12.
4. **[BLOCKER] DUR-4 Unreadable capability must never purge.** A purge on a misread capability would delete a board the family was promised. `runBoardPurge` re-reads the frozen snapshot and deletes nothing, retrying, if it cannot read it or it says `persist`. Acceptance: W16.
5. **[BLOCKER] DUR-5 Purge must not hit data we meant to keep.** `persist === true`, legacy sessions with no snapshot, and sessions before this wave never get an intent; audio lives under a different prefix; the assembled-events path is never prefix-deleted; **nothing is deleted by a URL the purge was handed** (W23). Acceptance: W1, W17, W9, W21, W23.
6. **[BLOCKER] DUR-6 Device-side copies: the IndexedDB stroke-log checkpoint and the `sessionStorage` scene draft (review B1, D1).** Never written when `persist` is false or unknown; leftover cleared at End and on the next mount. Acceptance: W15, W16.
7. **[BLOCKER] DUR-7 Learner-lane chunks must not be lost or relabeled by retries (B3).** Upsert never overwrites lane identity; kick/sweep pass lane. Acceptance: A8, A9.
8. **[BLOCKER] DUR-8 Sessions that never end (R3).** A closed tab or a forgotten End leaves `endedAt = null`, so no purge intent is ever written and the board stays. **APPROVED (Andrew 2026-10-29, Q3).** The stale-session reaper (§ 3.9, C4c) ends every session idle 24 h through the shared stamp, and the purge follows for whiteboard-off ones. The decline fallback in § 3.9 is historical and does not ship. An "are you still there?" prompt is out of scope (`WB-IDLE-STILL-THERE`). Acceptance: G1–G11, W13 arm B.
9. **[BLOCKER] DUR-9 The sweep must not starve (F6).** Rows that cannot progress (delay not elapsed, unreadable capability, persistently failing) must not occupy the batch. Acceptance: W25.
10. Crash / OOM / refresh / background / sleep, session with whiteboard **off**: live reload hydrates from server batches; up to about one second of strokes (`SERVER_PERSIST_INTERVAL_MS`) can be lost on a crash because there is no IndexedDB tail. Accepted by D1 (no recording to recover); stated here as the explicit failure mode. Whiteboard **on** is unchanged. Crash mid-End: the intent is in the transaction or it is not (atomic); the End retry is idempotent (W18).
11. Network drop at End: unchanged for audio (outbox, Pillar 2). For the board, the purge is by prefix, so it does not matter whether the End call or its URLs arrived (W13). Pass 2 covers late PUTs (W12).
12. Refusal rows that sit `pending` forever (starvation) — covered by N6; rated BLOCKER under DUR-7's acceptance because a starved sweep silently stops transcribing other sessions.
13. Follow-up (no BLOCKER): a board blob outside the session prefix (impossible for new tutor uploads after C4a; the placeholder events blob holds no board content) is reachable only by the `blb` CLI. BACKLOG `EVENTS-URL-VALIDATE`: End still accepts any `http(s)` URL as the final events URL (§ 1c item 19); the purge no longer depends on it, but the field should be validated.
14. **Sync relay (F8, no BLOCKER).** No evidence it stores board state; the one thing the repo cannot settle is the upstream source and its debug logging (§ 3.10). Settled by the C0 read and W24; copy waits for it.
15. **[BLOCKER] DUR-10 Every session that reaches ACTIVE has a `SessionConsentSnapshot` row (Andrew 2026-10-29 16:23).** No consent record at Start: the session cannot start, online or in person, and the disabled Start shows the reason. The Start upsert writes the row when create skipped it. Legacy snapshot-less rows are left as they are and are not backfilled. Acceptance: S9, S10, and the upsert path S6.

### 9b. Axis 2 — Clock + ordering correctness

Single source of truth for `t`: **server time (`now()` on the server) for every consent/purge ordering decision.** Audio replay time stays the `MediaRecorder` elapsed clock (unchanged; this wave touches nothing there).

1. **[BLOCKER] CLK-1 Capability must be known before any recorder, lane, mic or checkpoint arms.** Ordering: Start's transaction commits the refreeze → returns capabilities → client adopts → client arms. A client acting on page-load capabilities after Start was requested is the bug (B5). Acceptance: S3, A2b.
2. **[BLOCKER] CLK-2 End vs a racing batch write.** The row lock in the batch transaction orders the two; without it a batch that passed the check can land after the End transaction's delete (B2). Acceptance: W11.
3. **[BLOCKER] CLK-3 The second purge pass is timed from the server clock and the token lifetime.** The delay constant is derived from the **same** `BLOB_UPLOAD_TOKEN_LIFETIME_MS` that C4b passes as an explicit `validUntil` (verified: the `@vercel/blob` 2.3.3 default is one hour, `client.d.ts` 349/383, and `validUntil` has no hit in `src/`), plus the flush window and a margin; one constant feeds both, so they cannot disagree. Acceptance: W12 (including its no-backdate negative arm), plus a jest test that the delay constant is ≥ the token lifetime + flush window and that the token route passes that lifetime.
4. **[BLOCKER] CLK-4 Replay clock with an empty placeholder log plus audio.** `computeReplayTotalMs` already prefers audio length when `hasAudio`; the component path is UNVERIFIED. Acceptance: W20.
5. Consent versions: the snapshot records `consentRecordVersion`; the refreeze logs before/after; after End only the snapshot is read (R3/R4), which removes a whole class of "live record changed under a finished session" ordering bugs.
6. Follow-up: `frozenAt` is overwritten by the refreeze; the create-time value is kept only in the log line. If an audit trail is later required, add a column; not needed for the locked rules.

### 9c. Axis 3 — Race conditions on user input

1. **[BLOCKER] RACE-1 Double Start / two tabs / Start double-click.** The refreeze runs only when the conditional update changed a row; a second Start is a no-op and does not refreeze. Acceptance: S1, S5.
2. **[BLOCKER] RACE-2 Double End / End double-click.** Second End is idempotent and writes no second intent (the stamp helper already does not move `endedAt` twice; the End path must match). Acceptance: W18.
3. **[BLOCKER] RACE-3 Consent flipped between page load and Start** (parent or child flips while the tutor's page is open). Acceptance: S3, E12, E13.
4. **[BLOCKER] RACE-4 Waiting-room mode toggled (online ↔ in person) while the mic acquire is in flight.** The gate is evaluated on each change; an in-flight acquire for a mode that became `no` is cancelled and its tracks stopped; `micAcquireSettled` still settles. Acceptance: M5, M6, M9.
5. **[BLOCKER] RACE-5 A late consent change must not alter a running session.** ACTIVE reads the snapshot only. Acceptance: S2.
6. Rapid Start (in person) after Start (online) attempt: server refuses the second via the conditional update; client shows the one reason line, not a flip (E2, E3).
7. Two tutor tabs: capability is read server-side per request; no client-held authority (S1).
8. Browser back/forward bypassing the blocked page: the server check at `/join` does not depend on the client navigation (E6, E7).
9. Follow-up (no BLOCKER): mic permission prompts racing a tab switch are the existing `chainDeviceAcquire` territory; this wave adds no new acquisition path outside the gate.

### 9d. Axis 4 — Cross-platform parity (tested vs assumed)

| Platform | Status for this wave |
|---|---|
| Desktop Chrome (Playwright, relay harness) | **Tested**: all matrix rows |
| WebKit via Playwright (iPhone 13), **student** side | **Tested** (approximate engine, per the 2026-10-11 lesson; not identical to real iOS): E15 (`/join` with online off), M7/M10 (no audio request in an in-person audio-off session), the learner bootstrap |
| Real iOS Safari (Sarah's iPad fallback) | **Assumed**: hardware smoke row only for what WebKit cannot reproduce (permission prompts, real mic indicator). Never a reason to skip the WebKit rows |
| Android Chrome | **Assumed** (Chromium behavior; no new platform-specific API is used) |
| Firefox | **Assumed**; the mic gate uses the same `getUserMedia` surface |
| Safari macOS | **Assumed**; WebKit rows approximate it |

1. **[BLOCKER] PAR-1 The learner on an iPhone must not be prompted for the mic in an in-person audio-off session, and must not be admitted to an online session that is off.** Acceptance: M7, M10, E15.
2. **[BLOCKER] PAR-2 The camera must still work on every platform when the mic is skipped** (the `micAcquireSettled` coupling is cross-platform). Acceptance: M6 on desktop and WebKit.
3. Follow-up: real-device confirmation of the mic indicator not lighting is a hardware smoke row, tracked in the smokebook, not a regression re-proof.

### 9e. Axis 5 — Observability

Per-session IDs: `wbsid=` on every line; prefixes `cns`, `slc`, `txc`, `tnt`, `wtr` (§ 8, no new prefix). `[cns]` is added to the registry in C0.

1. **[BLOCKER] OBS-1 Purge state must be diagnosable from logs and one SQL query in 10 minutes.** `board_purge_intent`, `pass1_done`, `pass2_done`, `board_purge_done`, `board_purge_blob_failed`, `board_purge_skipped`, `board_purge_stuck` carry `wbsid`; the four purge columns (`boardPurgeRequestedAt`, `boardPurgeFirstPassAt`, `boardPurgeAttemptedAt`, `boardPurgedAt`) answer "where is this session's purge" without logs; the reaper logs `session_reaped` (§ 3.9) and `board_purge_stuck` also reports intents the sweep predicate excludes. Acceptance: W8, W14, W22 assert the log lines and the columns.
2. **[BLOCKER] OBS-2 Every refusal is attributable.** `entry_denied`, `learner_lane_refused`, `lane_mismatch`, `[txc] refused`, `[tnt] skip` name the surface and reason. A refusal that logs as `error` (so it pages) or not at all (so it is invisible) is a defect (the first draft's "S4", about outbox rows marked failed-forever). Acceptance: guard test that the lines are emitted; N6 asserts `refused`, not `error`.
3. **[BLOCKER] OBS-3 A stuck purge must surface.** `board_purge_stuck` fires each sweep once the intent is older than 24 h. Acceptance: W8 (fault held across sweeps) asserts the line.
4. No PII in logs; blob URLs are hashed (`hashBlobUrlForLog` exists in the erasure code).
5. The capability each session ran under is one line (`capabilities_resolved`) plus the refreeze before/after, so "why did session X not record audio" is answerable without re-prod.

### 9f. Acceptance criteria folded in (all BLOCKERs)

A wave is **not DONE** unless its rows pass **and** the independent reviewer signs off on each. The feature is not DONE until all of the following pass:

| BLOCKER | Tests |
|---|---|
| DUR-1, DUR-2 | W13, W14, W19, W22, W23, S6, S7 |
| DUR-3, CLK-2 | W11 (zero rows before any purge pass), W12, S8 |
| DUR-4 | W16 |
| DUR-5 | W1, W9, W17, W21, W23 |
| DUR-6 | W15, W16 |
| DUR-7 | A8, A9, N6 |
| DUR-8 | G1–G11, W13 arm B |
| DUR-9 | W25 |
| DUR-10 | S6, S9, S10 |
| F8 (relay) | W24 + the C0 source read recorded in `docs/PLATFORM-ASSUMPTIONS.md` |
| CLK-1 | S3, A2b |
| CLK-3 | W12 (both arms) + delay-constant and token-lifetime jest |
| CLK-4 | W20 |
| RACE-1, RACE-2, RACE-3, RACE-5 | S1, S2, S3, S5, W18, E12, E13 |
| RACE-4, PAR-2 | M5, M6, M9 |
| PAR-1 | M7, M10, E15 |
| OBS-1, OBS-2, OBS-3 | W8, W14, W22, W25, N6, G1, log-emission guard |
| Privacy/access carried over from the first draft | P1 E6/E7; P2 A2/A5/A6/A8; P3 E10/E11 + single-resolver guard; P4 R2 and the replay guard; P5 V3; P6 R1 unrelated-family row; P7 A4/M1 |

---

## 10. Review disagreements

The review was right on every blocker. Where I checked a claim against code and it was incomplete or off, this is the evidence. None changes a decision.

1. **B1, "the IndexedDB checkpoint is not cleared … garbage-collected only when the same session URL is reopened."** Partly wrong. The normal End path **does** clear it: `markPersisted` (`useWhiteboardRecorder.ts` 1465–1470) is called from `WhiteboardWorkspaceClient.tsx` ~4695 right after End. Reopening the ended session's URL clears it (1360–1362), and opening any workspace for the same student clears that student's latest ended-session checkpoint (1396–1412), not only the same session. The review's conclusion still holds for the paths that matter: stale/forced End by another actor, a crashed or closed tab, and a tutor who never reopens that student's workspace leave the full board on the device. D1 supersedes with "never written". I also found a second device copy the review did not name, the `sessionStorage` scene draft (§ 3.7).
2. **B2, "asset uploads have no `endedAt` guard (`route.ts:210-215`)."** True for the **tutor** path only. The student join-token path and the learner path both refuse an ended session at token mint (`whiteboard-scope.ts` 160–162, 201). The remaining gap is a token minted before End that is used after it, plus the tutor path, which also lacks the pathname-prefix check the other two have. § 3.4.
3. **B1, "the assembled blob … is not enumerable."** It is enumerable by prefix, but the prefix `whiteboard-sessions/<adminUserId>/<studentId>/` is shared across every session of that student, so it must never be prefix-deleted. The review's remedy (skip assembly when `persist` is false) is right and is what § 3.5 does.
4. **B4, "the learner-side bootstrap opens mic and camera with no consent check."** True, but for an **online** session the learner's mic is legitimately needed for the live conversation even when audio recording is off (only recording/transcription is off). So the learner gate is mode-based (`micAcquire`), not a blanket consent check. D7's "gate every opener, including the learner-side bootstrap" is satisfied by the shared gate returning `yes` in LIVE.
5. **SHOULD-FIX, "the notes sweep takes the oldest 10 pending rows … refused rows left pending starve newer rows."** Correct, and it is worse than the review says: the **chunk** sweep (`findStaleTranscriptChunksForSweep`, `updatedAt asc` + `take`) has the same shape, so refused chunks starve it too. Both are fixed by the terminal states (§ 2.3).
6. **Missing tests.** None of the fourteen was wrong. One is deliberately not a test: the **tampered-label limit** (B3) is documented, with a `docs/BACKLOG.md` entry, not asserted. A test that proves a limit exists would be theater, and the privacy copy does not claim more than the client and server paths guarantee.

---

## 11. Open questions for Andrew (only those that block)

1. **Q1 — APPROVED (Andrew 2026-10-29 16:20).** Replay entry when notes are off. Notes off keeps the tutor review step, and the review screen ends with a **"Share session"** save that releases the replay to the family, same as notes today. If the tutor never finalizes, the family has nothing to access. No longer blocks C6 or tests R7/R8.
2. **Q2 — APPROVED (Andrew 2026-10-29 16:20).** Consent changes are forward only. The consent in force when the tutor presses **Start** governs the session; a mid-session or later change applies from the **next** session, and the copy says so. The snapshot is refrozen at Start inside the conditional PENDING→ACTIVE update; the live record decides only while the room is waiting. No longer blocks C3a or C5. **Same hour, 16:23, LOCKED:** if no consent record exists when the tutor presses Start, the session cannot start, online or in person, no exception, and the disabled Start shows the reason (decision 6). Every session that reaches ACTIVE has a `SessionConsentSnapshot` row. Legacy snapshot-less rows are left as they are. Tests S9 and S10.
3. **Q3 — APPROVED (Andrew 2026-10-29 16:17).** A background job ends any session with no activity for 24 hours, through the shared stale/forced End path, for every session, and the whiteboard-off purge follows (§ 3.9, C4c). The decline fallback in § 3.9 is historical and does not ship. No longer blocks C4c or W13 arm B. **Out of scope:** an "are you still there?" prompt, backlog `WB-IDLE-STILL-THERE`. The design's choices for `endedAt` (last-activity instant), stamp-only replay, and a deferred billing freeze ship with this approval; Andrew did not restate those three separately.
4. **Q4 — PENDING ANDREW. Copy approval.** § 7 lists every changed string. Nothing ships until you approve. The two wordings I would most like your eye on: the `live_off` row in the org table, and the "Always block whiteboard replay" rename (the switch stops saving, it does not stop viewing). Also the new "what deleted means" section (device data and backups, § 7c); the retention periods in it are filled in only after I read the real Neon and Vercel Blob figures. The relay sentence (§ 3.10) ships only after the C0 read confirms it.
5. **Q5 — PENDING ANDREW. Prod migration go** for the four nullable `WhiteboardSession` columns (§ 5: `boardPurgeRequestedAt` indexed, `boardPurgeFirstPassAt`, `boardPurgeAttemptedAt`, `boardPurgedAt`). Needed at C4b. Without it a failed or interrupted purge has no durable record. I will not run it without your explicit go (Neon MCP `prepare_database_migration` is a write).
6. **ADDED — Andrew may veto.** Left as written in the re-review. Not settled by the answers above.
   - **C2a** — lane identity as its own Opus wave (F4).
   - **C4a / C4b / C4c split** — tutor-path upload guards, the board purge, and the reaper as three waves.
   - **`boardPurgeAttemptedAt`** — the fourth nullable purge column (F6).
