/**
 * @jest-environment jsdom
 *
 * H-5 / T-new-F — join page live-session consent gate.
 *
 * Denies claimed minors (non-self) when no SessionConsentSnapshot exists,
 * reusing the existing "Session not available" denial path.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("@/lib/env", () => ({
  env: {
    WHITEBOARD_SYNC_URL: "wss://test-sync.example.com",
  },
}));

const getLearnerSessionFromHeadersMock = jest.fn();
const getAccountHolderSessionFromHeadersMock = jest.fn();

jest.mock("@/lib/server-session", () => ({
  __esModule: true,
  getLearnerSessionFromHeaders: () => getLearnerSessionFromHeadersMock(),
  getAccountHolderSessionFromHeaders: () =>
    getAccountHolderSessionFromHeadersMock(),
}));

jest.mock("@/app/join/[sessionId]/JoinAuthGate", () => ({
  JoinAuthGate: () => <div data-testid="join-auth-gate">JoinAuthGate</div>,
}));

jest.mock("@/app/join/[sessionId]/JoinHashRestorer", () => ({
  JoinHashRestorer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="join-hash-restorer">{children}</div>
  ),
}));

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell",
  () => ({
    WhiteboardSessionShell: () => (
      <div data-testid="whiteboard-session-shell">WhiteboardSessionShell</div>
    ),
  })
);

import { db } from "@/lib/db";
import { createSessionConsentSnapshot } from "@/lib/consent-scope";
import JoinSessionPage from "@/app/join/[sessionId]/page";
import { uniq } from "../helpers/unique-test-token";

// ---------------------------------------------------------------------------
// Helpers (mirrors consent-b2.test.ts)
// ---------------------------------------------------------------------------


async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createAccountHolder(opts?: { isSelfLearner?: boolean }) {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createLearnerProfile(
  accountHolderId: string,
  opts?: { isSelfLearner?: boolean }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createStudent(
  adminUserId: string,
  learnerProfileId?: string | null
) {
  return db.student.create({
    data: {
      name: "Test Student",
      adminUserId,
      learnerProfileId: learnerProfileId ?? null,
    },
  });
}

async function createConsentRecord(
  learnerProfileId: string,
  adminUserId: string,
  version: number,
  overrides?: Partial<{ allowLiveSession: boolean }>
) {
  const ah = await db.learnerProfile.findUniqueOrThrow({
    where: { id: learnerProfileId },
    select: { accountHolderId: true },
  });
  return db.consentRecord.create({
    data: {
      learnerProfileId,
      adminUserId,
      version,
      allowLiveSession: overrides?.allowLiveSession ?? true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.accountHolderId,
      captureMethod: "electronic",
    },
  });
}

type JoinFixtureOpts = {
  learnerProfileId: string | null;
  isSelfLearner?: boolean;
  withSnapshot?: boolean;
  allowLiveSession?: boolean;
};

async function createJoinFixture(opts: JoinFixtureOpts) {
  const tutor = await createTutor();
  const student = await createStudent(tutor.id, opts.learnerProfileId);
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      eventsSchemaVersion: 1,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
    },
  });

  if (
    opts.withSnapshot &&
    opts.learnerProfileId &&
    !opts.isSelfLearner
  ) {
    await createConsentRecord(
      opts.learnerProfileId,
      tutor.id,
      1,
      { allowLiveSession: opts.allowLiveSession ?? true }
    );
    await db.$transaction(async (tx) => {
      await createSessionConsentSnapshot(
        tx,
        session.id,
        opts.learnerProfileId!,
        tutor.id
      );
    });
  }

  if (opts.learnerProfileId) {
    await db.sessionParticipant.create({
      data: {
        whiteboardSessionId: session.id,
        learnerProfileId: opts.learnerProfileId,
        joinedAt: new Date(),
      },
    });
  }

  return { tutor, student, session };
}

async function renderJoinPage(sessionId: string, learnerProfileId: string) {
  getLearnerSessionFromHeadersMock.mockResolvedValue({ learnerProfileId });
  getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);

  const element = await JoinSessionPage({
    params: Promise.resolve({ sessionId }),
  });
  render(element);
}

// ---------------------------------------------------------------------------
// T-new-F + positive pairs
// ---------------------------------------------------------------------------

describe("JoinSessionPage — live join consent gate (H-5 / T-new-F)", () => {
  beforeEach(() => {
    getLearnerSessionFromHeadersMock.mockReset();
    getAccountHolderSessionFromHeadersMock.mockReset();
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("T-new-F: claimed minor + no SessionConsentSnapshot → denied (session not available)", async () => {
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      withSnapshot: false,
    });

    await renderJoinPage(session.id, profile.id);

    expect(screen.getByRole("heading", { name: /session not available/i })).toBeInTheDocument();
    expect(screen.queryByTestId("whiteboard-session-shell")).not.toBeInTheDocument();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("action=join_denied reason=no_consent_snapshot")
    );
  });

  it("claimed minor + all-off snapshot → denied via allowLiveSession path", async () => {
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      withSnapshot: true,
      allowLiveSession: false,
    });

    await renderJoinPage(session.id, profile.id);

    expect(screen.getByRole("heading", { name: /session not available/i })).toBeInTheDocument();
    expect(screen.queryByTestId("whiteboard-session-shell")).not.toBeInTheDocument();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("action=join_denied_consent_live_session")
    );
  });

  it("claimed minor + all-true snapshot → allowed", async () => {
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      withSnapshot: true,
      allowLiveSession: true,
    });

    await renderJoinPage(session.id, profile.id);

    expect(screen.queryByRole("heading", { name: /session not available/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-session-shell")).toBeInTheDocument();
  });

  it("self-learner without snapshot → allowed (consent block skipped)", async () => {
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      isSelfLearner: true,
      withSnapshot: false,
    });

    await renderJoinPage(session.id, profile.id);

    expect(screen.queryByRole("heading", { name: /session not available/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-session-shell")).toBeInTheDocument();
  });

  it("unclaimed student + no snapshot → not denied by consent gate", async () => {
    const tutor = await createTutor();
    const student = await createStudent(tutor.id, null);
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
        eventsSchemaVersion: 1,
        sessionPhase: "ACTIVE",
        sessionMode: "LIVE",
      },
    });

    const ah = await createAccountHolder();
    const joiningProfile = await createLearnerProfile(ah.id);
    await db.sessionParticipant.create({
      data: {
        whiteboardSessionId: session.id,
        learnerProfileId: joiningProfile.id,
        joinedAt: new Date(),
      },
    });

    await renderJoinPage(session.id, joiningProfile.id);

    expect(screen.queryByRole("heading", { name: /session not available/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-session-shell")).toBeInTheDocument();
  });
});
