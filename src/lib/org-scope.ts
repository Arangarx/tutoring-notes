import "server-only";

/**
 * Organization membership, invites, and roles.
 *
 * Log prefix: [org] org=<id> action=<action> actor=<adminUserId|email> inv=<id:8>
 * Never log an invite token.
 *
 * Org roles do not grant AdminRole.ADMIN. assertOwnsStudent does not consult this module.
 */

import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import type { OrgRole, Prisma } from "@prisma/client";
import { authOptions } from "@/auth-options";
import { CLAIM_INVITE_TTL_MS, generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize-email";
import { requireOperator, type OperatorIdentity } from "@/lib/operator";
import { requireStudentScope } from "@/lib/student-scope";
import { approveTutor, revokeTutorApproval } from "@/lib/tutor-approval-scope";

export class OrgMutationError extends Error {
  readonly code:
    | "empty_roles"
    | "role_forbidden"
    | "self_escalation"
    | "last_owner"
    | "max_members"
    | "daily_invite_cap"
    | "already_member"
    | "test_account"
    | "invalid_timezone"
    | "invalid_name"
    | "not_a_member";

  constructor(code: OrgMutationError["code"]) {
    super(code);
    this.name = "OrgMutationError";
    this.code = code;
  }
}

export type AcceptOrgInviteResult =
  | { ok: true; refreshSession: boolean }
  | { ok: false; error: "invite_unavailable" };

const UNAVAILABLE: AcceptOrgInviteResult = { ok: false, error: "invite_unavailable" };

const ROLE_RANK: Record<OrgRole, number> = {
  instructor: 1,
  scheduler: 1,
  admin: 2,
  owner: 3,
};

function actorLabel(operator: OperatorIdentity): string {
  return operator.adminId ?? operator.email;
}

function orgLog(organizationId: string, action: string, fields: Record<string, string>): void {
  const extra = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[org] org=${organizationId} action=${action}${extra ? ` ${extra}` : ""}`);
}

function assertIanaTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new OrgMutationError("invalid_timezone");
  }
}

/** Midnight at the start of `now`'s calendar day in `timeZone`, as a UTC instant. */
export function startOfZonedDay(now: Date, timeZone: string): Date {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(year, month - 1, day, hour, Number(parts.minute), Number(parts.second));
  const offsetMs = asUtc - now.getTime();
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
}

function maxRank(roles: OrgRole[]): number {
  return roles.reduce((max, role) => Math.max(max, ROLE_RANK[role]), 0);
}

function canGrantRole(actorRoles: OrgRole[], role: OrgRole): boolean {
  if (actorRoles.includes("owner")) return true;
  if (actorRoles.includes("admin")) return role === "scheduler" || role === "instructor";
  return false;
}

function assertNextRoles(
  actorRoles: OrgRole[],
  actorId: string,
  targetId: string,
  currentTargetRoles: OrgRole[],
  nextRoles: OrgRole[]
): OrgRole[] {
  if (nextRoles.length === 0) throw new OrgMutationError("empty_roles");
  const unique = [...new Set(nextRoles)];
  if (actorId === targetId && maxRank(unique) > maxRank(currentTargetRoles)) {
    throw new OrgMutationError("self_escalation");
  }
  if (!actorRoles.includes("owner")) {
    if (currentTargetRoles.includes("owner") || currentTargetRoles.includes("admin")) {
      throw new OrgMutationError("role_forbidden");
    }
  }
  for (const role of unique) {
    if (!canGrantRole(actorRoles, role)) throw new OrgMutationError("role_forbidden");
  }
  return unique;
}

async function lockOrg(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
}

async function lockMembers(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "OrganizationMember" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
}

async function assertWithinCaps(
  tx: Prisma.TransactionClient,
  org: { id: string; maxMembers: number | null; dailyInviteCap: number | null; timezone: string },
  now: Date
): Promise<void> {
  if (org.maxMembers != null) {
    const active = await tx.organizationMember.count({
      where: { organizationId: org.id, removedAt: null },
    });
    const pending = await tx.organizationInvite.count({
      where: {
        organizationId: org.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (active + pending >= org.maxMembers) throw new OrgMutationError("max_members");
  }
  if (org.dailyInviteCap != null) {
    const start = startOfZonedDay(now, org.timezone);
    const today = await tx.organizationInvite.count({
      where: { organizationId: org.id, createdAt: { gte: start } },
    });
    if (today >= org.dailyInviteCap) throw new OrgMutationError("daily_invite_cap");
  }
}

function assertPositiveIntOrNull(value: number | null, code: "max_members" | "daily_invite_cap"): void {
  if (value == null) return;
  if (!Number.isInteger(value) || value < 1) throw new OrgMutationError(code);
}

export async function getActiveOrgRoles(
  adminUserId: string,
  organizationId: string
): Promise<OrgRole[]> {
  const row = await db.organizationMember.findUnique({
    where: { organizationId_adminUserId: { organizationId, adminUserId } },
    select: { roles: true, removedAt: true },
  });
  if (!row || row.removedAt) return [];
  return row.roles;
}

/**
 * Caller must hold one of `allowed` on this org. Anyone else — including a
 * member of a different org — is not found. Env-only and impersonating
 * sessions are not found. Approval is read from the database.
 */
export async function assertOrgRole(
  organizationId: string,
  allowed: OrgRole[]
): Promise<{ adminId: string; email: string; roles: OrgRole[] }> {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") notFound();

  const session = await getServerSession(authOptions);
  if (session?.user?.isImpersonating) notFound();

  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { approvalStatus: true, isTestAccount: true },
  });
  if (!admin || admin.approvalStatus !== "APPROVED" || admin.isTestAccount) notFound();

  const roles = await getActiveOrgRoles(scope.adminId, organizationId);
  if (!roles.some((role) => allowed.includes(role))) notFound();
  return { adminId: scope.adminId, email: scope.email, roles };
}

export async function createOrganization(input: {
  name: string;
  ownerAdminUserId: string;
  timezone?: string;
  maxMembers?: number | null;
  dailyInviteCap?: number | null;
}): Promise<{ organizationId: string }> {
  const operator = await requireOperator();
  const name = input.name.trim();
  if (!name) throw new OrgMutationError("invalid_name");
  const timezone = input.timezone ?? "America/Denver";
  assertIanaTimeZone(timezone);
  const maxMembers = input.maxMembers ?? null;
  const dailyInviteCap = input.dailyInviteCap ?? null;
  assertPositiveIntOrNull(maxMembers, "max_members");
  assertPositiveIntOrNull(dailyInviteCap, "daily_invite_cap");

  const owner = await db.adminUser.findUnique({
    where: { id: input.ownerAdminUserId },
    select: { id: true, isTestAccount: true },
  });
  if (!owner) throw new OrgMutationError("not_a_member");
  if (owner.isTestAccount) throw new OrgMutationError("test_account");

  const createdByOperatorId = operator.adminId ?? operator.email;
  const org = await db.organization.create({
    data: {
      name,
      timezone,
      maxMembers,
      dailyInviteCap,
      createdByOperatorId,
      members: {
        create: {
          adminUserId: owner.id,
          roles: ["owner"],
          approvedViaOrg: false,
        },
      },
    },
    select: { id: true, status: true },
  });
  orgLog(org.id, "created", { actor: createdByOperatorId, status: org.status });
  return { organizationId: org.id };
}

export async function setOrganizationStatus(
  organizationId: string,
  status: "pending" | "active" | "suspended"
): Promise<void> {
  const operator = await requireOperator();
  await db.organization.update({
    where: { id: organizationId },
    data: { status },
  });
  orgLog(organizationId, "status_set", { actor: actorLabel(operator), status });
}

export async function setOrganizationCaps(
  organizationId: string,
  caps: { maxMembers: number | null; dailyInviteCap: number | null }
): Promise<void> {
  const operator = await requireOperator();
  assertPositiveIntOrNull(caps.maxMembers, "max_members");
  assertPositiveIntOrNull(caps.dailyInviteCap, "daily_invite_cap");
  await db.organization.update({
    where: { id: organizationId },
    data: { maxMembers: caps.maxMembers, dailyInviteCap: caps.dailyInviteCap },
  });
  orgLog(organizationId, "caps_set", { actor: actorLabel(operator) });
}

/**
 * Operator action: tutors this org approved (approvedViaOrg) go back to WAITLISTED.
 * Clears approvedViaOrg in the same revoke so a later operator approval is not
 * treated as org-granted. Does not run when an org is suspended. Does not touch
 * tutors who were not approved via this org. Does not re-approve anyone.
 */
export async function revokeOrgGrantedApprovals(
  organizationId: string
): Promise<{ revoked: number }> {
  const operator = await requireOperator();
  const members = await db.organizationMember.findMany({
    where: { organizationId, approvedViaOrg: true, removedAt: null },
    select: { adminUserId: true },
  });
  let revoked = 0;
  const operatorId = actorLabel(operator);
  for (const member of members) {
    const didRevoke = await db.$transaction(async (tx) => {
      const result = await revokeTutorApproval(member.adminUserId, operatorId, {
        client: tx,
        onlyIfApproved: true,
      });
      if (!result.revoked) return false;
      await tx.organizationMember.updateMany({
        where: {
          organizationId,
          adminUserId: member.adminUserId,
          approvedViaOrg: true,
        },
        data: { approvedViaOrg: false },
      });
      return true;
    });
    if (didRevoke) revoked += 1;
  }
  orgLog(organizationId, "revoke_org_approvals", {
    actor: operatorId,
    count: String(revoked),
  });
  return { revoked };
}

export async function createOrgInvite(
  organizationId: string,
  email: string,
  roles: OrgRole[],
  now = new Date()
): Promise<{ inviteId: string; rawToken: string; expiresAt: Date }> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  if (roles.length === 0) throw new OrgMutationError("empty_roles");
  const uniqueRoles = [...new Set(roles)];
  for (const role of uniqueRoles) {
    if (!canGrantRole(actor.roles, role)) throw new OrgMutationError("role_forbidden");
  }
  const normalized = normalizeEmail(email);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + CLAIM_INVITE_TTL_MS);

  const invite = await db.$transaction(async (tx) => {
    await lockOrg(tx, organizationId);
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, maxMembers: true, dailyInviteCap: true, timezone: true },
    });
    if (!org) throw new OrgMutationError("not_a_member");
    await assertWithinCaps(tx, org, now);

    const existingUser = await tx.adminUser.findUnique({
      where: { email: normalized },
      select: { id: true, isTestAccount: true },
    });
    if (existingUser?.isTestAccount) throw new OrgMutationError("test_account");
    if (existingUser) {
      const member = await tx.organizationMember.findUnique({
        where: {
          organizationId_adminUserId: { organizationId, adminUserId: existingUser.id },
        },
        select: { removedAt: true },
      });
      if (member && !member.removedAt) throw new OrgMutationError("already_member");
    }

    return tx.organizationInvite.create({
      data: {
        organizationId,
        email: normalized,
        roles: uniqueRoles,
        tokenHash,
        expiresAt,
        createdAt: now,
        invitedByAdminUserId: actor.adminId,
      },
      select: { id: true },
    });
  });

  orgLog(organizationId, "invite_created", {
    actor: actor.adminId,
    inv: invite.id.slice(0, 8),
  });
  return { inviteId: invite.id, rawToken, expiresAt };
}

export async function revokeOrgInvite(organizationId: string, inviteId: string): Promise<void> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  const result = await db.organizationInvite.updateMany({
    where: { id: inviteId, organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) notFound();
  orgLog(organizationId, "invite_revoked", { actor: actor.adminId, inv: inviteId.slice(0, 8) });
}

export async function acceptOrgInvite(
  rawToken: string,
  now = new Date()
): Promise<AcceptOrgInviteResult> {
  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email?.trim().toLowerCase();
  if (!sessionEmail) return UNAVAILABLE;

  const tokenHash = hashToken(rawToken);
  const invite = await db.organizationInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
    return UNAVAILABLE;
  }
  if (normalizeEmail(invite.email) !== sessionEmail) return UNAVAILABLE;

  const admin = await db.adminUser.findUnique({
    where: { email: sessionEmail },
    select: { id: true, emailVerifiedAt: true, isTestAccount: true },
  });
  if (!admin || !admin.emailVerifiedAt || admin.isTestAccount) return UNAVAILABLE;

  const outcome = await db.$transaction(async (tx) => {
    await lockOrg(tx, invite.organizationId);

    const inviter = await tx.organizationMember.findUnique({
      where: {
        organizationId_adminUserId: {
          organizationId: invite.organizationId,
          adminUserId: invite.invitedByAdminUserId,
        },
      },
      select: { roles: true, removedAt: true },
    });
    const inviterCanGrant =
      !!inviter &&
      inviter.removedAt == null &&
      invite.roles.every((role) => canGrantRole(inviter.roles, role));
    if (!inviterCanGrant) return null;

    const consumed = await tx.organizationInvite.updateMany({
      where: {
        id: invite.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (consumed.count !== 1) return null;

    const org = await tx.organization.findUnique({
      where: { id: invite.organizationId },
      select: { status: true },
    });
    if (!org) return null;

    const existing = await tx.organizationMember.findUnique({
      where: {
        organizationId_adminUserId: {
          organizationId: invite.organizationId,
          adminUserId: admin.id,
        },
      },
    });
    let reactivated = false;
    if (existing && existing.removedAt == null) {
      // Already active: consume the token and leave roles unchanged.
    } else if (existing) {
      reactivated = true;
      const stripsOwner =
        existing.roles.includes("owner") && !invite.roles.includes("owner");
      let keepCurrentRoles = false;
      if (stripsOwner) {
        const otherOwners = await tx.organizationMember.count({
          where: {
            organizationId: invite.organizationId,
            removedAt: null,
            roles: { has: "owner" },
            NOT: { id: existing.id },
          },
        });
        // Applying the invite would leave the org with no owner. Come back
        // with the roles already on the row (still owner) instead.
        if (otherOwners < 1) keepCurrentRoles = true;
      }
      await tx.organizationMember.update({
        where: { id: existing.id },
        data: keepCurrentRoles
          ? { removedAt: null }
          : { removedAt: null, roles: invite.roles },
      });
    } else {
      await tx.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          adminUserId: admin.id,
          roles: invite.roles,
          approvedViaOrg: false,
        },
      });
    }

    let waitlistSkip = false;
    if (org.status === "active") {
      const approved = await approveTutor(admin.id, invite.invitedByAdminUserId, {
        viaOrg: { organizationId: invite.organizationId, inviteId: invite.id },
        client: tx,
      });
      waitlistSkip = approved.approved;
      if (waitlistSkip) {
        await tx.organizationMember.update({
          where: {
            organizationId_adminUserId: {
              organizationId: invite.organizationId,
              adminUserId: admin.id,
            },
          },
          data: { approvedViaOrg: true },
        });
      }
    }

    return {
      organizationId: invite.organizationId,
      inviteId: invite.id,
      actorId: admin.id,
      reactivated,
      waitlistSkip,
      operatorId: invite.invitedByAdminUserId,
    };
  });

  if (!outcome) return UNAVAILABLE;

  orgLog(outcome.organizationId, outcome.reactivated ? "member_reactivated" : "member_added", {
    actor: outcome.actorId,
    inv: outcome.inviteId.slice(0, 8),
    waitlist_skip: outcome.waitlistSkip ? "yes" : "no",
  });

  if (outcome.waitlistSkip) {
    const { logProductEvent } = await import("@/lib/observability/product-events");
    await logProductEvent({
      kind: "TUTOR_APPROVED",
      adminUserId: outcome.actorId,
      metadata: { operatorId: outcome.operatorId },
    });
  }

  return { ok: true, refreshSession: outcome.waitlistSkip };
}

export async function setOrgMemberRoles(
  organizationId: string,
  targetAdminUserId: string,
  roles: OrgRole[]
): Promise<void> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  if (roles.length === 0) throw new OrgMutationError("empty_roles");

  await db.$transaction(async (tx) => {
    await lockMembers(tx, organizationId);
    const target = await tx.organizationMember.findUnique({
      where: {
        organizationId_adminUserId: { organizationId, adminUserId: targetAdminUserId },
      },
    });
    if (!target || target.removedAt) throw new OrgMutationError("not_a_member");
    const next = assertNextRoles(
      actor.roles,
      actor.adminId,
      targetAdminUserId,
      target.roles,
      roles
    );
    if (target.roles.includes("owner") && !next.includes("owner")) {
      const otherOwners = await tx.organizationMember.count({
        where: {
          organizationId,
          removedAt: null,
          roles: { has: "owner" },
          NOT: { adminUserId: targetAdminUserId },
        },
      });
      if (otherOwners < 1) throw new OrgMutationError("last_owner");
    }
    await tx.organizationMember.update({
      where: { id: target.id },
      data: { roles: next },
    });
  });

  orgLog(organizationId, "roles_set", {
    actor: actor.adminId,
    target: targetAdminUserId,
    roles: [...new Set(roles)].join(","),
  });
}

export async function removeOrgMember(
  organizationId: string,
  targetAdminUserId: string
): Promise<void> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  await db.$transaction(async (tx) => {
    await lockMembers(tx, organizationId);
    const target = await tx.organizationMember.findUnique({
      where: {
        organizationId_adminUserId: { organizationId, adminUserId: targetAdminUserId },
      },
    });
    if (!target || target.removedAt) throw new OrgMutationError("not_a_member");
    if (!actor.roles.includes("owner")) {
      if (target.roles.includes("owner") || target.roles.includes("admin")) {
        throw new OrgMutationError("role_forbidden");
      }
    }
    if (target.roles.includes("owner")) {
      const otherOwners = await tx.organizationMember.count({
        where: {
          organizationId,
          removedAt: null,
          roles: { has: "owner" },
          NOT: { id: target.id },
        },
      });
      if (otherOwners < 1) throw new OrgMutationError("last_owner");
    }
    await tx.organizationMember.update({
      where: { id: target.id },
      data: { removedAt: new Date() },
    });
  });
  orgLog(organizationId, "member_removed", { actor: actor.adminId, target: targetAdminUserId });
}
