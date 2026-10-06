/**
 * @jest-environment node
 *
 * Schedule → whiteboard bridge against the real test DB.
 * Spec (plan "The shared schedule bridge"):
 *   - one whiteboard session per appointment; double click / tutor + learner
 *     together return the same session
 *   - learner side only inside the join window; parent joins for child;
 *     another family gets nothing
 *   - consent still gates the room (no ConsentRecord → no session)
 *   - creation does not start the session (PENDING), and gets a server key
 *
 * DB: tutoring_notes_test via jest.global-setup.ts. Blob put is mocked.
 */

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(async (path: string) => ({
    url: `https://blob.vercel-storage.com/${path}-${Math.random().toString(36).slice(2)}`,
  })),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {}),
}));

import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import { deleteBlob } from "@/lib/blob";
import { db } from "@/lib/db";
import { getOrCreateWhiteboardForSchedule } from "@/lib/whiteboard/schedule-bridge";
import { readServerLiveKey } from "@/lib/whiteboard/live-key";
import { uniq } from "../helpers/unique-test-token";

const prevKey = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
});
afterAll(() => {
  if (prevKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = prevKey;
});
beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const START = new Date("2026-10-06T18:00:00.000Z");
const END = new Date("2026-10-06T19:00:00.000Z");
const DURING = new Date("2026-10-06T18:05:00.000Z");

async function seed(opts: {
  isSelfLearner: boolean;
  withConsent?: boolean;
  allowLiveSession?: boolean;
}) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
  });
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: "Kid", isSelfLearner: opts.isSelfLearner },
  });
  const student = await db.student.create({
    data: { name: "Kid", adminUserId: tutor.id, learnerProfileId: profile.id },
  });
  if (opts.withConsent ?? true) {
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: opts.allowLiveSession ?? true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
  }
  const sched = await db.scheduledSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      date: new Date("2026-10-06T00:00:00.000Z"),
      startTime: "18:00",
      endTime: "19:00",
      startAt: START,
      endAt: END,
      plannedDurationMinutes: 60,
      subject: "Math",
    },
  });
  return { tutor, ah, profile, student, sched };
}

