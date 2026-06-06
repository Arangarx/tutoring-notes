/**
 * Dev-tools fixture — deletion guard tests.
 *
 * Critical acceptance criterion: the fixture-only deletion guard is
 * physically incapable of deleting a real (non-fixture) user even if
 * its id is passed directly.
 *
 * Tests verify:
 *   1. deleteFixtureAdminUser throws when the target is not a fixture.
 *   2. deleteFixtureAccountHolder throws when the target is not a fixture.
 *   3. deleteAllFixtures uses isTestFixture:true in every WHERE clause.
 *   4. isDevToolsEnabled() returns false when VERCEL_ENV=production.
 */

beforeEach(() => {
  jest.resetModules();
  // Default: non-production environment so the guard doesn't fire for isDevToolsEnabled.
  delete process.env.VERCEL_ENV;
  process.env.DATABASE_URL = "file:./test.db";
  process.env.DIRECT_URL = "file:./test.db";
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

// ---------------------------------------------------------------------------
// isDevToolsEnabled
// ---------------------------------------------------------------------------

describe("isDevToolsEnabled()", () => {
  it("returns true when VERCEL_ENV is undefined (local dev)", async () => {
    delete process.env.VERCEL_ENV;
    const { isDevToolsEnabled } = await import("@/lib/dev-fixtures");
    expect(isDevToolsEnabled()).toBe(true);
  });

  it("returns true when VERCEL_ENV=preview", async () => {
    process.env.VERCEL_ENV = "preview";
    const { isDevToolsEnabled } = await import("@/lib/dev-fixtures");
    expect(isDevToolsEnabled()).toBe(true);
  });

  it("returns false when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    const { isDevToolsEnabled } = await import("@/lib/dev-fixtures");
    expect(isDevToolsEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteFixtureAdminUser — fixture-only guard
// ---------------------------------------------------------------------------

describe("deleteFixtureAdminUser() — fixture-only guard", () => {
  it("throws when the AdminUser is not a fixture (findFirst returns null)", async () => {
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findFirst: jest.fn().mockResolvedValue(null), // not a fixture
          deleteMany: jest.fn(),
        },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn().mockReturnValue("tok"),
      hashToken: jest.fn().mockReturnValue("hash"),
      CLAIM_INVITE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn().mockReturnValue("http://localhost:3000") }));

    const { deleteFixtureAdminUser } = await import("@/lib/dev-fixtures");
    const { db } = await import("@/lib/db");

    await expect(deleteFixtureAdminUser("real-user-id")).rejects.toThrow(
      /not a fixture or does not exist/
    );

    // Confirm deleteMany was NEVER called — no deletion attempted for a non-fixture
    expect(db.adminUser.deleteMany).not.toHaveBeenCalled();
  });

  it("calls deleteMany with isTestFixture:true in WHERE when fixture exists", async () => {
    const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findFirst: jest.fn().mockResolvedValue({ id: "fix-tutor-1", email: "fix@dev.local" }),
          deleteMany: mockDeleteMany,
        },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn().mockReturnValue("tok"),
      hashToken: jest.fn().mockReturnValue("hash"),
      CLAIM_INVITE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn().mockReturnValue("http://localhost:3000") }));

    const { deleteFixtureAdminUser } = await import("@/lib/dev-fixtures");

    await deleteFixtureAdminUser("fix-tutor-1");

    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTestFixture: true }),
      })
    );
  });

  it("throws if VERCEL_ENV=production (env gate)", async () => {
    process.env.VERCEL_ENV = "production";
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: { findFirst: jest.fn(), deleteMany: jest.fn() },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn(),
      hashToken: jest.fn(),
      CLAIM_INVITE_TTL_MS: 0,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn() }));

    const { deleteFixtureAdminUser } = await import("@/lib/dev-fixtures");

    await expect(deleteFixtureAdminUser("any-id")).rejects.toThrow(
      /dev-tools are disabled in production/
    );
  });
});

