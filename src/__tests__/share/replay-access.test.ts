/**
 * @jest-environment node
 *
 * `resolveReplayAccess` — the one replay decision (consent wave C6, plan § 2.9).
 *
 * Oracle: the rows the caller can see (ended, the frozen snapshot toggles, the stored session mode, the live
 * consent record, who owns the student). The expected answers are the hand-written table below, not a call back
 * into the code under test. The live resolver is spied through consent-scope so "a session with a snapshot never
 * reads the live record" is observed, not assumed.
 */

import { db } from "@/lib/db";
import * as consentScope from "@/lib/consent-scope";
import { replayAccessAny, replayResourceIsDenied, resolveReplayAccess } from "@/lib/share/replay-access";
import { uniq } from "../helpers/unique-test-token";

jest.mock("@/lib/consent-scope", () => {
  const actual = jest.requireActual("@/lib/consent-scope");
  return { ...actual, resolveEffectiveConsentForStudent: jest.fn(actual.resolveEffectiveConsentForStudent) };
});

const liveResolver = consentScope.resolveEffectiveConsentForStudent as jest.Mock;

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => liveResolver.mockClear());

type Seed = {
  ended?: boolean;
  mode?: "LIVE" | "IN_PERSON";
  /** Frozen snapshot toggles. Undefined = no snapshot (a legacy session). */
  snapshot?: { audio: boolean; whiteboard: boolean };
  /** The live ConsentRecord whiteboard switch. Undefined = no record at all. */
  liveWhiteboard?: boolean;
  restrictWhiteboard?: boolean;
  /** Seed the learner under an organization instead of a tutor. */
  organization?: { liveWhiteboard: boolean; tutorLiveWhiteboard: boolean };
};

async function seed(opts: Seed) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
  });
  const holder = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date("2026-01-01") },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: holder.id, displayName: "Replay access child", isSelfLearner: false },
  });
  const org = opts.organization
    ? await db.organization.create({ data: { name: uniq("org"), createdByOperatorId: "jest-operator@example.com" } })
    : null;
  const student = await db.student.create({
    data: org
      ? { name: "Org child", organizationId: org.id, learnerProfileId: profile.id }
      : { name: "Replay access child", adminUserId: tutor.id, learnerProfileId: profile.id },
  });
  const record = (whiteboard: boolean, owner: { adminUserId: string | null; organizationId: string | null }) =>
    db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        ...owner,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: whiteboard,
        allowNoteSending: true,
        setByAccountHolderId: holder.id,
        captureMethod: "electronic",
      },
    });
  if (opts.liveWhiteboard !== undefined) await record(opts.liveWhiteboard, { adminUserId: tutor.id, organizationId: null });
  if (opts.organization && org) {
    // Two owners with opposite answers: the student's owner must be the one read.
    await record(opts.organization.liveWhiteboard, { adminUserId: null, organizationId: org.id });
    await record(opts.organization.tutorLiveWhiteboard, { adminUserId: tutor.id, organizationId: null });
  }
  if (opts.restrictWhiteboard) {
    await db.consentRestriction.create({ data: { learnerProfileId: profile.id, restrictWhiteboardRecording: true } });
  }
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      endedAt: opts.ended === false ? null : new Date("2026-06-01T01:00:00Z"),
      eventsBlobUrl: "https://example.invalid/replay-events.json",
      sessionMode: opts.mode ?? "LIVE",
    },
  });
  if (opts.snapshot) {
    await db.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId: session.id,
        allowLiveSession: true,
        allowAudioRecording: opts.snapshot.audio,
        allowWhiteboardRecording: opts.snapshot.whiteboard,
        allowNoteSending: true,
      },
    });
  }
  return session.id;
}

async function decide(opts: Seed) {
  const id = await seed(opts);
  const access = (await resolveReplayAccess([id])).get(id)!;
  return { id, access };
}

