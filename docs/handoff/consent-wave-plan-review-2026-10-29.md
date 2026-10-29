# Review of `docs/handoff/consent-wave-plan.md` (Sonnet, 2026-10-29)

Independent adversarial review by agent a9885be4. Read-only; the reviewer read code and ran nothing.

## Verdict: APPROVE-WITH-BLOCKERS

The architecture is right: one capability function, the Student row as consent owner, client never captures, server never accepts. Eight items must be folded into acceptance before C2–C5 start.

**Plan claims that held up:**
- Self-learner `/join` gap: the whole consent check sits inside `if (!isSelfLearner)` (`src/app/join/[sessionId]/page.tsx:206`).
- Snapshot frozen at create but Start reads live: `createSessionConsentSnapshot` is `consent-scope.ts:303-350`; Start reads the live record at `whiteboard/actions.ts:268-298`; the waiting room reads the snapshot (`workspace/page.tsx:170`).
- Org-blind student page (`admin/students/[id]/page.tsx:117`).
- Waiting-room auto-flip (`WaitingRoomOverlay.tsx:167-173`).
- Child consent `records.every(...)` (`child-consent.ts:134`).
- The `consentOwnerFromStudent` / `resolveEffectiveConsentForStudent` rule is as described (`consent-scope.ts:543-636`).
- `assertEffectiveConsent` has no product callers.

## BLOCKERs

**B1. Board purge is not durable, and a client-uploaded stroke log can survive.**
- Plan §3.2 deliberately does not store the client's `eventsBlobUrl` or `snapshotBlobUrl`, then purges inline after the transaction. If the request dies after commit, nothing records those URLs. The sweep only has the placeholder and the checkpoint prefix, so `events.json` (the full stroke log) survives unreferenced. §3.3 accepts only "assets" as residual.
- Client blobs are prefix-listable: events `src/lib/whiteboard/upload.ts:118`, snapshot `upload.ts:135`, assets `upload.ts:168`, all under `whiteboard-sessions/<studentId>/<sessionId>/`. Audio is under `sessions/<studentId>/…` (`src/lib/recording/upload.ts:70`), so prefix deletion is safe. The assembled blob at `actions.ts:939` is under `<adminUserId>/<studentId>/` and is not enumerable, so the skip-assembly rule must hold.
- Fold in: write a purge-intent column, with any client URLs, inside the End transaction (precedent: the `erasureShortCircuit` branch at `actions.ts:1215-1223`). Sweep from that intent, not from "snapshot off AND endedAt > deploy constant". Move the purge to `after()` or the sweep, off the End critical path. On an unreadable capability, never purge; retry instead.
- Also: the tutor's IndexedDB stroke-log checkpoint is not cleared. It is garbage-collected only when the same session URL is reopened (`useWhiteboardRecorder.ts:41-57`, `:137-150`, `:166`). Stale-end and forced-end leave the log on the device. Either clear it or scope the privacy copy to "our servers", or "deleted when the session ends" breaks the honesty hard rule.

**B2. In-flight writes survive the purge, and the sweep can't see them.**
- `checkpoint/route.ts:63-110` checks `endedAt` and phase non-atomically; the batch upsert is at `:187-210`. A batch that passes the check before End commits can upsert after the transaction's `deleteMany`, leaving a `WhiteboardEventBatch` row with `boardDocumentJson`. The §3.3 sweep only looks at blobs and `boardPurgedAt`.
- Asset uploads have no `endedAt` guard (`api/upload/blob/route.ts:210-215`).
- Fold in: re-check inside the batch transaction; two-phase purge (delete rows and prefix, wait past the token and flush window, delete again, then stamp); sweep rows as well as blobs.

**B3. The server's learner-lane rule fails open after any retry.**
- `kickSessionChunksAction` (`notes-actions.ts:77-82`) and the sweep (`transcribe-sweep.ts:174-178`) call the worker without `streamId` or `speakerId`. `enqueueChunkTranscribe` defaults `streamId` to `tutor:mic` (`chunk-transcribe-enqueue.ts:90`). The `upsertTranscriptChunk` update branch overwrites the stored `streamId` and `speakerId` (`transcript-store.ts:86-121`). A retried learner chunk is relabeled `tutor:mic`, so `isLearnerLane(stored.streamId)` cannot be trusted.
- Fix the upsert so it never clobbers lane identity; red test that a swept learner chunk keeps its lane.
- Document the limit: a tampered client can label learner audio `tutor:mic` (`actions.ts:1933`, `:2063`).

