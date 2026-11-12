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
  armFault,
  armHold,
  disarmFault,
  expectReleasedByTest,
  failBlobDeletesMatching,
  invokeConsentAction,
  listHarnessBlobs,
  releaseHold,
  resetBlobHarness,
  resetSeams,
  runCron,
  seedHarnessBlobs,
  waitUntilParked,
} from "../helpers/consent-harness";
import {
  backdateBoardPurgeFirstPass,
  countBackendsWaitingOnLock,
  countEventBatches,
  dropFamilyConsentVersionsAbove,
  expectBatchCount,
  readConsentSnapshots,
  saveFamilyConsentVersion,
} from "../helpers/consent-db-oracle";
import { seedTestAdmin } from "../visual/helpers";
import { replayEventsFixture } from "./wb-replay-harness.helpers";
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
// C4b purge helpers. Every oracle is the database row or the harness store listing, never the code's own report.
// ---------------------------------------------------------------------------

const CLEANUP = "/api/cron/session-cleanup" as const;
/** Far past any pass-2 delay the plan allows (the platform's default upload token lives one hour). */
const PAST_PASS_2_DELAY_MS = 2 * 60 * 60_000;
/** Same origin the server builds harness URLs from (`NEXTAUTH_URL` on the wb-regression webServer). */
const HARNESS_ORIGIN = "http://localhost:3100";

