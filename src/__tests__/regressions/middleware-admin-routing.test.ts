/**
 * Regression tests — middleware admin-route path-guard precedence
 *
 * These tests cover the pure path-guard predicates extracted from the
 * middleware into admin-routing.ts.  They verify the key invariant that
 * prevents the WAITLISTED↔2FA-setup redirect loop (W1/TFA1 smoke finding).
 *
 * Why pure-function tests rather than full middleware integration tests?
 * The Next.js middleware runs in an Edge Runtime that requires a real
 * Request/Response environment not provided by jsdom/jest.  Extracting the
 * path predicates as exported functions makes the loop-prevention logic
 * directly unit-testable without mocking the entire Edge environment.
 *
 * --- Loop anatomy (the bug this fixes) ---
 * 1. WAITLISTED user navigates to any /admin/* path.
 * 2. Approval gate fires → redirect to /admin/pending-approval.
 * 3. /admin/pending-approval hits the 2FA gate (was NOT exempt before fix).
 * 4. 2FA gate fires (twoFactorVerified=false) → redirect to /admin/settings/2fa/setup.
 * 5. /admin/settings/2fa/setup hits the approval gate (NOT exempt).
 * 6. Approval gate fires → redirect to /admin/pending-approval.
 * 7. Go to 3 → ERR_TOO_MANY_REDIRECTS.
 *
 * The fix: /admin/pending-approval is now in is2faExemptAdminPath, so
 * step 3 no longer fires.  The WAITLISTED gate takes precedence and the
 * user stays at /admin/pending-approval.
 *
 * --- Manual smoke steps (cannot be automated here) ---
 * MNL-1: Sign up as a new tutor.  Verify redirect lands on
 *         /admin/pending-approval and stays there (no redirect loop,
 *         no 429 on /admin/settings/2fa/setup).
 * MNL-2: Operator approves tutor via /admin/tutor-approvals.  Tutor
 *         logs in again → should now reach /admin/settings/2fa/setup
 *         (2FA enrollment required after approval).
 * MNL-3: Operator (env admin, sub="admin") logs in → should not be
 *         redirected to 2FA setup (isEnvAdmin exemption).
 * MNL-4: Approved tutor completes 2FA → twoFactorVerified=true in JWT;
 *         subsequent logins go straight to /admin/students.
 *
 * Coverage:
 *   MW-1:  /admin/pending-approval is approval-exempt (no redirect-to-self)
 *   MW-2:  /admin/pending-approval/* sub-paths are approval-exempt
 *   MW-3:  /api/auth/* is approval-exempt
 *   MW-4:  /admin/settings/2fa/setup is NOT approval-exempt (WAITLISTED bounced out)
 *   MW-5:  /admin/students is NOT approval-exempt (WAITLISTED bounced out)
 *   MW-6:  /admin/pending-approval IS 2FA-exempt (KEY: breaks the loop)
 *   MW-7:  /admin/pending-approval/* sub-paths are 2FA-exempt
 *   MW-8:  /admin/settings/2fa/setup is 2FA-exempt
 *   MW-9:  /admin/settings/2fa/verify is 2FA-exempt
 *   MW-10: /admin/students is NOT 2FA-exempt (approved+unenrolled gets 2FA gate)
 *   MW-11: /admin/settings/2fa/setup/... sub-paths are 2FA-exempt
 *   MW-12: /admin/settings/2fa is NOT 2FA-exempt (only setup and verify sub-paths)
 */

import {
  isApprovalExemptAdminPath,
  is2faExemptAdminPath,
} from "@/lib/admin-routing";

// ---------------------------------------------------------------------------
// MW-1 through MW-5: approval gate exemptions
// ---------------------------------------------------------------------------