**B4. The in-person "no mic" design targets the wrong code and omits the real opener.**
- `useAudioRecorder` acquires the mic on mount, unconditionally (`useAudioRecorder.ts:575-595`, `forRecording:false`), before the waiting-room mode is chosen.
- `micAcquireSettled` gates the camera request (`useLiveAvCoordinator.ts:278`, `WhiteboardWorkspaceClient.tsx:2335`). Skipping the acquire without settling it wedges the cam coordinator.
- Other openers: `WbTopBarMicControlLive`; `AVPermissionsPrompt` / `requestMic` (`WhiteboardWorkspaceClient.tsx:5511`, `:5537`); device pickers; and the learner-side bootstrap, which opens mic and camera on sync connect with no consent check (`useLiveAvCoordinator.ts:111-141`).
- The FSM concern is overstated: in policy `none`, `tutorWantsRecording` is already false (`WhiteboardWorkspaceClient.tsx:2628`) and the `tutor:mic` input is already skipped (`:2439`). The `AudioContext` silent-stream fallback is unnecessary and risky.
- Required: defer mic acquisition until the mode is known; release the mic on a flip to in person; still settle `micAcquireSettled`; tests for every opener; test the camera still works after a skipped mic.

**B5. Refreeze at Start is under-specified.**
- The refreeze must be in the same conditional transaction as the PENDING→ACTIVE `updateMany`, on both code paths (org-locked and plain, `actions.ts:279-337`). Otherwise a second Start or second tab re-freezes an ACTIVE session.
- The tutor client holds capabilities from page load. If a parent flips audio off between page load and Start, the client records the learner lane and uploads blobs; only the server refuses, leaving orphan learner blobs. `startWhiteboardSession` must return the refrozen capabilities and the client must adopt them before arming any recorder. Add an ACTIVE no-change test.

**B6. The W3/W4/W8 test oracles don't exist yet.**
- `deleteBlob` calls `@vercel/blob` `del` directly (`src/lib/blob.ts:20-30`). `blob-harness.ts` has no list or delete; the plan's inventory code calls the real `list` (`blob-inventory.ts:107`, `assemble-persisted-state.ts:110`).
- Extend the harness (list by prefix, delete, fault injection) in C0 as shared infrastructure. W3 needs a positive control: batches > 0 before End, 0 after.

**B7. Replay visibility is not pinned to what was recorded.**
- `loadParentVisibleWhiteboardReplayIds` ANDs the live `ConsentRecord` with the snapshot (`loadWhiteboardReplayIdsForNotes.ts:240-258`). A consent change after End hides a recorded board, contradicting principle 4. After End, replay must read only the frozen snapshot.
- Open Question 1 (notes off → no non-DRAFT note → no family entry to the replay) makes the §6e matrix unsatisfiable until answered.
- Replay is decided in at least seven places: `loadWhiteboardReplayIdsForNotes.ts`, `parent-share-replay-access.ts`, `learner-replay-access.ts`, `api/audio/[recordingId]/route.ts`, `proxy-share-resource.ts`, `s/[token]/whiteboard/[id]/page.tsx`, `join/notes/.../whiteboard/page.tsx`.

**B8. The plan did not use the real reliability bar.**
- The real file is `agenticPipeline/.cursor/rules/reliability-bar.mdc`: data durability, clock and ordering, race conditions on user input, cross-platform parity, observability.
- Unaddressed: crash or sleep mid-End; double End and double Start; replay clock with an empty placeholder log plus audio (`WhiteboardReplay.tsx` reads `durationMs`; empty log means 0); iOS Safari / WebKit student join.

## SHOULD-FIX

