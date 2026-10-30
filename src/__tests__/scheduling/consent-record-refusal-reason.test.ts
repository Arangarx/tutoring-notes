/**
 * @jest-environment node
 *
 * `consentRecordRefusalReason` names WHY `assertConsentRecordExists` refused (unclaimed /
 * self / parent) so Start and create can return it as data. It returns null for anything
 * else, so a caller rethrows the original error and a refusal is never invented. (The
 * per-situation answer is proven against the real database in
 * `session-entry-parity.integration.test.ts`.)
 */

const mockErasureCheck = jest.fn();
jest.mock("@/lib/erasure/active-erasure-scope", () => ({
  __esModule: true,
  ErasureAccessSuspendedError: class ErasureAccessSuspendedError extends Error {},
  isWhiteboardSessionBlockedByErasure: (...args: unknown[]) => mockErasureCheck(...args),
}));

import { ConsentError } from "@/lib/consent-scope";
import { consentRecordRefusalReason } from "@/lib/scheduling/session-entry-loader";

const SOURCE = {
  studentId: "stu_1",
  adminUserId: "adm_1",
  student: {
    adminUserId: "adm_1",
    organizationId: null,
    learnerProfileId: null,
    learnerProfile: null,
  },
};

beforeEach(() => {
  mockErasureCheck.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("consentRecordRefusalReason", () => {
  it("names an unclaimed learner", async () => {
    mockErasureCheck.mockResolvedValue({ blocked: false });
    const generic = new ConsentError("consentRecord", "generic");
    expect(await consentRecordRefusalReason(generic, SOURCE)).toBe("unclaimed");
  });

  it("returns null for a non-consent error, without looking anything up", async () => {
    expect(await consentRecordRefusalReason(new Error("boom"), SOURCE)).toBeNull();
    expect(mockErasureCheck).not.toHaveBeenCalled();
  });

  it("returns null for a different consent permission", async () => {
    const live = new ConsentError("allowLiveSession", "Live sessions are off.");
    expect(await consentRecordRefusalReason(live, SOURCE)).toBeNull();
    expect(mockErasureCheck).not.toHaveBeenCalled();
  });

  it("returns null when there is no student row", async () => {
    const generic = new ConsentError("consentRecord", "generic");
    expect(await consentRecordRefusalReason(generic, null)).toBeNull();
  });

  it("returns null when the entry state cannot be loaded", async () => {
    mockErasureCheck.mockRejectedValue(new Error("db down"));
    const generic = new ConsentError("consentRecord", "generic");
    expect(await consentRecordRefusalReason(generic, SOURCE)).toBeNull();
  });

  it("returns null when the state names a different reason (erasure)", async () => {
    mockErasureCheck.mockResolvedValue({ blocked: true, activeJobId: "job_1" });
    const generic = new ConsentError("consentRecord", "generic");
    expect(await consentRecordRefusalReason(generic, SOURCE)).toBeNull();
  });
});
