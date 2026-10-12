/**
 * @jest-environment node
 *
 * createStudent — invite-on-add (people-and-claim wave).
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

jest.mock("@/lib/email", () => ({
  sendPlatformMail: jest.fn().mockResolvedValue({ sent: true }),
}));

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { createStudent, retryStudentClaimInvite } from "@/app/admin/students/actions";
import { uniq } from "../helpers/unique-test-token";
import { sendPlatformMail } from "@/lib/email";

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: tutor.email },
  });
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  mockGetServerSession.mockReset();
  (sendPlatformMail as jest.Mock).mockResolvedValue({ sent: true });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createStudent — invite on add", () => {
  it("creates self-learner row with email as pending label and mints invite", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);
    const email = `${uniq("self")}@example.com`;

    const result = await createStudent(
      null,
      form({
        learnerKind: "self_learner",
        inviteEmail: email,
      })
    );

    expect(result).toEqual({ status: "success" });

    const row = await db.student.findFirst({
      where: { adminUserId: tutor.id, parentEmail: email },
      include: { claimInvites: true },
    });
    expect(row).not.toBeNull();
    expect(row!.name).toBe(email);
    expect(row!.claimInvites.length).toBeGreaterThanOrEqual(1);
    expect(sendPlatformMail).toHaveBeenCalled();
  });

  it("returns invite_send_failed without creating a second student on SMTP failure", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);
    (sendPlatformMail as jest.Mock).mockResolvedValueOnce({ sent: false, error: "fail" });

    const email = `${uniq("self")}@example.com`;
    const result = await createStudent(
      null,
      form({
        learnerKind: "self_learner",
        inviteEmail: email,
      })
    );

    expect(result.status).toBe("invite_send_failed");
    if (result.status !== "invite_send_failed") return;

    const count = await db.student.count({
      where: { adminUserId: tutor.id, parentEmail: email },
    });
    expect(count).toBe(1);

    const retry = await retryStudentClaimInvite(
      null,
      form({ studentId: result.studentId })
    );
    expect(retry).toEqual({ status: "success" });
  });

  it("a handle that exists and a handle that does not return the same status and each create a student", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);

    const familyId = uniq("fam").replace(/[^a-z0-9]/gi, "").slice(0, 16);
    const username = "kid";
    const familyEmail = `${uniq("family")}@example.com`;
    const holder = await db.accountHolder.create({
      data: { email: familyEmail, familyId, displayName: "Other Family" },
    });
    const profile = await db.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: "Their Child",
        accessMode: "child_pin_required",
      },
    });
    const credential = await db.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: holder.id,
        username,
        secretHash: "not-a-real-pin-hash",
      },
    });

    const hit = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: `${uniq("hitparent")}@example.com`,
        childIdentifier: `${username}@${familyId}`,
      })
    );
    const miss = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: `${uniq("missparent")}@example.com`,
        childIdentifier: `nobody@${uniq("nofam").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
      })
    );

    expect(hit.status).toBe(miss.status);
    expect(hit).toEqual({ status: "success" });
    expect(miss).toEqual({ status: "success" });
    for (const result of [hit, miss]) {
      const text = JSON.stringify(result);
      expect(text).not.toMatch(/\b(found|missing)\b/i);
      expect(text).not.toContain(familyEmail);
      expect(text).not.toContain(credential.id);
    }

    const rows = await db.student.findMany({ where: { adminUserId: tutor.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.learnerProfileId == null)).toBe(true);
    expect(await db.student.count({ where: { learnerProfileId: profile.id } })).toBe(0);
  });

  it("stores a capped child name with control characters and HTML removed", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);
    const dirty = `${"Z".repeat(70)}<b>\u0007</b>${"Q".repeat(40)}`;
    const email = `${uniq("parent")}@example.com`;

    const result = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: email,
        childIdentifier: dirty,
      })
    );

    expect(result.status).toBe("success");
    const row = await db.student.findFirst({
      where: { adminUserId: tutor.id, parentEmail: email },
    });
    expect(row).not.toBeNull();
    expect(row!.name.length).toBeLessThanOrEqual(80);
    expect(row!.name.length).toBeLessThan(dirty.length);
    expect(row!.name.startsWith("Z".repeat(70))).toBe(true);
    expect(row!.name).not.toContain("<");
    expect(row!.name).not.toContain(">");
    expect(row!.name).not.toContain("\u0007");
  });
});
