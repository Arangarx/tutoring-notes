/**
 * SEC-1 role follow-up — requirement-based routing model tests.
 *
 * Routing table being tested:
 *   ADMIN, not impersonating   → real-admin-home
 *   ADMIN, impersonating       → tutor-experience
 *   TUTOR (real login)         → tutor-experience
 *   TUTOR (isTestAccount=true) → tutor-experience
 *   Legacy env-only (sub=admin) → tutor-experience
 *   Unauthenticated             → unauthenticated
 *
 * Key invariant: routing is determined by `role`, NOT by `!isTestAccount`.
 */

import {
  getAdminSessionMode,
  isTutorExperiencePath,
  realAdminHomePath,
  tutorExperienceLandingPath,
} from "@/lib/admin-routing";

describe("getAdminSessionMode — role-based routing", () => {
  it("ADMIN role (not impersonating) → real-admin-home (dashboard)", () => {
    expect(
      getAdminSessionMode({
        sub: "uuid-real-admin",
        role: "ADMIN",
        isTestAccount: false,
        isImpersonating: false,
      })
    ).toBe("real-admin-home");
  });

  it("ADMIN role while impersonating → tutor-experience", () => {
    expect(
      getAdminSessionMode({
        sub: "test-acct-id",
        role: "TUTOR",   // token carries the target's role during impersonation
        isTestAccount: true,
        isImpersonating: true,
      })
    ).toBe("tutor-experience");
  });

  it("TUTOR role (real login, e.g. Sarah) → tutor-experience", () => {
    expect(
      getAdminSessionMode({
        sub: "sarah-uuid",
        role: "TUTOR",
        isTestAccount: false,
        isImpersonating: false,
      })
    ).toBe("tutor-experience");
  });

  it("TUTOR role + isTestAccount=true → tutor-experience", () => {
    expect(
      getAdminSessionMode({
        sub: "test-acct-456",
        role: "TUTOR",
        isTestAccount: true,
        isImpersonating: false,
      })
    ).toBe("tutor-experience");
  });

  it("legacy env-only admin (sub=admin, no role) → tutor-experience (unchanged)", () => {
    expect(
      getAdminSessionMode({
        sub: "admin",
        isTestAccount: false,
        isImpersonating: false,
      })
    ).toBe("tutor-experience");
  });

  it("missing session → unauthenticated", () => {
    expect(getAdminSessionMode(null)).toBe("unauthenticated");
  });

  it("missing sub → unauthenticated", () => {
    expect(getAdminSessionMode({ role: "ADMIN" })).toBe("unauthenticated");
  });

  // Backward compat: token without role field falls back to isTestAccount heuristic.
  it("token without role + isTestAccount=false → real-admin-home (fallback for old tokens)", () => {
    expect(
      getAdminSessionMode({
        sub: "old-token-admin",
        isTestAccount: false,
        isImpersonating: false,
        // no role field
      })
    ).toBe("real-admin-home");
  });

  it("token without role + isTestAccount=true → tutor-experience (fallback for old tokens)", () => {
    expect(
      getAdminSessionMode({
        sub: "old-test-acct",
        isTestAccount: true,
        isImpersonating: false,
        // no role field
      })
    ).toBe("tutor-experience");
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
