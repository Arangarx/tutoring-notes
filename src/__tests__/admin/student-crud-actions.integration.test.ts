/**
 * @jest-environment node
 *
 * P1-J3 — Student roster CRUD server actions behavior/contract tests.
 *
 * Oracle: DB row state after create/rename/delete; `assertOwnsStudent` denial
 * via `notFound()` for cross-tenant rename/delete; create scoped to caller's
 * `adminUserId` via `requireStudentScope`.
 *
 * Red-before (2026-07-05): temporarily expecting rename to leave the old name
 * in DB and expecting cross-tenant delete to succeed both failed before
 * correcting to updated name / NEXT_NOT_FOUND rejection.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
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

import { db } from "@/lib/db";
import { createStudent } from "@/app/admin/students/actions";
import {
  renameStudent,
  deleteStudent,
} from "@/app/admin/students/[id]/actions";

let uniqueSuffix = 0;
function uniq(prefix = "roster-crud") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

function formWithName(name: string) {
  const fd = new FormData();
  fd.set("name", name);
  return fd;
}

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function seedStudent(adminUserId: string, name?: string) {
  return db.student.create({
    data: {
      name: name ?? `Student ${uniq()}`,
      adminUserId,
    },
  });
}

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: tutor.email },
  });
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createStudent — roster create contract (P1-J3)", () => {
  it("creates a student row scoped to the calling adminUser", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);
    const newName = `Created ${uniq()}`;

    await createStudent(formWithName(newName));

    const rows = await db.student.findMany({
      where: { adminUserId: tutor.id, name: newName },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adminUserId).toBe(tutor.id);
    expect(rows[0]?.name).toBe(newName);
  });

  it("rejects empty name with a thrown error (no row created)", async () => {
    const tutor = await seedTutor();
    mockSessionAsTutor(tutor);
    const beforeCount = await db.student.count({
      where: { adminUserId: tutor.id },
    });

    await expect(createStudent(formWithName("   "))).rejects.toThrow(
      "Name is required"
    );

    const afterCount = await db.student.count({
      where: { adminUserId: tutor.id },
    });
    expect(afterCount).toBe(beforeCount);
  });

  it("unauthenticated scope → redirect to login", async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(createStudent(formWithName("Should Not Create"))).rejects.toThrow(
      "NEXT_REDIRECT:/login"
    );
  });
});

describe("renameStudent — roster rename contract (P1-J3)", () => {
  it("updates the student name in the database", async () => {
    const tutor = await seedTutor();
    const student = await seedStudent(tutor.id, `Before ${uniq()}`);
    mockSessionAsTutor(tutor);
    const updatedName = `After ${uniq()}`;

    await renameStudent(student.id, formWithName(updatedName));

    const row = await db.student.findUnique({ where: { id: student.id } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe(updatedName);
    expect(row?.adminUserId).toBe(tutor.id);
  });

  it("rejects empty name with a thrown error (name unchanged)", async () => {
    const tutor = await seedTutor();
    const originalName = `Keep ${uniq()}`;
    const student = await seedStudent(tutor.id, originalName);
    mockSessionAsTutor(tutor);

    await expect(
      renameStudent(student.id, formWithName(""))
    ).rejects.toThrow("Name is required");

    const row = await db.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.name).toBe(originalName);
  });

  it("cross-tenant tutor → assertOwnsStudent notFound (no rename)", async () => {
    const owner = await seedTutor();
    const other = await seedTutor();
    const originalName = `Owned ${uniq()}`;
    const student = await seedStudent(owner.id, originalName);
    mockSessionAsTutor(other);

    await expect(
      renameStudent(student.id, formWithName("Hijacked Name"))
    ).rejects.toThrow("NEXT_NOT_FOUND");

    const row = await db.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.name).toBe(originalName);
    expect(row.adminUserId).toBe(owner.id);
  });
});

describe("deleteStudent — roster delete contract (P1-J3)", () => {
  it("hard-deletes the student row and cascades session notes", async () => {
    const tutor = await seedTutor();
    const student = await seedStudent(tutor.id);
    const note = await db.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-15T00:00:00Z"),
        topics: "Cascade oracle",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
      },
    });
    mockSessionAsTutor(tutor);

    await deleteStudent(student.id);

    expect(await db.student.findUnique({ where: { id: student.id } })).toBeNull();
    expect(await db.sessionNote.findUnique({ where: { id: note.id } })).toBeNull();
  });

  it("cross-tenant tutor → assertOwnsStudent notFound (row remains)", async () => {
    const owner = await seedTutor();
    const other = await seedTutor();
    const student = await seedStudent(owner.id);
    mockSessionAsTutor(other);

    await expect(deleteStudent(student.id)).rejects.toThrow("NEXT_NOT_FOUND");

    const row = await db.student.findUnique({ where: { id: student.id } });
    expect(row).not.toBeNull();
    expect(row?.adminUserId).toBe(owner.id);
  });
});
