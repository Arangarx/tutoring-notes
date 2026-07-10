/**
 * @jest-environment node
 *
 * Teeth for ensureFamilyId P2002 retry: collision on candidate N must continue
 * to candidate N+1; non-P2002 must rethrow. Oracle = familyIdCandidates order
 * (independent of the catch predicate implementation).
 */

const findUniqueMock = jest.fn();
const updateManyMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    accountHolder: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

import { ensureFamilyId, familyIdCandidates } from "@/lib/family-id";

const AH_ID = "ah-family-id-ensure-test";

function prismaP2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

beforeEach(() => {
  findUniqueMock.mockReset();
  updateManyMock.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ensureFamilyId — P2002 collision retry", () => {
  it("retries next candidate after P2002 and returns the successful id", async () => {
    const candidates = [...familyIdCandidates("mortensen")];
    expect(candidates[0]).toBe("mortensen");
    expect(candidates[1]).toBe("mortensen2");

    findUniqueMock.mockResolvedValueOnce({
      familyId: null,
      email: "sarah@example.com",
      displayName: "Sarah Mortensen",
    });

    updateManyMock
      .mockRejectedValueOnce(prismaP2002())
      .mockResolvedValueOnce({ count: 1 });

    const result = await ensureFamilyId(AH_ID);

    expect(result).toBe("mortensen2");
    expect(updateManyMock).toHaveBeenCalledTimes(2);
    expect(updateManyMock.mock.calls[0]?.[0]).toMatchObject({
      data: { familyId: "mortensen" },
    });
    expect(updateManyMock.mock.calls[1]?.[0]).toMatchObject({
      data: { familyId: "mortensen2" },
    });
  });

  it("rethrows non-P2002 errors without consuming further candidates", async () => {
    findUniqueMock.mockResolvedValueOnce({
      familyId: null,
      email: "sarah@example.com",
      displayName: "Sarah Mortensen",
    });

    const boom = Object.assign(new Error("connection refused"), { code: "P1001" });
    updateManyMock.mockRejectedValueOnce(boom);

    await expect(ensureFamilyId(AH_ID)).rejects.toBe(boom);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });
});
