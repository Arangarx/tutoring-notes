/**
 * Consent wave — relay + extended blob harness: § 3 board-purge rows (W24 is live: the relay probe).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below except W24 is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-board-purge.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test, expect } from "@playwright/test";
import { TAG } from "../test-tags";
import { findScenePayloadEvents, openRelayClient, probeRelayRoom } from "../helpers/relay-probe";

// ---------------------------------------------------------------------------
// 6e. Whiteboard
// ---------------------------------------------------------------------------
test.describe("consent 6e: Whiteboard", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC, TAG.WB_STROKES],
}, () => {
  // Oracle: 'WhiteboardEventBatch' count 0; harness listing has no 'whiteboard-checkpoints/<id>/' keys; events URL serves an empty log
  test.fixme(
    "W3: whiteboard off: at End the stroke log, batches and checkpoints are deleted",
    async () => {
      // pending: wave that owns W3
    }
  );
  // Oracle: Harness listing under 'whiteboard-sessions/<studentId>/<sessionId>/' empty
  test.fixme(
    "W4: whiteboard off: embedded image and PDF asset blobs are deleted at End",
    { tag: [TAG.WB_ASSETS] },
    async () => {
      // pending: wave that owns W4
    }
  );
  // Oracle: 'snapshotBlobUrl' null; notes generation input has no image
  test.fixme(
    "W5: whiteboard off: no board snapshot image is stored or used in notes",
    async () => {
      // pending: wave that owns W5
    }
  );
  // Oracle: DOM
  test.fixme(
    "W6: whiteboard off: tutor review shows the \"board was not saved\" state",
    async () => {
      // pending: wave that owns W6
    }
  );
  // Oracle: Late POST refused ('acceptOrgForcedEndUpload' sets no 'eventsBlobUrl'); a blob a stale client uploaded under the session prefix is gone after the sweep; no URL is recorded anywhere (R2)
  test.fixme(
    "W7: whiteboard off: forced-end late upload cannot recreate the board",
    async () => {
      // pending: wave that owns W7
    }
  );
  // Oracle: Fault-injected delete; DB columns after each sweep; uses the pass-2 backdate seam (§ 3.3): sweep 1 fails and stamps 'boardPurgeAttemptedAt', sweep 2 passes pass 1, backdate, sweep 3 passes pass 2 and stamps 'boardPurgedA …
  test.fixme(
    "W8: whiteboard off: a failed blob delete is retried by the purge sweep and boardPurgedAt is stamped",
    async () => {
      // pending: wave that owns W8
    }
  );
  // Oracle: Count > 0 before, 0 after; a purge test cannot pass on an empty store
  test.fixme(
    "W10: whiteboard off: batches exist before End and are gone after (positive control)",
    async () => {
      // pending: wave that owns W10
    }
  );
  // Oracle: Zero rows asserted BEFORE any purge pass has run ('boardPurgeFirstPassAt' still null), with the checkpoint hold seam parking the late batch between 'assertActiveSession' and the transaction, so it is red without the in-t …
  test.fixme(
    "W11: whiteboard off: a batch POST racing End leaves no WhiteboardEventBatch row",
    async () => {
      // pending: wave that owns W11
    }
  );
  // Oracle: Token minted pre-End via the harness (with the explicit 'validUntil', § 3.3); PUT after End; listing still has the blob after pass 1 and without the backdate (negative arm: proves the delay is real); empty after the back …
  test.fixme(
    "W12: whiteboard off: an asset PUT with a pre-End token that lands after End is removed by the second pass",
    { tag: [TAG.WB_ASSETS] },
    async () => {
      // pending: wave that owns W12
    }
  );
  // Oracle: Arm A: the End call fails after the upload (nothing from the client is trusted; the blob is under the prefix). Arm B: the tab closes and no End ever arrives: the reaper (§ 3.9, depends on C4c, APPROVED) ends the session  …
  test.fixme(
    "W13: whiteboard off: a client-uploaded events.json survives neither a failed End nor a closed tab",
    async () => {
      // pending: wave that owns W13
    }
  );
  // Oracle: Parametrized over the five stamp callers ('org-scope' ×2, 'org-force-end-touch', 'endStaleWhiteboardSession', the reaper); intent columns + listing
  test.fixme(
    "W14: whiteboard off: stale end, forced end and org forced end each write a purge intent and purge",
    async () => {
      // pending: wave that owns W14
    }
  );
  // Oracle: Rewritten for Q6 (default applied; if Andrew picks the alternative, this test inverts to "never written"). IndexedDB contents via 'page.evaluate', three arms: (a) during the session a checkpoint row exists for the sessio …
  test.fixme(
    "W15: whiteboard off: the on-device checkpoint is kept during the session and deleted at End, and a leftover one is cleared at the next workspace load",
    async () => {
      // pending: wave that owns W15
    }
  );
  // Oracle: Fault: snapshot unreadable → no server deletes, intent retained, retry later. The device-side half: with the capability unreadable the load-time cleanup does not delete the local checkpoint (deleting on an unknown answer …
  test.fixme(
    "W16: unknown capability does not purge, and a whiteboard-off session's local copy is not cleared on an unreadable capability",
    async () => {
      // pending: wave that owns W16
    }
  );
  // Oracle: Characterization (green before; regression guard). Seeded old row: 'boardPurgeRequestedAt' null; sweep leaves blobs and rows. Green before because nothing purges these rows today
  test.fixme(
    "W17: sessions before this wave with a whiteboard-off snapshot are never purged",
    async () => {
      // pending: wave that owns W17
    }
  );
  // Oracle: C3a End half. Rewritten by SF2, arm → park → release; plain-owned tutor, red evidence on the seam-only commit (SF-A, SF-B). (a) Sequential: second End returns idempotent; 'endedAt' and snapshot 'frozenAt' unchanged (no s …
  test.fixme(
    "W18: double End is a no-op, including when the two Ends overlap, and writes no second snapshot",
    async () => {
      // pending: wave that owns W18
    }
  );
  // Oracle: C4b (migration + 'stampBoardPurgeIntent'). (a) Sequential: intent timestamps unchanged on the second End. (b) Overlapping, same seam as W18: 'boardPurgeRequestedAt' is A's (set only if null), not B's and not the post-par …
  test.fixme(
    "W18b: double End does not write a second purge intent, and the overlapping loser does not move boardPurgeRequestedAt",
    async () => {
      // pending: wave that owns W18b
    }
  );
  // Oracle: HTTP error from the token route, two arms (prefix; 'endedAt'); prerequisite of C4b, ships first as C4a (R2); red on today's code for both arms
  test.fixme(
    "W19: tutor-path whiteboard upload outside the session prefix, or after End on a whiteboard-off session, is refused at token mint",
    async () => {
      // pending: wave that owns W19
    }
  );
  // Oracle: Kill the 'after()' work (fault injection); intent present; sweep pass 1, backdate seam, sweep pass 2 stamps 'boardPurgedAt'
  test.fixme(
    "W22: crash between End commit and purge: the intent survives and the sweep finishes the job",
    async () => {
      // pending: wave that owns W22
    }
  );
  // Oracle: Seed an audio blob under 'sessions/<studentId>/', a concatenated-replay audio blob at the concat output path ('whiteboard-sessions/<adminUserId>/<studentId>/<whiteboardSessionId>-concat.webm', § 3.3's named prefix guard) …
  test.fixme(
    "W23: End or finalize with a foreign or audio URL as eventsBlobUrl never deletes that blob",
    async () => {
      // pending: wave that owns W23
    }
  );
  // Oracle: Relay probe (§ 3.10): after a session ended and every peer left, a new 'socket.io' client joins the same room id on the local relay; it receives 'init-room', 'first-in-room', 'room-user-change' and no scene payload. Inde …
  test("W24: sync relay keeps no board state: a fresh client joining an emptied room gets first-in-room and no scene", async () => {
    const roomId = `w24-${Date.now()}`;
    // a session happens: two peers join, a scene is broadcast and received, everyone leaves
    const a = await openRelayClient();
    const b = await openRelayClient();
    a.emit("join-room", roomId);
    b.emit("join-room", roomId);
    await a.settle(800);
    a.emit("server-broadcast", roomId, "ZW5jcnlwdGVkLXNjZW5lLWJ5dGVz", "aXY=");
    await b.settle(800);
    // positive control: the second peer DID receive the scene, so the probe can see one
    expect(findScenePayloadEvents(b.events).map((e) => e.name)).toContain("client-broadcast");
    a.close();
    b.close();
    // let the relay observe both disconnects before the new client joins
    await new Promise((r) => setTimeout(r, 1_000));

    const probe = await probeRelayRoom(roomId);
    expect(probe.names).toEqual(expect.arrayContaining(["init-room", "first-in-room", "room-user-change"]));
    expect(findScenePayloadEvents(probe.events)).toEqual([]);
  });  // Oracle: Seed more of each than 'BOARD_PURGE_SWEEP_BATCH_LIMIT' plus one eligible row; one cron call purges the eligible row (F6); failing rows get 'boardPurgeAttemptedAt' stamped and rotate
  test.fixme(
    "W25: purge sweep is not starved: not-yet-due, unreadable-capability and persistently failing rows do not block an eligible row",
    async () => {
      // pending: wave that owns W25
    }
  );
  // Oracle: NON-GATING (re-review 3, orchestrator decision): kept in the matrix, gates no wave and no DONE. SF2, arm → park → release, ADDED veto-able seam. Arm 'purge:pass1:after_delete_before_stamp' with 'parkFirstN: 1'; run A par …
  test.fixme(
    "W26: two purge runs at once (the End after() and the sweep): idempotent, and the stamps are the first writer's",
    async () => {
      // pending: wave that owns W26
    }
  );
  // Oracle: SF9, C4b. Reads: events route, snapshot route, review payload (§ 2.9 inventory; 'tutor-asset' is W27b). The three absence reads: empty log; snapshot 404; no board content in the review payload. Positive control: whiteboa …
  test.fixme(
    "W27: whiteboard off, after End and before any purge pass: the events route, the snapshot route and the review payload return nothing, and those three return content for whiteboard on",
    async () => {
      // pending: wave that owns W27
    }
  );
  // Oracle: C6. 'tutor-asset' calls 'resolveReplayAccess' and returns 404 when 'board' is false, while the asset is still in the harness store (before any purge pass). Positive control: whiteboard-on returns the asset. The events, s …
  test.fixme(
    "W27b: whiteboard off, after End and before any purge pass: tutor-asset returns 404 for an asset that still exists",
    async () => {
      // pending: wave that owns W27b
    }
  );
});
