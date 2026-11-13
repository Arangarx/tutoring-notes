/**
 * Consent wave — § 6k stale-session reaper (Q3 APPROVED, Andrew 2026-10-29), built in C4c.
 *
 * Every oracle is a database row, the harness blob listing, an HTTP status, or the cron route's own per-session
 * `reaper.outcomes` (server stdout is not visible to Playwright; the `[slc]` log line formats are covered by
 * `src/__tests__/whiteboard/stale-session-reaper.test.ts`). The tests never read the helper's own output for
 * the thing it computes: instants are the test's seeds and its own wall clock.
 *
 * Run: npx playwright test tests/integration/wb-consent-reaper.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  armFault,
  armHold,
  expectReleasedByTest,
  invokeConsentAction,
  listHarnessBlobs,
  postBoardBatch,
  reaperOutcomeFor,
  releaseHold,
  resetSeams,
  runReaperCron,
  seedHarnessBlobs,
  waitUntilParked,
  type CronResult,
  type ReaperRunBody,
} from "../helpers/consent-harness";
import {
  countEventBatches,
  countRowsBySession,
  endLeftoverIdleSessions,
  HOUR_MS,
  makeSessionIdle,
  readConsentSnapshots,
} from "../helpers/consent-db-oracle";
import { seedStartFixture } from "../helpers/consent-start-fixture";
import {
  boardKeys,
  harnessUrl,
  readPurgeRow,
  seedBoard,
  seedBoardSession,
  seedIdle,
  seedOrgBoardSession,
  sweepPassTwo,
  waitForFirstPass,
  type BoardFixture,
  type IdleSession,
} from "../helpers/consent-board-fixture";
import { SESSION_REAPER_BATCH_LIMIT } from "../../src/lib/session-cleanup-config";

const prisma = new PrismaClient();

test.beforeAll(async () => {
  // The reaper scans oldest-first in bounded batches; old leftovers in the shared local DB must not crowd out this file's seeds.
  await endLeftoverIdleSessions();
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

const readRow = (id: string) =>
  prisma.whiteboardSession.findUniqueOrThrow({
    where: { id },
    select: {
      endedAt: true,
      startedAt: true,
      durationSeconds: true,
      notesForbidden: true,
      eventsBlobUrl: true,
      concatBlobUrl: true,
      boardPurgeRequestedAt: true,
    },
  });

/** One cron call with the reaper in `mode` (`null` = env unset). Asserts the route itself answered 200. */
async function reap(request: APIRequestContext, mode: string | null = "enforce"): Promise<ReaperRunBody> {
  const r = await runReaperCron(request, mode);
  expect(r.status, r.text).toBe(200);
  return r.reaperBody;
}

/** A booking linked to the session. `null` times are the nullable columns' null. */
async function linkAppointment(
  s: IdleSession,
  times: { startAt: Date | null; endAt: Date | null }
): Promise<string> {
  const appt = await prisma.scheduledSession.create({
    data: {
      adminUserId: s.adminUserId,
      studentId: s.studentId,
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
      plannedDurationMinutes: 60,
      subject: "pw reaper",
      ...times,
    },
    select: { id: true },
  });
  await prisma.whiteboardSession.update({
    where: { id: s.whiteboardSessionId },
    data: { scheduledSessionId: appt.id },
  });
  return appt.id;
}

/** The way the recorder posts batches (the real checkpoint route); returns the element ids the test drew. */
async function drawStrokesThroughCheckpointRoute(request: APIRequestContext, sessionId: string, n = 2): Promise<string[]> {
  const ids: string[] = [];
  for (let seq = 1; seq <= n; seq += 1) {
    const res = await postBoardBatch(request, sessionId, seq);
    expect(res.status(), await res.text()).toBe(200);
    ids.push(`pw-late-${seq}`);
  }
  return ids;
}

