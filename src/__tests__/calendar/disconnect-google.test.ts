/**
 * @jest-environment node
 *
 * B7: disconnectGoogleCalendar makes zero Google Calendar API calls.
 */
const mockCalendarEvents = {
  insert: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(),
};

jest.mock("googleapis", () => ({
  google: {
    calendar: jest.fn(() => ({
      events: mockCalendarEvents,
    })),
  },
}));

const mockDeleteMany = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    oAuthCalendarConnection: {
      findFirst: jest.fn(),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

const mockRequireStudentScope = jest.fn();
jest.mock("@/lib/student-scope", () => ({
  requireStudentScope: (...args: unknown[]) => mockRequireStudentScope(...args),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStudentScope.mockResolvedValue({ kind: "admin", adminId: "admin-1" });
  mockDeleteMany.mockResolvedValue({ count: 1 });
});

describe("disconnectGoogleCalendar (B7)", () => {
  it("deletes local OAuth row only — no Google events API calls", async () => {
    const { disconnectGoogleCalendar } = await import(
      "@/app/admin/settings/integrations/actions"
    );
    await expect(disconnectGoogleCalendar()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { provider: "google", adminUserId: "admin-1" },
    });
    expect(mockCalendarEvents.insert).not.toHaveBeenCalled();
    expect(mockCalendarEvents.patch).not.toHaveBeenCalled();
    expect(mockCalendarEvents.delete).not.toHaveBeenCalled();
    expect(mockCalendarEvents.list).not.toHaveBeenCalled();
  });
});
