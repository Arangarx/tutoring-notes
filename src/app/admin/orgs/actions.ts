"use server";

import { redirect } from "next/navigation";

import { safeRelativeReturnPath } from "@/lib/safe-return-path";
import {
  OrgMutationError,
  createOrganization,
  readOrgLiveSessionEndChoice,
  resolveVerifiedOrgOwner,
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

function operatorOrgPath(organizationId: string, code?: string): string {
  const path = organizationId ? `/admin/orgs/${organizationId}` : "/admin/orgs";
  return code ? `${path}?error=${encodeURIComponent(code)}` : path;
}

export async function createOrganizationByOwnerEmailAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("ownerEmail") ?? "");
  const resolved = await resolveVerifiedOrgOwner(email);
  if (!resolved.ok) redirect(operatorOrgPath("", resolved.error));

  let organizationId = "";
  try {
    const created = await createOrganization({
      name,
      ownerAdminUserId: resolved.adminUserId,
    });
    organizationId = created.organizationId;
  } catch (err) {
    if (err instanceof OrgMutationError) redirect(operatorOrgPath("", err.code));
    throw err;
  }
  redirect(operatorOrgPath(organizationId));
}

export async function suspendOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const choice = readOrgLiveSessionEndChoice(formData.get("choice"));
  await setOrganizationStatus(organizationId, "suspended", choice);
  const returnTo = safeRelativeReturnPath(String(formData.get("returnTo") ?? ""));
  redirect(returnTo ?? operatorOrgPath(organizationId));
}

export async function activateOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  await setOrganizationStatus(organizationId, "active");
  const returnTo = safeRelativeReturnPath(String(formData.get("returnTo") ?? ""));
  redirect(returnTo ?? operatorOrgPath(organizationId));
}

export async function saveOrganizationCapsAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const unlimited = formData.get("unlimited") === "1";
  const rawCap = String(formData.get("dailyInviteCap") ?? "").trim();
  const rawMax = String(formData.get("maxMembers") ?? "").trim();
  const maxMembers = rawMax === "" ? null : Number(rawMax);
  const returnTo = safeRelativeReturnPath(String(formData.get("returnTo") ?? ""));
  const back = returnTo ?? operatorOrgPath(organizationId);

  if (!unlimited && !/^[1-9]\d*$/.test(rawCap)) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid_cap`);
  }
  const dailyInviteCap = unlimited ? null : Number(rawCap);
  try {
    await setOrganizationCaps(organizationId, { maxMembers, dailyInviteCap });
  } catch (err) {
    if (err instanceof OrgMutationError) {
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(err.code)}`);
    }
    throw err;
  }
  redirect(back);
}