describe("isApprovalExemptAdminPath — approval gate exemptions", () => {
  it("MW-1: /admin/pending-approval is approval-exempt", () => {
    expect(isApprovalExemptAdminPath("/admin/pending-approval")).toBe(true);
  });

  it("MW-2: /admin/pending-approval/ sub-paths are approval-exempt", () => {
    expect(isApprovalExemptAdminPath("/admin/pending-approval/some-sub-path")).toBe(true);
  });

  it("MW-3: /api/auth/* paths are approval-exempt (signout, CSRF, etc.)", () => {
    expect(isApprovalExemptAdminPath("/api/auth/signout")).toBe(true);
    expect(isApprovalExemptAdminPath("/api/auth/csrf")).toBe(true);
    expect(isApprovalExemptAdminPath("/api/auth/session")).toBe(true);
  });

  it("MW-4: /admin/settings/2fa/setup is NOT approval-exempt (WAITLISTED users bounced back to pending-approval)", () => {
    expect(isApprovalExemptAdminPath("/admin/settings/2fa/setup")).toBe(false);
  });

  it("MW-5: /admin/students is NOT approval-exempt", () => {
    expect(isApprovalExemptAdminPath("/admin/students")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MW-6 through MW-12: 2FA gate exemptions
// ---------------------------------------------------------------------------

describe("is2faExemptAdminPath — 2FA gate exemptions (loop prevention)", () => {
  it("MW-6: /admin/pending-approval IS 2FA-exempt — prevents WAITLISTED↔2FA loop", () => {
    // This is the critical invariant.  Without this, a WAITLISTED user
    // redirected to /admin/pending-approval immediately hits the 2FA gate
    // and is bounced to /admin/settings/2fa/setup, which in turn is caught
    // by the approval gate and sent back → infinite loop.
    expect(is2faExemptAdminPath("/admin/pending-approval")).toBe(true);
  });

  it("MW-7: /admin/pending-approval/* sub-paths are 2FA-exempt", () => {
    expect(is2faExemptAdminPath("/admin/pending-approval/status")).toBe(true);
  });

  it("MW-8: /admin/settings/2fa/setup is 2FA-exempt (must be reachable unenrolled)", () => {
    expect(is2faExemptAdminPath("/admin/settings/2fa/setup")).toBe(true);
  });

  it("MW-9: /admin/settings/2fa/verify is 2FA-exempt", () => {
    expect(is2faExemptAdminPath("/admin/settings/2fa/verify")).toBe(true);
  });

  it("MW-10: /admin/students is NOT 2FA-exempt (approved+unenrolled user must be redirected)", () => {
    expect(is2faExemptAdminPath("/admin/students")).toBe(false);
  });

  it("MW-11: /admin/settings/2fa/setup/* sub-paths are 2FA-exempt", () => {
    expect(is2faExemptAdminPath("/admin/settings/2fa/setup/confirm")).toBe(true);
  });

  it("MW-12: /admin/settings/2fa (parent) is NOT 2FA-exempt — only setup+verify sub-paths", () => {
    expect(is2faExemptAdminPath("/admin/settings/2fa")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Loop-impossibility invariant: cross-gate check
// ---------------------------------------------------------------------------

describe("Loop-impossibility invariant", () => {
  it("any path exempt from the approval gate that is NOT /api/auth/* is also 2FA-exempt", () => {
    // The critical property: no path can be approval-exempt but 2FA-non-exempt
    // and trigger a cross-gate bounce.  We enumerate the known approval-exempt
    // paths (excluding /api/auth/* which terminates in auth infrastructure).
    const approvalExemptNonAuth = [
      "/admin/pending-approval",
      "/admin/pending-approval/status",
    ];
    for (const p of approvalExemptNonAuth) {
      expect(is2faExemptAdminPath(p)).toBe(true);
    }
  });

  it("any path exempt from 2FA gate but NOT exempt from approval gate must be a 2FA route", () => {
    // The 2FA routes (/admin/settings/2fa/setup, /admin/settings/2fa/verify)
    // are 2FA-exempt but NOT approval-exempt.  That's intentional: WAITLISTED
    // users who try to navigate directly to 2FA setup are bounced back to
    // /admin/pending-approval by the approval gate (which then stays there
    // because /admin/pending-approval is 2FA-exempt).  No loop.
    const tfaSetupPaths = [
      "/admin/settings/2fa/setup",
      "/admin/settings/2fa/verify",
    ];
    for (const p of tfaSetupPaths) {
      // 2FA-exempt but NOT approval-exempt → WAITLISTED users bounce to pending-approval
      expect(is2faExemptAdminPath(p)).toBe(true);
      expect(isApprovalExemptAdminPath(p)).toBe(false);
    }
    // And /admin/pending-approval is exempt from BOTH → stays put
    expect(isApprovalExemptAdminPath("/admin/pending-approval")).toBe(true);
    expect(is2faExemptAdminPath("/admin/pending-approval")).toBe(true);
  });
});
