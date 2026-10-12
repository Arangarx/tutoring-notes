import "server-only";

import { db } from "@/lib/db";

export type OrgSessionAccess =
  | { ok: true; mode: "read-write" }
  | { ok: false; reason: "denied" };

/**
 * Access to a whiteboard session that was already taught for an org student.
 * Read-write when the caller is that session's tutor, removedAt is null, and
 * approvalStatus is APPROVED. A dropped instructor role still passes.
 * A scheduler, an owner who did not teach it, and another org's member do not.
 */
export async function resolveOrgSessionAccess(input: {
  callerAdminUserId: string;
  sessionAdminUserId: string;
  organizationId: string;
}): Promise<OrgSessionAccess> {
  if (input.callerAdminUserId !== input.sessionAdminUserId) {
    return { ok: false, reason: "denied" };
  }
  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_adminUserId: {
        organizationId: input.organizationId,
        adminUserId: input.callerAdminUserId,
      },
    },
    select: {
      removedAt: true,
      adminUser: { select: { approvalStatus: true } },
    },
  });
  if (!member || member.removedAt != null) return { ok: false, reason: "denied" };
  if (member.adminUser.approvalStatus !== "APPROVED") {
    return { ok: false, reason: "denied" };
  }
  return { ok: true, mode: "read-write" };
}
