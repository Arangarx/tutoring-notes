/**
 * @jest-environment jsdom
 *
 * H-5 / T-new-F — the /join page runs the ONE entry rule (`sessionEntryState`, consent wave C5) for EVERY
 * principal (child, parent-as-child, self-learner). /join is always an online entry, so a learner is refused when
 * the family's online switch is off, when there is no usable consent record, or when the learner is unclaimed.
 * The refusal is the "Session not available" shell with the family line from ENTRY_BLOCK_COPY.
 *
 * Started rooms are decided by the frozen snapshot (no loader read); PENDING / legacy rooms by the live record
 * (the loader, mocked here with the spec's inputs because its import chain reaches `jose`, which jest cannot load).
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

// The learner view's live read (PENDING / legacy rooms); its import chain reaches `jose` (ESM), which jest does not
// transform. Each test states the inputs the live record would give.
const mockLoadSessionEntryInputs = jest.fn();
jest.mock("@/lib/scheduling/session-entry-loader", () => ({
  __esModule: true,
  loadSessionEntryInputs: (...args: unknown[]) => mockLoadSessionEntryInputs(...args),
}));

/** The live read's answer: a claimed minor whose record allows online unless the test says otherwise. */
function liveInputs(over: Partial<{ claimed: boolean; isSelfLearner: boolean; consent: { allowLiveSession: boolean } | null }> = {}) {
  return {
    erasureSuspended: false,
    org: null,
    claimed: true,
    isSelfLearner: false,
    consent: { allowLiveSession: true },
    ...over,
  };
}

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

  if (opts.withSnapshot && opts.learnerProfileId) {
    await createConsentRecord(
      opts.learnerProfileId,
      tutor.id,
      1,
      { allowLiveSession: opts.allowLiveSession ?? true }
    );
    await db.$transaction(async (tx) => {
      await createSessionConsentSnapshot(tx, session.id);
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
// The one entry rule at /join, for every principal
// ---------------------------------------------------------------------------

/** What a refused learner reads: the family line for `reason`, in the blocked shell (no room, no A/V). */
function expectRefused(reason: string, familyLine: string, shownReason: string = reason) {
  expect(screen.getByRole("heading", { name: /session not available/i })).toBeInTheDocument();
  expect(screen.queryByTestId("whiteboard-session-shell")).not.toBeInTheDocument();
  const line = screen.getByTestId("join-entry-blocked");
  expect(line).toHaveTextContent(familyLine);
  // A family only ever sees a family-safe code: `unclaimed` collapses to `unknown` on the page (the log keeps it).
  expect(line).toHaveAttribute("data-entry-reason", shownReason);
  expect(console.info).toHaveBeenCalledWith(
    expect.stringContaining(`action=entry_denied surface=join principal=learner reason=${reason} mode=online`)
  );
}

describe("JoinSessionPage — the one entry rule at /join (consent wave C5)", () => {
  beforeEach(() => {
    getLearnerSessionFromHeadersMock.mockReset();
    getAccountHolderSessionFromHeadersMock.mockReset();
    mockLoadSessionEntryInputs.mockReset();
    mockLoadSessionEntryInputs.mockResolvedValue(liveInputs());
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("T-new-F: claimed minor, legacy room with no snapshot and no live record → refused (parent has not finished preferences)", async () => {
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const { session } = await createJoinFixture({ learnerProfileId: profile.id, withSnapshot: false });
    mockLoadSessionEntryInputs.mockResolvedValue(liveInputs({ consent: null }));

    await renderJoinPage(session.id, profile.id);

    // Family column of the copy table collapses a missing record to the generic family line.
    expectRefused("consent_missing_parent", "Finish privacy preferences for Test Student to join.");
  });

  it("claimed minor + frozen online-off snapshot → refused with the online-off family line", async () => {
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      withSnapshot: true,
      allowLiveSession: false,
    });

    await renderJoinPage(session.id, profile.id);

    expectRefused("live_off", "Live sessions are off in privacy settings.");
    // A started room is decided by its snapshot: no live read.
    expect(mockLoadSessionEntryInputs).not.toHaveBeenCalled();
  });

  it("claimed minor + all-true snapshot → allowed (positive control)", async () => {
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

  it("self-learner + frozen online-off snapshot → refused (the old gate skipped self-learners)", async () => {
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      isSelfLearner: true,
      withSnapshot: true,
      allowLiveSession: false,
    });

    await renderJoinPage(session.id, profile.id);

    expectRefused("live_off", "Live sessions are off in privacy settings.");
  });

  it("self-learner with a record that allows online → allowed", async () => {
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      isSelfLearner: true,
      withSnapshot: false,
    });
    mockLoadSessionEntryInputs.mockResolvedValue(liveInputs({ isSelfLearner: true }));

    await renderJoinPage(session.id, profile.id);

    expect(screen.queryByRole("heading", { name: /session not available/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-session-shell")).toBeInTheDocument();
  });

  it("self-learner with no record at all → refused (no learner enters without a usable record)", async () => {
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const { session } = await createJoinFixture({
      learnerProfileId: profile.id,
      isSelfLearner: true,
      withSnapshot: false,
    });
    mockLoadSessionEntryInputs.mockResolvedValue(liveInputs({ isSelfLearner: true, consent: null }));

    await renderJoinPage(session.id, profile.id);

    expectRefused("consent_missing_self", "Finish privacy preferences (Manage → Privacy) to join.");
  });

  it("unclaimed student → refused (the rule's `unclaimed`), not silently let in", async () => {
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
    mockLoadSessionEntryInputs.mockResolvedValue(liveInputs({ claimed: false, consent: null }));

    await renderJoinPage(session.id, joiningProfile.id);

    expectRefused("unclaimed", "This session isn't available right now.", "unknown");
  });
});
