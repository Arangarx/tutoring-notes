/**
 * Consent wave — relay + extended blob harness: § 3 board-purge rows (W24 is live: the relay probe).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below except W24 is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-board-purge.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { TAG } from "../test-tags";
import { findScenePayloadEvents, openRelayClient, probeRelayRoom } from "../helpers/relay-probe";
import { PrismaClient } from "@prisma/client";
import {
  checkpointKey,
  chooseMode,
  endFromWorkspace,
  openTutorRoom,
  readCheckpointKeys,
  readSceneDraftKeys,
  sceneDraftKeys,
  seedCheckpointRow,
  seedConsentSession,
  startFromWaitingRoom,
} from "../helpers/consent-tutor-room";
import { seedStartFixture, type StartFixture } from "../helpers/consent-start-fixture";
import {
  armHold,
  expectReleasedByTest,
  invokeConsentAction,
  listHarnessBlobs,
  releaseHold,
  resetSeams,
  waitUntilParked,
} from "../helpers/consent-harness";
import {
  countBackendsWaitingOnLock,
  dropFamilyConsentVersionsAbove,
  readConsentSnapshots,
  saveFamilyConsentVersion,
} from "../helpers/consent-db-oracle";
import {
  drawTestStrokeOnRole,
  openTutorAndStudent,
  seedWbPendingLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

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
  // Arms (a) + (b): one in-person whiteboard-off session on the tutor device. (a) is the positive control that makes (b)
  // non-vacuous. At End the client also uploads no board (no events log, no snapshot image under the session prefix).
  test(
    "W15: whiteboard off: the on-device checkpoint is kept during the session and deleted at End, and a leftover one is cleared at the next workspace load",
    { tag: [TAG.WB_AV, TAG.WB_RECORDING] },
    async ({ browser, request }) => {
      test.setTimeout(300_000);
      const s = await seedConsentSession({ switches: { allowWhiteboardRecording: false } });
      const room = await openTutorRoom(browser, s);
      try {
        const own = { adminUserId: s.adminUserId, studentId: s.studentId, sessionId: s.whiteboardSessionId };
        await chooseMode(room.page, "IN_PERSON");
        await startFromWaitingRoom(room.page);
        await drawTestStrokeOnRole(room.page, "tutor", `w15-${Date.now()}`, 120, 120, 320, 220);
        await expect
          .poll(async () => (await readCheckpointKeys(room.page)).includes(checkpointKey(own)), { timeout: 60_000 })
          .toBe(true);
        await endFromWorkspace(room.page);
        await expect
          .poll(async () => (await readCheckpointKeys(room.page)).includes(checkpointKey(own)), { timeout: 15_000 })
          .toBe(false);
        const uploaded = (await listHarnessBlobs(request, `whiteboard-sessions/${s.studentId}/${s.whiteboardSessionId}/`)).map(
          (o) => o.key
        );
        // The store appends a random suffix to the name (`<ts>-events.json-<rand>`), so match the stem.
        expect(uploaded.filter((k) => /-events\.json|-snapshot\.png/.test(k))).toEqual([]);
      } finally {
        await room.close();
        await s.cleanup();
      }
    }
  );
  // Arm (c) + the persist=true control + W16's device half, all on one mount: leftovers for three sessions that ended
  // ELSEWHERE (other students of the same tutor, so today's same-student resume hygiene never reaches them):
  //   off   — snapshot whiteboard off          → persist false → cleared (checkpoint and per-tab scene draft)
  //   on    — snapshot whiteboard on           → persist true  → kept
  //   blind — no snapshot, no consent record   → capability unreadable (fail closed) → kept (W16 device half)
  // Learner device arm: the learner never writes a checkpoint for the session (none exists on the learner device).
  test(
    "W15 (c) + W16 (device half): a leftover copy of a whiteboard-off session that ended elsewhere is cleared at the next workspace load; persisted and unreadable-capability copies are kept",
    { tag: [TAG.WB_RECORDING] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const ended = { sessionPhase: "ACTIVE" as const, endedAt: new Date(Date.now() - 60 * 60_000) };
      const off = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: true });
      const on = await seedStartFixture({ record: {}, snapshot: true });
      const blind = await seedStartFixture({ record: null });
      const s = await seedConsentSession({ switches: {} });
      for (const f of [off, on, blind]) {
        await prisma.whiteboardSession.update({ where: { id: f.whiteboardSessionId }, data: ended });
      }
      const room = await openTutorRoom(browser, s);
      try {
        const cp = (f: typeof off) => ({ adminUserId: f.adminUserId, studentId: f.studentId, sessionId: f.whiteboardSessionId });
        for (const f of [off, on, blind]) {
          await expect
            .poll(() => seedCheckpointRow(room.page, cp(f)).then(() => true, () => false), { timeout: 30_000 })
            .toBe(true);
        }
        await room.page.evaluate((ids) => {
          for (const id of ids) {
            sessionStorage.setItem(`wn_wb_session_board_v1:${id}`, JSON.stringify({ v: 1, pageList: [], pages: {} }));
            sessionStorage.setItem(`wn_wb_session_elements_v1:${id}`, "[]");
          }
        }, [off, on, blind].map((f) => f.whiteboardSessionId));

        await room.page.reload({ waitUntil: "domcontentloaded" });
        await expect(room.page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
        await waitForWbE2eBridge(room.page, "tutor");

        await expect
          .poll(async () => (await readCheckpointKeys(room.page)).includes(checkpointKey(cp(off))), { timeout: 20_000 })
          .toBe(false);
        const keys = await readCheckpointKeys(room.page);
        expect(keys).toContain(checkpointKey(cp(on)));
        expect(keys).toContain(checkpointKey(cp(blind)));
        const drafts = await readSceneDraftKeys(room.page);
        for (const k of sceneDraftKeys(off.whiteboardSessionId)) expect(drafts).not.toContain(k);
        for (const k of [...sceneDraftKeys(on.whiteboardSessionId), ...sceneDraftKeys(blind.whiteboardSessionId)]) {
          expect(drafts).toContain(k);
        }
      } finally {
        await room.close();
        await s.cleanup();
        for (const f of [off, on, blind]) await f.cleanup();
      }

      const live = await seedConsentSession({ switches: { allowWhiteboardRecording: false } });
      const pair = await openTutorAndStudent(browser, live, { ensureFollow: false, autoStart: true });
      try {
        await drawTestStrokeOnRole(pair.studentPage, "student", `w15-student-${Date.now()}`, 120, 120, 320, 220);
        await pair.studentPage.waitForTimeout(35_000);
        expect(await readCheckpointKeys(pair.studentPage)).toEqual([]);
      } finally {
        await pair.close();
        await live.cleanup();
      }
    }
  );
  // Oracle: Fault: snapshot unreadable → no server deletes, intent retained, retry later. The device-side half: with the capability unreadable the load-time cleanup does not delete the local checkpoint (deleting on an unknown answer …
  // Server half (purge intent / deletes) is C4b. The device half is live above (C3b).
  test.fixme(
    "W16: unknown capability does not purge, and a whiteboard-off session's local copy is not cleared on an unreadable capability",
    async () => {
      // pending: C4b owns the server half (no server deletes on an unreadable capability)
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
  // PENDING sessions on the plain-owned harness tutor, so End writes the snapshot and no org lock is held while parked.
  test(
    "W18: double End is a no-op, including when the two Ends overlap, and writes no second snapshot",
    async ({ request }) => {
      const seeded = await seedWbPendingLiveSyncSession();
      const { learnerProfileId, adminUserId } = seeded;
      const end = (sessionId: string) =>
        invokeConsentAction(request, "endWhiteboardSession", sessionId, { finalEventsBlobUrl: "" });
      const readEnd = (sessionId: string) =>
        prisma.whiteboardSession.findUniqueOrThrow({ where: { id: sessionId }, select: { endedAt: true } });
      await dropFamilyConsentVersionsAbove(learnerProfileId, adminUserId, 1);
      try {
        // (a) Sequential: the second End is refused and moves nothing.
        const seqId = seeded.whiteboardSessionId;
        const firstEnd = await end(seqId);
        expect(firstEnd.status(), await firstEnd.text()).toBe(200);
        const endedOnce = await readEnd(seqId);
        const snapOnce = await readConsentSnapshots(seqId);
        expect(endedOnce.endedAt).not.toBeNull();
        expect(snapOnce).toHaveLength(1);
        await saveFamilyConsentVersion(learnerProfileId, adminUserId, { allowWhiteboardRecording: false });
        expect((await end(seqId)).ok()).toBe(false);
        expect(await readEnd(seqId)).toEqual(endedOnce);
        expect(await readConsentSnapshots(seqId)).toEqual(snapOnce);

        // (b) Overlapping: A parks inside its End transaction; B is fired while A is parked.
        const id = (await seedWbPendingLiveSyncSession()).whiteboardSessionId;
        await armHold(request, { name: "end:tx:before_update", sessionId: id, parkFirstN: 1 });
        const endA = end(id);
        await waitUntilParked(request, "end:tx:before_update", id);
        let bSettled = false;
        const endB = end(id).finally(() => {
          bSettled = true;
        });
        // B has either finished (no lock to wait on) or is blocked on A's row lock.
        await expect
          .poll(async () => bSettled || (await countBackendsWaitingOnLock()) > 0, { timeout: 2_000 })
          .toBe(true);
        const flipStartMs = Date.now();
        const flipped = await saveFamilyConsentVersion(learnerProfileId, adminUserId, {
          allowWhiteboardRecording: false,
          allowAudioRecording: false,
        });
        await releaseHold(request, "end:tx:before_update", id);
        const [resA, resB] = await Promise.all([endA, endB]);
        await expectReleasedByTest(request, "end:tx:before_update", id);

        // Exactly one End wins, and it is A (the one holding the row).
        expect([resA.ok(), resB.ok()], `A ${resA.status()} / B ${resB.status()}`).toEqual([true, false]);
        const winner = (await resA.json()) as { result: { endedAt: string } };
        const row = await readEnd(id);
        expect(row.endedAt?.toISOString()).toBe(winner.result.endedAt);
        expect(
          await prisma.productEvent.count({ where: { whiteboardSessionId: id, kind: "SESSION_ENDED" } })
        ).toBeLessThanOrEqual(1);

        // One snapshot row, read when A committed: after the flip.
        const snaps = await readConsentSnapshots(id);
        expect(snaps).toHaveLength(1);
        expect(snaps[0]).toMatchObject({
          consentRecordId: flipped.id,
          consentRecordVersion: flipped.version,
          allowWhiteboardRecording: false,
          allowAudioRecording: false,
        });
        expect(snaps[0].frozenAt.getTime()).toBeGreaterThanOrEqual(flipStartMs);
      } finally {
        await resetSeams(request);
        await dropFamilyConsentVersionsAbove(learnerProfileId, adminUserId, 1);
      }
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
  // Seeds three tutor-owned sessions (rows written straight to Postgres, never through the code under test):
  //   live      whiteboard off, not ended   -> a live session mints even with the board off (persist is not the gate)
  //   offEnded  whiteboard off, ended       -> mint refused (the board must not be recreated)
  //   onEnded   whiteboard on,  ended       -> mint still allowed (its board persists; a late write is W12/C4b's business)
  // Refusal oracle = the HTTP response of the real token route: non-2xx and no client token in the body.
  // The tutor path has two branches (whiteboard-asset; whiteboard-events/-snapshot), so every arm runs on all three kinds.
  // Three tests so each arm is red on its own (a failing prefix arm must not hide the endedAt arm).
  const W19_KINDS = [
    { kind: "whiteboard-events", file: "1-events.json" },
    { kind: "whiteboard-snapshot", file: "1-snapshot.png" },
    { kind: "whiteboard-asset", file: "assets/1-image.png" },
  ] as const;
  type W19Kind = (typeof W19_KINDS)[number]["kind"];
  type W19Sessions = { live: StartFixture; offEnded: StartFixture; onEnded: StartFixture };

  async function withW19Sessions(run: (s: W19Sessions) => Promise<void>): Promise<void> {
    const ended = { sessionPhase: "ACTIVE" as const, endedAt: new Date(Date.now() - 60 * 60_000) };
    const live = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: true });
    const offEnded = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: true });
    const onEnded = await seedStartFixture({ record: {}, snapshot: true });
    try {
      await prisma.whiteboardSession.update({ where: { id: live.whiteboardSessionId }, data: { sessionPhase: "ACTIVE" } });
      for (const f of [offEnded, onEnded]) {
        await prisma.whiteboardSession.update({ where: { id: f.whiteboardSessionId }, data: ended });
      }
      await run({ live, offEnded, onEnded });
    } finally {
      for (const f of [live, offEnded, onEnded]) await f.cleanup();
    }
  }

  async function mintW19(
    request: APIRequestContext,
    f: StartFixture,
    kind: W19Kind,
    pathname: string
  ): Promise<{ status: number; token: boolean; text: string }> {
    const res = await request.post("/api/upload/blob", {
      data: {
        type: "blob.generate-client-token",
        payload: {
          pathname,
          clientPayload: JSON.stringify({ kind, whiteboardSessionId: f.whiteboardSessionId, studentId: f.studentId }),
          multipart: false,
        },
      },
    });
    const text = await res.text();
    return { status: res.status(), token: /"putToken"|"clientToken"/.test(text), text };
  }

  const w19Own = (f: StartFixture, file: string) => `whiteboard-sessions/${f.studentId}/${f.whiteboardSessionId}/${file}`;

  test(
    "W19: tutor-path whiteboard upload outside the session prefix is refused at token mint",
    { tag: [TAG.WB_ASSETS] },
    async ({ request }) => {
      test.setTimeout(120_000);
      await withW19Sessions(async ({ live, onEnded }) => {
        for (const { kind, file } of W19_KINDS) {
          // another tenant's namespace
          const foreign = await mintW19(request, live, kind, "whiteboard-sessions/other/other/x");
          expect(foreign.status, `${kind} foreign prefix must be refused`).toBeGreaterThanOrEqual(400);
          expect(foreign.token, `${kind} foreign prefix must not receive a token`).toBe(false);
          // right student, another session's prefix
          const otherSession = await mintW19(
            request,
            live,
            kind,
            `whiteboard-sessions/${live.studentId}/${onEnded.whiteboardSessionId}/${file}`
          );
          expect(otherSession.status, `${kind} other session's prefix must be refused`).toBeGreaterThanOrEqual(400);
          expect(otherSession.token, `${kind} other session's prefix must not receive a token`).toBe(false);
          // concat-audio shape (concat-audio.ts): the trailing slash keeps it off the session prefix
          const concat = await mintW19(
            request,
            live,
            kind,
            `whiteboard-sessions/${live.adminUserId}/${live.studentId}/${live.whiteboardSessionId}-concat.webm`
          );
          expect(concat.status, `${kind} concat-audio path must be refused`).toBeGreaterThanOrEqual(400);
          expect(concat.token, `${kind} concat-audio path must not receive a token`).toBe(false);
          // the admin/student namespace the old test helpers used is not the session prefix either
          const adminNs = await mintW19(request, live, kind, `whiteboard-sessions/${live.adminUserId}/${live.studentId}/${file}`);
          expect(adminNs.status, `${kind} admin/student namespace must be refused`).toBeGreaterThanOrEqual(400);
          expect(adminNs.token, `${kind} admin/student namespace must not receive a token`).toBe(false);
        }
      });
    }
  );

  test(
    "W19: tutor-path whiteboard upload after End on a whiteboard-off session is refused at token mint",
    { tag: [TAG.WB_ASSETS] },
    async ({ request }) => {
      test.setTimeout(120_000);
      await withW19Sessions(async ({ offEnded }) => {
        for (const { kind, file } of W19_KINDS) {
          // own prefix, session ended, whiteboard persist false
          const afterEnd = await mintW19(request, offEnded, kind, w19Own(offEnded, file));
          expect(afterEnd.status, `${kind} ended whiteboard-off session must be refused`).toBeGreaterThanOrEqual(400);
          expect(afterEnd.token, `${kind} ended whiteboard-off session must not receive a token`).toBe(false);
        }
      });
    }
  );

  test(
    "W19 (controls): a live session, and an ended whiteboard-on session, still mint on the correct session prefix",
    { tag: [TAG.WB_ASSETS] },
    async ({ request }) => {
      test.setTimeout(120_000);
      await withW19Sessions(async ({ live, onEnded }) => {
        for (const { kind, file } of W19_KINDS) {
          const liveOk = await mintW19(request, live, kind, w19Own(live, file));
          expect(liveOk.status, `${kind} live session, own prefix: ${liveOk.text}`).toBe(200);
          expect(liveOk.token, `${kind} live session must receive a token`).toBe(true);
          const onEndedOk = await mintW19(request, onEnded, kind, w19Own(onEnded, file));
          expect(onEndedOk.status, `${kind} ended whiteboard-on session, own prefix: ${onEndedOk.text}`).toBe(200);
          expect(onEndedOk.token, `${kind} ended whiteboard-on session must still receive a token`).toBe(true);
        }
      });
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
