"use server";

import { redirect } from "next/navigation";
import type { OrgRole } from "@prisma/client";

import { db } from "@/lib/db";
import { sendOrgInviteEmail } from "@/lib/org-invite-mail";
import {
  OrgMutationError,
  createOrgInvite,
  removeOrgMember,
  revokeOrgInvite,
  setOrgMemberRoles,
} from "@/lib/org-scope";

const ROLE_VALUES = new Set<OrgRole>(["owner", "admin", "scheduler", "instructor"]);

function readRoles(formData: FormData): OrgRole[] {
  return formData
    .getAll("roles")
    .map(String)
    .filter((role): role is OrgRole => ROLE_VALUES.has(role as OrgRole));
}

function staffHome(organizationId: string, code?: string): never {
  const path = `/admin/organization/${organizationId}`;
  redirect(code ? `${path}?error=${encodeURIComponent(code)}` : path);
}

export async function inviteStaffAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "");
  const roles = readRoles(formData);
  try {
    const created = await createOrgInvite(organizationId, email, roles);
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const mailed = await sendOrgInviteEmail({
      to: email,
      organizationName: org?.name ?? "this organization",
      roles,
      rawToken: created.rawToken,
    });
    if (!mailed.sent) {
      try {
        await revokeOrgInvite(organizationId, created.inviteId);
      } catch {
        // The screen still reports that the email was not sent.
      }
      staffHome(organizationId, "mail_failed");
    }
  } catch (err) {
    if (err instanceof OrgMutationError) staffHome(organizationId, err.code);
    throw err;
  }
  staffHome(organizationId);
}

export async function revokeStaffInviteAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  await revokeOrgInvite(organizationId, inviteId);
  staffHome(organizationId);
}

export async function setStaffRolesAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const adminUserId = String(formData.get("adminUserId") ?? "");
  const roles = readRoles(formData);
  try {
    await setOrgMemberRoles(organizationId, adminUserId, roles);
  } catch (err) {
    if (err instanceof OrgMutationError) staffHome(organizationId, err.code);
    throw err;
  }
  staffHome(organizationId);
}

export async function removeStaffMemberAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const adminUserId = String(formData.get("adminUserId") ?? "");
  try {
    const choice = formData.get("choice") === "now" ? "now" : "finish";
    await removeOrgMember(organizationId, adminUserId, choice);
  } catch (err) {
    if (err instanceof OrgMutationError) staffHome(organizationId, err.code);
    throw err;
  }
  staffHome(organizationId);
}

export async function createOrgLearnerAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const inviteFor = String(formData.get("inviteFor") ?? "");
  try {
    const { createOrgLearner } = await import("@/lib/org-learner");
    if (inviteFor !== "student" && inviteFor !== "parent") {
      staffHome(organizationId, "invalid_name");
    }
    await createOrgLearner({
      organizationId,
      givenName: String(formData.get("givenName") ?? ""),
      familyName: String(formData.get("familyName") ?? ""),
      brief: String(formData.get("brief") ?? ""),
      email: String(formData.get("email") ?? ""),
      inviteFor,
    });
  } catch (err) {
    const { OrgLearnerError } = await import("@/lib/org-learner");
    if (err instanceof OrgMutationError || err instanceof OrgLearnerError) {
      staffHome(organizationId, err.code);
    }
    throw err;
  }
  staffHome(organizationId);
}

export async function reinviteOrgLearnerAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  try {
    const { reinviteOrgLearner } = await import("@/lib/org-learner");
    await reinviteOrgLearner(organizationId, studentId);
  } catch (err) {
    const { OrgLearnerError } = await import("@/lib/org-learner");
    if (err instanceof OrgMutationError || err instanceof OrgLearnerError) {
      staffHome(organizationId, err.code);
    }
    throw err;
  }
  staffHome(organizationId);
}
