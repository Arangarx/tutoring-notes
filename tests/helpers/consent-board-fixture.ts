/**
 * Consent wave — the isolated "board" session fixture shared by the purge (§ 3) and reaper (§ 6k) specs.
 *
 * One tutor-owned session whose snapshot says whiteboard on/off, the create-time placeholder events log the
 * product writes OUTSIDE the session prefix, and (via `seedBoard`) a board's worth of data: batch rows, the
 * client's events log and snapshot, an image, a PDF page and a legacy checkpoint. Every oracle here is a database
 * row or the harness store listing, never the code under test's own report.
 */

import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { invokeConsentAction, listHarnessBlobs, runCron, seedHarnessBlobs } from "./consent-harness";
import { backdateBoardPurgeFirstPass, HOUR_MS, makeSessionIdle, withPrisma } from "./consent-db-oracle";
import { seedStartFixture, type StartFixture } from "./consent-start-fixture";
import { seedTestAdmin } from "../visual/helpers";
import { replayEventsFixture } from "../integration/wb-replay-harness.helpers";

export const CLEANUP = "/api/cron/session-cleanup" as const;
/** Far past any pass-2 delay the plan allows (the platform's default upload token lives one hour). */
export const PAST_PASS_2_DELAY_MS = 2 * 60 * 60_000;
/** Same origin the server builds harness URLs from (`NEXTAUTH_URL` on the wb-regression webServer). */
export const HARNESS_ORIGIN = "http://localhost:3100";

