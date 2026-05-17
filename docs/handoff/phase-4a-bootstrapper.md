# Phase 4a — Executor bootstrapper

Copy everything below the rule line into a fresh executor chat. Do NOT include this header.

---

HALT — DO NOT EXECUTE ANY TOOLS YET.

You are the executor for Phase 4a (peer-mesh + signaling foundation, 1st of 4 Phase 4 sub-chats) of the tutoring-notes pilot-ready master plan.

Phase 4 has a MODEL-SWITCH GATE. Phase 4 requires Claude Opus 4.7 or equivalent stronger model — the WebRTC peer-mesh lifecycle (perfect-negotiation, glare resolution, ICE trickle, restart on disconnect, mesh fan-out for ≥3 peers) plus the encrypted-envelope signaling muxer reliably stalls Composer-class models.

Send the user this message verbatim and wait for explicit confirmation:

> "Phase 4a needs Claude Opus 4.7 (or an equivalent stronger model — same model class the orchestrator chat used for Phase 1). Please confirm you have switched and reply 'switched' so I can proceed."

Do not infer confirmation from anything else. Do not begin Task 1 until the user replies with "switched" or equivalent confirmation.

═══════════════════════════════════════════════════════════
EVERYTHING BELOW THIS LINE IS FOR AFTER THE USER CONFIRMS
═══════════════════════════════════════════════════════════

Working in `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`. Live commercial-pilot app — Sarah uses this for real sessions. Never push broken code to master.

## Read first (in order)

