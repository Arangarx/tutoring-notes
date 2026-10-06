/**
 * @jest-environment jsdom
 *
 * Join denial redirect matrix — authenticated wrong AH vs unauthenticated vs
 * fail-closed child cross-learner 404.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

import React from "react";
import { render, screen } from "@testing-library/react";

const redirectMock = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: (url: string) => redirectMock(url),
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
    WhiteboardSessionShell: ({ learnerProfileId }: { learnerProfileId?: string }) => (
      <div data-testid="whiteboard-session-shell" data-learner={learnerProfileId}>
        WhiteboardSessionShell
      </div>
    ),
  })
);

jest.mock("@/components/whiteboard/ServerLiveKeySeeder", () => ({
  ServerLiveKeySeeder: ({
    liveKey,
    children,
  }: {
    liveKey: string | null;
    children: React.ReactNode;
  }) => (
    <div data-testid="live-key-seeder" data-live-key={liveKey ?? ""}>
      {children}
    </div>
  ),
}));

import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { NOT_MY_SESSION_PATH } from "@/lib/join-scope";
import { mintServerLiveKey } from "@/lib/whiteboard/live-key";
import JoinSessionPage from "@/app/join/[sessionId]/page";
import { uniq } from "../helpers/unique-test-token";

async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
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

async function createJoinSession(
  adminUserId: string,
  studentId: string,
  participantProfileId?: string
) {
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId,
      studentId,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      eventsSchemaVersion: 1,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
    },
  });

  if (participantProfileId) {
    await db.sessionParticipant.create({
      data: {
        whiteboardSessionId: session.id,
        learnerProfileId: participantProfileId,
        joinedAt: new Date(),
      },
    });
  }

  return session;
}

/** Child sessions need a consent snapshot allowing live sessions to render. */
async function createAllowingSnapshot(whiteboardSessionId: string) {
  return db.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    },
  });
}

async function callJoinPage(sessionId: string) {
  return JoinSessionPage({
    params: Promise.resolve({ sessionId }),
  });
}

