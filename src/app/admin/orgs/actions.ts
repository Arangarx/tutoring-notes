"use server";

import {
  createOrganization,
  revokeOrgGrantedApprovals,
  setOrganizationCaps,
  setOrganizationStatus,
} from "@/lib/org-scope";

export async function createOrganizationAction(input: {
  name: string;
  ownerAdminUserId: string;
  timezone?: string;
  maxMembers?: number | null;
  dailyInviteCap?: number | null;
}): Promise<{ organizationId: string }> {
  return createOrganization(input);
}

export async function setOrganizationStatusAction(
  organizationId: string,
  status: "pending" | "active" | "suspended"
): Promise<void> {
  return setOrganizationStatus(organizationId, status);
}

export async function setOrganizationCapsAction(
  organizationId: string,
  caps: { maxMembers: number | null; dailyInviteCap: number | null }
): Promise<void> {
  return setOrganizationCaps(organizationId, caps);
}

export async function revokeOrgGrantedApprovalsAction(
  organizationId: string
): Promise<{ revoked: number }> {
  return revokeOrgGrantedApprovals(organizationId);
}