// ---------------------------------------------------------------------------
// deleteFixtureAccountHolder — fixture-only guard
// ---------------------------------------------------------------------------

describe("deleteFixtureAccountHolder() — fixture-only guard", () => {
  it("throws when the AccountHolder is not a fixture (findFirst returns null)", async () => {
    const mockDeleteMany = jest.fn();
    jest.doMock("@/lib/db", () => ({
      db: {
        accountHolder: {
          findFirst: jest.fn().mockResolvedValue(null),
          deleteMany: mockDeleteMany,
        },
        learnerProfile: { deleteMany: mockDeleteMany },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn(),
      hashToken: jest.fn(),
      CLAIM_INVITE_TTL_MS: 0,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn() }));

    const { deleteFixtureAccountHolder } = await import("@/lib/dev-fixtures");
    const { db } = await import("@/lib/db");

    await expect(deleteFixtureAccountHolder("real-parent-id")).rejects.toThrow(
      /not a fixture or does not exist/
    );

    // deleteMany must not be called
    expect(db.accountHolder.deleteMany).not.toHaveBeenCalled();
    expect(db.learnerProfile.deleteMany).not.toHaveBeenCalled();
  });

  it("uses isTestFixture:true in deleteMany WHERE for learnerProfile and accountHolder", async () => {
    const mockLpDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockAhDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    jest.doMock("@/lib/db", () => ({
      db: {
        accountHolder: {
          findFirst: jest.fn().mockResolvedValue({ id: "fix-ah-1", email: "parent@dev.local" }),
          deleteMany: mockAhDeleteMany,
        },
        learnerProfile: {
          deleteMany: mockLpDeleteMany,
        },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn(),
      hashToken: jest.fn(),
      CLAIM_INVITE_TTL_MS: 0,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn() }));

    const { deleteFixtureAccountHolder } = await import("@/lib/dev-fixtures");
    await deleteFixtureAccountHolder("fix-ah-1");

    expect(mockLpDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTestFixture: true }),
      })
    );
    expect(mockAhDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTestFixture: true }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// deleteAllFixtures — isTestFixture in every WHERE
// ---------------------------------------------------------------------------

describe("deleteAllFixtures() — isTestFixture:true in all WHERE clauses", () => {
  it("passes isTestFixture:true to every deleteMany call", async () => {
    const mockLpDel = jest.fn().mockResolvedValue({ count: 2 });
    const mockAhDel = jest.fn().mockResolvedValue({ count: 1 });
    const mockStuDel = jest.fn().mockResolvedValue({ count: 3 });
    const mockAuDel = jest.fn().mockResolvedValue({ count: 1 });

    jest.doMock("@/lib/db", () => ({
      db: {
        learnerProfile: { deleteMany: mockLpDel },
        accountHolder: { deleteMany: mockAhDel },
        student: { deleteMany: mockStuDel },
        adminUser: { deleteMany: mockAuDel },
      },
    }));
    jest.doMock("@/lib/crypto/session-tokens", () => ({
      generateRawToken: jest.fn(),
      hashToken: jest.fn(),
      CLAIM_INVITE_TTL_MS: 0,
    }));
    jest.doMock("@/lib/account-holder-auth", () => ({
      hashAccountHolderPassword: jest.fn(),
      hashLearnerPin: jest.fn(),
    }));
    jest.doMock("@/lib/public-url", () => ({ getPublicBaseUrl: jest.fn() }));

    const { deleteAllFixtures } = await import("@/lib/dev-fixtures");
    const result = await deleteAllFixtures();

    expect(result.deletedLearnerProfiles).toBe(2);
    expect(result.deletedAdminUsers).toBe(1);

    for (const mock of [mockLpDel, mockAhDel, mockStuDel, mockAuDel]) {
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isTestFixture: true } })
      );
    }
  });
});
