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
};

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
  },
  {
    name: "personal, parent-held, no consent record: neither mode (16:23 lock)",
    kind: "personal",
    consent: "none",
    state: { online: blocked("consent_missing_parent"), inPerson: blocked("consent_missing_parent") },
    inPersonAccepted: false,
    onlineAccepted: false,
    bridgeLoggedReason: "consent_missing_parent",
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
  },
  {
    name: "org suspended: neither mode (Start is the admission no-op, bridge refuses)",
    kind: "org",
    consent: "live_on",
    org: { status: "suspended" },
    state: { online: blocked("org_inactive"), inPerson: blocked("org_inactive") },
    inPersonAccepted: false,
    onlineAccepted: false,
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
    for (const [mode, accepted] of [
      ["LIVE", s.onlineAccepted],
      ["IN_PERSON", s.inPersonAccepted],
    ] as const) {
      const row = await pendingSession(tutor.id, student.id);
      const outcome = await startWhiteboardSession(row.id, mode).then(
        () => "returned" as const,
        () => "threw" as const
      );
      const after = await db.whiteboardSession.findUniqueOrThrow({ where: { id: row.id } });
      expect({ mode, activated: after.sessionPhase === "ACTIVE" }).toEqual({
        mode,
        activated: accepted,
      });
      // A refusal is visible to the tutor (it throws) except for the org admission
      // no-op, which is pinned by the org-removal tests and never activates.
      if (!accepted && s.kind === "personal") expect(outcome).toBe("threw");
    }

    // 3. The schedule bridge: tutor opens in person, learner joins online.
    const warn = jest.spyOn(console, "warn");
    const tutorResult = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: tutor.id },
      "rid-parity-tutor"
    ).then(
      (r) => (r.ok ? ("in" as const) : ("out" as const)),
      () => "out" as const
    );
    expect(tutorResult).toBe(s.inPersonAccepted ? "in" : "out");

    if (profile) {
      const learnerResult = await getOrCreateWhiteboardForSchedule(
        sched.id,
        { kind: "learner", learnerProfileId: profile.id },
        "rid-parity-learner"
      );
      expect(learnerResult.ok).toBe(s.onlineAccepted);
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
