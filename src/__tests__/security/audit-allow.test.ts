/**
 * The production audit gate allows a high or critical package only while
 * that package is still reported. The two sets have to be the same.
 */

const { compareAuditAllowlist } = require("../../../scripts/audit-allow-compare.cjs");

const refused = {
  name: "prisma",
  reason: "No forward release outside the advisory range; we will not downgrade.",
};

describe("compareAuditAllowlist", () => {
  it("passes when nothing is reported and the allowlist is empty", () => {
    const result = compareAuditAllowlist([], []);
    expect(result.ok).toBe(true);
    expect(result.unexpected).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it("passes when every reported high is listed and every listing is still reported", () => {
    const result = compareAuditAllowlist(["prisma"], [refused]);
    expect(result.ok).toBe(true);
    expect(result.unexpected).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it("fails when a high or critical package is not on the allowlist", () => {
    const result = compareAuditAllowlist(["prisma", "nodemailer"], [refused]);
    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(["nodemailer"]);
    expect(result.stale).toEqual([]);
  });

  it("fails when an allowlisted package is no longer high or critical", () => {
    const result = compareAuditAllowlist([], [refused]);
    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual([]);
    expect(result.stale).toEqual(["prisma"]);
  });

  it("fails when an entry has no reason", () => {
    const result = compareAuditAllowlist(["prisma"], [{ name: "prisma", reason: "  " }]);
    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual(["prisma missing reason"]);
  });
});
