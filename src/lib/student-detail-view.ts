/**
 * What the tutor sees on the student page. Pure: existing fields in, view out.
 * Invite kind is the latest invite's stored inviteTargetKind. A null kind stays
 * the parent sentence. This does not read LearnerProfile.isSelfLearner and does
 * not guess from a name that equals an email.
 */

export type StudentDetailInviteKind = "self_learner" | "child_learner" | null;

export type StudentDetailMainButton = "resume" | "open_room" | "start_session";

export type StudentDetailCriticalCard =
  | { kind: "deletion"; text: string; purgeEligibleAt: string | null }
  | { kind: "setup"; text: string }
  | { kind: "privacy"; text: string };

export type StudentDetailView = {
  mainButton: StudentDetailMainButton | null;
  criticalCard: StudentDetailCriticalCard | null;
};

export type StudentDetailViewInput = {
  studentName: string;
  learnerProfileId: string | null;
  hasInvite: boolean;
  latestInviteTargetKind: StudentDetailInviteKind;
  consentRecordExists: boolean;
  pendingErasure: boolean;
  purgeEligibleAt: string | null;
  hasOpenWhiteboardSession: boolean;
  hasUpcomingAppointment: boolean;
};

function withName(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

function criticalCard(input: StudentDetailViewInput): StudentDetailCriticalCard | null {
  if (input.pendingErasure) {
    return {
      kind: "deletion",
      text: "This student's account is being deleted. Sessions are off.",
      purgeEligibleAt: input.purgeEligibleAt,
    };
  }

  if (!input.learnerProfileId && !input.hasInvite) {
    return {
      kind: "setup",
      text: withName(
        "{name} needs an account before you can start a session. Open Account & sharing to send an invite to {name}, or to their parent if {name} is a minor.",
        input.studentName
      ),
    };
  }

  if (!input.learnerProfileId && input.latestInviteTargetKind === "self_learner") {
    return {
      kind: "setup",
      text: withName(
        "{name} needs to set up their account before you can start a session. Open Account & sharing and send the invite. Once they accept and finish privacy preferences, Start session turns on.",
        input.studentName
      ),
    };
  }

  if (!input.learnerProfileId) {
    return {
      kind: "setup",
      text: `Parent must claim this student before sessions can start. Open Account & sharing, create a claim link, and share it with ${input.studentName}'s parent. After they claim the account and set privacy preferences, you can start whiteboard sessions.`,
    };
  }

  if (!input.consentRecordExists) {
    return {
      kind: "privacy",
      text: "A parent account is connected, but privacy preferences are not complete. You cannot start a session until the parent finishes them. Ask the parent to sign in to their Mynk account and complete privacy preferences for this learner. They can find this under their child's profile in Account.",
    };
  }

  return null;
}

export function studentDetailView(input: StudentDetailViewInput): StudentDetailView {
  const card = criticalCard(input);
  let mainButton: StudentDetailMainButton | null;
  if (input.hasOpenWhiteboardSession) {
    mainButton = "resume";
  } else if (input.hasUpcomingAppointment) {
    mainButton = "open_room";
  } else if (card) {
    mainButton = null;
  } else {
    mainButton = "start_session";
  }
  return { mainButton, criticalCard: card };
}
