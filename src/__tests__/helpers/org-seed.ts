/**
 * Real-DB seeds for org schedule tests. One copy for the W3 suites.
 * Oracles built from these seeds are ids and strings only.
 */
import type { OrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { uniq } from "./unique-test-token";

export type SeedApproval = "APPROVED" | "WAITLISTED" | "REJECTED";

/**
 * Insert an admin with a fixed email, or return the row already there.
 * Org suites share one database; a second `create` of `org-operator@example.com`
 * hits the unique constraint when slice 1 and the learner suite run together.
 */
export async function upsertAdminByEmail(
  email: string,
  opts?: {
    approvalStatus?: SeedApproval;
    isTestAccount?: boolean;
    role?: "TUTOR" | "ADMIN";
    displayName?: string;
    /** `null` seeds an unverified account; omitted seeds a verified one. */
    emailVerifiedAt?: Date | null;
  }
) {
  return db.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      role: opts?.role ?? "TUTOR",
      approvalStatus: opts?.approvalStatus ?? "APPROVED",
      emailVerifiedAt:
        opts?.emailVerifiedAt === undefined ? new Date("2026-01-01") : opts.emailVerifiedAt,
      isTestAccount: opts?.isTestAccount ?? false,
      ...(opts?.displayName ? { displayName: opts.displayName } : {}),
    },
  });
}

/** A fresh admin with a unique email. The one creator is `upsertAdminByEmail`. */
export async function seedAdmin(
  label: string,
  opts?: {
    approvalStatus?: SeedApproval;
    isTestAccount?: boolean;
    role?: "TUTOR" | "ADMIN";
    emailVerifiedAt?: Date | null;
    /** A fixed email instead of a unique one (shared-row suites). */
    email?: string;
  }
) {
  // Sign-in lowercases the email, so keep the local part lowercase and space-free.
  const email =
    opts?.email ?? `${uniq(label.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}@example.com`;
  return upsertAdminByEmail(email, { ...opts, displayName: label });
}

export async function seedOrg(status: "active" | "pending" | "suspended" = "active") {
  const owner = await seedAdmin("owner");
  const org = await db.organization.create({
    data: {
      name: `Acme ${uniq("school")}`,
      status,
      timezone: "America/Denver",
      createdByOperatorId: "org-operator@example.com",
      members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
    },
  });
  return { org, owner };
}

export async function seedMember(
  organizationId: string,
  roles: OrgRole[],
  opts?: {
    removedAt?: Date | null;
    approvalStatus?: SeedApproval;
    isTestAccount?: boolean;
    /** Display name; defaults to the role list. */
    label?: string;
  }
) {
  const admin = await seedAdmin(opts?.label ?? roles.join("-"), {
    approvalStatus: opts?.approvalStatus,
    isTestAccount: opts?.isTestAccount,
  });
  await db.organizationMember.create({
    data: {
      organizationId,
      adminUserId: admin.id,
      roles,
      removedAt: opts?.removedAt ?? null,
    },
  });
  return admin;
}

/** An org-owned learner with a parent email and a brief that must never leak. */
export async function seedOrgLearner(
  organizationId: string,
  createdByAdminUserId: string,
  names: { givenName: string; familyName: string } = { givenName: "Mary Ann", familyName: "Lee" },
  opts?: { allowLiveSession?: boolean }
) {
  const fullName = `${names.givenName} ${names.familyName}`;
  const parentEmail = `${uniq("parent-secret")}@example.com`;
  const brief = `brief-secret-${uniq("brief")}`;
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: fullName, isSelfLearner: false },
  });
  const student = await db.student.create({
    data: {
      name: fullName,
      adminUserId: null,
      organizationId,
      learnerProfileId: profile.id,
      parentEmail,
    },
  });
  await db.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId,
      givenName: names.givenName,
      familyName: names.familyName,
      brief,
      createdByAdminUserId,
    },
  });
  await db.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: null,
      organizationId,
      version: 1,
      allowLiveSession: opts?.allowLiveSession ?? true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
    },
  });
  return { student, profile, parentEmail, brief, fullName };
}

export async function seedPersonalStudent(adminUserId: string, name: string) {
  return db.student.create({ data: { name, adminUserId } });
}

export async function seedAppointment(input: {
  adminUserId: string;
  studentId: string;
  subject?: string;
  startAt?: Date;
  endAt?: Date;
}) {
  const startAt = input.startAt ?? new Date("2026-10-20T22:00:00.000Z");
  const endAt = input.endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000);
  return db.scheduledSession.create({
    data: {
      adminUserId: input.adminUserId,
      studentId: input.studentId,
      date: new Date(`${startAt.toISOString().slice(0, 10)}T00:00:00.000Z`),
      startTime: "16:00",
      endTime: "17:00",
      startAt,
      endAt,
      plannedDurationMinutes: 60,
      subject: input.subject ?? "Algebra",
    },
  });
}
