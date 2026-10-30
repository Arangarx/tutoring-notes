import type { OrgRole } from "@prisma/client";

/** Owner, admin, and scheduler. Instructors are not included. */
export const STAFF_HOME_ROLES: readonly OrgRole[] = ["owner", "admin", "scheduler"];

/**
 * Staff (owner, admin, scheduler) see every organization appointment.
 * A viewer who holds none of those roles is instructor-only.
 */
export function orgAppointmentListScope(roles: readonly OrgRole[]): "staff" | "instructor" {
  return roles.some((role) => STAFF_HOME_ROLES.includes(role)) ? "staff" : "instructor";
}

/**
 * Staff ignore `?learner=`. An instructor-only viewer applies a non-empty id
 * as a row filter. An unknown or unbooked id matches nothing; callers must
 * not turn that into a different status, which would reveal whether the id exists.
 */
export function orgLearnerFilterForViewer(
  roles: readonly OrgRole[],
  learnerId: string | null | undefined
): string | undefined {
  if (orgAppointmentListScope(roles) === "staff") return undefined;
  const trimmed = typeof learnerId === "string" ? learnerId.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}
