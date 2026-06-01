/**
 * @jest-environment node
 *
 * Unit coverage for assertOwnsLearnerProfile — the AccountHolder-principal
 * ownership guard for LearnerProfile rows (Identity Phase 2 spine BLOCKER).
 *
 * Design contract (session-identity-access-design-2026-05-31.md §5.3 + Axis 4):
 *   "AccountHolder A cannot access LearnerProfile owned by AccountHolder B.
 *    assertOwnsLearnerProfile must check LearnerProfile.accountHolderId = requester.id."
 *
 * Every negative case asserts the REQUIREMENT via the REAL guard — the DB
 * layer is mocked; next/navigation.notFound is mocked to throw so we can
 * assert rejection without a running Next.js server.  No tautologies: these
 * tests break if the guard is removed or its condition weakened.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const findUniqueMock = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    learnerProfile: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { notFound } from "next/navigation";

const notFoundMock = notFound as jest.MockedFunction<typeof notFound>;

// ── Fixture identifiers ───────────────────────────────────────────────────────

const ACCOUNT_A = "ah-account-a-uuid";
const ACCOUNT_B = "ah-account-b-uuid";
const PROFILE_1 = "lp-profile-1-uuid";

const liveProfile = {
  id: PROFILE_1,
  accountHolderId: ACCOUNT_A,
  displayName: "Test Learner",
  tombstonedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  findUniqueMock.mockReset();
  notFoundMock.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("assertOwnsLearnerProfile — happy path", () => {
  test("returns the profile row when accountHolderId matches", async () => {
    findUniqueMock.mockResolvedValue(liveProfile);

    const result = await assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1);

    expect(result).toEqual(liveProfile);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  test("queries DB by the supplied learnerProfileId", async () => {
    findUniqueMock.mockResolvedValue(liveProfile);

    await assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1);

    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROFILE_1 } })
    );
  });

  test("returns the full row so callers can use it without a second round-trip", async () => {
    const profileWithExtras = { ...liveProfile, displayName: "Alice" };
    findUniqueMock.mockResolvedValue(profileWithExtras);

    const result = await assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1);

    expect(result.displayName).toBe("Alice");
    expect(result.id).toBe(PROFILE_1);
    expect(result.accountHolderId).toBe(ACCOUNT_A);
  });
});

// ── Negative (denied) cases ───────────────────────────────────────────────────

describe("assertOwnsLearnerProfile — negative (denied) cases", () => {
  test("denies when the profile does not exist in DB (non-existent id)", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, "lp-does-not-exist")
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies when accountHolderId does not match the profile owner (non-owner)", async () => {
    // Profile owned by ACCOUNT_A; caller is ACCOUNT_B → must be denied
    findUniqueMock.mockResolvedValue(liveProfile); // liveProfile.accountHolderId = ACCOUNT_A

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_B, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies cross-tenant: Account B cannot access a profile owned by Account A", async () => {
    const profileOwnedByA = { ...liveProfile, id: "lp-a1", accountHolderId: ACCOUNT_A };
    findUniqueMock.mockResolvedValue(profileOwnedByA);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_B, "lp-a1")
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies when profile is tombstoned (COPPA-deleted), even if the caller is the owner", async () => {
    const tombstonedProfile = {
      ...liveProfile,
      displayName: "Deleted learner",
      tombstonedAt: new Date("2026-04-01T00:00:00Z"),
    };
    findUniqueMock.mockResolvedValue(tombstonedProfile);

    // Caller IS the correct owner — should still be denied after tombstone
    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies when profile is tombstoned AND caller is not the owner (double denial)", async () => {
    const tombstonedProfile = {
      ...liveProfile,
      accountHolderId: ACCOUNT_A,
      tombstonedAt: new Date("2026-05-01T00:00:00Z"),
    };
    findUniqueMock.mockResolvedValue(tombstonedProfile);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_B, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies when accountHolderId is an empty string (no identity)", async () => {
    findUniqueMock.mockResolvedValue(liveProfile);

    await expect(
      assertOwnsLearnerProfile("", PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  test("denies when a different profile id is supplied that happens to belong to a different tenant", async () => {
    // ACCOUNT_B's profile returned; caller claims to be ACCOUNT_A
    const bProfile = { ...liveProfile, id: "lp-b1", accountHolderId: ACCOUNT_B };
    findUniqueMock.mockResolvedValue(bProfile);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, "lp-b1")
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// ── Observability ─────────────────────────────────────────────────────────────

describe("assertOwnsLearnerProfile — observability (lpr= logging)", () => {
  test("logs with [lpr] prefix when access is denied", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[lpr]")
    );
  });

  test("logs lpr=<learnerProfileId> in the denial message", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`lpr=${PROFILE_1}`)
    );
  });

  test("logs action=assert_owns_denied when access is denied", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("assert_owns_denied")
    );
  });

  test("does NOT log when access is granted (no noise on happy path)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    findUniqueMock.mockResolvedValue(liveProfile);

    await assertOwnsLearnerProfile(ACCOUNT_A, PROFILE_1);

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