- **End paths incomplete.** `stampStaleWhiteboardSessionEnd` has four callers: `org-scope.ts:670` and `:1081`, `org-force-end-touch.ts:33`, `actions.ts:1410`. Put the purge intent in that stamp helper and in the End transaction through one shared function. Also gate the late `acceptOrgForcedEndUpload` write (`actions.ts:765-771`).
- **Refused rows must reach a terminal state.** The notes sweep takes the oldest 10 pending rows (`transcribe-sweep.ts:111-127`); refused rows left `pending` starve newer rows. Plan S4 covers outbox rows only.
- **Don't couple the purge to the transcription sweep's time budget.** Separate function on the same cron. The intent column replaces the deploy-time guard constant.
- **Sequencing conflict with org W4.** `org-ux-pass-plan.md:63` says `sessionEntryState` "adds no new gate"; `:181` says do not reroute the bridge's enforcement through the UI function. C5 collapses six enforcement checks into it. Decide the shape and enforcement role now; build the mode dimension into W4.
- **Duplication.** Lane parsing already copied at `notes-worker.ts:249-251`, `:519-523`, and `perspeaker-identity.ts:65`; `isLearnerLane` must absorb them. `CAPABILITY_TABLE` and `CONSENT_SWITCHES` are two tables for the same switches. `RecordingStatusNotice` overlaps org W4's `SessionEntryBlocked`. `resolveRecordedConsent` (`consent-scope.ts:662`) is a second resolver. `org-learner.ts:235-240` reads the raw record and ignores `ConsentRestriction` — a live child-floor bug today. The temporary `deriveAudioCapturePolicy` alias conflicts with zero-duplication until C9. Reconcile `notesForbidden` with the notes capability.
- **Tiering.** C6 touches 6+ access-boundary sites — Sonnet or Opus, not Grok. C2/C3 touch outbox, `useAudioRecorder`, WorkspaceClient — add `@wb-presence` and `@wb-sync` or run the full suite. C4 executor unspecified; reliability-floor override makes it Opus. C1 changes `consent-scope.ts`, which End calls — Sonnet.
- **Erasure regression risk.** Factoring `blob-inventory.ts:140-205` changes the erasure path; pin its existing tests in C4.
- **Copy honesty.** Name Neon point-in-time history and Vercel Blob delete semantics before saying "deleted".

## Plan claims that turned out wrong

| Plan claim | Evidence |
|---|---|
| `enqueueChunkTranscriptionAction` "does not read consent" (§1a) | It does, via `resolveModeAwareAudioRecordingConsent` at `actions.ts:2089-2098`. The gaps are lane identity and notes. |
| `useLifecycleInputStreams`, ~2439, opens the mic (§4.1) | The hook doesn't exist. `lifecycleInputStreams` (`WhiteboardWorkspaceClient.tsx:2434-2469`) is a health map whose `tutor:mic` entry is already gated. |
| "6 import sites" of `deriveAudioCapturePolicy` | One product site (`WhiteboardWorkspaceClient.tsx:78`, `:1613`). |
| Embedded assets only reachable via the events log | Prefix-listable (`upload.ts:168`). |
| Blob-harness store contents as oracle (§6) | Harness has no list or delete. |
| Audio upload may receive a session id (§4.1 UNVERIFIED) | It does not; the audio token carries `studentId` only (`api/upload/blob/route.ts:124-148`). |
| Reliability-bar file absent | Exists at `agenticPipeline/.cursor/rules/reliability-bar.mdc`, different axes. |
| End paths (§3.4) | More than listed; see SHOULD-FIX. |

## Missing test cases

- Swept or kicked learner chunk keeps its lane (B3).
- In-flight batch POST racing End leaves no row.
- Late asset upload after End.
- Client uploaded `events.json`, then End failed or the tab closed.
- Double Start and double End; ACTIVE-session consent flip is a no-op.
- Consent flipped between page load and Start.
- Replay after consent revoked post-End.
- Pre-wave sessions with wb-off snapshots are never purged (locked decision 1).
- Zero `getUserMedia` audio calls with in-person off: top-bar mic, permission prompt, device picker paths.
- Camera still works after a skipped mic.
- IndexedDB checkpoint cleared.
- Unknown capability does not purge.
- WebKit student `/join` with online off.
- Refused-row terminal state; notes sweep not starved.
