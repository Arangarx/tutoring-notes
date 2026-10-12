import "server-only";

/**
 * Organization membership, invites, and roles.
 *
 * Log prefix: [org] org=<id> action=<action> actor=<adminUserId|operator> inv=<id:8>
 * Never log an invite token or an email. When the operator has no AdminUser
 * row, the actor field is the fixed marker "operator".
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
    | "not_a_member"
    | "learner_cap"
    | "claim_email_cap";

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

/** Starting staff-invite cap for a new organization. Omitted on create stores this. */
const STARTING_DAILY_INVITE_CAP = 25;

/** Starting new-learner cap. Omitted on create stores this. Andrew 2026-10-11. */
const STARTING_DAILY_LEARNER_CAP = 20;

/** Starting claim-email cap. Omitted on create stores this. Andrew 2026-10-11. */
const STARTING_DAILY_CLAIM_EMAIL_CAP = 30;

/** Logged when the operator has no AdminUser row. Never an email address. */
const OPERATOR_ACTOR_MARKER = "operator";

const ROLE_RANK: Record<OrgRole, number> = {
  instructor: 1,
  scheduler: 1,
  admin: 2,
  owner: 3,
};

function actorLabel(operator: OperatorIdentity): string {
  return operator.adminId ?? OPERATOR_ACTOR_MARKER;
}

export function orgLog(organizationId: string, action: string, fields: Record<string, string>): void {
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

const ALL_ORG_ROLES: OrgRole[] = ["owner", "admin", "scheduler", "instructor"];

/** Roles this member may put on an invite or another member. */
export function rolesActorMayGrant(actorRoles: OrgRole[]): OrgRole[] {
  return ALL_ORG_ROLES.filter((role) => canGrantRole(actorRoles, role));
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

type OrgAdmissionClient = Pick<Prisma.TransactionClient, "organization" | "organizationMember">;

/**
 * Booking and opening a new room. Passes only for an active organization,
 * a member with removedAt null, APPROVED, whose roles include instructor.
 */
export async function orgInstructorAdmitted(
  client: OrgAdmissionClient,
  organizationId: string,
  adminUserId: string
): Promise<boolean> {
  const org = await client.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org || org.status !== "active") return false;
  const member = await client.organizationMember.findUnique({
    where: { organizationId_adminUserId: { organizationId, adminUserId } },
    select: {
      removedAt: true,
      roles: true,
      adminUser: { select: { approvalStatus: true } },
    },
  });
  if (!member || member.removedAt != null) return false;
  if (member.adminUser.approvalStatus !== "APPROVED") return false;
  return member.roles.includes("instructor");
}

/** Row lock around the existing Organization SELECT … FOR UPDATE. */
export async function withOrgRowLock<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockOrg(tx, organizationId);
    return fn(tx);
  });
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

type OrgCapClient = Prisma.TransactionClient;

async function orgDayCounts(
  tx: OrgCapClient,
  organizationId: string,
  now: Date
): Promise<{
  timezone: string;
  dailyLearnerCap: number | null;
  dailyClaimEmailCap: number | null;
  learnersToday: number;
  claimEmailsToday: number;
}> {
  await lockOrg(tx, organizationId);
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, dailyLearnerCap: true, dailyClaimEmailCap: true },
  });
  if (!org) throw new OrgMutationError("not_a_member");
  const start = startOfZonedDay(now, org.timezone);
  const [learnersToday, claimEmailsToday] = await Promise.all([
    tx.student.count({
      where: { organizationId, createdAt: { gte: start } },
    }),
    tx.studentClaimInvite.count({
      where: { student: { organizationId }, createdAt: { gte: start } },
    }),
  ]);
  return {
    timezone: org.timezone,
    dailyLearnerCap: org.dailyLearnerCap,
    dailyClaimEmailCap: org.dailyClaimEmailCap,
    learnersToday,
    claimEmailsToday,
  };
}

/** All staff share one learner count. Null cap is unlimited. */
export async function assertCanAddOrgLearner(
  tx: OrgCapClient,
  organizationId: string,
  now = new Date()
): Promise<void> {
  const counts = await orgDayCounts(tx, organizationId, now);
  if (counts.dailyLearnerCap != null && counts.learnersToday >= counts.dailyLearnerCap) {
    throw new OrgMutationError("learner_cap");
  }
}

