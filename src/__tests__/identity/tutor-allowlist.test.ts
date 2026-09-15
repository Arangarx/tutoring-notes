/**
 * Tutor email allowlist — signup pre-approve + operator actions.
 */

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createAdmin, createAdminFromGoogle } from "@/lib/auth-db";
import {
  addTutorEmailAllowlist,
  removeTutorEmailAllowlist,
} from "@/app/admin/tutor-approvals/actions";

const OPERATOR_FIXTURE = {
  email: "allowlist-operator@test.local",
  password: "AllowlistOperator!99",
};

const mockIsOperatorEmail = jest.fn();
const mockGetServerSession = jest.fn();

jest.mock("@/lib/operator", () => ({
  isOperatorEmail: (...args: unknown[]) => mockIsOperatorEmail(...args),
}));

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const ALLOWLIST_EMAIL = "allowlist-signup@test.local";
const WAITLIST_EMAIL = "waitlist-signup@test.local";
const GOOGLE_ALLOWLIST_EMAIL = "allowlist-google@test.local";
const GOOGLE_WAITLIST_EMAIL = "waitlist-google@test.local";
const OPERATOR_ACTION_EMAIL = "operator-allowlist-add@test.local";

async function cleanup() {
  const emails = [
    OPERATOR_FIXTURE.email,
    ALLOWLIST_EMAIL,
    WAITLIST_EMAIL,
    GOOGLE_ALLOWLIST_EMAIL,
    GOOGLE_WAITLIST_EMAIL,
    OPERATOR_ACTION_EMAIL,
    "MixedCase@TEST.local",
  ];
  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    await db.tutorEmailAllowlist.deleteMany({ where: { email: normalized } });
    const admin = await db.adminUser.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (!admin) continue;
    await db.tutorEmailAllowlist.deleteMany({ where: { createdByAdminId: admin.id } });
    await db.adminUserEmailToken.deleteMany({ where: { adminUserId: admin.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
}

async function seedOperatorAdminId(): Promise<string> {
  const passwordHash = await bcrypt.hash(OPERATOR_FIXTURE.password, 10);
  const operator = await db.adminUser.upsert({
    where: { email: OPERATOR_FIXTURE.email },
    create: {
      email: OPERATOR_FIXTURE.email,
      passwordHash,
      displayName: "Allowlist Operator",
      role: "ADMIN",
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
      isTestAccount: false,
    },
    update: {
      passwordHash,
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
    },
    select: { id: true },
  });
  return operator.id;
}

beforeEach(async () => {
  await cleanup();
  mockIsOperatorEmail.mockReset();
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("createAdmin — allowlist gate", () => {
  it("creates APPROVED when email is on the allowlist", async () => {
    const operatorId = await seedOperatorAdminId();
    await db.tutorEmailAllowlist.create({
      data: {
        email: ALLOWLIST_EMAIL,
        createdByAdminId: operatorId,
      },
    });

    const row = await createAdmin(ALLOWLIST_EMAIL, "AllowlistSignup!99");
    expect(row.approvalStatus).toBe("APPROVED");
    expect(row.approvedAt).toBeInstanceOf(Date);
    expect(row.approvedByAdminId).toBe(operatorId);
  });

  it("creates WAITLISTED when email is not on the allowlist", async () => {
    const row = await createAdmin(WAITLIST_EMAIL, "WaitlistSignup!99");
    expect(row.approvalStatus).toBe("WAITLISTED");
    expect(row.approvedAt).toBeNull();
    expect(row.approvedByAdminId).toBeNull();
  });
});

describe("createAdminFromGoogle — allowlist gate", () => {
  it("creates APPROVED with emailVerifiedAt when allowlisted", async () => {
    const operatorId = await seedOperatorAdminId();
    await db.tutorEmailAllowlist.create({
      data: {
        email: GOOGLE_ALLOWLIST_EMAIL,
        createdByAdminId: operatorId,
      },
    });

    const row = await createAdminFromGoogle(GOOGLE_ALLOWLIST_EMAIL, "Google Pilot");
    expect(row.approvalStatus).toBe("APPROVED");
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(row.approvedByAdminId).toBe(operatorId);
  });

  it("creates WAITLISTED with emailVerifiedAt when not allowlisted", async () => {
    const row = await createAdminFromGoogle(GOOGLE_WAITLIST_EMAIL, "Google Waitlist");
    expect(row.approvalStatus).toBe("WAITLISTED");
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(row.approvedAt).toBeNull();
  });
});

describe("operator allowlist actions", () => {
  let operatorId = "";

  beforeEach(async () => {
    operatorId = await seedOperatorAdminId();
    mockIsOperatorEmail.mockReturnValue(true);
    mockGetServerSession.mockResolvedValue({
      user: { id: operatorId, email: OPERATOR_FIXTURE.email },
    });
  });

  it("addTutorEmailAllowlist normalizes email, stores row, and returns the created entry", async () => {
    const result = await addTutorEmailAllowlist("MixedCase@TEST.local");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.email).toBe("mixedcase@test.local");

    const row = await db.tutorEmailAllowlist.findUnique({
      where: { email: "mixedcase@test.local" },
    });
    expect(row?.createdByAdminId).toBe(operatorId);
    expect(row?.id).toBe(result.entry.id);
  });

  it("addTutorEmailAllowlist rejects duplicate with honest error", async () => {
    await db.tutorEmailAllowlist.create({
      data: {
        email: OPERATOR_ACTION_EMAIL,
        createdByAdminId: operatorId,
      },
    });

    const result = await addTutorEmailAllowlist(OPERATOR_ACTION_EMAIL);
    expect(result).toEqual({
      ok: false,
      error: "That email is already on the allowlist.",
    });
  });

  it("addTutorEmailAllowlist rejects invalid email", async () => {
    const result = await addTutorEmailAllowlist("not-an-email");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/valid email/i);
    }
  });

  it("removeTutorEmailAllowlist deletes the row", async () => {
    const row = await db.tutorEmailAllowlist.create({
      data: {
        email: OPERATOR_ACTION_EMAIL,
        createdByAdminId: operatorId,
      },
      select: { id: true },
    });

    const result = await removeTutorEmailAllowlist(row.id);
    expect(result).toEqual({ ok: true });
    expect(
      await db.tutorEmailAllowlist.findUnique({ where: { id: row.id } })
    ).toBeNull();
  });

  it("addTutorEmailAllowlist denies non-operator", async () => {
    mockIsOperatorEmail.mockReturnValue(false);
    mockGetServerSession.mockResolvedValue({
      user: { id: "tutor-1", email: "tutor@example.com" },
    });

    await expect(addTutorEmailAllowlist("denied@example.com")).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
