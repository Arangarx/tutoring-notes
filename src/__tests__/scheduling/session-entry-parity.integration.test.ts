/**
 * @jest-environment node
 *
 * W4 parity: the reason the UI shows and what the server does cannot disagree.
 * One scenario table, written by hand from the spec. For each scenario the test
 * checks, against the real database:
 *   1. the loaded entry state (what every UI surface renders), and
 *   2. what the SERVER actually does when its entry points are called directly,
 *      bypassing the UI: `startWhiteboardSession` (LIVE / IN_PERSON) and the schedule
 *      bridge (tutor = in person, learner = online).
 * Expected outcomes are the spec's (Decision 5, the 2026-10-28 16:23 lock), never read
 * back from the rule under test.
 */
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
jest.mock("next/cache", () => ({ __esModule: true, revalidatePath: jest.fn() }));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/auth-options", () => ({ authOptions: {} }));
jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(async (path: string) => ({
    url: `https://blob.vercel-storage.com/${path}-entry-parity`,
  })),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {}),
}));

import { db } from "@/lib/db";
import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { getOrCreateWhiteboardForSchedule } from "@/lib/whiteboard/schedule-bridge";
import type { EntryBlockReason, SessionEntryState } from "@/lib/scheduling/session-entry";
import { loadSessionEntryState } from "@/lib/scheduling/session-entry-loader";
import { uniq } from "../helpers/unique-test-token";

