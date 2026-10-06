import { normalizeEmail } from "@/lib/normalize-email";

export type RosterInviteTargetKind = "self_learner" | "child_learner";

/**
 * Self-learner invites store the invitee email in both name and parentEmail until
 * the family sets a tutor-visible display name (no extra DB column).
 */
export function isSelfLearnerPendingInvite(student: {
  name: string;
  parentEmail: string | null;
  learnerProfileId: string | null;
}): boolean {
  if (student.learnerProfileId) return false;
  if (!student.parentEmail) return false;
  return normalizeEmail(student.name) === normalizeEmail(student.parentEmail);
}

type InviteTargetFields = {
  intendedEmail: string | null;
  inviteTargetKind: RosterInviteTargetKind | null;
};

type InviteStudentFields = {
  name: string;
  parentEmail: string | null;
  learnerProfileId: string | null;
};

/**
 * The only email allowed to complete this invite (normalized). Stored on the
 * invite since the claim-target migration; older invites fall back to the
 * student's parent email. Null only for legacy invites with neither.
 */
export function inviteIntendedEmail(
  invite: InviteTargetFields,
  student: InviteStudentFields
): string | null {
  const raw = invite.intendedEmail ?? student.parentEmail;
  const trimmed = raw?.trim();
  return trimmed ? normalizeEmail(trimmed) : null;
}

/** Self learner vs child invite: stored kind, else the legacy roster heuristic. */
export function inviteTargetKind(
  invite: InviteTargetFields,
  student: InviteStudentFields
): RosterInviteTargetKind {
  if (invite.inviteTargetKind) return invite.inviteTargetKind;
  return isSelfLearnerPendingInvite(student) ? "self_learner" : "child_learner";
}

/** Tutor-visible label while claim is pending. */
export function rosterPendingDisplayLabel(student: {
  name: string;
  parentEmail: string | null;
  learnerProfileId: string | null;
}): string {
  if (student.learnerProfileId) return student.name;
  if (isSelfLearnerPendingInvite(student)) {
    return student.parentEmail ?? student.name;
  }
  return student.name;
}