describe("JoinSessionPage — denial redirect matrix", () => {
  beforeEach(() => {
    getLearnerSessionFromHeadersMock.mockReset();
    getAccountHolderSessionFromHeadersMock.mockReset();
    redirectMock.mockClear();
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("redirects authenticated AH on child session to not-my-session", async () => {
    const tutor = await createTutor();
    const sessionOwnerAh = await createAccountHolder();
    const childProfile = await createLearnerProfile(sessionOwnerAh.id, {
      isSelfLearner: false,
    });
    const student = await createStudent(tutor.id, childProfile.id);
    const session = await createJoinSession(
      tutor.id,
      student.id,
      childProfile.id
    );

    const wrongAh = await createAccountHolder();
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({
      accountHolderId: wrongAh.id,
    });

    await expect(callJoinPage(session.id)).rejects.toThrow(
      new RegExp(`NEXT_REDIRECT:${NOT_MY_SESSION_PATH}`)
    );
    expect(redirectMock).toHaveBeenCalledWith(NOT_MY_SESSION_PATH);
  });

  it("redirects authenticated AH who does not own self-learner session to not-my-session", async () => {
    const tutor = await createTutor();
    const ownerAh = await createAccountHolder();
    const selfProfile = await createLearnerProfile(ownerAh.id, {
      isSelfLearner: true,
    });
    const student = await createStudent(tutor.id, selfProfile.id);
    const session = await createJoinSession(
      tutor.id,
      student.id,
      selfProfile.id
    );

    const wrongAh = await createAccountHolder();
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({
      accountHolderId: wrongAh.id,
    });

    await expect(callJoinPage(session.id)).rejects.toThrow(
      new RegExp(`NEXT_REDIRECT:${NOT_MY_SESSION_PATH}`)
    );
    expect(redirectMock).toHaveBeenCalledWith(NOT_MY_SESSION_PATH);
  });

  it("renders JoinAuthGate when unauthenticated", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const childProfile = await createLearnerProfile(ah.id, {
      isSelfLearner: false,
    });
    const student = await createStudent(tutor.id, childProfile.id);
    const session = await createJoinSession(
      tutor.id,
      student.id,
      childProfile.id
    );

    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);

    const element = await callJoinPage(session.id);
    render(element);

    expect(screen.getByTestId("join-auth-gate")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("lets the parent who owns the child's profile join as that child", async () => {
    const tutor = await createTutor();
    const parentAh = await createAccountHolder();
    const childProfile = await createLearnerProfile(parentAh.id, {
      isSelfLearner: false,
    });
    const student = await createStudent(tutor.id, childProfile.id);
    const session = await createJoinSession(tutor.id, student.id, childProfile.id);
    await createAllowingSnapshot(session.id);

    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({
      accountHolderId: parentAh.id,
    });

    render(await callJoinPage(session.id));
    expect(screen.getByTestId("whiteboard-session-shell")).toHaveAttribute(
      "data-learner",
      childProfile.id
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("parent of one child cannot reach another family's child", async () => {
    const tutor = await createTutor();
    const otherParent = await createAccountHolder();
    const otherChild = await createLearnerProfile(otherParent.id, { isSelfLearner: false });
    const student = await createStudent(tutor.id, otherChild.id);
    const session = await createJoinSession(tutor.id, student.id, otherChild.id);

    const parentAh = await createAccountHolder();
    await createLearnerProfile(parentAh.id, { isSelfLearner: false });
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({ accountHolderId: parentAh.id });

    await expect(callJoinPage(session.id)).rejects.toThrow(
      new RegExp(`NEXT_REDIRECT:${NOT_MY_SESSION_PATH}`)
    );
  });

  it("an account holder cannot join an unclaimed student's session", async () => {
    const tutor = await createTutor();
    const student = await createStudent(tutor.id, null);
    const session = await createJoinSession(tutor.id, student.id);
    const ah = await createAccountHolder();
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({ accountHolderId: ah.id });

    await expect(callJoinPage(session.id)).rejects.toThrow(
      new RegExp(`NEXT_REDIRECT:${NOT_MY_SESSION_PATH}`)
    );
  });

  it("hands the server-held key to the authorized participant's page", async () => {
    const prev = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    try {
      const tutor = await createTutor();
      const ah = await createAccountHolder();
      const self = await createLearnerProfile(ah.id, { isSelfLearner: true });
      const student = await createStudent(tutor.id, self.id);
      const session = await createJoinSession(tutor.id, student.id, self.id);
      const minted = mintServerLiveKey("test")!;
      await db.whiteboardSession.update({
        where: { id: session.id },
        data: { liveKeyEnc: minted.liveKeyEnc },
      });

      getLearnerSessionFromHeadersMock.mockResolvedValue(null);
      getAccountHolderSessionFromHeadersMock.mockResolvedValue({ accountHolderId: ah.id });

      render(await callJoinPage(session.id));
      expect(screen.getByTestId("live-key-seeder")).toHaveAttribute(
        "data-live-key",
        minted.liveKey
      );
    } finally {
      if (prev === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
      else process.env.TOTP_ENCRYPTION_KEY = prev;
    }
  });

  it("legacy sessions pass no server key (link-fragment path unchanged)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const self = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const student = await createStudent(tutor.id, self.id);
    const session = await createJoinSession(tutor.id, student.id, self.id);
    getLearnerSessionFromHeadersMock.mockResolvedValue(null);
    getAccountHolderSessionFromHeadersMock.mockResolvedValue({ accountHolderId: ah.id });

    render(await callJoinPage(session.id));
    expect(screen.getByTestId("live-key-seeder")).toHaveAttribute("data-live-key", "");
  });

  it("fail-closed 404 when child session has non-participant learner cookie (G6 boundary)", async () => {
    const tutor = await createTutor();
    const sessionOwnerAh = await createAccountHolder();
    const participantProfile = await createLearnerProfile(sessionOwnerAh.id, {
      isSelfLearner: false,
    });
    const student = await createStudent(tutor.id, participantProfile.id);
    const session = await createJoinSession(
      tutor.id,
      student.id,
      participantProfile.id
    );

    const wrongLearnerAh = await createAccountHolder();
    const wrongLearnerProfile = await createLearnerProfile(wrongLearnerAh.id, {
      isSelfLearner: false,
    });

    getLearnerSessionFromHeadersMock.mockResolvedValue({
      learnerProfileId: wrongLearnerProfile.id,
    });
    getAccountHolderSessionFromHeadersMock.mockResolvedValue(null);

    await expect(callJoinPage(session.id)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
