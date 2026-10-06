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