export function harnessUrl(key: string): string {
  return `${HARNESS_ORIGIN}/api/test/blob/object/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** The shape `create-session-core.ts` writes at create (`emptyEventsJson`). */
export const EMPTY_LOG = JSON.stringify({
  schemaVersion: 1,
  startedAt: "2026-11-12T18:00:00.000Z",
  durationMs: 0,
  events: [],
});

export type BoardFixture = StartFixture & { sessionPrefix: string; checkpointPrefix: string; placeholderUrl: string };

/**
 * An isolated tutor-owned session whose snapshot says whiteboard on/off, with the create-time placeholder
 * events log the product writes OUTSIDE the session prefix (`whiteboard-sessions/<adminUserId>/<studentId>/`).
 */
export async function seedBoardSession(
  request: APIRequestContext,
  whiteboard: boolean,
  phase: "ACTIVE" | "PENDING" = "ACTIVE",
  opts?: { snapshot?: boolean }
): Promise<BoardFixture> {
  const f = await seedStartFixture({ record: { allowWhiteboardRecording: whiteboard }, snapshot: opts?.snapshot ?? true });
  const placeholderKey = `whiteboard-sessions/${f.adminUserId}/${f.studentId}/${Date.now()}-events.json`;
  await seedHarnessBlobs(request, [{ key: placeholderKey, text: EMPTY_LOG, contentType: "application/json" }]);
  const now = Date.now();
  await withPrisma((prisma) =>
    prisma.whiteboardSession.update({
      where: { id: f.whiteboardSessionId },
      data: {
        eventsBlobUrl: harnessUrl(placeholderKey),
        ...(phase === "ACTIVE"
          ? { sessionPhase: "ACTIVE", activatedAt: new Date(now), startedAt: new Date(now - 10 * 60_000) }
          : {}),
      },
    })
  );
  return {
    ...f,
    sessionPrefix: `whiteboard-sessions/${f.studentId}/${f.whiteboardSessionId}/`,
    checkpointPrefix: `whiteboard-checkpoints/${f.whiteboardSessionId}/`,
    placeholderUrl: harnessUrl(placeholderKey),
  };
}

export type BoardKeys = { events: string; snapshot: string; image: string; pdfPage: string; checkpoint: string };

/** A board's worth of data: batch rows, the client's events log and snapshot, an image, a PDF page, a legacy checkpoint. */
export async function seedBoard(request: APIRequestContext, b: BoardFixture, batches = 2): Promise<BoardKeys> {
  await withPrisma((prisma) =>
    prisma.whiteboardEventBatch.createMany({
      data: Array.from({ length: batches }, (_, i) => ({
        whiteboardSessionId: b.whiteboardSessionId,
        batchSeq: i + 1,
        fromEventIndex: i,
        toEventIndex: i + 1,
        eventsJson: [{ t: i * 10, type: "add", id: `pw-el-${i}` }],
        boardDocumentJson: { pages: [{ id: "p1", elements: [`pw-el-${i}`] }] },
        schemaVersion: 1,
      })),
    })
  );
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
export function endWithBoard(request: APIRequestContext, b: BoardFixture, keys: BoardKeys) {
  return invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, {
    finalEventsBlobUrl: harnessUrl(keys.events),
    opts: { snapshotBlobUrl: harnessUrl(keys.snapshot) },
  });
}

export const readPurgeRow = (id: string) =>
  withPrisma((prisma) =>
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
    })
  );

export async function keysUnder(request: APIRequestContext, prefix: string): Promise<string[]> {
  return (await listHarnessBlobs(request, prefix)).map((o) => o.key);
}

/** Everything a client could have written for this board (session prefix + legacy checkpoint prefix). */
export async function boardKeys(request: APIRequestContext, b: BoardFixture): Promise<string[]> {
  return [...(await keysUnder(request, b.sessionPrefix)), ...(await keysUnder(request, b.checkpointPrefix))];
}

export async function sweep(request: APIRequestContext) {
  const r = await runCron(request, CLEANUP);
  expect(r.status, r.text).toBe(200);
  return r;
}

export async function waitForFirstPass(id: string, timeout = 20_000) {
  await expect
    .poll(async () => (await readPurgeRow(id)).boardPurgeFirstPassAt !== null, {
      timeout,
      message: `boardPurgeFirstPassAt for ${id}`,
    })
    .toBe(true);
}

/** Pass 2 through the real sweep: the data seam moves pass 1 into the past, then the cron route runs. */
export async function sweepPassTwo(request: APIRequestContext, id: string) {
  expect(await backdateBoardPurgeFirstPass(id, PAST_PASS_2_DELAY_MS), "pass 1 must have stamped first").toBe(1);
  await sweep(request);
}

export type OrgBoard = BoardFixture & { organizationId: string; ownerAdminUserId: string };

/**
 * An org-owned session (student owned by the org, consent recorded by the org) taught by `teacherId`,
 * in an org the signed-in harness tutor owns. Rows written straight to Postgres.
 */
export async function seedOrgBoardSession(
  request: APIRequestContext,
  opts: { whiteboard: boolean; teacherId?: string; orgStatusChangedAt?: Date; orgStatus?: "active" | "suspended" }
): Promise<OrgBoard> {
  return withPrisma(async (prisma) => {
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
  });
}

export type IdleSession = BoardFixture & {
  lastActivityAt: Date;
  startedAt: Date;
  keys: BoardKeys | null;
};

/**
 * A tutor-owned session whose every activity column is `idleMs` old (default 25 h), written straight to Postgres.
 * `board` adds a board's worth of data first (batch rows and blobs), `participant` a joined learner and a live join
 * token; both are seeded BEFORE the backdate so they carry the idle instant rather than counting as recent activity.
 */
export async function seedIdle(
  request: APIRequestContext,
  opts: {
    whiteboard: boolean;
    phase?: "ACTIVE" | "PENDING";
    snapshot?: boolean;
    board?: boolean;
    participant?: boolean;
    idleMs?: number;
    startedAtAgoMs?: number;
  }
): Promise<IdleSession> {
  const b = await seedBoardSession(request, opts.whiteboard, opts.phase ?? "ACTIVE", { snapshot: opts.snapshot });
  const keys = opts.board ? await seedBoard(request, b) : null;
  if (opts.participant) {
    await withPrisma(async (prisma) => {
      await prisma.sessionParticipant.create({
        data: { whiteboardSessionId: b.whiteboardSessionId, learnerProfileId: b.learnerProfileId },
      });
      await prisma.whiteboardJoinToken.create({
        data: {
          whiteboardSessionId: b.whiteboardSessionId,
          token: `pw-reaper-${randomUUID()}`,
          expiresAt: new Date(Date.now() + HOUR_MS),
        },
      });
    });
  }
  const seeded = await makeSessionIdle(b.whiteboardSessionId, {
    idleMs: opts.idleMs,
    startedAtAgoMs: opts.startedAtAgoMs,
  });
  return { ...b, ...seeded, keys };
}
