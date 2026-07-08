/**
 * ER-4 — derive tutor-visible erasure state from Student + LearnerProfile rows.
 *
 * Pending grace keys off LP/AH tombstonedAt (immediate on request), not post-purge
 * Student.erasedAt.
 */

export type StudentErasureDisplayState =
  | { kind: "none" }
  | { kind: "pending_grace"; purgeEligibleAt: string | null }
  | { kind: "purged" };

export const PURGED_LEARNER_PLACEHOLDER = "[Deleted learner]";

export function deriveStudentErasureDisplayState(input: {
  erasedAt: Date | string | null;
  lpTombstonedAt: Date | string | null;
  ahTombstonedAt?: Date | string | null;
  activeJobPurgeEligibleAt?: Date | string | null;
}): StudentErasureDisplayState {
  if (input.erasedAt) {
    return { kind: "purged" };
  }

  if (input.lpTombstonedAt || input.ahTombstonedAt) {
    const purgeAt = input.activeJobPurgeEligibleAt;
    const purgeEligibleAt =
      purgeAt == null
        ? null
        : typeof purgeAt === "string"
          ? purgeAt
          : purgeAt.toISOString();
    return { kind: "pending_grace", purgeEligibleAt };
  }

  return { kind: "none" };
}

export function isStudentAccessSuspended(state: StudentErasureDisplayState): boolean {
  return state.kind === "pending_grace" || state.kind === "purged";
}
