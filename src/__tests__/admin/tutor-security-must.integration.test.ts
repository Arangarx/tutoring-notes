/**
 * @jest-environment node
 *
 * Tutor daily caps, claim-email cap, and createStudent burst limit.
 * Oracles are row counts and refusal text. The literals 20, 30, 10, and 15
 * are the spec. This file does not import the implementation constants.
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
import { createStudent } from "@/app/admin/students/actions";
import { mintStudentClaimInvite } from "@/lib/claim-invite-service";
import { generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import { uniq } from "../helpers/unique-test-token";

const DAILY_STUDENT_CAP_MESSAGE =
  "You have reached today's limit for new students. Try again tomorrow.";
const BURST_MESSAGE = "Too many attempts. Try again later.";

/** Spec burst: 10 attempts per 15 minutes. */
const BURST_ATTEMPTS = 10;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({ user: { email: tutor.email } });
}

async function seedTutor(tutorTimezone?: string | null) {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      tutorTimezone: tutorTimezone === undefined ? undefined : tutorTimezone,
    },
  });
}

async function seedTutorOwnedStudent(
  adminUserId: string,
  createdAt: Date,
  name = uniq("student")
) {
  return db.student.create({
    data: {
      name,
      parentEmail: `${uniq("parent")}@example.com`,
      adminUserId,
      organizationId: null,
      createdAt,
    },
  });
}

function selfLearnerForm() {
  return form({
    learnerKind: "self_learner",
    inviteEmail: `${uniq("self")}@example.com`,
  });
}

/**
 * First UTC instant of `now`'s calendar date in `timeZone`.
 * Binary search on the zoned calendar date. Not the offset formula in startOfZonedDay.
 */
