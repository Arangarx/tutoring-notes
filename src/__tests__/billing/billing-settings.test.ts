/**
 * @jest-environment node
 */

const adminUpdateMock = jest.fn();
const adminFindUniqueMock = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { email: "tutor@example.com" },
  }),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

jest.mock("@/lib/require-admin", () => ({
  requireAdminSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth-db", () => ({
  getAdminByEmail: jest.fn().mockResolvedValue({ id: "admin_1", email: "tutor@example.com" }),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    adminUser: {
      update: (...args: unknown[]) => adminUpdateMock(...args),
      findUnique: (...args: unknown[]) => adminFindUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { saveBillingDefaults } from "@/app/admin/settings/billing/actions";

beforeEach(() => {
  adminUpdateMock.mockReset();
  adminFindUniqueMock.mockReset();
  adminUpdateMock.mockResolvedValue({});
});

describe("saveBillingDefaults", () => {
  it("persists rounding defaults to AdminUser", async () => {
    const formData = new FormData();
    formData.set("roundingIncrementMin", "5");
    formData.set("roundingMode", "nearest");
    formData.set("tutorTimezone", "America/Denver");

    const result = await saveBillingDefaults(null, formData);

    expect(result.ok).toBe(true);
    expect(adminUpdateMock).toHaveBeenCalledWith({
      where: { id: "admin_1" },
      data: {
        defaultRoundingIncrementMin: 5,
        defaultRoundingMode: "nearest",
        tutorTimezone: "America/Denver",
      },
    });
  });

  it("rejects invalid increment", async () => {
    const formData = new FormData();
    formData.set("roundingIncrementMin", "7");
    formData.set("roundingMode", "nearest");
    formData.set("tutorTimezone", "America/Denver");

    const result = await saveBillingDefaults(null, formData);
    expect(result.error).toMatch(/increment/i);
    expect(adminUpdateMock).not.toHaveBeenCalled();
  });
});