function harnessUrl(key: string): string {
  return `${HARNESS_ORIGIN}/api/test/blob/object/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** The shape `create-session-core.ts` writes at create (`emptyEventsJson`). */
const EMPTY_LOG = JSON.stringify({ schemaVersion: 1, startedAt: "2026-11-12T18:00:00.000Z", durationMs: 0, events: [] });

type BoardFixture = StartFixture & { sessionPrefix: string; checkpointPrefix: string; placeholderUrl: string };

/**
 * An isolated tutor-owned session whose snapshot says whiteboard on/off, with the create-time placeholder
 * events log the product writes OUTSIDE the session prefix (`whiteboard-sessions/<adminUserId>/<studentId>/`).
 */
async function seedBoardSession(
  request: APIRequestContext,
  whiteboard: boolean,
  phase: "ACTIVE" | "PENDING" = "ACTIVE"
): Promise<BoardFixture> {
  const f = await seedStartFixture({ record: { allowWhiteboardRecording: whiteboard }, snapshot: true });
  const placeholderKey = `whiteboard-sessions/${f.adminUserId}/${f.studentId}/${Date.now()}-events.json`;
  await seedHarnessBlobs(request, [{ key: placeholderKey, text: EMPTY_LOG, contentType: "application/json" }]);
  const now = Date.now();
  await prisma.whiteboardSession.update({
    where: { id: f.whiteboardSessionId },
    data: {
      eventsBlobUrl: harnessUrl(placeholderKey),
      ...(phase === "ACTIVE"
        ? { sessionPhase: "ACTIVE", activatedAt: new Date(now), startedAt: new Date(now - 10 * 60_000) }
        : {}),
    },
  });
  return {
    ...f,
    sessionPrefix: `whiteboard-sessions/${f.studentId}/${f.whiteboardSessionId}/`,
    checkpointPrefix: `whiteboard-checkpoints/${f.whiteboardSessionId}/`,
    placeholderUrl: harnessUrl(placeholderKey),
  };
}

type BoardKeys = { events: string; snapshot: string; image: string; pdfPage: string; checkpoint: string };

/** A board's worth of data: batch rows, the client's events log and snapshot, an image, a PDF page, a legacy checkpoint. */
async function seedBoard(request: APIRequestContext, b: BoardFixture, batches = 2): Promise<BoardKeys> {
  await prisma.whiteboardEventBatch.createMany({
    data: Array.from({ length: batches }, (_, i) => ({
      whiteboardSessionId: b.whiteboardSessionId,
      batchSeq: i + 1,
      fromEventIndex: i,
      toEventIndex: i + 1,
      eventsJson: [{ t: i * 10, type: "add", id: `pw-el-${i}` }],
      boardDocumentJson: { pages: [{ id: "p1", elements: [`pw-el-${i}`] }] },
      schemaVersion: 1,
    })),
  });
  const keys: BoardKeys = {
    events: `${b.sessionPrefix}1-events.json`,
    snapshot: `${b.sessionPrefix}1-snapshot.png`,
    image: `${b.sessionPrefix}assets/1-image.png`,
    pdfPage: `${b.sessionPrefix}assets/pdf-1-page-1.png`,
    checkpoint: `${b.checkpointPrefix}1-checkpoint.json`,
  };
  await seedHarnessBlobs(request, [
    { key: keys.events, text: replayEventsFixture(), contentType: "application/json" },
    { key: keys.snapshot, text: "pw-board-snapshot-png", contentType: "image/png" },
    { key: keys.image, text: "pw-board-image-png", contentType: "image/png" },
    { key: keys.pdfPage, text: "pw-board-pdf-page-png", contentType: "image/png" },
    { key: keys.checkpoint, text: replayEventsFixture(), contentType: "application/json" },
  ]);
  return keys;
}

/** End the way the client does: the uploaded events log and snapshot URLs ride on the End call. */
function endWithBoard(request: APIRequestContext, b: BoardFixture, keys: BoardKeys) {
  return invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
    finalEventsBlobUrl: harnessUrl(keys.events),
    opts: { snapshotBlobUrl: harnessUrl(keys.snapshot) },
  });
}

const readPurgeRow = (id: string) =>
  prisma.whiteboardSession.findUniqueOrThrow({
    where: { id },
    select: {
      endedAt: true,
      eventsBlobUrl: true,
      snapshotBlobUrl: true,
      boardPurgeRequestedAt: true,
      boardPurgeFirstPassAt: true,
      boardPurgeAttemptedAt: true,
      boardPurgedAt: true,
    },
  });

async function keysUnder(request: APIRequestContext, prefix: string): Promise<string[]> {
  return (await listHarnessBlobs(request, prefix)).map((o) => o.key);
}

/** Everything a client could have written for this board (session prefix + legacy checkpoint prefix). */
async function boardKeys(request: APIRequestContext, b: BoardFixture): Promise<string[]> {
  return [...(await keysUnder(request, b.sessionPrefix)), ...(await keysUnder(request, b.checkpointPrefix))];
}

async function sweep(request: APIRequestContext) {
  const r = await runCron(request, CLEANUP);
  expect(r.status, r.text).toBe(200);
  return r;
}

async function waitForFirstPass(id: string, timeout = 20_000) {
  await expect
    .poll(async () => (await readPurgeRow(id)).boardPurgeFirstPassAt !== null, {
      timeout,
      message: `boardPurgeFirstPassAt for ${id}`,
    })
    .toBe(true);
}

/** Pass 2 through the real sweep: the data seam moves pass 1 into the past, then the cron route runs. */
async function sweepPassTwo(request: APIRequestContext, id: string) {
  expect(await backdateBoardPurgeFirstPass(id, PAST_PASS_2_DELAY_MS), "pass 1 must have stamped first").toBe(1);
  await sweep(request);
}

/** Keeps the End `after()` purge from running (W22's crash), so a test can read the state before any pass. */
async function blockAfterPurge(request: APIRequestContext, id: string) {
  await armFault(request, { name: "end:after_purge", sessionId: id });
}

type OrgBoard = BoardFixture & { organizationId: string; ownerAdminUserId: string };

/**
 * An org-owned session (student owned by the org, consent recorded by the org) taught by `teacherId`,
 * in an org the signed-in harness tutor owns. Rows written straight to Postgres.
 */
async function seedOrgBoardSession(
  request: APIRequestContext,
  opts: { whiteboard: boolean; teacherId?: string; orgStatusChangedAt?: Date; orgStatus?: "active" | "suspended" }
): Promise<OrgBoard> {
  const harnessTutor = await seedTestAdmin();
  const teacherId = opts.teacherId ?? harnessTutor;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      name: `C4b org ${stamp}`,
      status: opts.orgStatus ?? "active",
      timezone: "America/Denver",
      statusChangedAt: opts.orgStatusChangedAt ?? new Date(),
      createdByOperatorId: "playwright@test.local",
      members: {
        create: [
          { adminUserId: harnessTutor, roles: ["owner", "instructor"] as ("owner" | "instructor")[] },
          ...(teacherId !== harnessTutor
            ? [{ adminUserId: teacherId, roles: ["instructor"] as ("owner" | "instructor")[] }]
            : []),
        ],
      },
    },
    select: { id: true },
  });
  const holder = await prisma.accountHolder.create({
    data: {
      email: `pw-c4b-${stamp}@test.local`,
      emailVerifiedAt: new Date("2026-01-01"),
      familyId: `c4b${stamp.replace(/[^a-z0-9]/g, "")}`.slice(0, 20),
    },
    select: { id: true },
  });
  const profile = await prisma.learnerProfile.create({
    data: { accountHolderId: holder.id, displayName: `C4b Org Learner ${stamp}` },
    select: { id: true },
  });
  const student = await prisma.student.create({
    data: { name: `C4b Org Student ${stamp}`, adminUserId: null, organizationId: org.id, learnerProfileId: profile.id },
    select: { id: true },
  });
  await prisma.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId: org.id,
      givenName: "C4b",
      familyName: "Learner",
      createdByAdminUserId: harnessTutor,
    },
  });
  const switches = {
    allowLiveSession: true,
    allowAudioRecording: true,
    allowWhiteboardRecording: opts.whiteboard,
    allowNoteSending: true,
  };
  const record = await prisma.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: null,
      organizationId: org.id,
      version: 1,
      ...switches,
      setByAccountHolderId: holder.id,
      captureMethod: "electronic",
    },
    select: { id: true, version: true },
  });
  const now = Date.now();
  const placeholderKey = `whiteboard-sessions/${teacherId}/${student.id}/${now}-events.json`;
  await seedHarnessBlobs(request, [{ key: placeholderKey, text: EMPTY_LOG, contentType: "application/json" }]);
  const session = await prisma.whiteboardSession.create({
    data: {
      adminUserId: teacherId,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl: harnessUrl(placeholderKey),
      sessionPhase: "ACTIVE",
      startedAt: new Date(now - 10 * 60_000),
      activatedAt: new Date(now - 10 * 60_000),
      lastActiveAt: new Date(now),
    },
    select: { id: true },
  });
  await prisma.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId: session.id,
      ...switches,
      consentRecordId: record.id,
      consentRecordVersion: record.version,
    },
  });
  return {
    adminUserId: teacherId,
    ownerAdminUserId: harnessTutor,
    organizationId: org.id,
    studentId: student.id,
    learnerProfileId: profile.id,
    whiteboardSessionId: session.id,
    sessionPrefix: `whiteboard-sessions/${student.id}/${session.id}/`,
    checkpointPrefix: `whiteboard-checkpoints/${session.id}/`,
    placeholderUrl: harnessUrl(placeholderKey),
    // Org rows are left in place, like the other org specs; nothing else reads this org.
    cleanup: async () => {},
  };
}

/** A batch the way the recorder posts it (`useWhiteboardRecorder` WS-B), through the real checkpoint route. */
function postBatch(request: APIRequestContext, sessionId: string, batchSeq: number) {
  return request.post(`/api/whiteboard/${sessionId}/checkpoint`, {
    data: {
      batchSeq,
      fromEventIndex: batchSeq - 1,
      toEventIndex: batchSeq,
      eventsJson: JSON.stringify([{ t: batchSeq * 10, type: "add", id: `pw-late-${batchSeq}` }]),
      boardDocumentJson: { pages: [{ id: "p1", elements: [`pw-late-${batchSeq}`] }] },
      schemaVersion: 1,
    },
  });
}

// ---------------------------------------------------------------------------
// 6e. Whiteboard
// ---------------------------------------------------------------------------
test.describe("consent 6e: Whiteboard", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC, TAG.WB_STROKES],
}, () => {
  // Oracle: 'WhiteboardEventBatch' count 0; harness listing has no 'whiteboard-checkpoints/<id>/' keys; events URL serves an empty log
  test(
    "W3: whiteboard off: at End the stroke log, batches and checkpoints are deleted",
    async ({ request }) => {
      const b = await seedBoardSession(request, false);
      try {
        const keys = await seedBoard(request, b);
        await expectBatchCount(b.whiteboardSessionId, "some");
        expect(await keysUnder(request, b.checkpointPrefix)).toEqual([keys.checkpoint]);

        const end = await endWithBoard(request, b, keys);
        expect(end.status(), await end.text()).toBe(200);
        await waitForFirstPass(b.whiteboardSessionId);

        expect(await countEventBatches(b.whiteboardSessionId)).toBe(0);
        expect(await keysUnder(request, b.checkpointPrefix)).toEqual([]);
        expect(await keysUnder(request, b.sessionPrefix)).not.toContain(keys.events);
        // The events URL serves an empty log: the row points back at the placeholder, not the client's upload.
        expect((await readPurgeRow(b.whiteboardSessionId)).eventsBlobUrl).toBe(b.placeholderUrl);
        const events = await request.get(`/api/whiteboard/${b.whiteboardSessionId}/events`);
        expect(events.status(), await events.text()).toBe(200);
        expect(((await events.json()) as { events: unknown[] }).events).toEqual([]);
      } finally {
        await b.cleanup();
      }
    }
  );
  // Oracle: Harness listing under 'whiteboard-sessions/<studentId>/<sessionId>/' empty
  test(
    "W4: whiteboard off: embedded image and PDF asset blobs are deleted at End",
    { tag: [TAG.WB_ASSETS] },
    async ({ request }) => {
      const b = await seedBoardSession(request, false);
      try {
        const keys = await seedBoard(request, b);
        expect(await keysUnder(request, b.sessionPrefix)).toEqual(
          expect.arrayContaining([keys.image, keys.pdfPage])
        );
        const end = await endWithBoard(request, b, keys);
        expect(end.status(), await end.text()).toBe(200);
        await waitForFirstPass(b.whiteboardSessionId);
        expect(await keysUnder(request, b.sessionPrefix)).toEqual([]);
      } finally {
        await b.cleanup();
      }
    }
  );
  // Oracle: 'snapshotBlobUrl' null; notes generation input has no image
  // Notes generation reads no image at all (no notes path reads `snapshotBlobUrl`); the stored snapshot is the
  // only board image, so the oracle is: no URL on the row, the snapshot route has nothing, the blob is gone.
  test(
    "W5: whiteboard off: no board snapshot image is stored or used in notes",
    async ({ request }) => {
      const b = await seedBoardSession(request, false);
      try {
        const keys = await seedBoard(request, b);
        const end = await endWithBoard(request, b, keys);
        expect(end.status(), await end.text()).toBe(200);
        expect((await readPurgeRow(b.whiteboardSessionId)).snapshotBlobUrl).toBeNull();
        const snapshot = await request.get(`/api/whiteboard/${b.whiteboardSessionId}/snapshot`);
        expect(snapshot.status()).toBe(404);
        await waitForFirstPass(b.whiteboardSessionId);
        expect(await keysUnder(request, b.sessionPrefix)).not.toContain(keys.snapshot);
      } finally {
        await b.cleanup();
      }
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
  test(
    "W7: whiteboard off: forced-end late upload cannot recreate the board",
    { tag: [TAG.ORG] },
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedOrgBoardSession(request, { whiteboard: false });
      try {
        await seedBoard(request, b);
        // Operator suspends the org with "End it now": the session ends at the stamp, the upload window opens.
        const suspend = await invokeConsentAction(request, "setOrganizationStatus", b.organizationId, {
          status: "suspended",
          choice: "now",
        });
        expect(suspend.status(), await suspend.text()).toBe(200);
        const ended = await readPurgeRow(b.whiteboardSessionId);
        expect(ended.endedAt).not.toBeNull();
        await waitForFirstPass(b.whiteboardSessionId);

        // A stale client then uploads its events log under the session prefix and posts the late End.
        const lateKey = `${b.sessionPrefix}2-events.json`;
        await seedHarnessBlobs(request, [{ key: lateKey, text: replayEventsFixture(), contentType: "application/json" }]);
        const late = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: harnessUrl(lateKey),
        });
        expect(late.status(), await late.text()).toBe(200);
        // No URL is recorded anywhere: the row still names the placeholder and no snapshot.
        const after = await readPurgeRow(b.whiteboardSessionId);
        expect(after.eventsBlobUrl).toBe(b.placeholderUrl);
        expect(after.snapshotBlobUrl).toBeNull();
        // A late batch is refused inside the upload window too.
        const batch = await postBatch(request, b.whiteboardSessionId, 9);
        expect(batch.status()).toBe(409);

        await sweepPassTwo(request, b.whiteboardSessionId);
        expect(await boardKeys(request, b)).toEqual([]);
        expect(await countEventBatches(b.whiteboardSessionId)).toBe(0);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
      } finally {
        await b.cleanup();
      }
    }
  );
  // Oracle: Fault-injected delete; DB columns after each sweep; uses the pass-2 backdate seam (§ 3.3): sweep 1 fails and stamps 'boardPurgeAttemptedAt', sweep 2 passes pass 1, backdate, sweep 3 passes pass 2 and stamps 'boardPurgedA …
  test(
    "W8: whiteboard off: a failed blob delete is retried by the purge sweep and boardPurgedAt is stamped",
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedBoardSession(request, false);
      try {
        await seedBoard(request, b);
        await blockAfterPurge(request, b.whiteboardSessionId);
        const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: b.placeholderUrl,
        });
        expect(end.status(), await end.text()).toBe(200);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgeRequestedAt).not.toBeNull();

        // Sweep 1: every delete under this board fails. The attempt is stamped, pass 1 is not.
        await failBlobDeletesMatching(request, b.sessionPrefix);
        const before = await boardKeys(request, b);
        expect(before.length).toBeGreaterThan(0);
        await sweep(request);
        const afterFail = await readPurgeRow(b.whiteboardSessionId);
        expect(afterFail.boardPurgeAttemptedAt).not.toBeNull();
        expect(afterFail.boardPurgeFirstPassAt).toBeNull();
        expect(afterFail.boardPurgedAt).toBeNull();
        expect(await keysUnder(request, b.sessionPrefix)).toEqual(
          before.filter((k) => k.startsWith(b.sessionPrefix))
        );

        // The fault clears (the harness reset also drops the store, so the surviving blobs are put back).
        await resetBlobHarness(request);
        await seedHarnessBlobs(request, before.map((key) => ({ key, text: "pw-survivor" })));
        // Sweep 2: pass 1 succeeds.
        await sweep(request);
        const pass1 = await readPurgeRow(b.whiteboardSessionId);
        expect(pass1.boardPurgeFirstPassAt).not.toBeNull();
        expect(pass1.boardPurgedAt).toBeNull();
        expect(await boardKeys(request, b)).toEqual([]);
        // Sweep 3, after the backdate: pass 2 succeeds and the intent is complete.
        await sweepPassTwo(request, b.whiteboardSessionId);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
      } finally {
        await resetSeams(request);
        await b.cleanup();
      }
    }
  );
  // Oracle: Count > 0 before, 0 after; a purge test cannot pass on an empty store
  test(
    "W10: whiteboard off: batches exist before End and are gone after (positive control)",
    async ({ request }) => {
      const off = await seedBoardSession(request, false);
      const on = await seedBoardSession(request, true);
      try {
        for (const b of [off, on]) {
          await seedBoard(request, b, 3);
          await expectBatchCount(b.whiteboardSessionId, "some");
          await blockAfterPurge(request, b.whiteboardSessionId);
          const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
            finalEventsBlobUrl: b.placeholderUrl,
          });
          expect(end.status(), await end.text()).toBe(200);
        }
        // Inside the End transaction, before any purge pass.
        expect(await countEventBatches(off.whiteboardSessionId)).toBe(0);
        expect((await readPurgeRow(off.whiteboardSessionId)).boardPurgeFirstPassAt).toBeNull();
        // Control: whiteboard on keeps every batch.
        expect(await countEventBatches(on.whiteboardSessionId)).toBe(3);
      } finally {
        await resetSeams(request);
        await off.cleanup();
        await on.cleanup();
      }
    }
  );
  // Oracle: Zero rows asserted BEFORE any purge pass has run ('boardPurgeFirstPassAt' still null), with the checkpoint hold seam parking the late batch between 'assertActiveSession' and the transaction, so it is red without the in-t …
  test(
    "W11: whiteboard off: a batch POST racing End leaves no WhiteboardEventBatch row",
    async ({ request }) => {
      test.setTimeout(120_000);
      const off = await seedBoardSession(request, false);
      const on = await seedBoardSession(request, true);
      try {
        const race = async (b: BoardFixture) => {
          await blockAfterPurge(request, b.whiteboardSessionId);
          await armHold(request, { name: "checkpoint:batch:before_txn", sessionId: b.whiteboardSessionId });
          // The batch passes the active-session check, then parks before its transaction.
          const batch = postBatch(request, b.whiteboardSessionId, 1);
          await waitUntilParked(request, "checkpoint:batch:before_txn", b.whiteboardSessionId);
          const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
            finalEventsBlobUrl: b.placeholderUrl,
          });
          expect(end.status(), await end.text()).toBe(200);
          expect(await releaseHold(request, "checkpoint:batch:before_txn", b.whiteboardSessionId)).toBe(1);
          const settled = await batch;
          await expectReleasedByTest(request, "checkpoint:batch:before_txn", b.whiteboardSessionId);
          return settled;
        };

        const offBatch = await race(off);
        expect(offBatch.status(), await offBatch.text()).toBe(409);
        // Zero rows before any purge pass has run: only the in-transaction check could have stopped it.
        expect((await readPurgeRow(off.whiteboardSessionId)).boardPurgeFirstPassAt).toBeNull();
        expect(await countEventBatches(off.whiteboardSessionId)).toBe(0);

        // Control: whiteboard on, the same race keeps the batch (the board is wanted).
        const onBatch = await race(on);
        expect(onBatch.ok(), await onBatch.text()).toBe(true);
        expect(await countEventBatches(on.whiteboardSessionId)).toBe(1);

        // And no later pass brings a row back.
        await resetSeams(request);
        await sweep(request);
        await sweepPassTwo(request, off.whiteboardSessionId);
        expect(await countEventBatches(off.whiteboardSessionId)).toBe(0);
      } finally {
        await resetSeams(request);
        await off.cleanup();
        await on.cleanup();
      }
    }
  );
  // Oracle: Token minted pre-End via the harness (with the explicit 'validUntil', § 3.3); PUT after End; listing still has the blob after pass 1 and without the backdate (negative arm: proves the delay is real); empty after the back …
  // PLAYWRIGHT-GAP: real Vercel Blob validUntil enforcement (including a PUT begun before validUntil finishing after it, and a multipart part request arriving after it)
  // The harness store does not expire tokens, so this proves only the second pass; the token lifetime itself is
  // pinned in jest (`upload-blob-whiteboard-valid-until.test.ts`) and BACKLOG `BLOB-VALIDUNTIL-REAL`.
  test(
    "W12: whiteboard off: an asset PUT with a pre-End token that lands after End is removed by the second pass",
    { tag: [TAG.WB_ASSETS] },
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedBoardSession(request, false);
      try {
        const mintRes = await request.post("/api/upload/blob", {
          data: {
            type: "blob.generate-client-token",
            payload: {
              pathname: `${b.sessionPrefix}assets/late-image.png`,
              clientPayload: JSON.stringify({
                kind: "whiteboard-asset",
                whiteboardSessionId: b.whiteboardSessionId,
                studentId: b.studentId,
                assetTag: "image",
              }),
              multipart: false,
            },
          },
        });
        expect(mintRes.status(), await mintRes.text()).toBe(200);
        const mint = (await mintRes.json()) as { putUrl: string; putToken: string };

        const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: b.placeholderUrl,
        });
        expect(end.status(), await end.text()).toBe(200);
        await waitForFirstPass(b.whiteboardSessionId);

        const put = await request.put(mint.putUrl, {
          data: "pw-late-image-png",
          headers: { "content-type": "image/png", "x-blob-harness-put-token": mint.putToken },
        });
        expect(put.ok(), await put.text()).toBe(true);
        expect(await keysUnder(request, b.sessionPrefix)).toHaveLength(1);

        // Negative arm: a sweep before the delay leaves the late blob and does not complete the purge.
        await sweep(request);
        expect(await keysUnder(request, b.sessionPrefix)).toHaveLength(1);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).toBeNull();

        await sweepPassTwo(request, b.whiteboardSessionId);
        expect(await keysUnder(request, b.sessionPrefix)).toEqual([]);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
      } finally {
        await b.cleanup();
      }
    }
  );
  // Oracle: Arm A: the End call fails after the upload (nothing from the client is trusted; the blob is under the prefix). Arm B: the tab closes and no End ever arrives: the reaper (§ 3.9, depends on C4c, APPROVED) ends the session  …
  // Arm A only. Arm B (closed tab, the reaper ends it) lands with C4c.
  test(
    "W13: whiteboard off: a client-uploaded events.json survives neither a failed End nor a closed tab",
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedBoardSession(request, false);
      try {
        const keys = await seedBoard(request, b);
        // The End call fails after the client's upload landed under the session prefix.
        const failed = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: "ftp://not-a-blob/events.json",
        });
        expect(failed.ok()).toBe(false);
        expect((await readPurgeRow(b.whiteboardSessionId)).endedAt).toBeNull();
        expect(await keysUnder(request, b.sessionPrefix)).toContain(keys.events);

        // The session is ended stale later; nothing from the client is trusted, the prefix is cleared.
        const stale = await invokeConsentAction(request, "endStaleWhiteboardSession", b.whiteboardSessionId);
        expect(stale.status(), await stale.text()).toBe(200);
        await waitForFirstPass(b.whiteboardSessionId);
        await sweepPassTwo(request, b.whiteboardSessionId);
        expect(await boardKeys(request, b)).toEqual([]);
      } finally {
        await b.cleanup();
      }
    }
  );
  // Oracle: Parametrized over the five stamp callers ('org-scope' ×2, 'org-force-end-touch', 'endStaleWhiteboardSession', the reaper); intent columns + listing
  // The reaper arm lands with C4c.
  for (const caller of ["endStaleWhiteboardSession", "setOrganizationStatus", "removeOrgMember", "orgForceEndTouch"] as const) {
    test(
      `W14: whiteboard off: stale end, forced end and org forced end each write a purge intent and purge (${caller})`,
      { tag: [TAG.ORG] },
      async ({ request }) => {
        test.setTimeout(120_000);
        const teacherId =
          caller === "removeOrgMember"
            ? (
                await prisma.adminUser.create({
                  data: {
                    email: `pw-c4b-removed-${Date.now()}@test.local`,
                    role: "TUTOR",
                    approvalStatus: "APPROVED",
                    emailVerifiedAt: new Date("2026-01-01"),
                    displayName: "C4b Removed Teacher",
                  },
                  select: { id: true },
                })
              ).id
            : undefined;
        const b =
          caller === "endStaleWhiteboardSession"
            ? await seedBoardSession(request, false)
            : await seedOrgBoardSession(request, {
                whiteboard: false,
                teacherId,
                ...(caller === "orgForceEndTouch"
                  ? { orgStatus: "suspended" as const, orgStatusChangedAt: new Date(Date.now() - 2 * 60 * 60_000) }
                  : {}),
              });
        try {
          await seedBoard(request, b);
          const before = await boardKeys(request, b);
          expect(before.length).toBeGreaterThan(0);

          if (caller === "endStaleWhiteboardSession") {
            const r = await invokeConsentAction(request, caller, b.whiteboardSessionId);
            expect(r.status(), await r.text()).toBe(200);
          } else if (caller === "setOrganizationStatus") {
            const r = await invokeConsentAction(request, caller, (b as OrgBoard).organizationId, {
              status: "suspended",
              choice: "now",
            });
            expect(r.status(), await r.text()).toBe(200);
          } else if (caller === "removeOrgMember") {
            const r = await invokeConsentAction(request, caller, (b as OrgBoard).organizationId, {
              targetAdminUserId: teacherId,
              choice: "now",
            });
            expect(r.status(), await r.text()).toBe(200);
          } else {
            // Any request that reads the timer anchor runs the due force-end.
            await request.get(`/api/whiteboard/${b.whiteboardSessionId}/timer-anchor`);
          }

          const row = await readPurgeRow(b.whiteboardSessionId);
          expect(row.endedAt, "the caller must have ended the session").not.toBeNull();
          expect(row.boardPurgeRequestedAt).not.toBeNull();
          await waitForFirstPass(b.whiteboardSessionId);
          await sweepPassTwo(request, b.whiteboardSessionId);
          expect(await boardKeys(request, b)).toEqual([]);
          expect(await countEventBatches(b.whiteboardSessionId)).toBe(0);
          expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
        } finally {
          await b.cleanup();
        }
      }
    );
  }
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
  // Server half only (C4b): no server delete on an unreadable capability. The local-copy half is a client wave.
  test(
    "W16: unknown capability does not purge, and a whiteboard-off session's local copy is not cleared on an unreadable capability",
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedBoardSession(request, false);
      let snapshot: Awaited<ReturnType<typeof readConsentSnapshots>>[number] | undefined;
      try {
        await seedBoard(request, b);
        await blockAfterPurge(request, b.whiteboardSessionId);
        const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: b.placeholderUrl,
        });
        expect(end.status(), await end.text()).toBe(200);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgeRequestedAt).not.toBeNull();
        const before = await boardKeys(request, b);
        expect(before.length).toBeGreaterThan(0);

        // The frozen capability becomes unreadable.
        [snapshot] = await readConsentSnapshots(b.whiteboardSessionId);
        expect(snapshot).toBeDefined();
        await prisma.sessionConsentSnapshot.delete({ where: { id: snapshot!.id } });

        await sweep(request);
        const direct = await invokeConsentAction(request, "runBoardPurge", b.whiteboardSessionId);
        expect(direct.status(), await direct.text()).toBe(200);
        expect(((await direct.json()) as { result: unknown }).result).toBe("skipped_unreadable");
        expect(await boardKeys(request, b)).toEqual(before);
        const kept = await readPurgeRow(b.whiteboardSessionId);
        expect(kept.boardPurgeRequestedAt, "the intent is retained").not.toBeNull();
        expect(kept.boardPurgeFirstPassAt).toBeNull();

        // The capability is readable again: the sweep finishes the job.
        await prisma.sessionConsentSnapshot.create({ data: snapshot! });
        snapshot = undefined;
        await sweep(request);
        expect(await boardKeys(request, b)).toEqual([]);
      } finally {
        if (snapshot) await prisma.sessionConsentSnapshot.create({ data: snapshot }).catch(() => {});
        await resetSeams(request);
        await b.cleanup();
      }
    }
  );
  // Oracle: Characterization (green before; regression guard). Seeded old row: 'boardPurgeRequestedAt' null; sweep leaves blobs and rows. Green before because nothing purges these rows today
  test(
    "W17: sessions before this wave with a whiteboard-off snapshot are never purged",
    async ({ request }) => {
      const b = await seedBoardSession(request, false);
      try {
        const keys = await seedBoard(request, b);
        // An old row: ended before this wave, so no intent was ever written.
        await prisma.whiteboardSession.update({
          where: { id: b.whiteboardSessionId },
          data: { endedAt: new Date("2026-06-01T12:00:00Z"), eventsBlobUrl: harnessUrl(keys.events) },
        });
        const before = await boardKeys(request, b);
        // Status not asserted: before this wave the route does not exist.
        await runCron(request, CLEANUP);
        expect(await boardKeys(request, b)).toEqual(before);
        expect(await countEventBatches(b.whiteboardSessionId)).toBe(2);
      } finally {
        await b.cleanup();
      }
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
  test(
    "W18b: double End does not write a second purge intent, and the overlapping loser does not move boardPurgeRequestedAt",
    async ({ request }) => {
      test.setTimeout(120_000);
      const seq = await seedBoardSession(request, false);
      const ovl = await seedBoardSession(request, false);
      // ACTIVE sessions: End needs a URL, and the placeholder is what the row already names.
      const end = (id: string) =>
        invokeConsentAction(request, "endWhiteboardSession", id, { finalEventsBlobUrl: seq.placeholderUrl });
      try {
        // (a) Sequential: the second End is refused and the intent stays the first one.
        await blockAfterPurge(request, seq.whiteboardSessionId);
        const first = await end(seq.whiteboardSessionId);
        expect(first.status(), await first.text()).toBe(200);
        const once = await readPurgeRow(seq.whiteboardSessionId);
        expect(once.boardPurgeRequestedAt).not.toBeNull();
        expect((await end(seq.whiteboardSessionId)).ok()).toBe(false);
        expect(await readPurgeRow(seq.whiteboardSessionId)).toEqual(once);

        // (b) Overlapping: A parks inside its End transaction; B fires while A is parked.
        const id = ovl.whiteboardSessionId;
        await blockAfterPurge(request, id);
        await armHold(request, { name: "end:tx:before_update", sessionId: id, parkFirstN: 1 });
        const endA = end(id);
        await waitUntilParked(request, "end:tx:before_update", id);
        let bSettledAt = 0;
        const endB = end(id).finally(() => {
          bSettledAt = Date.now();
        });
        await expect
          .poll(async () => bSettledAt > 0 || (await countBackendsWaitingOnLock()) > 0, { timeout: 2_000 })
          .toBe(true);
        const releaseMs = Date.now();
        await releaseHold(request, "end:tx:before_update", id);
        const [resA, resB] = await Promise.all([endA, endB]);
        await expectReleasedByTest(request, "end:tx:before_update", id);
        expect([resA.ok(), resB.ok()], `A ${resA.status()} / B ${resB.status()}`).toEqual([true, false]);

        // Written once, by A after the release (server time, not the back-dated endedAt), and B did not move it.
        const row = await readPurgeRow(id);
        expect(row.boardPurgeRequestedAt).not.toBeNull();
        expect(row.boardPurgeRequestedAt!.getTime()).toBeGreaterThanOrEqual(releaseMs - 1_000);
        expect((await end(id)).ok()).toBe(false);
        expect((await readPurgeRow(id)).boardPurgeRequestedAt).toEqual(row.boardPurgeRequestedAt);
      } finally {
        await resetSeams(request);
        await seq.cleanup();
        await ovl.cleanup();
      }
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
  test(
    "W22: crash between End commit and purge: the intent survives and the sweep finishes the job",
    async ({ request }) => {
      test.setTimeout(120_000);
      const b = await seedBoardSession(request, false);
      try {
        await seedBoard(request, b);
        // The process dies after End commits and before its purge runs.
        await blockAfterPurge(request, b.whiteboardSessionId);
        const end = await invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
          finalEventsBlobUrl: b.placeholderUrl,
        });
        expect(end.status(), await end.text()).toBe(200);
        // Give a purge that ignored the crash time to run; nothing may have happened.
        await new Promise((r) => setTimeout(r, 1_500));
        const crashed = await readPurgeRow(b.whiteboardSessionId);
        expect(crashed.boardPurgeRequestedAt).not.toBeNull();
        expect(crashed.boardPurgeFirstPassAt).toBeNull();
        expect((await boardKeys(request, b)).length).toBeGreaterThan(0);

        await sweep(request);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgeFirstPassAt).not.toBeNull();
        expect(await boardKeys(request, b)).toEqual([]);
        await sweepPassTwo(request, b.whiteboardSessionId);
        expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
      } finally {
        await resetSeams(request);
        await b.cleanup();
      }
    }
  );
  // Oracle: Seed an audio blob under 'sessions/<studentId>/', a concatenated-replay audio blob at the concat output path ('whiteboard-sessions/<adminUserId>/<studentId>/<whiteboardSessionId>-concat.webm', § 3.3's named prefix guard) …
  test(
    "W23: End or finalize with a foreign or audio URL as eventsBlobUrl never deletes that blob",
    async ({ request }) => {
      test.setTimeout(180_000);
      const viaAudio = await seedBoardSession(request, false);
      const viaConcat = await seedBoardSession(request, false);
      const viaForeign = await seedBoardSession(request, false);
      const other = await seedBoardSession(request, true);
      const forced = await seedOrgBoardSession(request, { whiteboard: false });
      const all = [viaAudio, viaConcat, viaForeign, forced];
      try {
        const foreign = {
          audio: `sessions/${viaAudio.studentId}/${Date.now()}-segment.webm`,
          concat: `whiteboard-sessions/${viaConcat.adminUserId}/${viaConcat.studentId}/${viaConcat.whiteboardSessionId}-concat.webm`,
          otherBoard: `${other.sessionPrefix}1-events.json`,
          forcedAudio: `sessions/${forced.studentId}/${Date.now()}-segment.webm`,
        };
        await seedHarnessBlobs(request, [
          { key: foreign.audio, text: "pw-audio", contentType: "audio/webm" },
          { key: foreign.concat, text: "pw-concat", contentType: "audio/webm" },
          { key: foreign.otherBoard, text: replayEventsFixture(), contentType: "application/json" },
          { key: foreign.forcedAudio, text: "pw-audio", contentType: "audio/webm" },
        ]);
        for (const b of all) await seedBoard(request, b);

        const ends = [
          await invokeConsentAction(request, "endWhiteboardSession", viaAudio.whiteboardSessionId, {
            finalEventsBlobUrl: harnessUrl(foreign.audio),
          }),
          await invokeConsentAction(request, "endSession", viaConcat.whiteboardSessionId, {
            finalEventsBlobUrl: harnessUrl(foreign.concat),
          }),
          await invokeConsentAction(request, "endWhiteboardSession", viaForeign.whiteboardSessionId, {
            finalEventsBlobUrl: harnessUrl(foreign.otherBoard),
            opts: { snapshotBlobUrl: harnessUrl(foreign.otherBoard) },
          }),
        ];
        for (const r of ends) expect(r.status(), await r.text()).toBe(200);
        // Forced-end arm: the org ends the session now, then the late upload names a foreign audio URL.
        const suspend = await invokeConsentAction(request, "setOrganizationStatus", forced.organizationId, {
          status: "suspended",
          choice: "now",
        });
        expect(suspend.status(), await suspend.text()).toBe(200);
        const late = await invokeConsentAction(request, "endWhiteboardSession", forced.whiteboardSessionId, {
          finalEventsBlobUrl: harnessUrl(foreign.forcedAudio),
        });
        expect(late.status(), await late.text()).toBe(200);

        for (const b of all) {
          await waitForFirstPass(b.whiteboardSessionId);
          await sweepPassTwo(request, b.whiteboardSessionId);
          expect(await boardKeys(request, b), `own prefix of ${b.whiteboardSessionId}`).toEqual([]);
          expect((await readPurgeRow(b.whiteboardSessionId)).boardPurgedAt).not.toBeNull();
        }
        for (const key of Object.values(foreign)) {
          expect(await keysUnder(request, key), `foreign blob ${key} survives`).toEqual([key]);
        }
      } finally {
        for (const b of [...all, other]) await b.cleanup();
      }
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
  test(
    "W25: purge sweep is not starved: not-yet-due, unreadable-capability and persistently failing rows do not block an eligible row",
    async ({ request }) => {
      test.setTimeout(180_000);
      // More than one sweep batch of each blocking kind (the plan's batch is 25; 30 is an independent margin).
      const PER_KIND = 30;
      const base = await seedBoardSession(request, false);
      const ids: string[] = [];
      try {
        const snap = (await readConsentSnapshots(base.whiteboardSessionId))[0]!;
        const mk = async (data: {
          requestedAt: Date;
          firstPassAt?: Date | null;
          attemptedAt?: Date | null;
          snapshot: boolean;
        }) => {
          const row = await prisma.whiteboardSession.create({
            data: {
              adminUserId: base.adminUserId,
              studentId: base.studentId,
              consentAcknowledged: true,
              eventsBlobUrl: base.placeholderUrl,
              sessionPhase: "ACTIVE",
              startedAt: new Date("2000-01-01T00:00:00Z"),
              endedAt: new Date("2000-01-01T01:00:00Z"),
              boardPurgeRequestedAt: data.requestedAt,
              boardPurgeFirstPassAt: data.firstPassAt ?? null,
              boardPurgeAttemptedAt: data.attemptedAt ?? null,
            },
            select: { id: true },
          });
          ids.push(row.id);
          if (data.snapshot) {
            const { id: _id, whiteboardSessionId: _w, frozenAt: _f, ...switches } = snap;
            await prisma.sessionConsentSnapshot.create({ data: { ...switches, whiteboardSessionId: row.id } });
          }
          return row.id;
        };
        const oldest = new Date("2000-01-01T02:00:00Z");
        const recentAttempt = new Date(Date.now() - 60_000);
        const failing: string[] = [];
        for (let i = 0; i < PER_KIND; i++) {
          // Pass 1 just ran: pass 2 is not due.
          await mk({ requestedAt: oldest, firstPassAt: new Date(), attemptedAt: null, snapshot: true });
          // No snapshot: capability unreadable.
          await mk({ requestedAt: oldest, attemptedAt: null, snapshot: false });
          // Every delete fails.
          failing.push(await mk({ requestedAt: oldest, attemptedAt: recentAttempt, snapshot: true }));
        }
        for (const id of failing) {
          const key = `whiteboard-sessions/${base.studentId}/${id}/1-events.json`;
          await seedHarnessBlobs(request, [{ key, text: "pw-stuck", contentType: "application/json" }]);
          await failBlobDeletesMatching(request, `whiteboard-sessions/${base.studentId}/${id}/`);
        }
        // The eligible row: newer intent, never attempted.
        const eligible = await mk({ requestedAt: new Date("2002-01-01T00:00:00Z"), attemptedAt: null, snapshot: true });
        const eligibleKey = `whiteboard-sessions/${base.studentId}/${eligible}/1-events.json`;
        await seedHarnessBlobs(request, [{ key: eligibleKey, text: replayEventsFixture(), contentType: "application/json" }]);

        await sweep(request);
        expect((await readPurgeRow(eligible)).boardPurgeFirstPassAt, "the eligible row made progress").not.toBeNull();
        expect(await keysUnder(request, eligibleKey)).toEqual([]);
      } finally {
        await resetBlobHarness(request);
        await prisma.sessionConsentSnapshot.deleteMany({ where: { whiteboardSessionId: { in: ids } } });
        await prisma.whiteboardSession.deleteMany({ where: { id: { in: ids } } });
        await base.cleanup();
      }
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
  test(
    "W27: whiteboard off, after End and before any purge pass: the events route, the snapshot route and the review payload return nothing, and those three return content for whiteboard on",
    async ({ request }) => {
      const off = await seedBoardSession(request, false);
      const on = await seedBoardSession(request, true);
      try {
        type Payload = { result: { eventCount?: number; snapshotProxyUrl?: string | null } };
        const reads = async (b: BoardFixture) => {
          const events = await request.get(`/api/whiteboard/${b.whiteboardSessionId}/events`);
          const snapshot = await request.get(`/api/whiteboard/${b.whiteboardSessionId}/snapshot`);
          const review = await invokeConsentAction(request, "loadReviewPayload", b.whiteboardSessionId);
          expect(review.status(), await review.text()).toBe(200);
          return {
            eventsStatus: events.status(),
            events: events.ok() ? ((await events.json()) as { events: unknown[] }).events.length : -1,
            snapshotStatus: snapshot.status(),
            payload: ((await review.json()) as Payload).result,
          };
        };
        for (const b of [off, on]) {
          const keys = await seedBoard(request, b);
          await blockAfterPurge(request, b.whiteboardSessionId);
          const end = await endWithBoard(request, b, keys);
          expect(end.status(), await end.text()).toBe(200);
        }
        expect((await readPurgeRow(off.whiteboardSessionId)).boardPurgeFirstPassAt).toBeNull();

        const offReads = await reads(off);
        expect(offReads.eventsStatus).toBe(200);
        expect(offReads.events).toBe(0);
        expect(offReads.snapshotStatus).toBe(404);
        expect(offReads.payload.eventCount ?? 0).toBe(0);
        expect(offReads.payload.snapshotProxyUrl ?? null).toBeNull();

        // Positive control: the same reads return the board for whiteboard on.
        const onReads = await reads(on);
        expect(onReads.eventsStatus).toBe(200);
        expect(onReads.events).toBe(JSON.parse(replayEventsFixture()).events.length);
        expect(onReads.snapshotStatus).toBe(200);
        expect(onReads.payload.eventCount).toBe(JSON.parse(replayEventsFixture()).events.length);
        expect(onReads.payload.snapshotProxyUrl).toBeTruthy();
      } finally {
        await resetSeams(request);
        await off.cleanup();
        await on.cleanup();
      }
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
