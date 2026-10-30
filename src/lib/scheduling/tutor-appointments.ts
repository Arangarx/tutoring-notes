import type { Prisma } from "@prisma/client";
import { activeOrgInstructorMemberWhere } from "@/lib/org-appointment-scope";

/**
 * Appointments one tutor sees on their Schedule and in their ICS feed.
 * The row is assigned to them AND either the student is their own private
 * student, or the student is owned by an organization where they are still
 * an active instructor.
 *
 * Not checked here: the organization's status (W4 and `orgInstructorAdmitted`
 * gate entry) and time (past appointments show, as personal ones do).
 */
export function tutorAppointmentsWhere(adminUserId: string): Prisma.ScheduledSessionWhereInput {
  return {
    adminUserId,
    OR: [
      { student: { adminUserId } },
      {
        student: {
          adminUserId: null,
          organizationId: { not: null },
          organization: { members: { some: activeOrgInstructorMemberWhere(adminUserId) } },
        },
      },
    ],
  };
}

/** A student owned by an organization rather than by a tutor. */
export function isOrgOwnedStudent(student: {
  adminUserId: string | null;
  organizationId: string | null;
}): student is { adminUserId: null; organizationId: string } {
  return student.organizationId != null && student.adminUserId == null;
}
