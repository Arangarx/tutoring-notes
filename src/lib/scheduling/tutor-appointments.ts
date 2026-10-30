import type { Prisma } from "@prisma/client";

/** RED-COMMIT STUB: the legacy private-students-only predicate. Replaced in the implementation commit. */
export function tutorAppointmentsWhere(adminUserId: string): Prisma.ScheduledSessionWhereInput {
  return { adminUserId, student: { adminUserId } };
}

export function isOrgOwnedStudent(student: {
  adminUserId: string | null;
  organizationId: string | null;
}): student is { adminUserId: null; organizationId: string } {
  return student.organizationId != null && student.adminUserId == null;
}
