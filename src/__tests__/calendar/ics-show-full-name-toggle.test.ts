/**
 * @jest-environment node
 */
const mockUpdate = jest.fn();
const mockAssertOwnsStudent = jest.fn();

jest.mock("@/lib/db", () => ({
  withDbRetry: (fn: () => Promise<unknown>) => fn(),
  db: {
    student: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

jest.mock("@/lib/student-scope", () => ({
  assertOwnsStudent: (...args: unknown[]) => mockAssertOwnsStudent(...args),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAssertOwnsStudent.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue({ id: "student-1", icsShowFullName: true });
});

describe("setStudentIcsShowFullName", () => {
  it("persists icsShowFullName after assertOwnsStudent", async () => {
    const { setStudentIcsShowFullName } = await import(
      "@/app/admin/students/[id]/actions"
    );
    await setStudentIcsShowFullName("student-1", true);
    expect(mockAssertOwnsStudent).toHaveBeenCalledWith("student-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { icsShowFullName: true },
    });
  });

  it("defaults off when set to false", async () => {
    const { setStudentIcsShowFullName } = await import(
      "@/app/admin/students/[id]/actions"
    );
    await setStudentIcsShowFullName("student-1", false);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { icsShowFullName: false },
    });
  });
});