function zonedDayStart(now: Date, timeZone: string): Date {
  const target = zonedYmd(now.getTime(), timeZone);
  let lo = now.getTime() - 36 * 60 * 60 * 1000;
  let hi = now.getTime();
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (zonedYmd(mid, timeZone) < target) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

function zonedYmd(instant: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("tutor daily student cap", () => {
  it("refuses the 21st tutor-owned student, ignores an org learner, and gives a second tutor their own 20", async () => {
    const tutorA = await seedTutor("America/Denver");
    const tutorB = await seedTutor("America/Denver");
    const org = await db.organization.create({
      data: {
        name: uniq("org"),
        createdByOperatorId: "operator",
      },
    });
    const now = new Date();
    for (let i = 0; i < 19; i++) {
      await seedTutorOwnedStudent(tutorA.id, now, `a-${i}`);
    }
    await db.student.create({
      data: {
        name: "Org learner",
        parentEmail: `${uniq("orgparent")}@example.com`,
        adminUserId: null,
        organizationId: org.id,
        createdAt: now,
      },
    });
    for (let i = 0; i < 19; i++) {
      await seedTutorOwnedStudent(tutorB.id, now, `b-${i}`);
    }

    mockSessionAsTutor(tutorA);
    const twentieth = await createStudent(null, selfLearnerForm());
    expect(twentieth.status).toBe("success");

    const twentyFirst = await createStudent(null, selfLearnerForm());
    expect(twentyFirst).toEqual({
      status: "error",
      message: DAILY_STUDENT_CAP_MESSAGE,
    });
    expect(
      await db.student.count({
        where: { adminUserId: tutorA.id, organizationId: null },
      })
    ).toBe(20);
    expect(await db.student.count({ where: { organizationId: org.id } })).toBe(1);

    mockSessionAsTutor(tutorB);
    const otherTutor = await createStudent(null, selfLearnerForm());
    expect(otherTutor.status).toBe("success");
    expect(
      await db.student.count({
        where: { adminUserId: tutorB.id, organizationId: null },
      })
    ).toBe(20);
  });

  it("does not count a student created before the tutor's zoned day, and does count one created after", async () => {
    const timeZone = "Pacific/Auckland";
    const tutor = await seedTutor(timeZone);
    const now = new Date();
    const dayStart = zonedDayStart(now, timeZone);
    expect(zonedYmd(dayStart.getTime(), timeZone)).toBe(zonedYmd(now.getTime(), timeZone));
    expect(zonedYmd(dayStart.getTime() - 1, timeZone)).toBeLessThan(
      zonedYmd(now.getTime(), timeZone)
    );

    for (let i = 0; i < 20; i++) {
      await seedTutorOwnedStudent(
        tutor.id,
        new Date(dayStart.getTime() - 60_000 - i),
        `before-${i}`
      );
    }

    mockSessionAsTutor(tutor);
    const afterOnlyBefore = await createStudent(null, selfLearnerForm());
    expect(afterOnlyBefore.status).toBe("success");
    expect(
      await db.student.count({
        where: {
          adminUserId: tutor.id,
          organizationId: null,
          createdAt: { gte: dayStart },
        },
      })
    ).toBe(1);

    for (let i = 0; i < 19; i++) {
      await seedTutorOwnedStudent(
        tutor.id,
        new Date(dayStart.getTime() + 1_000 + i),
        `after-${i}`
      );
    }
    expect(
      await db.student.count({
        where: {
          adminUserId: tutor.id,
          organizationId: null,
          createdAt: { gte: dayStart },
        },
      })
    ).toBe(20);

    const refused = await createStudent(null, selfLearnerForm());
    expect(refused).toEqual({
      status: "error",
      message: DAILY_STUDENT_CAP_MESSAGE,
    });
    expect(refused.status === "error" && refused.message).not.toBe(BURST_MESSAGE);
    expect(
      await db.student.count({
        where: {
          adminUserId: tutor.id,
          organizationId: null,
          createdAt: { gte: dayStart },
        },
      })
    ).toBe(20);
  });

  it("uses America/Denver when the tutor has no timezone", async () => {
    const tutor = await seedTutor(null);
    const now = new Date();
    const dayStart = zonedDayStart(now, "America/Denver");

    for (let i = 0; i < 20; i++) {
      await seedTutorOwnedStudent(
        tutor.id,
        new Date(dayStart.getTime() - 60_000 - i),
        `denver-before-${i}`
      );
    }

    mockSessionAsTutor(tutor);
    const allowed = await createStudent(null, selfLearnerForm());
    expect(allowed.status).toBe("success");

    for (let i = 0; i < 19; i++) {
      await seedTutorOwnedStudent(
        tutor.id,
        new Date(dayStart.getTime() + 1_000 + i),
        `denver-after-${i}`
      );
    }
    const refused = await createStudent(null, selfLearnerForm());
    expect(refused).toEqual({
      status: "error",
      message: DAILY_STUDENT_CAP_MESSAGE,
    });
  });
});

describe("tutor daily claim-email cap", () => {
  async function seedInvites(input: {
    studentId: string;
    adminUserId: string;
    count: number;
    createdAt: Date;
  }) {
    await db.studentClaimInvite.createMany({
      data: Array.from({ length: input.count }, () => ({
        studentId: input.studentId,
        adminUserId: input.adminUserId,
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: input.createdAt,
        createdAt: input.createdAt,
      })),
    });
  }

  it("refuses the 31st tutor-owned claim invite and does not count org invites or the previous day", async () => {
    const timeZone = "Pacific/Auckland";
    const tutor = await seedTutor(timeZone);
    const now = new Date();
    const dayStart = zonedDayStart(now, timeZone);
    const org = await db.organization.create({
      data: { name: uniq("org"), createdByOperatorId: "operator" },
    });
    const orgStudent = await db.student.create({
      data: {
        name: "Org learner",
        parentEmail: `${uniq("org")}@example.com`,
        adminUserId: null,
        organizationId: org.id,
      },
    });
    const ownStudent = await seedTutorOwnedStudent(tutor.id, now, "Own");

    await seedInvites({
      studentId: orgStudent.id,
      adminUserId: tutor.id,
      count: 30,
      createdAt: now,
    });

    const firstPersonal = await mintStudentClaimInvite({
      studentId: ownStudent.id,
      adminUserId: tutor.id,
      recipientEmail: ownStudent.parentEmail!,
      targetKind: "child_learner",
      studentDisplayName: "Own",
      sendEmail: false,
    });
    expect(firstPersonal.inviteId).toEqual(expect.any(String));

    await seedInvites({
      studentId: ownStudent.id,
      adminUserId: tutor.id,
      count: 29,
      createdAt: now,
    });

    const personalToday = () =>
      db.studentClaimInvite.count({
        where: {
          adminUserId: tutor.id,
          createdAt: { gte: dayStart },
          student: { organizationId: null },
        },
      });
    expect(await personalToday()).toBe(30);

    await expect(
      mintStudentClaimInvite({
        studentId: ownStudent.id,
        adminUserId: tutor.id,
        recipientEmail: ownStudent.parentEmail!,
        targetKind: "child_learner",
        studentDisplayName: "Own",
        sendEmail: false,
      })
    ).rejects.toThrow("tutor_daily_claim_cap");
    expect(await personalToday()).toBe(30);

    const orgMint = await mintStudentClaimInvite({
      studentId: orgStudent.id,
      adminUserId: tutor.id,
      recipientEmail: `${uniq("orgmail")}@example.com`,
      targetKind: "child_learner",
      studentDisplayName: "Org learner",
      sendEmail: false,
    });
    expect(orgMint.inviteId).toEqual(expect.any(String));
    expect(await personalToday()).toBe(30);

    const yesterdayTutor = await seedTutor(timeZone);
    const oldStudent = await seedTutorOwnedStudent(
      yesterdayTutor.id,
      new Date(dayStart.getTime() - 60_000),
      "Yesterday"
    );
    await seedInvites({
      studentId: oldStudent.id,
      adminUserId: yesterdayTutor.id,
      count: 30,
      createdAt: new Date(dayStart.getTime() - 60_000),
    });
    const mintedToday = await mintStudentClaimInvite({
      studentId: oldStudent.id,
      adminUserId: yesterdayTutor.id,
      recipientEmail: oldStudent.parentEmail!,
      targetKind: "child_learner",
      studentDisplayName: "Yesterday",
      sendEmail: false,
    });
    expect(mintedToday.inviteId).toEqual(expect.any(String));
    expect(
      await db.studentClaimInvite.count({
        where: {
          adminUserId: yesterdayTutor.id,
          createdAt: { gte: dayStart },
          student: { organizationId: null },
        },
      })
    ).toBe(1);
  });

  it("refuses a 4th pending invite on one student before the daily cap matters", async () => {
    const tutor = await seedTutor("America/Denver");
    const student = await seedTutorOwnedStudent(tutor.id, new Date(), "Pending");
    for (let i = 0; i < 3; i++) {
      await mintStudentClaimInvite({
        studentId: student.id,
        adminUserId: tutor.id,
        recipientEmail: student.parentEmail!,
        targetKind: "child_learner",
        studentDisplayName: "Pending",
        sendEmail: false,
      });
    }
    await expect(
      mintStudentClaimInvite({
        studentId: student.id,
        adminUserId: tutor.id,
        recipientEmail: student.parentEmail!,
        targetKind: "child_learner",
        studentDisplayName: "Pending",
        sendEmail: false,
      })
    ).rejects.toThrow("too_many_pending_invites");
    expect(
      await db.studentClaimInvite.count({ where: { studentId: student.id } })
    ).toBe(3);
    expect(
      await db.studentClaimInvite.count({
        where: { adminUserId: tutor.id, student: { organizationId: null } },
      })
    ).toBeLessThan(30);
  });
});

describe("createStudent burst limit", () => {
  it("refuses a burst past 10 attempts in 15 minutes the same way for a new handle and a real one", async () => {
    const tutor = await seedTutor("America/Denver");
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
    const realHandle = `${username}@${familyId}`;

    for (let i = 0; i < BURST_ATTEMPTS; i++) {
      const result = await createStudent(null, selfLearnerForm());
      expect(result.status).toBe("success");
    }
    expect(
      await db.student.count({ where: { adminUserId: tutor.id, organizationId: null } })
    ).toBe(10);

    const freshHandle = `${uniq("newkid")}@${uniq("nofam").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
    const fresh = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: `${uniq("freshparent")}@example.com`,
        childIdentifier: freshHandle,
      })
    );
    const real = await createStudent(
      null,
      form({
        learnerKind: "child_learner",
        inviteEmail: `${uniq("realparent")}@example.com`,
        childIdentifier: realHandle,
      })
    );

    expect(fresh).toEqual({ status: "error", message: BURST_MESSAGE });
    expect(real).toEqual(fresh);
    expect(fresh.status === "error" && fresh.message).not.toBe(DAILY_STUDENT_CAP_MESSAGE);
    const freshText = JSON.stringify(fresh);
    const realText = JSON.stringify(real);
    for (const text of [freshText, realText]) {
      expect(text).not.toMatch(/\b(found|missing)\b/i);
      expect(text).not.toContain(familyEmail);
      expect(text).not.toContain(credential.id);
    }
    expect(
      await db.student.count({ where: { adminUserId: tutor.id, organizationId: null } })
    ).toBe(10);
    expect(await db.student.count({ where: { learnerProfileId: profile.id } })).toBe(0);
  });
});
