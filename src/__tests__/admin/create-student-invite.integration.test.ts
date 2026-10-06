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

  it("child family handle lookup failure uses generic message (anti-enumeration)", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);

    const result = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: `${uniq("parent")}@example.com`,
        childIdentifier: "nobody@not-a-real-family-id",
      })
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/username@familyid/i);
    }
    expect(
      await db.student.count({ where: { adminUserId: tutor.id } })
    ).toBe(0);
  });
});