beforeEach(() => {
  mockGetServerSession.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

function mockSession(email: string, id: string) {
  mockGetServerSession.mockResolvedValue({
    user: { email, id, name: email, isImpersonating: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

async function seedTutor(label: string) {
  return db.adminUser.create({
    data: {
      email: `${uniq(label)}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
      displayName: label,
      isTestAccount: false,
    },
  });
}

type Scenario = {
  name: string;
  kind: "personal" | "org";
  claimed?: boolean; // default true
  selfLearner?: boolean;
  consent: "none" | "live_on" | "live_off";
  org?: { status: "active" | "suspended"; instructorRemoved?: boolean };
  /** The entry state every UI surface should render (reason codes from the spec). */
  state: SessionEntryState;
  /** Does the server let this mode through? (`start` = Start flips the session ACTIVE.) */
  inPersonAccepted: boolean;
  onlineAccepted: boolean;
  /** Reason code the bridge logs when it refuses (omit when the org admission check refuses first). */
  bridgeLoggedReason?: EntryBlockReason;
  /** The learner profile is tombstoned (erasure grace period). */
  erasurePending?: boolean;
  /**
   * What `startWhiteboardSession` throws for each refused mode: the error name, and for
   * consent errors the permission and (part of) the message. Hand-written from the spec.
   */
  startRefusal?: { name: string; permission?: string; message?: string };
  /** Org admission no-op: Start returns without activating and the log says why. */
  startNoopReason?: "org_inactive" | "instructor_not_admitted";
  /** What the schedule bridge throws to a tutor it refuses (the table line the control shows). */
  bridgeTutorRefusal?: { name: string; message?: string };
};

const CONSENT_RECORD_REFUSAL = {
  name: "ConsentError",
  permission: "consentRecord",
  message: "privacy preferences must be set",
} as const;

const ALLOWED = { allowed: true } as const;
const blocked = (reason: EntryBlockReason) => ({ allowed: false, reason }) as const;

const SCENARIOS: Scenario[] = [
  {
    name: "personal, consent allows live: both modes in",
    kind: "personal",
    consent: "live_on",
    state: { online: ALLOWED, inPerson: ALLOWED },
    inPersonAccepted: true,
    onlineAccepted: true,
  },
  {
    name: "personal, online sessions off: online refused, in person in (Decision 5)",
    kind: "personal",
    consent: "live_off",
    state: { online: blocked("live_off"), inPerson: ALLOWED },
    inPersonAccepted: true,
    onlineAccepted: false,
    bridgeLoggedReason: "live_off",
    startRefusal: {
      name: "ConsentError",
      permission: "allowLiveSession",
      message: "Live sessions are off in Maya's privacy settings.",
    },
  },
  {
    name: "personal, parent-held, no consent record: neither mode (16:23 lock)",
    kind: "personal",
    consent: "none",
    state: { online: blocked("consent_missing_parent"), inPerson: blocked("consent_missing_parent") },
    inPersonAccepted: false,
    onlineAccepted: false,
    bridgeLoggedReason: "consent_missing_parent",
    startRefusal: CONSENT_RECORD_REFUSAL,
    bridgeTutorRefusal: {
      name: "ConsentError",
      message: "The parent hasn't finished privacy preferences yet.",
    },
  },
  {
    name: "personal, self-learner, no consent record: neither mode",
    kind: "personal",
    selfLearner: true,
    consent: "none",
    state: { online: blocked("consent_missing_self"), inPerson: blocked("consent_missing_self") },
    inPersonAccepted: false,
    onlineAccepted: false,
    bridgeLoggedReason: "consent_missing_self",
    startRefusal: CONSENT_RECORD_REFUSAL,
    bridgeTutorRefusal: {
      name: "ConsentError",
      message: "Maya hasn't finished privacy preferences yet.",
    },
  },
  {
    name: "personal, unclaimed: neither mode",
    kind: "personal",
    claimed: false,
    consent: "none",
    state: { online: blocked("unclaimed"), inPerson: blocked("unclaimed") },
    inPersonAccepted: false,
    onlineAccepted: false,
    bridgeLoggedReason: "unclaimed",
    startRefusal: CONSENT_RECORD_REFUSAL,
    bridgeTutorRefusal: {
      name: "ConsentError",
      message: "Maya hasn't connected their Mynk account yet.",
    },
  },
  {
    name: "personal, erasure pending (profile in the grace period): neither mode",
    kind: "personal",
    consent: "live_on",
    erasurePending: true,
    state: { online: blocked("erasure_pending"), inPerson: blocked("erasure_pending") },
    inPersonAccepted: false,
    onlineAccepted: false,
    bridgeLoggedReason: "erasure_pending",
    startRefusal: { name: "ErasureAccessSuspendedError" },
    bridgeTutorRefusal: { name: "ErasureAccessSuspendedError" },
  },
  {
    name: "org active, admitted, consent allows live: both modes in",
    kind: "org",
    consent: "live_on",
    org: { status: "active" },
    state: { online: ALLOWED, inPerson: ALLOWED },
    inPersonAccepted: true,
    onlineAccepted: true,
  },
  {
    name: "org active, online sessions off: online refused, in person in",
    kind: "org",
    consent: "live_off",
    org: { status: "active" },
    state: { online: blocked("live_off"), inPerson: ALLOWED },
    inPersonAccepted: true,
    onlineAccepted: false,
    bridgeLoggedReason: "live_off",
    startRefusal: {
      name: "ConsentError",
      permission: "allowLiveSession",
      message: "Live sessions are off in Maya's privacy settings.",
    },
  },
  {
    name: "org suspended: neither mode (Start is the admission no-op, bridge refuses)",
    kind: "org",
    consent: "live_on",
    org: { status: "suspended" },
    state: { online: blocked("org_inactive"), inPerson: blocked("org_inactive") },
    inPersonAccepted: false,
    onlineAccepted: false,
    startNoopReason: "org_inactive",
  },
  {
    name: "org, instructor removed: neither mode",
    kind: "org",
    consent: "live_on",
    org: { status: "active", instructorRemoved: true },
    state: {
      online: blocked("instructor_not_admitted"),
      inPerson: blocked("instructor_not_admitted"),
    },
    inPersonAccepted: false,
    onlineAccepted: false,
    startNoopReason: "instructor_not_admitted",
  },
];

async function seedScenario(s: Scenario) {
  const tutor = await seedTutor("entry-tutor");
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("entry-ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const claimed = s.claimed !== false;
  const profile = claimed
    ? await db.learnerProfile.create({
        data: {
          accountHolderId: ah.id,
          displayName: "Maya",
          isSelfLearner: s.selfLearner === true,
          tombstonedAt: s.erasurePending ? new Date() : null,
        },
      })
    : null;

  let organizationId: string | null = null;
  if (s.kind === "org") {
    const owner = await seedTutor("entry-owner");
    const org = await db.organization.create({
      data: {
        name: `Org ${uniq("org")}`,
        status: s.org?.status ?? "active",
        timezone: "America/Denver",
        createdByOperatorId: "org-operator@example.com",
        members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
      },
    });
    organizationId = org.id;
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        adminUserId: tutor.id,
        roles: ["instructor"],
        removedAt: s.org?.instructorRemoved ? new Date() : null,
      },
    });
  }

  const student = await db.student.create({
    data: {
      name: "Maya",
      adminUserId: s.kind === "org" ? null : tutor.id,
      organizationId,
      learnerProfileId: profile?.id ?? null,
      parentEmail: `${uniq("parent")}@example.com`,
    },
  });
  if (s.kind === "org" && organizationId) {
    await db.organizationLearner.create({
      data: {
        studentId: student.id,
        organizationId,
        givenName: "Maya",
        familyName: "Lee",
        createdByAdminUserId: tutor.id,
      },
    });
  }
  if (profile && s.consent !== "none") {
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: s.kind === "org" ? null : tutor.id,
        organizationId,
        version: 1,
        allowLiveSession: s.consent === "live_on",
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
  }
  const startAt = new Date(Date.now() + 5 * 60_000);
  const sched = await db.scheduledSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      date: new Date("2026-10-20T00:00:00.000Z"),
      startTime: "16:00",
      endTime: "17:00",
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      plannedDurationMinutes: 60,
      subject: "Algebra",
    },
  });
  return { tutor, student, profile, sched };
}

async function pendingSession(adminUserId: string, studentId: string) {
  return db.whiteboardSession.create({
    data: {
      adminUserId,
      studentId,
      consentAcknowledged: true,
      eventsBlobUrl: "https://blob.example.com/events.json",
      sessionPhase: "PENDING",
    },
  });
}

describe("entry rule parity: what the UI shows is what the server does", () => {
  it.each(SCENARIOS)("$name", async (s) => {
    const { tutor, student, profile, sched } = await seedScenario(s);

    // 1. The state every UI surface renders.
    const studentRow = await db.student.findUniqueOrThrow({
      where: { id: student.id },
      include: { learnerProfile: { select: { isSelfLearner: true } } },
    });
    const state = await loadSessionEntryState({
      studentId: student.id,
      adminUserId: tutor.id,
      student: studentRow,
    });
    expect(state).toEqual(s.state);

    // 2. Start, called directly (not through the UI), in each mode.
    mockSession(tutor.email, tutor.id);
    const info = jest.spyOn(console, "info");
    for (const [mode, accepted] of [
      ["LIVE", s.onlineAccepted],
      ["IN_PERSON", s.inPersonAccepted],
    ] as const) {
      const row = await pendingSession(tutor.id, student.id);
      info.mockClear();
      const thrown = await startWhiteboardSession(row.id, mode).then(
        () => null,
        (err: unknown) => err as Error & { permission?: string }
      );
      const after = await db.whiteboardSession.findUniqueOrThrow({ where: { id: row.id } });
      expect({ mode, activated: after.sessionPhase === "ACTIVE" }).toEqual({
        mode,
        activated: accepted,
      });
      if (!accepted && s.startRefusal) {
        // The tutor is told why, and the reason is the spec's, not just "it threw".
        expect({ mode, name: thrown?.name }).toEqual({ mode, name: s.startRefusal.name });
        if (s.startRefusal.permission) {
          expect(thrown?.permission).toBe(s.startRefusal.permission);
        }
        if (s.startRefusal.message) expect(thrown?.message).toContain(s.startRefusal.message);
      } else if (!accepted) {
        // The org admission no-op: nothing thrown, nothing activated, and the log says why.
        expect(thrown).toBeNull();
        const lines = info.mock.calls.map((call) => String(call[0]));
        expect(
          lines.some(
            (line) =>
              line.includes(`wbsid=${row.id}`) &&
              line.includes("action=session_start_noop") &&
              line.includes(`reason=${s.startNoopReason}`)
          )
        ).toBe(true);
      } else {
        expect(thrown).toBeNull();
      }
    }

    // 3. The schedule bridge: tutor opens in person, learner joins online.
    const warn = jest.spyOn(console, "warn");
    const tutorOutcome = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: tutor.id },
      "rid-parity-tutor"
    ).then(
      (r) => ({ result: r.ok ? ("in" as const) : ("out" as const), error: null }),
      (err: unknown) => ({ result: "out" as const, error: err as Error })
    );
    expect(tutorOutcome.result).toBe(s.inPersonAccepted ? "in" : "out");
    if (s.bridgeTutorRefusal) {
      // The tutor sees the same words the disabled control shows (one copy table).
      expect(tutorOutcome.error?.name).toBe(s.bridgeTutorRefusal.name);
      if (s.bridgeTutorRefusal.message) {
        expect(tutorOutcome.error?.message).toBe(s.bridgeTutorRefusal.message);
      }
    }

    if (profile) {
      const learnerResult = await getOrCreateWhiteboardForSchedule(
        sched.id,
        { kind: "learner", learnerProfileId: profile.id },
        "rid-parity-learner"
      );
      expect(learnerResult.ok).toBe(s.onlineAccepted);
    } else {
      // Unclaimed: no learner account can be the participant, so any learner principal
      // is refused and the refusal leaves no session row behind.
      const before = await db.whiteboardSession.count({ where: { studentId: student.id } });
      const stranger = await getOrCreateWhiteboardForSchedule(
        sched.id,
        { kind: "learner", learnerProfileId: "not-this-learners-profile" },
        "rid-parity-stranger"
      );
      expect(stranger.ok).toBe(false);
      expect(await db.whiteboardSession.count({ where: { studentId: student.id } })).toBe(before);
    }
    // The refusal is attributable: the bridge logs the same reason code the UI showed.
    if (s.bridgeLoggedReason) {
      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(
        lines.some(
          (line) =>
            line.includes("action=schedule_bridge_refused") &&
            line.includes(`reason=${s.bridgeLoggedReason}`)
        )
      ).toBe(true);
    }
  });
});

describe("Start on a session that is already ACTIVE is a no-op, whatever the rule says now", () => {
  const ACTIVATED_AT = new Date("2026-10-20T15:00:00.000Z");

  async function activeSession(adminUserId: string, studentId: string) {
    return db.whiteboardSession.create({
      data: {
        adminUserId,
        studentId,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/events.json",
        sessionPhase: "ACTIVE",
        sessionMode: "LIVE",
        activatedAt: ACTIVATED_AT,
      },
    });
  }

  it.each([
    { name: "online sessions allowed", consent: "live_on" as const },
    { name: "online sessions now off (a family flip after Start)", consent: "live_off" as const },
  ])("$name: a second Start in person changes nothing and does not refuse", async ({ consent }) => {
    const { tutor, student } = await seedScenario({
      name: "active",
      kind: "personal",
      consent,
      state: { online: ALLOWED, inPerson: ALLOWED },
      inPersonAccepted: true,
      onlineAccepted: true,
    });
    mockSession(tutor.email, tutor.id);
    const info = jest.spyOn(console, "info");
    const row = await activeSession(tutor.id, student.id);

    // IN_PERSON on a LIVE session: the second Start must not rewrite the mode.
    await expect(startWhiteboardSession(row.id, "IN_PERSON")).resolves.toMatchObject({ ok: true });
    // LIVE again while online is off (second case): a no-op, not a refusal.
    await expect(startWhiteboardSession(row.id, "LIVE")).resolves.toMatchObject({ ok: true });

    const after = await db.whiteboardSession.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.sessionPhase).toBe("ACTIVE");
    expect(after.sessionMode).toBe("LIVE");
    expect(after.activatedAt?.toISOString()).toBe(ACTIVATED_AT.toISOString());
    const lines = info.mock.calls.map((call) => String(call[0]));
    expect(
      lines.filter(
        (line) =>
          line.includes(`wbsid=${row.id}`) &&
          line.includes("action=session_start_noop") &&
          line.includes("reason=not_pending")
      )
    ).toHaveLength(2);
  });
});