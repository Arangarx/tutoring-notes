/**
 * @jest-environment node
 *
 * `withConsentRecordReason` only rewords a missing-record refusal. Every other input comes
 * back unchanged, so the generic refusal still reaches the tutor if the reason cannot be
 * worked out. (The per-situation wording is proven against the real database in
 * `session-entry-parity.integration.test.ts`.)
 */

const mockErasureCheck = jest.fn();
jest.mock("@/lib/erasure/active-erasure-scope", () => ({
  __esModule: true,
  ErasureAccessSuspendedError: class ErasureAccessSuspendedError extends Error {},
  isWhiteboardSessionBlockedByErasure: (...args: unknown[]) => mockErasureCheck(...args),
}));

import { ConsentError } from "@/lib/consent-scope";
import { withConsentRecordReason } from "@/lib/scheduling/session-entry-loader";

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

describe("withConsentRecordReason", () => {
  it("rewords a missing-record refusal for an unclaimed learner", async () => {
    mockErasureCheck.mockResolvedValue({ blocked: false });
    const generic = new ConsentError("consentRecord", "generic");
    const out = await withConsentRecordReason(generic, SOURCE, "Maya");
    expect(out).toBeInstanceOf(ConsentError);
    expect((out as ConsentError).permission).toBe("consentRecord");
    expect((out as ConsentError).message).toBe("Maya hasn't connected their Mynk account yet.");
  });

  it("returns a non-consent error unchanged, without looking anything up", async () => {
    const other = new Error("boom");
    expect(await withConsentRecordReason(other, SOURCE, "Maya")).toBe(other);
    expect(mockErasureCheck).not.toHaveBeenCalled();
  });

  it("returns a different consent permission unchanged", async () => {
    const live = new ConsentError("allowLiveSession", "Live sessions are off.");
    expect(await withConsentRecordReason(live, SOURCE, "Maya")).toBe(live);
    expect(mockErasureCheck).not.toHaveBeenCalled();
  });

  it("returns the original refusal when there is no student row", async () => {
    const generic = new ConsentError("consentRecord", "generic");
    expect(await withConsentRecordReason(generic, null, "")).toBe(generic);
  });

  it("returns the original refusal when the entry state cannot be loaded", async () => {
    mockErasureCheck.mockRejectedValue(new Error("db down"));
    const generic = new ConsentError("consentRecord", "generic");
    expect(await withConsentRecordReason(generic, SOURCE, "Maya")).toBe(generic);
  });

  it("returns the original refusal when the state names a different reason (erasure)", async () => {
    mockErasureCheck.mockResolvedValue({ blocked: true, activeJobId: "job_1" });
    const generic = new ConsentError("consentRecord", "generic");
    expect(await withConsentRecordReason(generic, SOURCE, "Maya")).toBe(generic);
  });
});
