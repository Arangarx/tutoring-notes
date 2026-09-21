/**
 * @jest-environment node
 */
import { snapSystemIanaToBillingTimezone } from "@/lib/time/system-timezone";

describe("snapSystemIanaToBillingTimezone", () => {
  it("keeps curated billing zones", () => {
    expect(snapSystemIanaToBillingTimezone("America/Los_Angeles")).toBe(
      "America/Los_Angeles"
    );
  });

  it("maps Pacific aliases onto the billing picker", () => {
    expect(snapSystemIanaToBillingTimezone("America/Vancouver")).toBe(
      "America/Los_Angeles"
    );
    expect(snapSystemIanaToBillingTimezone("US/Pacific")).toBe(
      "America/Los_Angeles"
    );
  });

  it("returns null for empty or garbage", () => {
    expect(snapSystemIanaToBillingTimezone("")).toBeNull();
    expect(snapSystemIanaToBillingTimezone("Not/A_Zone")).toBeNull();
  });
});
