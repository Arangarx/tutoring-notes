/**
 * @jest-environment node
 *
 * Org slice 1 — operator create, membership, invites, roles.
 * Oracles are database rows and uniform denial results, not the implementation's
 * private constants. Requires ADMIN_EMAIL=org-operator@example.com and
 * OPERATOR_EMAILS including env-operator@example.com, and TEST_DATABASE_URL
 * pointed at tutoring_notes_org_test (never tutoring_notes_test).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { OrgMutationError, acceptOrgInvite, assertOrgRole, createOrgInvite, getActiveOrgRoles, removeOrgMember, revokeOrgInvite, setOrgMemberRoles } from "@/lib/org-scope";
import {
  createOrganizationAction,
  revokeOrgGrantedApprovalsAction,
  setOrganizationCapsAction,
  setOrganizationStatusAction,
} from "@/app/admin/orgs/actions";
import { assertAdminOrNotFound } from "@/lib/impersonation";
import { startImpersonation } from "@/app/admin/actions/impersonate";
import { ImpersonationForbiddenError } from "@/lib/impersonation";
import {
  isApprovalExemptAdminPath,
  isEmailVerifyExemptAdminPath,
  is2faExemptAdminPath,
} from "@/lib/admin-routing";
import { uniq } from "../helpers/unique-test-token";
import type { OrgRole, TutorApprovalStatus } from "@prisma/client";

const OPERATOR_EMAIL = "org-operator@example.com";
const ENV_OPERATOR_EMAIL = "env-operator@example.com";

function mockSession(
  user: { email: string; id?: string; isImpersonating?: boolean } | null
) {
  mockGetServerSession.mockResolvedValue(
    user
      ? {
          user: {
            id: user.id ?? "session-user",
            email: user.email,
            isImpersonating: user.isImpersonating ?? false,
          },
        }
      : null
  );
}

async function seedUser(opts?: {
  email?: string;
  approvalStatus?: TutorApprovalStatus;
  emailVerifiedAt?: Date | null;
  isTestAccount?: boolean;
  role?: "TUTOR" | "ADMIN";
}) {
  return db.adminUser.create({
    data: {
      email: opts?.email ?? `${uniq("user")}@example.com`,
      role: opts?.role ?? "TUTOR",
      approvalStatus: opts?.approvalStatus ?? "APPROVED",
      emailVerifiedAt: opts?.emailVerifiedAt === undefined ? new Date() : opts.emailVerifiedAt,
      isTestAccount: opts?.isTestAccount ?? false,
    },
  });
}

async function seedOperator() {
  const existing = await db.adminUser.findUnique({ where: { email: OPERATOR_EMAIL } });
  if (existing) return existing;
  return seedUser({
    email: OPERATOR_EMAIL,
    approvalStatus: "APPROVED",
    role: "TUTOR",
  });
}

async function asOperator() {
  const operator = await seedOperator();
  mockSession({ email: operator.email, id: operator.id });
  return operator;
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("org slice 1", () => {
  it("stores instructor, not tutor, as an org role", async () => {
    const labels = await db.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'OrgRole'
      ORDER BY e.enumsortorder
    `;
    const names = labels.map((row) => row.enumlabel);
    expect(names).toEqual(["owner", "admin", "scheduler", "instructor"]);
  });

  it("refuses a non-operator create and writes no organization", async () => {
    const owner = await seedUser();
    const name = uniq("no-org");
    mockSession({ email: owner.email, id: owner.id });
    await expect(
      createOrganizationAction({ name, ownerAdminUserId: owner.id })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await db.organization.count({ where: { name } })).toBe(0);
    const fresh = await db.adminUser.findUnique({ where: { id: owner.id } });
    expect(fresh?.role).toBe("TUTOR");
  });

  it("stores the operator admin id, defaults status to pending, and does not grant ADMIN", async () => {
    const operator = await asOperator();
    const owner = await seedUser();
    const name = uniq("org");
    const { organizationId } = await createOrganizationAction({
      name,
      ownerAdminUserId: owner.id,
      timezone: "UTC",
    });
    const org = await db.organization.findUnique({ where: { id: organizationId } });
    expect(org?.status).toBe("pending");
    expect(org?.createdByOperatorId).toBe(operator.id);
    expect(org?.maxMembers).toBeNull();
    expect(org?.dailyInviteCap).toBeNull();
    const member = await db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId: owner.id } },
    });
    expect(member?.roles).toEqual(["owner"]);
    expect(member?.approvedViaOrg).toBe(false);
    const ownerRow = await db.adminUser.findUnique({ where: { id: owner.id } });
    expect(ownerRow?.role).toBe("TUTOR");
  });

  it("stores the operator email when that email has no admin row", async () => {
    const owner = await seedUser();
    mockSession({ email: ENV_OPERATOR_EMAIL, id: "admin" });
    const name = uniq("env-org");
    const { organizationId } = await createOrganizationAction({
      name,
      ownerAdminUserId: owner.id,
    });
    const org = await db.organization.findUnique({ where: { id: organizationId } });
    expect(org?.createdByOperatorId).toBe(ENV_OPERATOR_EMAIL);
    expect(await db.adminUser.findUnique({ where: { email: ENV_OPERATOR_EMAIL } })).toBeNull();
  });

  it("lets only an operator write status", async () => {
    const owner = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("status"),
      ownerAdminUserId: owner.id,
    });
    mockSession({ email: owner.email, id: owner.id });
    await expect(setOrganizationStatusAction(organizationId, "active")).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect((await db.organization.findUnique({ where: { id: organizationId } }))?.status).toBe(
      "pending"
    );

    await asOperator();
    await setOrganizationStatusAction(organizationId, "active");
    expect((await db.organization.findUnique({ where: { id: organizationId } }))?.status).toBe(
      "active"
    );
  });

  it("gives an org owner 404 on an operator route and blocks impersonation", async () => {
    const owner = await seedUser({ role: "TUTOR" });
    await asOperator();
    await createOrganizationAction({ name: uniq("owner-404"), ownerAdminUserId: owner.id });
    mockSession({ email: owner.email, id: owner.id });
    await expect(assertAdminOrNotFound()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(startImpersonation("00000000-0000-4000-8000-000000000099")).rejects.toBeInstanceOf(
      ImpersonationForbiddenError
    );
    expect((await db.adminUser.findUnique({ where: { id: owner.id } }))?.role).toBe("TUTOR");
  });

  it("treats a cross-org id as not found", async () => {
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    await asOperator();
    const { organizationId: orgA } = await createOrganizationAction({
      name: uniq("a"),
      ownerAdminUserId: ownerA.id,
    });
    const { organizationId: orgB } = await createOrganizationAction({
      name: uniq("b"),
      ownerAdminUserId: ownerB.id,
    });
    mockSession({ email: ownerA.email, id: ownerA.id });
    await expect(assertOrgRole(orgB, ["owner"])).rejects.toThrow("NEXT_NOT_FOUND");
    mockSession({ email: ownerB.email, id: ownerB.id });
    const invite = await createOrgInvite(orgB, `${uniq("cross")}@example.com`, ["instructor"]);
    mockSession({ email: ownerA.email, id: ownerA.id });
    await expect(revokeOrgInvite(orgA, invite.inviteId)).rejects.toThrow("NEXT_NOT_FOUND");
    const row = await db.organizationInvite.findUnique({ where: { id: invite.inviteId } });
    expect(row?.revokedAt).toBeNull();
    expect(row?.organizationId).toBe(orgB);
  });

  it("denies env scope, impersonation, and a waitlisted member", async () => {
    const owner = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("deny"),
      ownerAdminUserId: owner.id,
    });

    await db.organizationMember.deleteMany({ where: { adminUser: { email: OPERATOR_EMAIL } } });
    await db.organizationInvite.deleteMany({ where: { invitedBy: { email: OPERATOR_EMAIL } } });
    await db.adminUser.deleteMany({ where: { email: OPERATOR_EMAIL } });
    mockSession({ email: OPERATOR_EMAIL, id: "admin" });
    await expect(assertOrgRole(organizationId, ["owner"])).rejects.toThrow("NEXT_NOT_FOUND");

    await seedOperator();
    mockSession({ email: owner.email, id: owner.id, isImpersonating: true });
    await expect(assertOrgRole(organizationId, ["owner"])).rejects.toThrow("NEXT_NOT_FOUND");

    await db.adminUser.update({
      where: { id: owner.id },
      data: { approvalStatus: "WAITLISTED" },
    });
    mockSession({ email: owner.email, id: owner.id });
    await expect(assertOrgRole(organizationId, ["owner"])).rejects.toThrow("NEXT_NOT_FOUND");
    await db.adminUser.update({
      where: { id: owner.id },
      data: { approvalStatus: "APPROVED" },
    });
  });

  it("returns no roles for a removed member", async () => {
    const owner = await seedUser();
    const instructor = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("removed"),
      ownerAdminUserId: owner.id,
    });
    await setOrganizationCapsAction(organizationId, { maxMembers: null, dailyInviteCap: null });
    mockSession({ email: owner.email, id: owner.id });
    const invite = await createOrgInvite(organizationId, instructor.email, ["instructor"]);
    mockSession({ email: instructor.email, id: instructor.id });
    await acceptOrgInvite(invite.rawToken);
    mockSession({ email: owner.email, id: owner.id });
    await removeOrgMember(organizationId, instructor.id);
    expect(await getActiveOrgRoles(instructor.id, organizationId)).toEqual([]);
    const row = await db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId: instructor.id } },
    });
    expect(row?.removedAt).not.toBeNull();
  });
});

describe("org invite accept", () => {
  async function activeOrgWithInvite(opts: {
    invitee: { id: string; email: string };
    roles?: OrgRole[];
    status?: "pending" | "active" | "suspended";
  }) {
    const owner = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("inv"),
      ownerAdminUserId: owner.id,
      timezone: "UTC",
      maxMembers: null,
      dailyInviteCap: null,
    });
    if (opts.status && opts.status !== "pending") {
      await setOrganizationStatusAction(organizationId, opts.status);
    }
    mockSession({ email: owner.email, id: owner.id });
    const invite = await createOrgInvite(
      organizationId,
      opts.invitee.email,
      opts.roles ?? ["instructor"]
    );
    return { organizationId, owner, invite };
  }

  function spyLogs() {
    const lines: string[] = [];
    const spy = jest.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      lines.push(String(msg));
    });
    return {
      lines,
      restore: () => spy.mockRestore(),
    };
  }

  it("approves a WAITLISTED tutor only when the org is active", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    const logs = spyLogs();
    mockSession({ email: invitee.email, id: invitee.id });
    const result = await acceptOrgInvite(invite.rawToken);
    logs.restore();
    expect(result).toEqual({ ok: true, refreshSession: true });

    const user = await db.adminUser.findUnique({ where: { id: invitee.id } });
    expect(user?.approvalStatus).toBe("APPROVED");
    expect(user?.approvedByAdminId).toBe(
      (await db.organizationInvite.findUnique({ where: { id: invite.inviteId } }))?.invitedByAdminUserId
    );
    const member = await db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId: invitee.id } },
    });
    expect(member?.approvedViaOrg).toBe(true);
    expect(member?.roles).toEqual(["instructor"]);
    const text = logs.lines.join("\n");
    expect(text).toContain(`[org] org=${organizationId} action=member_added`);
    expect(text).toContain(`inv=${invite.inviteId.slice(0, 8)}`);
    expect(text).toContain("waitlist_skip=yes");
    expect(text).toContain("[tap]");
    expect(text).toContain(`approvedVia org=${organizationId} inv=${invite.inviteId.slice(0, 8)}`);
    expect(text).not.toContain(invite.rawToken);

    const events = await db.productEvent.findMany({
      where: { adminUserId: invitee.id, kind: "TUTOR_APPROVED" },
    });
    expect(events).toHaveLength(1);
  });

  it("creates membership for a pending org and does not approve", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({ invitee, status: "pending" });
    mockSession({ email: invitee.email, id: invitee.id });
    const result = await acceptOrgInvite(invite.rawToken);
    expect(result).toEqual({ ok: true, refreshSession: false });
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
    const member = await db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId: invitee.id } },
    });
    expect(member?.removedAt).toBeNull();
    expect(member?.approvedViaOrg).toBe(false);
  });

  it("creates membership for a suspended org and does not approve", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({
      invitee,
      status: "suspended",
    });
    const logs = spyLogs();
    mockSession({ email: invitee.email, id: invitee.id });
    await acceptOrgInvite(invite.rawToken);
    logs.restore();
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: invitee.id } },
        })
      )?.approvedViaOrg
    ).toBe(false);
    expect(logs.lines.join("\n")).toContain("waitlist_skip=no");
  });

  it("does not approve a REJECTED tutor", async () => {
    const invitee = await seedUser({ approvalStatus: "REJECTED" });
    const { invite } = await activeOrgWithInvite({ invitee, status: "active" });
    mockSession({ email: invitee.email, id: invitee.id });
    const result = await acceptOrgInvite(invite.rawToken);
    expect(result.ok).toBe(true);
    const user = await db.adminUser.findUnique({ where: { id: invitee.id } });
    expect(user?.approvalStatus).toBe("REJECTED");
    expect(user?.approvedByAdminId).toBeNull();
    expect(
      await db.productEvent.count({ where: { adminUserId: invitee.id, kind: "TUTOR_APPROVED" } })
    ).toBe(0);
  });

  it("does not re-approve after an operator revoke until a new invite is accepted", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    mockSession({ email: invitee.email, id: invitee.id });
    await acceptOrgInvite(invite.rawToken);
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "APPROVED"
    );

    await asOperator();
    const revoked = await revokeOrgGrantedApprovalsAction(organizationId);
    expect(revoked.revoked).toBe(1);
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );

    await setOrganizationStatusAction(organizationId, "suspended");
    await setOrganizationStatusAction(organizationId, "active");
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );

    mockSession({ email: invitee.email, id: invitee.id });
    const again = await acceptOrgInvite(invite.rawToken);
    expect(again).toEqual({ ok: false, error: "invite_unavailable" });
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
  });

  it("does not revoke an operator-approved tutor or auto-revoke on suspension", async () => {
    const viaOrg = await seedUser({ approvalStatus: "WAITLISTED" });
    const operatorApproved = await seedUser({ approvalStatus: "APPROVED" });
    const { organizationId, owner, invite } = await activeOrgWithInvite({
      invitee: viaOrg,
      status: "active",
    });
    mockSession({ email: viaOrg.email, id: viaOrg.id });
    await acceptOrgInvite(invite.rawToken);
    mockSession({ email: owner.email, id: owner.id });
    const other = await createOrgInvite(organizationId, operatorApproved.email, ["instructor"]);
    mockSession({ email: operatorApproved.email, id: operatorApproved.id });
    await acceptOrgInvite(other.rawToken);
    expect(
      (
        await db.organizationMember.findUnique({
          where: {
            organizationId_adminUserId: { organizationId, adminUserId: operatorApproved.id },
          },
        })
      )?.approvedViaOrg
    ).toBe(false);

    await asOperator();
    await revokeOrgGrantedApprovalsAction(organizationId);
    expect((await db.adminUser.findUnique({ where: { id: viaOrg.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
    expect(
      (await db.adminUser.findUnique({ where: { id: operatorApproved.id } }))?.approvalStatus
    ).toBe("APPROVED");

    await setOrganizationStatusAction(organizationId, "suspended");
    expect(
      (await db.adminUser.findUnique({ where: { id: operatorApproved.id } }))?.approvalStatus
    ).toBe("APPROVED");
    expect((await db.adminUser.findUnique({ where: { id: viaOrg.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
  });

  it("leaves a suspended-during-accept tutor unapproved and still a member", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: "suspended" },
      });
      release();
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    await locked;
    mockSession({ email: invitee.email, id: invitee.id });
    const accepting = acceptOrgInvite(invite.rawToken);
    await holder;
    const result = await accepting;
    expect(result.ok).toBe(true);
    expect((await db.adminUser.findUnique({ where: { id: invitee.id } }))?.approvalStatus).toBe(
      "WAITLISTED"
    );
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: invitee.id } },
        })
      )?.removedAt
    ).toBeNull();
    expect((await db.organization.findUnique({ where: { id: organizationId } }))?.status).toBe(
      "suspended"
    );
  });

  it("consumes a token once under two concurrent accepts", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    mockSession({ email: invitee.email, id: invitee.id });
    const [a, b] = await Promise.all([
      acceptOrgInvite(invite.rawToken),
      acceptOrgInvite(invite.rawToken),
    ]);
    const oks = [a, b].filter((result) => result.ok);
    expect(oks).toHaveLength(1);
    const members = await db.organizationMember.findMany({
      where: { organizationId, adminUserId: invitee.id },
    });
    expect(members).toHaveLength(1);
    const row = await db.organizationInvite.findUnique({ where: { id: invite.inviteId } });
    expect(row?.acceptedAt).not.toBeNull();
  });

  it("returns the same unavailable result without consuming the token", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const stranger = await seedUser();
    const missingEmail = `${uniq("nobody")}@example.com`;
    const { invite: missingInvite } = await activeOrgWithInvite({
      invitee: { id: "unused", email: missingEmail },
      status: "active",
    });
    const { invite: mismatchInvite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    const unverified = await seedUser({ emailVerifiedAt: null, approvalStatus: "WAITLISTED" });
    const { invite: unverifiedInvite } = await activeOrgWithInvite({
      invitee: unverified,
      status: "active",
    });
    const testAccount = await seedUser({ approvalStatus: "WAITLISTED" });
    const { invite: testInvite } = await activeOrgWithInvite({
      invitee: testAccount,
      status: "active",
    });
    await db.adminUser.update({
      where: { id: testAccount.id },
      data: { isTestAccount: true },
    });

    mockSession({ email: missingEmail, id: "no-row" });
    const noAccount = await acceptOrgInvite(missingInvite.rawToken);
    mockSession({ email: stranger.email, id: stranger.id });
    const mismatch = await acceptOrgInvite(mismatchInvite.rawToken);
    mockSession(null);
    const signedOut = await acceptOrgInvite(mismatchInvite.rawToken);
    mockSession({ email: unverified.email, id: unverified.id });
    const notVerified = await acceptOrgInvite(unverifiedInvite.rawToken);
    mockSession({ email: testAccount.email, id: testAccount.id });
    const testDenied = await acceptOrgInvite(testInvite.rawToken);
    const garbage = await acceptOrgInvite(uniq("not-a-token"));

    expect(noAccount).toEqual({ ok: false, error: "invite_unavailable" });
    expect(mismatch).toEqual(noAccount);
    expect(signedOut).toEqual(noAccount);
    expect(notVerified).toEqual(noAccount);
    expect(testDenied).toEqual(noAccount);
    expect(garbage).toEqual(noAccount);
    expect(JSON.stringify(noAccount)).not.toMatch(/account|email/i);

    for (const id of [
      missingInvite.inviteId,
      mismatchInvite.inviteId,
      unverifiedInvite.inviteId,
      testInvite.inviteId,
    ]) {
      const row = await db.organizationInvite.findUnique({ where: { id } });
      expect(row?.acceptedAt).toBeNull();
    }
    expect(
      await db.organizationMember.count({
        where: { adminUserId: { in: [invitee.id, stranger.id, unverified.id, testAccount.id] } },
      })
    ).toBe(0);
  });

  it("refuses an expired or revoked token", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const { organizationId, owner, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
    });
    await db.organizationInvite.update({
      where: { id: invite.inviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    mockSession({ email: invitee.email, id: invitee.id });
    expect(await acceptOrgInvite(invite.rawToken)).toEqual({
      ok: false,
      error: "invite_unavailable",
    });

    mockSession({ email: owner.email, id: owner.id });
    const second = await createOrgInvite(organizationId, invitee.email, ["instructor"]);
    await revokeOrgInvite(organizationId, second.inviteId);
    mockSession({ email: invitee.email, id: invitee.id });
    expect(await acceptOrgInvite(second.rawToken)).toEqual({
      ok: false,
      error: "invite_unavailable",
    });
    expect(
      await db.organizationMember.count({ where: { organizationId, adminUserId: invitee.id } })
    ).toBe(0);
  });

  it("reactivates the same membership row", async () => {
    const invitee = await seedUser({ approvalStatus: "APPROVED" });
    const { organizationId, owner, invite } = await activeOrgWithInvite({
      invitee,
      status: "active",
      roles: ["instructor"],
    });
    mockSession({ email: invitee.email, id: invitee.id });
    await acceptOrgInvite(invite.rawToken);
    const first = await db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId: invitee.id } },
    });
    mockSession({ email: owner.email, id: owner.id });
    await removeOrgMember(organizationId, invitee.id);
    const again = await createOrgInvite(organizationId, invitee.email, ["scheduler"]);
    mockSession({ email: invitee.email, id: invitee.id });
    await acceptOrgInvite(again.rawToken);
    const rows = await db.organizationMember.findMany({
      where: { organizationId, adminUserId: invitee.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first?.id);
    expect(rows[0]?.removedAt).toBeNull();
    expect(rows[0]?.roles).toEqual(["scheduler"]);
  });
});

describe("org role matrix and caps", () => {
  it("enforces who may grant roles, forbids empty roles, and keeps one owner", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const instructor = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("roles"),
      ownerAdminUserId: owner.id,
      timezone: "UTC",
    });
    mockSession({ email: owner.email, id: owner.id });
    const adminInvite = await createOrgInvite(organizationId, admin.email, ["admin"]);
    const instructorInvite = await createOrgInvite(organizationId, instructor.email, ["instructor"]);
    mockSession({ email: admin.email, id: admin.id });
    await acceptOrgInvite(adminInvite.rawToken);
    mockSession({ email: instructor.email, id: instructor.id });
    await acceptOrgInvite(instructorInvite.rawToken);

    mockSession({ email: admin.email, id: admin.id });
    await expect(setOrgMemberRoles(organizationId, instructor.id, ["owner"])).rejects.toBeInstanceOf(
      OrgMutationError
    );
    await expect(setOrgMemberRoles(organizationId, instructor.id, ["admin"])).rejects.toMatchObject({
      code: "role_forbidden",
    });
    await expect(setOrgMemberRoles(organizationId, admin.id, ["owner"])).rejects.toMatchObject({
      code: "self_escalation",
    });
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: admin.id } },
        })
      )?.roles
    ).toEqual(["admin"]);

    await setOrgMemberRoles(organizationId, instructor.id, ["scheduler", "instructor"]);
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: instructor.id } },
        })
      )?.roles.sort()
    ).toEqual(["instructor", "scheduler"]);

    mockSession({ email: instructor.email, id: instructor.id });
    await expect(
      setOrgMemberRoles(organizationId, admin.id, ["instructor"])
    ).rejects.toThrow("NEXT_NOT_FOUND");

    mockSession({ email: owner.email, id: owner.id });
    await expect(setOrgMemberRoles(organizationId, instructor.id, [])).rejects.toMatchObject({
      code: "empty_roles",
    });
    await expect(setOrgMemberRoles(organizationId, owner.id, ["instructor"])).rejects.toMatchObject({
      code: "last_owner",
    });
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: owner.id } },
        })
      )?.roles
    ).toEqual(["owner"]);

    await setOrgMemberRoles(organizationId, admin.id, ["owner"]);
    await setOrgMemberRoles(organizationId, owner.id, ["admin"]);
    const owners = await db.organizationMember.count({
      where: { organizationId, removedAt: null, roles: { has: "owner" } },
    });
    expect(owners).toBe(1);
    expect(
      (
        await db.organizationMember.findUnique({
          where: { organizationId_adminUserId: { organizationId, adminUserId: owner.id } },
        })
      )?.roles
    ).toEqual(["admin"]);
  });

  it("enforces operator-set member and daily invite caps", async () => {
    const owner = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("caps"),
      ownerAdminUserId: owner.id,
      timezone: "UTC",
      maxMembers: 1,
      dailyInviteCap: null,
    });
    mockSession({ email: owner.email, id: owner.id });
    await expect(
      createOrgInvite(organizationId, `${uniq("full")}@example.com`, ["instructor"])
    ).rejects.toMatchObject({ code: "max_members" });
    expect(await db.organizationInvite.count({ where: { organizationId } })).toBe(0);

    await asOperator();
    await setOrganizationCapsAction(organizationId, { maxMembers: null, dailyInviteCap: 1 });
    mockSession({ email: owner.email, id: owner.id });
    const day = new Date("2026-06-15T18:00:00.000Z");
    await createOrgInvite(organizationId, `${uniq("day")}@example.com`, ["instructor"], day);
    await expect(
      createOrgInvite(organizationId, `${uniq("day2")}@example.com`, ["instructor"], day)
    ).rejects.toMatchObject({ code: "daily_invite_cap" });
    const nextDay = new Date("2026-06-16T01:00:00.000Z");
    const later = await createOrgInvite(
      organizationId,
      `${uniq("nextday")}@example.com`,
      ["instructor"],
      nextDay
    );
    expect(later.inviteId).toBeTruthy();

    await asOperator();
    const { organizationId: raceOrg } = await createOrganizationAction({
      name: uniq("race-cap"),
      ownerAdminUserId: owner.id,
      timezone: "UTC",
      dailyInviteCap: 1,
    });
    mockSession({ email: owner.email, id: owner.id });
    const raced = await Promise.allSettled([
      createOrgInvite(raceOrg, `${uniq("p1")}@example.com`, ["instructor"]),
      createOrgInvite(raceOrg, `${uniq("p2")}@example.com`, ["instructor"]),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.organizationInvite.count({ where: { organizationId: raceOrg } })).toBe(1);

    mockSession({ email: owner.email, id: owner.id });
    await expect(
      setOrganizationCapsAction(raceOrg, { maxMembers: 5, dailyInviteCap: 5 })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("refuses a test-account member", async () => {
    const testOwner = await seedUser({ isTestAccount: true });
    await asOperator();
    await expect(
      createOrganizationAction({ name: uniq("test-owner"), ownerAdminUserId: testOwner.id })
    ).rejects.toMatchObject({ code: "test_account" });
    expect(await db.organization.count({ where: { members: { some: { adminUserId: testOwner.id } } } })).toBe(
      0
    );
  });

  it("does not let org-scope reach student, share, or join scope", () => {
    for (const rel of [
      "src/lib/student-scope.ts",
      "src/lib/share-access-scope.ts",
      "src/lib/join-scope.ts",
    ]) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(text).not.toMatch(/org-scope|assertOrgRole|getActiveOrgRoles/);
    }
  });

  it("exempts /org-invite from the waitlist, email-verify, and 2FA gates", () => {
    expect(isApprovalExemptAdminPath("/org-invite/abc")).toBe(true);
    expect(isEmailVerifyExemptAdminPath("/org-invite/abc")).toBe(true);
    expect(is2faExemptAdminPath("/org-invite/abc")).toBe(true);
    expect(isApprovalExemptAdminPath("/admin/students")).toBe(false);
  });
});

describe("jwt refresh after org approval", () => {
  it("session update reloads approval without waiting out the throttle", async () => {
    const invitee = await seedUser({ approvalStatus: "WAITLISTED" });
    const owner = await seedUser();
    await asOperator();
    const { organizationId } = await createOrganizationAction({
      name: uniq("jwt"),
      ownerAdminUserId: owner.id,
      timezone: "UTC",
    });
    await setOrganizationStatusAction(organizationId, "active");
    mockSession({ email: owner.email, id: owner.id });
    const invite = await createOrgInvite(organizationId, invitee.email, ["instructor"]);
    mockSession({ email: invitee.email, id: invitee.id });
    const accepted = await acceptOrgInvite(invite.rawToken);
    expect(accepted).toEqual({ ok: true, refreshSession: true });

    const { authOptions } = jest.requireActual("@/auth-options") as typeof import("@/auth-options");
    const jwt = authOptions.callbacks!.jwt as (params: {
      token: Record<string, unknown>;
      user?: unknown;
      account?: unknown;
      trigger?: "signIn" | "signUp" | "update";
    }) => Promise<Record<string, unknown>>;
    const base = {
      sub: invitee.id,
      approvalStatus: "WAITLISTED",
      _roleCheckedAt: Date.now(),
      role: "TUTOR",
      isTestAccount: false,
      emailVerified: true,
    };
    const throttled = await jwt({
      token: { ...base },
      user: undefined,
      account: null,
    });
    expect(throttled.approvalStatus).toBe("WAITLISTED");
    const refreshed = await jwt({
      token: { ...base },
      user: undefined,
      account: null,
      trigger: "update",
    });
    expect(refreshed.approvalStatus).toBe("APPROVED");
  });
});