describe("resolveReplayAccess: a session with a snapshot", () => {
  // The spec table (plan § 2.9): what was recorded decides what replays.
  const table: Array<{ name: string; seed: Seed; audio: boolean; board: boolean }> = [
    { name: "online, everything on", seed: { snapshot: { audio: true, whiteboard: true } }, audio: true, board: true },
    { name: "online, whiteboard off", seed: { snapshot: { audio: true, whiteboard: false } }, audio: true, board: false },
    // Online with audio off still records the tutor's side, so audio replay stays.
    { name: "online, audio off", seed: { snapshot: { audio: false, whiteboard: true } }, audio: true, board: true },
    {
      name: "in person, audio on",
      seed: { mode: "IN_PERSON", snapshot: { audio: true, whiteboard: true } },
      audio: true,
      board: true,
    },
    {
      name: "in person, audio off (nothing captured)",
      seed: { mode: "IN_PERSON", snapshot: { audio: false, whiteboard: true } },
      audio: false,
      board: true,
    },
    {
      name: "in person, audio off and whiteboard off",
      seed: { mode: "IN_PERSON", snapshot: { audio: false, whiteboard: false } },
      audio: false,
      board: false,
    },
  ];

  it.each(table)("$name", async ({ seed: s, audio, board }) => {
    const { access } = await decide(s);
    expect({ audio: access.audio, board: access.board, reason: access.reason }).toEqual({
      audio,
      board,
      reason: "snapshot",
    });
  });

  it("never reads the live consent record, whatever it says (Q8)", async () => {
    const revoked = await decide({
      snapshot: { audio: true, whiteboard: true },
      liveWhiteboard: false,
      restrictWhiteboard: true,
    });
    const granted = await decide({ snapshot: { audio: true, whiteboard: false }, liveWhiteboard: true });
    expect(revoked.access).toMatchObject({ board: true, audio: true });
    expect(granted.access).toMatchObject({ board: false, audio: true });
    expect(liveResolver).not.toHaveBeenCalled();
  });

  it("ignores which owner's record is latest (a snapshot session reads no record at all)", async () => {
    const { access } = await decide({
      snapshot: { audio: true, whiteboard: true },
      organization: { liveWhiteboard: false, tutorLiveWhiteboard: true },
    });
    expect(access).toMatchObject({ board: true, audio: true, reason: "snapshot" });
    expect(liveResolver).not.toHaveBeenCalled();
  });
});

describe("resolveReplayAccess: a legacy session without a snapshot", () => {
  it("opens audio and follows the live record for the board", async () => {
    const allowed = await decide({ liveWhiteboard: true });
    const denied = await decide({ liveWhiteboard: false });
    expect(allowed.access).toEqual({ audio: true, board: true, reason: "legacy" });
    expect(denied.access).toEqual({ audio: true, board: false, reason: "legacy" });
    expect(liveResolver).toHaveBeenCalled();
  });

  it("applies the child restriction on top of the record", async () => {
    const { access } = await decide({ liveWhiteboard: true, restrictWhiteboard: true });
    expect(access).toEqual({ audio: true, board: false, reason: "legacy" });
  });

  it("a missing record stays open", async () => {
    const { access } = await decide({});
    expect(access).toEqual({ audio: true, board: true, reason: "legacy" });
  });

  it("reads the student's owner, not another owner's record", async () => {
    // The student belongs to the organization: its record (off) decides, not the tutor's (on).
    const { access } = await decide({ organization: { liveWhiteboard: false, tutorLiveWhiteboard: true } });
    expect(access).toMatchObject({ board: false, reason: "legacy" });
  });
});

describe("resolveReplayAccess: sessions that cannot be replayed", () => {
  it("a session that has not ended denies both halves, snapshot or not", async () => {
    const withSnapshot = await decide({ ended: false, snapshot: { audio: true, whiteboard: true } });
    const legacy = await decide({ ended: false });
    for (const { access } of [withSnapshot, legacy]) {
      expect(access).toEqual({ audio: false, board: false, reason: "not_ended" });
    }
  });

  it("a missing session denies both halves", async () => {
    const access = (await resolveReplayAccess(["no-such-session"])).get("no-such-session");
    expect(access).toEqual({ audio: false, board: false, reason: "missing" });
  });

  it("answers every id in one call, in a map keyed by session id", async () => {
    const [a, b] = [await seed({ snapshot: { audio: true, whiteboard: true } }), await seed({ ended: false })];
    const result = await resolveReplayAccess([a, b, a]);
    expect([...result.keys()].sort()).toEqual([a, b].sort());
    expect(result.get(a)?.reason).toBe("snapshot");
    expect(result.get(b)?.reason).toBe("not_ended");
    expect(await resolveReplayAccess([])).toEqual(new Map());
  });
});

describe("replay access helpers", () => {
  it("replayAccessAny is true when either half is open", () => {
    expect(replayAccessAny({ audio: true, board: false, reason: "snapshot" })).toBe(true);
    expect(replayAccessAny({ audio: false, board: true, reason: "snapshot" })).toBe(true);
    expect(replayAccessAny({ audio: false, board: false, reason: "snapshot" })).toBe(false);
    expect(replayAccessAny(undefined)).toBe(false);
  });

  it("replayResourceIsDenied leaves missing and live sessions to the caller's own gate", () => {
    const denied = { audio: false, board: false } as const;
    expect(replayResourceIsDenied({ ...denied, reason: "snapshot" }, "board")).toBe(true);
    expect(replayResourceIsDenied({ audio: true, board: false, reason: "snapshot" }, "audio")).toBe(false);
    expect(replayResourceIsDenied({ audio: true, board: false, reason: "snapshot" }, "board")).toBe(true);
    expect(replayResourceIsDenied({ ...denied, reason: "not_ended" }, "board")).toBe(false);
    expect(replayResourceIsDenied({ ...denied, reason: "missing" }, "audio")).toBe(false);
    expect(replayResourceIsDenied(undefined, "audio")).toBe(false);
  });
});