/** All staff share one claim-email count. Null cap is unlimited. */
export async function assertCanSendOrgClaimEmail(
  tx: OrgCapClient,
  organizationId: string,
  now = new Date()
): Promise<void> {
  const counts = await orgDayCounts(tx, organizationId, now);
  if (
    counts.dailyClaimEmailCap != null &&
    counts.claimEmailsToday >= counts.dailyClaimEmailCap
  ) {
    throw new OrgMutationError("claim_email_cap");
  }
}

function assertPositiveIntOrNull(
  value: number | null,
  code: "max_members" | "daily_invite_cap" | "learner_cap" | "claim_email_cap"
): void {
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
  dailyLearnerCap?: number | null;
  dailyClaimEmailCap?: number | null;
}): Promise<{ organizationId: string }> {
  const operator = await requireOperator();
  const name = input.name.trim();
  if (!name) throw new OrgMutationError("invalid_name");
  const timezone = input.timezone ?? "America/Denver";
  assertIanaTimeZone(timezone);
  const maxMembers = input.maxMembers ?? null;
  // Omitted stores the starting cap. Null is unlimited, and only when the
  // caller passes null on purpose. Do not treat those as the same value.
  const dailyInviteCap =
    input.dailyInviteCap === undefined ? STARTING_DAILY_INVITE_CAP : input.dailyInviteCap;
  const dailyLearnerCap =
    input.dailyLearnerCap === undefined ? STARTING_DAILY_LEARNER_CAP : input.dailyLearnerCap;
  const dailyClaimEmailCap =
    input.dailyClaimEmailCap === undefined
      ? STARTING_DAILY_CLAIM_EMAIL_CAP
      : input.dailyClaimEmailCap;
  assertPositiveIntOrNull(maxMembers, "max_members");
  assertPositiveIntOrNull(dailyInviteCap, "daily_invite_cap");
  assertPositiveIntOrNull(dailyLearnerCap, "learner_cap");
  assertPositiveIntOrNull(dailyClaimEmailCap, "claim_email_cap");

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
      dailyLearnerCap,
      dailyClaimEmailCap,
      statusChangedAt: new Date(),
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
  orgLog(org.id, "created", { actor: actorLabel(operator), status: org.status });
  return { organizationId: org.id };
}

/**
 * Operator screen: resolve an owner email to a verified teaching account.
 * Missing and unverified are the same result. This does not create the org.
 */
export async function resolveVerifiedOrgOwner(
  email: string
): Promise<
  | { ok: true; adminUserId: string }
  | { ok: false; error: "no_verified_account" | "test_account" }
> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "no_verified_account" };
  const admin = await db.adminUser.findUnique({
    where: { email: normalized },
    select: { id: true, emailVerifiedAt: true, isTestAccount: true },
  });
  if (!admin || !admin.emailVerifiedAt) return { ok: false, error: "no_verified_account" };
  if (admin.isTestAccount) return { ok: false, error: "test_account" };
  return { ok: true, adminUserId: admin.id };
}

export type OrgInviteHolderView =
  | {
      kind: "open" | "expired" | "revoked" | "already_used";
      organizationName: string;
      roles: OrgRole[];
      email: string;
    }
  | { kind: "unavailable" };

/**
 * What the person holding the invite link may see. Facts about the invite
 * row only. Does not look up whether the invited email has an account.
 */
export async function readOrgInviteForHolder(
  rawToken: string,
  now = new Date()
): Promise<OrgInviteHolderView> {
  const trimmed = rawToken.trim();
  if (!trimmed) return { kind: "unavailable" };
  const invite = await db.organizationInvite.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    select: {
      email: true,
      roles: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!invite) return { kind: "unavailable" };
  const facts = {
    organizationName: invite.organization.name,
    roles: invite.roles,
    email: invite.email,
  };
  if (invite.acceptedAt) return { kind: "already_used", ...facts };
  if (invite.revokedAt) return { kind: "revoked", ...facts };
  if (invite.expiresAt <= now) return { kind: "expired", ...facts };
  return { kind: "open", ...facts };
}

const STAFF_HOME_ROLES: OrgRole[] = ["owner", "admin", "scheduler"];

function activeStaffHomeWhere(adminUserId: string) {
  return {
    adminUserId,
    removedAt: null,
    OR: STAFF_HOME_ROLES.map((role) => ({ roles: { has: role } })),
  };
}

/** Owner, admin, or scheduler with an active membership. Instructors are not included. */
export async function hasStaffHomeMembership(adminUserId: string): Promise<boolean> {
  const count = await db.organizationMember.count({
    where: activeStaffHomeWhere(adminUserId),
  });
  return count > 0;
}