/** A silent mono 16-bit WAV with only bytes below 0x80, so the harness's UTF-8 seed stores it byte for byte. */
function silentWav(): string {
  const le32 = (n: number) => String.fromCharCode(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
  const le16 = (n: number) => String.fromCharCode(n & 0xff, (n >> 8) & 0xff);
  const sampleRate = 8192;
  const dataBytes = sampleRate * 2; // one second
  return (
    "RIFF" + le32(36 + dataBytes) + "WAVE" +
    "fmt " + le32(16) + le16(1) + le16(1) + le32(sampleRate) + le32(sampleRate * 2) + le16(2) + le16(16) +
    "data" + le32(dataBytes) + "\u0000".repeat(dataBytes)
  );
}

/** Two audio segments for the session, so the replay concat has something to join. Seeded before the backdate. */
async function seedTwoAudioSegments(request: APIRequestContext, s: BoardFixture): Promise<void> {
  const prefix = `audio/${s.adminUserId}/${s.studentId}/${s.whiteboardSessionId}/`;
  const keys = [`${prefix}seg-0.wav`, `${prefix}seg-1.wav`];
  await seedHarnessBlobs(
    request,
    keys.map((key) => ({ key, text: silentWav(), contentType: "audio/wav" }))
  );
  await prisma.sessionRecording.createMany({
    data: keys.map((key, i) => ({
      adminUserId: s.adminUserId,
      studentId: s.studentId,
      whiteboardSessionId: s.whiteboardSessionId,
      blobUrl: harnessUrl(key),
      mimeType: "audio/wav",
      sizeBytes: silentWav().length,
      orderIndex: i,
    })),
  });
}

async function readEventsRoute(request: APIRequestContext, sessionId: string): Promise<{ events: Array<{ id?: string }> }> {
  const res = await request.get(`/api/whiteboard/${sessionId}/events`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { events: Array<{ id?: string }> };
}

// ---------------------------------------------------------------------------
// 6k. Stale-session reaper (R3)
// ---------------------------------------------------------------------------
test.describe("consent 6k: Stale-session reaper (R3)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Seeded: A idle 25 h (no batch, no recording, no participant activity), B idle 23 h, C idle 25 h on its row but with a recent batch. After one cron call: A 'endedAt' set; B and C untouched (positive controls)
  test(
    "G1: an ACTIVE session idle past the bar is ended by the cron, and an active one is not",
    async ({ request }) => {
      test.setTimeout(120_000);
      const a = await seedIdle(request, { whiteboard: true });
      const b = await seedIdle(request, { whiteboard: true, idleMs: 23 * HOUR_MS });
      const c = await seedIdle(request, { whiteboard: true });
      try {
        // C's row is 25 h old, but a batch landed just now (the row-level columns alone would call it idle).
        await prisma.whiteboardEventBatch.create({
          data: {
            whiteboardSessionId: c.whiteboardSessionId,
            batchSeq: 1,
            fromEventIndex: 0,
            toEventIndex: 1,
            eventsJson: [{ t: 10, type: "add", id: "pw-recent" }],
            boardDocumentJson: { pages: [{ id: "p1", elements: ["pw-recent"] }] },
            schemaVersion: 1,
          },
        });
        for (const s of [a, b, c]) expect((await readRow(s.whiteboardSessionId)).endedAt).toBeNull();

        const body = await reap(request);
        expect(body.reaper?.mode).toBe("enforce");

        expect((await readRow(a.whiteboardSessionId)).endedAt, "A idle 25 h must be ended").not.toBeNull();
        expect(reaperOutcomeFor(body, a.whiteboardSessionId)?.action).toBe("reaped");
        expect((await readRow(b.whiteboardSessionId)).endedAt, "B idle 23 h must stay open").toBeNull();
        expect(reaperOutcomeFor(body, b.whiteboardSessionId)).toBeUndefined();
        expect((await readRow(c.whiteboardSessionId)).endedAt, "C with a recent batch must stay open").toBeNull();
        expect(reaperOutcomeFor(body, c.whiteboardSessionId)).toMatchObject({ action: "skip", reason: "not_idle" });
      } finally {
        await Promise.all([a.cleanup(), b.cleanup(), c.cleanup()]);
      }
    }
  );
  // Oracle: Family set whiteboard off after create; after the cron: 'endedAt' set, snapshot row exists ('frozen_at_end'), intent set and the board purged after the sweep (the reaper arm of S7b; the snapshot row is the reaper arm of S7)
  test(
    "G2: a PENDING session idle past the bar is ended and its snapshot is written at End",
    async ({ request }) => {
      test.setTimeout(120_000);
      // No snapshot yet (a PENDING session the family changed after create): End freezes it from the live record.
      const s = await seedIdle(request, { whiteboard: false, phase: "PENDING", snapshot: false, board: true });
      const id = s.whiteboardSessionId;
      try {
        expect(await readConsentSnapshots(id), "positive control: nothing frozen yet").toHaveLength(0);
        expect((await boardKeys(request, s)).length, "positive control: a board exists").toBeGreaterThan(0);
        expect(await countEventBatches(id)).toBeGreaterThan(0);

        const body = await reap(request);
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");

        const row = await readPurgeRow(id);
        expect(row.endedAt).not.toBeNull();
        const snapshots = await readConsentSnapshots(id);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].allowWhiteboardRecording).toBe(false);
        expect(row.boardPurgeRequestedAt).not.toBeNull();

        await waitForFirstPass(id);
        await sweepPassTwo(request, id);
        expect(await boardKeys(request, s)).toEqual([]);
        expect(await countEventBatches(id)).toBe(0);
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: Harness listing and batch counts, with a positive control before
  test(
    "G3: whiteboard-off reaped session: board purged; whiteboard-on reaped session: board kept",
    async ({ request }) => {
      test.setTimeout(120_000);
      const off = await seedIdle(request, { whiteboard: false, board: true });
      const on = await seedIdle(request, { whiteboard: true, board: true });
      try {
        for (const s of [off, on]) {
          expect((await boardKeys(request, s)).length, "positive control: a board exists").toBeGreaterThan(0);
          expect(await countEventBatches(s.whiteboardSessionId)).toBe(2);
        }

        const body = await reap(request);
        expect(reaperOutcomeFor(body, off.whiteboardSessionId)?.action).toBe("reaped");
        expect(reaperOutcomeFor(body, on.whiteboardSessionId)?.action).toBe("reaped");

        await waitForFirstPass(off.whiteboardSessionId);
        await sweepPassTwo(request, off.whiteboardSessionId);
        expect(await boardKeys(request, off)).toEqual([]);
        expect(await countEventBatches(off.whiteboardSessionId)).toBe(0);

        const kept = await boardKeys(request, on);
        for (const key of Object.values(on.keys!)) expect(kept).toContain(key);
        expect(await countEventBatches(on.whiteboardSessionId)).toBe(2);
      } finally {
        await Promise.all([off.cleanup(), on.cleanup()]);
      }
    }
  );
  // Oracle: 'endedAt' set for a whiteboard-on session; no intent; board data untouched
  test(
    "G4: the reaper ends sessions with whiteboard on too (one End semantics)",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true, board: true });
      const id = s.whiteboardSessionId;
      try {
        const before = await boardKeys(request, s);
        const body = await reap(request);
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");

        const row = await readPurgeRow(id);
        expect(row.endedAt).not.toBeNull();
        expect(row.boardPurgeRequestedAt, "whiteboard on: no purge intent").toBeNull();
        expect(await boardKeys(request, s)).toEqual(before);
        expect(await countEventBatches(id)).toBe(2);
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: Seeded appointment 'endAt' in the future; session untouched after cron; reaped once the appointment is in the past
  test(
    "G5: a PENDING session with an appointment still in the future is not reaped",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true, phase: "PENDING" });
      const id = s.whiteboardSessionId;
      try {
        const appointmentId = await linkAppointment(s, {
          startAt: new Date(Date.now() + HOUR_MS),
          endAt: new Date(Date.now() + 2 * HOUR_MS),
        });
        const first = await reap(request);
        expect(reaperOutcomeFor(first, id)).toMatchObject({ action: "skip", reason: "appointment_delay" });
        expect((await readRow(id)).endedAt).toBeNull();

        // The appointment passes: the same session is now reaped (the positive control for the skip above).
        await prisma.scheduledSession.update({
          where: { id: appointmentId },
          data: { startAt: new Date(Date.now() - 3 * HOUR_MS), endAt: new Date(Date.now() - 2 * HOUR_MS) },
        });
        const second = await reap(request);
        expect(reaperOutcomeFor(second, id)?.action).toBe("reaped");
        expect((await readRow(id)).endedAt).not.toBeNull();
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: Second cron call changes nothing; 'endedAt' and intent timestamps identical
  test(
    "G6: reaping is idempotent and does not move endedAt",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: false, board: true });
      const id = s.whiteboardSessionId;
      try {
        const first = await reap(request);
        expect(reaperOutcomeFor(first, id)?.action).toBe("reaped");
        const afterFirst = await readPurgeRow(id);
        expect(afterFirst.endedAt).not.toBeNull();
        expect(afterFirst.boardPurgeRequestedAt).not.toBeNull();

        const second = await reap(request);
        expect(reaperOutcomeFor(second, id), "an ended session is not a candidate again").toBeUndefined();
        const afterSecond = await readPurgeRow(id);
        expect(afterSecond.endedAt?.getTime()).toBe(afterFirst.endedAt!.getTime());
        expect(afterSecond.boardPurgeRequestedAt?.getTime()).toBe(afterFirst.boardPurgeRequestedAt!.getTime());

        // A tutor End on the reaped session is refused and does not move endedAt either.
        const late = await invokeConsentAction(request, "endStaleWhiteboardSession", id);
        expect(late.ok()).toBe(false);
        expect((await readPurgeRow(id)).endedAt?.getTime()).toBe(afterFirst.endedAt!.getTime());
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: Guard (§ 6i) — the guard itself is jest: src/__tests__/consent-guards.test.ts (G7).
  // Oracle: Checkpoint 409; 'issueJoinToken' refused; open-session list omits it
  test(
    "G8: a reaped session cannot be resumed, joined or checkpointed",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true });
      const id = s.whiteboardSessionId;
      try {
        // Positive controls while it is open: a join token is issued, and the student page lists the open session.
        const openJoin = await invokeConsentAction(request, "issueJoinToken", id);
        expect(openJoin.status(), await openJoin.text()).toBe(200);
        const openPage = await request.get(`/admin/students/${s.studentId}`);
        expect(await openPage.text(), "the open session is listed to resume").toContain("student-open-sessions-disclosure");

        const body = await reap(request);
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");

        const batch = await postBoardBatch(request, id, 1);
        expect(batch.status(), "checkpoint on an ended session").toBe(409);
        const join = await invokeConsentAction(request, "issueJoinToken", id);
        expect(join.ok(), "no join token for an ended session").toBe(false);
        const page = await request.get(`/admin/students/${s.studentId}`);
        expect(await page.text(), "the reaped session is no longer offered to resume").not.toContain("student-open-sessions-disclosure");
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: More candidates than the batch; fault on one; the rest are ended in the run
  test(
    "G9: reaper batch is bounded and a failing row does not block the others",
    async ({ request }) => {
      test.setTimeout(240_000);
      const f = await seedStartFixture({ record: {}, snapshot: false });
      const total = SESSION_REAPER_BATCH_LIMIT + 2;
      const base = Date.now() - 25 * HOUR_MS;
      // Oldest first: ids[0] is the oldest, so the two newest are the ones a bounded run leaves for the next one.
      const ids = Array.from({ length: total }, () => randomUUID());
      try {
        await prisma.whiteboardSession.createMany({
          data: ids.map((id, i) => {
            const at = new Date(base - (total - i) * 60_000);
            return {
              id,
              adminUserId: f.adminUserId,
              studentId: f.studentId,
              consentAcknowledged: true,
              eventsBlobUrl: harnessUrl(`whiteboard-sessions/${f.adminUserId}/${f.studentId}/g9-${i}-events.json`),
              sessionPhase: "ACTIVE" as const,
              sessionMode: "LIVE" as const,
              createdAt: at,
              startedAt: new Date(at.getTime() - 10 * 60_000),
              activatedAt: at,
            };
          }),
        });
        const failing = ids[5];
        await armFault(request, { name: "reaper:session", sessionId: failing, times: 1 });

        const first = await reap(request);
        expect(first.reaper!.candidates, "the scan is bounded").toBeLessThanOrEqual(SESSION_REAPER_BATCH_LIMIT);
        expect(first.reaper!.stoppedAtDeadline).toBe(false);
        expect(reaperOutcomeFor(first, failing)?.action).toBe("error");
        const rows = await prisma.whiteboardSession.findMany({ where: { id: { in: ids } }, select: { id: true, endedAt: true } });
        const ended = new Set(rows.filter((r) => r.endedAt).map((r) => r.id));
        expect(ended.has(failing), "the faulted row is left for the next run").toBe(false);
        expect(ended.size, "every other candidate in the batch is ended in the same run").toBe(SESSION_REAPER_BATCH_LIMIT - 1);
        expect(ended.has(ids[total - 1]) || ended.has(ids[total - 2]), "the batch bound leaves the newest rows").toBe(false);

        const second = await reap(request);
        expect(second.reaper!.errors).toBe(0);
        const left = await prisma.whiteboardSession.count({ where: { id: { in: ids }, endedAt: null } });
        expect(left, "the next run finishes the rest").toBe(0);
      } finally {
        await resetSeams(request);
        await prisma.productEvent.deleteMany({ where: { whiteboardSessionId: { in: ids } } });
        await prisma.sessionConsentSnapshot.deleteMany({ where: { whiteboardSessionId: { in: ids } } });
        await prisma.whiteboardSession.deleteMany({ where: { id: { in: ids } } });
        await f.cleanup();
      }
    }
  );
  // Oracle: Row fields; 'orgForcedEndUploadOpen' false; 'touchOrgForceEndIfDue' leaves 'endedAt' unchanged (§ 3.9 effect 6)
  test(
    "G10: org session reaped before any forced-end read: notesForbidden unchanged, no late-upload window, a later touch is a no-op",
    { tag: [TAG.ORG] },
    async ({ request }) => {
      test.setTimeout(120_000);
      // The org is suspended 2 h ago, so a forced End would be due the moment anything read the timer anchor.
      const o = await seedOrgBoardSession(request, {
        whiteboard: true,
        orgStatus: "suspended",
        orgStatusChangedAt: new Date(Date.now() - 2 * HOUR_MS),
      });
      const id = o.whiteboardSessionId;
      const seeded = await makeSessionIdle(id);
      const body = await reap(request);
      expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");

      const row = await readRow(id);
      expect(row.endedAt).not.toBeNull();
      expect(Math.abs(row.endedAt!.getTime() - seeded.lastActivityAt.getTime()), "the reaper's clock, not the org's").toBeLessThan(2_000);
      expect(row.notesForbidden, "the reaper does not set the org no-notes flag").toBe(false);

      // A later forced-end read is a no-op: it does not move endedAt or flip notesForbidden.
      await request.get(`/api/whiteboard/${id}/timer-anchor`);
      const after = await readRow(id);
      expect(after.endedAt?.getTime()).toBe(row.endedAt!.getTime());
      expect(after.notesForbidden).toBe(false);

      // No late-upload window: a tutor End after the reap is the idempotent skip, not a second End.
      const late = await invokeConsentAction(request, "endSession", id);
      expect(late.status(), await late.text()).toBe(200);
      expect(((await late.json()) as { result: { ok: boolean; idempotent?: boolean } }).result).toMatchObject({
        ok: true,
        idempotent: true,
      });
      expect((await readRow(id)).endedAt?.getTime()).toBe(row.endedAt!.getTime());
    }
  );
  // Oracle: Settles the UNVERIFIED in § 3.9 effect 2. RESULT (recorded here and in the effects table, plan § 3.9):
  // the tutor CAN open the review for a reaped session, the manual generate action ACCEPTS a stamped session (it
  // reaches its own "no audio" answer rather than refusing an ended session), and no TutorNote is created by the reap.
  test(
    "G11: after a reap, the tutor can open review and the manual generate action behaves as documented",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true });
      const id = s.whiteboardSessionId;
      try {
        const body = await reap(request);
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");
        expect((await countRowsBySession(id)).tutorNotes, "no drafted note is created by a reap").toBe(0);

        const review = await invokeConsentAction(request, "loadReviewPayload", id);
        expect(review.status(), await review.text()).toBe(200);
        expect(((await review.json()) as { result: unknown }).result).toBeTruthy();

        const generate = await invokeConsentAction(request, "generateNotes", id);
        expect(generate.status(), await generate.text()).toBe(200);
        const result = ((await generate.json()) as { result: { ok: boolean; error?: string } }).result;
        // Accepted: it ran the action's own body (no audio was recorded) instead of refusing a session that has ended.
        expect(result.ok).toBe(false);
        expect(result.error).toContain("No audio was recorded");
        expect(result.error).not.toMatch(/ended/i);
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: B2, arm → park → release. Seed an ACTIVE session idle 25 h; arm 'reaper:between_scan_and_stamp'; fire the cron (the reaper scans, selects the session, parks); wait until parked; record activity through a real path (a checkpoint batch); release. The session is not ended.
  test(
    "G12: the reaper does not end a session that became active between its scan and its stamp",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true });
      const hold = { name: "reaper:between_scan_and_stamp", sessionId: s.whiteboardSessionId } as const;
      try {
        await armHold(request, hold);
        // Fire the cron WITHOUT awaiting: the reaper scans, decides this session is idle, and parks at the seam.
        const cron: Promise<CronResult & { reaperBody: ReaperRunBody }> = runReaperCron(request, "enforce");
        cron.catch(() => undefined);
        await waitUntilParked(request, hold.name, hold.sessionId);

        // Activity through a real path (the recorder's checkpoint POST) while the reaper is parked.
        const batch = await postBoardBatch(request, s.whiteboardSessionId, 1);
        expect(batch.status(), await batch.text()).toBe(200);

        await releaseHold(request, hold.name, hold.sessionId);
        const res = await cron;
        expect(res.status, res.text).toBe(200);

        const row = await readRow(s.whiteboardSessionId);
        expect(row.endedAt, "a session with a batch landed after the scan must stay open").toBeNull();
        expect(row.boardPurgeRequestedAt).toBeNull();
        expect(reaperOutcomeFor(res.reaperBody, s.whiteboardSessionId)).toMatchObject({
          action: "skip",
          reason: "not_idle",
        });
        await expectReleasedByTest(request, hold.name, hold.sessionId);
      } finally {
        await resetSeams(request);
        await s.cleanup();
      }
    }
  );
  // Second arm of G12: the tutor ends the session while the reaper is parked.
  test(
    "G12 (second arm): a session the tutor ended while the reaper was parked is skipped, and endedAt is the tutor's, unmoved",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true });
      const hold = { name: "reaper:between_scan_and_stamp", sessionId: s.whiteboardSessionId } as const;
      try {
        await armHold(request, hold);
        const cron: Promise<CronResult & { reaperBody: ReaperRunBody }> = runReaperCron(request, "enforce");
        cron.catch(() => undefined);
        await waitUntilParked(request, hold.name, hold.sessionId);

        const ended = await invokeConsentAction(request, "endStaleWhiteboardSession", s.whiteboardSessionId);
        expect(ended.status(), await ended.text()).toBe(200);
        const tutorEndedAt = (await readRow(s.whiteboardSessionId)).endedAt;
        expect(tutorEndedAt).not.toBeNull();

        await releaseHold(request, hold.name, hold.sessionId);
        const res = await cron;
        expect(res.status, res.text).toBe(200);

        expect((await readRow(s.whiteboardSessionId)).endedAt?.getTime()).toBe(tutorEndedAt!.getTime());
        expect(reaperOutcomeFor(res.reaperBody, s.whiteboardSessionId)).toMatchObject({
          action: "skip",
          reason: "already_ended",
        });
        await expectReleasedByTest(request, hold.name, hold.sessionId);
      } finally {
        await resetSeams(request);
        await s.cleanup();
      }
    }
  );
  // Oracle: B2, null-'endAt' rule. delayUntil = endAt ?? startAt is asserted by behavior (which seeds are reaped when), not by reading the constant.
  test(
    "G13: a session with no appointment end is reaped on idleness alone; an appointment end only delays",
    async ({ request }) => {
      test.setTimeout(180_000);
      const past = new Date(Date.now() - 26 * HOUR_MS);
      const future = new Date(Date.now() + 2 * HOUR_MS);
      const endNull = await seedIdle(request, { whiteboard: true });
      const bothNull = await seedIdle(request, { whiteboard: true });
      const endFuture = await seedIdle(request, { whiteboard: true });
      const startFutureEndNull = await seedIdle(request, { whiteboard: true });
      const noLink = await seedIdle(request, { whiteboard: true });
      const all = [endNull, bothNull, endFuture, startFutureEndNull, noLink];
      try {
        await linkAppointment(endNull, { startAt: past, endAt: null });
        await linkAppointment(bothNull, { startAt: null, endAt: null });
        const endFutureAppt = await linkAppointment(endFuture, { startAt: past, endAt: future });
        const startFutureAppt = await linkAppointment(startFutureEndNull, { startAt: future, endAt: null });

        const first = await reap(request);
        expect(first.reaper!.errors, "a null endAt must not throw").toBe(0);
        for (const s of [endNull, bothNull, noLink]) {
          expect(reaperOutcomeFor(first, s.whiteboardSessionId)?.action).toBe("reaped");
          expect((await readRow(s.whiteboardSessionId)).endedAt).not.toBeNull();
        }
        // An appointment end in the future delays; so does a start in the future when there is no end.
        for (const s of [endFuture, startFutureEndNull]) {
          expect(reaperOutcomeFor(first, s.whiteboardSessionId)).toMatchObject({ action: "skip", reason: "appointment_delay" });
          expect((await readRow(s.whiteboardSessionId)).endedAt).toBeNull();
        }

        // Both appointments pass: the delayed sessions are reaped on the next run.
        await prisma.scheduledSession.update({ where: { id: endFutureAppt }, data: { endAt: new Date(Date.now() - HOUR_MS) } });
        await prisma.scheduledSession.update({ where: { id: startFutureAppt }, data: { startAt: past } });
        const second = await reap(request);
        for (const s of [endFuture, startFutureEndNull]) {
          expect(reaperOutcomeFor(second, s.whiteboardSessionId)?.action).toBe("reaped");
          expect((await readRow(s.whiteboardSessionId)).endedAt).not.toBeNull();
        }
      } finally {
        await Promise.all(all.map((s) => s.cleanup()));
      }
    }
  );
  // Oracle: B2. Env unset behaves as 'dry_run'; an idle-25-h session is untouched; a not-idle session reports nothing. (The `[slc] action=would_reap` line format is jest.)
  test(
    "G14: CONSENT_REAPER_MODE=dry_run (the default) logs would_reap and ends nothing",
    async ({ request }) => {
      test.setTimeout(120_000);
      const idle = await seedIdle(request, { whiteboard: false, phase: "PENDING", snapshot: false, board: true });
      const fresh = await seedIdle(request, { whiteboard: true, idleMs: 23 * HOUR_MS });
      const id = idle.whiteboardSessionId;
      try {
        const body = await reap(request, null);
        expect(body.reaper?.mode, "unset behaves as dry_run").toBe("dry_run");
        expect(reaperOutcomeFor(body, id)?.action).toBe("would_reap");
        expect(body.reaper?.reaped).toBe(0);
        expect(reaperOutcomeFor(body, fresh.whiteboardSessionId), "a not-idle session reports nothing").toBeUndefined();

        const row = await readRow(id);
        expect(row.endedAt).toBeNull();
        expect(row.boardPurgeRequestedAt).toBeNull();
        expect(await readConsentSnapshots(id), "no snapshot written by a dry run").toHaveLength(0);
        expect(await countEventBatches(id)).toBe(2);

        // Not vacuous: the same session is ended once the mode is enforce.
        const enforced = await reap(request, "enforce");
        expect(reaperOutcomeFor(enforced, id)?.action).toBe("reaped");
        expect((await readRow(id)).endedAt).not.toBeNull();
      } finally {
        await Promise.all([idle.cleanup(), fresh.cleanup()]);
      }
    }
  );
  // Oracle: B2 + B1. Idle session untouched, no would_reap, no reaped; the purge half of the same route still processes a due row (the kill switch is the reaper's, not the route's). (Exactly one `reaper_off` line is jest.)
  test(
    "G15: CONSENT_REAPER_MODE=off does nothing to sessions, and the purge still runs",
    async ({ request }) => {
      test.setTimeout(180_000);
      const idle = await seedIdle(request, { whiteboard: true });
      const due = await seedBoardSession(request, false);
      try {
        await seedBoard(request, due);
        // A purge that is due but has not run: End stamped the intent and the after() purge was blocked.
        await armFault(request, { name: "end:after_purge", sessionId: due.whiteboardSessionId });
        const ended = await invokeConsentAction(request, "endStaleWhiteboardSession", due.whiteboardSessionId);
        expect(ended.status(), await ended.text()).toBe(200);
        expect((await readPurgeRow(due.whiteboardSessionId)).boardPurgeFirstPassAt, "positive control: not purged yet").toBeNull();

        const body = await reap(request, "off");
        expect(body.reaper?.mode).toBe("off");
        expect(body.reaper?.outcomes).toEqual([]);
        expect((await readRow(idle.whiteboardSessionId)).endedAt).toBeNull();

        await waitForFirstPass(due.whiteboardSessionId);
      } finally {
        await resetSeams(request);
        await Promise.all([idle.cleanup(), due.cleanup()]);
      }
    }
  );
  // Oracle: B2. Value 'enfroce' (typo): nothing is ended; the empty string and unset behave as 'dry_run'. Red on a parser that treats unknown as truthy. (The `reaper_mode_invalid` line is jest.)
  test(
    "G16: an unrecognized CONSENT_REAPER_MODE value falls back to dry_run, never to enforce",
    async ({ request }) => {
      test.setTimeout(120_000);
      const s = await seedIdle(request, { whiteboard: true });
      const id = s.whiteboardSessionId;
      try {
        for (const raw of ["enfroce", "", null]) {
          const body = await reap(request, raw);
          expect(body.reaper?.mode, `raw=${JSON.stringify(raw)}`).toBe("dry_run");
          expect(reaperOutcomeFor(body, id)?.action).toBe("would_reap");
          expect((await readRow(id)).endedAt, `raw=${JSON.stringify(raw)} must end nothing`).toBeNull();
        }
        // Not vacuous: only the exact value ends it.
        const enforced = await reap(request, "enforce");
        expect(reaperOutcomeFor(enforced, id)?.action).toBe("reaped");
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: Q7 default, C4c. Strokes the test drew through the real checkpoint route come back from the events route; eventsBlobUrl is the assembled blob; the concat after() ran (it set concatBlobUrl); a late tutor End does not overwrite it. Control: the tutor-End path assembles the same replay.
  test(
    "G17: REAPER-ASSEMBLE: a reaped whiteboard-on session's replay serves the board the batches held",
    async ({ request }) => {
      test.setTimeout(240_000);
      const s = await seedIdle(request, { whiteboard: true });
      const control = await seedBoardSession(request, true);
      try {
        // The strokes the TEST drew are the oracle, not the assembler's output.
        const drawn = await drawStrokesThroughCheckpointRoute(request, s.whiteboardSessionId);
        await seedTwoAudioSegments(request, s);
        const seeded = await makeSessionIdle(s.whiteboardSessionId);
        expect(seeded.lastActivityAt.getTime()).toBeLessThan(Date.now() - 24 * HOUR_MS);
        expect((await readRow(s.whiteboardSessionId)).eventsBlobUrl, "positive control: still the placeholder").toBe(s.placeholderUrl);

        const body = await reap(request);
        expect(reaperOutcomeFor(body, s.whiteboardSessionId)?.action).toBe("reaped");

        // The assembly runs after the stamp commits; the URL moves off the placeholder.
        await expect
          .poll(async () => (await readRow(s.whiteboardSessionId)).eventsBlobUrl, { timeout: 30_000 })
          .not.toBe(s.placeholderUrl);
        const log = await readEventsRoute(request, s.whiteboardSessionId);
        const servedIds = log.events.map((e) => e.id);
        for (const id of drawn) expect(servedIds, "a drawn stroke is missing from the replay").toContain(id);

        // The concat enqueue ran in the cron route's after(): the joined audio lands on the row.
        await expect
          .poll(async () => (await readRow(s.whiteboardSessionId)).concatBlobUrl, { timeout: 60_000 })
          .not.toBeNull();

        // A late tutor End neither re-ends nor overwrites the assembled log.
        const assembledUrl = (await readRow(s.whiteboardSessionId)).eventsBlobUrl;
        const late = await invokeConsentAction(request, "endSession", s.whiteboardSessionId);
        expect(late.status(), await late.text()).toBe(200);
        expect((await readRow(s.whiteboardSessionId)).eventsBlobUrl).toBe(assembledUrl);

        // Control: the tutor-End path assembles the same replay from the same strokes (the extraction preserved End).
        const drawnControl = await drawStrokesThroughCheckpointRoute(request, control.whiteboardSessionId);
        const end = await invokeConsentAction(request, "endSession", control.whiteboardSessionId);
        expect(end.status(), await end.text()).toBe(200);
        expect(((await end.json()) as { result: { ok: boolean } }).result.ok).toBe(true);
        expect((await readRow(control.whiteboardSessionId)).eventsBlobUrl).not.toBe(control.placeholderUrl);
        const controlIds = (await readEventsRoute(request, control.whiteboardSessionId)).events.map((e) => e.id);
        for (const id of drawnControl) expect(controlIds).toContain(id);
        expect(controlIds.filter((id) => drawnControl.includes(id!)).sort()).toEqual(
          servedIds.filter((id) => drawn.includes(id!)).sort()
        );
      } finally {
        await Promise.all([s.cleanup(), control.cleanup()]);
      }
    }
  );
  // Oracle: Q7. Whiteboard-off idle session reaped: no assembled blob, board purged by the sweep, and a seeded audio blob, concat blob and other sessions' blobs are all still in the harness store
  test(
    "G18: REAPER-ASSEMBLE: a reaped whiteboard-off session assembles nothing and deletes nothing outside its prefix",
    async ({ request }) => {
      test.setTimeout(180_000);
      const s = await seedIdle(request, { whiteboard: false, board: true });
      const id = s.whiteboardSessionId;
      const own = `whiteboard-sessions/${s.adminUserId}/${s.studentId}/`;
      const keep = [
        `audio/${s.adminUserId}/${s.studentId}/${id}/seg-0.webm`,
        `${own}${id}-concat.webm`,
        // Another student's session, and another session of THIS student: neither is under the purged prefix.
        `whiteboard-sessions/other-student-${id}/other-session-${id}/1-events.json`,
        `whiteboard-sessions/${s.studentId}/other-session-${id}/1-events.json`,
      ];
      try {
        await seedHarnessBlobs(request, keep.map((key) => ({ key, text: "pw-keep", contentType: "application/octet-stream" })));
        const ownBefore = (await listHarnessBlobs(request, own)).map((o) => o.key).sort();
        expect(ownBefore.length, "positive control: the placeholder and the concat blob exist").toBeGreaterThan(0);

        const body = await reap(request);
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");
        await waitForFirstPass(id);
        await sweepPassTwo(request, id);

        expect(await boardKeys(request, s), "the board is purged").toEqual([]);
        expect((await listHarnessBlobs(request, own)).map((o) => o.key).sort(), "nothing assembled, nothing removed under the admin/student prefix").toEqual(ownBefore);
        expect((await readRow(id)).eventsBlobUrl, "the row keeps its placeholder").toBe(s.placeholderUrl);
        const all = (await listHarnessBlobs(request)).map((o) => o.key);
        for (const key of keep) expect(all, `${key} must survive`).toContain(key);
      } finally {
        await s.cleanup();
      }
    }
  );
  // Oracle: SF-F. Instants are the test's seeds and its own wall clock. endedAt = last activity, duration = last activity − startedAt, participant leftAt = that same endedAt; the purge intent, the snapshot and token revokedAt are real time. Control: the tutor-End path's intent is also real time and its leftAt equals its endedAt.
  test(
    "G19: a reaped session back-dates endedAt and duration, and sets participant leftAt to that same endedAt (never later); the purge intent, the snapshot and token revokedAt carry real server time",
    async ({ request }) => {
      test.setTimeout(180_000);
      const active = await seedIdle(request, { whiteboard: false, participant: true, startedAtAgoMs: 26 * HOUR_MS });
      // A PENDING session with no snapshot, so the snapshot is written (frozen) by the reap itself.
      const pending = await seedIdle(request, { whiteboard: false, phase: "PENDING", snapshot: false, participant: true });
      const control = await seedBoardSession(request, false);
      try {
        const wallClock = Date.now();
        const body = await reap(request);
        const nearNow = (d: Date | null | undefined, label: string) => {
          expect(d, label).toBeTruthy();
          expect(Math.abs(d!.getTime() - Date.now()), `${label} must carry real server time, not the back-dated instant`).toBeLessThan(
            10 * 60_000
          );
        };

        const id = active.whiteboardSessionId;
        expect(reaperOutcomeFor(body, id)?.action).toBe("reaped");
        const row = await readRow(id);
        expect(Math.abs(row.endedAt!.getTime() - active.lastActivityAt.getTime()), "endedAt is the last-activity instant").toBeLessThan(1_000);
        const expectedDuration = Math.round((active.lastActivityAt.getTime() - active.startedAt.getTime()) / 1000);
        expect(Math.abs(row.durationSeconds! - expectedDuration)).toBeLessThanOrEqual(1);
        const participant = await prisma.sessionParticipant.findFirstOrThrow({ where: { whiteboardSessionId: id } });
        expect(participant.leftAt?.getTime(), "leftAt equals endedAt, never later").toBe(row.endedAt!.getTime());
        expect(participant.leftAt!.getTime()).toBeLessThan(wallClock - 24 * HOUR_MS);
        nearNow(row.boardPurgeRequestedAt, "boardPurgeRequestedAt");
        const token = await prisma.whiteboardJoinToken.findFirstOrThrow({ where: { whiteboardSessionId: id } });
        nearNow(token.revokedAt, "token revokedAt");

        const pid = pending.whiteboardSessionId;
        expect(reaperOutcomeFor(body, pid)?.action).toBe("reaped");
        const frozen = await readConsentSnapshots(pid);
        expect(frozen).toHaveLength(1);
        nearNow(frozen[0].frozenAt, "snapshot frozenAt");

        // Control: the tutor End on a seeded session also writes a real-time intent and leftAt = endedAt.
        await prisma.sessionParticipant.create({
          data: { whiteboardSessionId: control.whiteboardSessionId, learnerProfileId: control.learnerProfileId },
        });
        const ended = await invokeConsentAction(request, "endStaleWhiteboardSession", control.whiteboardSessionId);
        expect(ended.status(), await ended.text()).toBe(200);
        const controlRow = await readRow(control.whiteboardSessionId);
        nearNow(controlRow.boardPurgeRequestedAt, "tutor-End boardPurgeRequestedAt");
        const controlParticipant = await prisma.sessionParticipant.findFirstOrThrow({
          where: { whiteboardSessionId: control.whiteboardSessionId },
        });
        expect(controlParticipant.leftAt?.getTime()).toBe(controlRow.endedAt!.getTime());
      } finally {
        await Promise.all([active.cleanup(), pending.cleanup(), control.cleanup()]);
      }
    }
  );
});
