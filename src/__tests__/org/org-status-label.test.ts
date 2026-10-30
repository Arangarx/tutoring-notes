/**
 * Organization list meta is a capitalized status, then roles.
 * The expected words are the W2 copy, not a mirror of the formatter body.
 */
import {
  formatOrganizationListMeta,
  formatOrganizationStatus,
} from "@/lib/org-role-label";

describe("formatOrganizationStatus", () => {
  test("capitalizes each status and does not return the raw enum", () => {
    expect(formatOrganizationStatus("active")).toBe("Active");
    expect(formatOrganizationStatus("pending")).toBe("Pending");
    expect(formatOrganizationStatus("suspended")).toBe("Suspended");
    expect(formatOrganizationStatus("active")).not.toBe("active");
  });

  test("joins a staff row as status, then roles, and omits the dot when there are no roles", () => {
    expect(formatOrganizationListMeta("active", ["owner", "admin"])).toBe(
      "Active · Owner, Admin"
    );
    expect(formatOrganizationListMeta("pending")).toBe("Pending");
    expect(formatOrganizationListMeta("suspended", [])).toBe("Suspended");
  });
});
