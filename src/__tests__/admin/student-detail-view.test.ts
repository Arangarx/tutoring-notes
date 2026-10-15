/**
 * Stage 6 — what the tutor sees on the student page.
 * Expected sentences are written here. They are not imported from the function.
 */
import { studentDetailView } from "@/lib/student-detail-view";

const NAME = "Ada";

const BEFORE_INVITE =
  "Ada needs an account before you can start a session. Open Account & sharing to send an invite to Ada, or to their parent if Ada is a minor.";

const SELF_LEARNER =
  "Ada needs to set up their account before you can start a session. Open Account & sharing and send the invite. Once they accept and finish privacy preferences, Start session turns on.";

const PARENT =
  "Parent must claim this student before sessions can start. Open Account & sharing, create a claim link, and share it with Ada's parent. After they claim the account and set privacy preferences, you can start whiteboard sessions.";

const PRIVACY =
  "A parent account is connected, but privacy preferences are not complete. You cannot start a session until the parent finishes them. Ask the parent to sign in to their Mynk account and complete privacy preferences for this learner. They can find this under their child's profile in Account.";

const DELETION = "This student's account is being deleted. Sessions are off.";

const READY = {
  studentName: NAME,
  learnerProfileId: "lp-1",
  hasInvite: true,
  latestInviteTargetKind: "child_learner" as const,
  consentRecordExists: true,
  pendingErasure: false,
  purgeEligibleAt: null,
  hasOpenWhiteboardSession: false,
  hasUpcomingAppointment: false,
};

describe("studentDetailView", () => {
  test("Resume wins over Open room, and Open room wins over Start session", () => {
    expect(
      studentDetailView({
        ...READY,
        hasOpenWhiteboardSession: true,
        hasUpcomingAppointment: true,
      }).mainButton
    ).toBe("resume");

    expect(
      studentDetailView({
        ...READY,
        hasOpenWhiteboardSession: false,
        hasUpcomingAppointment: true,
      }).mainButton
    ).toBe("open_room");

    expect(studentDetailView(READY).mainButton).toBe("start_session");
  });

  test("Start session is absent while a critical card is up", () => {
    const blocked = [
      studentDetailView({
        ...READY,
        learnerProfileId: null,
        hasInvite: false,
        latestInviteTargetKind: null,
        consentRecordExists: false,
      }),
      studentDetailView({
        ...READY,
        learnerProfileId: "lp-1",
        consentRecordExists: false,
      }),
      studentDetailView({
        ...READY,
        pendingErasure: true,
        purgeEligibleAt: "2026-11-01T15:00:00.000Z",
      }),
    ];

    for (const view of blocked) {
      expect(view.criticalCard).not.toBeNull();
      expect(view.mainButton).not.toBe("start_session");
    }

    expect(
      studentDetailView({
        ...READY,
        learnerProfileId: "lp-1",
        consentRecordExists: false,
        hasOpenWhiteboardSession: true,
      }).mainButton
    ).toBe("resume");
  });

  test("setup sentences follow invite state, and a null kind stays the parent sentence", () => {
    expect(
      studentDetailView({
        ...READY,
        learnerProfileId: null,
        hasInvite: false,
        latestInviteTargetKind: null,
        consentRecordExists: false,
      }).criticalCard
    ).toEqual({ kind: "setup", text: BEFORE_INVITE });

    expect(
      studentDetailView({
        ...READY,
        learnerProfileId: null,
        hasInvite: true,
        latestInviteTargetKind: "self_learner",
        consentRecordExists: false,
      }).criticalCard
    ).toEqual({ kind: "setup", text: SELF_LEARNER });

    expect(
      studentDetailView({
        ...READY,
        learnerProfileId: null,
        hasInvite: true,
        latestInviteTargetKind: "child_learner",
        consentRecordExists: false,
      }).criticalCard
    ).toEqual({ kind: "setup", text: PARENT });

    expect(
      studentDetailView({
        ...READY,
        learnerProfileId: null,
        hasInvite: true,
        latestInviteTargetKind: null,
        consentRecordExists: false,
      }).criticalCard
    ).toEqual({ kind: "setup", text: PARENT });
  });

  test("a profile with no consent record shows the privacy-preferences text and hides Start", () => {
    const view = studentDetailView({
      ...READY,
      consentRecordExists: false,
    });
    expect(view.criticalCard).toEqual({ kind: "privacy", text: PRIVACY });
    expect(view.mainButton).not.toBe("start_session");
  });

  test("pending erasure wins over a missing account", () => {
    const view = studentDetailView({
      ...READY,
      learnerProfileId: null,
      hasInvite: false,
      latestInviteTargetKind: null,
      consentRecordExists: false,
      pendingErasure: true,
      purgeEligibleAt: "2026-11-01T15:00:00.000Z",
    });
    expect(view.criticalCard).toEqual({
      kind: "deletion",
      text: DELETION,
      purgeEligibleAt: "2026-11-01T15:00:00.000Z",
    });
    expect(view.mainButton).not.toBe("start_session");
  });

  test("nothing blocking means no card", () => {
    expect(studentDetailView(READY).criticalCard).toBeNull();
  });
});
