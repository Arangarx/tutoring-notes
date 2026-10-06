/**
 * @jest-environment node
 *
 * createStudent refuses a tutor who is not approved, and the shared pending-invite
 * cap (3) refuses another invite. Oracles are roster rows and invite rows in the DB.
 */
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { createStudent } from "@/app/admin/students/actions";
import {
  mintStudentClaimInvite,
} from "@/lib/claim-invite-service";
import { uniq } from "../helpers/unique-test-token";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function tutor(approvalStatus: "APPROVED" | "WAITLISTED" | "REJECTED") {
  const email = `${uniq("tutor")}@example.com`;
  const row = await db.adminUser.create({
    data: { email, role: "TUTOR", approvalStatus, emailVerifiedAt: new Date() },
  });
  mockGetServerSession.mockResolvedValue({ user: { email } });
  return row;
}

describe("createStudent approval and invite cap", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("a tutor who is not approved adds no learner", async () => {
    const row = await tutor("WAITLISTED");
    const email = `${uniq("parent")}@example.com`;
    const result = await createStudent(
      null,
      form({
        learnerKind: "self_learner",
        inviteEmail: email,
      })
    );
    expect(result).toEqual({
      status: "error",
      message: "Your account is not approved to add learners yet.",
    });
    expect(await db.student.count({ where: { adminUserId: row.id } })).toBe(0);
  });

  it("an approved tutor's new learner has one pending invite", async () => {
    const row = await tutor("APPROVED");
    const email = `${uniq("parent")}@example.com`;
    const result = await createStudent(
      null,
      form({
        learnerKind: "self_learner",
        inviteEmail: email,
      })
    );
    expect(result.status === "success" || result.status === "invite_send_failed").toBe(true);
    const students = await db.student.findMany({ where: { adminUserId: row.id } });
    expect(students).toHaveLength(1);
    const pending = await db.studentClaimInvite.count({
      where: { studentId: students[0]!.id, claimedAt: null, revokedAt: null },
    });
    expect(pending).toBe(1);
  });

  it("a fourth pending invite is refused and the count stays at the cap", async () => {
    const row = await tutor("APPROVED");
    const student = await db.student.create({
      data: {
        name: "Kid",
        parentEmail: `${uniq("parent")}@example.com`,
        adminUserId: row.id,
      },
    });
    for (let i = 0; i < 3; i++) {
      await mintStudentClaimInvite({
        studentId: student.id,
        adminUserId: row.id,
        recipientEmail: student.parentEmail!,
        targetKind: "child_learner",
        studentDisplayName: "Kid",
        sendEmail: false,
      });
    }
    await expect(
      mintStudentClaimInvite({
        studentId: student.id,
        adminUserId: row.id,
        recipientEmail: student.parentEmail!,
        targetKind: "child_learner",
        studentDisplayName: "Kid",
        sendEmail: false,
      })
    ).rejects.toThrow("too_many_pending_invites");
    expect(
      await db.studentClaimInvite.count({
        where: { studentId: student.id, claimedAt: null, revokedAt: null },
      })
    ).toBe(3);
  });
});