1. `c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` — focus on:
   - Status section (where Phase 1 just landed, what's open).
   - Pillar 6 (Live A/V transport architecture).
   - Phase 4 task list (you are doing tasks 1 + 2 only; the partitioning section explicitly assigns these to 4a).
2. `AGENTS.md` at the repo root — workspace conventions: per-session ID logging, additive migrations rule, ownership assertions, tokenized share links, CSP discipline.
3. `src/lib/whiteboard/sync-client.ts` — the existing encrypted Socket.IO transport you will extend additively. Re-read the trust-model comment at the top before changing anything. Note the existing `WhiteboardWireMessage` v1/v2/v3 schema — your new envelope kind extends this same pattern.
4. `git log master --oneline -8` to confirm Phase 1c is in master at `ac9a066` (PR #3) and master is your starting point.

Confirm to the user once these reads complete. Then start Task 1.

## YOUR SCOPE — what is IN this chat

**Goal**: Land the pure-JS WebRTC mesh + signaling foundation on a branch + PR. No UI, no DOM, no `getUserMedia`, no React, no recording integration. Phase 4b will consume your modules; Phase 4c renders tiles; Phase 4d adds CSP and acceptance tests.

**Deliverables (one branch, one PR — `phase-4a-peer-mesh-signaling` off master)**:

1. **Sync-client envelope extension** (additive). Extend `src/lib/whiteboard/sync-client.ts` so the encrypted payload can carry a new message kind `webrtc-signal` alongside the existing scene/document messages. Match the existing v1/v2/v3 versioning style — additive, backward-compatible. The relay never sees plaintext SDP/ICE; same AES-GCM envelope as scene frames.
2. **`src/lib/av/signaling.ts`** — typed signaling muxer that subscribes to inbound `webrtc-signal` envelopes and exposes a typed send API. Demultiplexes by `targetPeerId` so a signal addressed to peerB does not reach peerA's handler. Validates schema; rejects malformed payloads.
3. **`src/lib/av/peer-mesh.ts`** — typed wrapper owning a `Map<peerId, RTCPeerConnection>`. Implements:
   - Perfect-negotiation pattern (polite vs impolite role per pair, decided by lexicographic comparison of local vs remote peer id).
   - ICE candidate trickle (queue early candidates if remote description not yet set).
   - Restart on disconnect (ICE restart on `iceConnectionState === "failed"` for the polite peer; impolite waits).
   - Glare resolution (simultaneous offer collision — polite peer rolls back).
   - Public STUN only (Google's free servers `stun:stun.l.google.com:19302`); no TURN in 4a.
   - Mesh fan-out: adding peer X creates a PC for X without disturbing existing PCs.
   - Cleanup: removing a peer closes the PC, fires no callbacks afterward.
   - Pure-JS: no DOM, no `MediaStream`, no `getUserMedia`. The PC is created and signaled; attaching local tracks is 4b's job.
4. **Jest unit tests** (no DOM, no Playwright):
   - `src/__tests__/av/signaling.test.ts` — envelope mux/demux, target-peer scoping, schema validation, malformed-payload rejection.
   - `src/__tests__/av/peer-mesh.test.ts` — outgoing offer happy path, polite/impolite role determination, glare/rollback, ICE trickle queueing before remote description, peer drop + cleanup, peer reconnect / restart, 3-peer mesh fan-out (tutor + 2 students canary). Use a small typed `RTCPeerConnection` test double — do not pull in `wrtc` or any native binding.
5. **Wire-schema regression test** — extend `src/__tests__/whiteboard/sync-client.test.ts` (or a sibling) to assert the new `webrtc-signal` envelope kind round-trips through encrypt → decrypt → validate, and that an unknown future kind is rejected cleanly.
6. **Per-session ID logging** — pick prefix `avx` for live-A/V session-level events; per-peer events log `peer=<peerId>` as a subkey. Update the ID registry in `docs/RECORDER-LIFECYCLE.md` (the section the docs registry section near the top — short addition, ~3 lines). Log every state transition: offer sent/received, answer sent/received, ICE candidate trickled, `iceConnectionState` change, `connectionState` change, restart, dispose.
7. **Phase 4a handoff status doc**: new `docs/PHASE-4A-STATUS.md`. Document the public API of `peer-mesh.ts` and `signaling.ts`, what 4b will consume from them, and what assumptions 4b inherits (wire schema discriminants, peer-mesh callback shapes, error contract). Pattern: same as `docs/PHASE-1B-STATUS.md`.

## What is OUT of this chat (defer explicitly to other Phase 4 sub-chats)

- **`useLiveAV` hook** (`src/hooks/useLiveAV.ts`): Phase 4b. Owns local `MediaStream`, mute states, calls `getUserMedia`. Will consume `peer-mesh.ts` + `signaling.ts`.
- **Recording outbox integration**: Phase 4b. Wiring each remote participant's audio MediaStream through a `MediaRecorder` into the outbox with `streamId: "student:peer-X:mic"`. Lifecycle FSM `shouldCapture(streamId)` decision logic.
- **UI components** (`src/components/av/AVTile.tsx`, `AVTilesPanel.tsx`, `AVPermissionsPrompt.tsx`, `AVControls.tsx`): Phase 4c.
- **Mounting in workspace + student client** (`WhiteboardWorkspaceClient.tsx`, `StudentWhiteboardClient.tsx`): Phase 4c.
- **CSP / Permissions-Policy update** (`camera=(self), microphone=(self)` in `src/middleware.ts`): Phase 4d.
- **Graceful degradation polish** (mic-denied placeholder, cam-denied initials, peer-failed "Reconnecting…" tile): Phase 4d.
- **Playwright integration tests** in `tests/integration/live-av.spec.ts`: Phase 4d (they need real UI to drive).
- **`docs/LIVE-AV.md`**: Phase 4d.
- **TURN server**: out-of-scope per plan; only added later if NAT-traversal failures appear in field reports.
- **SFU**: out-of-scope; mesh handles ≤5 peers per Sarah's realistic max.

If you find yourself adding any of these in 4a, STOP and re-read the partitioning. Each Phase 4 sub-chat exists to keep scope tight enough that the model converges.

## CRITICAL CONSTRAINTS (architectural rules from the relevant Pillars)

- **Pillar 6 (Live A/V transport)**: All signaling rides the existing encrypted sync-client envelope. The relay sees only opaque AES-GCM bytes. Do NOT introduce a parallel WebSocket / fetch path for SDP or ICE. Same encryption key, same room id, same envelope.
- **Pillar 1 (multi-participant FSM)**: Peer-mesh is keyed on `peerId: string`, not "us vs them" booleans. The `Map<peerId, RTCPeerConnection>` shape supports tutor + N students from day one. No code path may assume exactly 2 peers.
- **Pillar 2 (multi-stream outbox)**: 4a doesn't write to the outbox, but design peer-mesh's track-callback API so 4b can attach a `MediaRecorder` per remote audio track without 4a needing to know about recording. The peer-mesh exposes "remote track for peer X arrived/left" events; 4b decides what to do with them.
- **Trust model invariant**: AES-GCM envelope structure stays the same. You may add new `kind` discriminant values (additive), bump or branch on schema version (additive), but you may NOT change the encrypt/decrypt code path or the IV/key handling. If you find yourself touching `encryptMessage`/`decryptMessage`/`importAesKey`, STOP and ask the user.
- **Per-session ID logging is mandatory**. `avx=<sessionId> peer=<peerId> kind=<offer|answer|ice|state> from=<state> to=<state> reason=<why>` shape. Every PC state transition logs. Without this, prod debugging of WebRTC issues is impossible.
- **Additive migrations only**. No DB schema changes expected in 4a. If you discover one is needed, STOP — it belongs in a different sub-phase.
- **No `getUserMedia` calls anywhere in 4a code**. Peer-mesh accepts an `RTCPeerConnection` factory + a callback for "give me the local tracks for peer X" but does not itself touch `navigator.mediaDevices`. This keeps the module unit-testable without browser permissions and lets 4b own all media-capture concerns.
- **Hotfix policy**: Phase work is branch + PR. No master pushes. If you discover a blocking bug in master that's unrelated to 4a, STOP and ask the user — the orchestrator decides whether to do a sidecar hotfix.

## EXECUTION ORDER (recommended commit cadence)

Work bottom-up: schema first, signaling on top, peer-mesh on top of that. Verify between commits.

1. **Commit 1 — sync-client envelope extension + wire-schema regression test.**
   - Add a new `WhiteboardWireSignal` type with `{ v: 1, kind: "webrtc-signal", peerId, targetPeerId, payload: SDP|ICE|leave }`.
   - Update `validateWireMessage` in `sync-client.ts` to discriminate on `kind` (existing scene messages have no `kind` field — preserve as default; presence of `kind: "webrtc-signal"` selects the signal validator).
   - Add an exported `broadcastSignal(targetPeerId, payload)` AND `onRemoteSignal(cb)` to `WhiteboardSyncClient`.
   - Test: round-trip a signal envelope through `encryptMessage`/`decryptMessage`/`validateWireMessage`. Assert scene messages still validate. Assert unknown `kind` is rejected.
   - Verify: `npx jest src/__tests__/whiteboard/sync-client` green; `tsc --noEmit` clean. Run the existing 2-tab whiteboard sync mentally — your additive changes should not change scene message behavior.

2. **Commit 2 — `src/lib/av/signaling.ts` module + unit tests.**
   - Constructor takes `{ syncClient, localPeerId, log }`. Returns `{ sendOffer, sendAnswer, sendIce, sendLeave, onSignal, dispose }`.
   - `onSignal(cb)` fires only for signals where `targetPeerId === localPeerId`.
   - All sends prefix payload with `localPeerId` so the receiver knows the source.
   - Schema-validate every inbound; drop malformed with a warning log.
   - Test: feed a fake `syncClient` (mock of the sync-client public API), assert correct mux/demux, target-peer scoping, schema rejection.
   - Verify: `npx jest src/__tests__/av/signaling` green.

3. **Commit 3 — `src/lib/av/peer-mesh.ts` module + unit tests.**
   - Constructor takes `{ signaling, localPeerId, iceServers, getLocalTracks, log }`.
     - `getLocalTracks: (remotePeerId: string) => MediaStreamTrack[]` — peer-mesh asks the host for tracks to attach when creating a PC. Default factory in tests returns `[]`.
   - Public API: `addPeer(peerId)`, `removePeer(peerId)`, `peers(): ReadonlySet<string>`, `onRemoteTrack(cb: (peerId, track) => void)`, `onPeerConnectionStateChange(cb: (peerId, state) => void)`, `restart(peerId)`, `dispose()`.
   - Internals: perfect-negotiation per `(localPeerId, remotePeerId)` pair, lexicographic comparison decides polite role. ICE trickle queue. Glare detection via `signalingState`. Restart on `iceConnectionState === "failed"` for polite role.
   - Test (use a typed `RTCPeerConnection` double with controllable async callbacks):
     - Outgoing offer happy path: `addPeer("B")` from "A" → creates PC, sends offer via signaling, receives answer, ICE flows, `connectionState` reaches `connected`.
     - Polite/impolite determination: assert "A" is polite vs "B" (or whichever side lexicographic comparison picks) and the inverse.
     - Glare: simultaneous `addPeer` from both sides → impolite peer ignores remote offer / polite peer rolls back; eventually-consistent connect.
     - ICE trickle ordering: candidates received before `setRemoteDescription` are queued and applied after.
     - Peer drop: `removePeer("B")` closes PC, no further callbacks fire.
     - 3-peer mesh: `addPeer("B")` then `addPeer("C")` from "A" creates two PCs, no cross-talk.
     - Restart: polite-side peer-mesh detects `iceConnectionState === "failed"` and triggers ICE restart; impolite waits.
   - Verify: `npx jest src/__tests__/av/peer-mesh` green; full `npx jest` green; `tsc --noEmit` clean.

4. **Commit 4 — Phase 4a handoff status doc + ID-registry update.**
   - New `docs/PHASE-4A-STATUS.md`: phase status table; public API of `peer-mesh.ts` + `signaling.ts`; wire-schema discriminant additions; what 4b inherits; what 4b must add (`getUserMedia`, `useLiveAV`, recording outbox integration); known not-yet-tested edge cases (TURN, SFU — both deferred).
   - Update `docs/RECORDER-LIFECYCLE.md` ID registry section to add `avx` (live A/V session) prefix.
   - Update `AGENTS.md` "Currently in use" prefix list to add `avx` (1 line).

After commit 4: run the full test suite + `tsc --noEmit` once more. Push the branch.

## WRAP-UP

1. Full test suite green: `npx jest`. `tsc --noEmit` clean.
2. Push: `git push -u origin phase-4a-peer-mesh-signaling`.
3. Open PR via the GitHub web UI (gh CLI not authed): `https://github.com/Arangarx/tutoring-notes/compare/master...phase-4a-peer-mesh-signaling`.
4. PR title: `Phase 4a — peer-mesh + signaling foundation (Pillar 6)`.
5. PR body (keep tight, ~600 chars; longer summaries belong in `docs/PHASE-4A-STATUS.md`):

   ```markdown
   ## Phase 4a — Live A/V foundation (1st of 4)

   Pure-JS transport plumbing. No UI, no `getUserMedia`, no recording integration.

   - Additive `webrtc-signal` envelope on the existing encrypted sync-client.
   - `src/lib/av/signaling.ts` — mux/demux signals scoped by `targetPeerId`.
   - `src/lib/av/peer-mesh.ts` — `Map<peerId, RTCPeerConnection>` with perfect-negotiation, ICE trickle, restart, glare rollback. Multi-peer (3+) tested.
   - Jest only (mocked `RTCPeerConnection`); no DOM, no Playwright. UI + CSP + acceptance tests land in 4b/4c/4d.

   See `docs/PHASE-4A-STATUS.md` for the API + what 4b consumes.
   ```

6. Report back to the user with: PR URL, total test counts (existing + new), any deferred items or surprises, what 4b inherits and where 4b should pick up.

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

(Phase 4a is invisible plumbing; the smoke for live A/V proper lands in 4c/4d. Smoke 4a only as a non-regression check.)

- [ ] I am on the **branch preview URL** (NOT `tutoring-notes.vercel.app`), and I have hard-refreshed since the last deploy.
- [ ] Vercel build completed cleanly for the `phase-4a-peer-mesh-signaling` branch.
- [ ] Open a 2-tab whiteboard session (tutor + student via join link). Tutor draws → student sees strokes within ~1 second. (Sync-client envelope additive change must not regress scene messages.)
- [ ] DevTools console for both tabs: no errors. The new `[sync-client] wbsync=… kind=webrtc-signal …` log lines should NOT appear yet (no Phase 4b/c code is calling signaling).
- [ ] `npx jest` locally: all suites green, including the new `src/__tests__/av/*` suites.
- [ ] `npx tsc --noEmit` clean.

## STOP CONDITIONS

- **Don't add `getUserMedia`**, mute UI, mute toggles, `MediaStream` instantiation, or any React. That's 4b/4c.
- **Don't add Playwright integration tests** for live A/V. Those need 4c's UI to drive. Stick to Jest with a mocked `RTCPeerConnection`.
- **Don't change the encryption envelope's structure.** Adding a new `kind` discriminant is additive; touching `encryptMessage`/`decryptMessage`/`importAesKey` or the IV/key handling is not. STOP and ask if you find yourself there.
- **Don't pull in WebRTC native bindings** (`wrtc`, `node-webrtc`, etc.) for tests. Use a typed test double of `RTCPeerConnection`.
- **Don't introduce a parallel transport** for signaling (separate WebSocket, separate fetch path, etc.). Reuse the sync-client envelope. Pillar 6 + the trust model in `sync-client.ts` are non-negotiable.
- **Don't drift into Phase 4b scope.** When peer-mesh's track-callback wiring tempts you to "just hook up a `MediaRecorder` while I'm here" — STOP. That's Phase 4b's whole job.
- **Don't refactor `sync-client.ts` beyond the additive envelope extension.** Anything more than the new `kind` discriminant + the new `broadcastSignal`/`onRemoteSignal` methods is out of scope.
- If `tsc --noEmit` reveals a pre-existing error unrelated to 4a, STOP and ask the user.

## HARD RULES

- Never push to master. Branch + PR. PR body uses the template above (or a tight variant ≤700 chars).
- Don't modify the master plan file (`c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`). Plan edits are the orchestrator's job.
- Reuse existing primitives. Extend `sync-client.ts` envelope additively. Do not bolt a parallel transport for SDP/ICE.
- Per-session ID logging mandatory. Prefix `avx` for live-A/V; per-peer subkey `peer=<peerId>`. Log every state transition.
- No DB migrations expected. If you discover one is needed, STOP — it belongs in a different sub-phase.
- No CSP / Permissions-Policy edits in 4a. Camera/mic permission needs `camera=(self), microphone=(self)`, but that lands in 4d alongside the actual `getUserMedia` calls in 4c.
- Server actions assert ownership where applicable. (4a doesn't add server actions.)
- If anything in this bootstrapper is unclear, ask the user before guessing. The user will route the question back to the orchestrator chat if needed.