describe("getOrCreateWhiteboardForSchedule", () => {
  it("tutor opens a PENDING session for the appointment with a server key and a participant row", async () => {
    const { tutor, profile, sched, student } = await seed({ isSelfLearner: false });
    const r = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: tutor.id },
      "rid-1"
    );
    expect(r).toMatchObject({ ok: true, created: true, studentId: student.id });
    if (!r.ok) throw new Error("unreachable");
    const row = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: r.whiteboardSessionId },
      include: { sessionParticipants: true, consentSnapshot: true },
    });
    expect(row.scheduledSessionId).toBe(sched.id);
    expect(row.adminUserId).toBe(tutor.id);
    expect(row.sessionPhase).toBe("PENDING");
    expect(row.activatedAt).toBeNull();
    expect(row.sessionParticipants.map((p) => p.learnerProfileId)).toEqual([profile.id]);
    expect(row.consentSnapshot?.allowLiveSession).toBe(true);
    const key = readServerLiveKey(row.id, row.liveKeyEnc);
    expect(key && Buffer.from(key, "base64url").length).toBe(32);
  });

  it("a second call returns the same session", async () => {
    const { tutor, sched } = await seed({ isSelfLearner: true });
    const a = await getOrCreateWhiteboardForSchedule(sched.id, { kind: "tutor", adminUserId: tutor.id }, "r");
    const b = await getOrCreateWhiteboardForSchedule(sched.id, { kind: "tutor", adminUserId: tutor.id }, "r");
    expect(a.ok && b.ok && a.whiteboardSessionId === b.whiteboardSessionId).toBe(true);
    expect(b).toMatchObject({ created: false });
  });

  it("tutor and parent arriving at the same moment get one session", async () => {
    const { tutor, ah, sched } = await seed({ isSelfLearner: false });
    const results = await Promise.all([
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "tutor", adminUserId: tutor.id }, "r1", DURING),
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "account_holder", accountHolderId: ah.id }, "r2", DURING),
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "account_holder", accountHolderId: ah.id }, "r3", DURING),
    ]);
    const ids = new Set(results.map((r) => (r.ok ? r.whiteboardSessionId : `fail:${r.reason}`)));
    expect(ids.size).toBe(1);
    expect([...ids][0]).not.toMatch(/^fail:/);
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(1);
  });

  it("parent joins for their child inside the window", async () => {
    const { ah, sched } = await seed({ isSelfLearner: false });
    const r = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "account_holder", accountHolderId: ah.id },
      "r",
      DURING
    );
    expect(r.ok).toBe(true);
  });

  it("learner cookie for the appointment's profile may enter", async () => {
    const { profile, sched } = await seed({ isSelfLearner: false });
    const r = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "learner", learnerProfileId: profile.id },
      "r",
      DURING
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    ["16 minutes early", new Date("2026-10-06T17:44:00.000Z")],
    ["after the end", new Date("2026-10-06T19:00:00.000Z")],
  ])("learner side is refused %s and nothing is created", async (_label, when) => {
    const { ah, sched } = await seed({ isSelfLearner: false });
    const r = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "account_holder", accountHolderId: ah.id },
      "r",
      when
    );
    expect(r).toEqual({ ok: false, reason: "not_yet" });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
  });

  it("another family, another learner, and another tutor get not_found", async () => {
    const { sched } = await seed({ isSelfLearner: false });
    const other = await seed({ isSelfLearner: false });
    const tries = await Promise.all([
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "account_holder", accountHolderId: other.ah.id }, "r", DURING),
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "learner", learnerProfileId: other.profile.id }, "r", DURING),
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "tutor", adminUserId: other.tutor.id }, "r", DURING),
    ]);
    for (const r of tries) expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
  });

  it("no consent record: learner side gets a neutral refusal and no room exists", async () => {
    const { ah, sched } = await seed({ isSelfLearner: false, withConsent: false });
    const r = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "account_holder", accountHolderId: ah.id },
      "r",
      DURING
    );
    expect(r).toEqual({ ok: false, reason: "not_available" });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
  });

  it.each([
    ["parent", (s: Awaited<ReturnType<typeof seed>>) => ({ kind: "account_holder" as const, accountHolderId: s.ah.id })],
    ["learner", (s: Awaited<ReturnType<typeof seed>>) => ({ kind: "learner" as const, learnerProfileId: s.profile.id })],
  ])(
    "live sessions not allowed by the parent: %s gets a neutral refusal and no room or storage is created",
    async (_label, principalFor) => {
      const s = await seed({ isSelfLearner: false, allowLiveSession: false });
      (put as jest.Mock).mockClear();
      const r = await getOrCreateWhiteboardForSchedule(s.sched.id, principalFor(s), "r", DURING);
      expect(r).toEqual({ ok: false, reason: "not_available" });
      expect(await db.whiteboardSession.count({ where: { scheduledSessionId: s.sched.id } })).toBe(0);
      expect(put).not.toHaveBeenCalled();
    }
  );

  it("a self learner is not held back by the live-session flag", async () => {
    const s = await seed({ isSelfLearner: true, allowLiveSession: false });
    const r = await getOrCreateWhiteboardForSchedule(
      s.sched.id,
      { kind: "learner", learnerProfileId: s.profile.id },
      "r",
      DURING
    );
    expect(r.ok).toBe(true);
  });

  it("losing a create race returns the winner and drops the loser's empty storage", async () => {
    const { tutor, sched } = await seed({ isSelfLearner: true });
    const winner = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: tutor.id },
      "r-winner"
    );
    if (!winner.ok) throw new Error("winner should open");
    // Force the loser past the reuse lookup so its insert collides on the
    // unique scheduledSessionId (the window two simultaneous arrivals hit).
    const realFindUnique = db.whiteboardSession.findUnique.bind(db.whiteboardSession);
    jest
      .spyOn(db.whiteboardSession, "findUnique")
      .mockImplementationOnce((async () => null) as never)
      .mockImplementation(realFindUnique as never);
    (put as jest.Mock).mockClear();
    (deleteBlob as jest.Mock).mockClear();

    const loser = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: tutor.id },
      "r-loser"
    );

    expect(loser).toEqual({
      ok: true,
      whiteboardSessionId: winner.whiteboardSessionId,
      studentId: winner.studentId,
      created: false,
    });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(1);
    const loserBlobUrl = (await (put as jest.Mock).mock.results[0].value).url;
    expect(deleteBlob).toHaveBeenCalledWith(loserBlobUrl);
  });

  it("no consent record: the tutor sees the consent error", async () => {
    const { tutor, sched } = await seed({ isSelfLearner: false, withConsent: false });
    await expect(
      getOrCreateWhiteboardForSchedule(sched.id, { kind: "tutor", adminUserId: tutor.id }, "r")
    ).rejects.toThrow();
  });

  it("unknown appointment is not_found", async () => {
    const r = await getOrCreateWhiteboardForSchedule(
      "00000000-0000-0000-0000-000000000000",
      { kind: "tutor", adminUserId: "x" },
      "r"
    );
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});
