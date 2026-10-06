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

import { randomBytes } from "crypto";
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

async function seed(opts: { isSelfLearner: boolean; withConsent?: boolean }) {
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
        allowLiveSession: true,
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
