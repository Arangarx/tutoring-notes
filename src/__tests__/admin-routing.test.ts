/**
 * SEC-1 Dispatch C — requirement-based routing model tests.
 */

import {
  getAdminSessionMode,
  isTutorExperiencePath,
  realAdminHomePath,
  tutorExperienceLandingPath,
} from "@/lib/admin-routing";

describe("getAdminSessionMode", () => {
  it("real DB admin (not impersonating) uses the admin dashboard", () => {
    expect(
      getAdminSessionMode({
        sub: "uuid-real-admin",
        isTestAccount: false,
        isImpersonating: false,
      })
    ).toBe("real-admin-home");
  });

  it("impersonating session uses the tutor experience", () => {
    expect(
      getAdminSessionMode({
        sub: "test-acct-id",
        isTestAccount: true,
        isImpersonating: true,
      })
    ).toBe("tutor-experience");
  });

  it("legacy env-only admin uses the tutor experience", () => {
    expect(
      getAdminSessionMode({
        sub: "admin",
        isTestAccount: false,
        isImpersonating: false,
      })
    ).toBe("tutor-experience");
  });

  it("missing session is unauthenticated", () => {
    expect(getAdminSessionMode(null)).toBe("unauthenticated");
  });
});

describe("tutor vs admin landing paths", () => {
  it("real admin home is /admin; tutor landing is /admin/students", () => {
    expect(realAdminHomePath()).toBe("/admin");
    expect(tutorExperienceLandingPath()).toBe("/admin/students");
  });
});

describe("isTutorExperiencePath", () => {
  it("blocks students and outbox for real-admin-home middleware guard", () => {
    expect(isTutorExperiencePath("/admin/students")).toBe(true);
    expect(isTutorExperiencePath("/admin/students/abc/whiteboard/xyz/workspace")).toBe(
      true
    );
    expect(isTutorExperiencePath("/admin/outbox")).toBe(true);
    expect(isTutorExperiencePath("/admin")).toBe(false);
    expect(isTutorExperiencePath("/admin/settings")).toBe(false);
    expect(isTutorExperiencePath("/admin/feedback")).toBe(false);
  });
});
