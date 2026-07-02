import {
  deriveStudentErasureDisplayState,
  isStudentAccessSuspended,
  PURGED_LEARNER_PLACEHOLDER,
} from "./student-erasure-display";

describe("deriveStudentErasureDisplayState", () => {
  it("returns none when no tombstone or erasure flags", () => {
    expect(
      deriveStudentErasureDisplayState({
        erasedAt: null,
        lpTombstonedAt: null,
        ahTombstonedAt: null,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns pending_grace when LP tombstonedAt is set (ER-4 data flow)", () => {
    const purgeEligibleAt = "2026-07-08T12:00:00.000Z";
    expect(
      deriveStudentErasureDisplayState({
        erasedAt: null,
        lpTombstonedAt: "2026-07-01T12:00:00.000Z",
        activeJobPurgeEligibleAt: purgeEligibleAt,
      })
    ).toEqual({ kind: "pending_grace", purgeEligibleAt });
  });

  it("returns pending_grace when account holder is tombstoned (full-family scope)", () => {
    expect(
      deriveStudentErasureDisplayState({
        erasedAt: null,
        lpTombstonedAt: null,
        ahTombstonedAt: new Date("2026-07-01T12:00:00.000Z"),
        activeJobPurgeEligibleAt: new Date("2026-07-08T12:00:00.000Z"),
      }).kind
    ).toBe("pending_grace");
  });

  it("returns purged when Student.erasedAt is set (post-purge placeholder)", () => {
    expect(
      deriveStudentErasureDisplayState({
        erasedAt: new Date(),
        lpTombstonedAt: new Date(),
      })
    ).toEqual({ kind: "purged" });
  });

  it("purged takes precedence over pending tombstone", () => {
    expect(
      deriveStudentErasureDisplayState({
        erasedAt: "2026-07-09T00:00:00.000Z",
        lpTombstonedAt: "2026-07-01T12:00:00.000Z",
      }).kind
    ).toBe("purged");
  });
});

describe("isStudentAccessSuspended", () => {
  it("is true during grace and after purge", () => {
    expect(
      isStudentAccessSuspended({
        kind: "pending_grace",
        purgeEligibleAt: "2026-07-08T12:00:00.000Z",
      })
    ).toBe(true);
    expect(isStudentAccessSuspended({ kind: "purged" })).toBe(true);
    expect(isStudentAccessSuspended({ kind: "none" })).toBe(false);
  });
});

describe("PURGED_LEARNER_PLACEHOLDER", () => {
  it("matches post-purge student name sentinel", () => {
    expect(PURGED_LEARNER_PLACEHOLDER).toBe("[Deleted learner]");
  });
});