/**
 * Sign-in landing for organization staff.
 * One organization opens its members and invitations page.
 * More than one opens the organization list.
 * A private tutor, or an instructor who is not also owner, admin, or scheduler, returns null.
 */
export async function staffHomeLandingPath(adminUserId: string): Promise<string | null> {
  const rows = await db.organizationMember.findMany({
    where: activeStaffHomeWhere(adminUserId),
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return null;
  if (rows.length === 1) return `/admin/organization/${rows[0].organizationId}`;
  return "/admin/organization";
}

export async function listStaffHomeOrganizations(): Promise<
  Array<{
    id: string;
    name: string;
    status: "pending" | "active" | "suspended";
    roles: OrgRole[];
  }>
> {
  const actor = await requireStaffHomeActor();
  const rows = await db.organizationMember.findMany({
    where: activeStaffHomeWhere(actor.adminId),
    select: {
      roles: true,
      organization: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.organization.id,
    name: row.organization.name,
    status: row.organization.status,
    roles: row.roles,
  }));
}

async function requireStaffHomeActor(): Promise<{ adminId: string }> {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") notFound();
  const session = await getServerSession(authOptions);
  if (session?.user?.isImpersonating) notFound();
  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { approvalStatus: true, isTestAccount: true },
  });
  if (!admin || admin.approvalStatus !== "APPROVED" || admin.isTestAccount) notFound();
  return { adminId: scope.adminId };
}

export type OrgStaffHomeData = {
  actor: { adminId: string; email: string; roles: OrgRole[] };
  org: {
    id: string;
    name: string;
    status: "pending" | "active" | "suspended";
    dailyInviteCap: number | null;
    maxMembers: number | null;
  };
  members: Array<{
    id: string;
    roles: OrgRole[];
    adminUser: {
      id: string;
      email: string;
      displayName: string | null;
      approvalStatus: "WAITLISTED" | "APPROVED" | "REJECTED";
      createdAt: Date;
    };
  }>;
  invites: Array<{
    id: string;
    email: string;
    roles: OrgRole[];
    expiresAt: Date;
  }>;
  grantable: OrgRole[];
};

export async function loadOrgStaffHome(organizationId: string): Promise<OrgStaffHomeData> {
  const actor = await assertOrgRole(organizationId, STAFF_HOME_ROLES);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      status: true,
      dailyInviteCap: true,
      maxMembers: true,
    },
  });
  if (!org) notFound();
  const now = new Date();
  const [members, invites] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId, removedAt: null },
      select: {
        id: true,
        roles: true,
        adminUser: {
          select: {
            id: true,
            email: true,
            displayName: true,
            approvalStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.organizationInvite.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true, email: true, roles: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    actor,
    org,
    members,
    invites,
    grantable: rolesActorMayGrant(actor.roles),
  };
}

export async function setOrganizationStatus(
  organizationId: string,
  status: "pending" | "active" | "suspended"
): Promise<void> {
  const operator = await requireOperator();
  await db.organization.update({
    where: { id: organizationId },
    data: { status, statusChangedAt: new Date() },
  });
  orgLog(organizationId, "status_set", { actor: actorLabel(operator), status });
}

export async function setOrganizationCaps(
  organizationId: string,
  caps: {
    maxMembers: number | null;
    dailyInviteCap: number | null;
    dailyLearnerCap?: number | null;
    dailyClaimEmailCap?: number | null;
  }
): Promise<void> {
  const operator = await requireOperator();
  assertPositiveIntOrNull(caps.maxMembers, "max_members");
  assertPositiveIntOrNull(caps.dailyInviteCap, "daily_invite_cap");
  if ("dailyLearnerCap" in caps) {
    assertPositiveIntOrNull(caps.dailyLearnerCap ?? null, "learner_cap");
  }
  if ("dailyClaimEmailCap" in caps) {
    assertPositiveIntOrNull(caps.dailyClaimEmailCap ?? null, "claim_email_cap");
  }
  await db.organization.update({
    where: { id: organizationId },
    data: {
      maxMembers: caps.maxMembers,
      dailyInviteCap: caps.dailyInviteCap,
      ...("dailyLearnerCap" in caps ? { dailyLearnerCap: caps.dailyLearnerCap ?? null } : {}),
      ...("dailyClaimEmailCap" in caps
        ? { dailyClaimEmailCap: caps.dailyClaimEmailCap ?? null }
        : {}),
    },
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
